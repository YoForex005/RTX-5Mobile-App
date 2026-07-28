# Backend Task: Fix Achiever Mobile Market-Feed Authentication

## Role

Act as the backend engineer responsible for broker authentication, feed-token
issuance, WebSocket authorization, refresh, and broker/session isolation.

Work against the deployed Achiever service:

- REST base: `https://service.achieverfinancials.com/api/v2`
- Feed WebSocket: `wss://service.achieverfinancials.com/ws/feed`
- Feed status: `https://service.achieverfinancials.com/ws/feed/status`
- Canonical broker ID: `achiever-financials`

Do not invent a new mobile endpoint or weaken feed authentication.

## Objective

Make a fresh Achiever mobile login return an explicit, Achiever-scoped
market-feed authentication contract that opens the deployed Achiever feed
WebSocket and continues to work after token refresh, app resume, account switch,
and broker switch.

The production mobile flow must not depend on a static webterminal token or a
shared client environment token.

## Confirmed Evidence

The following was verified on 2026-07-28:

1. A fresh physical Android Achiever login succeeded. The drawer, Accounts,
   and Settings surfaces all resolved the active account to canonical broker
   `achiever-financials`. Authenticated `/auth/me`, account, positions, orders,
   instruments, market status, quotes, and candle-history requests succeeded.
2. The login response still did not produce the exact acceptable root-level
   `feed_token` + `feed_auth_context` pair. The current strict mobile build
   therefore failed closed and repeatedly reported the sanitized condition
   `Broker feed is disabled until its authentication contract is configured`.
   It did not open an Achiever `/ws/feed` socket and did not enter a 401 retry
   storm.
3. On the physical Achiever session, Quotes remained `Speed: 0 tps` and
   `Status: Unavailable`. It temporarily displayed bid/ask values after
   authenticated `GET /api/v2/quotes?symbols=...` returned HTTP `200`, but
   those rows later returned to `Unavailable`. These were bounded REST repair
   snapshots, not WebSocket ticks.
4. The Trade screen loaded account, position, order, balance, equity, margin,
   and floating-P/L data while Quotes remained unavailable. History and
   Settings also loaded. This proves the normal access-token REST session is
   healthy; it does not prove market-feed authentication.
5. The physical Chart first showed `Loading chart data...`, then logcat recorded
   authenticated `GET /api/v2/candles/USDJPY?timeframe=...&limit=...` HTTP
   `200`, after which M1 history rendered. The quote-feed warning continued.
   Therefore visible candles came from authenticated REST history/cache, not
   from a proven Achiever `/ws/feed` connection.
6. The current checkout has no server-candle enable/proven-compatible flags.
   Its default active-candle engine is quote-driven. Without `/ws/feed` ticks,
   a rendered historical series or one freshly fetched forming bar is not proof
   that the physical mobile chart is live.
7. A direct deployed probe of
   `GET /ws/feed/status?broker_id=achiever-financials` returned HTTP `200` with
   `feed_auth_required: true`, `upstream_connected: true`,
   `cserver_connected: true`, active source `cserver`, 567 total symbols, 320
   streaming symbols, 134 fresh/tradable symbols, and fresh/tradable `EURUSD`,
   `XAUUSD`, and `BTCUSD` provider data. These counts are a point-in-time
   sample; the provider-health conclusion is what matters.
8. The same status response omitted `broker_id`, `auth_evaluated`,
   `auth_accepted`, `auth_reason`, `market_available`, and `health_policy`,
   including when a foreign credential was presented. It is health-only and
   cannot prove that the mobile credential was accepted.
9. Achiever `/ws/feed?broker_id=achiever-financials` rejected both a missing
   credential and a foreign MyProp-configured legacy credential before upgrade
   with HTTP `401`. That configured credential opens the MyProp feed, proving that
   Achiever's failure is not Android networking, DNS, TLS, the `/ws/feed` path,
   symbols, or the existing subscription envelope.
10. A previously approved Achiever-scoped test credential opened the exact
    Achiever `/ws/feed`, accepted the existing subscription message, streamed
    `EURUSD`, `XAUUSD`, and `BTCUSD`, and made the physical app show
    `Status: LIVE` at approximately `7-10 tps`. The feed bridge and frontend
    tick processing are therefore known to work when authentication is valid.
11. A deployed `POST /api/v2/auth/refresh` returned HTTP `200` and the correct
    Achiever broker/account identity, but omitted both `feed_token` and
    `feed_auth_context`. Login and refresh currently fail the same handoff.
12. A direct diagnostic probe found that `wss://service.achieverfinancials.com/ws/v2`
    opened without a token and accepted separate `candles.XAUUSD.1m` and
    `ticks.XAUUSD` subscriptions. Repeated eight-second samples emitted roughly
    19-20 candle payloads and 19-23 bid/ask tick payloads with two subscription
    acknowledgements and no socket errors. This is a different transport and
    authorization surface from `/ws/feed`; its success cannot satisfy the
    Quotes acceptance test. The backend must explicitly confirm whether
    anonymous `/ws/v2` market data is intentional or an authorization defect.
13. A read-only shared-platform control test found that a MyProp-configured
    legacy credential also opened GTA `/ws/feed` when the request selected
    `broker_id=gta_broker`. This is a separate P0 isolation finding, not the
    Achiever product bug requested here. File it for the shared market-feed
    owner and include its ticket ID, but do not expand this Achiever change into
    a MyProp/GTA migration without explicit owner approval. The Achiever
    implementation must nevertheless bind its own credential to
    broker/account/session and must reject every foreign credential.

Therefore:

- The Achiever provider, feed bridge, REST session, snapshot route, and candle
  history route work.
- A `200` status response proves provider health only; it does not prove the
  current mobile credential was accepted.
- The primary production gap is the backend login/refresh feed-auth handoff and
  its broker isolation.
- The Chart and Quotes screens consume separate data planes. Visible candles,
  account P/L, or snapshot bid/ask values do not contradict a broken
  `/ws/feed` credential.
- The REST quote snapshot route is no longer the primary blocker. Preserve its
  current HTTP `200` behavior, provenance, and non-executable semantics while
  fixing the live socket.
- `/ws/v2` success is not an alternative definition of done for `/ws/feed`.
- Reintroducing a static public-webterminal or environment token is forbidden.

## Confirmed Mobile Data-Plane Architecture

Do not debug this as one generic "market data" connection. The physical
observations match the current frontend architecture:

| Surface or state | Backend path | Credential | What success proves |
|---|---|---|---|
| Login, account, positions, orders, history | `/api/v2/...` | Access token | The authenticated REST session works |
| Chart history | `GET /api/v2/candles/{symbol}?timeframe=...&limit=...` | Access token | Historical or forming REST bars can render |
| Quote repair | `GET /api/v2/quotes?symbols=...` | Access token | A bounded display-only snapshot works |
| Quotes live rows and TPS | `/ws/feed?token=...&broker_id=achiever-financials` | Feed token declared by `feed_auth_context` | The authenticated live quote feed works |
| Trading or optional server-candle stream | `/ws/v2?token=<access_token>` or a separately documented public policy | Separate transport contract | Only that separate transport works |
| Feed status | `/ws/feed/status?...` | Optional evaluated feed credential | Provider health unless auth evaluation is explicit |

Relevant mobile code boundaries:

- `src/api/feedAuthContract.ts` requires an exact Achiever root-level
  `feed_token` + `feed_auth_context` and forbids Achiever environment fallback.
- `src/api/brokerApi.ts#getQuoteWebSocketUrl()` builds `/ws/feed` from that
  separate feed contract, while `getWebSocketUrl()` builds the trading
  `/ws/v2` URL from the access token.
- `src/features/quotes/QuotesScreen.tsx` increments TPS only from direct
  `subscribeToSymbol(...)` WebSocket callbacks.
- `src/features/quotes/useLiveQuotes.ts` marks REST repairs as
  `transport: "rest_snapshot"`, `tradable: false`, and `degraded: true`.
- `src/market/quoteIntegrity.ts` rejects REST snapshots for execution.
- `src/domain/candles/api/candles.ts` loads chart history through the
  authenticated REST client.
- `src/domain/candles/hooks/useLiveCandles.ts` can hydrate session-scoped memory
  and persisted candle caches before or while REST history loads.
- `src/features/chart/ChartScreen.native.tsx` can display the latest candle
  close when no true live quote is available.

The acceptance test must therefore prove repeated WebSocket bid/ask ticks and a
non-zero Quotes TPS. A rendered chart, a recent REST timestamp, a changing
account P/L, a subscription ACK without ticks, or HTTP `200` from the status
route is not sufficient.

Non-blocking mobile semantic note: the current Chart freshness helper can treat
a very recent REST snapshot as a display-fresh quote for roughly the local
freshness window, even though execution correctly rejects
`transport: "rest_snapshot"`. This may make a Chart price briefly look live, but
it does not cause the missing Achiever ticks and is not a backend workaround.
The backend must return truthful provenance and timestamps; any future mobile
label cleanup should remain a separate frontend task.

## Why the Previous Backend Response Is Not Sufficient

The supplied response is a mobile integration/acceptance specification. It does
not prove that backend code was changed or deployed. It provides no:

- backend root cause,
- changed backend files/services,
- redacted deployed login or refresh response,
- fresh login-issued feed-token fingerprint,
- shared issuer/verifier proof,
- automated backend test results,
- deployment version/time,
- or physical run using the backend-issued credential.

Do not answer this task with another frontend prompt, architectural proposal, or
claim that the status endpoint is healthy. Implement and deploy the backend
contract, run the required tests, and return the redacted evidence requested
below. If deployment is blocked, state the exact blocker and owner; do not mark
the task complete.

## Existing Mobile Contract — Use This Exact Shape

The current mobile parser accepts only the root-level field
`feed_auth_context` with the following exact fields:

```json
{
  "mode": "query",
  "credential": "feed_token",
  "token_query_param": "token",
  "broker_id_query_param": "broker_id"
}
```

For the deployed Achiever gateway, return this response shape from a successful
login:

```json
{
  "access_token": "<REDACTED>",
  "refresh_token": "<REDACTED>",
  "expires_in": 86400,
  "account_login": "<ACHIEVER_ACCOUNT_LOGIN>",
  "broker_id": "achiever-financials",
  "feed_token": "<REDACTED_ACHIEVER_SCOPED_FEED_TOKEN>",
  "feed_auth_context": {
    "mode": "query",
    "credential": "feed_token",
    "token_query_param": "token",
    "broker_id_query_param": "broker_id"
  }
}
```

The mobile app will then construct:

```text
wss://service.achieverfinancials.com/ws/feed?token=<FEED_TOKEN>&broker_id=achiever-financials
```

There is no access-token alternative in the current Achiever mobile contract.
The parser intentionally rejects `credential: "access_token"`, aliases such as
`feed_auth`, camelCase fields, nested variants, missing identity fields, and
partial token/context pairs. Do not omit `feed_auth_context`, infer a token type
from token presence, or mix access and feed credentials.

## Required Backend Investigation

Trace one fresh Achiever login end to end through:

1. `POST /api/v2/auth/login`
2. Broker/account authentication
3. Feed-token issuer or token exchange
4. Broker/account/session cache persistence
5. `POST /api/v2/auth/refresh`
6. Logout, account switch, and broker switch
7. Reverse proxy and application handling for `/ws/feed`
8. Broker-specific token verifier selected during the upgrade
9. `/ws/feed/status`
10. `GET /api/v2/quotes?symbols=...`
11. `GET /api/v2/candles/{symbol}?timeframe=...&limit=...`
12. `/ws/v2` authorization and candle/tick subscription policy
13. Login/refresh response serialization after feed-credential issuance
14. API-pod-to-WebSocket-pod key/store propagation

Check specifically for:

- A global/default MyProp feed-token issuer being selected for Achiever.
- A token cache keyed only by user/login rather than broker + account + session.
- A global "active broker" or last-broker value affecting concurrent requests.
- Refresh retaining or restoring a token from another broker.
- Achiever using the wrong issuer, audience, signing key, token store, verifier,
  or broker alias.
- `/ws/feed` selecting a verifier before canonicalizing `broker_id`.
- A reverse proxy routing Achiever feed upgrades to the wrong tenant verifier.
- Clock skew or inconsistent expiry handling.
- Login returning a token without the explicit `feed_auth_context`.
- Auth and WebSocket replicas using different JWT keys/JWKS versions or
  different opaque-token store namespaces.
- Query parsing that trims, lowercases, double-decodes, or converts an opaque
  token's `+` bytes incorrectly.
- A response DTO/schema/allowlist that strips `feed_token` or
  `feed_auth_context` after the issuer creates them.
- API and WebSocket replicas using different deployment-time secrets, JWKS
  generations, opaque-token namespaces, broker aliases, or configuration
  versions.
- `/ws/v2` allowing anonymous subscriptions unintentionally, or applying a
  verifier/default policy different from the access-token URL published to
  mobile.
- A verifier that chooses trust solely from the requested `broker_id` or host
  without proving that the credential itself is bound to that broker.
- Candle history returning a recent forming bar that is then mistaken for a
  continuously live stream.
- The deployment/configuration change that moved the authenticated REST quote
  snapshot from the previously observed undocumented `409` to the currently
  observed `200`, and whether every replica now behaves consistently.

Also compare redacted response keys and credential metadata from a known-good
broker login with Achiever to locate the handoff divergence. This is read-only
diagnostic evidence: never copy another broker's token, issuer, audience,
signing key, token-store record, verifier default, or client fallback into the
Achiever implementation.

If the token is a JWT, compare only redacted protected-header metadata, claims,
and keyed fingerprints:

- protected header: `alg`, `kid`
- claims:
  - `iss`
  - `aud`
  - `sub` or account binding
  - canonical `broker_id`
  - market-feed scope
  - `iat`
  - `nbf`
  - `exp`
  - `jti`

If it is opaque, inspect the equivalent broker, account, session, scope, expiry,
generation, and revocation records in the server-side token store.

Never paste a real token into a ticket, source file, online decoder, log, or
final report.

## Required Backend Architecture

Implement one shared broker-scoped `FeedCredentialService` (or an equivalent
single authority) and use it from login, refresh, feed status, and WebSocket
upgrade. Do not duplicate verifier logic in four route handlers.

The service must expose responsibilities equivalent to:

1. `canonicalizeBrokerId(input) -> canonical broker ID | INVALID_BROKER_ID`;
   approved Achiever aliases map to `achiever-financials`, unrelated brokers
   retain their own canonical IDs, and unknown IDs are rejected
2. `issueFeedCredential(broker, account, session, generation)`
3. `rotateFeedCredential(refreshSession, expectedGeneration)`
4. `verifyFeedCredential(rawCredential, requestedBroker, routedHost)`
5. `revokeFeedCredential(session, generation, reason)`
6. `evaluatePresentedCredential(rawCredential | absent, requestedBroker,
   routedHost) -> accepted | rejected | not_evaluated`
7. `readProviderHealth(canonicalBroker) -> provider health only`
8. `composeFeedStatus(credentialEvaluation, providerHealth) -> independent
   auth and provider fields`

For a JWT design:

- Use an Achiever-specific issuer/audience and market-feed scope.
- Bind canonical broker, account/user, authenticated session, generation,
  `iat`, `nbf`, `exp`, and `jti` as claims.
- Put `kid` in the protected JOSE header and use it only through the approved
  key-selection/rollover path; do not rely on an unprotected or payload copy.
- Publish or distribute the same verification key/JWKS generation to every API
  and WebSocket replica before issuing with it.
- Define clock-skew and key-rollover overlap explicitly.

For an opaque-token design:

- Store only a keyed cryptographic token lookup identifier such as
  HMAC-SHA-256 with a dedicated server-side key; never store or log the raw
  opaque token.
- Key the record by canonical broker + account/user + session + generation,
  never by login alone.
- Share the same strongly consistent or appropriately replicated namespace
  between HTTP auth and WebSocket workers.
- Store scope, expiry, revocation, generation, and routed-host entitlement.

In both designs:

- Login/refresh response creation and feed credential persistence must be
  atomic from the client's perspective.
- Concurrent refreshes must use compare-and-swap or equivalent generation
  control. One succeeds; stale refresh attempts fail deterministically.
- Logout, account switch, broker switch, password/session revocation, and
  administrative revocation must invalidate the correct feed generation.
- Never use a process-global "active broker", last broker, default MyProp
  issuer, or user-only cache key.
- Preserve opaque credential bytes exactly through JSON and URL query parsing:
  percent-decode once and never trim, lowercase, double-decode, or reinterpret
  `+`.
- Align feed-token lifetime with the authenticated session/access-token
  lifecycle. If feed expiry differs, return a documented mobile-readable expiry
  field and include it in the contract tests.

## Required Backend Changes

### 1. Broker-scoped issuance

- Achiever login must issue an Achiever credential.
- Credentials configured or issued for MyProp/GTA must never authenticate
  against Achiever.
- Bind the feed credential to at least:
  `broker_id + account/user + authenticated session + token generation`.
- Do not issue the static public-webterminal credential as a customer session
  credential.
- Return canonical `broker_id: "achiever-financials"`.

### 2. Deterministic login contract

- Return `feed_token` and the exact `feed_auth_context` shown above.
- Return the contract from every applicable Achiever entry point: login,
  registration/login handoff, broker-detail login, and account switch.
- Keep the feed contract independent from unrelated broker configuration.

### 3. Refresh behavior

- `POST /api/v2/auth/refresh` must preserve the same Achiever feed-auth mode.
- Refresh receives only `refresh_token`; recover the canonical broker, account,
  session, and current generation from the refresh session.
- Return a newly rotated Achiever `feed_token`. It must differ from the
  immediately previous valid Achiever feed-token generation. If the current
  session has no feed token because the broken handoff omitted it, issue the
  first valid generation instead of pretending that a rotation occurred.
- When a concrete credential URL is deterministically rejected, mobile latches
  that rejected URL and will not reconnect with the same credential. A recovery
  refresh must therefore supply a genuinely new valid generation.
- Return the exact root-level `broker_id`, `account_login`, `feed_token`, and
  `feed_auth_context` pair on every successful refresh.
- Return both rotated access and refresh tokens as required by the current
  mobile refresh contract.
- Rotate/revoke atomically and document whether the old feed token is rejected
  immediately or has a short controlled overlap.
- Refreshing Achiever must never replace another broker's credential, and vice
  versa.

### 4. `/ws/feed` authorization

For:

```text
wss://service.achieverfinancials.com/ws/feed?token=<TOKEN>&broker_id=achiever-financials
```

the backend must:

1. Parse and canonicalize `broker_id`.
2. Select the Achiever verifier from that canonical ID.
3. Validate token signature/lookup, issuer, audience, scope, expiry, revocation,
   broker binding, account/session binding, and entitlement.
4. Confirm the token broker matches both the requested broker and routed host.
5. Complete HTTP `101` only after successful authorization.
6. Accept the exact token returned by the same deployed login/refresh flow.
7. Accept the existing mobile subscription message:

```json
{
  "type": "subscribe",
  "symbols": ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"]
}
```

8. Emit only entitled/requested symbol ticks containing finite `bid`, `ask`,
   and a server timestamp with documented unit/timezone. Do not send another
   broker's cached symbols or silently broadcast an unscoped global stream.

Do not fix this by disabling authentication or accepting a cross-broker token.

### 5. Stable failure semantics

The current missing/foreign-token probe returned the generic body
`{"error":"broker service unauthorized"}`. That confirms rejection but is not
sufficient for deterministic recovery or safe diagnostics.

Use deterministic, sanitized pre-upgrade responses:

- Missing token while auth is required: `401 FEED_AUTH_REQUIRED`
- Invalid/malformed token: `401 FEED_TOKEN_INVALID`
- Expired token: `401 FEED_TOKEN_EXPIRED`
- Revoked token: `401 FEED_TOKEN_REVOKED`
- Valid token whose broker binding does not match the canonical request broker
  or routed host: `403 FEED_BROKER_MISMATCH`
- Validly formed token whose authoritative account/session/entitlement record
  does not permit this connection: `403 FEED_PRINCIPAL_FORBIDDEN`
- Invalid broker ID: `400 INVALID_BROKER_ID`
- Valid auth but unavailable provider: `503 FEED_UNAVAILABLE`

Include a safe request ID. Never echo the token or token-bearing URL.
Perform principal comparison against the authoritative authenticated-session
record and broker entitlement store, not client-supplied account fields. Keep
the external principal failure reason coarse to avoid account/session
enumeration; retain the precise sanitized category in restricted server logs.

Use one response envelope:

```json
{
  "error": {
    "code": "FEED_TOKEN_EXPIRED",
    "message": "Market-feed authentication failed.",
    "request_id": "<SAFE_REQUEST_ID>"
  }
}
```

Only `code` varies by the cases above. Keep `message` coarse and never add token
claims, account identifiers, verifier details, or raw upstream errors.

If authentication fails after upgrade, use a documented error frame and close
code such as `1008`/`4001` (or documented `4401`/`4403`). Do not move secure
pre-upgrade validation after the upgrade solely to accommodate React Native.

### 6. Feed-status semantics

Keep provider health separate from credential acceptance.

The status route must use the same credential parser, canonical broker mapping,
and verifier as `/ws/feed`. For a request carrying a credential, it should
include:

```json
{
  "broker_id": "achiever-financials",
  "feed_auth_required": true,
  "auth_evaluated": true,
  "auth_accepted": true,
  "auth_reason": "accepted",
  "upstream_connected": true,
  "cserver_connected": true,
  "market_available": true,
  "health_policy": {
    "local_tick_stale_after_ms": 15000,
    "server_status_stale_after_ms": 30000
  }
}
```

Rules:

- Read the same `token` and `broker_id` query parameters as `/ws/feed`.
- Keep this diagnostic endpoint HTTP `200` when a presented credential is
  invalid, expired, revoked, or broker-mismatched; report
  `auth_evaluated: true`, `auth_accepted: false`, and a sanitized reason. The
  WebSocket upgrade itself must still return the appropriate `401`/`403`.
- `auth_accepted: true` only when a presented credential was validated for the
  same canonical broker.
- `auth_accepted: false` when a presented credential was invalid, expired,
  revoked, or broker-mismatched.
- Use only the documented safe `auth_reason` values: `accepted`,
  `not_evaluated`, `invalid`, `expired`, `revoked`, `broker_mismatch`, and
  `principal_forbidden`. Do not expose account existence, key material, token
  claims, or verifier internals.
- When no credential was presented, always return the one deterministic shape:
  `auth_evaluated: false`, `auth_accepted: null`, and
  `auth_reason: "not_evaluated"`. Do not omit these fields or vary the schema
  by replica.
- Never derive it from global provider health or another client's successful
  authentication.
- A tokenless public `200` must remain clearly health-only.
- Return the backend-approved health thresholds expected by mobile. Do not make
  the app invent stale-data policy.

### 7. REST quote snapshot behavior

`GET /api/v2/quotes?symbols=EURUSD,XAUUSD,...` is a bounded snapshot repair
route, not a substitute for the WebSocket. The latest physical retry returned
HTTP `200` and populated fallback quotes. Preserve this behavior for every
replica. For an authenticated and entitled Achiever account, it must return
HTTP `200` with fresh, broker-scoped snapshots containing at least `symbol`,
`bid`, `ask`, a server timestamp, and `transport: "rest_snapshot"` on each
record or in an exactly documented per-record metadata field. Do not call the
source `live`, `websocket`, or another ambiguous value. A generic "unsupported"
capability is not an acceptable Achiever outcome because this deployed
Achiever route is confirmed to work; reserve that capability for brokers where
snapshots are actually unsupported.

Do not regress to the previously observed opaque HTTP `409` for a normal
authenticated Achiever session. If `409` represents a real business conflict,
return a stable machine code, sanitized reason, request ID, and the exact
recovery action. Snapshot data must be isolated by canonical broker +
account/session and must never fall back to another broker's cached quotes.
Returning snapshot values must not set `auth_accepted`, `Status: LIVE`, or any
other signal that implies the WebSocket credential was verified.

### 8. Candle-history and `/ws/v2` separation

Preserve the working authenticated candle-history contract:

```text
GET /api/v2/candles/{symbol}?timeframe=M1&limit=<COUNT>
Authorization: Bearer <ACCESS_TOKEN>
```

For each response, document and test:

- canonical broker/account/session provenance;
- symbol and normalized timeframe;
- timestamp unit and timezone;
- whether the final bar is closed or forming;
- `price_basis` such as bid, ask, mid, or last;
- server generation time and source update time;
- freshness and stale thresholds;
- deterministic ordering, duplicate handling, and maximum count; and
- isolation from another broker's candle cache.

The REST route may return a current forming bar. That still must not be counted
as proof of a continuously live socket.

Treat `/ws/v2` as a separate security and capability decision:

The diagnostic probe used these independent single-channel frames:

```json
{"action":"subscribe","channel":"candles.XAUUSD.1m"}
{"action":"subscribe","channel":"ticks.XAUUSD"}
```

1. State whether it is public market data by design or requires an access
   token.
2. If authentication is required, reject missing/invalid credentials
   consistently before upgrade and use the same canonical broker/session
   authority as the published mobile trade URL.
3. If anonymous market data is intentionally public, document the allowed
   channels, entitlements, rate limits, abuse controls, data scope, and why
   mobile still publishes a token-bearing URL.
4. Keep `/ws/v2` access-token verification independent from the
   `/ws/feed` feed-token verifier. Never make one socket's success imply that
   the other credential was accepted.
5. Do not silently reroute Quotes from `/ws/feed` to `/ws/v2` as a workaround.
   The current Quotes subscription and backend contract must be repaired.

The Achiever `/ws/feed` task is complete only through the `/ws/feed` acceptance
criteria below. The `/ws/v2` policy review is required security work, not a
replacement transport proposal.

## Security and Observability

- Redact passwords, access tokens, refresh tokens, feed tokens, authorization
  headers, cookies, and WebSocket query strings.
- Scrub token query parameters from proxy/CDN access logs, APM spans, error
  reporters, request dumps, metrics labels, traces, and support tooling.
- Mark any status response that evaluates a credential
  `Cache-Control: no-store, private` and bypass CDN/shared caching. Never let a
  credential-bearing status URL become a cache key, referrer, analytics event,
  or retained query string.
- Identify a token only with a short keyed cryptographic fingerprint, such as a
  truncated HMAC-SHA-256 produced with a dedicated observability key. Do not
  use a reversible identifier or print the raw hash/store lookup key.
- Log safe request ID, canonical broker ID, safe account/session identifier,
  verifier selected, failure code, deployment version, and expiry category.
- Never log a JWT signature, full JWT payload, or raw token-bearing URL.
- Rotate any credential exposed during debugging.

## Required Automated Test Matrix

| Test | Expected result |
|---|---|
| Fresh Achiever login | Returns Achiever `feed_token` and exact `feed_auth_context` |
| Achiever refresh | Returns a different valid Achiever feed credential and rotated auth credentials |
| Achiever token -> Achiever feed | HTTP 101 and sustained ticks only for requested symbols; validate scoped ACK if documented |
| MyProp-configured legacy credential -> Achiever feed | 401/403; never opens |
| Achiever token -> MyProp feed | 401/403; never opens |
| Missing token | 401 `FEED_AUTH_REQUIRED` |
| Expired token | 401 `FEED_TOKEN_EXPIRED` |
| Revoked token | 401 `FEED_TOKEN_REVOKED` |
| Valid token, wrong broker/host | 403 `FEED_BROKER_MISMATCH` |
| Valid token, wrong account/session/entitlement | 403 `FEED_PRINCIPAL_FORBIDDEN` |
| Malformed token | 401 without server error or secret leakage |
| Unknown broker ID | 400 `INVALID_BROKER_ID` |
| Valid auth, provider down | Auth remains accepted; health separately unavailable |
| Broker/account switch | No stale credential survives |
| Concurrent broker sessions | Credentials and refresh remain isolated |
| Status without a credential | `auth_evaluated=false`, `auth_accepted=null`, `auth_reason=not_evaluated` |
| Status with foreign credential | `auth_evaluated=true`, `auth_accepted=false`, sanitized reason |
| Status with valid Achiever token | HTTP 200, `auth_evaluated=true`, `auth_accepted=true` |
| Credential-evaluating status cache policy | `Cache-Control: no-store, private`; no CDN/APM/query retention |
| API pod A -> WS pod B | Credential issued on one replica verifies on another |
| Snapshot replica consistency | Every targeted replica returns the same Achiever HTTP 200 contract |
| Concurrent refresh | One atomic generation wins; stale rotation cannot overwrite it |
| Opaque token encoding | Reserved bytes survive JSON and query parsing exactly |
| Response serialization | Issued `feed_token` and exact context survive DTO/schema/JSON serialization |
| Authenticated quote snapshots | HTTP 200 with broker-scoped bid/ask/timestamp and explicit `rest_snapshot` provenance |
| Snapshot is not live | Does not authenticate `/ws/feed`, increment TPS, or authorize execution |
| Quote snapshot conflict | No undocumented `409`; deterministic machine code and recovery if conflict is real |
| Authenticated candle history | HTTP 200 with broker scope, price basis, tail timestamp, and closed/forming semantics |
| History while feed unavailable | Chart may render REST bars; Quotes remains 0 TPS and execution stays blocked |
| Live feed after repair | Multiple ticks advance Quotes TPS and the default quote-driven active candle |
| `/ws/v2` policy | Missing/invalid token follows the documented public-or-authenticated policy |
| `/ws/v2` is not `/ws/feed` | Its ACK/ticks cannot satisfy the Quotes feed acceptance test |
| Achiever isolation matrix | Achiever accepts only Achiever credentials; its credential is rejected by other broker hosts |
| Credential/query mismatch | Changing only `broker_id` cannot make a credential valid for another broker |
| Logs | No raw credential or token-bearing URL |

Add a regression test proving a successful Achiever REST login can never select
the MyProp feed-token issuer or verifier. Reproduce the observed legacy
MyProp-token-to-GTA acceptance in a separate, redacted shared-platform P0 ticket;
it is not a blocking acceptance criterion for this Achiever-scoped patch.

## Direct Deployed Verification

Use Node.js 18+ and `ws`. Put this in an approved backend acceptance-test
harness. Inject `ACHIEVER_TEST_LOGIN`, `ACHIEVER_TEST_PASSWORD`, and a dedicated
`TOKEN_FINGERPRINT_KEY` from the secret store. Do not put their values in the
command line, enable shell tracing, print the environment, or save the raw
responses.

Keep login, refresh, token fingerprinting, and both WebSocket probes in one
process. This allows the raw credentials to remain in memory and prints only a
fixed safe allowlist:

```js
const { createHmac } = require("node:crypto");
const WebSocket = require("ws");

const apiBase = "https://service.achieverfinancials.com/api/v2";
const brokerId = "achiever-financials";
const requestedSymbols = new Set(["EURUSD", "XAUUSD", "BTCUSD"]);
let fingerprintKey = "";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw Object.assign(new Error(), { safeCode: `missing_${name}` });
  return value;
};

const fail = (safeCode) => {
  throw Object.assign(new Error(), { safeCode });
};

const fingerprint = (token) =>
  createHmac("sha256", fingerprintKey)
    .update(token, "utf8")
    .digest("hex")
    .slice(0, 16);

const postJson = async (path, payload, label) => {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    fail(`${label}_network_error`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    fail(`${label}_non_json_${response.status}`);
  }
  if (!response.ok) fail(`${label}_http_${response.status}`);
  return { status: response.status, body };
};

const exactContext = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort().join(",");
  return (
    keys === [
      "broker_id_query_param",
      "credential",
      "mode",
      "token_query_param"
    ].sort().join(",")
    && value.mode === "query"
    && value.credential === "feed_token"
    && value.token_query_param === "token"
    && value.broker_id_query_param === "broker_id"
  );
};

const printSafeContract = (label, status, body) => {
  const token = typeof body?.feed_token === "string" ? body.feed_token : "";
  console.log(JSON.stringify({
    label,
    http_status: status,
    broker_id: body?.broker_id === brokerId ? brokerId : "unexpected_or_missing",
    account_login_present: Boolean(String(body?.account_login ?? "").trim()),
    access_token_present: Boolean(body?.access_token),
    refresh_token_present: Boolean(body?.refresh_token),
    feed_token_present: Boolean(token),
    feed_token_fingerprint: token ? fingerprint(token) : null,
    expires_in_present: Number.isFinite(Number(body?.expires_in)),
    feed_auth_context_exact: exactContext(body?.feed_auth_context)
  }));
};

const assertContract = (body, label) => {
  if (
    body?.broker_id !== brokerId
    || !String(body?.account_login ?? "").trim()
    || !String(body?.access_token ?? "").trim()
    || !String(body?.refresh_token ?? "").trim()
    || !String(body?.feed_token ?? "").trim()
    || !Number.isFinite(Number(body?.expires_in))
    || !exactContext(body?.feed_auth_context)
  ) {
    fail(`${label}_contract_invalid`);
  }
};

const readServerTimeMs = (message) => {
  const raw =
    message?.timestamp ?? message?.ts ?? message?.time
    ?? message?.data?.timestamp ?? message?.data?.ts ?? message?.data?.time;
  if (raw == null) return NaN;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e17) return numeric / 1e6;
    if (numeric > 1e14) return numeric / 1000;
    if (numeric > 1e11) return numeric;
    return numeric * 1000;
  }
  return Date.parse(String(raw));
};

const probeFeedCredential = (feedToken, label) => new Promise((resolve, reject) => {
  const url = new URL("wss://service.achieverfinancials.com/ws/feed");
  url.searchParams.set("token", feedToken);
  url.searchParams.set("broker_id", brokerId);

  const ws = new WebSocket(url);
  const symbolsSeen = new Set();
  const priceStatesSeen = new Set();
  const lastServerTimeBySymbol = new Map();
  let tickCount = 0;
  let firstTickAt = 0;
  let completed = false;

  const finish = (safeCode, result) => {
    if (completed) return;
    completed = true;
    clearTimeout(timeout);
    if (safeCode) {
      try { ws.terminate(); } catch {}
      reject(Object.assign(new Error(), { safeCode }));
      return;
    }
    try { ws.close(1000, "verification complete"); } catch {}
    resolve(result);
  };

  const timeout = setTimeout(
    () => finish(`${label}_sustained_ticks_timeout`),
    20000
  );

  ws.on("open", () => {
    ws.send(JSON.stringify({
      type: "subscribe",
      symbols: [...requestedSymbols]
    }));
  });

  ws.on("message", raw => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    const symbol = String(message?.symbol ?? message?.data?.symbol ?? "").toUpperCase();
    const bid = Number(message?.bid ?? message?.data?.bid);
    const ask = Number(message?.ask ?? message?.data?.ask);
    if (!symbol || !Number.isFinite(bid) || !Number.isFinite(ask)) return;
    if (bid <= 0 || ask <= 0 || ask < bid) {
      finish(`${label}_invalid_bid_ask`);
      return;
    }

    if (!requestedSymbols.has(symbol)) {
      finish(`${label}_unrequested_symbol_tick`);
      return;
    }

    const serverTimeMs = readServerTimeMs(message);
    const ageMs = Date.now() - serverTimeMs;
    const previousTime = lastServerTimeBySymbol.get(symbol);
    if (
      !Number.isFinite(serverTimeMs)
      || ageMs < -5000
      || ageMs > 30000
      || (previousTime != null && serverTimeMs < previousTime)
    ) {
      finish(`${label}_invalid_or_stale_tick_time`);
      return;
    }

    lastServerTimeBySymbol.set(symbol, serverTimeMs);
    if (!firstTickAt) firstTickAt = Date.now();
    tickCount += 1;
    symbolsSeen.add(symbol);
    priceStatesSeen.add(`${symbol}:${bid}:${ask}`);

    const sustainedForMs = Date.now() - firstTickAt;
    if (
      tickCount >= 5
      && symbolsSeen.size >= 2
      && priceStatesSeen.size >= 3
      && sustainedForMs >= 2000
    ) {
      finish(null, {
        label,
        tick_count: tickCount,
        symbol_count: symbolsSeen.size,
        price_state_count: priceStatesSeen.size,
        duration_ms: sustainedForMs
      });
    }
  });

  ws.on("unexpected-response", (_request, response) => {
    finish(`${label}_upgrade_http_${response.statusCode}`);
  });
  ws.on("error", () => finish(`${label}_transport_error`));
  ws.on("close", code => {
    if (!completed) finish(`${label}_closed_${code}`);
  });
});

const main = async () => {
  const testLogin = required("ACHIEVER_TEST_LOGIN");
  const testPassword = required("ACHIEVER_TEST_PASSWORD");
  fingerprintKey = required("TOKEN_FINGERPRINT_KEY");
  if (Buffer.byteLength(fingerprintKey, "utf8") < 32) {
    fail("fingerprint_key_too_short");
  }

  const login = await postJson("/auth/login", {
    username: testLogin,
    password: testPassword,
    broker_id: brokerId
  }, "login");
  printSafeContract("login", login.status, login.body);
  assertContract(login.body, "login");
  const loginFingerprint = fingerprint(login.body.feed_token);
  console.log(JSON.stringify(
    await probeFeedCredential(login.body.feed_token, "login_feed")
  ));

  const refresh = await postJson("/auth/refresh", {
    refresh_token: login.body.refresh_token
  }, "refresh");
  printSafeContract("refresh", refresh.status, refresh.body);
  assertContract(refresh.body, "refresh");
  if (
    String(refresh.body.account_login) !== String(login.body.account_login)
    || refresh.body.access_token === login.body.access_token
    || refresh.body.refresh_token === login.body.refresh_token
  ) {
    fail("refresh_identity_or_auth_rotation_invalid");
  }
  if (fingerprint(refresh.body.feed_token) === loginFingerprint) {
    fail("refresh_feed_generation_not_rotated");
  }
  console.log(JSON.stringify(
    await probeFeedCredential(refresh.body.feed_token, "refresh_feed")
  ));
  console.log("PASS: Achiever login, refresh, rotation, and live feed");
};

main().catch(error => {
  console.error(`FAIL: ${error?.safeCode || "verification_failed"}`);
  process.exitCode = 1;
});
```

The requested-symbol tick sequence is the proof that the subscription was
accepted. If `/ws/feed` has a documented ACK frame, add an exact scoped ACK
assertion to the harness; do not infer or invent an ACK schema. The harness must
never print the token-bearing URL, raw response, raw frame, secret, username,
account login, email, name, or unrestricted error text.

The integrated positive harness must prove:

1. The fresh Achiever login feed token — must open and stream.
2. The Achiever refresh feed token — fingerprint must differ, then it must open
   and stream.

In the same secret-safe acceptance process, add a separate
`expectUpgradeRejection(...)` helper that retains test credentials only in
memory and proves:

1. An approved MyProp-configured legacy test credential — rejected.
2. An approved GTA-configured test credential — rejected.
3. An expired Achiever test token — rejected with `FEED_TOKEN_EXPIRED`.
4. A revoked Achiever test token — rejected with `FEED_TOKEN_REVOKED`.
5. No token — rejected with `FEED_AUTH_REQUIRED`.

The negative helper must assert the HTTP status and safe machine code without
printing the response body, raw credential, token-bearing URL, or unrestricted
library error.

Then run the Achiever-scoped redacted isolation matrix:

| Credential and target | Result |
|---|---|
| Achiever credential -> Achiever host | Open |
| MyProp credential -> Achiever host | Reject |
| GTA credential -> Achiever host | Reject |
| Achiever credential -> MyProp host | Reject |
| Achiever credential -> GTA host | Reject |

Changing only the `broker_id` query parameter must never turn a foreign token
into an accepted token. Record only status/close code, safe request ID, verifier
name, broker claim/record category, and a short one-way token fingerprint.

Report the separate MyProp-to-GTA control finding with its shared-platform P0
ticket ID, but do not block the Achiever deployment on changing those brokers'
working implementations unless their owner explicitly adds that scope.

Probe `/ws/feed/status` separately with no credential, the fresh Achiever
credential, and a foreign credential. The first must return
`auth_evaluated=false`, `auth_accepted=null`,
`auth_reason="not_evaluated"`; the second must return
`auth_evaluated=true`, `auth_accepted=true`; and the third must return
`auth_evaluated=true`, `auth_accepted=false`. Provider health may remain true
in all three cases.

Never print the token-bearing URL.

## Physical Mobile Acceptance

Test the credential returned by the backend, not a manually configured fallback:
Run while the selected symbols are reported streaming/fresh by provider health,
and record the UTC test window. A closed market is a test-environment blocker,
not permission to accept static data as live.

1. Start from a full logout/fresh Achiever login on physical Android.
2. Confirm REST login/account requests succeed.
3. Confirm response `broker_id` and `feed_auth_context` are Achiever-scoped.
4. Confirm the returned `feed_token` is not a static environment/webterminal
   credential.
5. Confirm `/ws/feed` reaches `OPEN` and a sustained sequence for the requested
   symbols proves the subscription was accepted. If a scoped ACK is documented,
   validate it exactly. One ACK or one tick is not sufficient.
6. Confirm Quotes shows `Status: LIVE`, non-zero TPS, and repeatedly moving
   bid/ask values for `EURUSD`, `XAUUSD`, and `BTCUSD`.
7. Confirm repeated REST snapshot calls through the production load balancer
   continue returning broker-scoped HTTP `200`, do not regress to the
   previously observed undocumented `409`, and do not falsely mark the live
   feed authenticated. Prove individual-replica consistency in the deployed
   cross-replica test suite, not from the phone alone.
8. Record the latest M1 candle at T0, T+20 seconds, and T+60 seconds:
   `time`, `open`, `high`, `low`, `close`, source, and update timestamp. In the
   default quote-driven mobile mode, valid `/ws/feed` ticks must advance the
   active candle. A static REST series or one recent forming bar is not a pass.
9. If server-candle mode is intentionally enabled in the tested release,
   separately prove its `/ws/v2` configuration and frames. `/ws/v2` success
   alone must not satisfy the `/ws/feed` or Quotes acceptance test.
10. Confirm Trade/account/history REST data still works and that REST-only P/L,
    snapshots, or candle history are never labeled as a live quote feed.
11. Background/resume and verify reconnect.
12. Force refresh, prove the feed-token fingerprint changed, and verify
    reconnect with the refreshed token.
13. Switch brokers/accounts and prove the prior feed token is not reused.
14. Logout and prove the prior feed generation is revoked.
15. Confirm no repeated deterministic 401 reconnect loop.
16. Confirm all logs remain redacted.

## Required Deliverables

Return:

1. Root cause.
2. Backend files/services/configuration changed.
3. Redacted before/after login and refresh response shapes.
4. Redacted missing-issuance/serialization path versus corrected issued-token
   header/claim or opaque-record metadata. Include rejected foreign-credential
   metadata only where such a credential actually existed; do not invent a
   "faulty Achiever token" for the current no-token handoff.
5. Token issuer/verifier selected for canonical Achiever.
6. Automated test names and results.
7. Redacted deployed single-process login/refresh/WebSocket harness results.
8. Deployment environment, version/commit, and deployment time.
9. Physical mobile evidence using the backend-issued credential.
10. Redacted status and REST quote-snapshot results.
11. Cross-replica and concurrent-refresh test evidence.
12. Redacted candle-history result with final-bar semantics and physical
    T0/T+20/T+60 active-candle evidence.
13. The explicit `/ws/v2` public-or-authenticated policy and deployed probe
    result.
14. The Achiever-scoped credential isolation matrix, proof that changing only
    `broker_id` cannot authorize a foreign token, and the separate
    shared-platform P0 ticket ID for the MyProp-to-GTA control finding.
15. Any required mobile contract change, stated explicitly. If none is
    required, say `No mobile contract change required`.

## Definition of Done

Complete only when the `feed_token` returned by a fresh deployed Achiever login,
and then by refresh, opens the deployed Achiever `/ws/feed`, receives subscribed
live ticks on the physical mobile flow, and cannot be reused across another
broker/account/session. The refreshed feed-token fingerprint must differ from
the immediately previous valid session generation, `/ws/feed/status` must
report real credential-evaluation semantics from the shared verifier, and the
authenticated REST quote snapshot path must continue returning usable broker-scoped snapshots
without regressing to the previously observed undocumented `409` or being
mistaken for a live authenticated WebSocket feed.

The physical app must show sustained non-zero Quotes TPS and repeatedly changing
WebSocket bid/ask values. In the default quote-driven candle mode, the active
candle must advance from those ticks. A visible chart, REST candle history,
snapshot values, account P/L, tokenless status HTTP `200`, `/ws/v2` ACK/ticks,
or a `/ws/feed` subscription ACK without subsequent ticks is not completion.

The Achiever verifier must also reject foreign-token/query-broker confusion:
MyProp and GTA credentials cannot open Achiever, and an Achiever credential
cannot open those hosts. The Achiever credential's broker/account/session
binding must be verified independently of the requested query parameter and
routed host. The separate observed MyProp-to-GTA control issue must be filed as
a shared-platform P0, but fixing those two brokers is not a blocker for this
Achiever-scoped definition of done.
