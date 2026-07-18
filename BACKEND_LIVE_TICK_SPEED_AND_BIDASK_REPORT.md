# RTX5 LIVE TICK SPEED / BID-ASK REPORT — myprop-trade

**Probe time:** 2026-07-18 ~13:04–13:09 UTC (**Saturday** — FX typically closed; crypto 24/7)  
**Probe location:** RTX5 mobile monorepo workstation (external client, not in-POP)  
**Scope:** Live HTTP status + authenticated WSS with `EXPO_PUBLIC_FEED_BROKER_TOKEN` (legacy env credential)  
**Backend code:** **Not in this repository** — no gateway/LP bridge source to patch here. Fix (if any) must land on MyProp services / RTX hub.  
**Login:** Valid MyProp user credentials were **not** available in-workspace; login handoff proven only via prior session knowledge + invalid-login shape probe.

---

```text
================================================================
RTX5 LIVE TICK SPEED / BID-ASK REPORT — myprop-trade
================================================================

1) Connect proof
   - WS URL shape (token redacted):
     wss://services.myprop.trade/ws/feed?token=***&broker_id=myprop-trade
   - TCP/WS open latency: ~648 ms (client→edge RTT + handshake)
   - subscribe ack latency: **185 ms** after open
     ack: {"type":"subscribed","symbols":["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"]}
   - first tick latency after open (ms):
     | symbol  | first tick ms |
     |---------|---------------|
     | EURUSD  | 186           |
     | GBPUSD  | 187           |
     | USDJPY  | 187           |
     | XAUUSD  | 187           |
     | BTCUSD  | 187           |
   - Notes: first FX ticks were **stale snapshots** (age_ms 60s–130s, tradable=false).
     First BTCUSD ticks were live or near-live.

2) Latency table (per symbol)
   Method:
     - Client sample window ≥ 2 min on authenticated WS (primary), plus 45s hub-timestamp sample.
     - **recv→broadcast** = hub_publish_timestamp − hub_ingest_timestamp (server stage stamps on tick).
     - **source→broadcast** client-visible = local_receipt − provider_timestamp / timestamp_ms
       (includes LP clock + network; not pure backend hop).
     - Backend status.latency also sampled via HTTP.

   symbol | samples (2m) | recv→bcast p50/p95/p99 | source→bcast p95 (client) | avg tps | max silent gap ms | price moves
   -------|--------------|------------------------|---------------------------|---------|-------------------|------------
   EURUSD | 8            | stale snapshot path*   | ~13s (stale ages)         | 0.067   | **91043**         | **0** (flat)
   GBPUSD | 8            | stale snapshot path*   | ~13s                      | 0.067   | **91064**         | **0**
   USDJPY | 8            | stale snapshot path*   | ~13s                      | 0.067   | **91126**         | **0**
   XAUUSD | 8            | stale snapshot path*   | ~13s                      | 0.067   | **76680**         | **0**
   BTCUSD | 231          | **0 / 1 / 1 ms** (45s live sample n=43; max 135) | ~2.0s (provider ts resolution/clock) | **1.93** | **3061** | **216**

   *FX “recv→bcast” on subscribe/snapshot packets was tens of seconds (hub rebroadcast of old last-known
    tick). That is **not** live path latency; FX last prices were frozen for the session window.

   Status HTTP latency (public, concurrent):
     last_backend_receive_age_ms: 2–157 (sampled)
     last_app_broadcast_age_ms:   2–157 (sampled)
     broadcast_queue_depth: 0–2
     → hub is actively broadcasting *something* (crypto/other fresh symbols) even while FX is silent.

   Target check (live symbols only — BTCUSD):
     [x] receive→broadcast p95 ≤ 50 ms   → **YES (~0–1 ms)**
     [~] source→broadcast p95 ≤ 150 ms → **NOT met on client clock vs provider_timestamp**
         (provider timestamps appear 1s-granular; p95 source→local ~2s). Document as **LP/timestamp limit**,
         not hub queueing (hub hop is 0–1 ms).
     [x] silent gap on BTCUSD ≤ ~3 s while fresh
     [ ] silent gap on EURUSD ≤ 3 s while fresh → **N/A: EURUSD not fresh (weekend FX closed)**
     [x] avg tps multi-tick/sec when market active → **BTCUSD yes; FX no (closed)**

3) Bid/ask motion (20 consecutive ticks, redacted)

   EURUSD (session closed / last-known rebroadcast — NOT market-open motion):
     [(186, 1.14379, 1.14381), then multi-minute silence, then same bid/ask with new sequence]
     Conclusion: **does not move** in this window (expected Saturday FX). spread=0.00002 ≥ 0. stale=true.

   BTCUSD (live):
     [(186, 64087.04, 64102.04),
      (648, 64087.04, 64102.04),
      (1549, 64087.15, 64102.15),
      (1789, 64087.14, 64102.14),
      (2109, 64066.14, 64081.14),
      (3438, 64076.64, 64091.64),
      (4844, 64090.14, 64105.14),
      (5341, 64087.14, 64102.14),
      (5548, 64087.29, 64102.29),
      (8646, 64087.29, 64102.29),
      (9565, 64087.38, 64102.38),
      (11869, 64087.28, 64102.28),
      (12077, 64086.18, 64101.18),
      (12268, 64082.78, 64097.78),
      (12495, 64082.56, 64097.56),
      (12701, 64082.78, 64097.78),
      (13837, 64082.57, 64097.57),
      (14028, 64082.59, 64097.59),
      (14237, 64080.77, 64095.77),
      (14541, 64079.11, 64094.11)]
     spread always 15.0; bid/ask move up and down; sequence monotonic; ooo=0.
     Conclusion: **moves correctly? YES**

4) Payload samples (5 redacted) — flat tick shape (no batch envelope observed)

   Full key set on live tick:
     symbol, bid, ask, daily_open, previous_close, session{high_bid,low_bid,high_ask,low_ask},
     time, timestamp, time_ms, timestamp_ms, provider_timestamp,
     hub_ingest_timestamp, hub_publish_timestamp, age_ms, sequence, authority,
     source_mismatch, age_sec, stale, tradable, source

   Sample BTCUSD (values illustrative of live path):
     {
       "symbol": "BTCUSD",
       "bid": 64094.18,
       "ask": 64109.18,
       "daily_open": 63996.34,
       "previous_close": 0,
       "session": { "high_bid": 64220.63, "low_bid": 63936.93, "high_ask": 64254.91, "low_ask": 63968.4 },
       "time": 1784380045,
       "timestamp": 1784380045000,
       "time_ms": 1784380045000,
       "timestamp_ms": 1784380045000,
       "provider_timestamp": 1784380045000,
       "hub_ingest_timestamp": 1784380047921,
       "hub_publish_timestamp": 1784380048056,
       "age_ms": 3056,
       "sequence": "211616",
       "authority": "rtx5_hub",
       "source_mismatch": false,
       "age_sec": 3,
       "stale": true,
       "tradable": false,
       "source": "cserver"
     }

   Sample EURUSD (stale last-known, weekend):
     {
       "symbol": "EURUSD",
       "bid": 1.14379,
       "ask": 1.14381,
       "time": 1784379987,
       "timestamp_ms": 1784379987000,
       "hub_ingest_timestamp": 1784379999923,
       "hub_publish_timestamp": 1784380048056,
       "age_ms": 61056,
       "sequence": "210118",
       "stale": true,
       "tradable": false,
       "source": "cserver"
     }

   Batch shape: **not used** in this probe (one JSON object per message = one symbol tick).
   Mobile required fields present: symbol + bid + ask (finite, ask ≥ bid). **0 drops** for missing/zero/inverted.

5) Status honesty
   - without token: auth_accepted=**false**  ← contract wants **omit/null**, not false
   - with valid feed token: auth_accepted=**true**
   - feed_auth_required=true
   - cserver_connected=true, upstream_connected=true, feed_active_source=cserver, feed_provider=equinix
   - market_available=true, stale=false, degraded=false
   - scheduled_market_closed: **MISSING** (weekend FX honesty gap)
   - health_policy present? **yes**
       local_tick_stale_after_ms: 2000
       server_status_stale_after_ms: 90000
       symbol_silence_after_ms: 90000
       tradable_max_age_ms: 2000
   - latency present: last_backend_receive_age_ms, last_app_broadcast_age_ms, broadcast_queue_depth
   - symbol_status majors at probe: BTCUSD fresh/tradable; EURUSD/GBPUSD/USDJPY/XAUUSD stale/not tradable

6) Login handoff
   - Valid login not re-run (no test user in workspace this probe).
   - Invalid login POST /api/v2/auth/login → 400 keys: error, message only.
   - Prior probes / product knowledge: production login **missing** feed_token + feed_auth_context.
   - feed_token present on login? **no** (still required for production)
   - feed_auth_context present on login? **no**
   - Expected keys when fixed:
       access_token, refresh_token, account_login, broker_id, feed_token,
       feed_auth_context: { mode, credential, token_query_param, broker_id_query_param, account_login_query_param? }
   - Workaround used for this audit only: legacy EXPO_PUBLIC_FEED_BROKER_TOKEN (mobile fail-closed without handoff or env).

7) Root cause + fix applied
   - stage:
       1) **Live broadcast hop is NOT the bottleneck** for active symbols (BTCUSD hub ingest→publish p95 ≤ 1 ms).
       2) **FX sparsity in this window** is market session (Saturday) + last-known snapshots, not FE throttle.
       3) **Login feed handoff incomplete** (production path still needs feed_token + feed_auth_context).
       4) **Status honesty**: unauthenticated auth_accepted=false misleads mobile health (should be null/omit).
       5) **Invalid WS token** closes with 1006 (prefer 1008/4001 + reason).
   - change applied in this monorepo: **none** (no backend gateway source).
   - before p95 / after p95: N/A — live path already meets ≤50 ms on measured active symbols.

   Backend still should:
     [ ] Issue feed_token + feed_auth_context on login/refresh
     [ ] auth_accepted: null/omit without credential; true with valid; false with invalid
     [ ] scheduled_market_closed honesty for FX weekend
     [ ] Prefer close code 1008/4001 on bad/missing feed token
     [ ] Avoid rebroadcasting multi-minute-old FX last prices as if “new” without stale=true
         (stale flag is present — good; mobile must honor it)

8) Explicit instruction for frontend (pick one)

   [x] Option 2: FE may lower Buy/Sell display commit only (Quotes already frame-path)

   Evidence for Option 2 (when symbol is live/fresh):
     - recv→broadcast p95 ≤ 1 ms on BTCUSD
     - multi tps + bid/ask move correctly
     - valid payload contract (symbol+bid+ask); mobile drops not triggered

   NOT Option 1 for hub hop: backend queue is not the slow stage on live ticks.
   NOT Option 3: payloads are well-formed.
   Residual Option 4 (parallel, not instead of Option 2 for speed):
     - Keep fail-closed without login feed handoff; env token is legacy only.
     - Do not invent speed when symbol_status.fresh=false / tick.stale=true / age high.

   Extra FE notes (exact constants — optional product polish only):
     - Quotes path: already ~16ms rAF coalesce — **do not paint every raw packet into React**.
     - Buy/Sell: `TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS` (or chart trade button commit ~400ms historically;
       if currently 16ms after recent FE work, leave it — snappy digits already justified by Option 2).
     - Keep STALE/Connecting UI when tick.stale or symbol not fresh — **required** for weekend FX.
     - Chart quote-driven candles: continue BID-driven extend from valid ticks only.

9) Residual risks
   - Login without feed_token → production mobile may still need legacy env token (security smell).
   - auth_accepted=false without token can false-trip “connection interrupted” if FE mishandles tri-state.
   - FX weekend last-known ticks still stream occasionally with new sequence but flat bid/ask —
     Speed (tps) may be non-zero while prices do not move; UI should prefer stale/tradable flags.
   - provider_timestamp appears second-granular → source→client p95 looks worse than hub hop;
     do not chase FE for that.
   - Invalid token close 1006 is ambiguous vs network drop.
   - This probe is external RTT; true POP receive→broadcast may be even lower.
   - Full 2-min source→broadcast with in-process backend stage clocks still requires hub-side metrics export
     for formal SLO sign-off (client-derived hub stamps are strong evidence but not APM).

================================================================
```

## Acceptance bar (mobile re-test) — expected after this report

| Check | Expected now (Sat probe) |
|-------|---------------------------|
| Quotes Speed > 0 tps when market open | BTCUSD yes; FX may be 0 or heartbeat-only |
| Majors show live bid/ask | Crypto yes; FX Connecting/STALE OK if closed |
| Bid/ask move with market | BTCUSD yes; FX flat OK weekend |
| No multi-second freezes while status fresh | BTCUSD gaps ≤ ~3s; FX not fresh |
| Chart quote-driven advances | When receiving valid fresh ticks |
| Buy/Sell non-dashed when healthy | When tradable/fresh quote present |
| This report includes latency table + 20-tick samples | **Yes** |

## One-line answer for frontend

**Backend live hop is proven real-time on active symbols (recv→broadcast p95 ≤ 1 ms); FE must not rewrite architecture — optional display-commit polish only; keep fail-closed without login feed handoff and keep STALE for non-fresh/weekend FX.**

---

## Addendum — All symbols (not BTCUSD-only / not chart dropdown)

**User clarification:** Today is Saturday, so only crypto is open; BTCUSD looking “special” is market session, not a per-symbol backend or FE filter.

### Multi-symbol proof (same WS session, 25s, 10 subscribed symbols)

Subscribe ack returned **all** requested symbols:

`EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD, ETHUSD, BTC-PERP, ETHEUR, USDCAD, AUDUSD`

| Symbol | samples | tps | price moves | session |
|--------|---------|-----|-------------|---------|
| BTCUSD | 54 | 2.21 | 51 | crypto open — live |
| ETHUSD | 56 | 2.29 | 52 | crypto open — live |
| BTC-PERP | 114 | 4.66 | 113 | crypto open — live |
| ETHEUR | 32 | 1.31 | 26 | crypto open — live |
| EURUSD | 1 | ~0 | 0 flat | FX closed — last-known only |
| GBPUSD | 1 | ~0 | 0 flat | FX closed |
| USDJPY | 1 | ~0 | 0 flat | FX closed |
| XAUUSD | 1 | ~0 | 0 flat | metal closed |
| USDCAD | 1 | ~0 | 0 flat | FX closed |
| AUDUSD | 1 | ~0 | 0 flat | FX closed |

Status snapshot: **16 fresh / 341** symbols — all open-market names (crypto family + one energy-like), **not** BTCUSD alone. ETHUSD / BTC-PERP / XRPUSD / SOLUSD / etc. also `fresh:true`.

### Implications

1. **Gateway path is symbol-agnostic** — same subscribe → tick → broadcast pipeline for every symbol id.
2. **Not chart dropdown limited** — probe did not use mobile UI selection; server still multi-symbol streamed.
3. **Mobile Quotes** uses full watchlist `subscribeToSymbol` fan-out (`useWatchlistLiveQuotes`), not “only selected chart symbol.”
4. **FE decision Option 2 applies to all symbols** when that symbol is market-open and LP-fresh — including EURUSD/XAUUSD on Monday open.
5. **Weekend retest caveat:** Do not judge FX speed until London/NY session; use ETHUSD/BTCUSD/XRPUSD as Saturday proxies for the same pipeline.

### Frontend instruction (clarified)

- No per-symbol special case for BTCUSD.
- Same commit/throttle policy for **all** watchlist symbols.
- Keep STALE per-symbol when `stale`/`!fresh` — do not block the whole feed because FX is closed on Saturday.
