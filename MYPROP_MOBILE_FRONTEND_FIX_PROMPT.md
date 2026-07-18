# MyProp Mobile Frontend Fix Prompt

Implemented on the RTX5 React Native client. Canonical source of the contract
request; see git history for the full original prompt body.

## Frontend status (this repo)

| Requirement | Status |
|---|---|
| `auth_accepted` tri-state (omit/null/tokenless-false ≠ auth_failed) | **Done** (`feedHealthProbe.ts`) |
| Status probe attaches feed token when session has one | **Done** |
| Env feed-token fallback when login omits handoff | **Done** (legacy MyProp path) |
| Candle history env path `candles` + `timeframeLimit` | **Done** (`.env`) |
| Login still prefers backend `feed_token` + `feed_auth_context` when present | **Done** |

## Verify after reload

1. Restart Metro / rebuild (env + health changes).
2. Logout → login MyProp.
3. Quotes: tps > 0, no permanent “connection interrupted” from tokenless status.
4. Chart: history loads (candle contract configured).
