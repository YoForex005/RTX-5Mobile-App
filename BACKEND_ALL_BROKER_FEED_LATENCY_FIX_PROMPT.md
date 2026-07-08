# Backend Prompt: All-Broker Feed Latency, Candle Contract, And Frontend Fix Decision

Use this prompt for the backend team or backend AI agent. The goal is not only to say "backend is fast" or "frontend is slow". The goal is to prove, broker by broker and symbol by symbol, where the delay starts, whether the payload contract is clean, and exactly what the mobile frontend should change only if backend evidence requires it.

## Main Objective

Audit and fix the backend live quote/candle feed for the RTX5 mobile app across all brokers.

We need a precise answer to this question:

> The backend says candle/feed data is coming fast. The mobile UI already uses a frame-based incremental chart path. Is the backend feed contract truly real-time, ordered, and compatible with the frontend, or does the frontend need a specific mapping/configuration change?

Return proof, not assumptions.

## Important Frontend Context

The RTX5 mobile frontend should not render every raw WebSocket packet directly. It follows the same general pattern used by MT5/TradingView-style charts:

```text
broker/source feed
  -> backend quote/candle websocket
  -> frontend candle engine
  -> merge/order/validate latest active candle
  -> React Native bridge
  -> WebView updateTick
  -> chart paints on animation frame
```

Frontend code has already been checked for excessive candle-body throttling:

- Candle stream flush is frame-based, with a 16ms fallback.
- Active candle changes are sent to WebView using incremental `updateTick(...)`, not full `setData(...)`.
- WebView coalesces pending ticks and paints on `requestAnimationFrame`.
- A 100ms sync interval exists for the live price guide line only, not for candle body updates.
- Server candle stream is not enabled by default. The safe default is quote-driven active candles until backend server candles are proven compatible.

Therefore, do not simply recommend "send raw websocket candle data directly to UI". That is not the desired architecture.

## Frontend Current Contract

The frontend can support two modes:

### Mode A: Quote-driven active candles, current safe default

This mode is preferred unless backend server candles are fully proven compatible.

Required backend behavior:

- Quote WebSocket must send fresh bid/ask/last updates.
- Quote timestamps must be current and monotonic enough for active candle building.
- Quote payloads must include symbol identity consistently.
- The feed must not go silent while backend status claims it is live.

Frontend builds the active candle from quote ticks:

```text
quote tick -> active candle open/high/low/close update -> updateTick -> chart
```

### Mode B: Server-candle-driven active candles, only if proven

This mode should be enabled only if backend confirms all compatibility requirements:

- Live candle snapshots update the same current forming candle, not only bar-close.
- Candle `time` is always the candle bucket start time, in Unix seconds.
- Candle update ordering uses a separate event/update timestamp such as `server_time`.
- Delayed snapshots never rewind newer active candle state.
- Symbol and timeframe fields exactly match frontend subscriptions.
- OHLC values are structurally valid.
- Reconnect/replay does not send stale active candle updates after fresh updates.

If any of the above is not true, tell frontend to keep quote-driven active candles.

## Backend Investigation Scope

Check every production-supported broker/feed, not only one symbol.

At minimum, include:

- Broker id
- Broker display name
- Broker service/domain used by mobile app
- Quote WebSocket origin
- Candle WebSocket origin, if separate
- REST candle endpoint origin
- Feed auth requirement
- Whether feed token is required, optional, or unavailable
- Whether broker feed is direct, proxied, or aggregated
- Symbols tested
- Timeframes tested

Test at least these symbol types where available:

- Major forex symbol, for example `EURUSD`
- Metal, for example `XAUUSD`
- Crypto, for example `BTCUSD`
- Index, if broker supports it
- Any broker-specific symbol suffix/prefix variant

Test at least these timeframes:

- `M1`
- `M5`
- `M15`
- `H1`

## Required Status Endpoint Audit

For each broker, check the backend feed status endpoint or equivalent internal status source.

Expected endpoint pattern:

```text
GET /ws/feed/status?broker_id=<broker_id>
```

Return the exact status fields and values, including:

- `broker_id`
- `feed_auth_required`
- `upstream_connected`
- `provider_connected`
- `cserver_connected`
- `last_tick_age_sec`
- `last_candle_age_sec`, if available
- `silent_symbols_count`
- `provider_symbols_streaming`
- per-symbol freshness
- per-symbol subscription status
- connection uptime
- reconnect count
- last backend receive time
- last app broadcast time
- error/reject reason, if any

If the current status endpoint does not expose these fields, add them or provide equivalent internal logs.

## Quote WebSocket Latency Audit

For each tested broker and symbol, measure quote latency at each stage.

Required timestamps:

```text
source_tick_time
backend_received_time
backend_normalized_time
backend_broadcast_time
frontend_received_time, if backend can help correlate
```

Return:

- sample count
- min latency
- average latency
- p50
- p95
- p99
- max latency
- lost/dropped packet count
- duplicate packet count
- out-of-order packet count
- reconnect count during test

Use a test window of at least 2 minutes per broker/symbol.

Required quote payload proof:

Return 5 to 10 raw quote payload examples per symbol, redacting secrets only.

Each quote payload must make these fields clear:

- symbol
- bid
- ask
- last, if available
- timestamp/server_time
- broker_id or feed id
- digits/precision, if available
- point/tickSize, if available
- volume, if available
- source/provider sequence id, if available

## Candle WebSocket Latency Audit

For each tested broker, symbol, and timeframe, measure candle latency at each stage.

Required timestamps:

```text
source_candle_update_time
backend_received_time
backend_normalized_time
backend_broadcast_time
```

Also prove the candle cadence:

- Does backend send live candle updates on every tick?
- Does backend send live candle updates every N milliseconds/seconds?
- Does backend send only on bar close?
- Does backend send a mix of current forming candle plus bar-close candle?
- Does backend replay the current active candle on reconnect?

Return:

- sample count
- average update interval
- p95 update interval
- p99 update interval
- max gap between candle updates
- stale/replayed candle count
- out-of-order candle count
- duplicate candle count
- invalid OHLC count
- missing timeframe count
- missing symbol count

Required candle payload proof:

Return 5 to 10 raw candle payload examples per symbol/timeframe, redacting secrets only.

Each candle payload must make these fields clear:

- symbol
- timeframe
- `time` as bucket start time in Unix seconds
- `server_time` or equivalent update event timestamp
- open
- high
- low
- close
- volume, if available
- closed/final flag, if available
- source/provider sequence id, if available

## Candle Payload Contract Required By Frontend

Confirm whether backend can guarantee this exact contract:

```json
{
  "type": "candle",
  "broker_id": "example-broker",
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "time": 1760000000,
  "server_time": 1760000034,
  "open": 2360.12,
  "high": 2361.20,
  "low": 2359.80,
  "close": 2360.95,
  "volume": 42,
  "closed": false
}
```

Field requirements:

- `time` must be candle bucket start, not update event time.
- `server_time` must be the real update event time or source receive time.
- `server_time` must be monotonic for the same broker/symbol/timeframe stream, or a sequence id must be provided.
- OHLC must be valid:
  - high >= open
  - high >= close
  - high >= low
  - low <= open
  - low <= close
  - low <= high
- `symbol` must match the symbol used by frontend subscription after normalization.
- `timeframe` must match frontend values: `M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D1`, `W1`, `MN`.
- Numeric values must be numbers, not localized strings.
- Timestamps must not mix milliseconds and seconds without clear field naming.

If backend cannot guarantee this, say exactly which field or rule fails.

## Ordering And Replay Audit

For every broker/symbol/timeframe, verify these cases:

1. Normal tick stream:
   - quote ticks arrive in time order or include enough metadata to order safely.

2. Candle same-bucket update:
   - multiple updates for the same M1 candle must not rewind `close`, `high`, or `low` incorrectly.

3. New bucket transition:
   - final update of previous bucket and first update of new bucket must arrive in deterministic order or include sequence/update time.

4. Reconnect:
   - after reconnect, backend must not broadcast old active candle snapshots after newer snapshots.

5. Burst:
   - if source sends many updates quickly, backend must preserve latest state and not emit stale states later.

6. Multi-instance backend:
   - if backend runs multiple instances, all websocket clients must get the same latest feed state.
   - If Redis, NATS, Kafka, or another fan-out layer is used, confirm message ordering per broker/symbol/timeframe key.

Return evidence for each case.

## Symbol And Timeframe Normalization Audit

Check whether backend sends symbols exactly as frontend expects.

For every broker, return:

- raw provider symbol
- normalized backend symbol
- frontend subscription symbol
- websocket payload symbol
- REST candle symbol
- any suffix/prefix mapping

Examples:

```text
Provider: EURUSD.r
Backend normalized: EURUSD
Frontend subscribes: EURUSD
Payload sends: EURUSD
```

If these differ, provide the exact frontend fix required:

- Should frontend subscribe with raw provider symbol?
- Should frontend display normalized symbol but subscribe with broker symbol?
- Should backend add `display_symbol` and `feed_symbol` separately?
- Should backend normalize before broadcasting?

## Precision And Metadata Audit

For every tested symbol, return:

- digits
- precision
- point
- tickSize
- contract size, if available
- quote currency, if available
- price source: bid, ask, last, midpoint

Confirm whether quote price and candle OHLC use the same price basis:

- bid candles
- ask candles
- last-trade candles
- midpoint candles
- mixed/unknown

If quote ticks are bid/ask but candles are last/midpoint, state this clearly because frontend candle parity may appear wrong even when transport is fast.

## Backend Latency Instrumentation To Add If Missing

If backend does not already log these timestamps, add temporary diagnostic logging with redacted secrets.

Recommended structured log:

```json
{
  "event": "feed_latency_probe",
  "broker_id": "example-broker",
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "feed_type": "quote|candle",
  "source_time": 1760000000.123,
  "backend_received_time": 1760000000.150,
  "backend_normalized_time": 1760000000.152,
  "backend_broadcast_time": 1760000000.158,
  "payload_time": 1760000000,
  "payload_server_time": 1760000000.123,
  "sequence": 123456,
  "connection_id": "redacted",
  "latency_source_to_backend_ms": 27,
  "latency_backend_to_broadcast_ms": 8
}
```

Do not log access tokens, feed tokens, passwords, account passwords, or full secret URLs.

## Direct WebSocket Probe Requirement

For each broker, run a direct websocket probe from outside the mobile app.

The probe must prove:

- connection opens
- auth requirements are satisfied
- subscribe message is accepted
- quote messages arrive
- candle messages arrive, if supported
- no silent period longer than expected
- sample payloads match frontend contract

Return:

- sanitized websocket URL
- subscribe payload used
- first 20 message timestamps
- first 5 payloads
- any backend close/error codes
- whether token was required

If `/ws/feed/status` says feed is unhealthy but direct authenticated WebSocket works, explain the mismatch and fix the status endpoint.

## REST Candle Proof

For each broker/symbol/timeframe, compare REST candles with live candle/quote data.

Return:

- REST endpoint used
- request params
- authenticated or unauthenticated
- first candle
- last closed candle
- current forming candle if REST returns one
- whether REST includes current open candle or only closed candles
- whether REST timestamp is seconds or milliseconds
- whether REST candle price basis matches websocket candle price basis

If REST requires logged-in account context, state that clearly.

## Two-Minute Parity Test

Run a two-minute live capture for each priority broker/symbol/timeframe.

Capture:

- quote ticks
- server candle snapshots
- REST candle before test
- REST candle after test
- backend status at start
- backend status at end

For each M1 candle formed during the test, compare:

```text
quote-built open/high/low/close
server-candle open/high/low/close
REST final open/high/low/close
```

Return a table:

```text
broker_id | symbol | timeframe | bucket_time | quote_ohlc | ws_candle_ohlc | rest_ohlc | match? | reason_if_not
```

If the quote-built candle and server-candle differ, explain whether the reason is:

- bid vs ask vs last price basis
- delayed server candle
- source aggregation
- symbol mismatch
- timezone/timestamp bucket mismatch
- stale replay
- invalid OHLC
- missing ticks
- frontend mapping issue

## Decision Matrix: What Should Frontend Fix?

After backend investigation, return exactly one recommendation per broker/feed.

### Recommendation 1: No frontend change needed

Use this if:

- quote feed is fresh
- frontend receives correct quote ticks
- candle body should stay quote-driven
- backend server candles are not fully compatible or not necessary

Return:

```text
Frontend action: no change.
Reason: quote-driven active candles are the correct mode for this broker.
Backend action: fix/monitor feed freshness only, if needed.
```

### Recommendation 2: Frontend should enable server candle mode

Use this only if:

- server candles are real-time
- server candles update the forming candle
- `time` is bucket start
- `server_time` or sequence id is monotonic
- payload is clean across reconnects
- OHLC is valid
- symbol/timeframe mapping matches frontend

Return:

```text
Frontend action: enable server candle mode for broker_id=<id>.
Required env/config:
EXPO_PUBLIC_CANDLE_SOURCE_MODE=server
EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE=true
Reason: backend proved server-candle compatibility with attached evidence.
```

### Recommendation 3: Frontend should change field mapping

Use this if backend payload is good but field names differ.

Return exact mapping:

```text
Frontend action: map backend field <backend_field> to frontend field <frontend_field>.
Example:
payload.updated_at -> LiveCandle.updateTime
payload.t -> Candle.time
payload.tf -> timeframe
```

### Recommendation 4: Frontend should change symbol/timeframe subscription

Use this if backend requires raw broker symbols or a different timeframe format.

Return exact mapping:

```text
Frontend action: subscribe using feed_symbol, display using symbol.
Example:
display_symbol=EURUSD
feed_symbol=EURUSD.r
```

### Recommendation 5: Backend must fix feed contract first

Use this if:

- feed goes silent
- timestamps are wrong
- OHLC is invalid
- server candles are bar-close only but claimed real-time
- stale replays happen
- status endpoint is misleading
- payload lacks symbol/timeframe/update time

Return:

```text
Frontend action: keep current quote-driven safe mode.
Backend action: fix <exact backend issue>.
Reason: <evidence>.
```

## Backend Fix Requirements If Issues Are Found

If backend is the cause, implement fixes in these areas as applicable:

### Feed freshness

- Ensure backend subscribes to provider quote streams for every requested broker/symbol.
- Ensure subscriptions are re-established after reconnect.
- Ensure broker feed auth tokens are refreshed or rejected clearly.
- Ensure backend status endpoint reports stale/silent symbols accurately.

### Candle stream compatibility

- Send current forming candle updates, not only closed candles, if server candle mode is desired.
- Add `server_time` or monotonic sequence id.
- Keep `time` as bucket start only.
- Do not broadcast stale active candle snapshots after newer ones.
- Normalize timestamp units.
- Validate OHLC before broadcast.

### Multi-instance fan-out

- If backend API and WebSocket broadcaster run on different instances, use a shared ordered fan-out layer.
- Partition messages by `broker_id:symbol:timeframe`.
- Preserve per-key ordering.
- Avoid replaying stale messages after reconnect.

### Payload normalization

- Include broker id.
- Include normalized symbol and raw provider symbol if they differ.
- Include timeframe.
- Include digits/point/tickSize metadata.
- Include price basis.

## Exact Deliverables Required From Backend

Return all of these:

1. Summary conclusion:

```text
Root cause:
Frontend action:
Backend action:
Confidence:
```

2. Broker-by-broker table:

```text
broker_id | quote_ws_status | candle_ws_status | rest_candle_status | auth_required | root_cause | frontend_action
```

3. Symbol-by-symbol freshness table:

```text
broker_id | symbol | quote_last_age_sec | candle_last_age_sec | avg_quote_latency_ms | p95_quote_latency_ms | p99_quote_latency_ms
```

4. Candle compatibility table:

```text
broker_id | symbol | timeframe | realtime_forming_updates | has_bucket_time | has_server_time | ordered | valid_ohlc | compatible_with_server_mode
```

5. Raw sanitized payload examples:

- quote payloads
- candle payloads
- REST candle response
- status endpoint response

6. Latency histogram or metrics:

- source to backend
- backend normalize time
- backend broadcast time
- total backend-side latency

7. Reconnect/replay proof:

- logs from a forced reconnect or natural reconnect
- proof stale candles do not overwrite fresh candles

8. Final frontend instruction:

Choose exactly one:

```text
NO_FRONTEND_CHANGE
ENABLE_SERVER_CANDLE_MODE
CHANGE_FIELD_MAPPING
CHANGE_SYMBOL_MAPPING
CHANGE_TIMEFRAME_MAPPING
KEEP_QUOTE_DRIVEN_AND_BACKEND_FIX_REQUIRED
```

Include the exact config or code contract frontend must use.

## Acceptance Criteria

Backend work is complete only when all are true:

- `/ws/feed/status?broker_id=<id>` accurately shows live/silent state.
- Quote WebSocket emits fresh data for tested symbols.
- Latency metrics include avg, p95, p99, and max.
- Raw sample payloads are provided.
- Candle payload contract is proven or rejected with exact reason.
- Delayed/out-of-order/replayed candle behavior is tested.
- REST candle parity is compared against live stream.
- Backend gives one clear frontend action from the decision matrix.
- Secrets are redacted.
- Evidence is attached, not just a verbal claim.

## Final Answer Format Backend Must Use

Please respond in this exact structure:

```md
# Backend Feed Latency And Candle Contract Result

## 1. Direct Conclusion

Root cause:
Frontend action:
Backend action:
Confidence:

## 2. Brokers Tested

| broker_id | quote status | candle status | auth | result |
| --- | --- | --- | --- | --- |

## 3. Latency Metrics

| broker_id | symbol | feed | avg ms | p95 ms | p99 ms | max ms | sample count |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |

## 4. Payload Contract Result

| broker_id | symbol | timeframe | bucket time ok | server_time ok | ordered | OHLC valid | compatible |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 5. Raw Payload Samples

### Quote

```json
{}
```

### Candle

```json
{}
```

### Status

```json
{}
```

## 6. Two-Minute Parity Result

| broker_id | symbol | timeframe | bucket | quote OHLC | WS candle OHLC | REST OHLC | match | reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 7. Reconnect And Replay Result

Result:
Evidence:

## 8. Required Frontend Change

Choose one:

- NO_FRONTEND_CHANGE
- ENABLE_SERVER_CANDLE_MODE
- CHANGE_FIELD_MAPPING
- CHANGE_SYMBOL_MAPPING
- CHANGE_TIMEFRAME_MAPPING
- KEEP_QUOTE_DRIVEN_AND_BACKEND_FIX_REQUIRED

Exact frontend instruction:

## 9. Backend Fix Implemented Or Required

Files/services changed:
Monitoring added:
Remaining risk:
```

## Important Rule

If server candles are not guaranteed real-time, ordered, timestamp-clean, and compatible across reconnects, the correct frontend instruction is:

```text
KEEP_QUOTE_DRIVEN_AND_BACKEND_FIX_REQUIRED
```

Do not tell frontend to render raw WebSocket candle packets directly.
