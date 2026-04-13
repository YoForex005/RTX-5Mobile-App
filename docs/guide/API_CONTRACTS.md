# RTX5 API Contracts (Single Source of Truth)

## Purpose
This file is the canonical frontend contract reference for RTX5 integration with the existing backend. All phase docs and implementation must conform to these types and policies.

## Contract Versioning Policy
- REST contract source: versioned OpenAPI document from backend.
- WebSocket contract source: versioned event schema document.
- Frontend compatibility rule:
1. Backward-compatible additions allowed without app break.
2. Breaking field changes require version bump and coordinated release.
- Generated client updates must happen in a dedicated PR with changelog notes.

## Canonical Public Interfaces
```ts
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO datetime
  deviceId: string;
  scopes: string[];
};

export type AccountSnapshot = {
  accountId: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  serverTime: string; // ISO datetime
};

export type QuoteTick = {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  dailyChangePct: number;
  timestamp: string; // ISO datetime
};

export type Candle = {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: string; // ISO datetime
};

export type Position = {
  positionId: string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  openPrice: number;
  markPrice: number;
  pnl: number;
  swap: number;
  openedAt: string; // ISO datetime
};

export type OrderTicketInput = {
  symbol: string;
  orderType:
    | "market_buy"
    | "market_sell"
    | "buy_limit"
    | "sell_limit"
    | "buy_stop"
    | "sell_stop"
    | "buy_stop_limit"
    | "sell_stop_limit";
  volume: number;
  price?: number;
  stopLimitPrice?: number;
  sl?: number;
  tp?: number;
  expirationType: "gtc" | "today" | "specified" | "specified_day";
  expirationAt?: string; // ISO datetime
  fillPolicy: "fok" | "ioc" | "return";
};

export type OrderSubmissionResult = {
  order_ticket: number;
  position_ticket: number;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  price: number;
  commission: number;
  status: string;
  action: string;
  time: number; // Unix timestamp
};

export type HistoryFilter = {
  from: string; // ISO date
  to: string; // ISO date
  symbol?: string;
  kind: "positions" | "orders" | "deals";
  sortBy:
    | "default"
    | "symbol"
    | "ticket"
    | "type"
    | "volume"
    | "openTime"
    | "closeTime"
    | "profit";
  sortDir: "asc" | "desc";
};

export type FeatureFlags = {
  oneClickTradingEnabled: boolean;
  bulkCloseEnabled: boolean;
  tradeFromChartEnabled: boolean;
  maintenanceMode: boolean;
  killSwitchTradeSubmit: boolean;
};
```

## REST DTO Mapping
| Endpoint | Method | Response DTO | Domain Type |
|---|---|---|---|
| `/v1/session` | POST | SessionDTO | `AuthSession` |
| `/v1/account/snapshot` | GET | AccountSnapshotDTO | `AccountSnapshot` |
| `/v1/quotes` | GET | QuoteListDTO | `QuoteTick[]` |
| `/v1/candles` | GET | CandleListDTO | `Candle[]` |
| `/v1/positions` | GET | PositionListDTO | `Position[]` |
| `/v1/orders` | POST | OrderSubmissionDTO | `OrderSubmissionResult` |
| `/v1/history` | GET | HistoryDTO | `HistoryFilter` driven view models |
| `/v1/flags/mobile` | GET | FeatureFlagsDTO | `FeatureFlags` |

## Temporary Chart History Integration Note
- Chart history is currently hydrated from `GET /api/v2/candles/GBPUSD?timeframe={tf}&limit=500`.
- Returned candle arrays are normalized client-side before rendering: ascending time order, one candle per timestamp, and OHLC bounds repaired so `high >= max(open, close)` and `low <= min(open, close)`.
- Live websocket candle updates continue after the REST bootstrap and are merged onto the normalized cache by timestamp.
- The frontend keeps the normalized REST snapshot and validates the initial history-to-live handoff against the first websocket candle, not the device clock alone, to tolerate backend feeds whose candle timeline lags local UTC but remains internally consistent.

## WebSocket Event Contracts
| Event | Payload | Handling |
|---|---|---|
| `quote.tick` | `QuoteTick` | Merge into quote cache by symbol and timestamp |
| `position.update` | `Position` | Upsert active position cache and recompute summary stats |
| `order.status` | `OrderSubmissionResult` | Update order state and trigger trade/history invalidations |
| `account.snapshot` | `AccountSnapshot` | Replace account header values in trade screen |
| `system.flag` | partial `FeatureFlags` | Apply kill switch and disable affected UI actions |

## WebSocket Transport Notes
- The V2 authenticated account stream is opened via `/ws/v2?token={JWT}` and subscribed by channel, not by REST-style event name.
- Live backend account metrics currently arrive on `metrics.{LOGIN}`. Older docs and some fallback payloads still refer to `account.{LOGIN}` or `account.snapshot`, so the frontend must accept both while treating the payload as the same authoritative account-metrics contract.
- `positions.{LOGIN}` may send either full open-position snapshots or partial per-ticket updates. The frontend must merge partial updates into existing local positions instead of zeroing omitted fields.
- The public market feed used by the chart is `ws://69.197.178.27/ws/feed` and the verified subscribe contract is `{ "type": "subscribe", "symbols": ["EURUSD", "XAUUSD"] }`. The same feed emits quote `tick` payloads with `bid`/`ask`/`timestamp` and candle `update` payloads shaped like `{ "type": "update", "symbol": "XAUUSD", "candle": { ... } }`; the frontend must continue accepting both shapes, but the canonical live chart path now derives the active candle from quote ticks, then heals it from recent REST history so backend-side candle-update timing or shape changes do not break live rendering.
- The live market feed may acknowledge broker-suffixed subscriptions such as `GBPUSDm` or `GBPUSD.c`, but verified runtime payloads still arrive under the canonical base symbol (for example `GBPUSD`). Frontend consumers must normalize both requested symbols and incoming payload symbols before matching, otherwise history can load while live candle updates are silently dropped.

## Error Shapes
```ts
export type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
  traceId?: string;
  details?: Record<string, unknown>;
};
```

## Retry Rules
- Retryable HTTP status: 408, 429, 500, 502, 503, 504.
- Query retry policy: max 3 attempts with exponential backoff.
- Order submission retries are disabled by default; user must explicitly retry.
- WebSocket reconnect uses capped exponential backoff with jitter.

## Validation Rules for Ticket Input
- `price` required for all pending order types.
- `stopLimitPrice` required for stop-limit orders.
- `expirationAt` required only when expiration type is `specified`.
- `volume` must match symbol lot step constraints from symbol metadata.

## Change Control
- Any change to the above types requires:
1. Update in this file.
2. Update in affected phase docs.
3. Contract test update in CI.

