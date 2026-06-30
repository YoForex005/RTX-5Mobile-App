# MyProp Live Candle Parity Backend Fix Prompt

Audience: broker backend developer or backend AI coding agent.

Goal: verify and fix the MyProp broker backend so RTX5 mobile and the MyProp web terminal show the same live `XAUUSD` `M1` candle behavior for the same broker account.

Do not mark this fixed from screenshots only. Prove it from broker discovery, login response fields, REST responses, WebSocket payloads, timestamps, and a recorded two-minute comparison.

## Current Frontend Audit Result

The RTX5 React Native frontend is already prepared for broker-domain routing and feed-token auth:

- Logged-in MyProp REST and WebSocket traffic is routed to `https://services.myprop.trade`.
- Broker directory currently returns `broker_id: "myprop-trade"`, not `"myprop"`.
- Broker directory currently returns these usable domain fields:
  - `server_url: "https://services.myprop.trade"`
  - `market_api_url: "https://services.myprop.trade"`
  - `services_domain: "services.myprop.trade"`
  - `feed_status_https_url: "https://services.myprop.trade/ws/feed/status"`
  - `feed_url: "wss://services.myprop.trade/ws/feed"`
  - `feed_wss_url: "wss://services.myprop.trade/ws/feed"`
- `GET https://services.myprop.trade/ws/feed/status?broker_id=myprop-trade` currently shows:
  - `feed_auth_required: true`
  - `upstream_connected: true`
  - provider connected: `true`
  - `XAUUSD last_tick_age_sec: 0`
  - `silent_symbols: []`
- No-token WebSocket connection to `wss://services.myprop.trade/ws/feed?broker_id=myprop-trade` fails, so mobile currently requires a feed token.
- Frontend can append both `broker_id` and `token` if backend returns a feed token during login and refresh.
- Frontend can consume these feed-token field names:
  - `feed_broker_token`
  - `broker_feed_token`
  - `feed_token`
  - `ws_feed_token`
  - `market_data_feed_token`
  - `quote_feed_token`
  - camelCase equivalents such as `feedBrokerToken`, `brokerFeedToken`, `feedToken`, `wsFeedToken`, `marketDataFeedToken`, `quoteFeedToken`
- Frontend uses broker candle REST path:
  - `GET https://services.myprop.trade/api/v2/candles/XAUUSD?timeframe=M1&limit=500`
- Frontend uses broker candle WebSocket path:
  - `wss://services.myprop.trade/ws/v2?token=<trader_jwt>`
  - channel: `candles.XAUUSD.1m`
- Frontend builds the active candle from bid ticks while also accepting authoritative candle WebSocket updates.

Because `feed_auth_required` is currently `true`, backend must return a working feed token. If the backend decides feed auth should not be required, then `/ws/feed?broker_id=myprop-trade` must work without a token and `/ws/feed/status` must report `feed_auth_required: false`.

## Non-Negotiable Backend Rules

After login, mobile-facing broker session traffic must use only the selected broker backend domain:

```text
https://services.myprop.trade/api/v2/...
wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=<redacted_if_required>
wss://services.myprop.trade/ws/v2?token=<redacted_trader_jwt>
https://services.myprop.trade/ws/feed/status?broker_id=myprop-trade
```

These must not be used for logged-in MyProp session traffic:

```text
https://backend.orrnn.com/...
https://superbackend.orrnn.com/... except initial broker-directory lookup
https://testsuperbackend.orrnn.com/...
wss://backend.orrnn.com/...
wss://testbrokerbackend.orrnn.com/...
raw IP websocket URLs
ws:// cleartext URLs in production
public/global candle fallback for logged-in chart data
```

If a required broker domain or auth token is missing, return a clear dynamic error. Do not silently route to a shared backend.

Never log passwords, full access tokens, refresh tokens, feed tokens, full WebSocket query strings, or full JWTs.

## Required Backend Fixes And Proof

### 1. Broker Directory And Login Contract

Verify the broker-directory row and login response for MyProp account `160000`.

The backend must choose and document the canonical broker id:

- Current directory id: `myprop-trade`
- Prompt/example id used earlier: `myprop`

Fix one of these:

- Prefer `myprop-trade` everywhere and document that this is the canonical broker id.
- Or support `myprop` as a backwards-compatible alias that resolves to the same feed/session.

The login response must include enough information for the mobile app to build every logged-in endpoint dynamically.

Expected redacted shape:

```json
{
  "broker_id": "myprop-trade",
  "server_url": "https://services.myprop.trade",
  "services_domain": "https://services.myprop.trade",
  "api_base_url": "https://services.myprop.trade/api/v2",
  "quotes_ws_url": "wss://services.myprop.trade/ws/feed",
  "candles_ws_url": "wss://services.myprop.trade/ws/v2",
  "trade_ws_url": "wss://services.myprop.trade/ws/v2",
  "feed_auth_required": true,
  "feed_broker_token": "<redacted>",
  "access_token": "<redacted>",
  "refresh_token": "<redacted>",
  "expires_in": 86400
}
```

Acceptance criteria:

- Broker domain fields are present and valid HTTPS/WSS domains.
- No raw IPs are returned as mobile service origins.
- No global fallback backend is returned for logged-in broker services.
- `broker_id` is consistent with `/ws/feed/status` and `/ws/feed`.
- If `feed_auth_required: true`, login and refresh return a feed token field the frontend already supports.
- If `feed_auth_required: false`, `/ws/feed` works with only `broker_id=myprop-trade`.
- Tokens are redacted in logs and response samples.

### 2. Feed Status

Call:

```text
GET https://services.myprop.trade/ws/feed/status?broker_id=myprop-trade
```

Expected response shape:

```json
{
  "status": "ok",
  "broker_id": "myprop-trade",
  "server_time": "2026-06-30T11:30:00.000Z",
  "upstream_connected": true,
  "cserver_connected": true,
  "feed_auth_required": true,
  "active_symbols": [
    {
      "symbol": "XAUUSD",
      "last_bid": 4031.11,
      "last_ask": 4031.16,
      "last_tick_time": "2026-06-30T11:30:12.250Z",
      "last_tick_age_sec": 0.2,
      "sequence": 123456,
      "status": "live"
    }
  ],
  "silent_symbols": []
}
```

If the backend uses `symbol_status` instead of `active_symbols`, that is acceptable only if each row gives enough live evidence:

```json
{
  "symbol": "XAUUSD",
  "has_data": true,
  "last_tick_age_sec": 0,
  "silent": false
}
```

Acceptance criteria:

- `XAUUSD` is present and live.
- `last_tick_age_sec` is usually below 1 second while the market is active.
- `upstream_connected` and provider/feed connection are true.
- If `cserver_connected` is false because feed source is not cServer, document that clearly. If cServer is required for this broker path, fix it.
- Status endpoint explains stale/silent state if XAUUSD is not live.

### 3. Quote WebSocket Token Contract

Connect with a valid feed token:

```text
wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=<redacted_feed_token>
```

Subscribe:

```json
{
  "type": "subscribe",
  "symbols": ["XAUUSD"]
}
```

Expected ack:

```json
{
  "type": "subscription_ack",
  "channel": "quotes",
  "status": "ok",
  "accepted": ["XAUUSD"],
  "rejected": [],
  "server_time": "2026-06-30T11:30:00.000Z"
}
```

Expected tick shape:

```json
{
  "type": "quote",
  "event": "quote.tick",
  "channel": "quotes.XAUUSD",
  "symbol": "XAUUSD",
  "bid": 4031.11,
  "ask": 4031.16,
  "digits": 2,
  "point": 0.01,
  "tick_size": 0.01,
  "spread": 5,
  "tick_time": "2026-06-30T11:30:12.250Z",
  "server_time": "2026-06-30T11:30:12.280Z",
  "sequence": 123456
}
```

Acceptance criteria:

- Authenticated socket opens.
- Subscribe ack arrives quickly.
- First XAUUSD quote snapshot arrives quickly.
- Live ticks arrive as the MyProp web terminal price changes.
- Bid, ask, digits or point/tick size, tick time, server time, and sequence are included when available.
- Socket must not be silent-open.
- Backend must not replay stale queued ticks after reconnect.
- If token is expired or invalid, socket closes with a documented auth failure code and no secret leakage.

### 4. Feed Token Refresh Contract

Call the token refresh endpoint with a valid refresh token:

```text
POST https://services.myprop.trade/api/v2/auth/refresh
```

Expected redacted response:

```json
{
  "access_token": "<redacted>",
  "refresh_token": "<redacted>",
  "expires_in": 86400,
  "feed_auth_required": true,
  "feed_broker_token": "<redacted>"
}
```

Acceptance criteria:

- Refresh returns a new trader JWT if required.
- Refresh also returns a feed token when feed auth is required.
- Feed token remains valid for quote WebSocket after refresh.
- Old token behavior is documented: either old feed token remains valid until expiry or is invalidated immediately.
- Token expiry, scope, and broker id binding are documented.

### 5. Candle History REST

Call after login with trader JWT:

```text
GET https://services.myprop.trade/api/v2/candles/XAUUSD?timeframe=M1&limit=500
Authorization: Bearer <redacted_trader_jwt>
```

Expected response:

```json
{
  "symbol": "XAUUSD",
  "timeframe": "M1",
  "price_basis": "bid",
  "candles": [
    {
      "time": "2026-06-30T11:29:00.000Z",
      "open": 4030.51,
      "high": 4031.11,
      "low": 4030.51,
      "close": 4031.11,
      "volume": 55,
      "closed": true
    }
  ],
  "server_time": "2026-06-30T11:30:12.300Z"
}
```

Acceptance criteria:

- Response comes from `https://services.myprop.trade`.
- Returns enough recent M1 candles for chart bootstrap.
- Candles are sorted oldest to newest.
- Timestamps are UTC or clearly documented broker time.
- Every M1 candle is aligned to a one-minute bucket.
- OHLC is valid: `high >= open`, `high >= close`, `low <= open`, `low <= close`.
- Current/final marker is included through `closed`, `isClosed`, `complete`, or an equivalent field.
- Latest REST candle does not conflict with the WebSocket forming candle.
- No public/global fallback candle history is used.

### 6. Candle WebSocket

Connect after login:

```text
wss://services.myprop.trade/ws/v2?token=<redacted_trader_jwt>
```

Subscribe:

```json
{
  "action": "subscribe",
  "channel": "candles.XAUUSD.1m"
}
```

Expected ack:

```json
{
  "type": "subscription_ack",
  "status": "ok",
  "channel": "candles.XAUUSD.1m",
  "server_time": "2026-06-30T11:30:00.000Z"
}
```

Expected forming candle update:

```json
{
  "event": "candle.replace_last",
  "channel": "candles.XAUUSD.1m",
  "symbol": "XAUUSD",
  "timeframe": "1m",
  "time": "2026-06-30T11:30:00.000Z",
  "open": 4030.51,
  "high": 4031.16,
  "low": 4029.66,
  "close": 4031.11,
  "volume": 55,
  "closed": false,
  "sequence": 50001,
  "server_time": "2026-06-30T11:30:12.500Z"
}
```

Expected final candle at boundary:

```json
{
  "event": "candle.append",
  "channel": "candles.XAUUSD.1m",
  "symbol": "XAUUSD",
  "timeframe": "1m",
  "time": "2026-06-30T11:30:00.000Z",
  "open": 4030.51,
  "high": 4031.16,
  "low": 4029.66,
  "close": 4031.11,
  "volume": 120,
  "closed": true,
  "sequence": 50020,
  "server_time": "2026-06-30T11:31:00.100Z"
}
```

Acceptance criteria:

- Latest forming candle snapshot arrives after subscribe.
- Forming candle updates during the minute, or backend explicitly documents that mobile should extend the active candle from quote ticks.
- Final candle arrives shortly after minute boundary.
- Backend sends gap/resync events if candle sequence or bucket continuity breaks.
- Candle WebSocket and REST history agree for the same closed minute.
- Channel token `1m` is accepted for frontend compatibility. If backend also supports `M1`, document both.

### 7. Quote-To-Candle Consistency

For a two-minute test window on account `160000`, symbol `XAUUSD`, timeframe `M1`, record:

- Every quote tick from `/ws/feed`.
- Every candle REST/current snapshot from `/api/v2/candles`.
- Every candle WebSocket message from `/ws/v2`.
- Web terminal visual recording.
- Mobile visual recording, or mobile-facing backend data proof if the backend team cannot record the phone.

For each M1 bucket, compute candle OHLC from quote ticks:

```text
open  = first accepted tick price in bucket
high  = max accepted tick price in bucket
low   = min accepted tick price in bucket
close = last accepted tick price in bucket
```

Use the same price side as the web terminal candle uses. If the web terminal uses bid candles, backend/mobile must use bid. If web terminal uses ask, mid, or upstream candles, document that and keep it consistent.

Acceptance criteria:

- Backend REST closed candle equals computed quote-tick OHLC for the same side and bucket, or documented broker upstream candle source matches web terminal exactly.
- Backend candle WebSocket current candle close follows the latest accepted quote side.
- Web terminal and mobile latest candle have the same time bucket.
- Web terminal and mobile latest candle OHLC are equal or differ only by documented tiny latency.
- If mobile sees bid/ask move but candle does not update, backend must show whether quote ticks were sent and whether candle messages were sent.

## Required Temporary Debug Logs

Add temporary redacted logs during this investigation:

```text
[broker-discovery] broker_id=myprop-trade api_base_url=... quotes_ws=... candles_ws=...
[login-contract] broker_id=myprop-trade feed_auth_required=true feed_token_present=true feed_token_key=feed_broker_token
[feed-status] broker_id=myprop-trade upstream_connected=true provider_connected=true xauusd_last_tick_age_sec=...
[quote-subscribe] connection_id=... broker_id=myprop-trade symbols=XAUUSD accepted=true
[quote-tick] broker_id=myprop-trade symbol=XAUUSD bid=... ask=... tick_time=... sequence=...
[candle-history] broker_id=myprop-trade symbol=XAUUSD timeframe=M1 count=... newest_time=...
[candle-subscribe] connection_id=... channel=candles.XAUUSD.1m accepted=true
[candle-update] symbol=XAUUSD timeframe=M1 time=... open=... high=... low=... close=... closed=false sequence=...
[candle-final] symbol=XAUUSD timeframe=M1 time=... close=... closed=true sequence=...
```

Do not log passwords, full access tokens, full refresh tokens, full feed tokens, full WebSocket query strings, or full JWTs.

## Backend Vs Frontend Decision Rules

Backend is healthy only if all of this is true:

1. Broker discovery returns valid MyProp broker-domain endpoints.
2. Login and refresh return a working feed token when `/ws/feed/status` reports `feed_auth_required: true`.
3. Candle history comes from `https://services.myprop.trade/api/v2`.
4. `/ws/feed` sends fresh authenticated XAUUSD bid/ask ticks with timing metadata.
5. `/ws/v2` candle subscription sends ack and current/final candle messages, or backend documents quote ticks as the active-candle source.
6. REST closed candles match the web terminal candle source and bucket rules.
7. Web terminal and mobile receive equivalent data for the same account, broker, symbol, and timeframe.

If backend sends all required data and both clients receive it, but one UI still draws differently, then the remaining bug is frontend rendering or merge logic.

If backend quote ticks are live but candle REST/WS is stale or bucketed differently from the web terminal, then backend candle generation is still broken.

If web terminal gets fresher ticks than mobile `/ws/feed`, then backend feed fan-out or mobile-facing WebSocket routing is still broken.

If mobile must connect to a global fallback backend after login, broker routing/service discovery is still broken.

## Final Deliverables Required From Backend

Return these exact artifacts:

1. MyProp broker directory row with secrets omitted.
2. Redacted MyProp login response for account `160000`.
3. Redacted refresh response showing whether a feed token is returned.
4. Exact REST candle URL used for `XAUUSD` `M1`.
5. Exact quote WebSocket URL shape with token redacted.
6. Exact candle WebSocket URL and channel used.
7. `/ws/feed/status?broker_id=myprop-trade` response sample.
8. Quote WebSocket subscribe ack sample.
9. Two-minute raw quote tick sample for `XAUUSD`.
10. Candle WebSocket subscribe ack sample.
11. Two-minute raw candle WebSocket sample for `XAUUSD` `M1`.
12. REST candle sample covering the same two-minute window.
13. Computed quote-to-candle OHLC comparison table.
14. Web terminal vs mobile video/screenshot proof.
15. Final statement: backend fixed, frontend fixed, or what still remains.

## Short Backend Request

Please fix and prove MyProp live candle parity for RTX5 mobile, account `160000`, symbol `XAUUSD`, timeframe `M1`.

The current frontend is already broker-domain and feed-token ready. The backend currently reports `feed_auth_required: true`, so login and refresh must return a supported feed token field, and that token must open:

```text
wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=<redacted>
```

Then prove `/ws/feed`, `/api/v2/candles`, and `/ws/v2` all match the MyProp web terminal candle source, bucket timing, and OHLC behavior over a two-minute `XAUUSD` `M1` window.
