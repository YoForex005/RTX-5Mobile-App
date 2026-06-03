# Backend Fix Prompt — Candle / Chart Data Service (RTX‑5 Trading App)

> Paste this whole file to the backend team / backend AI. It is self‑contained: it states the symptoms, the exact root causes we verified from the live servers, what to check, the precise API/WebSocket contract the mobile app expects, and the acceptance criteria. Fix everything in here and the chart will show correct, continuous history that merges seamlessly with the live price.

---

## 0. TL;DR (what is broken)

The mobile chart shows **no usable history** and appears to "shrink" to a single live candle. The frontend candle/merge code is correct and has been hardened; the failures are all on the **backend candle service**:

1. **Candle history is stale/frozen.** `GET /api/v2/candles/BTCUSD?timeframe=M1&limit=2500` returns 2500 bars, but they are a **frozen ~42‑hour window from 2026‑05‑12 05:25 → 2026‑05‑13 23:05 UTC** and never advance. Today is weeks later. The newest "history" bar is ~20 days old.
2. **Candle prices are on a different feed than live quotes.** Candle history is ~**$79,600** (mid‑May). The live quote feed for the same symbol is ~**$67,000** now. They are served by **two different hosts** (see #3), so history can never line up with live.
3. **The REST candle host and the live‑quote/WS host are different.** Candle REST is served from `https://testbrokerbackend.orrnn.com/api/v2`, but live quotes and the candle WebSocket are on `https://backend.orrnn.com`. These two backends are not in sync (different prices, different freshness).
4. **The candle WebSocket never streams live candles and returns empty history.** Subscribing to `candles.<SYMBOL>.<tf>` on `wss://.../ws/v2` returns only a `subscribed` ack and `candle_history {"candles": null, "count": 0}`, and emits **no `candle` updates** for an actively trading market. (With a JWT in `?token=`, the socket errors out and falls back to anonymous, still empty.)
5. **Corrupt outlier bars.** ~5 of the 2500 BTCUSD bars are at exactly **1/10th** of the real price (~$7,933 with fractional volume like `0.00009`) interleaved minute‑by‑minute — physically impossible.
6. **No public/unauthenticated candle endpoint.** `GET /api/v1/candles/{symbol}` and `GET /api/v1/candles?symbol=` return **404** on both hosts (the app tries these as a fallback).

### Evidence (captured from the live servers and the device)
```
# Authenticated REST (works, but stale) — host: testbrokerbackend.orrnn.com
GET /api/v2/candles/BTCUSD?timeframe=M1&limit=2500   -> 200, 2500 bars
   time span: 2026-05-12T05:25:00Z .. 2026-05-13T23:05:00Z  (~41.7h, contiguous)
   median close 80,677 | min 7,933 (5 outlier bars) | max 81,285
   newest bar ~20.3 days older than 'now'; live quote ~67,000

# Public REST (missing) — both hosts
GET https://backend.orrnn.com/api/v1/candles/BTCUSD?...        -> 404 page not found
GET https://testbrokerbackend.orrnn.com/api/v1/candles/BTCUSD  -> 404 page not found

# Candle WebSocket (empty + no live stream) — both hosts, anonymous
wss://backend.orrnn.com/ws/v2          subscribe candles.BTCUSD.1m
   <- {"channel":"candles.BTCUSD.1m","type":"subscribed"}
   <- {"channel":"candles.BTCUSD.1m","type":"candle_history","data":{"candles":null,"count":0}}
   (26s elapsed: ZERO 'candle' / 'candle_update' messages; same for 5m, 1h, 1d)
wss://testbrokerbackend.orrnn.com/ws/v2   -> identical (empty)

# On the device, connecting the candle WS WITH the JWT logs: "[Candles WS] connection error"

# Live quote feed (works, current) — host: backend.orrnn.com
wss://backend.orrnn.com/ws/feed   subscribe BTCUSD   -> streams ~67,000 (current)
```

---

## 1. Root causes to fix (in priority order)

### A. Make candle history current and continuous (the #1 issue)
- The candle store for each symbol/timeframe must contain bars **up to the present minute**, continuously, with no multi‑day frozen gap. `GET /candles/{symbol}?timeframe=M1&limit=2500` with **no `from`/`to`** must return the **latest** 2500 closed bars ending at the current/most‑recent bar.
- Verify the candle ingestion/aggregation job is actually running for all symbols and not stuck on an old snapshot (the data being frozen at 2026‑05‑13 strongly implies a stopped/cron‑dead aggregator or a static fixture being served).

### B. Serve candles from the SAME price source as the live quote feed, on ONE host
- Candle OHLC and the live quote feed must be the **same instrument and price basis**. Right now candle history (~$79.6k) and live quotes (~$67k) disagree because they come from different backends (`testbrokerbackend.orrnn.com` vs `backend.orrnn.com`).
- Decide on one authoritative backend for candles+quotes (or make them mirror each other exactly) so the latest closed candle's `close` ≈ the current live bid/ask within normal spread.
- State the **price basis** (`bid` / `ask` / `mid` / `last`) and return it in the response (field `priceBasis`); keep it identical between candles and the live feed.

### C. Fix / enable the candle WebSocket (`/ws/v2`)
- On `subscribe` to `candles.<SYMBOL>.<tf>`, return a **non‑empty `candle_history`** (the recent closed bars), then **stream live `candle` updates** as the forming bar ticks and when bars close. Today it returns `candles: null, count: 0` and never pushes updates.
- Accept the JWT passed as `?token=<jwt>` on the WS URL **without erroring**; if you don't need it for public candles, ignore it gracefully (do not drop the connection). Currently a token causes a handshake/connection error.

### D. Remove corrupt outlier bars
- Stop emitting bars at 1/10th (or any Nx) of the real price. The 5 BTCUSD bars at ~$7,933 with `volume ≈ 0.00009` look like a second feed/source leaking into the series, or a decimal/scale bug. Ensure one consistent decimal scale per symbol.

### E. (Optional) Provide the public candle endpoint or confirm it's intentional
- The app falls back to `GET /api/v1/candles/{symbol}` and `GET /api/v1/candles?symbol={symbol}` when unauthenticated; both 404. Either implement them (read‑only, public) or confirm guests are not meant to see charts (the authenticated `/api/v2` path already works once data is fixed).

---

## 2. EXACT REST contract the app expects (`/api/v2/candles`)

The app issues (authenticated, `Authorization: Bearer <jwt>`):
```
GET {BASE}/api/v2/candles/{SYMBOL}?timeframe={TF}&limit={N}[&from={sec}][&to={sec}]
```
- `{BASE}` = the broker server URL the user logged into (currently resolves to `https://testbrokerbackend.orrnn.com`). Whatever host you choose for candles, it must match the session's broker server URL **and** the live quote source.
- **Path‑param form** `/candles/{SYMBOL}` is the primary. A query form `/candles?symbol={SYMBOL}` is also accepted by the app — support at least the path form.

### Request parameters
| Param | Format | Unit | Required | Notes |
|---|---|---|---|---|
| `timeframe` | `M1, M5, M15, M30, H1, H4, D1, W1, MN` (the app sends these UPPERCASE tokens). Also accept lowercase `1m,5m,15m,30m,1h,4h,1d,1w,1M`. | — | yes | Be liberal: accept both `M1` and `1m`. |
| `limit` | integer (default 2500, max 2500) | count | yes | Return the most recent `limit` **closed** bars when no `from/to`. |
| `from` | unix **seconds** | sec | no | Inclusive lower bound; used for left‑scroll pagination. |
| `to` | unix **seconds** | sec | no | Inclusive upper bound; "give me bars before this time". |

> ⚠️ **Time unit must be SECONDS** for both request bounds and response `time`. The app sends/normalizes to seconds. (It will auto‑downscale ms/µs/ns if you send those, but seconds is the contract.)

### Response body (any of these envelope shapes is accepted)
Top‑level: the candles array may be at `candles`, `data`, `items`, `results`, `result`, `payload`, `bars`, or nested `data.candles` / `result.candles` / `payload.candles`. **Recommended canonical shape:**
```json
{
  "symbol": "BTCUSD",
  "timeframe": "M1",
  "priceBasis": "bid",
  "candles": [
    { "time": 1717113900, "open": 67010.5, "high": 67025.0, "low": 67008.2, "close": 67019.7, "volume": 51, "closed": true },
    { "time": 1717113960, "open": 67019.7, "high": 67040.0, "low": 67015.0, "close": 67033.2, "volume": 74, "closed": false }
  ]
}
```
Rules the app enforces (bars violating these are silently dropped):
- `time` finite & > 0, **unix seconds**, on the timeframe boundary (e.g. M1 = multiple of 60).
- `open/high/low/close` finite numbers with `high >= max(open,close,low)` and `low <= min(open,close,high)`.
- Bars returned **chronologically ascending** (oldest first). No duplicate timestamps. No gaps other than real market closures.
- `volume` optional (defaults 0); **must be on a consistent scale** (don't mix integer tick volume with 0.0000x lot volume).
- The **last** bar may be the still‑forming candle; mark closed bars with `"closed": true` and the forming one with `"closed": false` (or omit on the last only). The app splits closed history vs the current forming bar using this flag.

Accepted field‑name aliases (you may use any; canonical lowercase preferred): time=`time|timestamp|ts|t|date|datetime|serverTime|server_time`; open=`open|o|O`; high=`high|h|H`; low=`low|l|L`; close=`close|c|C`; volume=`volume|vol|tickVolume|tick_volume|v|V`; closed=`closed|isClosed|complete|final|is_closed`.

### Errors
- Return `200` with the array (possibly empty) for valid requests. On auth failure return `401 {"error":"UNAUTHORIZED","message":"..."}` (already correct). Don't return `301` redirects on the v1 path (the v1 query form currently 301‑redirects then 404s).

---

## 3. EXACT WebSocket contract the app expects (`/ws/v2`)

Connect URL: `wss://{HOST}/ws/v2` (from `EXPO_PUBLIC_CANDLES_WS_URL`, currently `wss://backend.orrnn.com/ws/v2`). A JWT **may** be appended as `?token=<urlencoded-jwt>`; **accept connections with or without it** and never error solely because a token is present.

### Subscribe / unsubscribe (channel protocol — this is what `/ws/v2` uses)
Client → server:
```json
{ "action": "subscribe",   "channel": "candles.BTCUSD.1m" }
{ "action": "unsubscribe", "channel": "candles.BTCUSD.1m" }
```
- Channel format: `candles.<NORMALIZED_SYMBOL>.<tf>` where `<tf>` is the **lowercase** token: `M1→1m, M5→5m, M15→15m, M30→30m, H1→1h, H4→4h, D1→1d, W1→1w, MN→1M`.

### Messages the server must send
1. **Ack** (already sent): `{ "channel": "candles.BTCUSD.1m", "type": "subscribed" }`
2. **History snapshot** (currently broken — returns null): on subscribe, send recent closed bars:
   ```json
   { "channel": "candles.BTCUSD.1m", "type": "candle_history",
     "data": { "candles": [ {"time":1717113900,"open":...,"high":...,"low":...,"close":...,"volume":51,"closed":true}, ... ],
               "count": 500 } }
   ```
3. **Live updates** (currently never sent — must stream): every time the forming bar ticks and when a bar closes:
   ```json
   { "channel": "candles.BTCUSD.1m", "type": "candle",
     "candle": { "time": 1717113960, "open":..., "high":..., "low":..., "close":..., "volume":74, "closed": false } }
   ```
   On bar close, send the final bar with `"closed": true`, then start the next bucket. The app also accepts the bar at top level or as an array under `data`/`candles`; nested `{"candle":{...}}` is fine.
- Each pushed candle must carry enough routing context: either the `channel` string (preferred) or `symbol`+`timeframe` fields on the payload. Same OHLC/time rules and field aliases as REST (section 2). **time in unix seconds.**

> If the candle WS cannot stream live candles, at minimum it must return a correct non‑empty `candle_history` and push closed bars, because the app currently only synthesizes a live candle from the quote feed and has no real candle stream.

---

## 4. What to CHECK on the backend (diagnosis checklist)

1. **Why is candle data frozen at 2026‑05‑13?** Is a candle aggregation/cron job dead, or is a static seed/fixture being returned? Confirm new M1 bars are being written every minute for every symbol.
2. **Which host owns candles vs quotes?** Reconcile `testbrokerbackend.orrnn.com` (REST candles) with `backend.orrnn.com` (quotes + WS). Make candles and quotes come from one synchronized source so prices/timestamps agree.
3. **Price basis & scale:** verify candle `close` ≈ live bid/ask for the same instant; eliminate the 1/10th‑scale bars; ensure consistent decimals per symbol.
4. **WS candle pipeline:** does `/ws/v2` have a publisher feeding `candle_history` + live `candle` events, or only the ack handler? Wire it to the same candle store as REST.
5. **WS token handling:** confirm `?token=<jwt>` does not cause a handshake error; public candle channels should work anonymously.
6. **Pagination:** verify `from`/`to` (unix **seconds**) return older bars for left‑scroll; sending milliseconds must not push the cursor into a far‑future empty page.
7. **Timeframes:** confirm all of `M1,M5,M15,M30,H1,H4,D1,W1,MN` (and the `1m…1M` WS tokens) return data, not just M1.
8. **Public endpoint:** decide whether `/api/v1/candles/{symbol}` should exist; if yes, implement it read‑only.

---

## 5. Acceptance criteria (how we verify it's fixed)

For symbol `BTCUSD`, timeframe `M1` (repeat for EURUSD, XAUUSD, etc.):

- [ ] `GET /api/v2/candles/BTCUSD?timeframe=M1&limit=2500` (authed) returns ≥ ~1000 bars whose **newest `time` is within the last ~2 minutes of now**, ascending, no duplicate/garbage bars, all on 60‑second boundaries.
- [ ] The newest candle `close` is within the normal spread of the **live quote** for BTCUSD on `wss://backend.orrnn.com/ws/feed` at the same moment (no $79k‑vs‑$67k disagreement).
- [ ] No bar deviates ~10x from its neighbors (no $7,933 among $67k bars); volumes are on one consistent scale.
- [ ] `from`/`to` (unix seconds) pagination returns correctly older contiguous bars.
- [ ] WS `subscribe candles.BTCUSD.1m` returns a **non‑empty** `candle_history`, then emits a live `candle` update at least once per few seconds while the market moves, and a `closed:true` bar at each minute boundary — with or without `?token=`.
- [ ] Candle REST host == the session's broker server URL, and its prices are consistent with the quote WS host.
- [ ] All listed timeframes return data.

When all boxes pass, the mobile chart will load full history, merge it seamlessly into the live candle, and stop "shrinking" — no further frontend change required.

---

## 6. Frontend status (for context — no backend action needed)

The mobile app side has been audited and is correct/robust; it has already been hardened to **degrade gracefully** when the backend sends bad data:
- It validates and drops malformed bars, filters isolated price outliers, and (new) **does not stitch a stale, time‑disconnected history block onto live bars** — so once your data is fresh and consistent, history merges into live automatically with zero further changes.
- It accepts a very wide range of field names / envelope shapes / time units (see sections 2–3), so you have flexibility, but the **canonical shapes shown above are recommended**.
- Until the backend is fixed, the app can only show live candles synthesized from the quote feed (because the candle REST is stale and the candle WS sends nothing). That is the symptom you must resolve on the backend.
