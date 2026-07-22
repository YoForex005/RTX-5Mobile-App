# Backend Trading Issues - Investigation and Fix Prompt

Use this prompt with the backend agent/developer responsible for the broker API, trading gateway, and MT5/broker adapter.

## Mobile application context

This issue is reported by the **RTX5 Mobile App**, whose frontend is built with React Native/Expo for Android and iOS. It was reproduced and validated locally on Android through Expo Go. The affected mobile surfaces are:

- The quick-close `X` action on an open row in the Trade screen.
- The confirmation action in the Close Position screen.

This file is a backend-fix handoff. The frontend behavior below is already implemented and verified; the backend agent should use it to understand exactly what the mobile app sends and how it handles the response. Do not solve this issue by changing mobile `.env` values or by asking the frontend to hide a backend failure.

### Current local mobile routing configuration

The following non-secret public routing values were verified from `rtx5-app/.env` on 2026-07-22. The file itself was not changed:

```text
EXPO_PUBLIC_API_BASE_URL=https://superbackend.orrnn.com/api/v2
EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL=https://superbackend.orrnn.com/api/v2
EXPO_PUBLIC_DEMO_API_BASE_URL=https://backend.orrnn.com/api/v1
```

Their responsibilities are different:

- The mobile broker directory request starts at `GET https://superbackend.orrnn.com/api/v2/broker/servers`.
- `superbackend.orrnn.com` is a shared platform/directory origin. It is not used as an automatic fallback destination for an authenticated broker close.
- The selected directory record's exact HTTPS `server_url` is the authority for the broker session. Authenticated REST requests are routed to `{server_url}/api/v2`, and the active session stores that resolved broker API base.
- `https://backend.orrnn.com/api/v1` is the separate public demo-service base; it is not the normal authenticated close-position route.
- The `.env` also contains secret-bearing monitoring/feed configuration. Those values are intentionally omitted because they are not required to diagnose this close failure and must not be copied into logs or tickets.

Backend tracing must therefore begin with the broker directory record selected for account `200009`, confirm its exact `server_url`, and then follow the close request through that broker-specific API/gateway. Do not assume the close was sent to the shared directory host merely because it appears in `.env`.

## How the mobile frontend works now

Both mobile close surfaces use the same API contract and safety model:

1. At the moment of the tap, the frontend checks that the selected position has a positive canonical broker ticket.
2. It checks the latest executable quote again using the current time. A missing, stale, or source-mismatched quote is blocked locally before any close request is sent.
3. It captures the active broker/account session and verifies that the selected position still belongs to that immutable session. A missing token or an account switch is handled as a frontend/session error, not as `Trading Server Unavailable`.
4. For immediate visual feedback, the position row is removed optimistically from the mobile state.
5. The frontend calls the authenticated position API using the active broker's validated API base. It does not reconstruct, replace, or hardcode a fallback broker host.
6. The shared API layer adds the Bearer token, JSON headers, and one unique idempotency key for that logical close request.
7. If the access token receives a `401` and is refreshed, the authenticated retry reuses the same request headers and therefore the same idempotency key.
8. On a successful `2xx` response, the optimistic close is finalized, position/history/account query roots are invalidated, and open positions are reconciled with the backend.
9. On any rejection or transport failure, the exact optimistically removed position is restored and the backend/API error is shown to the user. The mobile app does not fabricate a successful close.
10. The frontend does not blindly retry a close after a `5xx` response or unknown transport outcome, because doing so without backend idempotent reconciliation could cause a duplicate mutation.

The mobile title `Trading Server Unavailable` is selected only after the request has entered the API path and either:

- the response status is `502` or greater; or
- the request fails with a recognized timeout/network/connection error.

Normal frontend validation failures, `401`, `429`, `400/403/404/409/422`, and known broker rejection codes are classified separately and do not produce this title.

### Verified frontend result

The frontend flow itself is operational. In the controlled mobile test it opened `EURUSD BUY 0.01` as ticket `1001207`, closed that exact ticket through the same close path, and reconciled the account from `9 positions / 0.09 lots` back to the original `8 positions / 0.08 lots`. This proves that the route shape, authentication path, ticket serialization, optimistic rollback/finalization logic, and successful-response reconciliation can work. The remaining failure is intermittent availability or unknown-outcome handling inside the backend/gateway/upstream trading path.

## Scope and ownership rule

Investigate and fix the backend causes described below. Do not ask the mobile team to hide the error, fabricate a successful close, retry non-idempotently, hardcode a broker host, or change a mobile `.env` file. The mobile app already sends the documented request through the authenticated broker API base selected for the active broker session.

## Issue 1: intermittent `Trading Server Unavailable` while closing a position

### User-visible behavior

When the user closes an open position from the Trade screen, the mobile app can show:

- Title: `Trading Server Unavailable`
- Meaning shown to the user: the trading server did not respond while the app was trying to close the position.

This exact mobile classification is used only when one of these conditions is true:

1. The close endpoint returns HTTP `502`, `503`, `504`, or another status greater than or equal to `502`; or
2. The request fails at network/transport level with a timeout, connection reset/refused, socket hang-up, or equivalent fetch failure.

It is not the mobile validation used for an invalid ticket, missing session, stale quote, or a normal broker rejection.

### Verified mobile request contract

The full-close request is:

```http
POST /api/v2/positions/{ticket}/close
Authorization: Bearer <active-account-access-token>
Accept: application/json
Content-Type: application/json
Idempotency-Key: <unique key scoped to close-{ticket}>

{"mode":"full"}
```

Mobile-side guarantees before submission:

- `{ticket}` is a positive canonical broker position ticket, preserved as a decimal string so a 64-bit ID cannot be rounded by JavaScript.
- The active broker/account session is captured and checked before the mutation.
- A fresh executable quote is required.
- The full-close body contains only `mode: "full"`; it does not mix full and partial-close fields.
- The client uses one idempotency key for the logical request, including the automatic retry after an access-token refresh.
- On failure, the optimistic row removal is rolled back; the app does not pretend that the trade closed.

### Local evidence from 2026-07-22

- Surface: Android Expo Go local development build.
- Account login used for the controlled test: `200009`.
- A single `EURUSD BUY 0.01` was opened successfully as broker ticket `1001207` at `2026-07-22 13:34:27` local device time.
- The same mobile close flow later closed ticket `1001207` successfully.
- Open exposure returned from `9 positions / 0.09 lots` to the original `8 positions / 0.08 lots`, proving the endpoint, authentication route, ticket format, and success reconciliation can work.
- The reported `Trading Server Unavailable` result is therefore intermittent. The exact failing HTTP status/body/request ID was not available in Android logcat; the client intentionally avoids dumping authenticated trading response bodies in normal mode.

### Backend investigation required

Trace every failed `POST /api/v2/positions/{ticket}/close` across these stages:

1. Public API ingress/load balancer.
2. Authentication and broker/account routing.
3. Trading service queue/worker.
4. Broker or MT5 terminal adapter/session.
5. Upstream close-position call and acknowledgement.
6. Database transaction and response serialization.

For the failing time window, correlate by account login, position ticket, idempotency key, broker ID, request/correlation ID, route, HTTP status, total latency, upstream latency, adapter result/retcode, and timeout source. Redact access tokens and credentials.

Specifically check for:

- Gateway timeout shorter than the normal broker/MT5 close acknowledgement time.
- An unavailable, disconnected, or stale MT5/broker trading session while market-data connectivity still appears healthy.
- Connection-pool exhaustion, worker starvation, deadlock, queue backlog, or deployment restart.
- Incorrect broker/account routing on only the close endpoint.
- A close that succeeds upstream but times out before the API replies.
- A retry with the same idempotency key being treated as a second close instead of returning the stored first result.
- Unhandled adapter exceptions being flattened into a generic `502/503` without a stable error code.

### Required backend behavior

- A valid close must return one deterministic `2xx` response only after the broker has accepted/confirmed the operation, with the closed ticket and execution result in JSON.
- A repeated request with the same idempotency key and identical body must return the original result and must never close twice.
- If the upstream outcome is unknown after a timeout, reconcile by ticket/idempotency key before returning or retrying; do not issue a blind second close.
- Return `502/503/504` only for genuine upstream availability/timeout conditions.
- Return a stable, machine-readable JSON error envelope for failures, for example:

```json
{
  "error": "TRADING_UPSTREAM_UNAVAILABLE",
  "message": "The broker trading session is temporarily unavailable.",
  "request_id": "<correlation-id>",
  "retryable": true
}
```

- Preserve the real upstream retcode/reason in secure backend logs while returning a safe client message.
- Emit metrics for close success/failure/unknown-outcome, latency percentiles, status, broker, and adapter failure reason.

### Reproduction and acceptance tests

1. With an authenticated test account and fresh quote, open a minimum-volume position and capture its canonical broker ticket.
2. Close it using the exact request above.
3. Run repeated sequential close cycles and concurrent traffic sufficient to expose intermittent gateway/adapter failures.
4. Inject delayed upstream acknowledgements, adapter disconnects, gateway restarts, and response-loss-after-success.
5. Retry the same logical request with the same idempotency key.

The backend fix is accepted only when:

- Valid close requests complete reliably without intermittent `502/503/504` or transport timeouts under expected load.
- A timeout after an upstream success cannot cause an incorrect open-position state or a duplicate mutation.
- Same-key retries return the original result.
- The open positions endpoint and realtime stream converge to the closed state promptly.
- Every failure has a searchable request ID and a stable error code.
- Automated integration tests cover success, broker rejection, upstream unavailable, upstream timeout with unknown outcome, idempotent replay, and token-refresh replay.

### Backend response requested

Return all of the following to the mobile team:

1. Confirmed root cause and affected component.
2. Example failing server trace with secrets redacted.
3. Code/config change made.
4. Automated tests added and their results.
5. Deployment environment/version and timestamp.
6. A request ID from a successful post-fix close and from each intentionally tested failure mode.
7. Confirmation that no frontend or mobile `.env` change is required.
