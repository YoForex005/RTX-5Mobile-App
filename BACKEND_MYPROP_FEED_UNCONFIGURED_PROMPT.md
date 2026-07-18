# Backend Work Request: Restore Live Market Data for RTX5 Mobile (MyProp Trade)

**Priority:** P0 — Quotes / Chart / Trade blocked  
**App:** RTX5 Mobile (React Native)  
**Broker:** MyProp Trade (`broker_id: myprop-trade`)  
**Owner:** Backend / Market-data / Auth  
**Date:** 2026-07-18  

---

## 1. Executive summary

Mobile Quotes shows:

> **Market Data Unavailable · Myprop Trade**  
> **Broker feed is not configured**  
> Status: Connecting… · Speed: 0 tps  

**This is a backend contract gap, not a mobile UI bug.**

Live probe of the MyProp feed status endpoint is healthy. Mobile still cannot open the quote WebSocket because **login/refresh does not return an explicit feed authentication contract** (`feed_auth_context` + credential). Mobile fails closed by design and will **not** invent query-token auth or use a compile-time env feed secret.

| Layer | Result | Evidence |
|---|---|---|
| Feed status HTTP | Healthy | `GET https://services.myprop.trade/ws/feed/status?broker_id=myprop-trade` → 200, `feed_active_source=cserver`, `upstream_connected=true`, `cserver_connected=true`, ~341 symbols |
| Mobile quote WS | Blocked | Session `feedAuthContext.mode = disabled_unconfigured` → transport not configured → WS URL builder refuses to connect |
| Root cause | Backend | Missing/incomplete auth handoff for market data |

---

## 2. Goal

Make authenticated mobile sessions for MyProp able to:

1. Receive a valid **feed auth contract** from login/refresh  
2. Open **quote WebSocket** with the advertised query params  
3. Receive **live bid/ask ticks** for watchlist symbols  
4. Receive **complete feed status** so mobile can mark health healthy and allow price-dependent actions  

---

## 3. What you must inspect (in order)

### Step A — Login response (primary blocker)

```http
POST {myprop_server_url}/api/v2/auth/login
Content-Type: application/json

{
  "username": "<test_login>",
  "password": "<test_password>",
  "broker_id": "myprop-trade"
}
```

**Required JSON shape for mobile (secrets redacted in logs):**

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<token>",
  "expires_in": 86400,
  "account_login": "123456",
  "broker_id": "myprop-trade",
  "server": "Myprop Trade",
  "feed_token": "<opaque-feed-credential>",
  "feed_auth_context": {
    "mode": "query",
    "credential": "feed_token",
    "token_query_param": "token",
    "broker_id_query_param": "broker_id",
    "account_login_query_param": "account_login"
  }
}
```

#### Field rules (mobile parser is strict)

| Field | Required | Rules |
|---|---|---|
| `access_token` (or `token`) | Yes | Trading API JWT |
| `refresh_token` | Strongly required | Session refresh |
| `account_login` | Yes | Account identity (also accepted under nested `user`) |
| `broker_id` | Yes | Must equal selected broker (`myprop-trade`) |
| **`feed_auth_context`** | **Yes** | Object. Alias `feed_auth` also accepted. **Token alone is ignored.** |
| `feed_auth_context.mode` | Yes | `"query"` for query-string WS auth. `"none"` only if feed needs no auth **and** `auth_required: false` |
| `feed_auth_context.credential` | Yes when mode=query | Only `"feed_token"` or `"access_token"` |
| `feed_auth_context.token_query_param` | Yes when mode=query | Safe name: `^[A-Za-z_][A-Za-z0-9_.-]*$` (e.g. `"token"`). No `&` or spaces |
| `broker_id_query_param` | Optional | If set, mobile appends active broker id |
| `account_login_query_param` | Optional | If set, mobile appends active account login |
| `feed_token` | Yes when credential=`feed_token` | Also accepted: `feed_broker_token`, `broker_feed_token`, `ws_feed_token`, nested under `feed` / `feed_auth` |

#### Mobile mapping if backend is incomplete

| Backend response | Mobile session result | User-visible effect |
|---|---|---|
| No `feed_auth_context` / `feed_auth` | `{ mode: "disabled_unconfigured", reason: "missing_contract" }` | Banner: feed not configured · **no WS** · 0 tps |
| Contract says `feed_token` but token missing | `{ mode: "disabled_unconfigured", reason: "missing_credential" }` | Banner: credentials unavailable · **no WS** |
| Valid `mode: "query"` + token + param names | Transport enabled | Mobile builds WSS URL and connects |
| `mode: "none"` + `auth_required: false` | Open feed | Mobile connects without credential query |

---

### Step B — Refresh response (same contract)

```http
POST {myprop_server_url}/api/v2/auth/refresh
```

Must be able to return:

- refreshed `access_token` / `refresh_token`
- **fresh `feed_token`** when feed credentials rotate
- same `feed_auth_context` shape (or stable equivalent)

If refresh drops feed credential/contract, mobile reconnect fails closed after token refresh.

---

### Step C — Feed status endpoint (health / trade enablement)

```http
GET https://services.myprop.trade/ws/feed/status?broker_id=myprop-trade
```

**Current live observation (partial):**

- Present: `feed_active_source`, `available_symbols`, `upstream_connected`, `cserver_connected`, `providers`, `symbol_status`, `feed_auth_required=true`
- **Missing:** `auth_accepted` (boolean)
- **Missing:** health threshold policy (`health_policy` / equivalent)

**Target status payload:**

```json
{
  "feed_active_source": "cserver",
  "feed_auth_required": true,
  "auth_accepted": true,
  "upstream_connected": true,
  "cserver_connected": true,
  "feed_provider": "equinix",
  "providers": [
    { "id": "equinix", "connected": true, "last_tick_age_sec": 0, "symbols_streaming": 100 },
    { "id": "t4b", "connected": false, "last_tick_age_sec": null, "symbols_streaming": 0 }
  ],
  "available_symbols": ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"],
  "symbol_status": [
    { "symbol": "EURUSD", "fresh": true, "stale": false, "tradable": true },
    { "symbol": "BTCUSD", "fresh": true, "stale": false, "tradable": true }
  ],
  "stale": false,
  "degraded": false,
  "scheduled_market_closed": false,
  "market_available": true,
  "health_policy": {
    "local_tick_stale_after_ms": 15000,
    "server_status_stale_after_ms": 30000
  }
}
```

#### How mobile interprets status

| Field | Mobile use |
|---|---|
| `feed_active_source` or non-empty `available_symbols` | `feedConfigured = true` |
| `auth_accepted` | **Must be boolean.** Missing ≠ true. Missing keeps health incomplete; price actions stay blocked |
| `upstream_connected` / active provider `connected` / `cserver_connected` | Provider/upstream health |
| `market_available` / fresh+tradable `symbol_status` | Market availability |
| `stale` / `degraded` | Degraded banner / delayed prices |
| `scheduled_market_closed` or `market_schedule: "closed"` | Scheduled close path |
| `health_policy.local_tick_stale_after_ms` | Local tick aging for healthy/action allow |
| `health_policy.server_status_stale_after_ms` | Status aging for healthy/action allow |

**Note:** Even after WS ticks arrive, if `auth_accepted` is not `true` or thresholds are missing, mobile may show read-only/stale behavior and **block trade actions**.

---

### Step D — Quote WebSocket

After login contract is valid, mobile opens:

```text
wss://services.myprop.trade/ws/feed?token=<feed_token>&broker_id=myprop-trade
```

Query parameter **names** come only from `feed_auth_context` (not hardcoded forever).

Mobile subscribe message:

```json
{ "type": "subscribe", "symbols": ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"] }
```

Backend must:

1. Accept the advertised query auth when `feed_auth_required=true`
2. Reject bad/expired tokens with WS close **1008** or **4001** (auth failure)
3. Stream ticks including at least: **symbol, bid, ask, time** (monotonic enough for candle building)
4. Keep ticks flowing for subscribed symbols while status claims healthy
5. Not go silent on major pairs while residual crypto shows stale retained UI data

---

### Step E — Broker directory (secondary)

```http
GET https://superbackend.orrnn.com/api/v2/broker/servers
```

Confirm MyProp record has exact HTTPS/WSS endpoints:

| Field | Expected |
|---|---|
| `broker_id` | `myprop-trade` |
| `server_url` / API root | HTTPS service root used for `/api/v2` |
| `feed_wss_url` | `wss://services.myprop.trade/ws/feed` |
| `feed_status_https_url` | `https://services.myprop.trade/ws/feed/status` |
| `services_domain` | Host-aligned with feed/API URLs |

Long-term preferred envelope:

```json
{
  "schema_version": "broker-directory.rich.v1",
  "brokers": [ /* approved records */ ]
}
```

---

## 4. How mobile decides what to do (contract decision tree)

```text
LOGIN / REFRESH
  └─ parse feed_auth_context (or feed_auth)
       ├─ missing / invalid mode / missing token_query_param
       │    → disabled_unconfigured (missing_contract)
       │    → Quotes banner critical
       │    → DO NOT open WebSocket
       │    → Speed 0 tps, symbols "Connecting..."
       │
       ├─ mode=query, credential=feed_token, but feed_token missing
       │    → disabled_unconfigured (missing_credential)
       │    → DO NOT open WebSocket
       │
       └─ mode=query + credential + token_query_param + token present
            → transportConfigured = true (when feedWsBase + feedStatusUrl exist)
            → open WSS with query params from contract
            → GET feed status
            → on live bid+ask websocket ticks → local health can become healthy
            → trade actions require:
                 auth_accepted === true
                 + provider/upstream healthy
                 + thresholds present
                 + fresh local ticks
```

### Frontend will NOT do

- Use `EXPO_PUBLIC_FEED_BROKER_TOKEN` or any compile-time feed secret  
- Infer `mode: "query"` from `feed_auth_required: true` alone  
- Fabricate executable bid/ask  
- Open feed WS when auth contract is missing  
- Treat missing `auth_accepted` as authenticated  

---

## 5. Implementation checklist (backend)

### P0 — Unblocks Quotes live prices

- [ ] Login always returns `feed_auth_context` for MyProp (and every broker with `feed_auth_required=true`)
- [ ] Login always returns `feed_token` when `credential: "feed_token"`
- [ ] Refresh can rotate/return `feed_token` + same context
- [ ] Feed gateway accepts query params advertised in context
- [ ] Invalid token closes socket with 1008/4001
- [ ] Live ticks for EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD under market-open conditions

### P1 — Unblocks healthy banner + trade enablement

- [ ] Status always includes boolean `auth_accepted`
- [ ] Status includes `market_available` (or reliable fresh+tradable `symbol_status`)
- [ ] Status includes `health_policy.local_tick_stale_after_ms` and `server_status_stale_after_ms`
- [ ] Status `stale` / `degraded` accurately reflect upstream quality

### P2 — Hardening

- [ ] Feed token bound to broker + account, short-lived, rotatable  
- [ ] No shared static feed secret expected from mobile env  
- [ ] Directory schema versioned rich envelope  

---

## 6. Acceptance criteria

After deploy, with a **fresh mobile login** (required; old sessions stay fail-closed):

| # | Check | Pass condition |
|---|---|---|
| 1 | Login body | Contains `feed_auth_context` + `feed_token` (when required) |
| 2 | Quotes banner | Critical “not configured” banner gone (or only true delay/outage) |
| 3 | Transport | Status not stuck on Connecting… forever |
| 4 | Throughput | Speed > 0 tps during market open |
| 5 | Symbols | EURUSD / GBPUSD / USDJPY / XAUUSD / BTCUSD show live bid/ask (not permanent Connecting) |
| 6 | Status | `auth_accepted: true` for authorized session |
| 7 | Trade path | Price actions allowed only when healthy (not blocked by missing policy) |

---

## 7. Required response back to mobile / QA

Please reply with this report after the fix (redact all secrets):

```text
================================================================
RTX5 MOBILE FEED FIX REPORT — myprop-trade
================================================================

1) Symptom retested
   - broker_id:
   - account_login: [redacted]
   - Quotes banner before:
   - Quotes banner after:

2) Login response keys (values redacted)
   - access_token present: yes/no
   - refresh_token present: yes/no
   - feed_token present: yes/no
   - broker_id:
   - account_login present: yes/no
   - feed_auth_context:
     {
       "mode": "...",
       "credential": "...",
       "token_query_param": "...",
       "broker_id_query_param": "...",
       "account_login_query_param": "..."
     }
   - exact login path tested:

3) Refresh response
   - feed_token rotated/returned: yes/no
   - feed_auth_context returned: yes/no

4) Feed status
   - URL:
   - HTTP status:
   - auth_accepted:
   - upstream_connected:
   - cserver_connected:
   - feed_active_source:
   - feed_provider:
   - health_policy:
   - sample symbol_status for EURUSD + BTCUSD:

5) WebSocket probe
   - connect URL shape (token redacted):
     wss://services.myprop.trade/ws/feed?token=***&broker_id=myprop-trade
   - subscribe symbols tested:
   - first tick received for EURUSD (age/latency):
   - first tick received for BTCUSD:
   - auth reject close code (if tested invalid token):

6) Explicit instruction for frontend team
   - [ ] Re-login only (no app rebuild)
   - [ ] App rebuild required (explain why)
   - [ ] Additional frontend change required (describe exact change)
   - [ ] No frontend change required

7) If still failing
   - provider/upstream logs:
   - silent symbols count:
   - last backend receive vs broadcast times:
================================================================
```

---

## 8. Scope notes

- **In scope:** MyProp Trade first; apply same contract to all brokers where `feed_auth_required=true` (GTA, Achiever, etc.) so mobile does not regress per broker.
- **Out of scope for this ticket:** Changing mobile Quotes list UI, inventing frontend fallbacks, or reintroducing env-compiled feed tokens.
- **Security:** Never return long-lived global feed secrets intended for mobile env files. Issue session-bound feed credentials at auth time.

---

## 9. One-line ask

**Please add `feed_auth_context` + `feed_token` to MyProp login/refresh, ensure `/ws/feed` accepts that query contract, and complete `/ws/feed/status` with `auth_accepted` (and health thresholds) so RTX5 mobile can connect live quotes and enable price actions safely.**
)
