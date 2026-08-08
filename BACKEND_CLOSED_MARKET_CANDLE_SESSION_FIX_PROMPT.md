# Backend Prompt: Enforce Exact Closed-Market Sessions, Quotes, and Candles for Every Broker

Fix the shared broker-gateway market-status, quote-snapshot, and candle-history
contracts so every broker behaves like MT5. Achiever Financials is the reproduced
case below, but the implementation and regression suite must be adapter-agnostic.

## Reproduced live evidence

Broker/account used for verification:

- Broker: `achiever-financials`
- Symbol/timeframe: `XAUUSD`, `M1`
- Date: Saturday, 2026-08-08

Authenticated `GET /api/v2/market/status/XAUUSD` returned:

```json
{
  "message": "closed (weekend)",
  "quote_open": false,
  "server_time": 1786177866,
  "status": "closed",
  "symbol": "XAUUSD",
  "trade_open": false
}
```

The response omits the documented `session_open` and `session_close` Unix-second fields.

Authenticated `GET /api/v2/candles/XAUUSD?timeframe=M1&limit=500` returned:

- Last genuine price-forming bar: `1786136040` (2026-08-07 20:54 UTC), OHLC `4340.81 / 4341.53 / 4340.07 / 4341.53`, volume `84`.
- First frozen bar: `1786136100` (20:55 UTC), OHLC all `4341.49`, volume `8`.
- 230 terminal frozen-price rows continued through Saturday 08:29 UTC at exactly `4341.49`, with synthetic volume `7–9`.
- 169 rows were dated Saturday even though both `quote_open` and `trade_open` were false.

The authenticated BTCUSD M1 cold request also took about `3.14s` after the
mobile request began. The frontend cannot truthfully display exact M1 OHLC
before this authoritative response arrives; it must not fill that gap from
Bid/Ask or daily/session high-low fields.

### Connected-device runtime evidence

The issue was reproduced again on the connected Android device while switching
among closed symbols. The quote, status, and candle requests use the same active
broker/account session, but their results were inconsistent:

- `GET /quotes?symbols=...` returned `503` after about `1.16s` in one flow.
- A later `GET /quotes?symbols=...` returned `409` after about `1.14s`.
- During the same test window, per-symbol market-status requests returned `200`
  in about `1.08-1.46s`.
- Initial candle requests returned `200`, but took about `1.30-2.03s` for the
  observed XAUUSD, GBPUSD, USDJPY, and AUDCAD switches.
- Guarded older-history requests took another `1.00-3.33s`. For example, an
  XAUUSD initial request took about `1.30s` and its older page about `1.20s`;
  a USDJPY initial request took about `1.50s` and an older page about `3.00s`.
  The sequential closed-chart recovery path can therefore exceed four seconds.
- In the recorded AUDCAD-to-XAUUSD dropdown run, the symbol context changed at
  about `486ms`, status completed at about `1.315s`, the 120-row candle request
  completed at about `1.581s`, and the automatic 500-row recovery followed at
  about `1.582s`; the genuine chart took roughly `5.5s` to settle end to end.

This explains the two visible symptoms without treating them as renderer bugs:

1. Candles can render because `/candles/{symbol}` returns `200`, while the
   right-axis last-price line and Buy/Sell values have no exact final Bid/Ask
   pair because `/quotes` failed with `409/503` and the closed websocket emits
   no new tick.
2. When the newest history window contains only frozen flat rows, the frontend
   must request an older page to locate the last genuine price-forming candle.
   That extra request is a safety recovery for invalid closed-market history,
   not an acceptable normal loading path.

## Required backend changes

1. Normalize every broker adapter to one per-symbol market-status response. It
must include `quote_open` and `trade_open` as independent booleans. When a
symbol is closed, `/market/status/{symbol}` must also return the most recently
completed session boundaries:

```json
{
  "status": "closed",
  "session_open": 0,
  "session_close": 0
}
```

Both values must be valid Unix timestamps in seconds. `session_close` is an exclusive boundary.

An asset class must not override its real per-symbol state. A crypto/continuous
symbol normally reports `quote_open: true`, while a genuine maintenance closure
reports `quote_open: false`. Pre-market and after-hours quote activity must also
come from `quote_open`, not from a frontend trading-calendar guess.

2. `/candles/{symbol}` must stop at the final genuine price-forming candle. Do not create history rows from heartbeat timestamps, cached quotes, or repeated last prices after `quote_open` becomes false.

3. Do not assign positive volume to synthetic/frozen candles. Historical volume must represent real accepted ticks/trades for that candle.

4. Apply the rule consistently to every supported timeframe. Higher-timeframe aggregation must be built only from genuine lower-timeframe/history data and must not extend beyond `session_close`.

5. The last quote snapshot must preserve the exact accepted backend `bid`,
`ask`, source timestamp, transport/provenance, and symbol. Do not synthesize a
missing side from candle close, spread, or another symbol. On a closed market,
the snapshot may be stale/display-only, but it must remain the exact final pair.

   A closed market is not an error condition for this endpoint. The final
   snapshot must remain queryable with `200 OK` even when the live adapter is no
   longer streaming. Do not return `409` merely because the quote session is
   closed, and do not return `503` when the adapter's last accepted snapshot is
   already available in its broker/session cache.

   Return the quote timestamp in the same documented time unit for every
   adapter. The final quote and final candle must be coherent members of the
   same broker, account/session epoch, exact symbol, and completed market
   session. The chart must stop on the last genuine candle while its price line
   and Buy/Sell UI show the exact final Bid/Ask pair. Candle close and Bid are
   allowed to differ when that is what the broker published; never rewrite one
   value to make them look numerically equal. Include enough timestamp and
   provenance data for the client and tests to prove that both belong to the
   same completed session.

6. Scope status, quote, and candle responses by broker, account/session epoch,
and exact broker symbol (including suffix). A late response from a previous
broker/account must be rejected before it reaches the client.

7. Make the latest-candle/history hot path fast enough for first Chart paint.
Use a broker/session/symbol/timeframe-scoped authoritative cache or equivalent
backend optimization so a warm authenticated `GET /candles/{symbol}` does not
take 3-5 seconds. The optimization must return the same exact broker candle and
provenance as the uncached path; it must never manufacture OHLC from a quote.

8. Make closed-market quote lookup and candle lookup independently reliable.
The quote snapshot must not depend on an active streaming connection after the
last accepted pair has been committed, and candle history must not perform a
serial adapter reconnect/status round trip for every warm request. A temporary
upstream failure may be surfaced with an explicit retryable error only when no
authoritative cached snapshot exists; it must not discard a previously accepted
final quote or genuine candle history.

## Frontend mitigations are not the backend fix

The mobile app can safely make only bounded mitigations:

- retry a failed exact `/quotes` snapshot a small number of times while the same
  broker/account/symbol session is still active and no websocket tick arrived;
- prefetch the selected symbol while the action sheet is open;
- reuse broker/session-scoped candle cache; and
- request one guarded older page when the entire initial closed window is a
  repeated frozen-price suffix.

These measures can hide a transient network race, but they cannot manufacture
an exact final Bid/Ask pair, session boundary, or genuine pre-close candle. Do
not make correctness depend on unlimited client retries, deep-history scanning,
a local trading calendar, asset-name exceptions, or candle-close substitution.
The backend must make the first authoritative closed-session responses complete
and fast for every broker adapter.

## Acceptance checks

- On a closed weekend XAUUSD M1 response, the newest candle time is strictly earlier than `session_close`.
- No identical frozen-price candles appear after the final trading-session candle.
- Repeated calls while closed do not append new candle timestamps.
- `session_open` and `session_close` are present for open, closed, pre-market, and after-hours responses.
- `quote_open` independently controls whether price-forming candles continue;
  `trade_open` independently controls whether orders are accepted.
- Crypto/continuous symbols with `quote_open: true` remain unaffected, while an
  explicit per-symbol maintenance closure is represented correctly.
- Closed quote snapshot has exact final `bid` and `ask`; no side equals candle
close unless the broker actually published the same numeric value.
- Repeated authenticated `/quotes?symbols={closedSymbol}` calls return `200`
  with the same exact final Bid/Ask pair and provenance; closing the market or
  disconnecting the live adapter does not change the response to `409` or `503`
  when a final accepted snapshot exists.
- In one captured response set, assert that market status, final quote, and
  final candle all carry the same broker/account/session epoch and exact symbol.
  Assert their timestamps fit the reported completed session without forcing
  candle close to equal Bid or Ask.
- A cold closed-symbol request returns the latest genuine candles directly. It
  must not require the client to paginate through a full window of identical
  post-close rows before discovering the last real candle.
- Run the same contract suite against every configured broker adapter, including
exact symbols and suffixes for forex, metals, indices, equities, energy,
commodities, and crypto.
- Add regression tests for an exact-boundary close: if `session_close` is `20:55:00`, a candle starting at `20:55:00` must not be returned.
- Record p50/p95 latency for the latest-candle/history endpoint per broker. On a
warm authenticated session, target p95 at or below 500 ms and fail the
performance check if adapter retries or serial status calls push it back into
the reproduced 3-5 second range.
- Record p50/p95 for closed-market quote snapshot lookup as well. A warm cached
  final quote should target p95 at or below 500 ms and must not rely on the
  mobile client's bounded retry loop to reach a successful response.

Do not solve this by asking the mobile frontend to guess trading calendars. The broker backend owns session state and authoritative candle provenance.
