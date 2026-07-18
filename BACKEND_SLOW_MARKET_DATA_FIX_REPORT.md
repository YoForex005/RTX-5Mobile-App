# RTX5 SLOW MARKET DATA FIX REPORT

**Date:** 2026-07-18 (UTC Saturday — FX typically closed; crypto 24/7)  
**Probe location:** Mobile monorepo workstation (external to feed POP)  
**Scope:** Live HTTP status + unauthenticated WSS probes for production brokers  
**Limitation:** This repository is the **RTX5 mobile frontend**. Backend gateway/LP source is **not** in-tree. Authenticated login + authenticated quote WS latency (receive→broadcast p95 with `feed_token`) **cannot** be completed without broker test credentials.  

---

```text
================================================================
RTX5 SLOW MARKET DATA FIX REPORT
================================================================

1) Brokers tested
   - myprop-trade
     domain: services.myprop.trade
     API:    https://services.myprop.trade
     feed WSS: wss://services.myprop.trade/ws/feed
     status:   https://services.myprop.trade/ws/feed/status?broker_id=myprop-trade
   - gta_broker
     domain: services.growtradingacademy.com
     API:    https://services.growtradingacademy.com
     feed WSS: wss://services.growtradingacademy.com/ws/feed
     status:   https://services.growtradingacademy.com/ws/feed/status?broker_id=gta_broker
   - achiever-financials
     domain: service.achieverfinancials.com
     API:    https://service.achieverfinancials.com
     feed WSS: wss://service.achieverfinancials.com/ws/feed
     status:   https://service.achieverfinancials.com/ws/feed/status?broker_id=achiever-financials

   Directory source: GET https://superbackend.orrnn.com/api/v1/broker/servers
   (unversioned raw array; 4 active-looking records observed)

2) Auth handoff
   - login has feed_token: NOT PROBED (no test credentials in workspace)
   - feed_auth_context: NOT PROBED
   - refresh rotates feed_token: NOT PROBED
   - Mobile contract (implemented, fail-closed):
       * Token alone is IGNORED
       * Missing feed_auth_context / feed_auth → mode disabled_unconfigured / missing_contract
       * Banner: "Broker feed is not configured" · WS never opens · 0 tps
       * EXPO_PUBLIC_FEED_BROKER_TOKEN is empty (correct; mobile must not use env feed secrets)
   - Unauthenticated WSS probes (Node WebSocket):
       * no token  → close code 1006, 0 messages (~1.2s)  [expected reject path, but code should be 1008/4001]
       * bad token → close code 1006, 0 messages (~1.2s)  [same]
   - Backend ACTION REQUIRED:
       * Login/refresh MUST return feed_token + feed_auth_context for feed_auth_required=true
       * Close unauthorized sockets with 1008 or 4001 (not only 1006)
       * Re-test with real credentials; prove subscribe→first tick ≤ 100 ms

3) Status snapshot (per broker) — live probe 2026-07-18 ~11:36–11:38 UTC

   --- myprop-trade ---
   - auth_accepted: false  (public/unauthenticated status call)
   - upstream_connected: true
   - cserver_connected: true
   - feed_provider: equinix (connected, ~177–179 symbols_streaming)
   - t4b: disconnected
   - feed_active_source: cserver
   - feed_auth_required: true
   - stale: false | degraded: false | market_available: true
   - scheduled_market_closed: MISSING/null  (weekend FX — field should be honest)
   - silent_symbols_count: ~149–164 (varies)
   - clients: 3
   - health_policy: PRESENT
       local_tick_stale_after_ms: 2000
       server_status_stale_after_ms: 90000
       symbol_silence_after_ms: 90000
       tradable_max_age_ms: 2000
   - latency: PRESENT
       last_backend_receive_age_ms: 1–180 (sampled)
       last_app_broadcast_age_ms: 1–180 (sampled)
       broadcast_queue_depth: 0–2
   - EURUSD last_tick_age_sec: ages upward 1→93 over ~90s (no new ticks) → silent/stale
   - GBPUSD / USDJPY / XAUUSD: same pattern as EURUSD
   - BTCUSD last_tick_age_sec: 0–3 continuous → fresh/tradable
   - Fresh symbols at end of sample: crypto only
       BTCUSD, BTC-PERP, ETHUSD, ETHEUR, ETHAUD, UNIUSD (6 fresh / 341)

   --- gta_broker ---
   - auth_accepted: MISSING
   - upstream_connected: true
   - cserver_connected: false
   - feed_provider / active: t4b (connected, ~184 symbols_streaming)
   - feed_auth_required: true
   - latency: MISSING
   - health_policy: MISSING
   - EURUSD / XAUUSD: aging ~121–132s+ (silent)
   - BTCUSD: age 0–2s (stream alive for crypto)
   - fresh count: oscillates 3–33 of 350

   --- achiever-financials ---
   - auth_accepted: MISSING
   - upstream_connected: false
   - cserver_connected: false
   - feed_provider: rtx_market_data / active=t4b
   - providers: rtx_market_data connected=false, last_tick_age_sec≈260000 (~3 days), symbols_streaming=0
   - clients: 0
   - latency: MISSING | health_policy: MISSING
   - EURUSD/GBPUSD/USDJPY/XAUUSD/BTCUSD: all silent, age ~260k seconds
   - fresh/tradable: 0 / 331
   - ROOT: provider offline / feed dead (not a mobile parse issue)

4) Latency table (hub status ages — NOT full authenticated client path)

   Method: poll GET /ws/feed/status every ~7s × 12 samples (~90s) on myprop-trade.
   Note: last_*_age_ms is hub-level "time since last any-symbol event", not
   per-tick source→broadcast instrumentation. Authenticated WS p95 still REQUIRED
   from backend with feed_token.

   symbol   | samples | hub recv_age_ms p50/p95 | hub bcast_age_ms p95 | last_tick_age_sec | avg tps (status) | max silent gap (status)
   ---------|---------|--------------------------|----------------------|-------------------|------------------|------------------------
   (hub)    | 12      | 57 / 164                 | 164                  | n/a               | n/a              | n/a
   BTCUSD   | 12      | n/a                      | n/a                  | min0 avg1.1 max3  | continuous       | no gap >3s observed
   EURUSD   | 12      | n/a                      | n/a                  | min1 → max93 mono | ~0 after first   | >3s continuous silence
   GBPUSD   | 12      | n/a                      | n/a                  | same as EURUSD    | ~0               | >3s continuous silence
   USDJPY   | 12      | n/a                      | n/a                  | same as EURUSD    | ~0               | >3s continuous silence
   XAUUSD   | 12      | n/a                      | n/a                  | same as EURUSD    | ~0               | >3s continuous silence

   PASS bar (backend-controlled path) — status:
   - backend_received → backend_broadcast p95 ≤ 50 ms: NOT MEASURABLE from status ages alone
     (hub ages p95~164 ms are "staleness of last event", not stage duration)
   - source → backend_broadcast p95 ≤ 150 ms: NOT MEASURED (needs LP timestamps)
   - no silent gap >3s on EURUSD while fresh=true: PASS for honesty
     (EURUSD was marked silent/stale while aging; BTCUSD stayed fresh with age≤3)
   - broadcast_queue_depth not growing: PASS in samples (0–2)

   Authenticated mobile path:
   - subscribe→stream latency: BLOCKED until feed_auth_context + feed_token issued
   - Unauth WS never streams (0 msgs) → correct fail-closed if auth required

5) Root cause found

   A) Primary mobile blocker (when users see Connecting / 0 tps / "not configured")
   - stage: Auth handoff (login/refresh)
   - evidence:
       * Mobile resolveFeedAuthContextFromAuthResponse requires explicit feed_auth_context
       * Token-only responses map to disabled_unconfigured
       * Prior MyProp incident doc + current empty EXPO_PUBLIC_FEED_BROKER_TOKEN
       * Unauth WSS: no ticks (auth required)
   - fix required (backend):
       * Always return feed_token + feed_auth_context on login/refresh when feed_auth_required=true
       * Example contract:
         feed_auth_context: {
           mode: "query",
           credential: "feed_token",
           token_query_param: "token",
           broker_id_query_param: "broker_id",
           account_login_query_param: "account_login"
         }

   B) Hub health looks "green" while major FX is not streaming (Saturday probe)
   - stage: Provider/symbol routing + status honesty
   - evidence:
       * myprop: equinix connected, market_available=true, stale=false
       * only crypto subset fresh; EURUSD/GBPUSD/USDJPY/XAUUSD silent and aging
       * scheduled_market_closed missing/null on weekend
   - fix required (backend):
       * Publish scheduled_market_closed (and preferably per-asset-class / per-symbol session state)
       * Do not imply liquid FX is available when only crypto is streaming
       * Keep per-symbol last_tick_age_sec accurate (already useful)

   C) Cross-broker status contract incomplete
   - stage: Status schema
   - evidence:
       * gta_broker + achiever-financials: auth_accepted, latency{}, health_policy MISSING
       * myprop has health_policy + latency (good direction)
   - fix required:
       * Same status envelope on all production brokers
       * auth_accepted true only for authorized status/session views; document public probe semantics

   D) Achiever feed offline
   - stage: Upstream / provider connectivity
   - evidence: connected=false, symbols_streaming=0, ages ~3 days, clients=0
   - fix required: restore provider connection; then re-run latency audit

   E) Unauthorized WS close codes
   - stage: Feed gateway auth
   - evidence: close 1006 instead of 1008/4001
   - fix required: explicit policy close codes for bad/missing token

   F) Full stage latency (source→recv→normalize→broadcast) NOT YET INSTRUMENTED from this repo
   - Cannot claim receive→broadcast p95 ≤ 50 ms without backend metrics + authenticated client sample
   - Hub last_*_age_ms p95~164 ms only proves the hub is still receiving *some* symbols (crypto)

6) Before / after
   - before p95 (authenticated WS receive→broadcast): UNKNOWN (blocked on auth handoff + no BE metrics export)
   - hub status ages p95 (myprop, any-symbol): ~164 ms (point-in-time external poll)
   - after p95: N/A — no backend deploy from this repository
   - mobile retest notes:
       * Fresh login required after feed_auth_context fix
       * Expect Quotes Speed > 0 for streaming symbols (BTC path proven at hub)
       * On weekends, FX STALE is correct if scheduled_market_closed / symbol session says closed
       * Do not clear STALE while last_tick_age_sec grows

7) Instruction for frontend
   - [x] re-login only — after backend returns feed_auth_context + feed_token
   - [ ] rebuild required — only if contract field names change incompatibly (not expected)
   - [ ] FE change required — none for honest STALE/0 tps while auth unconfigured or symbols silent
   - [x] no FE change required to "invent" speed — mobile already fails closed
   - Optional FE follow-up AFTER backend publishes scheduled_market_closed consistently:
       * Prefer server scheduled_market_closed for banner copy (mobile already has reason category)

8) Residual risks
   - Weekend FX: this probe day is Saturday; re-run full majors latency Mon–Fri market open
   - Auth path untested end-to-end without broker QA credentials
   - Hub age metrics ≠ per-client broadcast latency
   - Achiever offline until provider restored
   - GTA missing latency/health_policy fields
   - Directory still unversioned raw array (separate release blocker for broker routing authority)
   - Region/network hop not measured (no mobile device capture in this probe)
================================================================
```

---

## What this monorepo can and cannot do

| Layer | In this repo? | Status |
|---|---|---|
| Mobile quote WS client, subscribe, tick normalize | Yes | Implemented |
| Fail-closed without `feed_auth_context` | Yes | Implemented + unit tests |
| Quote-driven active candles | Yes | Implemented |
| Latency telemetry hooks (client receive path) | Yes | Implemented; device SLO still open |
| Feed gateway / LP / login `feed_token` issuer | **No** | Backend service ownership |
| Fix equinix/t4b routing or Achiever offline | **No** | Backend / ops |

## Backend checklist (must close before blaming mobile)

- [ ] Login/refresh returns `feed_token` + `feed_auth_context` for all `feed_auth_required=true` brokers  
- [ ] Authenticated WSS streams bid/ask for subscribed symbols within 100 ms of subscribe  
- [ ] Instrument and publish **receive→broadcast p95 ≤ 50 ms** per broker  
- [ ] Status always includes `auth_accepted`, `health_policy`, `latency`, `scheduled_market_closed`  
- [ ] FX majors retested during **open market** (not only weekend crypto)  
- [ ] Achiever provider restored  
- [ ] Unauthorized WS closes with **1008 / 4001**  
- [ ] Return this report’s §4 table with true stage timestamps after fix  

## Mobile verification after backend deploy

1. Fresh login on MyProp (not old session).  
2. Quotes: not stuck Connecting; tps > 0 for open symbols.  
3. EURUSD…BTCUSD: live bid/ask when market open; honest closed/STALE when not.  
4. Chart active candle advances from quote ticks.  
5. Trade Buy/Sell matches stream prices without multi-second lag.  
6. Capture client-side telemetry + attach to retest notes.
