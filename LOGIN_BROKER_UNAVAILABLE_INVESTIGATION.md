# Login — "Broker unavailable" / "Please wait while the broker list loads" Investigation

**Status:** Diagnosis complete — fixes #1 and #2 implemented (2026-08-07); fix #3 remains open
**Date:** 2026-08-07
**Screen:** `Login Account` (after logout, returning to login with saved credentials)

---

## Problem reported

On the login page, after logout, when returning to login:

1. The Broker Server field shows **"Please wait while the broker list loads."** (red) with a spinner, and
2. Sometimes it shows **"broker unavailable"** — **even when the broker is NOT actually down.**

Question: does this come from the backend or the frontend, and is there a frontend bug?

---

## Short answer

**Both messages are generated 100% by the frontend.** The backend never sends "broker unavailable" or "please wait" as a status. They are triggered by **latency** (slow first responses / cold sockets), not by the broker actually being offline. There are real frontend issues amplifying both.

Two separate messages, two different causes.

---

## Message 1 — "Please wait while the broker list loads."

**Rendered:** `rtx5-app/app/login.tsx:510-511` (`resolveBrokerSelectionError`)
Shows only while `isBrokerDirectoryBusy` (`isBrokerServersLoading || isBrokerServersFetching`) is `true` **and** the saved broker id (`achiever-financials`) isn't yet found in the loaded list.

**Root cause — a frontend cache wipe:**
On logout, `teardownBrokerSessionRuntime()` (`rtx5-app/src/services/brokerSessionCoordinator.ts:213`) calls **`appQueryClient.clear()`** at **`brokerSessionCoordinator.ts:232`**. That clears the **entire** React Query cache — including the *public* broker directory query (`[brokerServers, 4]`), which is **not** session-scoped and does not need clearing.

Sequence after every logout:
1. Cache wiped → login screen's `useBrokerServers` has nothing cached.
2. Saved broker id `achiever-financials` restored instantly from SecureStore, but the list is empty.
3. `/broker/servers` must be re-fetched from scratch (timeout budget **10s** — `broker.ts:773`). Backend is slow (~1s+ per request), so this window is real and visible.
4. During the window: broker id set + no matching option yet → **"Please wait while the broker list loads."**

The message is *technically truthful* (the list genuinely is loading), but it is **amplified by the frontend**: if the directory cache survived logout, the saved broker would match instantly and this would never appear.

---

## Message 2 — "broker unavailable" (shows even when the broker is up)

**Rendered:** `probeBrokerHealth` catch → `rtx5-app/app/login.tsx:309`; login-press gate at `login.tsx:702-703`.

**Root cause — over-aggressive 1.5s timeout, no retry, cold socket:**
`checkBrokerServerHealth` (`rtx5-app/src/api/broker.ts:932`) aborts the `/health` probe after **`BROKER_HEALTH_TIMEOUT_MS = 1500`** (`broker.ts:775`). A **timeout throws the exact same `'Selected broker is unavailable'` error as a real HTTP failure** (`broker.ts:953-955`) — the code **cannot distinguish "slow" from "down."**

Why it false-fires right after logout: teardown disconnects sockets and aborts in-flight requests, so the first `/health` hit pays a **cold DNS + TCP + TLS handshake + ~1s backend processing**. On mobile (VoWiFi) that routinely exceeds 1.5s → **false "unavailable" on a healthy broker.** There is **no retry** — one slow packet disables the LOGIN button.

Inconsistency: the *Settings/Accounts* health check uses a more forgiving **3000ms** (`SELECTED_BROKER_HEALTH_TIMEOUT_MS` in `rtx5-app/src/features/settings/BrokersScreen/selectedBrokerHealthGate.ts:5`) **plus** a shared health cache. The login screen is stricter than the rest of the app for no good reason.

---

## Frontend issues to fix

| # | Issue | Location | Effect |
|---|-------|----------|--------|
| 1 | `appQueryClient.clear()` on teardown wipes the *public* broker directory too | `brokerSessionCoordinator.ts:232` | Every logout→login re-pays the full directory fetch → the "Please wait" window |
| 2 | Health timeout only 1.5s, **no retry**, cold socket after logout | `broker.ts:775`, `login.tsx:298-317` | False "broker unavailable" when broker is fine |
| 3 | Timeout vs real failure are **indistinguishable** (same error string) | `broker.ts:953-964` | "Slow but healthy" looks identical to "down"; hard-blocks LOGIN |
| 4 | LOGIN hard-gated on health with no obvious manual retry on the login screen | `login.tsx:530-539` | If probe false-fails, button stays disabled; only recovery is re-opening the picker (which re-probes) |

---

## Recommended fixes (impact order)

1. ✅ **Preserve the broker directory across logout.** Implemented 2026-08-07: `teardownBrokerSessionRuntime` now calls `appQueryClient.removeQueries({ predicate })` keeping the `brokerServers` query (plus `getMutationCache().clear()` to match the old `clear()` semantics) instead of the wholesale `appQueryClient.clear()`.
2. ✅ **Loosen the login health probe.** Implemented 2026-08-07: `BROKER_HEALTH_TIMEOUT_MS` raised 1500 → 3000 (matches Settings) and `checkBrokerServerHealth` retries **once on timeout only**; genuine failures stay fail-closed with no retry.
3. **Distinguish timeout from HTTP failure.** Still open — a timeout (slow but reachable) still reads identically to a real outage and hard-blocks LOGIN.

---

## Tests to update in lockstep (source-contract tests pin current values)

- `rtx5-app/src/utils/apiLatencyContract.test.ts:84` — pins `const BROKER_HEALTH_TIMEOUT_MS = 1500` → **updated to `3000` + retry-on-timeout pins**
- `rtx5-app/src/utils/apiLatencyContract.test.ts:81` — pins `const BROKER_SERVERS_TIMEOUT_MS = 10000` (unchanged — directory timeout untouched)
- `rtx5-app/src/utils/loginInteractionPerformance.test.ts:89,96` — pins the health-warning string + login-gate structure (no change needed — `login.tsx` was untouched)
- `rtx5-app/src/features/settings/accountsSwitchSource.test.ts:101` — pinned `appQueryClient.clear()` in the coordinator → **updated to pin the targeted `removeQueries` + mutation-cache clear and to forbid the wholesale `clear()`** (discovered during implementation; not in the original list)

---

## Key files

| File | Role |
|------|------|
| `rtx5-app/app/login.tsx` | Login screen — broker selection, health probe, "Please wait" / "unavailable" rendering |
| `rtx5-app/src/api/broker.ts` | `getBrokerDirectory`, `checkBrokerServerHealth`, timeout constants |
| `rtx5-app/src/query/broker.ts` | `useBrokerServers` hook (staleTime 5m, 2 retries) |
| `rtx5-app/src/api/brokerRouting.ts` | `buildBrokerHealthUrl`, `PUBLIC_BROKER_DIRECTORY_BASE_URL` |
| `rtx5-app/src/services/brokerSessionCoordinator.ts` | `teardownBrokerSessionRuntime` → `appQueryClient.clear()` (the cache wipe) |
| `rtx5-app/src/features/settings/BrokersScreen/selectedBrokerHealthGate.ts` | Settings health gate (3s timeout — the more forgiving reference) |

---

## Next step

Fixes #1 and #2 implemented and verified (2026-08-07): full test suite (296 files) and `tsc --noEmit` pass. Remaining candidate work is fix #3 (distinct timeout messaging / softer LOGIN gate) and optional on-device verification of the logout→login flow.
