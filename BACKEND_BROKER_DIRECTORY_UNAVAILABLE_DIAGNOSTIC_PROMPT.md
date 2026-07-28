# RTX5 broker-directory “Unavailable” backend diagnostic prompt

You own the backend, edge, DNS, TLS, and broker-directory service used by the
RTX5 Expo/React Native mobile app.

Investigate only the broker-directory discovery boundary. Do not change feeds,
quotes, candles, trading, orders, authentication, demo registration, broker
selection, mobile code, EAS/OTA configuration, or unrelated infrastructure
unless evidence proves that component is the first failing boundary.

## Goal

Explain, with request/response evidence, why the mobile app could still report
that the broker list cannot be loaded after the verified local frontend fix.
If the backend is healthy, say so clearly and identify the first non-backend
boundary. Do not invent a backend fault just because the UI showed an error.

## Verified mobile request

The local mobile bundle reports:

```text
EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL=https://superbackend.orrnn.com/api/v2
```

The directory client makes exactly:

```http
GET /api/v2/broker/servers HTTP/1.1
Host: superbackend.orrnn.com
Accept: application/json
```

There is no authentication requirement for this public request. There is no
`testsuperbackend` fallback, selected-broker fallback, static broker list, raw
IP fallback, or reconstructed discovery host in the current frontend.

The local frontend now gives this request a 10-second client deadline. TanStack
Query may retry transient network/server failures, but it does not convert a
bad response into a usable broker list.

## Mobile response contract

The currently deployed route is expected to return HTTP 200,
`Content-Type: application/json`, and a top-level JSON array.

Each active/selectable row should contain:

```json
{
  "id": 1,
  "broker_id": "unique-non-empty-id",
  "broker_name": "Human readable name",
  "enabled": true,
  "active": true,
  "server_url": "https://exact-broker-service-root.example.com",
  "protocol": "https",
  "server": "host.example.com:443",
  "server_ip": "real routable address",
  "server_port": 443,
  "created_at": 1700000000,
  "market_api_url": "https://exact-broker-service-root.example.com/api/v2",
  "feed_wss_url": "wss://exact-broker-service-root.example.com/ws/feed",
  "feed_status_https_url": "https://exact-broker-service-root.example.com/ws/feed/status"
}
```

Contract rules:

- `broker_id` must be non-empty and unique.
- `broker_name` must be non-empty.
- Return `enabled: true` and `active: true` explicitly for selectable rows.
- `id`, `created_at`, and `server_port` must be finite JSON numbers.
- `protocol` must be `https`.
- `server_url` must be the exact absolute HTTPS broker service root.
- REST is derived by mobile as `{server_url}/api/v2`; do not publish a value
  that would produce `/api/v2/api/v2`.
- Health is derived as `GET {server_url}/health`.
- `feed_wss_url` and `feed_status_https_url` must be valid and broker-consistent.
- Endpoint aliases in the same row must not point to conflicting authorities.
- Do not add a required `status` field; the mobile app does not require one.
- Do not return HTML, a proxy error page, a JSON object with a different
  collection key, `null`, or a string instead of the expected array.

After the list loads, selected-broker availability is a separate request:

```http
GET {exact server_url}/health
Accept: application/json
```

The Settings broker feed badge is also separate and uses the advertised
`feed_status_https_url`. A feed badge cannot explain failure to load the
directory array.

## Current comparison evidence

On 2026-07-28, direct checks returned:

- `GET https://superbackend.orrnn.com/api/v2/broker/servers`
  -> HTTP 200, `application/json`.
- Four rows were accepted by the current mobile parser:
  `achiever-financials`, `gta_broker`, `myprop-trade`, and `orrnn-demo`.
- Every exact `GET {server_url}/health` returned HTTP 200.
- The patched local Android app rendered all four rows when it had a working
  network path.
- The originally affected Android runtime had `Active default network: none`,
  no DNS addresses, and could not resolve either `superbackend.orrnn.com` or
  `google.com`. In that state, the request could not reach Cloudflare or the
  backend.

Treat these as comparison facts, not as permission to skip a current live
check.

## Required backend investigation

1. Re-run the exact public GET from at least:
   - the backend host or trusted operations network;
   - one independent external network.

2. Record for each request:
   - UTC timestamp;
   - full URL and method;
   - DNS result;
   - TLS result;
   - HTTP status;
   - `Content-Type`;
   - total response time and time to first byte;
   - response byte count;
   - Cloudflare/edge trace ID such as `CF-Ray`;
   - backend request/correlation ID;
   - a redacted body or schema summary.

3. Check Cloudflare, reverse-proxy, and application logs for the reported mobile
   time window. State whether the request reached:
   - DNS/edge;
   - reverse proxy;
   - broker-directory application;
   - database/config source.

4. Validate every returned row against the mobile contract above. Report each
   rejected field explicitly. Do not summarize malformed rows as merely
   “frontend issue.”

5. Probe every exact `GET {server_url}/health`. Do not use `HEAD`, append
   `/api/v2`, reconstruct the host, or substitute another broker.

6. Check intermittent behavior:
   - DNS failures;
   - TLS handshake failures;
   - Cloudflare 52x responses;
   - origin timeouts;
   - responses exceeding the 10-second mobile deadline;
   - route-specific 404/405/5xx responses;
   - HTML or malformed JSON returned during errors;
   - inconsistent responses across edge regions.

7. Do not blame browser CORS unless a native React Native request actually
   proves a CORS-related failure. Native mobile fetch is not the same as a
   browser-origin request.

## Ownership decision

Use these rules:

- If no request reached the edge/backend and the device had no DNS/default
  network, verdict is `DEVICE_OR_NETWORK`, not backend.
- If the exact request reached the backend and backend/edge returned 4xx, 5xx,
  timed out, returned non-JSON, or violated the row contract, verdict is
  `BACKEND_OR_EDGE`.
- If HTTP 200 valid JSON arrived within 10 seconds and all four rows satisfy the
  contract, verdict is `BACKEND_PASS`; continue investigation at the
  device/runtime boundary.
- If failures are intermittent, use `INTERMITTENT_EDGE_OR_ORIGIN` and provide
  request IDs/timestamps for both a pass and a fail.

## Fix rules

Only if backend evidence proves a backend/edge fault:

- make the smallest route/configuration fix;
- preserve the exact canonical URL;
- preserve the top-level JSON array contract;
- preserve exact `broker_id` + `server_url` pairing;
- do not add mobile fallbacks or mock rows;
- do not modify unrelated services;
- add an automated regression test for the proven fault;
- deploy through the backend’s normal controlled process;
- repeat the exact external and mobile-shaped probes.

## Required response format

Return a plain, understandable report:

```text
VERDICT:
BACKEND_PASS | BACKEND_OR_EDGE | DEVICE_OR_NETWORK | INTERMITTENT_EDGE_OR_ORIGIN | INCONCLUSIVE

FIRST FAILING BOUNDARY:
<DNS, TLS, edge, reverse proxy, directory app, response contract, broker health, or device network>

WHAT THE MOBILE REQUESTED:
<exact method and URL>

WHAT THE BACKEND OBSERVED:
<arrival/no-arrival, timestamp, status, content-type, latency, request IDs>

ROW VALIDATION:
<accepted/rejected rows and exact field reasons>

ROOT CAUSE:
<one evidence-backed explanation>

FIX APPLIED:
<exact files/config/routes changed, or “none; backend passed”>

VERIFICATION:
<commands, statuses, timing, and health results>

REMAINING ACTION:
<one clear next owner and action>
```

Do not answer only “API is working.” Include the boundary evidence that proves
whether the mobile request reached the backend and whether the returned payload
was usable by the current RTX5 frontend.
