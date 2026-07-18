# Backend Work Request: Fix Slow Market Data for RTX5 Mobile

**Priority:** P0 — Live quotes / chart / trade feel delayed  
**App:** RTX5 Mobile (React Native)  
**Primary broker to start:** MyProp Trade (`broker_id: myprop-trade`)  
**Also required:** All production brokers with `feed_auth_required=true`  
**Owner:** Backend / Market-data / Feed gateway / LP / Auth  
**Date:** 2026-07-18  

---

## 1. Executive summary (give this to backend as-is)

RTX5 mobile users report **market data is slow**:

- Quotes update late or stick on STALE / Connecting  
- Chart candles and live price line lag real market  
- Buy/Sell prices feel delayed  
- Speed / tps on Quotes is low or 0  

**This is primarily a backend market-data path problem to prove and fix.**  
Mobile already:

- Opens one authenticated quote WebSocket  
- Subscribes with `{ "type": "subscribe", "symbols": [...] }`  
- Builds active candles from **quote ticks** (not full chart redraws)  
- Paints chart ticks on animation frames (~16 ms)  
- Does **not** invent feed tokens or throttle candle bodies to multi-second intervals  

Backend must prove where delay starts and fix the slow stage.

> Do not answer only “backend is fast” or “frontend is slow”.  
> Return **stage-by-stage latency numbers**, sample payloads, and exact fixes.

---

## 2. Goal

Make live market data for authenticated mobile sessions **real-time enough for trading UI**:

| Surface | Target |
|---|---|
| Quote ticks for subscribed symbols | Continuous stream, not burst-then-silence |
| Source → mobile receive (backend-controlled path) | **p95 ≤ 150 ms** on healthy network; investigate anything **p95 > 300 ms** |
| Tick cadence (major FX when market open) | Sustained multi-tick/sec feel on Quotes (not 0–1 tps stuck) |
| Status vs reality | If status says healthy/upstream connected, ticks must still flow |
| Auth handoff | Login/refresh always returns feed contract + credential so mobile can connect |

---

## 3. Symptom matrix mobile may show

| Mobile symptom | Likely backend cause to check first |
|---|---|
| Speed 0 tps / Connecting forever | Feed WS not authorized, not subscribed, or not broadcasting |
| Banner “Broker feed is not configured” | Login missing `feed_auth_context` / `feed_token` |
| Symbols STALE with old bid/ask | Upstream/provider silent, fan-out lag, or stale cache broadcast |
| Chart candle freezes / jumps | Quote stream sparse, bad timestamps, or only bar-close candles |
| Buy/Sell delayed vs market | Quote broadcast lag or wrong symbol mapping |
| Works for BTC, dead for EURUSD | Symbol subscription / silent_symbols / provider routing |

---

## 4. What backend must check (in order)

### Step A — Auth handoff (if WS never opens, latency audit is useless)

```http
POST {broker_api}/api/v2/auth/login
Content-Type: application/json

{
  "username": "<test_login>",
  "password": "<test_password>",
  "broker_id": "myprop-trade"
}
```

**Required fields for mobile to connect:**

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<token>",
  "account_login": "123456",
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

Rules:

- Token alone is **not** enough. Mobile requires `feed_auth_context`.  
- Refresh must re-issue/rotate `feed_token` + same context.  
- Mobile never uses `EXPO_PUBLIC_FEED_BROKER_TOKEN`.

If this is missing, fix auth first, then re-run latency tests after a **fresh mobile login**.

---

### Step B — Feed status (truth about provider health)

```http
GET https://services.myprop.trade/ws/feed/status?broker_id=myprop-trade
```

(Use each broker’s exact `feed_status_https_url`.)

**Must publish every time:**

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
    { "symbol": "EURUSD", "fresh": true, "stale": false, "tradable": true, "last_tick_age_sec": 0 },
    { "symbol": "BTCUSD", "fresh": true, "stale": false, "tradable": true, "last_tick_age_sec": 0 }
  ],
  "stale": false,
  "degraded": false,
  "scheduled_market_closed": false,
  "market_available": true,
  "silent_symbols_count": 0,
  "health_policy": {
    "local_tick_stale_after_ms": 15000,
    "server_status_stale_after_ms": 30000
  },
  "latency": {
    "last_backend_receive_age_ms": 0,
    "last_app_broadcast_age_ms": 0,
    "broadcast_queue_depth": 0
  }
}
```

Known live gaps previously observed on MyProp:

- `auth_accepted` missing  
- health thresholds missing  
- status can look healthy while mobile still gets slow/stale ticks — **measure broadcast lag**, not only connectivity booleans  

---

### Step C — Quote WebSocket (main latency path)

Mobile connect shape (param names come from `feed_auth_context`):

```text
wss://services.myprop.trade/ws/feed?token=<feed_token>&broker_id=myprop-trade
```

Mobile subscribe:

```json
{ "type": "subscribe", "symbols": ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"] }
```

Backend must:

1. Accept advertised query auth when `feed_auth_required=true`  
2. ACK subscription or start streaming immediately  
3. Stream **symbol + bid + ask + time** on every meaningful price change  
4. Keep streaming while status claims healthy  
5. Reject bad tokens with close codes **1008 / 4001**  
6. Not batch/buffer ticks for multi-second intervals on majors  
7. Not drop subscribed symbols into silent set without status reflecting it  

**Minimum tick payload mobile can use:**

```json
{
  "symbol": "EURUSD",
  "bid": 1.08512,
  "ask": 1.08528,
  "time": 1721300000.123,
  "digits": 5
}
```

Also acceptable: batch arrays of the same shape.  
Timestamps must be current and monotonic enough for candle building.

---

### Step D — Latency stage measurement (mandatory)

For each broker + symbol, measure **at least 2 minutes** of open-market traffic.

Pipeline:

```text
LP / source tick
  -> backend receive
  -> backend normalize / route
  -> backend broadcast to app WS clients
  -> mobile receive (correlate if possible)
```

Required stage times:

```text
source_tick_time
backend_received_time
backend_normalized_time
backend_broadcast_time
(optional) mobile_received_time
```

Per stage and end-to-end, report:

| Metric | Required |
|---|---|
| sample count | yes |
| min / avg / max | yes |
| p50 / p95 / p99 | yes |
| drops / duplicates / out-of-order | yes |
| reconnects during test | yes |
| silent gaps > 1s / > 3s / > 10s | yes |
| tps average and p95 gap between ticks | yes |

**Pass bar (backend-controlled path, healthy market):**

- `backend_received → backend_broadcast` p95 **≤ 50 ms**  
- `source → backend_broadcast` p95 **≤ 150 ms** (or document LP limit with proof)  
- no silent gap > 3s on EURUSD while `symbol_status.fresh=true`  
- broadcast queue depth not growing under multi-symbol subscribe  

If any stage fails, fix that stage before blaming mobile.

---

### Step E — Candle path (secondary; do not confuse with quote lag)

Mobile default: **quote-driven active candles**.

Backend should:

- Prefer fresh quote ticks (primary)  
- REST history for history load only  
- Optional server candle stream only if proven compatible:

  - candle `time` = bucket start (unix seconds)  
  - separate update/event time  
  - no rewind of newer active candle  
  - not bar-close-only if claimed as live  

If server candles are delayed or incompatible, tell frontend to keep quote-driven mode.  
Do **not** tell frontend to paint raw WS packets directly into React without the candle engine.

---

### Step F — Multi-broker scope

At minimum test:

| broker_id | symbols |
|---|---|
| `myprop-trade` | EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD |
| `gta_broker` | majors + one metal/crypto if available |
| `achiever-financials` | majors + metal |

Also note:

- provider id / LP mode (`central`, equinix, t4b, …)  
- whether feed is direct, proxied, or aggregated  
- any symbol suffix variants (`EURUSD` vs broker-specific forms)  

---

## 5. Common backend root causes to inspect

1. **Auth/subscription delay** — late feed token, subscribe ignored until timeout  
2. **Broadcast coalescing** — gateway aggregates ticks every 500ms–2s  
3. **Queue backlog** — fan-out to many clients, growing `broadcast_queue_depth`  
4. **Wrong provider active** — `feed_provider` points at disconnected provider  
5. **Silent symbols** — subscribed symbols not in streaming set  
6. **Stale cache replay** — broadcasting old ticks as live  
7. **Clock/timestamp skew** — old `time` makes mobile mark STALE  
8. **Per-symbol throttling** — crypto ok, FX throttled  
9. **N+1 or REST fallback** — WS dead, REST polled slowly  
10. **Region/network hop** — mobile region far from feed POP  

---

## 6. Required fixes if slow

Implement and verify:

- [ ] Login/refresh always returns `feed_auth_context` + `feed_token` when required  
- [ ] Subscribe starts streaming within **100 ms** of valid subscribe  
- [ ] Remove/disable multi-second quote coalescing for trading majors  
- [ ] Keep per-symbol last tick age in status (`last_tick_age_sec`)  
- [ ] Always emit `auth_accepted` boolean on status  
- [ ] Publish `health_policy` thresholds for mobile action guards  
- [ ] Cap broadcast queue; drop oldest only with metrics, never stall all symbols  
- [ ] Ensure active `feed_provider` is the connected streaming provider  
- [ ] Log p95 `receive→broadcast` continuously per broker  
- [ ] Alert when `last_tick_age_sec > 3` for subscribed liquid symbols while market open  

---

## 7. What frontend will do after backend fix

| Backend result | Frontend action |
|---|---|
| Auth contract fixed | User re-login only (no rebuild required for auth fields) |
| Tick stream p95 good | Quotes Speed > 0, STALE clears, chart updates live |
| Status has `auth_accepted` + thresholds | Trade actions can unlock when healthy |
| Backend proves mobile throttle is only remaining lag | Frontend may adjust display commit interval only with numbers |
| Backend still slow on broadcast | **No frontend “fix”** — keep fail-closed / STALE labeling |

Frontend will **not**:

- Use env-compiled feed secrets  
- Invent executable prices  
- Bypass feed auth  
- Claim UI is fine while ticks are seconds old  

---

## 8. Acceptance criteria

After deploy + **fresh mobile login** on MyProp (then other brokers):

1. Quotes status not stuck Connecting with 0 tps when market open  
2. EURUSD / GBPUSD / USDJPY / XAUUSD / BTCUSD show **live** bid/ask (not permanent STALE)  
3. Backend report shows `receive→broadcast` p95 ≤ 50 ms  
4. No silent gap > 3s on EURUSD while status marks fresh  
5. Chart active candle advances with ticks (quote-driven path)  
6. Buy/Sell buttons show current bid/ask without multi-second lag  
7. Status includes `auth_accepted: true` for authorized sessions  
8. Report includes before/after latency table  

---

## 9. Required response format back to mobile / QA

Return this report (redact secrets):

```text
================================================================
RTX5 SLOW MARKET DATA FIX REPORT
================================================================

1) Brokers tested
   - broker_id / domain / feed WSS / status URL

2) Auth handoff
   - login has feed_token: yes/no
   - feed_auth_context: {mode, credential, token_query_param, ...}
   - refresh rotates feed_token: yes/no

3) Status snapshot (per broker)
   - auth_accepted / upstream / cserver / feed_provider
   - last_tick_age_sec for EURUSD + BTCUSD
   - silent_symbols_count
   - health_policy

4) Latency table (per broker + symbol)
   symbol | samples | recv->broadcast p50/p95/p99 | source->broadcast p95 | avg tps | max silent gap

5) Root cause found
   - stage:
   - evidence:
   - fix applied:

6) Before / after
   - before p95:
   - after p95:
   - mobile retest notes:

7) Instruction for frontend
   - [ ] re-login only
   - [ ] rebuild required (why)
   - [ ] FE change required (exact)
   - [ ] no FE change required

8) Residual risks
   - LP limits / region / symbols still slow
================================================================
```

---

## 10. One-line ask

**Prove and fix the backend quote path so subscribed symbols stream fresh bid/ask with receive→broadcast p95 ≤ 50 ms, complete login feed-auth handoff, and honest status fields — so RTX5 mobile Quotes/Chart/Trade stop showing slow or stale market data.**
)
