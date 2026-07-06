# Backend Prompt: Fix Live Feed Latency And Reliability For All Brokers

You are the backend engineer responsible for the RTX5 broker directory, quote feed status API, and quote websocket services.

This is not a MyProp-only issue. Please audit and fix the live quote feed pipeline for every broker returned by:

`GET https://superbackend.orrnn.com/api/v1/broker/servers`

The mobile app is React Native/Expo. It consumes each broker's configured:

- `feed_status_https_url` or `feed_status_url`
- `feed_wss_url`, `feed_ws_url`, or `feed_url`
- `server_url`, `services_domain`, or broker service domain
- `broker_id`

The expected mobile behavior is: when any broker is selected, live bid/ask, chart price lines, active candles, open position P/L, account/trade screens, quotes screen, and symbol details should receive fresh ticks quickly and consistently.

## Problem

Live feed data is slow or unavailable across broker feeds. This must be solved for all brokers, not only `myprop-trade`.

Observed backend-side problems include:

1. Some broker directory rows expose `http://` and `ws://` raw IP feed URLs.
2. Some secure broker feeds are reachable by status endpoint but all symbols are stale/silent.
3. Some secure broker websocket connections do not open.
4. Some working websockets deliver ticks but with backend feed timestamps several seconds old.
5. Several brokers report many stale/silent symbols even while `upstream_connected` is true.
6. `cserver_connected` is false on multiple broker feeds, which must be explained or fixed.

The mobile frontend already uses a fast direct per-symbol websocket path and commits active quote UI at frame speed, so multi-second delay must be investigated at the backend/feed layer first.

## Frontend Contract Already In Place

The mobile app already does the following:

- Builds broker-hosted feed URLs from the selected broker service domain.
- Uses `wss://<broker-domain>/ws/feed?broker_id=<broker_id>&token=<redacted>` for broker-hosted feeds when required.
- Rejects insecure/raw-IP broker feeds for mobile safety, especially iOS.
- Uses direct per-symbol quote listeners for live bid/ask UI.
- Commits active live quote UI at `0ms` to `16ms` intervals depending on screen.
- Uses a REST `/quotes` fallback only when websocket data is stale or missing.
- Has a websocket watchdog for silent TCP drops.

Relevant mobile files:

- `rtx5-app/src/api/brokerRouting.ts`
- `rtx5-app/src/api/feedStatus.ts`
- `rtx5-app/src/api/feedAuth.ts`
- `rtx5-app/src/api/ws/quotesSocket/QuotesWebSocketService.ts`
- `rtx5-app/src/api/ws/quotesSocket/tickProcessor.ts`
- `rtx5-app/src/query/websocket.ts`
- `rtx5-app/src/features/quotes/useLiveQuotes.ts`

Please do not ask the mobile app to accept insecure `ws://` raw IP feeds. The backend directory must provide mobile-safe HTTPS/WSS domains with valid TLS.

## Evidence From Current Broker Directory

Current broker directory returned 10 brokers.

### Mobile-Unsafe Feed URL Rows

These brokers currently expose `http://` status URLs and `ws://` raw IP websocket URLs. These are not acceptable for iOS/Android production mobile feeds.

| Broker | Status URL | Websocket URL | Problem |
| --- | --- | --- | --- |
| `alphafx` | `http://203.0.113.10/ws/feed/status` | `ws://203.0.113.10/ws/feed` | Raw IP, insecure HTTP/WS, timed out |
| `betatrade` | `http://203.0.113.11/ws/feed/status` | `ws://203.0.113.11/ws/feed` | Raw IP, insecure HTTP/WS, timed out |
| `deltapro` | `http://203.0.113.13/ws/feed/status` | `ws://203.0.113.13/ws/feed` | Raw IP, insecure HTTP/WS, timed out |
| `gammacapital` | `http://203.0.113.12/ws/feed/status` | `ws://203.0.113.12/ws/feed` | Raw IP, insecure HTTP/WS, timed out |
| `omegaglobal` | `http://203.0.113.14/ws/feed/status` | `ws://203.0.113.14/ws/feed` | Raw IP, insecure HTTP/WS, timed out |

Required backend fix:

- Replace every raw-IP feed URL with a real HTTPS/WSS domain.
- Use valid TLS certificates.
- Make `GET /ws/feed/status?broker_id=<broker_id>` respond within 1 second.
- Make `wss://<domain>/ws/feed?broker_id=<broker_id>` open from mobile/public internet.
- If a broker is mock/unavailable, mark it disabled or return a clear backend health state so mobile does not present it as live.

### Feed Status Probe Results

Probe date: 2026-07-06 IST.

Endpoint pattern:

`GET <feed_status_url>?broker_id=<broker_id>`

Summary:

| Broker | HTTP | Response time | Auth required | Upstream | CServer | Symbols | Stale/silent | Max age | Notes |
| --- | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| `achiever-financials` | 200 | 981ms | true | true | false | 331 | 331 | 1072s | All watched symbols stale/silent |
| `alphafx` | timeout | 3505ms | unknown | unknown | unknown | unknown | unknown | unknown | Raw IP HTTP/WS |
| `betatrade` | timeout | 3503ms | unknown | unknown | unknown | unknown | unknown | unknown | Raw IP HTTP/WS |
| `deltapro` | timeout | 3502ms | unknown | unknown | unknown | unknown | unknown | unknown | Raw IP HTTP/WS |
| `gammacapital` | timeout | 3501ms | unknown | unknown | unknown | unknown | unknown | unknown | Raw IP HTTP/WS |
| `gta_broker` | 200 | 157ms | true | true | false | 294 | 178 | 1168s | Many stale/silent symbols |
| `myprop-trade` | 200 | 566ms | true | true | false | 40 | 3 | 21s | Working but some latency remains |
| `omegaglobal` | timeout | 3508ms | unknown | unknown | unknown | unknown | unknown | unknown | Raw IP HTTP/WS |
| `orrnn` | 200 | 987ms | false | true | true | 331 | 185 | 103s | Many stale/silent symbols |
| `testorrnn` | 200 | 925ms | false | true | true | 331 | 185 | 103s | Many stale/silent symbols |

Watched symbols checked:

- `XAUUSD`
- `BTCUSD`
- `EURUSD`
- `GBPUSD`
- `US30`
- `USDJPY`

Critical finding:

`achiever-financials` returned HTTP 200 but every symbol was stale/silent. For watched symbols, ages were around 969 to 971 seconds. This is not a frontend rendering issue.

## Secure Websocket Probe Results

Probe pattern:

`wss://<broker-domain>/ws/feed?broker_id=<broker_id>&token=<redacted-if-required>`

Subscription payload:

```json
{
  "type": "subscribe",
  "symbols": ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "US30", "USDJPY"]
}
```

### `achiever-financials`

- Websocket did not open.
- Error count: 1
- Close code: `1006`
- Raw messages: 0
- Parsed ticks: 0

Required backend fix:

- Make `wss://service.achieverfinancials.com/ws/feed?broker_id=achiever-financials` open successfully.
- If auth is required, return documented close code and reason when token is missing/invalid.
- Do not expose status as healthy while websocket cannot open and all symbols are stale.

### `gta_broker`

- Websocket opened in 139ms.
- First message in 179ms.
- Parsed ticks in 10 seconds: 262.
- Tick cadence is frequent, but feed timestamps are stale for several symbols.

Observed average/max feed timestamp latency:

- `XAUUSD`: avg 3236ms, max 7427ms
- `BTCUSD`: avg 3252ms, max 8018ms
- `EURUSD`: avg 4456ms, max 9228ms
- `GBPUSD`: avg 3184ms, max 8021ms
- `US30`: avg 7519ms, max 12427ms
- `USDJPY`: one tick only, latency 33652ms

Required backend fix:

- Investigate why websocket emits frequent messages but the feed timestamp is several seconds old.
- Ensure tick timestamps represent the actual market tick/source time, not stale cached data.
- Reduce p95 feed timestamp latency for active watched symbols.

### `myprop-trade`

- Websocket opened in 574ms.
- First message in 740ms.
- Parsed ticks in 10 seconds: 51.
- Working but some symbols have multi-second gaps or stale feed timestamps.

Observed average/max feed timestamp latency:

- `US30`: avg 11504ms, max 14258ms
- `USDJPY`: avg 2556ms, max 5259ms
- `EURUSD`: avg 1743ms, max 4259ms
- `GBPUSD`: avg 1388ms, max 3271ms

Required backend fix:

- This broker must be fixed as part of the global broker-feed system, not as a one-off.
- Investigate why `cserver_connected` is false while ticks are still emitted.
- Reduce latency and gaps across all active symbols.

### `orrnn`

- Websocket opened in 931ms.
- First message in 1229ms.
- Parsed ticks in 10 seconds: 72.
- Working, but some symbols still show stale timestamps.

Observed average/max feed timestamp latency:

- `USDJPY`: avg 7180ms, max 11917ms
- `EURUSD`: avg 1239ms, max 4952ms
- `XAUUSD`: avg 546ms, max 4164ms

Required backend fix:

- Keep the healthy low-latency behavior for BTCUSD/GBPUSD.
- Fix stale timestamp behavior on slower symbols like USDJPY.

### `testorrnn`

- Websocket opened in 801ms.
- First message in 1060ms.
- Parsed ticks in 10 seconds: 82.
- Working, but some symbols still show stale timestamps.

Observed average/max feed timestamp latency:

- `USDJPY`: avg 3607ms, max 13914ms
- `EURUSD`: avg 2412ms, max 6436ms
- `US30`: avg 1075ms, max 3776ms

Required backend fix:

- Same as `orrnn`: reduce stale timestamp latency on slower symbols.

## Required Backend Work

Please implement a global broker-feed reliability fix with these deliverables.

### 1. Broker Directory Hygiene

For every enabled broker returned by `/broker/servers`:

- `server_url` must be a valid `https://` domain, not raw IP.
- `feed_status_https_url` must be a valid `https://` domain.
- `feed_wss_url` must be a valid `wss://` domain.
- The host must have valid TLS certificates.
- Do not return `http://`, `ws://`, or raw-IP feed URLs for production mobile brokers.
- If the broker is not live, mark it disabled or include a clear non-live status.

Acceptance:

- No enabled production broker row contains `http://`, `ws://`, or raw IP feed URLs.
- iOS and Android can connect without ATS/cleartext/network-security exceptions.

### 2. Feed Status API Contract

Every broker must support:

`GET /ws/feed/status?broker_id=<broker_id>`

Response must include:

- `broker_id`
- `feed_auth_required`
- `upstream_connected`
- `cserver_connected`
- `provider_status`
- `server_time`
- `symbol_status`

Each `symbol_status` row must include:

- `symbol`
- `has_quote`
- `silent`
- `last_tick_age_sec`
- `last_bid`
- `last_ask`
- `last_tick_time` or equivalent source tick timestamp
- `last_server_emit_time` if different
- reason when stale/silent

Acceptance:

- Status endpoint responds within 1000ms p95.
- For active market symbols, `last_tick_age_sec` should usually be under 2 seconds and should not exceed 5 seconds p95 during active market periods.
- If the market is closed or a symbol is intentionally inactive, status must say so explicitly instead of presenting a silent failure.

### 3. Websocket Contract

Every broker must support:

`wss://<broker-domain>/ws/feed?broker_id=<broker_id>`

If auth is required:

`wss://<broker-domain>/ws/feed?broker_id=<broker_id>&token=<token>`

Subscription payload:

```json
{
  "type": "subscribe",
  "symbols": ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "US30", "USDJPY"]
}
```

Expected acknowledgement:

```json
{
  "type": "subscribed",
  "symbols": ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "US30", "USDJPY"]
}
```

Every quote tick should include:

- `symbol`
- `bid`
- `ask`
- `time`, `timestamp`, or `timestamp_ms`
- `source`
- `sequence` or `tick_id`
- optional `digits`, `point`, `tickSize`, `volume`

Acceptance:

- Websocket open time under 1000ms p95.
- First subscribed tick under 1000ms p95 after subscribe.
- No unexplained close code `1006`.
- If auth fails, close with a documented code such as `1008` or `4001` and a clear reason.
- For active watched symbols, p95 inter-tick gap should be under 2000ms where market liquidity allows.
- For active watched symbols, p95 feed timestamp latency should be under 1000ms and must not regularly exceed 3000ms.

### 4. Fix Stale Timestamp And Cached Tick Emission

Several websocket feeds emit messages frequently but with old tick timestamps. Please trace:

- LP/source tick receive time
- backend ingest time
- normalization time
- cache write time
- websocket emit time
- client receive time

Add backend logs/metrics for:

- `broker_id`
- `symbol`
- `source_tick_time`
- `backend_received_at`
- `ws_emitted_at`
- `client_subscribed_at` if available
- `source_to_backend_ms`
- `backend_to_ws_ms`
- `source_to_ws_ms`
- `sequence`
- stale reason

Acceptance:

- Backend can prove whether delay is coming from LP/source, CServer, backend cache, queue, or websocket fanout.
- No broker emits old cached ticks as if they are live without marking them stale/degraded.

### 5. CServer Connectivity

Investigate why these brokers reported `cserver_connected: false`:

- `achiever-financials`
- `gta_broker`
- `myprop-trade`

Acceptance:

- If CServer is required for real-time feed, it must be connected and monitored.
- If CServer is not required for a broker, rename or document this field so it does not look like a feed failure.
- Status must expose the actual provider connection that determines live quotes.

### 6. Symbol Coverage

For every enabled broker, verify these common symbols:

- `XAUUSD`
- `BTCUSD`
- `EURUSD`
- `GBPUSD`
- `US30`
- `USDJPY`

Also verify all symbols returned in broker instruments/market symbols.

Acceptance:

- No active symbol remains silently stale for minutes.
- If a symbol is unavailable, disabled, closed, or unsupported, backend status must say that explicitly.

### 7. Monitoring And Alerts

Add backend monitoring for each broker:

- status endpoint availability
- websocket open success
- subscription acknowledgement
- tick rate by symbol
- p50/p95/p99 source-to-ws latency
- stale/silent symbol count
- auth rejection count
- abnormal close code count
- raw IP or insecure feed URL detection in broker directory

Acceptance:

- Backend team gets alerts before mobile users report slow/no live data.
- A daily/continuous broker-feed health report can be shared with frontend/mobile.

## Reproduction Commands

Use these commands from any machine with Node 20+.

### Broker Directory

```js
const res = await fetch('https://superbackend.orrnn.com/api/v1/broker/servers', {
  headers: { accept: 'application/json' },
});
console.log(await res.json());
```

### Feed Status

```js
const brokerId = '<broker_id>';
const statusUrl = '<feed_status_https_url>';
const res = await fetch(`${statusUrl}?broker_id=${encodeURIComponent(brokerId)}`, {
  headers: { accept: 'application/json' },
});
console.log(res.status, await res.json());
```

### Websocket

```js
const brokerId = '<broker_id>';
const token = '<redacted token if required>';
const symbols = ['XAUUSD', 'BTCUSD', 'EURUSD', 'GBPUSD', 'US30', 'USDJPY'];
const wsUrl = `wss://<broker-domain>/ws/feed?broker_id=${encodeURIComponent(brokerId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
const ws = new WebSocket(wsUrl);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'subscribe', symbols }));
});

ws.addEventListener('message', (event) => {
  const receivedAt = Date.now();
  const payload = JSON.parse(event.data);
  console.log(receivedAt, payload);
});

ws.addEventListener('close', (event) => {
  console.log('closed', event.code, event.reason);
});

ws.addEventListener('error', (event) => {
  console.log('error', event);
});
```

## Final Backend Deliverables Requested

Please return:

1. A list of every broker and whether its feed is production-mobile-safe.
2. Before/after broker directory rows for all fixed URLs.
3. Before/after `/ws/feed/status` samples for every broker.
4. Before/after websocket probe output for every broker.
5. Per-symbol latency table for `XAUUSD`, `BTCUSD`, `EURUSD`, `GBPUSD`, `US30`, and `USDJPY`.
6. Explanation of every broker where `cserver_connected` is false.
7. Confirmation that all enabled broker feeds use HTTPS/WSS domains with valid TLS.
8. Confirmation that all websocket auth failures use documented close codes and reasons.
9. Monitoring dashboard or logs proving p95 latency and stale/silent counts.
10. Exact deployment version/commit and deployment time.

## Definition Of Done

This backend issue is fixed only when:

- All enabled brokers have mobile-safe feed URLs.
- All enabled broker status endpoints respond reliably.
- All enabled broker websockets open and acknowledge subscriptions.
- Active symbols receive fresh ticks.
- Feed timestamp latency is consistently low.
- Stale/silent symbol reasons are explicit.
- Mobile app does not need broker-specific workarounds.

