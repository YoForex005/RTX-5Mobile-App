# RTX5 Code Security Audit Report

Generated: 2026-06-13

Scope: Static read-only review of the RTX5 repository, focused on `rtx5-app` application code, security guide requirements, storage, auth/session handling, WebSocket transport, logging, WebView exposure, environment files, and npm dependency advisories.

No source code was changed during this audit.

## Verdict

Security issues are present. The app should remain blocked for public or beta release until the mandatory controls in `docs/guide/SECURITY.md` are green.

The biggest release blockers are:

- Token storage in AsyncStorage.
- Missing mandatory controls: certificate pinning, biometric/PIN app lock, device integrity checks, and full logging redaction.
- JWTs sent in WebSocket query strings.
- Production Android cleartext allowance for a raw IP.
- Active npm audit vulnerabilities, including one critical advisory.

## Critical / High Findings

### 1. Access and refresh tokens are persisted in AsyncStorage

The security guide says tokens must not be stored in AsyncStorage, but `userPreferences` persists `accountDetails.credentials` through AsyncStorage and rehydrates it on startup.

Evidence:

- `rtx5-app/src/state/userPreferences/store.ts:152`
- `rtx5-app/src/state/userPreferences/store.ts:312`
- `rtx5-app/src/state/userPreferences/store.ts:335`
- `rtx5-app/src/state/userPreferences/store.ts:367`
- `rtx5-app/src/state/userPreferences/store.ts:415`
- `rtx5-app/src/state/userPreferences/store.ts:445`
- `rtx5-app/src/api/brokerApi.ts:353`

Impact:

An attacker with device filesystem access, a compromised backup, debugging access, or malware access to app storage may recover live access and refresh tokens.

### 2. Hardcoded demo login credentials exist in source

The app includes hardcoded fallback demo credentials and auto-prefills them in dev mode unless explicitly disabled.

Evidence:

- `rtx5-app/app/login.tsx:49`
- `rtx5-app/app/login.tsx:53`
- `rtx5-app/app/login.tsx:57`
- `rtx5-app/app/login.tsx:58`
- `rtx5-app/app/login.tsx:429`

Observed values:

- Username: `900001`
- Password: `TestPass1234`

Impact:

Even if guarded by `__DEV__`, this leaks a real-looking credential pair into source history and local clones.

### 3. JWTs are sent in WebSocket query strings

Account, broker, and candle WebSockets append the JWT as `?token=...`.

Evidence:

- `rtx5-app/src/api/brokerApi.ts:236`
- `rtx5-app/src/api/brokerApi.ts:242`
- `rtx5-app/src/api/ws/accountSocket.ts:269`
- `rtx5-app/src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts:111`
- `rtx5-app/src/domain/candles/ws/candlesSocketProtocol.ts:41`

Impact:

Query-string tokens are more likely to leak through logs, proxies, crash reports, diagnostics, URL captures, and debugging tools than header/subprotocol-based auth.

### 4. Certificate pinning is missing, and production Android allows cleartext to one raw IP

The security guide requires certificate pinning and says mandatory controls are still not green. Android production network config allows cleartext traffic for `69.197.178.27`.

Evidence:

- `docs/guide/SECURITY.md:25`
- `docs/guide/SECURITY.md:61`
- `docs/guide/SECURITY.md:67`
- `rtx5-app/withNetworkSecurityConfig.js:34`
- `rtx5-app/withNetworkSecurityConfig.js:40`
- `rtx5-app/withNetworkSecurityConfig.js:41`
- `rtx5-app/withNetworkSecurityConfig.js:42`

Impact:

Without pinning, critical API traffic depends only on platform CA trust. With the cleartext exception, any app code or dependency path that hits that raw IP can use HTTP in production Android builds.

### 5. Biometric/PIN app lock and device integrity checks are missing

The security guide requires biometric/PIN app lock and root/jailbreak/emulator risk checks. The code has foreground session refresh logic, but no app-lock gate or integrity policy implementation was found.

Evidence:

- `docs/guide/SECURITY.md:18`
- `docs/guide/SECURITY.md:32`
- `docs/guide/SECURITY.md:61`
- `docs/guide/SECURITY.md:67`
- `rtx5-app/app/_layout.tsx:372`

Impact:

If a logged-in device is unlocked or compromised, the app currently lacks the required local re-authentication and device-risk controls before account/trading access.

### 6. Session lifecycle is not hardened enough

The auth file documents perpetual refresh-token cycling, while the guide requires forced logout and device ID in auth/session requests. Login and refresh payloads do not include a device ID.

Evidence:

- `docs/guide/SECURITY.md:40`
- `docs/guide/SECURITY.md:47`
- `rtx5-app/src/api/auth.ts:26`
- `rtx5-app/src/api/auth.ts:123`
- `rtx5-app/src/api/brokerApi.ts:280`

Impact:

Refresh-token theft has a larger blast radius because there is no visible max session lifetime/device binding in the frontend contract.

### 7. Sensitive backend responses can be logged

Login logs the full unexpected auth response, which may include tokens or account data. Closed-history logs response JSON unconditionally.

Evidence:

- `rtx5-app/app/login.tsx:568`
- `rtx5-app/app/login.tsx:572`
- `rtx5-app/src/api/positions/closedHistory.ts:100`
- `rtx5-app/src/api/positions/closedHistory.ts:107`

Impact:

Tokens, account identifiers, closed trade history, or other personal/trading data could appear in device logs or attached crash/diagnostic reports.

### 8. npm audit has active vulnerabilities

Root audit result:

- 27 total vulnerabilities.
- 1 critical.
- 7 high.
- 19 moderate.

`rtx5-app` audit result:

- 21 total vulnerabilities.
- 1 critical.
- 2 high.
- 18 moderate.

Notable vulnerable packages:

- Critical: `shell-quote`
- High: `@xmldom/xmldom`
- High: `fast-uri`
- High in root audit also includes `minimatch`, `node-forge`, `picomatch`, `tar`, and `undici`

Impact:

Some findings may be development/build-chain exposure rather than runtime mobile exposure, but they still need dependency review before release.

## Medium / Hardening Findings

### 9. Secure storage falls back to AsyncStorage on web

The secure-storage wrapper uses native SecureStore on mobile, but falls back to AsyncStorage on web.

Evidence:

- `rtx5-app/src/utils/secureStorage.ts:13`
- `rtx5-app/src/utils/secureStorage.ts:14`
- `rtx5-app/src/utils/secureStorage.ts:15`
- `rtx5-app/src/utils/secureStorage.ts:21`
- `rtx5-app/src/utils/secureStorage.ts:24`

Impact:

Passwords/tokens stored through this wrapper are not secure if the web target is used.

### 10. JWT is duplicated into `X-API-Key` for positions fetches

For non-API-key tokens, the code adds `Authorization: Bearer ...`, but also always sends the same token as `X-API-Key`.

Evidence:

- `rtx5-app/src/api/positions/payloadHelpers.ts:16`
- `rtx5-app/src/api/positions/payloadHelpers.ts:18`
- `rtx5-app/src/api/positions/payloadHelpers.ts:20`

Impact:

This increases token exposure across backend logs, WAF rules, API gateway telemetry, and header-specific monitoring.

### 11. Account and trading data is cached in AsyncStorage

Open positions, saved account metadata, and manual journal entries persist in AsyncStorage.

Evidence:

- `rtx5-app/src/state/positionsState.ts:117`
- `rtx5-app/src/state/positionsState.ts:123`
- `rtx5-app/src/state/positionsState.ts:142`
- `rtx5-app/src/state/savedAccounts.ts:173`
- `rtx5-app/src/state/savedAccounts.ts:186`
- `rtx5-app/src/state/journalState.ts:41`
- `rtx5-app/src/state/journalState.ts:54`

Impact:

This may be acceptable only if consciously classified as non-secret. For a trading app, account IDs, open positions, and journal/trading data should be treated as sensitive user data.

### 12. WebSocket environment overrides lack strict scheme/host allowlisting

Several `EXPO_PUBLIC_*_WS_URL` values are accepted directly or lightly normalized.

Evidence:

- `rtx5-app/src/api/ws/quotesSocket/QuotesWebSocketService.ts:136`
- `rtx5-app/src/api/ws/accountSocket.ts:26`
- `rtx5-app/src/api/ws/socket.ts:49`
- `rtx5-app/src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts:60`

Impact:

These values are baked into Expo bundles. A bad build env can route production clients to the wrong host, wrong scheme, or a non-pinned endpoint.

### 13. Chart WebView has broad origin whitelist with JavaScript enabled

The chart source is local bundled HTML/JS, which is good, but the WebView still allows all origins with JavaScript enabled.

Evidence:

- `rtx5-app/src/features/chart/rendering/ChartWebViewHtml.ts:6`
- `rtx5-app/src/features/chart/rendering/ChartWebViewHtml.ts:12`
- `rtx5-app/src/features/chart/ChartScreen.native.tsx:4290`
- `rtx5-app/src/features/chart/ChartScreen.native.tsx:4299`
- `rtx5-app/src/features/chart/ChartScreen.native.tsx:4300`

Impact:

This is not an immediate exploit by itself because the source is bundled, but it is a privileged bridge surface and should be locked down.

### 14. `.env` is tracked even though ignored

`rtx5-app/.env` is tracked by Git even though ignore files exclude it.

Evidence:

- `rtx5-app/.gitignore:40`
- `rtx5-app/.gitignore:41`
- `rtx5-app/.easignore:1`
- root `.easignore:35`

Observed contents were public Expo URL keys, not private secrets, but tracked env files are still risky repo hygiene.

### 15. Absolute API endpoints can bypass broker base routing if passed in

`buildApiUrl()` returns absolute `http(s)` endpoints unchanged.

Evidence:

- `rtx5-app/src/api/brokerRouting.ts:193`
- `rtx5-app/src/api/brokerRouting.ts:194`
- `rtx5-app/src/api/brokerRouting.ts:195`

Impact:

No user-controlled path to this was proven in the static review, so this is lower severity. Still, security-sensitive clients should usually reject or allowlist absolute endpoints.

## Positive Findings

### Broker routing has secure defaults in important paths

Broker routing generally normalizes `http`/`ws` inputs to HTTPS and rejects raw IP broker hosts.

Evidence:

- `rtx5-app/src/api/brokerRouting.ts:48`
- `rtx5-app/src/api/brokerRouting.ts:73`
- `rtx5-app/src/api/brokerRouting.ts:87`

### Native SecureStore is used for some session data and saved passwords

The app attempts native SecureStore persistence for auth tokens and saved account passwords.

Evidence:

- `rtx5-app/src/state/brokerSessionStorage.ts:39`
- `rtx5-app/src/state/brokerSessionStorage.ts:45`
- `rtx5-app/src/state/savedAccounts.ts:212`
- `rtx5-app/src/state/savedAccounts.ts:217`

### API latency logger has redaction support

The latency logger includes a sensitive query-key redaction list.

Evidence:

- `rtx5-app/src/utils/apiLatency.ts:53`
- `rtx5-app/src/utils/apiLatency.ts:54`
- `rtx5-app/src/utils/apiLatency.ts:60`
- `rtx5-app/src/utils/apiLatency.ts:61`

## Recommended Fix Order

1. Remove token persistence from AsyncStorage and migrate persisted state so old tokens are purged.
2. Remove hardcoded credentials from source and rotate the demo credential if it is real.
3. Move WebSocket auth away from query strings to headers, subprotocols, or a short-lived one-time socket ticket.
4. Remove production cleartext traffic and implement certificate pinning for release builds.
5. Implement biometric/PIN app lock and device integrity checks.
6. Add device ID/session binding and max session lifetime/forced logout behavior.
7. Centralize log redaction and remove sensitive response dumps.
8. Fix dependency audit findings with Expo-compatible upgrades.
9. Untrack `.env` and keep only templates or deployment-specific env files outside Git.
10. Classify local persisted account/trading data and move sensitive data to protected storage.

## Release Gate Status

Based on this review, the release gate should remain blocked because `docs/guide/SECURITY.md` says beta/public release is blocked if mandatory controls are not green, and the code still has non-green controls around secure storage, certificate pinning, integrity checks, app lock, and redaction.
