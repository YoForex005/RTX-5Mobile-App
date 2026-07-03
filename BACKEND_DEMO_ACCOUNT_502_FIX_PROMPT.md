# Backend Prompt: RTX5 Public Demo Account 502 Fix

Use this whole file as the backend implementation and verification prompt.

This prompt is for the backend/API/Cloudflare team. The RTX5 mobile frontend is currently blocked from creating demo accounts because the public demo account endpoints are returning Cloudflare `502 Bad Gateway`.

Frontend repo:

```text
C:\Users\ADMIN\RTX-5Mobile-App\rtx5-app
```

Backend repo expected by earlier handoff context:

```text
C:\Users\Administrator\Desktop\ORRNN BACKEND\ORRNN-RTX5-Broker-Backend
```

Do not put backend-only secrets, MT5 manager credentials, database credentials, Cloudflare tunnel tokens, API keys, or raw broker credentials into the mobile frontend.

## Role

You are the backend implementation and verification agent.

Your job is to fix the backend service that powers public Orrnn demo account creation for the RTX5 mobile app.

This is not a frontend task unless you can prove, with backend logs and a working replacement contract, that the frontend is calling the wrong route. Current frontend code, environment config, and project API docs all agree on the same public demo account contract.

## Target Outcome

The RTX5 mobile app must be able to:

1. Open the demo account registration screen.
2. Call public demo service health.
3. Load available demo groups.
4. Submit the demo account creation form.
5. Receive a valid created account response.
6. Continue into the normal login/account flow.

The user should not see:

```text
Demo account unavailable
Demo status check failed: HTTP 502
```

## Current Failure

As of 2026-07-03, direct probes from the frontend development machine show:

```text
GET  https://backend.orrnn.com/api/v1/public/demo-status   -> 502 Bad Gateway
GET  https://backend.orrnn.com/api/v1/public/demo-groups   -> 502 Bad Gateway
POST https://backend.orrnn.com/api/v1/public/demo-account  -> 502 Bad Gateway
```

The same backend host is not globally down:

```text
GET https://backend.orrnn.com/api/v2/brokers -> 200 OK
```

Nearby wrong route variants return `404`, which is expected and confirms the frontend is not simply using a mistyped path:

```text
GET https://backend.orrnn.com/api/v2/public/demo-status  -> 404
GET https://backend.orrnn.com/public/demo-status         -> 404
GET https://backend.orrnn.com/api/v1/demo-status         -> 404
GET https://backend.orrnn.com/api/v2/public/demo-groups  -> 404
```

`superbackend.orrnn.com` is not currently a valid replacement for the public demo routes:

```text
GET https://superbackend.orrnn.com/api/v1/public/demo-status -> 404
GET https://superbackend.orrnn.com/api/v2/public/demo-status -> 404
```

The mobile `.env` explicitly documents this:

```text
# superbackend does not currently host /public/demo-* routes.
EXPO_PUBLIC_DEMO_API_BASE_URL=https://backend.orrnn.com/api/v1
```

## Cloudflare Evidence

Recent failing response:

```text
HTTP/1.1 502 Bad Gateway
Server: cloudflare
Content-Type: text/plain; charset=UTF-8
CF-RAY: a1554cdedb0cfcf6-SIN

error code: 502
```

Earlier failing Ray IDs seen during the same investigation:

```text
a15544e1faacfe8b-SIN
a15544e188f6db9c-SIN
a1554559cb7a2a48-MRS
a1554736b8d23391-MRS
```

Check Cloudflare logs, tunnel logs, reverse proxy logs, and backend app logs for these Ray IDs and for requests to `/api/v1/public/demo-*`.

## Frontend Contract

The frontend public demo API base is:

```text
https://backend.orrnn.com/api/v1
```

The frontend calls:

```text
GET  /public/demo-status
GET  /public/demo-groups
POST /public/demo-account
```

Full URLs:

```text
GET  https://backend.orrnn.com/api/v1/public/demo-status
GET  https://backend.orrnn.com/api/v1/public/demo-groups
POST https://backend.orrnn.com/api/v1/public/demo-account
```

Relevant frontend files:

```text
rtx5-app/src/api/publicDemo.ts
rtx5-app/app/register.tsx
rtx5-app/.env
docs/guide/API_CONTRACTS.md
```

The register button is not supposed to be permanently disabled by backend health. The frontend allows the user to press the button after accepting terms, then blocks account creation if `GET /public/demo-status` is not healthy. That is why the UI shows `Demo account unavailable` when the backend returns `502`.

## Required Endpoint Behavior

### 1. Demo Status

Request:

```text
GET /api/v1/public/demo-status
Accept: application/json
```

Expected success:

```json
{
  "service": "orrnn-demo",
  "status": "ok",
  "broker": "active",
  "demo_groups_available": 1,
  "total_demo_accounts": 0,
  "database": "connected"
}
```

The frontend treats the service as healthy only when:

```text
service == "orrnn-demo"
status == "ok"
broker == "active"
database == "connected"
demo_groups_available > 0
```

If the service is intentionally unavailable, return a controlled JSON error with `503`, not a Cloudflare `502`.

### 2. Demo Groups

Request:

```text
GET /api/v1/public/demo-groups
Accept: application/json
```

Expected success:

```json
{
  "groups": [
    {
      "name": "demo\\RTX5-Demo",
      "description": "RTX5 Demo",
      "currency": "USD",
      "leverage": 100
    }
  ],
  "count": 1
}
```

The exact group name must be a valid demo group accepted by the account creation endpoint and the underlying MT5/broker integration.

### 3. Demo Account Creation

Request:

```text
POST /api/v1/public/demo-account
Content-Type: application/json
Accept: application/json
```

Example body:

```json
{
  "group": "demo\\RTX5-Demo",
  "email": "test@example.com",
  "master_pass": "abc@1234",
  "investor_pass": "abc@1234",
  "first_name": "Test",
  "last_name": "User",
  "phone": "9999999999",
  "country": "IN",
  "currency": "USD",
  "leverage": 100,
  "initial_balance": 10000,
  "origin_broker": "rtx5-mobile"
}
```

Expected success status:

```text
200 OK
```

Expected success body:

```json
{
  "login": 123456,
  "broker_id": "orrnn",
  "group": "demo\\RTX5-Demo",
  "currency": "USD",
  "leverage": 100,
  "balance": 10000,
  "api_key": "optional-if-supported",
  "master_pass": "optional-if-supported",
  "created_at": 1780000000
}
```

The frontend requires `login` to be a number. If `api_key` is not returned, the mobile app can fall back to normal V2 login using the created login and master password.

## Backend Areas To Check

Check these in order:

1. Cloudflare route/tunnel for `backend.orrnn.com`.
2. Reverse proxy rule for `/api/v1/public/demo-status`.
3. Reverse proxy rule for `/api/v1/public/demo-groups`.
4. Reverse proxy rule for `/api/v1/public/demo-account`.
5. Backend application process that serves public demo routes.
6. Demo route registration/mount path.
7. MT5 manager/demo account service connection.
8. Database connection used by demo status and demo group lookup.
9. Demo group seed/config availability.
10. Any upstream timeout, process crash, invalid response, or unhandled exception that Cloudflare converts into `502`.

Important: `OPTIONS` preflight may succeed even when the actual `GET` or `POST` fails. Do not stop after proving CORS/preflight works. The real issue is that actual demo route handling returns `502`.

## Non-Goals

Do not ask the frontend to:

- Treat `502` as success.
- Create fake demo accounts locally.
- Hardcode demo groups.
- Bypass `/public/demo-status`.
- Switch to `superbackend.orrnn.com` unless the backend first deploys and verifies the same `/api/v1/public/demo-*` routes there.
- Store backend secrets or MT5 manager credentials in the mobile app.

## Reproduction Commands

Run these from any machine with internet access:

```bash
curl -i -L --max-time 20 https://backend.orrnn.com/api/v1/public/demo-status
curl -i -L --max-time 20 https://backend.orrnn.com/api/v1/public/demo-groups
curl -i -L --max-time 20 https://backend.orrnn.com/api/v1/public/demo-account \
  -H "Content-Type: application/json" \
  -d "{}"
curl -i -L --max-time 20 https://backend.orrnn.com/api/v2/brokers
```

Expected after fix:

```text
demo-status  -> 200 JSON healthy response
demo-groups  -> 200 JSON groups response with count > 0
demo-account -> 400/422 JSON validation error for empty body, not 502
brokers      -> 200 JSON broker list
```

Then test with a valid account creation body:

```bash
curl -i -L --max-time 30 https://backend.orrnn.com/api/v1/public/demo-account \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "group": "REPLACE_WITH_VALID_DEMO_GROUP_FROM_DEMO_GROUPS",
    "email": "rtx5.demo.test@example.com",
    "master_pass": "abc@1234",
    "investor_pass": "abc@1234",
    "first_name": "RTX5",
    "last_name": "Demo",
    "phone": "9999999999",
    "country": "IN",
    "currency": "USD",
    "leverage": 100,
    "initial_balance": 10000,
    "origin_broker": "rtx5-mobile"
  }'
```

Expected after fix:

```text
HTTP 200
JSON body includes numeric login
Created account can authenticate through the normal RTX5 auth/login path
```

## Acceptance Criteria

The backend fix is complete only when all of these are true:

1. `GET /api/v1/public/demo-status` returns `200` and the healthy JSON contract.
2. `GET /api/v1/public/demo-groups` returns `200`, `count > 0`, and valid demo groups.
3. `POST /api/v1/public/demo-account` with an empty body returns a controlled JSON validation error, not Cloudflare `502`.
4. `POST /api/v1/public/demo-account` with a valid body returns `200` and a numeric `login`.
5. The created demo account exists in the underlying trading system.
6. The created account can be used by the normal mobile login flow.
7. Cloudflare no longer returns `502` for `/api/v1/public/demo-*`.
8. Backend logs show request IDs/Ray IDs for success and controlled failure cases.
9. If an upstream dependency is down, backend returns a controlled JSON `503` with a clear message instead of letting Cloudflare emit a generic `502`.

## Evidence To Return

Return this evidence to the mobile/frontend team:

```text
1. Root cause found:
2. Backend files/routes changed:
3. Cloudflare/reverse-proxy change made, if any:
4. Demo status curl output:
5. Demo groups curl output:
6. Empty-body demo account curl output:
7. Valid demo account curl output with login redacted if needed:
8. Confirmation that the account can login:
9. Any remaining known limitation:
```

Do not return real passwords, MT5 manager credentials, database credentials, Cloudflare secrets, or long-lived tokens.
