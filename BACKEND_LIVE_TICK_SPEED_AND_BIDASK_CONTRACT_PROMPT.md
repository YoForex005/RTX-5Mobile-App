# Backend Prompt: Live Tick Speed, Bid/Ask Correctness, And Frontend Decision

**Priority:** P0  
**App:** RTX5 Mobile (React Native / Expo)  
**Primary broker:** MyProp Trade (`myprop-trade`) — also apply to all production brokers  
**Audience:** Backend market-data / feed gateway / LP bridge  
**Scope:** Backend investigation + contract answer for frontend  
**Do not** rewrite the mobile architecture. Return proof and a clear FE instruction.

---

## How to use

1. Give this **entire file** to the backend team / backend AI agent.  
2. Backend must measure, fix if needed, and return the **report template** at the end.  
3. Frontend will only change display commit intervals if backend proves the feed is already real-time.

---

```text
You are auditing and fixing the live market-data feed used by the RTX5 mobile app.

Goal:
  Prove whether quote ticks are generated fast enough, with correct moving bid/ask,
  ordered and timestamped correctly for mobile Quotes / Chart / Buy-Sell buttons.

Then tell the frontend EXACTLY what to do:
  - "no FE change" if feed is proven real-time, OR
  - "FE may lower display throttle only" if backend p95 is good and UI still feels slow, OR
  - "FE must keep fail-closed / STALE" if feed is sparse, delayed, or malformed.

Do NOT simply say "backend is fast" without stage timestamps and samples.
Do NOT invent frontend secrets or change mobile env tokens.

══════════════════════════════════════════════════════════════════
0. WHAT THE MOBILE FRONTEND ALREADY DOES (READ THIS FIRST)
══════════════════════════════════════════════════════════════════

Mobile live path (Quotes / chart quote-driven candles / trade buttons):

  broker LP
    → backend receive / normalize / broadcast
    → mobile Quote WebSocket  (wss://…/ws/feed?token=…&broker_id=…)
    → onmessage parse (JSON)
    → normalize tick (require symbol + bid + ask)
    → sync emit to symbol listeners (Quotes rows)
    → coalesce store flush to next animation frame (~16ms)  // latest price per symbol per frame
    → chart active candle extends from BID (quote-driven mode)
    → Buy/Sell buttons may commit UI at ~400ms for visual stability

Important frontend facts (do not fight this design):

1) Mobile does NOT paint every raw packet as a separate React render for the global store.
   It keeps the LATEST bid/ask per symbol per frame (~16ms). That is intentional MT5-style
   mobile behavior. If the feed sends 200 ticks/sec, mobile still shows current price
   within ~1 frame — it does not need every intermediate packet on screen.

2) Quotes screen live rows use DIRECT symbol subscriptions (not waiting for Zustand flush).
   Path: processTick → emitSymbolTick → useWatchlistLiveQuotes snapshot (also ~16ms notify).

3) Zustand quote store flush is frame-coalesced (~16ms). Identical-price heartbeats still
   bump tickCount so Speed (tps) can stay non-zero.

4) Trade Buy/Sell UI intentionally commits at ~400ms so digits do not flicker every packet.
   That is display smoothing, NOT feed rate. Execution still re-reads current live quote
   at press time.

5) Chart default mode is QUOTE-DRIVEN active candles (bid). REST history is bootstrap only.
   Server candle stream is optional and not the default live path.

6) Frontend drops invalid ticks:
   - missing symbol
   - missing bid or ask
   - non-finite bid/ask
   - bid <= 0
   - ask < bid
   - optional sequence / identity guards for out-of-order / wrong session

7) Frontend latency instrumentation exists (aggregate only):
   stages: sourceToReceipt, receiptToCache, cacheToVisibleRow, receiptToVisibleRow, sourceToVisibleRow
   Frontend will not claim device SLO without your backend stage proof.

Implication for backend:
  If mobile UI looks slow, first prove receive→broadcast and tick cadence.
  If those are good (p95 broadcast ≤ 50ms, majors multi/sec on majors), then FE display
  intervals can be revisited. If ticks are sparse or delayed, FE cannot invent speed.

══════════════════════════════════════════════════════════════════
1. CANONICAL MYPROP ENDPOINTS
══════════════════════════════════════════════════════════════════

broker_id: myprop-trade
HTTPS:     https://services.myprop.trade
Login:     POST /api/v2/auth/login
Refresh:   POST /api/v2/auth/refresh
Feed WS:   wss://services.myprop.trade/ws/feed?token=<FEED_TOKEN>&broker_id=myprop-trade
Status:    GET  /ws/feed/status?broker_id=myprop-trade
           GET  /ws/feed/status?broker_id=myprop-trade&token=<FEED_TOKEN>
Candles:   GET  /api/v2/candles/{SYMBOL}?timeframe=M1&limit=500
           Authorization: Bearer <ACCESS_JWT>   // NOT feed_token

Subscribe after WS open:
  { "type": "subscribe", "symbols": ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"] }

══════════════════════════════════════════════════════════════════
2. REQUIRED TICK CONTRACT (WHAT MOBILE EXPECTS)
══════════════════════════════════════════════════════════════════

### 2.1 Minimum valid tick (required)

Every executable live price update MUST include:

  symbol   string   (exact subscribed identity, e.g. "EURUSD")
  bid      number   finite, > 0
  ask      number   finite, >= bid

Strongly recommended:

  time | timestamp | timestamp_ms | tick_time | server_time
      (prefer server clock; mobile accepts seconds or ms and normalizes)
  digits | precision
  sequence | seq | source_seq   (monotonic per symbol)
  tick_id
  volume / tick_volume
  daily_open, previous_close, high, low (session)

Accepted envelopes mobile already parses:

  A) flat:
     { "symbol":"EURUSD", "bid":1.14379, "ask":1.14381, "time":... }

  B) typed:
     { "type":"quote", "symbol":"EURUSD", "bid":..., "ask":... }

  C) batch:
     { "type":"ticks", "ticks":[ {...}, {...} ] }
     or { "data":[ ... ] } / { "quotes":[ ... ] }

  D) ack (not a price):
     { "type":"subscribed", "symbols":["EURUSD", ...] }

### 2.2 Bid/Ask motion correctness

For liquid symbols during market open:

  - bid and ask MUST move when the market moves (not stuck flat for seconds)
  - ask - bid >= 0 always
  - spread should be realistic for the instrument (not 0 or absurd unless intentional)
  - consecutive updates should not rewind time or sequence backward
  - do not send fake alternating noise; send true LP prices

### 2.3 Cadence / speed targets (backend-controlled path)

Measure for ≥ 2 minutes per symbol while market open:

| Metric | Target |
|--------|--------|
| receive → broadcast p95 | ≤ 50 ms |
| source → broadcast p95 | ≤ 150 ms (or document LP limit with proof) |
| silent gap on EURUSD | no gap > 3 s while symbol_status.fresh=true |
| average tps (EURUSD) | multi-tick/sec when market is active (not 0–1 stuck) |
| batching | if you coalesce, keep latest price age ≤ 50 ms; never multi-second batching on majors |

If you intentionally throttle a symbol class (e.g. some CFDs), document exact policy.

### 2.4 Status honesty (so mobile health does not block the socket)

Status is public honesty, not the only gate:

  - Without credential: auth_accepted should be omitted or null (NOT false)
  - With valid credential: auth_accepted true
  - With invalid credential: auth_accepted false

Also publish when possible:

  feed_auth_required
  cserver_connected / upstream_connected / feed_active_source / feed_provider
  market_available, stale, degraded, scheduled_market_closed
  symbol_status[] with fresh/stale/tradable/last_tick_age_sec
  silent_symbols_count
  health_policy.local_tick_stale_after_ms
  health_policy.server_status_stale_after_ms
  latency.last_backend_receive_age_ms
  latency.last_app_broadcast_age_ms
  latency.broadcast_queue_depth

### 2.5 Login handoff (so mobile does not rely on env feed secret)

On login/refresh return:

  access_token, refresh_token, account_login, broker_id
  feed_token
  feed_auth_context: {
    mode: "query",
    credential: "feed_token",
    token_query_param: "token",
    broker_id_query_param: "broker_id",
    account_login_query_param: "account_login"   // optional
  }

Mobile prefers this over any compile-time EXPO_PUBLIC_FEED_BROKER_TOKEN.

══════════════════════════════════════════════════════════════════
3. BACKEND AUDIT STEPS (DO IN ORDER)
══════════════════════════════════════════════════════════════════

### Step A — Connect proof

1. Login (or use valid feed token)
2. Open WS with token + broker_id
3. Subscribe to EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD
4. Capture first 50 messages (redact token)

Report: connect time, first subscribed ack latency, first tick latency per symbol.

### Step B — Stage latency (mandatory)

For each symbol, ≥ 2 minutes:

  source_tick_time
  backend_received_time
  backend_normalized_time
  backend_broadcast_time

Report min/avg/max + p50/p95/p99 for:
  receive→broadcast
  source→broadcast

Also: drops, duplicates, out-of-order, reconnects, max silent gap, avg tps.

### Step C — Bid/ask motion proof

For EURUSD and BTCUSD, provide a redacted time series of 20 consecutive ticks:

  t, bid, ask, spread, sequence (if any)

Show that bid/ask actually move up and down with the market (not flat).

### Step D — Malformed / edge cases

Prove how backend handles:
  - missing ask
  - ask < bid
  - zero prices
  - unknown symbol
  - invalid token (close code)
  - subscribe before auth

### Step E — Coalescing policy

If gateway coalesces ticks:
  - document max hold time
  - confirm latest bid/ask always wins
  - confirm highs/lows are not required by mobile Quotes (mobile keeps intra-frame high/low itself)

══════════════════════════════════════════════════════════════════
4. FRONTEND DECISION RULE (YOU MUST FILL THIS)
══════════════════════════════════════════════════════════════════

After measurements, choose ONE:

Option 1 — Backend is the bottleneck
  Evidence: receive→broadcast p95 > 50ms OR silent gaps > 3s OR tps near 0
  FE instruction: "No FE speed fix. Keep STALE/Connecting until feed fixed."
  Backend must fix broadcast/LP path.

Option 2 — Backend is real-time; UI display throttle only
  Evidence: receive→broadcast p95 ≤ 50ms AND multi tps AND bid/ask move correctly
  FE instruction: optional only —
    "Quotes already ~16ms frame path; Buy/Sell commit is 400ms by design.
     Frontend may lower TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS if product wants snappier digits."
  Do NOT ask FE to paint every raw packet into React.

Option 3 — Payload contract mismatch
  Evidence: ticks arrive but missing bid/ask/symbol/time → mobile drops them
  FE instruction: "No drop-threshold change. Backend must send valid bid+ask+symbol(+time)."
  Attach 5 raw failing payloads (redacted).

Option 4 — Auth / handoff incomplete
  Evidence: login missing feed_token/feed_auth_context; status auth_accepted misuse
  FE instruction: "Keep fail-closed without handoff; temporary env token is legacy only."
  Backend must issue login feed handoff.

══════════════════════════════════════════════════════════════════
5. ACCEPTANCE BAR (MOBILE RE-TEST AFTER YOUR FIX)
══════════════════════════════════════════════════════════════════

After deploy + fresh mobile login (MyProp):

  [ ] Quotes Speed > 0 tps when market open
  [ ] EURUSD/GBPUSD/USDJPY/XAUUSD/BTCUSD show live bid/ask (not permanent Connecting)
  [ ] Bid/ask visibly move with market (up and down), spread >= 0
  [ ] No multi-second freezes while status says fresh/upstream connected
  [ ] Chart active candle advances on quote ticks (quote-driven mode)
  [ ] Buy/Sell show non-dashed prices when feed healthy
  [ ] Backend report includes latency table + 20-tick bid/ask samples

══════════════════════════════════════════════════════════════════
6. REQUIRED RESPONSE FORMAT BACK TO FRONTEND
══════════════════════════════════════════════════════════════════

Return exactly:

================================================================
RTX5 LIVE TICK SPEED / BID-ASK REPORT — myprop-trade
================================================================

1) Connect proof
   - WS URL shape (token redacted)
   - subscribe ack latency ms
   - first tick latency ms per symbol

2) Latency table (per symbol, ≥2 min)
   symbol | samples | recv->broadcast p50/p95/p99 | source->broadcast p95 | avg tps | max silent gap ms

3) Bid/ask motion (20 consecutive ticks, redacted)
   EURUSD: [(t,bid,ask), ...]
   BTCUSD: [(t,bid,ask), ...]
   Conclusion: moves correctly? yes/no

4) Payload samples (5 redacted)
   - full key set of one tick
   - batch shape if used

5) Status honesty
   - without token: auth_accepted=
   - with token: auth_accepted=
   - health_policy present? yes/no

6) Login handoff
   - feed_token present? yes/no
   - feed_auth_context present? yes/no
   - keys only

7) Root cause + fix applied
   - stage:
   - change:
   - before p95 / after p95:

8) Explicit instruction for frontend (pick one)
   [ ] Option 1: no FE speed fix — backend was bottleneck; retest only
   [ ] Option 2: FE may lower Buy/Sell display commit only (Quotes already frame-path)
   [ ] Option 3: fix payload contract — FE must not accept invalid ticks
   [ ] Option 4: issue login feed handoff — FE keeps fail-closed without it
   Extra FE notes (exact file/constant if any):

9) Residual risks
================================================================

══════════════════════════════════════════════════════════════════
7. ONE-LINE ASK
══════════════════════════════════════════════════════════════════

Prove and fix live quote generation so subscribed symbols stream valid moving bid/ask
with receive→broadcast p95 ≤ 50 ms, then tell the RTX5 frontend exactly whether any
display-interval change is justified — without asking mobile to render every raw packet.
```

---

## Appendix — Frontend architecture summary (for backend readers)

```text
WS onmessage
  → processIncomingPayload / processTick
  → require symbol + bid + ask (else DROP)
  → emitSymbolTick  (Quotes rows, sync)
  → pendingUpdates Map  (latest per symbol)
  → scheduleFlush(rAF ~16ms) → Zustand quotes (store path)
  → liveCandleStream.extendActiveCandlesFromQuoteTick(BID)  // chart default
  → useLiveSymbolQuote commitInterval (default ~16ms; Buy/Sell ~400ms)
```

Frontend is designed for **fast last-price delivery**, not for re-rendering every intermediate tick on every surface.
)
