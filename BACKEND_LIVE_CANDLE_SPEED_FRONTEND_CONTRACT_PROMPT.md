# Backend Prompt: RTX5 Live Candle Speed And Active Chart Frontend Contract

Use this whole file as the backend-facing implementation and verification prompt.

This prompt explains what the RTX5 mobile frontend now implements for fast live candles, what the backend must provide, how the frontend consumes REST history, quote ticks, optional server candle streams, and diagnostics, and what evidence the backend should return so frontend-vs-backend latency can be separated clearly.

Frontend repo:

```text
C:\Users\ADMIN\RTX-5Mobile-App\rtx5-app
```

Related backend repo from the supplied backend prompt:

```text
C:\Users\Administrator\Desktop\ORRNN BACKEND\ORRNN-RTX5-Broker-Backend
```

This is a backend handoff. Do not ask the mobile frontend to expose backend-only secrets. Do not ask the frontend to use direct `/history/*` routes. Do not put `HISTORY_API_KEY`, provider credentials, broker manager secrets, database URLs, raw feed tokens, or full tokenized WebSocket URLs in mobile frontend code, tests, logs, screenshots, or committed docs.

## Role

You are the broker/backend implementation and verification agent.

Your job is to verify that backend quote ticks, candle history, optional candle streams, and diagnostics match the frontend contract described here.

The RTX5 mobile frontend has already implemented the main live candle speed requirements:

- REST candle bootstrap uses selected broker gateway `/api/v2` candle routes.
- Quote ticks from `/ws/feed` drive the active chart candle through an event-driven path.
- The active candle stream flushes at most once per animation frame, with a 16 ms timer fallback.
- Sub-frame tick bursts preserve high, low, close, and tick-volume contribution before the next chart update.
- The default visible active candle source is quote-driven and bid-first.
- Server candle streams are optional corrections, not the default visible source.
- Stale non-closing server candles cannot overwrite a fresher quote-driven active candle.
- The chart bridge uses incremental `updateTick` for live active candle movement.
- Debug diagnostics can separate feed receipt, stream merge, and chart bridge injection.

## Target Outcome

When backend quotes are flowing quickly:

1. The frontend receives each valid quote tick.
2. The frontend immediately pushes that tick into the live candle stream before the quote store frame flush.
3. The live candle stream queues each tick event, sorts by event time and sequence order, and flushes once on the next animation frame.
4. Every tick in the burst contributes to the current active candle.
5. The chart receives one incremental update for the latest active candle after the batch.
6. The backend can prove whether any remaining visible delay is feed/provider latency, websocket delivery latency, frontend candle aggregation latency, or chart rendering latency.

## Short Backend Summary

The frontend no longer depends on a fixed 100 ms active candle poll.

The frontend live candle path is:

```text
/ws/feed quote tick
  -> quote tick normalizer
  -> per-symbol quote listeners
  -> liveCandleStream.extendActiveCandlesFromQuoteTick(...)
  -> LiveCandleStreamManager pendingEvents
  -> requestAnimationFrame or 16 ms fallback flush
  -> quote-driven bid-first active candle update
  -> ChartScreen sanitizedCandles
  -> WebView updateTick(...)
```

REST history remains separate:

```text
selected broker /api/v2/candles/{symbol}
  -> normalize/sort/dedupe/validate
  -> chart bootstrap/full reload
```

Optional server candle streams remain separate:

```text
/ws/v2 candles.SYMBOL.TF
  -> only enabled when server candle mode is explicitly requested and proven compatible
  -> cannot overwrite fresher quote-driven active state with stale non-closing data
```

## Current Frontend Implementation Map

### 1. Quote WebSocket Entry Point

Frontend files:

```text
rtx5-app/src/api/ws/quotesSocket/QuotesWebSocketService.ts
rtx5-app/src/api/ws/quotesSocket/tickProcessor.ts
rtx5-app/src/api/ws/quoteTickNormalizer.ts
rtx5-app/src/api/ws/quoteTimestamp.ts
rtx5-app/src/api/feedAuth.ts
```

What the frontend does:

- Builds broker-hosted quote feed URLs from the selected broker service domain.
- Uses `/ws/feed` for live quote ticks.
- Appends `broker_id`.
- Appends `token` when a feed token exists.
- Redacts token query values in feed-auth helpers.
- Parses raw quote objects and common envelopes/batches.
- Normalizes symbol aliases and broker suffixes.
- Normalizes timestamp seconds/milliseconds.
- Rejects non-finite bid/ask values before they reach candles.
- Emits quote ticks to global and per-symbol listeners synchronously.
- Extends the active candle from each valid quote tick before the quote store frame flush.

The important active-candle call now sends a per-tick contribution:

```ts
liveCandleStream.extendActiveCandlesFromQuoteTick(normalizedUpdate.symbol, {
  price: tickPriceForCandle,
  time: liveListenerTimestamp,
  volume: 1,
});
```

The default candle price is bid-first:

```text
use bid when bid is finite
fallback to ask only if bid is not finite
```

Backend implication:

- Send finite positive bid/ask.
- Send a useful server/feed timestamp.
- Do not rely on the frontend quote store flush for candle speed; the candle path receives the tick before the store flush.

### 2. Legacy Prices WebSocket Bridge

Frontend file:

```text
rtx5-app/src/api/ws/socket.ts
```

This older `/ws` prices channel can also forward quote prices into the live candle stream. It now also passes:

```ts
volume: 1
```

Backend implication:

- If an older gateway path still emits `prices` or `quotes.*` channel messages, it gets the same tick contribution behavior.
- This path is not the main broker-hosted `/ws/feed` path, but it remains consistent.

### 3. Live Candle Stream Manager

Frontend files:

```text
rtx5-app/src/domain/candles/stream/liveCandleStream/manager.ts
rtx5-app/src/domain/candles/stream/liveCandleStream/types.ts
rtx5-app/src/domain/candles/stream/liveCandleStream/helpers.ts
```

What the frontend does:

- Keeps one stream entry per normalized symbol/timeframe.
- Subscribes UI consumers by normalized symbol/timeframe key.
- Fetches REST history for the baseline.
- Buffers live events while history is loading.
- Queues live quote tick events in `pendingEvents`.
- Sorts live events by event time and insertion order before applying them.
- Flushes pending events through `requestAnimationFrame` when available.
- Falls back to a 16 ms timer when `requestAnimationFrame` is unavailable.
- Commits one updated candle series per flush.
- Notifies subscribers only when the materialized candle series actually changes.
- Disposes stream state and cancels pending frame/timer work when the last consumer unsubscribes.

Important constants:

```text
FLUSH_INTERVAL_MS = 16
MAX_BUFFERED_LIVE_EVENTS = 4096
```

Backend implication:

- Bursty tick delivery is fine.
- The frontend intentionally coalesces rendering to one frame, but it does not collapse candle aggregation to only the latest tick.
- If backend sends five ticks inside one animation frame, all five can contribute to active candle high/low/close/tick volume before one chart update.

### 4. Quote-Driven Active Candle Aggregation

Frontend file:

```text
rtx5-app/src/domain/candles/series/liveCandleAggregator.ts
```

Current quote tick aggregation behavior:

- Validates price and timestamp.
- Normalizes timestamp to Unix seconds.
- Computes bucket start from the active timeframe.
- Rejects ticks older than closed REST history.
- Rejects ticks older than the live tail.
- Opens the current tick bucket when the candle backend is stale.
- Does not fabricate missing buckets.
- Seeds from the REST tail when the tick belongs to the REST tail bucket and price is coherent.
- Seeds from previous candle close for the expected next bucket when coherent.
- Uses the first tick price as open for a new quote-only bucket.
- Widens `high` with every tick.
- Widens `low` with every tick.
- Sets `close` from the latest tick.
- Adds per-tick `volume` contribution, defaulting to `1`.
- Marks the candle as `source: live_candle` and `closed: false`.
- Tracks `lastQuoteTime` so stale server candle updates can be detected.

Sub-frame burst contract:

If the backend sends these five ticks in the same M1 bucket before the next frame:

```text
1.0800
1.0818
1.0794
1.0811
1.0807
```

The frontend active candle becomes:

```json
{
  "open": 1.0800,
  "high": 1.0818,
  "low": 1.0794,
  "close": 1.0807,
  "volume": 5
}
```

Backend implication:

- The frontend can preserve tick burst OHLC if every tick reaches the quote socket.
- If high/low is still missing after this implementation, backend should check whether ticks were dropped or coalesced before reaching `/ws/feed`.

### 5. Optional Server Candle Correction Rules

Frontend files:

```text
rtx5-app/src/domain/candles/ws/liveCandlesEnginePolicy.ts
rtx5-app/src/domain/candles/series/liveCandleAggregator.ts
rtx5-app/src/api/ws/quotesSocket/tickProcessor.ts
```

Default mode:

```text
quote-driven active candles
```

Server candle mode is disabled unless both conditions are true:

```text
EXPO_PUBLIC_CANDLE_SOURCE_MODE=server
EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE=true
```

or equivalent explicit enablement plus proof flag.

Backend candle payloads found inside quote feed envelopes are ignored unless server mode is proven:

```text
feed_candle_update_ignored_unverified
reason: server_candle_source_disabled
```

When server candle mode is enabled:

- Symbol must match.
- Timeframe must match.
- OHLC must be valid.
- Candle bucket time stays separate from backend update time.
- Backend `server_time`, `serverTime`, `updated_at`, or similar update fields are preserved as ordering time.
- A non-closing server candle with an older update time than `lastQuoteTime` is ignored.
- Closing server candles may finalize the matching bucket if valid.
- Backend live snapshots cannot reopen a live candle already marked closed.
- Backend snapshots older than closed REST history are ignored.

New stale server protection:

```text
reason: stale_server_candle_after_quote
```

Backend implication:

- If `/ws/v2` or `/ws/feed subscribe_candles` is slower than `/ws/feed` quote ticks, stale non-closing candle payloads will not overwrite the visible active candle.
- To use server candles as authoritative corrections, backend must provide fresh update timestamps and compatible bucket semantics.

### 6. REST Candle Bootstrap Remains Separate

Frontend files:

```text
rtx5-app/src/domain/candles/api/candles.ts
rtx5-app/src/domain/candles/api/candleHistoryQuery.ts
rtx5-app/src/domain/candles/normalization/candleNormalizer.ts
rtx5-app/src/domain/candles/normalization/chartAdapter.ts
```

The frontend uses selected broker gateway REST for history:

```text
GET /api/v2/candles/{symbol}?timeframe=M1&limit=...
GET /api/v2/candles/{symbol}?tf=M1&count=...
GET /api/v2/market-data/candles/{symbol}?timeframe=M1&limit=...
```

The frontend does not use direct internal history routes:

```text
/history/candles/{symbol}
```

The frontend does not use:

```text
HISTORY_API_KEY
```

REST request behavior:

- Symbol is normalized and URL encoded in the path.
- Timeframe aliases are normalized to REST labels.
- `from` and `to` are normalized to Unix seconds.
- REST errors surface to chart state when no candles are available.

REST response behavior:

- Parses `{symbol,timeframe,candles}`.
- Parses common wrappers like `{data:{candles}}`.
- Sorts ascending by time.
- Dedupes by bucket time.
- Rejects impossible OHLC.
- Preserves valid large wicks.

Backend implication:

- Live speed must not be measured from REST history.
- REST history is bootstrap and pagination, not the live active candle path.

### 7. Chart Bridge Rendering

Frontend files:

```text
rtx5-app/src/features/chart/ChartScreen.native.tsx
rtx5-app/src/features/chart/ChartScreen.web.tsx
rtx5-app/src/features/chart/liveChartSync.ts
rtx5-app/src/features/chart/rendering/ChartWebViewHtml.ts
```

What the frontend does:

- Builds a chart series snapshot from sanitized candles.
- Uses full `updateChartData` only for bootstrap, symbol/timeframe changes, replacement, prepends, or structural changes.
- Uses incremental `updateTick` when only the active candle changes or one new candle appends cleanly.
- WebView `updateTick` is itself scheduled on `requestAnimationFrame`.
- Quote-only price updates move market price lines without mutating candle OHLC through a second path.
- The active candle body is fed by the canonical candle stream, not a separate chart-local polling loop.

Backend implication:

- If `/ws/feed` ticks are fast and frontend candle aggregation is fast, visible chart movement should be limited mostly by frame cadence.
- If the chart still feels slow, capture feed tick time, frontend receive time, candle stream commit time, and bridge `updateTick` time.

## Backend Contract To Preserve

### A. `/ws/feed` Quote Contract

Frontend expects quote subscribe:

```json
{ "type": "subscribe", "symbols": ["XAUUSD"] }
```

Accepted tick shapes:

```json
{
  "symbol": "XAUUSD",
  "bid": 2340.1,
  "ask": 2340.3,
  "time": 1780000000,
  "timestamp": 1780000000123,
  "time_ms": 1780000000123,
  "timestamp_ms": 1780000000123,
  "tick_id": "example",
  "source_seq": "100"
}
```

Batch shape:

```json
{
  "type": "ticks",
  "ticks": [
    {
      "symbol": "XAUUSD",
      "bid": 2340.1,
      "ask": 2340.3,
      "time": 1780000000
    }
  ]
}
```

Backend should send:

- normalized symbol
- finite positive bid
- finite positive ask where available
- server/feed timestamp
- optional sequence id
- optional tick id
- optional digits, point, tickSize metadata

Timestamp priority in the frontend:

```text
explicit millisecond fields -> millisecond timestamp
timestamp -> seconds or milliseconds depending on scale
time -> seconds unless clearly millisecond scale
receivedAt fallback -> diagnostics and last resort
```

### B. `/ws/feed/status` Diagnostics Contract

Frontend/backend should use:

```text
GET /ws/feed/status?broker_id={brokerId}
```

Use it to diagnose:

- `feed_auth_required`
- `upstream_connected`
- provider connected state
- symbol freshness
- last tick age
- silent symbols
- cServer backpressure
- coalesced ticks
- dropped ticks
- client backpressure

Do not use `/ws/feed/status` as:

- candle history proof
- REST history route
- active chart candle source

### C. `/ws/v2` Candle Channel Contract

Frontend optional server candle path:

```text
wss://{broker-service-domain}/ws/v2?broker_id={brokerId}
```

Channel format:

```text
candles.{SYMBOL}.{WS_TF}
```

Examples:

```text
candles.XAUUSD.1m
candles.EURUSD.1h
```

Timeframe mapping:

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

Server candle payload must provide:

- symbol or channel context
- timeframe or channel context
- candle `time` as Unix-second bucket start
- valid finite OHLC
- optional `closed`
- optional backend update time as `server_time`, `serverTime`, `updated_at`, or similar

Important:

Do not send backend event time as candle bucket `time`. Use separate update fields.

### D. REST History Contract

REST history routes:

```text
GET /api/v2/candles/{symbol}
GET /api/v2/market-data/candles/{symbol}
```

Supported query forms:

```text
?timeframe=M1&limit=500
?tf=M1&count=500
?timeframe=M1&limit=500&from=1775738200&to=1775738800
```

Response:

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

Backend must not require mobile frontend to call:

```text
/history/*
```

Backend must not require mobile frontend to know:

```text
HISTORY_API_KEY
```

## Backend Latency Diagnostic Plan

Run this plan before blaming frontend or backend.

### 1. Measure Feed Production

For selected broker and symbol:

```text
GET /ws/feed/status?broker_id={brokerId}
```

Record:

```text
broker_id:
symbol:
feed_auth_required:
upstream_connected:
provider_connected:
last_tick_age_sec:
silent_symbols_count:
cserver pending depth:
cserver coalesced count:
cserver dropped count:
direct client dropped count:
```

If feed status shows stale or silent symbol, the backend/provider path is the first suspect.

### 2. Measure Direct `/ws/feed`

Connect directly:

```text
wss://{broker-service-domain}/ws/feed?broker_id={brokerId}
wss://{broker-service-domain}/ws/feed?broker_id={brokerId}&token={REDACTED_IF_REQUIRED}
```

Subscribe:

```json
{ "type": "subscribe", "symbols": ["XAUUSD"] }
```

Record for at least 30 seconds:

```text
tick count:
first tick timestamp:
last tick timestamp:
average inter-arrival ms:
p95 inter-arrival ms:
max gap ms:
out-of-order count:
duplicate sequence count:
missing bid/ask count:
non-finite bid/ask count:
```

If direct `/ws/feed` has large gaps, the frontend cannot make live candles faster than the feed.

### 3. Measure Mobile Frontend Debug Points

Enable only redacted/debug-safe flags:

```text
EXPO_PUBLIC_DEBUG_CANDLE_FEED=true
EXPO_PUBLIC_DEBUG_CANDLE_STREAM=true
EXPO_PUBLIC_DEBUG_CHART_BRIDGE=true
```

Use these frontend logs:

```text
[CANDLE-FEED] tick_emitted_to_quote_listeners
[CANDLE-STREAM] history_request
[CANDLE-STREAM] history_success
[CANDLE-STREAM] history_failure
[CHART-CANDLES]
[CHART-BRIDGE] candle_sync_mode
[CHART-BRIDGE] inject_updateTick
[CHART-BRIDGE] inject_updateChartData
[WEBVIEW-CANDLE] updateChartData
```

Interpretation:

```text
feed tick timestamp -> frontend receivedAt = websocket delivery latency
frontend receivedAt -> CANDLE-STREAM commit/update = frontend candle aggregation latency
CANDLE-STREAM update -> CHART-BRIDGE inject_updateTick = React/bridge scheduling latency
inject_updateTick -> WebView updateTick = WebView rendering latency
```

The frontend feed log is rate-limited and redacted. It does not log token query values.

### 4. Compare Server Candles Separately

If testing `/ws/v2`:

- Compare direct `/ws/feed` quote tick timing with `/ws/v2` candle timing.
- Direct quote ticks are expected to be faster.
- `/ws/v2` candle snapshots may be slower and should not be treated as the default active candle source unless proven compatible.

If `/ws/feed` quote ticks are fast but `/ws/v2` candles are delayed, that is a server candle relay/gateway/NATS issue, not a quote-driven active chart issue.

## Backend Implementation Requirements

### 1. Keep Quote Feed Low Latency

Backend should:

- Accept fresh upstream ticks immediately.
- Broadcast quote ticks to `/ws/feed` clients without waiting for candle timers.
- Avoid fixed 100 ms batching for the broker-facing quote path unless explicitly documented.
- Expose coalescing/drop counters in `/ws/feed/status`.
- Include enough timestamp/sequence fields to diagnose order and delay.

### 2. Keep Candle Aggregation Bid-Based Or Declare Price Basis

The frontend default visible active candle is bid-first.

Backend should:

- Use bid for bridge live candle OHLC if claiming parity with the frontend default.
- Return `priceBasis: "bid"` in REST history when history is bid-based.
- If backend uses ask/mid/last for any candle path, declare it explicitly.
- Do not mix bid REST history with mid live candles without a `priceBasis` marker.

### 3. Keep Server Candle Updates Fresh And Ordered

If backend wants `/ws/v2` server candles to be used as corrections:

- Include candle bucket `time`.
- Include backend update time, for example `server_time`.
- Include `closed` when final.
- Keep OHLC valid.
- Send symbol/timeframe context.
- Do not send stale forming snapshots after newer quote ticks unless they are closing corrections.

### 4. Keep REST History Correct

Backend should keep the REST history route independent from live candle speed:

- Authenticated selected-broker gateway route.
- Canonical wrapper.
- Unix-second bucket times.
- Canonical REST timeframes.
- Valid OHLC.
- Clear auth/storage errors.
- Unix-second pagination.

### 5. Keep Secrets Server-Side

Do not ask frontend to use:

- FIX credentials
- cServer credentials
- MT5 Manager credentials
- NATS credentials
- Redis/Dragonfly credentials
- database credentials
- provider websocket credentials
- `HISTORY_API_KEY`

Frontend consumes only selected-broker HTTPS/WSS JSON.

## Backend Tests To Add Or Prove

### Quote Feed Tests

- `/ws/feed` accepts `{type:"subscribe",symbols:["XAUUSD"]}`.
- Every accepted upstream tick is eligible for quote broadcast.
- Tick payload includes symbol, bid, ask, timestamp.
- Tick timestamps are monotonic or sequence fields explain ordering.
- Non-finite bid/ask is rejected or not emitted.
- Status endpoint exposes stale/silent/backpressure counters.

### Live Candle Source Tests

- Bridge candle aggregator uses bid price when claiming frontend parity.
- Direct bridge candles include bucket `time`, not event time.
- Direct bridge candles include server update time separately.
- `closed=true` is sent when the bar finalizes.
- Valid forming candle updates never have impossible OHLC.

### REST History Tests

- `/api/v2/candles/{symbol}?timeframe=M1&limit=500` returns frontend-safe wrapper.
- `/api/v2/candles/{symbol}?tf=M1&count=500` works or the supported route is documented.
- `/api/v2/market-data/candles/{symbol}?timeframe=M1&limit=500` works or the supported route is documented.
- `from` and `to` are Unix seconds.
- Monthly timeframe is canonical `MN`.
- No route requires frontend `HISTORY_API_KEY`.

### Latency Tests

- Direct `/ws/feed` tick inter-arrival stats for high-frequency symbols.
- `/ws/feed/status` counters match observed drops/coalescing.
- Direct `/ws/feed` quote ticks are compared against `/ws/v2` candle updates.
- Backend can identify whether delay is provider ingress, bridge broadcast, gateway relay, or frontend.

## Frontend Tests Already Covering This Contract

The frontend has focused tests for:

- quote tick timestamp parsing
- quote tick normalization
- quote tick processor source contract
- quote store rAF/16 ms flush
- live candle source policy
- live candle burst OHLC and volume preservation
- stale server candle protection
- `/ws/v2` candle routing
- REST candle history route/query normalization
- chart incremental `updateTick` mode
- WebView candle rendering contracts

Commands used after the speed implementation:

```text
npx --yes tsx --test src/domain/candles/series/liveCandleAggregator.test.ts src/api/ws/quotesSocket/tickProcessor.test.ts src/domain/candles/ws/liveCandlesEnginePolicy.test.ts src/features/chart/liveChartSync.test.ts src/api/ws/quoteTimestamp.test.ts src/api/ws/quoteTickNormalizer.test.ts src/api/ws/quotesSocket/flushPipeline.test.ts
```

Result:

```text
58 passed
```

Broader candle/feed verification:

```text
npx --yes tsx --test src/domain/candles/api/candles.test.ts src/api/feedAuth.test.ts src/api/ws/quoteTimestamp.test.ts src/api/ws/quoteTickNormalizer.test.ts src/api/ws/quotesSocket/tickProcessor.test.ts src/domain/candles/ws/liveCandlesEnginePolicy.test.ts src/domain/candles/ws/candlesSocket.test.ts src/domain/candles/series/liveCandleAggregator.test.ts
```

Result:

```text
73 passed
```

Chart/WebView verification:

```text
npx --yes tsx --test src/features/chart/chartWebViewBridgeContract.test.ts tests/chart-webview/candle-regression-contracts.test.ts tests/chart-webview/chart-candle-diagnostics.test.ts tests/candle-engine/live-quote-feed-path.test.ts tests/chart-webview/chart-bridge-update-mode.test.ts src/features/chart/liveChartSync.test.ts
```

Result:

```text
93 passed
```

## Manual Acceptance Checklist

Backend should return this evidence after testing a real broker/symbol/timeframe.

### Feed Status

```text
broker_id:
symbol:
feed_auth_required:
upstream_connected:
provider_connected:
last_tick_age_sec:
silent_symbols_count:
backpressure/coalescing counters:
```

### Direct Quote Feed

```text
websocket URL without token:
token present: true/false
subscribe payload:
tick count over 30s:
average inter-arrival ms:
p95 inter-arrival ms:
max gap ms:
invalid bid/ask count:
out-of-order count:
```

### Frontend Diagnostic Correlation

```text
first feed tick timestamp:
frontend receivedAt:
frontend candle stream update:
chart bridge inject_updateTick:
observed chart movement:
```

### REST Baseline

```text
REST route:
HTTP status:
response wrapper:
raw candle count:
normalized candle count:
oldest time:
newest time:
invalid OHLC count:
```

### Server Candle Stream, If Tested

```text
/ws/v2 channel:
first candle time:
first server_time/update time:
closed flag behavior:
delay vs direct /ws/feed:
price basis:
```

## Acceptance Criteria

Backend/frontend live candle speed work is complete only when all of these are true:

1. `/ws/feed` quote ticks arrive at the frontend with low and measurable latency.
2. Tick payloads include valid symbol, bid, ask, and timestamp fields.
3. Direct `/ws/feed` probes show whether provider/backend tick delivery is fast or slow.
4. `/ws/feed/status` exposes enough freshness/backpressure data to diagnose provider/backend issues.
5. Frontend quote-driven active candles are bid-first by default.
6. Every received tick contributes to active candle OHLC and tick volume before the next frame.
7. Frontend active candle render is frame-driven, not a fixed 100 ms poll.
8. Live chart updates use incremental `updateTick` for active candle changes.
9. Server candle streams are not default unless explicitly enabled and proven compatible.
10. Stale non-closing server candles cannot overwrite fresher quote-driven active candles.
11. REST history remains on selected broker `/api/v2/candles/{symbol}` style routes.
12. No frontend code path uses direct `/history/*` or `HISTORY_API_KEY`.
13. Timeframes are normalized at IO boundaries.
14. Backend returns redacted diagnostics that can separate provider/feed delay from frontend aggregation/render delay.

## Quick Failure Decoder

### The chart still feels slow, but direct `/ws/feed` is slow

Backend/provider path is the first suspect. Check upstream provider, cServer, backpressure, coalescing, dropped ticks, and broker feed relay.

### Direct `/ws/feed` is fast, but frontend logs show late `tick_emitted_to_quote_listeners`

Check websocket delivery, auth path, network, message shape, tick normalizer rejection, and symbol mismatch.

### `tick_emitted_to_quote_listeners` is fast, but `inject_updateTick` is delayed

Check frontend candle stream scheduling, React render pressure, chart route focus state, and WebView bridge state.

### `inject_updateTick` is fast, but visual chart moves late

Check WebView performance, active gestures, chart initialization state, and WebView `updateTick` timing.

### High/low is missing from bursts

Check whether backend actually delivered each tick to `/ws/feed`. The frontend now preserves each received tick's contribution before frame render.

### Server candles overwrite quote movement

Check if server candle mode was explicitly enabled. If it was, ensure server candle update timestamps are fresh and compatible. Non-closing stale server candles should be ignored by the frontend.

### Live quotes move but REST history is missing

Do not debug this as live speed. Check `/api/v2/candles/{symbol}` auth, wrapper, timeframe, timestamp units, and OHLC validity.

## Non-Goals

Do not require the frontend to:

- connect directly to provider websockets
- connect to cServer
- connect to FIX
- connect to MT5 Manager
- connect to NATS
- connect to Redis/Dragonfly
- connect to databases
- use backend API keys
- use direct `/history/*`
- wait for `/ws/v2` candle snapshots before rendering quote-driven active candles
- repair impossible backend OHLC

## Final Backend Deliverable Format

Return a report with these exact headings:

```text
1. Quote feed health
2. Direct /ws/feed tick timing
3. REST candle history evidence
4. Optional /ws/v2 candle timing
5. Price basis confirmation
6. Timestamp and ordering evidence
7. Backpressure/drop/coalescing counters
8. Frontend diagnostic correlation
9. Backend fixes made
10. Remaining risks or required frontend evidence
```

Redact all secrets. Include enough timing and payload shape evidence that the frontend team can reproduce the conclusion without guessing.
