# Backend Prompt: RTX5 Candle History And Live Feed Frontend Contract

Use this whole file as the backend implementation and verification prompt.

This prompt is for the broker/backend team. It explains what is already implemented in the RTX5 frontend, what contract the frontend now expects from the backend, how the frontend uses candle history and live feeds, and what backend evidence must be returned so both sides can verify there are no missing history candles.

Frontend repo:

```text
C:\Users\ADMIN\RTX-5Mobile-App\rtx5-app
```

Backend repo expected by earlier handoff context:

```text
C:\Users\Administrator\Desktop\ORRNN BACKEND\ORRNN-RTX5-Broker-Backend
```

Do not put backend-only secrets into the mobile frontend. Do not put `HISTORY_API_KEY`, database credentials, broker feed provider credentials, raw feed tokens, or full tokenized WebSocket URLs in frontend code, frontend tests, screenshots, logs, or committed docs.

## Role

You are the backend implementation and verification agent.

Your job is to make sure the broker backend returns candle history and live feed data in the exact contract that the RTX5 mobile frontend now implements.

This is not a frontend task unless the backend proves a frontend bug with concrete evidence. The frontend has already been updated to use the selected broker gateway REST candle route, normalize timestamp units, preserve valid gateway candles, reject impossible OHLC, and surface history load errors instead of silently showing an endless loading or missing-history state.

## Target Outcome

When backend candle history exists for a broker, symbol, and timeframe:

1. The mobile frontend calls the authenticated selected-broker gateway candle route.
2. The backend returns a usable candle response with canonical timeframe, Unix-second candle times, finite valid OHLC, and a consistent wrapper.
3. The frontend normalizes and sorts the response.
4. The chart renders history candles.
5. The chart does not show missing history when the backend returned valid candles.
6. Live quote or candle streams continue updating the active chart after REST history bootstrap.
7. If the backend cannot return history, the backend returns a clear error or empty result that can be diagnosed without guessing.

## Short Backend Summary

The frontend now expects history from selected broker gateway REST, not from direct internal history REST and not from WebSocket snapshots.

The main REST calls made by the app are:

```text
GET {selectedBrokerApiV2Base}/candles/{symbol}?timeframe=M1&limit=500
GET {selectedBrokerApiV2Base}/candles/{symbol}?tf=M1&count=500
GET {selectedBrokerApiV2Base}/market-data/candles/{symbol}?timeframe=M1&limit=500
```

The actual `selectedBrokerApiV2Base` is the active broker gateway API base used by the mobile `apiClient`. The frontend passes the request path as `/candles/{encodedSymbol}` or `/market-data/candles/{encodedSymbol}`.

The response should preferably be:

```json
{
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "priceBasis": "bid",
  "candles": [
    {
      "time": 1780000000,
      "open": 2340.1,
      "high": 2341.0,
      "low": 2339.8,
      "close": 2340.7,
      "volume": 42,
      "closed": true
    }
  ]
}
```

The frontend can accept compatibility wrappers, but backend should standardize on the shape above.

## What Is Already Implemented In The Frontend

### 1. Gateway REST History Bootstrap

Frontend file:

```text
rtx5-app/src/domain/candles/api/candles.ts
```

The app now uses authenticated gateway-style candle routes:

```text
/candles/{symbol}?timeframe={REST_TF}&limit={count}
/candles/{symbol}?tf={REST_TF}&count={count}
/market-data/candles/{symbol}?timeframe={REST_TF}&limit={count}
```

Important behavior:

- The selected symbol is normalized and URL encoded before it is put into the path.
- The app does not call `/history/candles/{symbol}` from this candle-history path.
- The app does not use `HISTORY_API_KEY`.
- The app tries the supported route/query variants in order until a usable non-empty history response is found.
- The frontend `apiClient` handles the bearer access token when a logged-in account has a stored access token.
- If no stored frontend access token exists, `skipAuth` can be true. Backend should still enforce its own route rules and return a clear `401/403` when auth is required.
- HTTP errors are not intentionally swallowed as "no data"; if every attempted REST route fails and there was no successful response, the frontend throws the last HTTP error.

### 2. REST Query Param Normalization

Frontend file:

```text
rtx5-app/src/domain/candles/api/candleHistoryQuery.ts
```

The frontend now normalizes REST timeframes before sending requests:

```text
1m  -> M1
5m  -> M5
15m -> M15
30m -> M30
1h  -> H1
4h  -> H4
1d  -> D1
1w  -> W1
MN1 -> MN
MN  -> MN
```

Supported REST history labels:

```text
M1, M5, M15, M30, H1, H4, D1, W1, MN
```

The frontend now normalizes `from` and `to` request bounds to Unix seconds at the service boundary.

Accepted caller inputs:

- Unix seconds, for example `1780000000`
- JavaScript milliseconds, for example `1780000000000`
- Other larger timestamp precision values are normalized defensively in frontend utilities

Backend expectation:

- Treat `from` and `to` as Unix seconds.
- Do not require JavaScript milliseconds.
- Do not return empty history simply because the frontend paginated with a valid Unix-second `to` cursor.

### 3. Gateway Response Extraction

Frontend file:

```text
rtx5-app/src/domain/candles/api/candleHistoryQuery.ts
```

The frontend accepts these response shapes:

```json
{ "symbol": "XAUUSD", "timeframe": "M1", "candles": [] }
```

```json
{ "data": { "symbol": "XAUUSD", "timeframe": "M1", "candles": [] } }
```

```json
{ "result": { "symbol": "XAUUSD", "timeframe": "M1", "candles": [] } }
```

```json
{ "payload": { "symbol": "XAUUSD", "timeframe": "M1", "candles": [] } }
```

Compatibility array names also accepted:

```text
candles, data, items, results, result, payload, bars
```

Backend preferred contract:

```json
{
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "priceBasis": "bid",
  "candles": []
}
```

Do not make the mobile app rely on a bare array from a protected internal history service. Bare arrays are tolerated only as a compatibility fallback.

### 4. Candle Normalization And Validation

Frontend files:

```text
rtx5-app/src/domain/candles/normalization/candleNormalizer.ts
rtx5-app/src/domain/candles/core/candleUtils.ts
rtx5-app/src/domain/candles/core/candleValidator.ts
```

Accepted candle field aliases include:

```text
time:   time, timestamp, ts, t, date, datetime, serverTime, server_time
open:   open, Open, OPEN, o, O
high:   high, High, HIGH, h, H
low:    low, Low, LOW, l, L
close:  close, Close, CLOSE, c, C
volume: volume, Volume, VOLUME, vol, tickVolume, tick_volume, v, V
symbol: symbol, Symbol, SYMBOL, s, S, instrument, instrumentSymbol
tf:     timeframe, Timeframe, TIMEFRAME, tf, TF, period, interval
closed: closed, isClosed, complete, completed, final, isFinal, is_closed, is_complete
```

The backend should still send the canonical names:

```json
{
  "time": 1780000000,
  "open": 2340.1,
  "high": 2341.0,
  "low": 2339.8,
  "close": 2340.7,
  "volume": 42,
  "closed": true
}
```

The frontend strictly rejects impossible OHLC. It will not repair bad candles.

Rejected conditions:

```text
high < open
high < close
high < low
low > open
low > close
low > high
missing time/open/high/low/close
non-finite time/open/high/low/close
non-positive timestamp
```

Volume:

- Missing volume becomes `0`.
- Non-negative finite volume is accepted.
- Negative or non-finite volume should not be sent by backend.

Important backend instruction:

Do not send daily session high/low, account high/low, provider high/low, or symbol-wide metrics as an individual candle `high` or `low`. Candle `high` must be the maximum price inside that candle bucket, and candle `low` must be the minimum price inside that bucket.

### 5. Valid Large Wicks Are Preserved

Frontend files:

```text
rtx5-app/src/domain/candles/normalization/chartAdapter.ts
rtx5-app/src/domain/candles/series/candleSeriesMerger.ts
rtx5-app/src/features/chart/rendering/ChartWebViewHtml.ts
```

The frontend no longer drops valid candles only because a wick is large or because the price jumps from nearby candles.

The frontend still rejects impossible OHLC, but it does not run the old price-continuity or isolated-outlier pruning path on valid backend history candles.

Backend implication:

- If a candle is valid, the frontend should keep it.
- If a candle is missing after this change, backend should check whether it sent invalid OHLC, wrong timestamp unit, wrong symbol/timeframe, empty route result, or an auth/route error.
- Backend should not expect frontend to hide backend data quality problems by widening high/low or inventing replacement values.

### 6. Sorting, Dedupe, Closed And Current Candle Behavior

Frontend files:

```text
rtx5-app/src/domain/candles/core/candles.ts
rtx5-app/src/domain/candles/core/candleProvenance.ts
rtx5-app/src/domain/candles/series/candleSeriesMerger.ts
```

The frontend:

- Normalizes candle timestamps to Unix seconds.
- Sorts candles ascending by `time`.
- Dedupes by candle bucket time.
- Marks closed REST candles as trusted history when they are structurally valid and aligned to the requested timeframe bucket.
- Treats the final candle as the current/forming candle when the backend does not explicitly mark it closed.
- Preserves explicit `closed: true` or `closed: false` flags when provided.
- Keeps `priceBasis` as one of `bid`, `ask`, `mid`, or `last` when the backend returns it.
- Defaults price basis to frontend config, currently `bid` unless overridden.

Backend should:

- Align `time` to the actual bucket start for the requested timeframe.
- Use UTC boundaries for D1, W1, and MN.
- For W1, frontend bucket logic starts weeks on Monday UTC.
- For MN, frontend bucket logic uses the UTC first day of the month.
- Return a `closed` flag when possible, especially for the last candle.
- Avoid duplicate candles for the same symbol/timeframe/time unless the duplicate is intentionally the latest authoritative replacement.

### 7. History Fetching, Pagination And Error Surfacing

Frontend files:

```text
rtx5-app/src/domain/candles/stream/liveCandleStream/historyFetching.ts
rtx5-app/src/domain/candles/hooks/useLiveCandles.ts
rtx5-app/src/features/chart/ChartScreen.native.tsx
rtx5-app/src/features/chart/ChartScreen.web.tsx
```

The frontend:

- Starts initial REST history load for the active symbol/timeframe.
- Aborts stale requests when the symbol/timeframe changes.
- Ignores stale responses by request id.
- Replays buffered live events after REST history loads.
- Paginates older history when the chart scrolls left.
- Sends pagination cursors as Unix seconds.
- Exposes `loading` and `error` from the candle stream hook.
- Displays the actual history error on native and web chart screens when there are no candles.

Backend implication:

- Do not return generic empty success for auth failures.
- For auth failure, return a clear `401` or `403` with JSON containing `message` or `error`.
- For unsupported symbol/timeframe, return clear `400` or `404` with reason.
- For valid empty history, return `200` with `candles: []`.
- For backend failures, return `5xx` with a useful redacted reason.

The frontend reads backend error messages from:

```json
{ "message": "..." }
```

or:

```json
{ "error": "..." }
```

### 8. Live Quote Feed Is Separate From REST History

Frontend files:

```text
rtx5-app/src/api/ws/quotesSocket/QuotesWebSocketService.ts
rtx5-app/src/api/feedAuth.ts
rtx5-app/src/api/ws/quoteTickNormalizer.ts
rtx5-app/src/api/ws/quotesSocket/tickProcessor.ts
```

The frontend uses `/ws/feed` for live quote ticks and live quote-driven active candle movement. It is not the history bootstrap source.

Browser/mobile feed URL construction:

```text
wss://{broker-service-domain}/ws/feed?broker_id={brokerId}
wss://{broker-service-domain}/ws/feed?broker_id={brokerId}&token={redactedFeedToken}
```

Frontend behavior:

- `broker_id` is required for broker-hosted quote feed.
- `token` is appended when a feed token exists.
- If the backend does not require feed auth for that broker, frontend can still connect with broker id only.
- Token values are redacted in diagnostics.
- The quote socket should stay on the broker-hosted feed for logged-in broker charts.

Quote subscribe message:

```json
{ "type": "subscribe", "symbols": ["XAUUSD"] }
```

Quote payloads accepted by frontend:

```json
{ "symbol": "XAUUSD", "bid": 2340.1, "ask": 2340.3, "time": 1780000000 }
```

```json
{ "type": "ticks", "ticks": [{ "symbol": "XAUUSD", "bid": 2340.1, "ask": 2340.3, "time": 1780000000 }] }
```

Timestamp handling:

- `time`, `timestamp`, `t` can be seconds or milliseconds.
- `time_ms`, `timestamp_ms`, and similar explicit ms fields should be milliseconds.
- Frontend normalizes for UI freshness and active candle updates.

Backend should:

- Send finite positive bid/ask.
- Keep symbols consistent with REST symbols.
- Avoid sending stale repeated ticks as if they are fresh.
- Include a server timestamp where possible.

### 9. Candle WebSocket Is Separate From `/ws/feed`

Frontend files:

```text
rtx5-app/src/domain/candles/ws/candlesSocketProtocol.ts
rtx5-app/src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts
```

The app's server-candle WebSocket path uses `/ws/v2`, not `/ws/feed`.

The frontend resolves a broker candle socket like:

```text
wss://{broker-service-domain}/ws/v2?broker_id={brokerId}
```

The channel format is:

```text
candles.{SYMBOL}.{WS_TF}
```

Examples:

```text
candles.XAUUSD.1m
candles.EURUSD.1h
```

Current `/ws/v2` timeframe labels:

```text
M1 -> 1m
M5 -> 5m
M15 -> 15m
M30 -> 30m
H1 -> 1h
H4 -> 4h
D1 -> 1d
W1 -> 1w
MN -> 1M
```

Backend should not confuse this with `/ws/feed subscribe_candles`.

If backend also supports `/ws/feed subscribe_candles`, treat it as future live candle updates only, not a history backfill snapshot.

### 10. Live Candle Payload Rules

Frontend file:

```text
rtx5-app/src/domain/candles/normalization/candleNormalizer.ts
```

Live candle payloads may be nested inside:

```text
candle, bar, data
```

The frontend preserves backend update ordering fields:

```text
server_time
serverTime
server_timestamp
serverTimestamp
updated_at
updatedAt
received_at
receivedAt
```

Important distinction:

- Candle `time` is the bucket start.
- Backend `server_time` or `updatedAt` is the update ordering signal.

Backend should keep these separate. Do not overwrite candle bucket `time` with message receive time or server event time.

## Backend Contract To Verify Or Implement

### A. REST Routes

Backend must support the selected broker gateway routes:

```text
GET /api/v2/candles/{symbol}
GET /api/v2/market-data/candles/{symbol}
```

At least these query forms should work:

```text
?timeframe=M1&limit=500
?tf=M1&count=500
?timeframe=M1&limit=500&from=1775738200&to=1775738800
```

Do not require:

```text
/api/v2/candles?symbol=XAUUSD
/history/candles/{symbol}
HISTORY_API_KEY from the mobile frontend
JavaScript millisecond from/to values
```

### B. Auth Contract

Expected mobile behavior:

- Logged-in frontend sends broker/account auth through `apiClient`.
- Backend should validate that bearer token normally.
- Missing or invalid token should produce `401` or `403`, not `200` with empty candles.

Backend response examples:

```json
{ "error": "missing bearer token" }
```

```json
{ "message": "account session expired" }
```

Do not expose secrets in these messages.

### C. Request Parameter Contract

Symbol:

- In path.
- URL encoded.
- Usually uppercase normalized, for example `XAUUSD`.
- Broker suffixes should be documented if backend requires them.

Timeframe:

- REST values: `M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D1`, `W1`, `MN`.
- Accept `MN` for monthly.
- If backend receives `MN1`, normalize to `MN` or return a clear `400`.

Limit/count:

- Positive integer.
- Backend may cap, but should return the actual count in response metadata if capped.

From/to:

- Unix seconds.
- Inclusive/exclusive rules must be documented.
- Recommended:
  - `to` means return candles older than or up to that bucket, depending on backend storage.
  - If used for left-scroll pagination, do not include only candles already returned.
  - Return enough older candles for pagination to visibly grow the chart.

### D. Response Shape Contract

Preferred response:

```json
{
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "priceBasis": "bid",
  "count": 500,
  "candles": [
    {
      "time": 1780000000,
      "open": 2340.1,
      "high": 2341.0,
      "low": 2339.8,
      "close": 2340.7,
      "volume": 42,
      "closed": true
    }
  ]
}
```

Allowed `priceBasis` values:

```text
bid, ask, mid, last
```

Preferred default:

```text
bid
```

The frontend can handle newest-first or oldest-first response order, because it sorts ascending before rendering. Backend should still choose one consistent order and document it.

### E. Candle Data Contract

For every candle:

- `time` is Unix seconds.
- `time` is bucket start, not server event time.
- `open`, `high`, `low`, `close` are finite numbers.
- `high >= open`.
- `high >= close`.
- `high >= low`.
- `low <= open`.
- `low <= close`.
- `low <= high`.
- `volume` is finite and non-negative.
- `closed` is provided when backend knows whether the candle is final.

Backend should provide at least one stable closed candle before the current forming candle where possible. This helps the frontend split trusted REST history from the current candle.

### F. Empty And Error Contract

Valid empty history:

```http
HTTP 200
```

```json
{
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "priceBasis": "bid",
  "candles": []
}
```

Invalid auth:

```http
HTTP 401
```

```json
{ "error": "missing or invalid authorization" }
```

Unsupported timeframe:

```http
HTTP 400
```

```json
{ "error": "unsupported timeframe: M2" }
```

Unknown symbol:

```http
HTTP 404
```

```json
{ "error": "symbol not found: XYZ" }
```

Backend failure:

```http
HTTP 500
```

```json
{ "error": "candle storage unavailable" }
```

Do not return `200` with empty candles for auth, broker routing, storage, or upstream failures. That makes a real backend failure look like valid no-history data.

## Backend Diagnostics To Run

Run these checks for at least one known broker/account and one known active symbol, for example `XAUUSD` `M1`.

### 1. Broker Gateway Route Check

Verify:

```text
GET /api/v2/candles/XAUUSD?timeframe=M1&limit=500
GET /api/v2/candles/XAUUSD?tf=M1&count=500
GET /api/v2/market-data/candles/XAUUSD?timeframe=M1&limit=500
```

For each route, record:

- HTTP status.
- Whether auth was present.
- Symbol path segment received by backend.
- Parsed timeframe.
- Parsed limit/count.
- Parsed from/to.
- Whether backend routed to selected broker/account.
- Raw storage query used internally, with secrets removed.
- Candle count returned.
- First 3 candle times.
- Last 3 candle times.
- Response order.
- Whether all times are Unix seconds.
- Whether every candle passes OHLC validation.

### 2. Pagination Check

Take the oldest candle time from an initial `M1` response and call:

```text
GET /api/v2/candles/XAUUSD?timeframe=M1&limit=500&to={oldestTimeMinusOne}
```

Expected:

- Backend returns older candles if they exist.
- Returned candle times are less than or equal to the requested cursor according to backend pagination rules.
- Backend does not interpret a 10-digit Unix-second cursor as milliseconds.
- Backend does not return only the same newest candles again.

### 3. Timeframe Check

Verify these REST requests:

```text
M1, M5, M15, M30, H1, H4, D1, W1, MN
```

For each:

- Response `timeframe` is canonical.
- Candle bucket starts align to the requested timeframe.
- Daily, weekly, and monthly buckets use UTC boundaries.
- Monthly response uses `MN`, not a backend-only `MN1` unless also normalized.

### 4. Wrapper Check

Ensure backend returns:

```json
{ "symbol": "...", "timeframe": "...", "candles": [...] }
```

Do not make the frontend depend on:

```json
[ ... ]
```

or a backend-internal direct history shape.

### 5. OHLC Integrity Check

For a response sample, run backend-side validation:

```text
time > 0
open finite
high finite
low finite
close finite
volume finite and >= 0
high >= max(open, close, low)
low <= min(open, close, high)
```

Return a count of invalid candles by reason.

The expected invalid count is:

```text
0
```

### 6. Live Feed Status Check

Verify:

```text
GET /ws/feed/status?broker_id={brokerId}
```

Record:

- `feed_auth_required`.
- `upstream_connected`.
- provider connected status.
- selected symbol freshness.
- last tick age.
- silent symbols count.
- whether status path requires auth.

Important:

`/ws/feed/status` is only feed freshness/status. It is not proof that REST history exists and it is not a history bootstrap route.

### 7. Quote WebSocket Check

Verify the browser/mobile URL shape:

```text
wss://{broker-service-domain}/ws/feed?broker_id={brokerId}
wss://{broker-service-domain}/ws/feed?broker_id={brokerId}&token={REDACTED}
```

Send:

```json
{ "type": "subscribe", "symbols": ["XAUUSD"] }
```

Expected:

- WebSocket opens.
- Subscription is accepted or first tick arrives.
- Tick includes symbol, bid, ask, and server time.
- Tick timestamps are either seconds or explicitly milliseconds.
- No raw token appears in logs.

### 8. Candle WebSocket Check

Verify `/ws/v2` separately:

```text
wss://{broker-service-domain}/ws/v2?broker_id={brokerId}
```

Subscribe to channel:

```text
candles.XAUUSD.1m
```

Expected:

- Message has candle OHLC fields.
- Candle `time` is bucket start.
- If backend sends `server_time` or `updatedAt`, it is event/update time and does not replace bucket `time`.
- `/ws/v2` payload shape is documented separately from `/ws/feed`.

## Backend Implementation Requirements

### 1. Do Not Expose Internal History Auth To Frontend

If direct internal history routes exist, keep them backend/internal:

```text
/history/candles/{symbol}
HISTORY_API_KEY
```

The mobile frontend must not call this route and must not know this key.

The backend gateway should call internal services server-side if needed, then return frontend-safe gateway JSON through `/api/v2/candles/{symbol}` or `/api/v2/market-data/candles/{symbol}`.

### 2. Normalize Gateway REST Timeframes

Backend should accept and normalize:

```text
M1, M5, M15, M30, H1, H4, D1, W1, MN
```

Optional compatibility:

```text
1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, MN1
```

Response should use canonical REST timeframe:

```text
MN, not MN1
```

### 3. Return Frontend-Safe Candle Schema

Gateway output should be stable and minimal:

```json
{
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "priceBasis": "bid",
  "candles": [
    {
      "time": 1780000000,
      "open": 2340.1,
      "high": 2341.0,
      "low": 2339.8,
      "close": 2340.7,
      "volume": 42,
      "closed": true
    }
  ]
}
```

Do not require frontend to parse backend-only fields such as:

```text
tickCount
isClosed
sourceTable
providerSessionId
internalBrokerAccountId
historyStorageShard
```

Those may be included if harmless, but the canonical fields above must exist.

### 4. Use Clear Error Semantics

Backend should differentiate:

- auth problem
- broker/account routing problem
- unsupported symbol
- unsupported timeframe
- no history available
- storage/upstream failure
- invalid generated candle data

Do not collapse all of these into `200 candles: []`.

### 5. Keep Live And History Sources Separate

Backend should not require frontend to wait for a WebSocket snapshot before rendering REST history.

REST history source:

```text
/api/v2/candles/{symbol}
/api/v2/market-data/candles/{symbol}
```

Live quote source:

```text
/ws/feed
```

Live candle channel source:

```text
/ws/v2
```

Status/freshness source:

```text
/ws/feed/status
```

Each path should be testable independently.

## Backend Tests To Add Or Prove

Add or run backend tests that prove the following.

### REST Route Tests

- `GET /api/v2/candles/XAUUSD?timeframe=M1&limit=500` returns `200` with canonical wrapper.
- `GET /api/v2/candles/XAUUSD?tf=M1&count=500` returns `200` or is intentionally documented as unsupported. If unsupported, the first route must work.
- `GET /api/v2/market-data/candles/XAUUSD?timeframe=M1&limit=500` returns `200` or is intentionally documented as unsupported. If unsupported, the first route must work.
- Missing auth returns `401` or `403`.
- Invalid token returns `401` or `403`.
- Unknown symbol returns `404` or clear empty history only if symbol exists but has no candles.
- Unsupported timeframe returns `400`.

### Timestamp Tests

- `from` and `to` are parsed as Unix seconds.
- A 10-digit cursor does not become a far-future date.
- Returned candle `time` values are Unix seconds.
- Candle bucket times align to timeframe.
- D1, W1, and MN use UTC bucket boundaries.

### OHLC Tests

- Backend never emits `high < open`.
- Backend never emits `high < close`.
- Backend never emits `high < low`.
- Backend never emits `low > open`.
- Backend never emits `low > close`.
- Backend never emits `low > high`.
- Backend never emits non-finite OHLC.
- Backend never emits negative volume.

### Wrapper Tests

- Response includes `candles`.
- Response includes `symbol`.
- Response includes `timeframe`.
- Response optionally includes `priceBasis`, with value in `bid`, `ask`, `mid`, `last`.
- Empty history still returns the same wrapper with `candles: []`.

### Pagination Tests

- Initial page returns latest usable candles.
- Older page with `to` cursor returns older candles.
- Older page does not repeatedly return the same page.
- Older page respects `limit` or `count`.

### Live Feed Tests

- `/ws/feed/status?broker_id=...` reports freshness/status without being treated as history.
- `/ws/feed` accepts quote subscription and emits tick payloads with symbol, bid, ask, timestamp.
- `/ws/v2` candle channel emits candle OHLC with bucket `time`.
- Feed auth required/not-required behavior matches `/ws/feed/status`.
- Tokenized WebSocket URLs are redacted in logs.

## Manual End-To-End Verification

Run this with one real broker account and one active symbol.

### Step 1. Confirm Broker Session

Record with secrets redacted:

```text
broker_id:
selected API base:
selected /ws/feed origin/path:
selected /ws/v2 origin/path:
access token present: true/false
feed token present: true/false
```

### Step 2. Confirm REST History

Call:

```text
GET {selectedBrokerApiV2Base}/candles/XAUUSD?timeframe=M1&limit=500
```

Record:

```text
HTTP status:
response wrapper:
symbol:
timeframe:
priceBasis:
raw candle count:
first time:
last time:
order:
invalid OHLC count:
```

### Step 3. Confirm Pagination

Use oldest returned time:

```text
GET {selectedBrokerApiV2Base}/candles/XAUUSD?timeframe=M1&limit=500&to={oldestTimeMinusOne}
```

Record:

```text
HTTP status:
older candle count:
new first time:
new last time:
does it overlap only old page: yes/no
```

### Step 4. Confirm Mobile Chart Behavior

With frontend debug logs enabled if needed:

```text
symbol:
timeframe:
REST request route:
REST status:
raw candle count:
normalized candle count:
chart setData candle count:
chart missing-history overlay visible: yes/no
chart error overlay text:
```

Expected:

```text
Valid non-empty REST candles -> chart renders -> no missing-history overlay.
REST auth/storage failure -> chart shows real error text.
Valid empty history -> chart shows empty/live-only state, not parser failure.
```

### Step 5. Confirm Live Feed

Call:

```text
GET /ws/feed/status?broker_id={brokerId}
```

Then connect:

```text
wss://{broker-service-domain}/ws/feed?broker_id={brokerId}&token={REDACTED_IF_REQUIRED}
```

Send:

```json
{ "type": "subscribe", "symbols": ["XAUUSD"] }
```

Record:

```text
status feed_auth_required:
status upstream_connected:
tick received: yes/no
tick symbol:
tick bid:
tick ask:
tick timestamp field:
```

## Evidence To Return To The Frontend Team

Return a short backend report with these exact sections.

```text
1. REST history route evidence
2. Auth behavior evidence
3. Response shape sample
4. Timestamp unit evidence
5. OHLC validation evidence
6. Pagination evidence
7. /ws/feed/status evidence
8. /ws/feed quote evidence
9. /ws/v2 candle channel evidence
10. Known backend gaps or fixes made
```

For samples, redact:

```text
Authorization
access_token
refresh_token
token query param
feed token
broker feed token
HISTORY_API_KEY
account password
server credentials
database URLs
provider secrets
```

## Acceptance Criteria

Backend work is complete only when all of these are true:

1. `GET /api/v2/candles/{symbol}?timeframe=M1&limit=500` works for an authenticated selected broker account.
2. Response uses a frontend-safe wrapper with `symbol`, `timeframe`, and `candles`.
3. Candle `time` values are Unix seconds bucket starts.
4. `from` and `to` request params are accepted as Unix seconds.
5. REST timeframe labels are canonical: `M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D1`, `W1`, `MN`.
6. Monthly is returned as `MN`, not only `MN1`.
7. Every emitted candle has valid finite OHLC.
8. Backend does not send impossible OHLC and expect frontend to repair it.
9. Valid large wick candles remain valid and renderable.
10. Auth failures return clear `401/403`, not silent empty candles.
11. Valid no-history returns `200` with `candles: []`.
12. Pagination with Unix-second `to` returns older data when older data exists.
13. `/history/candles/{symbol}` and `HISTORY_API_KEY` remain backend/internal and are not needed by mobile frontend.
14. `/ws/feed` is live quote/feed only, not required for REST history bootstrap.
15. `/ws/feed/status` is status/freshness only, not treated as proof of history.
16. `/ws/v2` candle channels are separate from `/ws/feed` quote subscriptions.
17. Backend returns redacted proof logs and test results.
18. With valid non-empty REST history, the mobile chart renders candles and does not show missing history.

## Quick Failure Decoder

Use this when the frontend still shows missing history.

### Symptom: REST response has candles but chart still empty

Backend should check:

- Are candle times Unix seconds?
- Are candle times positive?
- Is OHLC valid?
- Is the response wrapper discoverable as `candles`?
- Is the route returning the selected broker account data?
- Are symbols/timeframes matching the request?
- Are all candles unaligned to bucket boundaries?

### Symptom: Backend logs show history exists but mobile gets empty

Backend should check:

- Is gateway calling internal history correctly?
- Is auth context mapped to the correct broker/account?
- Is gateway route using path symbol, not missing symbol?
- Is timeframe normalized from `M1` to backend storage format correctly?
- Is `from/to` conversion accidentally treating seconds as milliseconds?

### Symptom: Initial page works but left-scroll history missing

Backend should check:

- Is the `to` cursor parsed as seconds?
- Does `to` pagination return older candles?
- Does the query repeatedly return the latest page?
- Does backend require `from` even when frontend sends only `to`?
- Is backend excluding the requested cursor in a way that returns no rows?

### Symptom: Candle disappears after frontend normalization

Backend should check:

- `high < open`
- `high < close`
- `high < low`
- `low > open`
- `low > close`
- `low > high`
- non-finite string values such as `"NaN"`
- zero or negative timestamp
- timestamp in an unsupported date format

### Symptom: Live price moves but history is missing

Backend should check:

- `/ws/feed` may be healthy, but REST history route may still be failing.
- `/ws/feed/status` freshness does not prove REST history exists.
- `/ws/feed subscribe_candles` is not the frontend history source.

### Symptom: History renders but live candle rewinds or jumps backward

Backend should check:

- Candle bucket `time` must stay the bucket start.
- Server update time should be separate, for example `server_time`.
- Delayed live candle updates should carry an ordering timestamp so frontend can ignore stale replacements.

## Non-Goals

Do not ask the frontend to:

- Use `HISTORY_API_KEY`.
- Call direct internal `/history/candles/{symbol}`.
- Treat `/ws/feed/status` as history.
- Wait for `/ws/feed subscribe_candles` before rendering REST history.
- Repair impossible backend OHLC.
- Hide backend errors behind generic missing-history UI.
- Store backend-only secrets in Expo env files.

## Current Frontend Verification Already Passed

The frontend implementation was verified with:

```text
npx --yes tsx --test src/domain/candles/api/candles.test.ts src/api/feedAuth.test.ts src/api/ws/quoteTimestamp.test.ts src/api/ws/quoteTickNormalizer.test.ts src/api/ws/quotesSocket/tickProcessor.test.ts src/domain/candles/ws/liveCandlesEnginePolicy.test.ts src/domain/candles/ws/candlesSocket.test.ts
```

Result:

```text
64 passed
```

Chart/WebView contract verification:

```text
npx --yes tsx --test src/features/chart/chartWebViewBridgeContract.test.ts tests/chart-webview/candle-regression-contracts.test.ts tests/chart-webview/chart-candle-diagnostics.test.ts tests/candle-engine/live-quote-feed-path.test.ts tests/chart-webview/chart-bridge-update-mode.test.ts
```

Result:

```text
81 passed
```

TypeScript verification:

```text
npm run typecheck
```

Result:

```text
passed
```

Backend should now validate the contract from its side and return the evidence listed above.
