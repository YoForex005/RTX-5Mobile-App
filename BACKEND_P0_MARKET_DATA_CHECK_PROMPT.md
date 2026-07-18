# Backend Prompt: RTX5 Market-Data Remaining Checks (All Brokers, All Symbols)

**Priority:** P0  
**App:** RTX5 Mobile (React Native / Expo)  
**Audience:** Backend auth + market-data / feed gateway / LP bridge / broker directory  
**Primary broker:** `myprop-trade` (services.myprop.trade) — **apply to every production broker** with `feed_auth_required=true`  
**Scope:** Investigation + fix + written proof. **Do not rewrite mobile architecture.**  
**Date context:** Weekend probes only exercise crypto; **every fix must be symbol-agnostic** (EURUSD, XAUUSD, BTCUSD, ETHUSD, …).

---

## How to use

Give this entire file to the backend team / backend AI agent.  
Return the **report template at the end**. Frontend will implement its companion prompt only after login handoff + status honesty land (or in parallel where noted).

---

## 0. What is already proven (do not re-debate)

Live external probes (2026-07-18, Saturday UTC) against MyProp:

| Fact | Evidence |
|------|----------|
| Quote WS + valid feed token streams ticks | Multi-symbol subscribe works |
| Hub receive→broadcast on **live** symbols | p95 **≤ 1 ms** (hub_publish − hub_ingest) |
| Path is **not BTCUSD-only** | Same session: BTCUSD, ETHUSD, BTC-PERP, ETHEUR all moved; FX flat because **market closed** |
| Tick payload contract is good | `symbol` + `bid` + `ask` always present; ask ≥ bid |
| Status has `health_policy` + `latency` on MyProp | Present |
| Login does **not** return feed handoff | Mobile still depends on legacy env token or fails closed |
| Unauthenticated status uses `auth_accepted: false` | Should be **null/omit** when no credential presented |
| Bad/missing WS token closes **1006** | Prefer **1008 / 4001** |
| GTA / Achiever status incomplete | Missing `auth_accepted` / `health_policy` / `latency` (prior multi-broker probe) |

**Implication:** Live tick *speed* on open markets is **not** the main remaining backend blocker. **Auth handoff + status honesty + multi-broker parity + market-closed honesty** are.

---

## 1. Canonical endpoints (MyProp example)

```text
broker_id:  myprop-trade
HTTPS:      https://services.myprop.trade
Login:      POST /api/v2/auth/login
Refresh:    POST /api/v2/auth/refresh
Feed WS:    wss://services.myprop.trade/ws/feed?token=<FEED_TOKEN>&broker_id=myprop-trade
Status:     GET  /ws/feed/status?broker_id=myprop-trade
            GET  /ws/feed/status?broker_id=myprop-trade&token=<FEED_TOKEN>
Candles:    GET  /api/v2/candles/{SYMBOL}?timeframe=M1&limit=500
            Authorization: Bearer <ACCESS_JWT>
```

Subscribe after WS open (all symbols same contract):

```json
{ "type": "subscribe", "symbols": ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "ETHUSD"] }
```

---

## 2. REQUIRED BACKEND CHECKS (do in order)

### Check A — Login / refresh feed handoff (P0 — production blocker)

**Problem:** Mobile will not invent a feed auth contract from `feed_token` alone. Without `feed_auth_context`, production path is:

- `disabled_unconfigured` / banner “Broker feed is not configured”, **or**
- legacy `EXPO_PUBLIC_FEED_BROKER_TOKEN` only (must go away).

**Must return on login AND refresh** when `feed_auth_required=true`:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "account_login": "...",
  "broker_id": "myprop-trade",
  "feed_token": "<opaque>",
  "feed_auth_context": {
    "mode": "query",
    "credential": "feed_token",
    "token_query_param": "token",
    "broker_id_query_param": "broker_id",
    "account_login_query_param": "account_login"
  }
}
```

**Rules:**

| Field | Rule |
|-------|------|
| `feed_auth_context` (alias `feed_auth`) | **Required** with mode+credential+token_query_param |
| `credential` | only `"feed_token"` or `"access_token"` |
| `feed_token` | Required when credential is `feed_token` |
| Refresh | May rotate `feed_token`; must re-send same context shape |
| Scope | **All** production brokers with feed auth required |

**Prove with redacted login/refresh JSON keys (no secret values).**

---

### Check B — Status honesty (P0)

```http
GET /ws/feed/status?broker_id=<id>
GET /ws/feed/status?broker_id=<id>&token=<feed_token>
```

| Case | Required `auth_accepted` |
|------|---------------------------|
| No credential | **omit or null** (NOT `false`) |
| Valid credential | `true` |
| Invalid credential | `false` |

Also publish (all brokers):

```json
{
  "feed_auth_required": true,
  "upstream_connected": true,
  "cserver_connected": true,
  "feed_active_source": "cserver",
  "feed_provider": "...",
  "market_available": true,
  "scheduled_market_closed": false,
  "stale": false,
  "degraded": false,
  "health_policy": {
    "local_tick_stale_after_ms": 2000,
    "server_status_stale_after_ms": 90000
  },
  "latency": {
    "last_backend_receive_age_ms": 0,
    "last_app_broadcast_age_ms": 0,
    "broadcast_queue_depth": 0
  },
  "symbol_status": [
    {
      "symbol": "EURUSD",
      "fresh": true,
      "stale": false,
      "tradable": true,
      "last_tick_age_sec": 0
    }
  ]
}
```

**Weekend / closed market honesty:**

- When FX is closed, `symbol_status` for majors must show `fresh=false`, `tradable=false`, and preferably top-level `scheduled_market_closed=true` (or per-symbol schedule).
- Do **not** force mobile to treat closed FX as “feed down” for the whole app while crypto is live.

**Multi-broker:** GTA + Achiever must match MyProp completeness (`auth_accepted`, `health_policy`, `latency`).

---

### Check C — Quote WS auth + all-symbols stream (P0)

1. Valid `feed_token` (from login, not only env) → open WS → subscribe N symbols → ticks for **every open-market symbol**.
2. Invalid / missing token → close **1008 or 4001** (not only 1006) with clear reason if possible.
3. Tick minimum for **every** symbol (mobile drops otherwise):

   - `symbol` string  
   - `bid` finite > 0  
   - `ask` finite ≥ bid  
   - Prefer: `timestamp_ms` / `time`, `sequence`, `stale`, `tradable`, `age_ms`

4. **No symbol hardcoding.** EURUSD, XAUUSD, BTCUSD, ETHUSD use the same pipeline.
5. While `symbol_status.fresh=true`, avoid silent gaps > 3s on liquid majors during market open.
6. Keep hub coalesce policy: latest bid/ask wins; max hold ≤ 50 ms on majors.

**Already good (keep):** stage stamps `hub_ingest_timestamp` / `hub_publish_timestamp`; recv→broadcast p95 ≤ 50 ms on live symbols.

---

### Check D — Candles REST stability (P1)

```http
GET /api/v2/candles/{SYMBOL}?timeframe=M1&limit=500
Authorization: Bearer <ACCESS_JWT>
```

- Do not break without notice (mobile uses exact configured path; no multi-path probing).
- Body: `{ "candles": [ { "time": <unix_sec>, "open", "high", "low", "close", "volume"? } ] }`
- Same for all symbols (FX + crypto + metals).

---

### Check E — Broker directory / multi-broker platform (P1)

From mobile contract (still OPEN):

1. Versioned directory envelope (`schema_version` / rich v1) **or** signed broker-bound handoff.  
2. Explicit per-broker feed credential mode (not mobile guessing).  
3. Trade WSS capability declared or explicitly “none”.  
4. Demo broker preview policy if product needs pre-login quotes.

Without this, mobile keeps directory rows **identity-only / disabled**.

---

### Check F — Ops security (P0/P1)

- After login handoff ships, mobile must not need `EXPO_PUBLIC_FEED_BROKER_TOKEN`.
- Rotate/revoke any feed token that was ever embedded in env/repo.

---

## 3. What NOT to ask frontend to do

- Do **not** ask FE to paint every raw tick into React.  
- Do **not** ask FE to invent feed_auth_context from token alone.  
- Do **not** ask FE to treat weekend FX silence as a “speed bug.”  
- Do **not** special-case BTCUSD — all symbols share one contract.

---

## 4. Acceptance bar (backend)

After deploy:

- [ ] Fresh login returns `feed_token` + `feed_auth_context` (keys only in proof)
- [ ] Refresh returns/rotates feed credential when needed
- [ ] Status: no-token → auth_accepted null/omit; valid → true; invalid → false
- [ ] Status: `health_policy` + `latency` on **all** production brokers
- [ ] `scheduled_market_closed` (or equivalent) honest on weekend FX
- [ ] WS invalid token → 1008/4001
- [ ] Subscribe multi-symbol: all open-market symbols stream moving bid/ask
- [ ] Candles REST still works with access JWT for FX + crypto symbols
- [ ] Report template completed below

---

## 5. REQUIRED RESPONSE FORMAT

```text
================================================================
RTX5 BACKEND MARKET-DATA CHECK REPORT
================================================================

1) Brokers tested
   - broker_id | domain | feed_auth_required

2) Login / refresh handoff
   - login keys (redacted): has feed_token? has feed_auth_context?
   - refresh keys: feed_token rotated? context present?
   - sample feed_auth_context (values redacted)

3) Status honesty
   - no token: auth_accepted=
   - valid token: auth_accepted=
   - invalid token: auth_accepted=
   - health_policy present? latency present?
   - scheduled_market_closed present?
   - fresh symbol count / sample majors ages

4) WS proof (multi-symbol, not BTC-only)
   - close code invalid token:
   - subscribe symbols:
   - per-symbol: samples, tps, moves, max_gap, stale/tradable
   - recv→broadcast p95 (from hub stamps if available)

5) Candles REST
   - path, auth, sample symbol FX + crypto, HTTP status

6) Directory / multi-broker
   - schema_version? selection-safe rich envelope? yes/no

7) Fixes applied
   - change:
   - before → after:

8) Explicit instruction for frontend
   - [ ] FE may wire login feed handoff (remove env dependency)
   - [ ] FE may bind status health_policy thresholds
   - [ ] FE keep STALE per-symbol when !fresh / market closed
   - [ ] No FE speed architecture rewrite

9) Residual risks
================================================================
```

---

## 6. One-line ask

**Ship login `feed_token` + `feed_auth_context`, status auth_accepted tri-state + health_policy for all brokers, honest market-closed flags, and auth WS close codes — for every symbol on the same pipeline — so RTX5 can drop legacy env feed secrets and unlock healthy trade actions without inventing backend contracts.**
