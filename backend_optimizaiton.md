# Backend Engineer Codex Prompt

Use this whole file as the prompt for the backend Codex agent.

## Prompt

You are the backend Codex agent for the RTX5 trading platform. Your job is to audit the mobile frontend implementation and the backend implementation together, without bias, and then fix the backend so realtime trading data in the React Native mobile app is as fast and accurate as the broker web terminal.

Do not assume the bug is only frontend or only backend. First prove where the delay comes from.

The main user problem is:

```text
The mobile app is not getting realtime data with the same speed and accuracy as the broker web terminal.

When the same broker/account/symbol is open side by side in:
|-- broker web terminal, for example MyProp
`-- RTX5 React Native mobile app

there should be no visible difference in:
|-- tick-by-tick bid/ask updates
|-- OHLC forming candle updates
|-- finalized candle close/open/high/low values
|-- open order state
|-- partial close state
|-- full close state
|-- account metrics
`-- position history/deal history after trading actions
```

The desired outcome is:

```text
1. Mobile quote ticks should match the broker web terminal feed as closely as technically possible.
2. Mobile OHLC candles should be built from the same tick source and same time buckets as the broker web terminal.
3. Open order, partial close, modify, and full close updates must arrive by WebSocket events.
4. The mobile app should not need slow REST polling to know that an order opened, partially closed, fully closed, or was rejected.
5. History should be consistent and fast: REST for paginated historical loading, WebSocket for live lifecycle deltas.
6. The backend should work across all brokers dynamically, not only one hard-coded broker.
```

## Frontend Repository To Inspect

Read the mobile frontend code before changing backend code. Important files:

```text
RTX-5Mobile-App/
|-- BACKEND_DATA_FLOW_MAP.md
|-- BACKEND_REALTIME_SPEED_FIX_PLAN.md
|-- rtx5-app/
    |-- .env
    |-- src/api/apiClient.ts
    |-- src/api/brokerApi.ts
    |-- src/api/brokerRouting.ts
    |-- src/api/ws/quotesSocket/QuotesWebSocketService.ts
    |-- src/api/ws/quotesSocket/tickProcessor.ts
    |-- src/api/ws/quoteTickNormalizer.ts
    |-- src/api/ws/quotesSocket/flushPipeline.ts
    |-- src/api/ws/BrokerRealtimeService.ts
    |-- src/api/ws/accountSocket.ts
    |-- src/api/ws/socket.ts
    |-- src/query/websocket.ts
    |-- src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts
    |-- src/domain/candles/ws/candlesSocketProtocol.ts
    |-- src/domain/candles/stream/liveCandleStream/types.ts
    |-- src/domain/candles/stream/liveCandleStream/historyRetryPolicy.ts
    |-- src/domain/candles/api/candles.ts
    |-- src/features/quotes/QuotesScreen.tsx
    |-- src/features/quotes/useLiveQuotes.ts
    |-- src/features/chart/ChartScreen.native.tsx
    |-- src/features/trade/TradeScreen/TradeScreen.tsx
    |-- src/features/trade/TradeScreen/SummaryHeader.tsx
    |-- src/features/trade/OrderTicketScreen.tsx
    |-- src/api/orders/
    |-- src/api/positions/
    `-- src/state/positionsState.ts
```

When reading `.env`, do not expose secret values in your report. Only use variable names and routing intent.

## Current Mobile App State

### 1. App Type

```text
Frontend app:
|-- Expo / React Native mobile app
|-- Android and iOS
|-- Uses REST/API for snapshots and commands
`-- Uses WebSocket for live quotes, live candles, account metrics, and position/account realtime updates
```

### 2. Broker Handling

The mobile app handles different brokers dynamically.

```text
Broker routing:
|-- Broker list comes from broker directory service
|-- Broker-specific REST API base is built from selected broker server URL
|-- Broker-specific API path is expected to be /api/v2
|-- Broker-specific WS URLs are built from selected broker domain
|-- Fallback API exists: https://backend.orrnn.com/api/v2
|-- Public broker directory is v1
`-- Public demo account service is v1
```

The frontend is domain-first:

```text
Domain-first broker fields checked by frontend:
|-- server_url
|-- market_api_url
|-- server_domain
|-- services_domain
|-- domain_name
|-- nested domains.*
|-- feed/ws URLs if returned
`-- legacy server
```

Important broker rule:

```text
server_ip must not be used as direct HTTPS/WSS origin for mobile.

Why:
|-- iOS App Transport Security and certificate validation can fail raw IP WSS
|-- WSS must use a valid broker domain certificate
|-- all broker API/WS service discovery should return HTTPS/WSS domain URLs
```

Backend must return clean service discovery for each broker:

```json
{
  "broker_id": "myprop",
  "server_url": "https://myprop-broker-domain.example.com",
  "api_base_url": "https://myprop-broker-domain.example.com/api/v2",
  "quotes_ws_url": "wss://myprop-broker-domain.example.com/ws/feed",
  "trade_ws_url": "wss://myprop-broker-domain.example.com/ws/v2",
  "candles_ws_url": "wss://myprop-broker-domain.example.com/ws/v2",
  "public_market_api_url": "https://testsuperbackend.orrnn.com/api/v1",
  "health": "ok"
}
```

### 3. REST/API Current State

The frontend REST wrapper is:

```text
apiClient()
`-- brokerApi.request()
    |-- injects broker access token
    |-- refreshes token when needed
    |-- retries once after auth failure
    `-- routes to active broker API base
```

Main REST usage:

```text
REST/API
|-- auth/login/register/refresh/me
|-- accounts snapshot
|-- positions snapshot
|-- orders snapshot
|-- order placement command
|-- close position command
|-- modify position command
|-- candle history
|-- instruments/specs
|-- market status
|-- watchlist CRUD
|-- alerts CRUD
|-- margin/profit calculators
|-- history/deals/transactions
`-- quote REST fallback when WS is stale
```

Known mobile fallback behavior:

```text
Quote REST fallback:
|-- GET /quotes?symbols=SYMBOL
|-- runs every 1 second only when direct WS tick is stale/missing
`-- should not be needed during healthy realtime quote WS

Trade screen fallback:
|-- focused Trade screen refreshes positions by REST every 3 seconds
|-- this exists because position/order WS events can lag or be missed
`-- backend should make this unnecessary for open/close/partial close state

Candle history fallback:
|-- initial chart load requests about 600 bars
|-- retry backoff is 1 second then 3 seconds after failure
`-- code comments indicate the backend /candles endpoint can be multi-second for large limits
```

### 4. WebSocket Current State

Current quote WebSocket:

```text
QuotesWebSocketService
|-- default endpoint: wss://backend.orrnn.com/ws/feed
|-- broker endpoint: wss://<broker-domain>/ws/feed
|-- subscribe payload: { "type": "subscribe", "symbols": ["EURUSD"] }
|-- ping payload: { "type": "ping" }
|-- used by Quotes screen, Trade rows, Trade summary, Chart bid/ask
|-- direct per-symbol listener: subscribeToSymbol()
|-- UI commit can happen by requestAnimationFrame or 16 ms timer
|-- frontend marks socket stale if active but silent for about 8 seconds
`-- frontend can fall back if broker WSS opens but sends no ticks on iOS
```

Current trade/account WebSocket:

```text
BrokerRealtimeService
|-- default endpoint family: /ws/v2
|-- URL from brokerApi.getWebSocketUrl()
|-- subscribe payload: { "action": "subscribe", "channels": [...] }
|-- channels include:
|   |-- ticks.EURUSD
|   |-- positions.LOGIN
|   |-- account.LOGIN
|   `-- candles.EURUSD.M1
|-- updates quote store
|-- updates live account metrics
`-- updates positions state
```

Important current limitation:

```text
BrokerRealtimeService still has default/hard-coded EURUSD/M1 behavior.
Backend should still support dynamic channel subscriptions cleanly.
Frontend may also need improvement if it is not subscribing to every active symbol/channel.
Audit both sides.
```

Current candle WebSocket:

```text
CandlesWebSocketService
|-- default endpoint: wss://backend.orrnn.com/ws/v2
|-- broker endpoint: wss://<broker-domain>/ws/v2
|-- channel format: candles.SYMBOL.TIMEFRAME
|-- example: candles.EURUSD.1m
|-- subscribe payload: { "action": "subscribe", "channel": "candles.EURUSD.1m" }
|-- requires symbol and timeframe metadata to route safely
`-- used by chart live candle stream
```

## Unbiased Audit Tasks

Before changing backend code, answer these questions with evidence:

```text
Frontend correctness audit
|
|-- Does mobile subscribe to the correct broker quote WS endpoint?
|-- Does mobile subscribe to the correct symbols for visible Quotes screen rows?
|-- Does mobile subscribe to all open-position symbols on Trade screen?
|-- Does mobile subscribe to the active chart symbol and timeframe?
|-- Does mobile wrongly drop valid backend tick payloads because of field names?
|-- Does mobile receive ticks but render them late?
|-- Does mobile receive account/position events but ignore them?
|-- Does mobile reconnect or fall back too aggressively?
|-- Does mobile use correct bid/ask side for buy/sell P/L?
`-- Does mobile handle partial close payloads correctly?

Backend correctness audit
|
|-- Does backend send subscribe acknowledgements?
|-- Does backend send latest quote snapshot immediately after subscribe?
|-- Does backend send quote ticks at the same cadence as broker web terminal?
|-- Does backend include symbol, bid, ask, tick time, server time, digits, point/tick size?
|-- Does backend send sequence numbers per symbol/channel?
|-- Does backend send heartbeat/pong?
|-- Does backend emit order.opened/order.filled/order.rejected events?
|-- Does backend emit position.opened/position.updated/position.partial_closed/position.closed events?
|-- Does backend emit account metrics after trade lifecycle changes?
|-- Does backend candle feed use the same tick source and bucket rules as web terminal?
|-- Does backend candle history match candle WS?
|-- Does backend return valid WSS domain URLs for every broker?
`-- Does backend handle MyProp and other broker-specific symbol mappings correctly?
```

## Realtime Requirements To Implement

### 1. Quote Tick Parity With Broker Web Terminal

Target:

```text
For the same broker/account/symbol:
|-- web terminal receives tick
`-- mobile receives same tick from backend with near-identical timing
```

Backend must implement:

```text
Quote backend
|-- Use the same upstream tick source as web terminal
|-- Normalize symbols consistently per broker
|-- Keep latest quote cache per broker/account/symbol
|-- Send snapshot immediately after subscribe
|-- Send every meaningful bid/ask change
|-- Do not delay ticks behind slow queues
|-- Coalesce only when client is behind, and only to latest tick
|-- Include sequence number
|-- Include tick_time from broker/source
|-- Include server_time when backend sent the event
|-- Include broker_id/account context when needed
`-- Include digits, point, tick_size, spread, volume when available
```

Required quote event:

```json
{
  "event": "quote.tick",
  "channel": "quotes.EURUSD",
  "broker_id": "myprop",
  "login": "123456",
  "symbol": "EURUSD",
  "bid": 1.07123,
  "ask": 1.07135,
  "digits": 5,
  "point": 0.00001,
  "tick_size": 0.00001,
  "spread": 12,
  "volume": 123,
  "tick_time": "2026-06-25T10:00:00.000Z",
  "server_time": "2026-06-25T10:00:00.050Z",
  "sequence": 991881
}
```

### 2. OHLC And Real Tick Sync With Web Terminal

The backend must prove OHLC is generated from the same tick source and same bucket boundaries as the broker web terminal.

Backend must implement:

```text
OHLC/candle backend
|-- Build candles from the same tick stream as quote feed
|-- Use broker/server time for bucket boundaries
|-- Use same timezone/session calendar as broker terminal
|-- Support forming candle updates by WS
|-- Support finalized candle append by WS
|-- REST history and WS candle stream must agree
|-- Send gap/resync event if candles are missing
`-- Do not fake-fill market-closed gaps unless broker terminal also does it
```

Required candle events:

```text
candle.replace_last
|-- forming candle update
|-- closed: false
`-- same symbol/timeframe as subscribed channel

candle.append
|-- finalized candle at timeframe boundary
|-- closed: true
`-- must match REST history and broker web terminal
```

Required candle event shape:

```json
{
  "event": "candle.replace_last",
  "channel": "candles.EURUSD.1m",
  "broker_id": "myprop",
  "symbol": "EURUSD",
  "timeframe": "1m",
  "time": "2026-06-25T10:00:00.000Z",
  "open": 1.07100,
  "high": 1.07140,
  "low": 1.07090,
  "close": 1.07123,
  "volume": 44,
  "closed": false,
  "sequence": 30001,
  "server_time": "2026-06-25T10:00:05.000Z"
}
```

### 3. Open Order, Close, And Partial Close By WebSocket Events

The mobile app may still send command requests by REST today. That is acceptable if the command response is fast and the lifecycle update comes by WS immediately.

The important requirement is:

```text
The mobile app must not wait for REST polling to know order/position state.
After open, partial close, modify, full close, or rejection, backend must push WS events immediately.
```

If backend chooses to support command-over-WebSocket too, implement it carefully with auth, idempotency, correlation IDs, and explicit ack/final events. But at minimum, backend must push lifecycle events by WebSocket after REST commands.

Required lifecycle channels:

```text
orders.LOGIN
positions.LOGIN
account.LOGIN
deals.LOGIN
history.LOGIN
```

Required lifecycle events:

```text
order.command_ack
order.accepted
order.rejected
order.filled
order.cancelled
position.opened
position.updated
position.partial_closed
position.closed
deal.created
history.appended
account.metrics
ledger.resync_required
```

Partial close event must include:

```text
partial close event
|-- original position ticket
|-- closed volume
|-- remaining volume
|-- close price
|-- realized profit/loss
|-- deal ticket
|-- correlation_id
|-- updated position object
|-- history/deal object
`-- account metrics after the change
```

Example partial close event:

```json
{
  "event": "position.partial_closed",
  "channel": "positions.123456",
  "broker_id": "myprop",
  "login": "123456",
  "ticket": "987654",
  "correlation_id": "cmd_abc",
  "closed_volume": 0.05,
  "remaining_volume": 0.05,
  "close_price": 1.07125,
  "realized_profit": 6.25,
  "deal_ticket": "555001",
  "position": {
    "ticket": "987654",
    "symbol": "EURUSD",
    "type": "buy",
    "volume": 0.05,
    "price_open": 1.07000,
    "price_current": 1.07125,
    "profit": 6.25,
    "sl": 1.06500,
    "tp": 1.08000
  },
  "deal": {
    "ticket": "555001",
    "position_ticket": "987654",
    "symbol": "EURUSD",
    "type": "partial_close",
    "volume": 0.05,
    "price": 1.07125,
    "profit": 6.25,
    "time": "2026-06-25T10:00:01.000Z"
  },
  "sequence": 10002,
  "server_time": "2026-06-25T10:00:01.050Z"
}
```

Example full close event:

```json
{
  "event": "position.closed",
  "channel": "positions.123456",
  "broker_id": "myprop",
  "login": "123456",
  "ticket": "987654",
  "correlation_id": "cmd_def",
  "closed_volume": 0.1,
  "close_price": 1.07125,
  "realized_profit": 12.5,
  "deal_ticket": "555002",
  "sequence": 10003,
  "server_time": "2026-06-25T10:00:02.050Z"
}
```

### 4. History Handling

Use this model:

```text
History model
|
|-- REST is canonical for large/paginated history
|   |-- closed positions
|   |-- deals
|   |-- transactions
|   |-- older orders
|   `-- candle history
|
`-- WebSocket is canonical for live history deltas
    |-- deal.created
    |-- history.appended
    |-- order lifecycle event
    |-- position.partial_closed
    `-- position.closed
```

Backend must make history fast and consistent:

```text
History requirements
|-- Closed position/deal appears by WS immediately after close/partial close
|-- REST history returns the same deal after refresh
|-- REST supports cursor or stable pagination
|-- REST supports from/to time filters
|-- REST supports login/account scoping
|-- REST uses stable ticket/deal IDs
|-- WS event and REST history row use the same IDs and timestamps
`-- No duplicate history rows after reconnect
```

Required history append event:

```json
{
  "event": "history.appended",
  "channel": "history.123456",
  "broker_id": "myprop",
  "login": "123456",
  "source_event": "position.closed",
  "row": {
    "ticket": "555002",
    "position_ticket": "987654",
    "symbol": "EURUSD",
    "type": "close",
    "volume": 0.1,
    "price": 1.07125,
    "profit": 12.5,
    "commission": 0,
    "swap": 0,
    "time": "2026-06-25T10:00:02.000Z"
  },
  "sequence": 40002,
  "server_time": "2026-06-25T10:00:02.050Z"
}
```

## Target Performance

Implement and measure against these targets:

```text
Quote feed
|-- subscribe ack: under 100 ms
|-- first quote snapshot: under 250 ms
|-- backend ingest to mobile WS send: p95 under 150 ms
|-- mobile vs web terminal visible tick delay: no visible delay
`-- if exact parity is impossible, provide measured p50/p95/p99 delta and reason

Trade lifecycle
|-- order command response: p95 under 700 ms after MT5/backend result
|-- order/position WS event after backend result: under 300 ms
|-- account metrics after trade change: under 500 ms
`-- no reliance on 3 second mobile REST repair poll for normal path

Candles
|-- first 300 to 600 REST bars: p95 under 500 ms
|-- forming candle WS update after tick: under 250 ms
|-- finalized candle event after bucket close: under 500 ms
`-- REST candle history must match WS finalized candles

Broker routing
|-- WSS domain URLs only
|-- no raw IP WS URLs
|-- iOS socket opens and receives ack/snapshot
`-- every broker returns correct api/ws service discovery
```

## Required Tests

Create backend tests and, if possible, an integration script that compares backend feed to the broker web terminal or same upstream source.

```text
Tests
|
|-- Quote WS
|   |-- subscribe returns ack
|   |-- first snapshot arrives
|   |-- tick fields are complete
|   |-- sequence increases
|   |-- heartbeat works
|   |-- invalid symbol returns structured error
|
|-- Broker parity
|   |-- MyProp EURUSD tick stream compared with web terminal/upstream
|   |-- bid/ask values match
|   |-- tick_time matches
|   |-- no unexpected missing ticks
|   `-- latency p50/p95/p99 reported
|
|-- Candles
|   |-- forming candle updates from tick stream
|   |-- finalized candle matches REST history
|   |-- bucket boundaries match broker terminal
|   `-- missing candle emits resync/gap event
|
|-- Trade lifecycle
|   |-- market order emits order.filled and position.opened
|   |-- rejected order emits order.rejected with reason
|   |-- partial close emits position.partial_closed and deal.created
|   |-- full close emits position.closed and history.appended
|   |-- account.metrics follows lifecycle event
|   `-- reconnect sends complete snapshot
|
|-- Multi-broker
|   |-- service discovery returns valid domain HTTPS/WSS URLs
|   |-- broker-specific symbol mapping works
|   |-- tokens and account scoping do not leak between brokers/accounts
|   `-- raw server_ip is not used as mobile WS/API origin
```

## Deliverables

When finished, provide:

```text
1. Unbiased audit report
   |-- frontend issues found
   |-- backend issues found
   |-- exact evidence
   `-- which side was changed

2. Backend implementation summary
   |-- endpoints changed
   |-- WS channels changed
   |-- message schemas added
   |-- broker routing/service discovery changes
   `-- compatibility notes for old mobile versions

3. Test evidence
   |-- quote feed tests
   |-- candle tests
   |-- trade lifecycle tests
   |-- multi-broker tests
   `-- iOS WSS domain verification

4. Parity measurement
   |-- broker used, for example MyProp
   |-- account type
   |-- symbol
   |-- timeframe
   |-- web terminal comparison method
   |-- mobile/backend WS comparison method
   |-- p50/p95/p99 latency
   |-- missing tick count
   |-- OHLC mismatch count
   `-- remaining limitations
```

## Important Implementation Guidance

Do not solve this by adding more frontend polling.

The mobile app already has fallback polling because backend push is not reliable enough. The backend fix should make these fallbacks unnecessary during the normal happy path:

```text
Do this:
|-- push quote snapshots and ticks by WS
|-- push order/position/account lifecycle by WS
|-- push live history deltas by WS
|-- keep REST for commands and paginated history
|-- support reconnect snapshots
|-- support sequence numbers and server_time
`-- support broker-specific domain WSS service discovery

Do not do this:
|-- ask mobile to poll faster
|-- use raw IP WS URLs
|-- send candles without symbol/timeframe
|-- send trade events without ticket/login/broker context
|-- make mobile guess partial close from delayed REST history
`-- use different quote/candle source than broker web terminal
```

## Final Acceptance Criteria

This backend work is done only when:

```text
1. Mobile and broker web terminal show the same tick direction/value with no visible delay for the same broker/symbol.
2. Mobile OHLC matches broker web terminal OHLC for the same symbol/timeframe.
3. Order open appears in mobile by WS event.
4. Partial close appears in mobile by WS event with remaining volume and deal history.
5. Full close removes the open position by WS event.
6. Closed/partial-close history appears by WS delta and then matches REST history.
7. Account balance/equity/margin/floating updates by WS after trade lifecycle changes.
8. iOS receives WSS ack/snapshot/ticks using valid domain WSS URLs.
9. Multiple brokers work through service discovery, not hard-coded broker URLs.
10. Backend provides logs/metrics proving where latency exists.
```

If any target cannot be met exactly, explain the technical reason and provide measured latency numbers instead of guessing.
