# Backend Realtime Speed Fix Plan

Audit date: 2026-06-25

Scope: RTX5 mobile frontend in `rtx5-app`.

Related map: `BACKEND_DATA_FLOW_MAP.md`

Goal: make every user-visible trading data path feel superfast by keeping already-fast quote paths fast, fixing slow backend paths, and replacing slow polling repair loops with reliable backend push events.

## Executive Summary

The frontend is already optimized for fast bid/ask display. The fastest path is:

```text
Backend quote feed
`-- WSS /ws/feed
    `-- QuotesWebSocketService
        `-- subscribeToSymbol()
            `-- direct per-symbol listener
                `-- UI commit by requestAnimationFrame or 16 ms timer
```

So when bid/ask is still slow or shows gaps, the frontend is usually waiting on backend feed cadence, backend first snapshot, backend WSS reliability, or missing/stale socket messages.

The slow paths are mostly not the bid/ask row renderer. The slow paths are:

```text
Slow areas
|-- Position/order lifecycle
|   `-- Frontend uses a 3 second REST fallback poll when WS events lag or miss.
|
|-- Chart candle history
|   `-- Backend /candles is documented in code as multi-second for larger limits.
|
|-- Initial account/trade bootstrap
|   `-- Multiple REST requests run in parallel, but positions/orders can require fallback requests.
|
|-- Candle realtime routing
|   `-- Candle WS must include symbol/timeframe metadata or frontend cannot safely route messages.
|
|-- iOS WSS reliability
|   `-- Frontend falls back when broker WSS opens silently but sends no ticks.
```

Backend should not make every data type a high-frequency stream. The correct model is:

```text
Use WebSocket for:
|-- bid/ask quote ticks
|-- account metrics
|-- open position updates
|-- order lifecycle events
|-- forming candle updates
`-- finalized candle close events

Use REST for:
|-- login and token refresh
|-- order placement commands
|-- close/modify commands
|-- initial history pages
|-- watchlist CRUD
|-- alerts CRUD
|-- calculators
`-- rare configuration/instrument metadata
```

## Speed Map

```text
Mobile data speed
|
|-- Superfast now, if backend feed is healthy
|   |
|   |-- Quotes screen bid/ask
|   |   |-- Source: WSS /ws/feed
|   |   |-- Frontend path: quotesWsService.subscribeToSymbol()
|   |   |-- UI wait: near-frame, 0 to 16 ms after JS receives tick
|   |   `-- Backend risk: slow tick cadence, missing first snapshot, stale socket
|   |
|   |-- Trade row bid/ask and row P/L
|   |   |-- Source: WSS /ws/feed
|   |   |-- Frontend path: direct symbol listeners
|   |   `-- Backend risk: quote feed does not push every fresh tick
|   |
|   `-- Chart bid/ask label
|       |-- Source: WSS /ws/feed
|       |-- Frontend path: useLiveSymbolQuote(symbol, active, 0)
|       `-- Backend risk: stale quotes, missing digits/point/tickSize
|
|-- Fast in frontend, but backend can still make it slow
|   |
|   |-- Trade summary floating P/L
|   |   |-- Source: quote WS plus positions state
|   |   |-- Frontend path: useLiveSymbolQuotes(all open position symbols, active, 0)
|   |   `-- Backend risk: missing positions or account metrics events
|   |
|   `-- Active chart forming candle
|       |-- Source: quote ticks and candle WS
|       |-- Frontend flush: 16 ms
|       `-- Backend risk: candle WS delayed or candle history stale
|
`-- Slow today / needs backend work
    |
    |-- New/closed/modified positions
    |   |-- Current safety net: REST fallback every 3 seconds on Trade screen
    |   |-- User symptom: close/order happens but list updates late
    |   `-- Backend fix: reliable positions.LOGIN and orders.LOGIN WS lifecycle events
    |
    |-- Order status after buy/sell/close/modify
    |   |-- Current path: REST command response plus later position refresh
    |   |-- User symptom: button action succeeds but UI waits for backend ledger sync
    |   `-- Backend fix: emit order and position events immediately after MT5 result
    |
    |-- Chart initial history and symbol/timeframe switch
    |   |-- Current code note: /candles can take seconds for big limits
    |   |-- User symptom: chart blank, late candles, stale tail
    |   `-- Backend fix: indexed candle store and fast initial-window API
    |
    `-- Startup account/trade load
        |-- Current path: /auth/me, /accounts, /positions, /orders, /instruments, /market/status
        |-- Current issue: generic /positions or /orders can require fallback scoped call
        `-- Backend fix: one login-scoped bootstrap snapshot or reliable scoped endpoints
```

## Target Timings

These are the backend targets needed for a "superfast" mobile feel.

```text
Quote feed
|-- Subscribe acknowledgement: under 100 ms
|-- First quote snapshot after subscribe: under 250 ms
|-- Backend ingest to mobile send: p95 under 150 ms
|-- Silent socket detection: backend heartbeat every 10 to 15 seconds
`-- No raw IP WS URLs; only valid domain WSS

Trade/order lifecycle
|-- Order POST response after MT5 result: p95 under 700 ms
|-- order.created/order.rejected/order.filled event: under 300 ms after backend result
|-- position.opened/updated/closed event: under 300 ms after backend result
|-- Account metrics update after position change: under 500 ms
`-- Full positions snapshot after subscribe/reconnect: under 500 ms

Candles
|-- Initial 300 to 600 bars: p95 under 500 ms
|-- Initial 2500 bars: p95 under 1500 ms
|-- Forming candle update after quote tick: under 250 ms
|-- Finalized candle at timeframe boundary: under 500 ms
`-- Candle WS subscribe snapshot: under 500 ms

Startup/bootstrap
|-- One account snapshot endpoint: p95 under 800 ms
|-- No serial fallback from generic positions to scoped positions
`-- Stable account/positions/orders/instruments payload in one response
```

## Backend Implementation Tree

```text
Backend realtime speed project
|
|-- Phase 1: Stabilize quote feed
|   |
|   |-- 1.1 Official quote endpoint
|   |   |-- Confirm one official endpoint: wss://<broker-domain>/ws/feed
|   |   |-- Keep fallback: wss://backend.orrnn.com/ws/feed
|   |   |-- Reject raw IP WS URLs in service discovery
|   |   `-- Ensure iOS-safe TLS certificate chain
|   |
|   |-- 1.2 Snapshot-on-subscribe
|   |   |-- On subscribe, immediately send latest cached quote for every symbol
|   |   |-- Do not wait for next market tick
|   |   `-- Include missing symbols in subscription error response
|   |
|   |-- 1.3 Tick fanout
|   |   |-- Ingest MT5/provider ticks into per-symbol topic
|   |   |-- Keep last-value cache per symbol
|   |   |-- Fan out only latest tick when client is behind
|   |   `-- Never queue old ticks so long that UI receives stale prices
|   |
|   |-- 1.4 Required quote message fields
|   |   |-- symbol
|   |   |-- bid
|   |   |-- ask
|   |   |-- server_time
|   |   |-- tick_time
|   |   |-- sequence
|   |   |-- digits
|   |   |-- point or tick_size
|   |   |-- volume when available
|   |   `-- spread when available
|   |
|   `-- 1.5 Observability
|       |-- Log subscribe time
|       |-- Log first snapshot latency
|       |-- Log tick ingest-to-send latency
|       |-- Log connection_id
|       `-- Expose quote feed gap metrics
|
|-- Phase 2: Replace slow trade polling with reliable push events
|   |
|   |-- 2.1 Official trade realtime endpoint
|   |   |-- Confirm one official endpoint: wss://<broker-domain>/ws/v2
|   |   |-- Support account-scoped channels
|   |   |-- positions.LOGIN
|   |   |-- orders.LOGIN
|   |   |-- account.LOGIN
|   |   `-- metrics.LOGIN if backend keeps this alias
|   |
|   |-- 2.2 Subscribe snapshot
|   |   |-- On positions.LOGIN subscribe, send full open position snapshot
|   |   |-- On orders.LOGIN subscribe, send current pending/recent order snapshot
|   |   |-- On account.LOGIN subscribe, send account metrics snapshot
|   |   `-- Mark snapshot messages with snapshot: true
|   |
|   |-- 2.3 Lifecycle events
|   |   |-- order.created
|   |   |-- order.accepted
|   |   |-- order.rejected
|   |   |-- order.filled
|   |   |-- order.cancelled
|   |   |-- position.opened
|   |   |-- position.updated
|   |   |-- position.closed
|   |   |-- account.metrics
|   |   `-- ledger.resync_required when backend cannot guarantee delta continuity
|   |
|   |-- 2.4 Event ordering
|   |   |-- Every event has sequence
|   |   |-- Every event has server_time
|   |   |-- Every event has login
|   |   |-- Every event has channel
|   |   |-- Backend sends events in account order
|   |   `-- Backend supports resubscribe after last_sequence or sends full snapshot
|   |
|   |-- 2.5 Command-result linkage
|   |   |-- POST /orders returns correlation_id
|   |   |-- POST /positions/{ticket}/close returns correlation_id
|   |   |-- POST /positions/{ticket}/modify returns correlation_id
|   |   `-- WS event includes the same correlation_id
|   |
|   `-- 2.6 Remove frontend dependence on 3 second repair poll
|       |-- Backend must emit close/open/update event reliably
|       |-- Backend must emit account.metrics after position change
|       |-- Backend must emit order rejected/failed reason
|       `-- Backend must send snapshot after reconnect
|
|-- Phase 3: Fix chart candle speed
|   |
|   |-- 3.1 Fast history API
|   |   |-- Optimize GET /candles/{symbol}
|   |   |-- Optimize GET /candles?symbol=...
|   |   |-- Add indexes by symbol, timeframe, time
|   |   |-- Return newest N candles with descending/ascending contract documented
|   |   |-- Enable gzip/br compression
|   |   |-- Avoid heavy nested response wrappers
|   |   `-- Return only required candle fields for mobile
|   |
|   |-- 3.2 Candle WS
|   |   |-- Official endpoint: wss://<broker-domain>/ws/v2
|   |   |-- Channel format: candles.SYMBOL.TIMEFRAME
|   |   |-- Example: candles.EURUSD.1m
|   |   |-- Send latest forming candle snapshot on subscribe
|   |   |-- Send forming candle replace_last events
|   |   `-- Send finalized candle append events at boundary
|   |
|   |-- 3.3 Required candle fields
|   |   |-- channel
|   |   |-- symbol
|   |   |-- timeframe
|   |   |-- time
|   |   |-- open
|   |   |-- high
|   |   |-- low
|   |   |-- close
|   |   |-- volume
|   |   |-- closed
|   |   |-- sequence
|   |   `-- server_time
|   |
|   `-- 3.4 Gap handling
|       |-- If backend misses candles, send gap/resync_required
|       |-- Provide REST page for missing range
|       |-- Do not send candles without symbol/timeframe
|       `-- Keep market-closed gaps explicit, not fake-filled
|
|-- Phase 4: Make startup/bootstrap fast
|   |
|   |-- 4.1 Add one mobile bootstrap endpoint
|   |   |-- GET /mobile/bootstrap?login=LOGIN
|   |   |-- Return auth user
|   |   |-- Return active account metrics
|   |   |-- Return open positions
|   |   |-- Return pending/recent orders
|   |   |-- Return favorite instruments/specs
|   |   |-- Return market status
|   |   `-- Return service discovery URLs
|   |
|   |-- 4.2 Or fix existing endpoints
|   |   |-- /positions must be login-scoped or clearly documented
|   |   |-- /positions/{login} must be the canonical account endpoint
|   |   |-- /orders must be login-scoped or clearly documented
|   |   `-- /orders/{login} must be the canonical account endpoint
|   |
|   `-- 4.3 Cache low-change data
|       |-- Instruments/specs can be cached server-side
|       |-- Broker config can be cached server-side
|       |-- Market status can use short TTL
|       `-- Account/positions/orders must stay fresh
|
`-- Phase 5: Clean API contracts and docs
    |
    |-- 5.1 Standardize payload names
    |   |-- Use ticket consistently for position ticket
    |   |-- Use order_ticket consistently for order ticket
    |   |-- Use price_open consistently for open price
    |   |-- Use price_current consistently for current price
    |   |-- Use profit consistently for floating/closed P/L on a position
    |   `-- Keep aliases only for backward compatibility
    |
    |-- 5.2 Fix versioned route confusion
    |   |-- Confirm if /api/account/transactions is correct behind /api/v2 base
    |   |-- Confirm if /api/account/equity-history is correct behind /api/v2 base
    |   |-- Confirm if /api/mt5/status is correct behind /api/v2 base
    |   |-- Confirm if /api/mt5/groups is correct behind /api/v2 base
    |   `-- Confirm if /api/mt5/account/create is correct behind /api/v2 base
    |
    |-- 5.3 Update OpenAPI/docs
    |   |-- Watchlist PUT body is array of { symbol, sort_order }
    |   |-- Calculator response shape must match real backend response
    |   |-- WebSocket channels must be documented
    |   |-- WebSocket message schemas must be documented
    |   `-- Error codes must be documented
    |
    `-- 5.4 Service discovery
        |-- api_base_url
        |-- quotes_ws_url
        |-- trade_ws_url
        |-- candles_ws_url
        |-- public_market_api_url
        `-- broker health/status
```

## Exact Backend Contracts To Implement

### 1. Quote Subscribe

Client sends:

```json
{
  "type": "subscribe",
  "symbols": ["EURUSD", "XAUUSD"]
}
```

Backend sends acknowledgement:

```json
{
  "type": "subscription_ack",
  "channel": "quotes",
  "symbols": ["EURUSD", "XAUUSD"],
  "status": "ok",
  "connection_id": "conn_123",
  "server_time": "2026-06-25T10:00:00.000Z"
}
```

Backend immediately sends latest cached quote for each symbol:

```json
{
  "type": "quote",
  "channel": "quotes.EURUSD",
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

Backend error example:

```json
{
  "type": "subscription_error",
  "channel": "quotes",
  "symbol": "BADSYMBOL",
  "code": "SYMBOL_NOT_FOUND",
  "message": "Symbol is not available for this broker/account",
  "server_time": "2026-06-25T10:00:00.000Z"
}
```

### 2. Trade Realtime Subscribe

Client sends:

```json
{
  "action": "subscribe",
  "channels": ["positions.123456", "orders.123456", "account.123456"]
}
```

Backend sends:

```json
{
  "type": "subscription_ack",
  "channels": ["positions.123456", "orders.123456", "account.123456"],
  "status": "ok",
  "connection_id": "conn_456",
  "server_time": "2026-06-25T10:00:00.000Z"
}
```

Then backend immediately sends snapshots:

```json
{
  "event": "positions.snapshot",
  "channel": "positions.123456",
  "login": "123456",
  "snapshot": true,
  "positions": [
    {
      "ticket": "987654",
      "symbol": "EURUSD",
      "type": "buy",
      "volume": 0.1,
      "price_open": 1.07000,
      "price_current": 1.07123,
      "profit": 12.3,
      "sl": 1.06500,
      "tp": 1.08000,
      "open_time": "2026-06-25T09:55:00.000Z"
    }
  ],
  "sequence": 10001,
  "server_time": "2026-06-25T10:00:00.000Z"
}
```

### 3. Position Closed Event

Backend sends within 300 ms after close result:

```json
{
  "event": "position.closed",
  "channel": "positions.123456",
  "login": "123456",
  "ticket": "987654",
  "correlation_id": "cmd_abc",
  "close_price": 1.07125,
  "profit": 12.5,
  "closed_time": "2026-06-25T10:00:01.000Z",
  "sequence": 10002,
  "server_time": "2026-06-25T10:00:01.050Z"
}
```

Backend also sends updated account metrics:

```json
{
  "event": "account.metrics",
  "channel": "account.123456",
  "login": "123456",
  "balance": 10012.5,
  "equity": 10012.5,
  "margin": 0,
  "margin_free": 10012.5,
  "margin_level": 0,
  "floating": 0,
  "sequence": 22001,
  "server_time": "2026-06-25T10:00:01.100Z"
}
```

### 4. Candle Subscribe

Client sends:

```json
{
  "action": "subscribe",
  "channel": "candles.EURUSD.1m"
}
```

Backend sends latest forming candle:

```json
{
  "event": "candle.replace_last",
  "channel": "candles.EURUSD.1m",
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

At boundary, backend sends finalized candle:

```json
{
  "event": "candle.append",
  "channel": "candles.EURUSD.1m",
  "symbol": "EURUSD",
  "timeframe": "1m",
  "time": "2026-06-25T10:00:00.000Z",
  "open": 1.07100,
  "high": 1.07150,
  "low": 1.07090,
  "close": 1.07135,
  "volume": 120,
  "closed": true,
  "sequence": 30020,
  "server_time": "2026-06-25T10:01:00.100Z"
}
```

## Backend Architecture Recommendation

```text
Realtime backend architecture
|
|-- Market data ingestion
|   |-- MT5/provider tick source
|   |-- Normalize symbol names
|   |-- Add server receive timestamp
|   |-- Add sequence per symbol
|   |-- Store latest quote in memory/Redis
|   `-- Publish to quote topic
|
|-- Quote gateway
|   |-- Manages WSS clients
|   |-- Tracks subscribed symbols
|   |-- Sends ack
|   |-- Sends latest snapshot immediately
|   |-- Fans out fresh quote ticks
|   |-- Coalesces when client is behind
|   `-- Sends heartbeat
|
|-- Candle builder
|   |-- Consumes quote ticks
|   |-- Builds OHLC by timeframe
|   |-- Persists finalized candles
|   |-- Publishes forming candle updates
|   `-- Publishes finalized candle append events
|
|-- Trade command service
|   |-- Handles POST /orders
|   |-- Handles POST /positions/{ticket}/close
|   |-- Handles POST /positions/{ticket}/modify
|   |-- Returns correlation_id
|   |-- Writes result
|   `-- Publishes order/position/account events
|
|-- Account ledger publisher
|   |-- Consumes MT5/account updates
|   |-- Publishes account metrics
|   |-- Publishes positions snapshot/deltas
|   |-- Publishes order lifecycle
|   `-- Supports reconnect snapshots
|
`-- Observability
    |-- API latency metrics
    |-- WS first snapshot latency
    |-- WS tick gap metrics
    |-- Event sequence gap metrics
    |-- Per-broker health
    `-- Per-symbol tick rate
```

## What To Fix First

```text
Week 1 / critical
|
|-- Quote feed
|   |-- Snapshot on subscribe
|   |-- Ack/error on subscribe
|   |-- Heartbeat
|   |-- connection_id and sequence
|   `-- WSS domain-only service discovery
|
|-- Trade lifecycle
|   |-- positions.LOGIN snapshot on subscribe
|   |-- position.closed event after close
|   |-- position.opened event after market order
|   |-- account.metrics event after any trade change
|   `-- order.rejected event with reason
|
`-- Backend docs
    |-- Write exact WS channel list
    |-- Write exact message schema
    `-- Write exact REST command response schema

Week 2 / important
|
|-- Candle history
|   |-- Optimize /candles initial window
|   |-- Add indexes/cache
|   |-- Add candle WS snapshot
|   `-- Add candle gap/resync message
|
|-- Bootstrap
|   |-- Add /mobile/bootstrap?login=LOGIN
|   `-- Or make /positions and /orders correctly account-scoped
|
`-- Observability
    |-- Add p95 latency dashboards
    |-- Add per-broker WS health
    `-- Add tick-rate dashboards

Week 3 / cleanup
|
|-- Remove duplicate/legacy realtime contracts
|-- Confirm /ws/feed, /ws/v2, /ws official ownership
|-- Fix /api/v2/api/... route confusion
|-- Align OpenAPI with real behavior
`-- Add automated backend contract tests
```

## Acceptance Tests For Backend Engineer

### Quote Feed Tests

```text
Test: subscribe EURUSD on /ws/feed
Expected:
|-- subscription_ack arrives under 100 ms
|-- first quote snapshot arrives under 250 ms
|-- message has symbol, bid, ask, digits, point/tick_size, sequence, server_time
|-- heartbeat arrives every 10 to 15 seconds
`-- no silent-open socket with zero ticks for subscribed active market symbol
```

```text
Test: subscribe 30 symbols
Expected:
|-- ack includes accepted/rejected symbols
|-- latest snapshot sent for all accepted symbols
|-- backend does not send old queued ticks after network lag
`-- server remains stable under mobile reconnects
```

### Trade Lifecycle Tests

```text
Test: place market order
Expected:
|-- POST /orders returns success or rejection with stable schema
|-- response includes correlation_id
|-- order.filled or order.rejected WS event includes same correlation_id
|-- position.opened arrives under 300 ms after backend result
`-- account.metrics arrives under 500 ms after backend result
```

```text
Test: close position
Expected:
|-- POST /positions/{ticket}/close returns success or rejection with stable schema
|-- response includes correlation_id
|-- position.closed event arrives under 300 ms after backend result
|-- closed ticket is removed by event, not by 3 second REST poll
`-- account.metrics arrives under 500 ms
```

```text
Test: reconnect while positions are open
Expected:
|-- subscribe positions.LOGIN
|-- backend sends positions.snapshot immediately
|-- snapshot is complete for that login
|-- next delta sequence is greater than snapshot sequence
`-- no stale positions from another login/account
```

### Candle Tests

```text
Test: GET /candles/EURUSD?timeframe=M1&count=600
Expected:
|-- p95 under 500 ms
|-- response has newest 600 usable bars
|-- all bars have time, open, high, low, close, volume
`-- response order is documented and consistent
```

```text
Test: subscribe candles.EURUSD.1m
Expected:
|-- ack under 100 ms
|-- latest forming candle under 500 ms
|-- every candle message includes symbol and timeframe
|-- forming candle uses closed: false
|-- finalized candle uses closed: true
`-- gap/resync_required is sent if backend detects a missing candle range
```

### iOS WSS Tests

```text
Test: use broker URLs returned by backend service discovery on iPhone
Expected:
|-- all WS URLs are wss:// domain URLs
|-- certificate chain is valid
|-- no raw IP websocket URL
|-- no cleartext ws:// URL
|-- socket receives ack/snapshot after open
`-- socket does not open silently and then send nothing
```

## Frontend Signals Backend Can Use For Debugging

```text
Frontend signal
|
|-- quotes.ws.gap
|   |-- Meaning: frontend had active quote symbols but no fresh quote messages
|   `-- Backend should inspect per-symbol tick cadence and client connection logs
|
|-- REST /quotes fallback every 1 second
|   |-- Meaning: direct WS quote tick is stale or missing
|   `-- Backend should inspect /ws/feed snapshot and tick delivery
|
|-- Trade screen REST refresh every 3 seconds
|   |-- Meaning: frontend still needs repair loop for positions/orders
|   `-- Backend should inspect positions.LOGIN/orders.LOGIN lifecycle events
|
|-- Candle history retry after 1s and 3s
|   |-- Meaning: initial candle history failed or timed out
|   `-- Backend should inspect /candles latency/errors
|
`-- iOS quote socket fallback
    |-- Meaning: broker WSS opened but sent no ticks
    `-- Backend should inspect WSS cert, routing, and subscription handling
```

## Final Backend Checklist

```text
Before marking backend done
|
|-- Quote feed
|   |-- [ ] Official /ws/feed endpoint confirmed
|   |-- [ ] Subscribe ack implemented
|   |-- [ ] Snapshot-on-subscribe implemented
|   |-- [ ] Sequence/server_time implemented
|   |-- [ ] Heartbeat implemented
|   `-- [ ] iOS WSS verified
|
|-- Trade realtime
|   |-- [ ] Official /ws/v2 trade channels confirmed
|   |-- [ ] positions.LOGIN snapshot implemented
|   |-- [ ] orders.LOGIN lifecycle implemented
|   |-- [ ] account.LOGIN metrics implemented
|   |-- [ ] correlation_id linked between REST command and WS event
|   `-- [ ] reconnect snapshot implemented
|
|-- Candles
|   |-- [ ] /candles initial window under target latency
|   |-- [ ] candle WS snapshot implemented
|   |-- [ ] forming candle replace_last implemented
|   |-- [ ] finalized candle append implemented
|   `-- [ ] gap/resync_required implemented
|
|-- Bootstrap/API
|   |-- [ ] /mobile/bootstrap added or scoped endpoints fixed
|   |-- [ ] /positions account scoping confirmed
|   |-- [ ] /orders account scoping confirmed
|   |-- [ ] /api/v2/api/... routes confirmed/fixed
|   `-- [ ] OpenAPI updated
|
`-- Observability
    |-- [ ] p95 API latency dashboard
    |-- [ ] p95 WS first snapshot dashboard
    |-- [ ] quote tick gap dashboard
    |-- [ ] trade lifecycle delay dashboard
    `-- [ ] per-broker realtime health dashboard
```

## Bottom Line

The app can already paint quote ticks fast when it receives them. Backend should focus on:

```text
1. Push latest quote snapshot immediately after subscribe.
2. Keep quote ticks flowing through stable WSS domain URLs.
3. Emit reliable order/position/account events so the app does not wait for 3 second REST repair polling.
4. Make candle history fast enough for first paint.
5. Standardize message schemas, sequence numbers, server_time, and subscription acks.
```

If these backend fixes are implemented, the frontend can show bid/ask, trade rows, account metrics, position close/open updates, and chart candles with a much more MT5-like realtime feel on both Android and iOS.
