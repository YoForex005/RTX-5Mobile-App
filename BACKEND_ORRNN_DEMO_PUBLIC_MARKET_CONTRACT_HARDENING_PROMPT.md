# Backend Prompt: Harden the ORRNN Demo Public-Market Contract

Audit and harden the public market-data contract used by the RTX5 mobile app.
Do not make account, order, position, or other trading APIs public. This task is
only for tokenless read-only symbol, quote, and candle data.

The mobile-side blocking defect has already been identified and fixed: React
Native received batched quote frames shaped as `{"type":"ticks","ticks":[...]}`
while the old client parsed only flat quote frames. The updated frontend now
supports both flat and batched quote delivery. Do not report that working WSS
must be replaced, and do not require a user account merely to read market data.

## Live contract verified without credentials

The following calls worked on 2026-08-10 without an `Authorization` header,
cookie, account login, API key, or account-creation request:

- `GET https://demomanager.orrnn.com/api/v1/public/demo-status`
- `GET https://demomanager.orrnn.com/api/v1/public/demo-groups`
- `GET https://demobackend.orrnn.com/api/v1/candles/symbols`
- `GET https://demobackend.orrnn.com/api/v1/candles?symbol=EURUSD&tf=1m&limit=500`
- `GET https://demobackend.orrnn.com/ws/feed/status`
- `wss://demobackend.orrnn.com/ws/feed?symbols=EURUSD,GBPUSD`
- `wss://demobackend.orrnn.com/ws/feed` followed by:

```json
{"type":"subscribe","symbols":["EURUSD","GBPUSD"]}
```

- Live-candle subscription:

```json
{"type":"subscribe_candles","symbol":"EURUSD","tf":"1m"}
```

The query-string and post-open quote subscriptions both streamed live prices.
The candle subscription acknowledged and streamed live candle frames. CORS
also accepted app and localhost origins.

Keep these tokenless read-only flows working. Do not couple them to selected
broker, saved credentials, demo-account existence, or an authenticated trading
session.

## Confirmed backend gaps

### 1. Candle retention is too shallow

Requests used `limit=500`, but EURUSD and GBPUSD returned approximately:

| Timeframe | Rows returned |
| --- | ---: |
| `1m` | 73-84 |
| `5m` | 16 |
| `15m` | 6 |
| `30m` | 4 |
| `1h` | 2 |
| `4h` | 2 |
| `1d` | 1 |

The mobile M1 chart can render, but higher-timeframe charts have only one or
two bars. Retain and return enough genuine history for useful charting.

Required behavior:

- Return up to the requested `limit`, capped at 500, when that much genuine
  history exists.
- Maintain at least 500 recent bars per supported symbol and timeframe after
  the service has completed its documented warm-up period.
- Supported timeframes remain `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, and `1d`.
- Return candles in ascending timestamp order, with no duplicate buckets.
- OHLC geometry must be valid, values finite, and timestamp units documented.
- Preserve the forming candle using the existing `closed` boolean. Do not
  invent flat candles merely to reach the requested limit.
- If history is temporarily incomplete, expose an explicit warm-up/coverage
  field instead of silently implying that one bar is the complete history.

### 2. There is no tokenless REST quote snapshot fallback

`GET https://demobackend.orrnn.com/api/v1/quotes?symbols=EURUSD,GBPUSD`
currently returns `404`.

Add a public read-only batch quote snapshot endpoint at that route, or return a
different canonical route in the backend handoff and keep it stable. This is a
recovery path when a device cannot establish or temporarily loses WSS; WSS
remains the primary live transport.

Suggested response:

```json
{
  "quotes": [
    {
      "symbol": "EURUSD",
      "canonical_alias": "EURUSD",
      "broker_id": "orrnn-demo",
      "bid": 1.15481,
      "ask": 1.15483,
      "timestamp": 1786365522000,
      "stale": false,
      "tradable": true,
      "source": "cserver"
    }
  ]
}
```

Requirements:

- No auth, cookies, account login, or API key.
- Accept a bounded comma-separated symbol list and document the maximum.
- Return only exact backend bid/ask snapshots; do not synthesize one side.
- State the timestamp unit explicitly and use it consistently with WSS.
- Include per-symbol unavailable/stale information so one missing symbol does
  not fail the entire batch.
- Apply reasonable public rate limits and return documented `429` metadata.
- This endpoint must never accept or place trades.

### 3. Symbol catalogs disagree

`GET /api/v1/candles/symbols` returned 341 symbols, while
`GET /ws/feed/status` reported 350 `available_symbols`.

These nine status-only symbols produced no quote/candle data during the audit:

```text
ABC.GB
EURHKD
FTMUSD
GBPZAR
LUNAUSD
RIPPLE
XBRUSD
XNGUSD
XTIUSD
```

Use one canonical public symbol registry, or explicitly distinguish states
such as `quote_available`, `candle_history_available`, `warming_up`, and
`disabled`. Do not advertise a symbol as generally available when neither
transport can provide usable data.

The catalog must be dynamic. Do not solve this by hardcoding EURUSD or the five
symbols used in mobile smoke tests.

### 4. Public data has inconsistent broker provenance

The public quote frames currently contain `"broker_id":"default"`, although
the demo manager identifies the service as `"orrnn-demo"`. Candle frames have
no broker identifier.

Use the stable canonical identity `orrnn-demo` on public quote snapshots,
flat WSS quotes, batched WSS quotes, REST candles, and WSS candles. If `default`
is intentionally a separate feed ID, expose both distinct fields and document
their meanings; do not overload `broker_id`.

### 5. Formalize the public protocol

The server has emitted both of these valid quote shapes:

```json
{
  "symbol": "EURUSD",
  "bid": 1.15481,
  "ask": 1.15483,
  "timestamp": 1786365522000,
  "broker_id": "orrnn-demo"
}
```

```json
{
  "type": "ticks",
  "ticks": [
    {
      "symbol": "EURUSD",
      "bid": 1.15481,
      "ask": 1.15483,
      "timestamp": 1786365522000,
      "broker_id": "orrnn-demo"
    }
  ]
}
```

Either make delivery deterministic or formally support and test both forms.
Document all control messages, including `subscribed`, `unsubscribed`,
`subscribed_candles`, errors, ping/pong, and reconnect/resubscribe behavior.

Also document these existing REST details instead of leaving clients to infer
them:

- Candles use the query-style `/api/v1/candles?symbol=...&tf=...&limit=...`
  route; `/api/v1/candles/EURUSD` currently returns `404`.
- A missing `tf` currently defaults to `1m`.
- Lowercase timeframes such as `1m` are accepted; `M1` is currently rejected.
- Unknown symbols currently return `200` with an empty candle array. Prefer a
  documented structured `404`/`422`, or explicitly document the empty-result
  contract and include a machine-readable reason.

Publish an OpenAPI document for REST and a versioned AsyncAPI/protocol document
for WSS. A protocol change must be backwards compatible or versioned.

## Security and session-isolation requirements

- Public endpoints are read-only market data only.
- Never expose access tokens, refresh tokens, master/investor passwords,
  account numbers, positions, orders, balances, equity, or PII.
- Never infer an authenticated trading account from a public WSS connection.
- Authenticated broker sessions must continue to use their exact broker/account
  market and trading paths after login.
- Logging out must remove authenticated market/trading access but must not
  remove access to the global public demo market feed.
- Preserve origin validation, bounded subscriptions, payload-size limits,
  connection/rate limits, heartbeat timeouts, and backpressure protection.

## Required automated tests

Add backend integration tests that prove all of the following:

1. A clean anonymous client with no headers, cookies, or prior account can load
   the symbol catalog, candle history, quote snapshots, WSS quotes, and WSS
   candles.
2. The same tests pass with a React-Native-like `Origin` and user agent, not
   only a server-side Node client.
3. Query-string and post-open WSS subscriptions work for multiple dynamically
   selected symbols, with subscribe/unsubscribe and reconnect/resubscribe.
4. Flat and batched quote frames, if both remain supported, validate against
   published schemas and carry the same required fields.
5. Every advertised usable symbol produces either a quote/candle response or a
   documented per-symbol availability state.
6. At least EURUSD, GBPUSD, USDJPY, XAUUSD, and BTCUSD pass every supported
   timeframe, but production logic is not limited to those examples.
7. History ordering, deduplication, OHLC geometry, current-candle replacement,
   and the requested retention depth are verified.
8. All public payloads use canonical provenance and consistent timestamp units.
9. Public clients cannot call create/modify/close order or private account
   endpoints; those remain authenticated and account-scoped.
10. Invalid symbol, timeframe, limit, oversized subscription, and rate-limit
    failures have stable status/error codes and never crash the feed.

## Acceptance criteria

- A newly installed, logged-out mobile app can display the entire supported
  public symbol catalog, live quotes, and charts without creating an account.
- WSS remains live and REST snapshots provide bounded recovery during WSS
  outages.
- Higher-timeframe charts receive useful genuine history, up to 500 bars.
- Catalog and status counts agree, or explicit capability states explain every
  difference.
- All public data identifies its canonical `orrnn-demo` provenance.
- No trading or private account data becomes public.
- Existing authenticated broker trading behavior is unchanged.

## Mandatory backend-to-frontend handoff

Return a concise implementation report containing:

- Final production REST and WSS URLs.
- Exact request/response schemas and two real redacted samples for each frame
  type.
- Authentication matrix marking every route as public read-only or protected.
- Timestamp units, timeframe values, retention/warm-up rules, symbol limits,
  heartbeat/reconnect behavior, rate limits, and stable error codes.
- Whether flat frames, batched frames, or both are guaranteed.
- Canonical broker/feed provenance fields.
- OpenAPI and AsyncAPI/protocol-document links.
- Deployment/version identifier and test evidence.
- Any frontend change still required after deployment. If none is required,
  say so explicitly.

Do not answer only with a generic statement such as “the feed works.” Provide
the concrete contract and evidence needed for the mobile team to verify it.
