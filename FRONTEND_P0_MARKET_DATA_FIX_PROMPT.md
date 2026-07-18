# Frontend Prompt: RTX5 Market-Data Remaining Fixes

**Priority:** P0 (after / alongside backend handoff)  
**App:** RTX5 Mobile (`rtx5-app`)  
**Audience:** Mobile frontend agent  
**Scope:** Wire already-proven backend fields; remove legacy env dependency once login handoff exists; per-symbol health — **all symbols**, not BTCUSD-only.  
**Do not:** Rewrite quote architecture, paint every raw tick into React, or invent backend contracts.

---

## How to use

Give this entire file to the frontend agent after (or while) backend works the companion  
`BACKEND_P0_MARKET_DATA_CHECK_PROMPT.md`.

---

## 0. Context (read first)

### Already good on FE (do not regress)

| Area | Behavior |
|------|----------|
| Tick path | require symbol+bid+ask; drop invalid; emitSymbolTick; rAF ~16ms store coalesce |
| Quotes rows | direct symbol subscriptions (`useWatchlistLiveQuotes`) |
| Chart default | quote-driven active candles (bid); REST history bootstrap only |
| Auth tri-state | `auth_accepted` omit/null/tokenless-false ≠ hard reject (`feedHealthProbe`) |
| Env legacy | `resolveSessionFeedAuth` can fall back to `EXPO_PUBLIC_FEED_BROKER_TOKEN` + query contract |
| Session isolation | epoch-bound quotes/candles/orders |
| Fail-closed | no mock live prices; execution re-reads live quote |

### Backend proven (external probe)

- Live hop on **open-market** symbols: recv→broadcast p95 ≤ 1 ms  
- Multi-symbol stream works (BTCUSD + ETHUSD + BTC-PERP + …); FX flat on Saturday = closed market  
- Tick payload keys already valid for mobile normalizer  
- MyProp status already publishes `health_policy` — **FE does not bind it yet**

### Backend still required (FE cannot fake)

1. Login/refresh `feed_token` + `feed_auth_context`  
2. Status `auth_accepted` honesty (null without credential)  
3. Universal `health_policy` on all brokers  
4. Prefer WS close 1008/4001 on bad token  

If backend handoff is missing, keep fail-closed / legacy env — do not invent context.

---

## 1. REQUIRED FRONTEND FIXES

### Fix 1 — Bind server `health_policy` thresholds (P0)

**Problem:** Session bind deliberately omits thresholds:

- `brokerSessionCoordinator.ts` → `bindCommittedFeedHealthSession` comment: thresholds remain absent  
- `QuotesScreen.tsx` → `bindFeedHealthSession` “Deliberately omit thresholds”  
- Result: `health_policy_unconfigured` → price actions stay blocked even when MyProp publishes:

```json
"health_policy": {
  "local_tick_stale_after_ms": 2000,
  "server_status_stale_after_ms": 90000
}
```

**Do:**

1. In `normalizeConfirmedFeedStatus` (`feedHealthProbe.ts`), parse:

   - `health_policy.local_tick_stale_after_ms` → `localTickStaleAfterMs`  
   - `health_policy.server_status_stale_after_ms` → `serverStatusStaleAfterMs`  
   - Optional: `symbol_silence_after_ms`, `tradable_max_age_ms` if state machine can use them  

2. Only accept **finite positive** numbers in a safe range (e.g. local 500–60_000 ms, server 5_000–300_000 ms). Reject absurd values; do not invent defaults when policy missing.

3. On successful status probe with valid policy, dispatch into feed health FSM so `state.thresholds` is set (extend `SERVER_STATUS` event or follow-up `BIND_SESSION` with thresholds — pick one consistent path).

4. Update `bindCommittedFeedHealthSession` / Quotes bind:

   - Prefer thresholds from **last confirmed status** for this broker session  
   - Still **do not invent** defaults if status never supplied policy  

5. Tests:

   - MyProp-shaped status → thresholds bound → `feedHealthAllowsPriceActions` can become true when ticks + auth healthy  
   - Missing policy → still `health_policy_unconfigured`  
   - Invalid policy numbers → ignored (fail closed)

**Files (expected):**

- `src/market/feedHealthProbe.ts`  
- `src/market/feedHealthState.ts` (if event shape needs thresholds on status)  
- `src/services/brokerSessionCoordinator.ts`  
- `src/features/quotes/QuotesScreen.tsx`  
- matching `*.test.ts`

---

### Fix 2 — Per-symbol market-closed / STALE UX (P0 product honesty)

**Problem:** On Saturday only crypto is open. Users (and agents) may think “only BTCUSD works.” FE must make multi-symbol reality obvious.

**Do:**

1. Prefer server tick flags when present: `stale`, `tradable`, `age_ms` / `age_sec` (already on MyProp ticks).  
2. Quotes rows: show **STALE / Market closed** per row when `!fresh` / `stale` / not tradable — **without** marking the whole feed dead if other symbols still tick.  
3. Chart Buy/Sell: keep fail-closed when selected symbol not tradable; do not block other symbols’ data path.  
4. Banner: distinguish:

   - transport/auth failure (whole feed)  
   - vs selected-symbol / many-symbols market closed  
5. No BTCUSD special cases in subscription or rendering.

**Files (expected):**

- `src/features/quotes/*` row freshness / presentation  
- `src/market/feedHealthPresentation.ts`  
- chart trade buttons quote commit path  
- tests for mixed fresh+stale watchlist

---

### Fix 3 — Prefer login feed handoff; demote env to true legacy (P0 when BE ready)

**Problem:** Production should not depend on `EXPO_PUBLIC_FEED_BROKER_TOKEN`.

**Do (when backend Check A is green):**

1. Confirm `authSession` / `resolveSessionFeedAuth` already prefers backend context + token.  
2. After successful login with full handoff, **do not require** env token.  
3. Keep env fallback only if:

   - `feed_auth_context` still missing **and**  
   - product still allows legacy for staging  
4. Log (redacted) source: `backend` | `env` | `none` for diagnostics.  
5. On refresh: if backend returns new `feed_token` **and** optional `feed_auth_context`, update session capture (today refresh mainly updates token — extend if context appears).

**Do not:** invent `feed_auth_context` when login only has a bare token.

**Files:**

- `src/api/feedAuthContract.ts`  
- `src/api/authSession.ts`  
- `src/api/brokerApi.ts` (`performRefresh`)  
- tests in `feedAuth*.test.ts`

---

### Fix 4 — Status re-probe scheduling once thresholds exist (P1)

**Problem:** Health probe scheduling may short-circuit when thresholds were never set, so status ages out.

**Do:**

1. After Fix 1, ensure `scheduleHealthProbe` / lifecycle continues while session bound and policy present.  
2. Re-probe interval should respect `serverStatusStaleAfterMs` (fraction of it), not spin.  
3. Tests for probe lifecycle with thresholds.

**Files:**

- `src/market/feedHealthRuntime.ts` / probe lifecycle  
- `feedHealthProbeLifecycleSource.test.ts`

---

### Fix 5 — Types / docs hygiene (P2)

1. Extend `AuthResponse` (or equivalent) with optional `feed_token`, `feed_auth_context`.  
2. Update `docs/contracts/mobile-broker-market-data-contract.md` after BE lands: mark feed handoff + health_policy items CONFIRMED only with live proof.  
3. Candle history: ensure release env always sets:

   - `EXPO_PUBLIC_CANDLE_HISTORY_PATH`  
   - `EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE`  

   (no multi-path guessing).

---

## 2. EXPLICITLY OUT OF SCOPE (do not “fix”)

| Temptation | Why not |
|------------|---------|
| Lower global React render to every tick | Architecture is last-price / frame coalesce by design |
| Change drop rules to accept incomplete ticks | Backend must send bid+ask |
| Invent login feed_auth_context | Fail-closed is correct |
| Treat weekend FX as speed bug | Market session |
| BTCUSD-only chart subscription | Watchlist multi-symbol is correct |
| Backend latency “fix” in FE | Hub hop already ≤ 1 ms on live symbols |

Optional product polish only (not required by backend report Option 2):

- Buy/Sell display commit interval already ~16ms in recent work; only change if product wants different smoothing.

---

## 3. Acceptance bar (mobile)

After FE fixes + backend handoff deploy + **fresh login**:

- [ ] Login without env token → WS connects (MyProp)  
- [ ] Status with token → health thresholds bound → no permanent `health_policy_unconfigured` when server sends policy  
- [ ] Price actions allowed only when auth + thresholds + fresh tradable quote  
- [ ] Watchlist: open-market symbols move; closed-market symbols STALE per row  
- [ ] Chart selected symbol (any) uses same tick path  
- [ ] Crypto open + FX closed does not show global “feed dead” if crypto ticks  
- [ ] No secrets in logs  
- [ ] Unit tests for health_policy bind + mixed stale rows  
- [ ] `npm test` / typecheck green for touched packages  

---

## 4. Implementation order

1. Fix 1 (health_policy bind) — unblocks trade actions with current MyProp status  
2. Fix 2 (per-symbol STALE / market closed UX)  
3. Fix 3 (login handoff preference) — after BE ships Check A  
4. Fix 4 (probe schedule)  
5. Fix 5 (types/docs)  

---

## 5. REQUIRED RESPONSE FORMAT (frontend agent)

```text
================================================================
RTX5 FRONTEND MARKET-DATA FIX REPORT
================================================================

1) Fixes implemented
   - Fix 1 health_policy: yes/no + files
   - Fix 2 per-symbol STALE: yes/no + files
   - Fix 3 login handoff / env demotion: yes/no + files
   - Fix 4 probe schedule: yes/no
   - Fix 5 types/docs: yes/no

2) Tests run
   - commands + pass/fail

3) Manual retest notes
   - broker, symbols, weekend/weekday
   - env token used? yes/no

4) Still blocked on backend
   - list

5) Residual risks
================================================================
```

---

## 6. One-line ask

**Bind server `health_policy` so price actions can go healthy, show STALE per symbol when markets are closed, and prefer login feed handoff over env secrets — without rewriting the multi-symbol quote frame path.**
