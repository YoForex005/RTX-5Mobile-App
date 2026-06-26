# Backend Data Flow Map

Audit date: 2026-06-25

Scope: `rtx5-app` mobile frontend. This is a code-level audit of where the app uses REST/API and where it uses WebSocket for backend data.

## Short Summary

REST/API is used for login, account snapshots, positions/orders snapshots, order actions, broker config, instruments, watchlist, alerts, calculators, candle history, and fallback quote snapshots.

WebSocket is used for fast bid/ask quotes, live chart candles, account metrics, positions updates, and trade-facing realtime updates.

The app currently has more than one realtime path. The main active realtime services are the quotes feed, candle feed, and broker realtime service. There are also older/general WebSocket services still present in the codebase.

## Frontend Data Flow Tree

```text
RTX-5Mobile-App/
`-- rtx5-app/
    |-- app/_layout.tsx
    |   |-- On login/account ready
    |   |   |-- REST: bootstrapApp()
    |   |   `-- WS: brokerRealtimeService.connect()
    |   `-- On logout/account switch
    |       `-- WS: brokerRealtimeService.disconnect()/reconnect()
    |
    |-- src/services/bootstrapApp.ts
    |   |-- REST: /auth/me
    |   |-- REST: /accounts
    |   |-- REST: /positions, fallback /positions/{login}
    |   |-- REST: /orders, fallback /orders/{login}
    |   |-- REST: /instruments?favorites=true
    |   `-- REST: /market/status
    |
    |-- src/api/
    |   |-- apiClient.ts
    |   |   `-- Main REST wrapper. Delegates to brokerApi.request()
    |   |
    |   |-- brokerApi.ts
    |   |   |-- REST auth token injection
    |   |   |-- REST token refresh/retry after 401
    |   |   `-- WS URL helper for broker realtime
    |   |
    |   |-- brokerRouting.ts
    |   |   |-- REST base URL selection
    |   |   |-- Broker API base: {broker server_url}/api/v2
    |   |   |-- Fallback API: https://backend.orrnn.com/api/v2
    |   |   |-- Public broker directory: https://testsuperbackend.orrnn.com/api/v1
    |   |   `-- WS URL builder for /ws, /ws/feed, /ws/v2
    |   |
    |   `-- ws/
    |       |-- quotesSocket/QuotesWebSocketService.ts
    |       |   |-- WS: fast bid/ask quote feed
    |       |   |-- Default: wss://backend.orrnn.com/ws/feed
    |       |   |-- Broker hosted: {broker server_url}/ws/feed
    |       |   |-- Subscribe: { "type": "subscribe", "symbols": [...] }
    |       |   |-- Ping: { "type": "ping" }
    |       |   |-- Used by Quotes, Trade, Chart quote display
    |       |   `-- Falls back when broker socket is stale or fails before open
    |       |
    |       |-- quotesSocket/flushPipeline.ts
    |       |   |-- Batches quote store writes
    |       |   |-- Flush interval: 16 ms
    |       |   `-- Uses requestAnimationFrame where available
    |       |
    |       |-- quotesSocket/tickProcessor.ts
    |       |   |-- Normalizes incoming quote ticks
    |       |   |-- Emits per-symbol listeners immediately
    |       |   |-- Updates global quote store
    |       |   `-- Can extend active candles from quote ticks
    |       |
    |       |-- BrokerRealtimeService.ts
    |       |   |-- WS: trade-facing realtime bridge
    |       |   |-- URL from brokerApi.getWebSocketUrl()
    |       |   |-- Default family: /ws/v2
    |       |   |-- Subscribe: { "action": "subscribe", "channels": [...] }
    |       |   |-- Channels include ticks.*, positions.*, account.*, candles.*
    |       |   `-- Used by app bootstrap and trade-facing hooks
    |       |
    |       |-- accountSocket.ts
    |       |   |-- WS: account metrics and positions stream
    |       |   |-- Default: wss://backend.orrnn.com/ws/v2
    |       |   |-- URL includes JWT token query param
    |       |   |-- Subscribes to metrics.LOGIN, account.LOGIN, positions.LOGIN
    |       |   `-- Present as a service, but main active path appears to be brokerRealtimeService
    |       |
    |       `-- socket.ts
    |           |-- Legacy/general WS service
    |           |-- Default: wss://backend.orrnn.com/ws
    |           |-- Channels: prices, quotes.*, account.*, candles.*
    |           `-- Present in code, but not the main visible live-data path
    |
    |-- src/domain/candles/ws/
    |   `-- candlesSocket/CandlesWebSocketService.ts
    |       |-- WS: live chart candles
    |       |-- Default: wss://backend.orrnn.com/ws/v2
    |       |-- Broker hosted: {broker server_url}/ws/v2
    |       |-- Auth token appended when available
    |       |-- Subscribe for /ws/v2: { "action": "subscribe", "channel": "candles.SYMBOL.TIMEFRAME" }
    |       |-- Example channel: candles.EURUSD.1m
    |       `-- Used by chart live candle hooks
    |
    |-- src/query/websocket.ts
    |   |-- useMarketData()
    |   |   `-- WS: subscribes symbols through quotesWsService
    |   |-- useLiveSymbolQuote()
    |   |   |-- WS: per-symbol direct quote listener
    |   |   `-- REST fallback: /quotes?symbols=SYMBOL
    |   `-- useLiveSymbolQuotes()
    |       |-- WS: multi-symbol direct quote listeners
    |       `-- REST fallback when WS is not fresh
    |
    |-- src/features/quotes/
    |   |-- QuotesScreen.tsx
    |   |   |-- WS: live bid/ask from QuotesWebSocketService
    |   |   |-- REST: symbols/watchlist for symbol list and user watchlist
    |   |   `-- REST mutations: add/remove/reorder watchlist
    |   `-- useLiveQuotes.ts
    |       `-- WS/store bridge for quote snapshots
    |
    |-- src/features/chart/
    |   `-- ChartScreen.native.tsx
    |       |-- WS: live candles through useLiveCandles()
    |       |-- WS: live bid/ask through useLiveSymbolQuote()
    |       |-- REST: candle history
    |       |-- REST: instrument metadata
    |       |-- REST: orders/positions refresh
    |       `-- REST: order actions from chart trade controls
    |
    `-- src/features/trade/
        |-- TradeScreen/TradeScreen.tsx
        |   |-- WS: account/positions/quote realtime data
        |   |-- REST: focused fallback refresh for positions/orders
        |   `-- REST fallback interval around 3 seconds while focused
        |
        |-- TradeScreen/SummaryHeader.tsx
        |   `-- WS: live quote symbols for floating P/L and summary values
        |
        `-- OrderTicketScreen.tsx
            |-- WS: live tick/price display
            |-- REST: place market order
            |-- REST: place pending order
            |-- REST: margin calculation
            |-- REST: account summary
            |-- REST: instrument metadata
            `-- REST: symbols list
```

## WebSocket Inventory

| Area | File | Endpoint family | Purpose | Main payload style |
|---|---|---|---|---|
| Fast quotes | `src/api/ws/quotesSocket/QuotesWebSocketService.ts` | `/ws/feed` | Bid/ask quote ticks | `{ "type": "subscribe", "symbols": ["EURUSD"] }` |
| Trade realtime | `src/api/ws/BrokerRealtimeService.ts` | `/ws/v2` | Ticks, positions, account, candles | `{ "action": "subscribe", "channels": ["ticks.EURUSD", "positions.LOGIN"] }` |
| Live candles | `src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts` | `/ws/v2` | Chart candles | `{ "action": "subscribe", "channel": "candles.EURUSD.1m" }` |
| Account socket | `src/api/ws/accountSocket.ts` | `/ws/v2` | Account metrics and positions | `{ "action": "subscribe", "channel": "account.LOGIN" }` |
| Legacy socket | `src/api/ws/socket.ts` | `/ws` | Older general socket | channels such as `prices`, `quotes.*`, `account.*`, `candles.*` |

## REST/API Inventory

```text
REST/API
|-- Auth
|   |-- POST /auth/login
|   |-- POST /auth/register
|   |-- POST /auth/change-password
|   |-- POST /auth/refresh
|   `-- GET /auth/me
|
|-- Broker/config
|   |-- GET /broker/config
|   `-- GET /broker/servers
|
|-- Accounts
|   |-- GET /accounts
|   `-- GET /account/{login}
|
|-- Positions
|   |-- GET /positions
|   |-- GET /positions/{login}
|   |-- GET /positions/{login}/history
|   |-- POST /positions/{ticket}/close
|   `-- POST /positions/{ticket}/modify
|
|-- Orders
|   |-- GET /orders
|   |-- GET /orders/{login}
|   |-- GET /account/orders
|   |-- POST /orders
|   `-- POST /orders/pending
|
|-- Deals/history
|   |-- GET /account/deals
|   `-- GET /deals/{login}
|
|-- Instruments/market
|   |-- GET /instruments
|   |-- GET /instruments/{symbol}
|   |-- GET /instruments?favorites=true
|   |-- GET /market/status
|   `-- GET /market/status/{symbol}
|
|-- Quotes/candles
|   |-- GET /quotes?symbols=SYMBOL
|   |-- GET /candles/{symbol}
|   `-- Public fallback candle history through /api/v1/candles
|
|-- Calculators
|   |-- POST /calculate/margin
|   `-- POST /calculate/profit
|
|-- Watchlist
|   |-- GET /watchlist
|   |-- POST /watchlist/{symbol}
|   |-- DELETE /watchlist/{symbol}
|   `-- PUT /watchlist
|
|-- Alerts
|   |-- GET /alerts
|   |-- POST /alerts
|   `-- DELETE /alerts/{id}
|
`-- Other/support
    |-- GET /health
    |-- GET /exposure
    |-- GET /api/account/transactions
    |-- GET /api/account/equity-history
    |-- GET /api/mt5/status
    |-- GET /api/mt5/groups
    |-- POST /api/mt5/account/create
    |-- POST /email/send
    `-- POST /api/v1/public/demo-account
```

## Screen By Screen Usage

| Screen/feature | Uses REST/API | Uses WebSocket |
|---|---:|---:|
| Login/register | Yes | No |
| App startup/bootstrap | Yes | Yes |
| Quotes screen | Yes, for symbol list/watchlist | Yes, for live bid/ask |
| Chart screen | Yes, for candle history/instruments/orders | Yes, for live candles and bid/ask |
| Trade screen positions | Yes, for fallback refresh and actions | Yes, for live account/positions/quotes |
| Order ticket | Yes, for order placement/calculation/meta | Yes, for live price |
| Watchlist | Yes | Uses quote WS after symbols are known |
| Alerts | Yes | No direct alert WS found |
| Account history/deals | Yes | No direct history WS found |

## Backend Contract Expected By Mobile

### Quote Tick

The frontend accepts many aliases, but the backend should standardize this shape:

```json
{
  "type": "quote",
  "symbol": "EURUSD",
  "bid": 1.07123,
  "ask": 1.07135,
  "time": "2026-06-25T10:00:00.000Z",
  "digits": 5,
  "point": 0.00001,
  "volume": 123,
  "spread": 12
}
```

Important: `symbol`, `bid`, and `ask` are required. If symbol or bid/ask is missing, the frontend can drop the tick.

### Candle Tick

```json
{
  "channel": "candles.EURUSD.1m",
  "symbol": "EURUSD",
  "timeframe": "1m",
  "time": "2026-06-25T10:00:00.000Z",
  "open": 1.071,
  "high": 1.072,
  "low": 1.0705,
  "close": 1.0715,
  "volume": 50
}
```

Important: include `symbol` and `timeframe`. If they are missing, the frontend can only route safely when exactly one candle subscription is active.

### Account Metrics

```json
{
  "channel": "account.123456",
  "login": "123456",
  "balance": 10000,
  "equity": 10025.5,
  "margin": 500,
  "margin_free": 9525.5,
  "margin_level": 2005.1,
  "floating": 25.5,
  "time": "2026-06-25T10:00:00.000Z"
}
```

### Position Update

```json
{
  "channel": "positions.123456",
  "event": "position.updated",
  "login": "123456",
  "position": {
    "ticket": "987654",
    "symbol": "EURUSD",
    "type": "buy",
    "volume": 0.1,
    "price_open": 1.07,
    "price_current": 1.071,
    "profit": 10.5,
    "sl": 1.065,
    "tp": 1.08,
    "time": "2026-06-25T10:00:00.000Z"
  }
}
```

## What We Are Lacking / Backend Handoff

1. Standardize official WebSocket endpoints.

The frontend currently contains `/ws/feed`, `/ws/v2`, and older `/ws` paths. Backend should confirm which endpoint is official for quotes, candles, account metrics, positions, and order lifecycle events.

2. Add subscription acknowledgements and errors.

Backend should send clear responses for subscribe/unsubscribe:

```json
{
  "type": "subscription_ack",
  "channel": "quotes",
  "symbols": ["EURUSD"],
  "status": "ok",
  "connection_id": "abc123",
  "server_time": "2026-06-25T10:00:00.000Z"
}
```

Also send structured errors for invalid symbol, expired token, missing permission, market closed, and unsupported channel.

3. Send snapshot immediately after subscribe.

The app should not wait for the next market tick to show values. Backend should send the latest known quote/account/positions/candle snapshot immediately after subscription.

4. Improve iOS WebSocket reliability.

The frontend intentionally prefers secure domain-based WSS URLs. Backend should avoid raw IP WebSocket URLs and cleartext WS URLs, because iOS can block or fail them due to certificate and App Transport Security rules.

5. Add heartbeat with server time.

Every realtime connection should have ping/pong or heartbeat messages with `server_time`. This helps detect silent stale sockets, especially on iOS.

6. Add sequence numbers.

Quote, candle, account, and position messages should include a monotonically increasing `sequence` per connection/channel. This helps the app detect missing or out-of-order messages.

7. Make trade/position lifecycle WS reliable enough to reduce polling.

Trade and chart still use REST fallback refresh because position/order events can lag or be missed. Backend should send reliable events for:

```text
order.created
order.filled
order.rejected
order.cancelled
position.opened
position.updated
position.closed
account.metrics
```

8. Remove response alias ambiguity.

The frontend accepts different field names such as `ticket`, `position_ticket`, `order_ticket`, `price`, `price_open`, and `openPrice`. Backend should standardize one response schema for order and position payloads.

9. Confirm versioned REST route contract.

Some modules call paths like `/api/account/transactions`, `/api/account/equity-history`, and `/api/mt5/status` through the versioned API client. If the active base is already `/api/v2`, this can become `/api/v2/api/...`. Backend and frontend should confirm whether these routes are correct or should be unversioned/direct.

10. Fix or update backend docs/OpenAPI.

Known mismatches to confirm:

```text
Watchlist reorder:
- Frontend sends PUT /watchlist with an array of { symbol, sort_order }.
- Backend docs may show a different object shape.

Calculators:
- Frontend has defensive parsing for margin/profit responses.
- Backend docs should match the real response payload.
```

11. Make broker service discovery explicit.

The app builds REST and WS URLs from broker server data and fallback constants. Backend should return clear fields such as:

```json
{
  "server_url": "https://broker.example.com",
  "api_base_url": "https://broker.example.com/api/v2",
  "quotes_ws_url": "wss://broker.example.com/ws/feed",
  "trade_ws_url": "wss://broker.example.com/ws/v2",
  "candles_ws_url": "wss://broker.example.com/ws/v2",
  "public_market_api_url": "https://testsuperbackend.orrnn.com/api/v1"
}
```

12. Avoid hard-coded default symbol behavior.

`BrokerRealtimeService` has default channel behavior around `EURUSD` and `M1`. Backend should support dynamic multi-symbol subscriptions cleanly, and frontend should send the visible/active symbols instead of relying on one default symbol.

## Recommended Backend Priorities

```text
Priority 1
|-- Confirm official WS endpoints and channels.
|-- Guarantee WSS domain URLs for iOS.
|-- Send snapshot-on-subscribe for quotes/account/positions/candles.
`-- Add subscribe ack/error messages.

Priority 2
|-- Standardize quote, candle, account, and position payload schemas.
|-- Add heartbeat, server_time, connection_id, and sequence.
`-- Make order/position lifecycle events reliable enough to reduce REST polling.

Priority 3
|-- Clean up versioned REST route confusion.
|-- Align OpenAPI/docs with real watchlist and calculator behavior.
`-- Return explicit service-discovery URLs from broker config/directory.
```
