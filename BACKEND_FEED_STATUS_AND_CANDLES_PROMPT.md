# Backend Prompt: Feed Status Auth + Candle History Contract (RTX5 Mobile)

**Priority:** P0  
**Broker:** MyProp Trade (`myprop-trade`) and any broker with `feed_auth_required=true`  
**App:** RTX5 Mobile  

---

## Symptoms on mobile

1. **Quotes / Chart banner:** `Prices Delayed` · `Live connection was interrupted` · Speed 0 tps · symbols `Connecting...`
2. **Chart body:** `Unable to load chart` · `Candle history contract is unconfigured...`  
   (chart history path is also a **mobile env** setting; backend still must keep candle REST stable)

---

## What we proved against live MyProp

### A) Feed WebSocket works with the shared feed token

```text
wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=<FEED_TOKEN>
subscribe: {"type":"subscribe","symbols":["EURUSD","BTCUSD"]}
→ {"type":"subscribed",...}
→ live bid/ask ticks for EURUSD and BTCUSD
```

So the feed is **not dead**. Mobile can stream when the token is on the socket.

### B) Status endpoint flips `auth_accepted` based on token

| Request | Result |
|---|---|
| `GET /ws/feed/status?broker_id=myprop-trade` (no token) | `auth_accepted: false` |
| `GET /ws/feed/status?broker_id=myprop-trade&token=<FEED_TOKEN>` | `auth_accepted: true` |

### C) Login still does **not** return feed auth fields

```http
POST /api/v2/auth/login
```

Returns: `access_token`, `refresh_token`, `account_login`, `broker_id`, …  
**Missing:** `feed_token`, `feed_auth_context`

### D) Candle REST works when authenticated with JWT

```http
GET /api/v2/candles/BTCUSD?timeframe=M1&limit=5
Authorization: Bearer <access_token>
→ 200 + {"candles":[...]}
```

Also works:

- `/api/v2/candles/{symbol}?tf=M1&count=5`
- `/api/v2/market-data/candles/{symbol}?timeframe=M1&limit=5`

---

## Why mobile showed “Live connection was interrupted”

Mobile health probe used to call **status without the feed token**.

Backend then returned `auth_accepted: false`.  
Mobile health state treats that as **auth failure** and **blocks opening** the quote WebSocket (or keeps reconnecting).  
UI maps the reconnect/close path to:

> Live connection was interrupted

Even though the feed works when called with a token.

**Frontend fix (done on mobile):** status probe now attaches `token` + `broker_id` using the same query contract as the feed WS (env token or login feed token).

**Backend still should fix the contract** so mobile does not depend on a shared env secret.

---

## What backend must do

### 1) Login / refresh must issue market-data credentials

On successful `POST /api/v2/auth/login` and `POST /api/v2/auth/refresh`:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "account_login": 200002,
  "broker_id": "myprop-trade",
  "feed_token": "<short-lived market data token>",
  "feed_auth_context": {
    "mode": "query",
    "credential": "feed_token",
    "token_query_param": "token",
    "broker_id_query_param": "broker_id",
    "account_login_query_param": "account_login"
  }
}
```

Rules:

- Do not require mobile to ship a compile-time env feed secret.  
- Token alone is not enough — include `feed_auth_context`.  
- Refresh must rotate/return `feed_token` when it expires.

### 2) Document status authentication semantics

Choose **one** clear policy and stick to it:

**Option A (recommended):**  
Public status without token returns:

```json
{
  "auth_accepted": null,
  "feed_auth_required": true,
  "upstream_connected": true,
  "cserver_connected": true,
  "feed_active_source": "cserver",
  ...
}
```

- Use `null` / omit `auth_accepted` when no credential was supplied.  
- **Do not** return `auth_accepted: false` for anonymous probes (that means “reject credentials”).

**Option B:**  
Status requires the same query token as the feed:

```text
GET /ws/feed/status?broker_id=myprop-trade&token=<feed_token>
→ auth_accepted: true|false
```

Then document that mobile must always send the token (mobile now does this).

### 3) Keep candle history contract stable

Preferred documented path for mobile:

```text
GET {broker_api}/api/v2/candles/{symbol}?timeframe={tf}&limit={n}
Optional: &from={unixSec}&to={unixSec}
Authorization: Bearer <access_token>
```

Response:

```json
{
  "candles": [
    { "time": 1784376420, "open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15, "volume": 10 }
  ]
}
```

- `time` = Unix **seconds** (bucket start)  
- Valid OHLC  
- 401 when JWT missing/invalid  

Mobile env for this broker family:

```env
EXPO_PUBLIC_CANDLE_HISTORY_PATH=candles
EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE=timeframeLimit
```

If you change path/query style, tell frontend the exact values (do not force mobile to probe).

### 4) Feed WebSocket contract (confirm)

```text
wss://services.myprop.trade/ws/feed?token=<feed_token>&broker_id=myprop-trade
```

Subscribe:

```json
{ "type": "subscribe", "symbols": ["EURUSD", "BTCUSD"] }
```

Ticks:

```json
{ "symbol": "EURUSD", "bid": 1.14, "ask": 1.14, "time": 1721300000.12 }
```

Invalid token → close `1008` or `4001`.

---

## Frontend vs backend ownership

| Issue | Owner | Status |
|---|---|---|
| Chart: “Candle history contract is unconfigured” | **Frontend env** missing `EXPO_PUBLIC_CANDLE_HISTORY_PATH` + `QUERY_STYLE` | Fixed in mobile `.env` when set to `candles` + `timeframeLimit` |
| Quotes: connection interrupted due to status `auth_accepted:false` without token | **Both** — mobile now sends token on status; backend should not misuse `auth_accepted:false` for anonymous probes | FE fix + BE contract |
| Login missing `feed_token` / `feed_auth_context` | **Backend** | Still required for production security |
| Live ticks themselves | **Backend OK** when token present | Verified |

---

## Response backend should return to mobile/QA

```text
1) Login sample keys (redacted): has feed_token? has feed_auth_context?
2) Status without token: auth_accepted value + meaning
3) Status with token: auth_accepted value
4) Candle path confirmed: /api/v2/candles/{symbol}?timeframe=&limit=
5) WS subscribe + first tick ages for EURUSD/BTCUSD
6) FE instruction: re-login only / rebuild env / no further FE change
```

---

## One-line ask

**Return feed credentials on login/refresh, make status `auth_accepted` semantics honest (null when unauthenticated, true/false only after credential check), and keep `GET /api/v2/candles/{symbol}?timeframe=&limit=` stable with JWT so mobile Quotes/Chart stay live without a shared env secret.**
)
