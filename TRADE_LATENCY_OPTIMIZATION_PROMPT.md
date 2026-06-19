<!-- # Trade Placement Latency — Problem Brief & Optimization Prompt

> **Goal:** Make the chart Buy/Sell buttons feel like the trade is placed *instantly* (target: perceived ≤ a few ms), and make the *actual* broker confirmation as fast as physically possible.
>
> **Audience:** Backend engineer + an AI coding agent. This file is written so it can be pasted directly to either as a self-contained task.
>
> **Status of the frontend button itself:** already optimal — fires on touch-down (`FastPressable` + `onPressIn` + `unstable_pressDelay=0`), measured ~60 ms tap→first-frame. The order is *sent the instant you touch*. **The wait the user feels is the backend confirming the order, not the button.**

---

## 0. Reality check on "1–2 milliseconds" (read this first)

A **server-confirmed** trade can never be 1–2 ms. Physics floor:

- Mobile radio + internet round-trip (RTT) to the broker server: **~40–300 ms** on 4G, even with a warm connection.
- The broker's MT5/trade-server has to accept + match the order: **tens to hundreds of ms** more.
- So the **theoretical best** for a *confirmed* market order from a phone is **~80–400 ms**, not 1–2 ms.

Therefore the target splits into two independent tracks:

| Track | What it makes fast | Achievable target | Owner |
|------|--------------------|-------------------|-------|
| **A. Perceived placement** | The UI *acknowledges* the trade instantly (optimistic) | **≤ 16 ms (1 frame), feels "1–2 ms"** | Frontend (this repo) |
| **B. Real confirmation** | The broker actually accepts the order | **~150–500 ms** (down from current ~1–3 s) | Backend / infra |

> The "1–2 ms" the user wants = **Track A** (optimistic UI). Track B removes the visible spinner/lag afterward. Do **both**.

---

## 1. The backend problem, point by point (measured this session)

All numbers below are real, captured from the device logcat (`[API slow/warn] ...`) against `backend.orrnn.com` / `testbrokerbackend.orrnn.com`.

1. **Every endpoint has a high fixed latency floor (~1–3 s), even trivial reads.**
   - `GET /account/{login}` → 2.7–3.4 s
   - `GET /positions/{login}` → 1.7–4.1 s
   - `GET /deals/{login}` → 1.0–2.1 s
   - `GET /alerts`, `GET /orders/{login}` → 1.6–3.0 s
   - This is *not* payload-bound (these are small) → it points to **per-request server overhead** (cold workers, slow upstream broker gateway, no connection reuse, or synchronous re-auth to the MT5 server on each call).

2. **`POST /api/v2/orders` (the trade) takes ~1–3 s to confirm.**
   - This is the lag between tapping Buy/Sell and the "… done" toast.
   - The order is *dispatched* on tap in ~60 ms; the remaining time is the server round-trip to the broker trade server.

3. **`GET /candles?limit=2500` is the worst: 3.8–7 s, and intermittently `ERR`/`502`/timeout (7–11 s).**
   - Large payload **and** slow query. (Frontend already mitigated by dropping the first fetch to `limit=600`.)

4. **The live-candle WebSocket `/ws/v2` intermittently returns `502`** (documented), forcing flat quote-tick fallback.

5. **No evidence of HTTP keep-alive / connection pooling / HTTP-2 reuse.**
   - Each REST call may pay a fresh TCP + TLS handshake (~100–300 ms of pure setup on mobile) on top of the request.

6. **Possible in-line token refresh on the hot path.**
   - `brokerApi.request` proactively refreshes the access token when it expires within 60 s (`TOKEN_REFRESH_SKEW_MS`). If a tap lands in that 60 s window, the order request **waits for a refresh network call first** — adding a full extra RTT to that trade.

7. **The trade response blocks until the broker fully confirms.**
   - The HTTP response for `POST /orders` is held open until the MT5 server returns the fill. There is no "accepted/queued" fast-ack; the client sees nothing until the slowest step finishes.

---

## 2. Root-cause summary

- **Frontend:** none for the *press* (already instant). The only frontend gap is that the UI **waits for the server** before showing success, so the user perceives backend latency as button slowness.
- **Backend / infra (the real bottleneck):**
  - High per-request overhead (cold/under-provisioned API, synchronous broker re-auth, no pooling).
  - Synchronous, all-or-nothing order response (no fast-ack).
  - No persistent low-overhead transport for orders (everything is fresh HTTPS).
  - Network distance between app ↔ API ↔ broker trade server.

---

## 3. Solution — Track A: make placement *feel* instant (frontend, this repo)

> Outcome: tap → position appears + "Placing…" badge in **≤ 1 frame (~16 ms)**; reconciles silently when the server confirms; rolls back + warns only if the broker rejects. This is what delivers the "1–2 ms" feel.

**A1. Optimistic order placement (highest impact).**
- On `onPressIn`, immediately render an **optimistic position/marker** on the chart and an inline "Placing…" pill — do **not** wait for the POST.
- When `POST /orders` resolves: replace the optimistic entry with the real ticket (or roll it back + show the existing error toast on failure).
- Files: `rtx5-app/src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts` (the `placeOrder(... {onSuccess,onError})` block), and the position/overlay rendering in `ChartScreen.native.tsx`.
- Keep the existing queue (`CHART_TRADE_QUEUE_LIMIT=10`) and shared lock; only the *visual confirmation* becomes optimistic.

**A2. Reconcile via the existing WebSocket, not polling.**
- A WS feed is already connected (`wss://backend.orrnn.com/ws/feed`). Subscribe to position/fill events and reconcile optimistic entries from the push, instead of the post-trade `GET /positions` + `GET /deals` refetch (which themselves cost 1–4 s).
- Removes the second wave of slow REST calls after every trade.

**A3. Take token refresh off the hot path.**
- Pre-refresh the access token in the background well before expiry (e.g., a timer at `expiry − 5 min`), so `brokerApi.request` for an order never has to `await` a refresh.
- File: `rtx5-app/src/api/brokerApi.ts` (`getValidAccessTokenForSession` / `TOKEN_REFRESH_SKEW_MS`).

**A4. Decouple the POST dispatch from the React re-render.**
- The ~60 ms tap-frame is the `setActiveSide` re-render of the big `ChartScreen`. The POST already fires before render, but make the busy indicator **local component state** (not a state that re-renders `ChartScreen`) so the first frame is < 16 ms and within the 10 ms critical-trade budget.
- File: `useTradeHandler.ts` (`markActiveTradeSide`) + button component local state.

**A5. Connection warmth from the client.**
- Ensure `fetch`/`timedFetch` reuses a keep-alive connection to the broker host (HTTP/2 / connection pool), and consider a tiny periodic keep-alive ping so the first trade after idle doesn't pay a cold TLS handshake.
- File: `rtx5-app/src/utils/apiLatency.ts` (`timedFetch`), `rtx5-app/src/api/brokerApi.ts`.

---

## 4. Solution — Track B: make the *real* confirmation fast (backend / infra)

> Outcome: `POST /orders` confirmation drops from ~1–3 s to **~150–500 ms**; baseline GET latency drops below ~300 ms.

**B1. Fast-ack the order (biggest backend win).**
- Return **HTTP 202 Accepted** the instant the order is queued to the trade server (with a client-generated idempotency key), then push the actual fill over WebSocket.
- The client (with A1+A2) shows the trade instantly and updates on the WS fill — no blocking on the broker round-trip.

**B2. Persistent, pooled connection from API → broker trade server.**
- Keep a warm, authenticated session/connection pool to the MT5/broker gateway. Do **not** re-authenticate or open a new socket per order. This is likely the dominant chunk of the ~1–3 s.

**B3. Profile `POST /orders` server-side and publish the breakdown.**
- Instrument: API-receive → auth → broker-send → broker-ack → API-respond. Find whether the time is auth, broker RTT, DB write, or logging. Optimize the largest segment first.

**B4. Eliminate per-request HTTP setup.**
- Enable HTTP/2 + keep-alive at the API edge; reuse TLS sessions. Targets the ~1–3 s floor on *all* endpoints (item #1, #5).

**B5. Keep workers warm / co-locate.**
- If serverless: provisioned concurrency (no cold starts). Deploy the API geographically close to the broker trade server (and ideally near the user region) to cut RTT.

**B6. Cache hot read data server-side.**
- Cache instrument specs / account metadata used for order validation so the order path doesn't make extra synchronous lookups.

**B7. Candle endpoint (separate but related).**
- Add gzip/brotli, a hot cache for recent bars, smaller default windows, and fix the `/ws/v2` 502s. (Frontend already requests `limit=600` first + retries on failure.)

---

## 5. Prioritized action plan + acceptance criteria

| Pri | Action | Track | Acceptance criteria (how to verify on device via `adb logcat`) |
|-----|--------|-------|-----------------------------------------------------------------|
| **P0** | A1 Optimistic placement | FE | Tap → position/marker + "Placing…" visible in the **next frame**; success/rollback reconciles later. `[Action] chart.*.trade.*` ≤ 16 ms. |
| **P0** | B1 Fast-ack (202 + WS fill) | BE | `POST /orders` responds in **< 300 ms**; fill arrives via WS. |
| **P1** | A2 WS reconcile (drop post-trade GET refetch) | FE | No `GET /positions` + `GET /deals` burst after each trade. |
| **P1** | B2 Pooled broker connection | BE | `POST /orders` server segment "broker-send→ack" drops > 50 %. |
| **P1** | A3 Background token refresh | FE | No token-refresh request immediately before an order POST. |
| **P2** | B4/B5 HTTP-2 keep-alive + warm/co-located workers | BE | Median GET latency **< 300 ms**; no cold-start spikes. |
| **P2** | A4 Local busy state | FE | Trade first-frame within the 10 ms critical budget. |
| **P2** | A5 Client keep-alive | FE | First trade after idle has no extra handshake delay. |

**Measurement command (device must be on USB, app in Expo Go):**
```
adb logcat -v time ReactNativeJS:V *:S | grep -E "\[Action\] chart.*trade|/orders|/positions|/deals"
```
Compare tap timestamp → `POST /orders` duration → "done"/fill before vs after.

---

## 6. Ready-to-paste prompt for a backend engineer / AI agent

> **Context:** React Native (Expo) trading app. Orders are placed via `POST /api/v2/orders` on `backend.orrnn.com` (per-broker `{server_url}/api/v2`), Bearer-authenticated, behind an MT5/broker trade server. A persistent WebSocket already exists at `/ws/feed` (quotes) and `/ws/v2` (candles). Measured latency: `POST /orders` ~1–3 s; all GETs ~1–3 s even when tiny; `/candles?limit=2500` 4–7 s with intermittent 502/timeouts; `/ws/v2` intermittent 502.
>
> **Task:** Cut market-order confirmation latency to ≤ ~300 ms and remove the per-request ~1–3 s floor, without changing order semantics or risking duplicate fills.
>
> **Do:**
> 1. Add a **fast-ack** path: `POST /orders` returns `202 Accepted` with the server order id the moment the order is queued to the trade server; push the actual fill/rejection over the existing WebSocket. Support a **client idempotency key** to make retries safe.
> 2. Maintain a **warm, pooled, pre-authenticated connection** from the API to the MT5/broker trade server; never re-auth or open a new socket per order.
> 3. Add **server-side timing instrumentation** to `POST /orders` (receive → auth → broker-send → broker-ack → respond) and report the breakdown.
> 4. Enable **HTTP/2 + keep-alive + TLS session reuse** at the API edge; eliminate per-request handshakes.
> 5. Remove **cold starts** (provisioned concurrency if serverless) and **co-locate** the API with the broker trade server; reduce user→API RTT.
> 6. **Cache** instrument specs / account metadata used in order validation.
> 7. Fix `/ws/v2` 502s and add gzip + a hot cache for recent candles.
>
> **Constraints:** No duplicate orders (idempotency required). Preserve existing error contract for SL/TP/lot validation. Provide before/after latency numbers and a rollback plan.
>
> **Acceptance:** `POST /orders` p50 < 300 ms / p95 < 600 ms; GET p50 < 300 ms; fills delivered over WS within 500 ms of submit; zero duplicate fills under rapid one-click tapping (10 in 2 s).

---

## 7. What is and isn't possible — set expectations

- ✅ **"Instant" feel (≤ a few ms perceived):** yes, via Track A (optimistic UI). This is the user-visible "1–2 ms" goal.
- ✅ **Real confirmation ~150–500 ms:** realistic with Track B.
- ❌ **Real confirmation in 1–2 ms:** physically impossible from a phone over the internet to a broker — network RTT + matching can't be that low. Anyone promising it is hiding the round-trip (which is exactly what optimistic UI does, honestly, with reconciliation).

---

### Appendix — key code references (this repo, `rtx5-app/`)
- Trade button + press model: `src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx`, `src/ui/components/FastPressable.tsx`
- Trade handler / queue / placement: `src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts`
- Order API: `src/query/orders.ts` (`usePlaceOrderExecutor`) → `src/api/orders.ts` → `src/api/brokerApi.ts` (`request`, token refresh) → `src/utils/apiLatency.ts` (`timedFetch`)
- Routing / base URLs: `src/api/brokerRouting.ts` (`https://backend.orrnn.com/api/v2`, `/ws/feed`, `/ws/v2`)
- One-click preference (must be ON for one-tap placement): `src/state/userPreferences/store.ts` (`oneClickAccepted`) -->
