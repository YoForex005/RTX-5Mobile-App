# Phase 06 - Settings, Accounts, Mailbox, News, Brokers

## Objective
Implement settings and account ecosystem screens required for full screenshot parity.

## In Scope
- Settings main screen sections.
- Accounts details screen.
- Brokers list/search.
- Mailbox list.
- News list and category view.
- Interface and journal placeholders.

## Out of Scope
- Deep third-party social/chat integrations.

## Exact Implementation Tasks
1. Implement Settings hub with grouped list sections.
2. Implement Accounts detail layout and action rows.
3. Implement Brokers search/list with broker info entry points.
4. Implement Mailbox list with unread indicators.
5. Implement News list with categories and timestamps.
6. Add reusable list row components for all settings surfaces.

## API Dependencies
- Account profile endpoints.
- Broker directory endpoint.
- `GET /api/v1/public/demo-status` for demo-account creation availability.
- `GET /api/v1/public/demo-groups` for selectable Orrnn demo group metadata.
- `POST /api/v1/public/demo-account` for unauthenticated Orrnn demo account creation.
- Mailbox endpoint.
- News endpoint.

## Acceptance Checklist
- [ ] Settings hub and sub-screens match parity mapping.
- [ ] News and mailbox lists support loading/error/empty states.
- [ ] Account and broker screens display required fields.

## Test Checklist
- [ ] Unit: list item formatting helpers.
- [x] Unit: active-language dictionary coverage includes reported Settings account-card status and finance labels.
- [x] Unit: active-language dictionary coverage includes broker login, contest login, demo registration, and broker directory labels.
- [x] Unit: account API numeric normalization and live metric readiness guard.
- [ ] Integration: navigation from settings to all sub-screens.
- [ ] E2E: open broker list, open account details, read mailbox list.

## Progress Notes
- Settings hub layout was redesigned with a responsive premium card structure, a live market preview section tied to the active chart/watchlist context, and direct navigation affordances for accounts, mailbox, news, brokers, and chart settings on mobile widths.
- The settings hub live chart card now renders through the shared chart preview component so chart palette changes from chart properties appear in the settings preview with the same persisted colors and display options as the main chart screen.
- Accounts now classify `contest` as its own backend account type while presenting it as `Real` in the account ribbon, keep `Demo` only for demo groups, and expose a dedicated contest account login route alongside broker login and demo registration entry points.
- Account identity display now rehydrates from the actual account record after login, so account headers do not stay stuck on a stale profile/login name while switching between demo and real accounts.
- 2026-04-25: Hardened Interface language selection by sanitizing persisted language codes, making stack titles react to language changes, and extending translations across the Settings hub, Trade empty/actions, History summary, and History Filter surfaces instead of leaving those labels hardcoded in English.
- 2026-04-25: Renamed the Settings language entry to `Language Preference`, removed the visible `Interface` title from the picker screen, and added Bengali (`bn`) to the persisted language list and translation dictionaries.
- 2026-04-25: Removed the Settings hub `Charts` row and search entry; chart schema/color controls remain available under Chart Preferences > Chart Configuration as `Chart Schema & Colors`.
- 2026-04-25: Routed built-in account-card names and finance labels through the language dictionaries on Settings, Accounts, History Net P/L, Chart Calculator, and Order Ticket market-data surfaces while preserving real account, server, symbol, and currency values as backend/user data.
- 2026-04-25: Extended active-language coverage across the remaining device-review surfaces: account-card status badges, quote freshness/status labels, shared action-sheet chrome, and chart toolbar/trade labels now resolve through i18n while personal/account values remain unchanged.
- 2026-04-25: Routed broker login, contest login, demo account registration, and broker directory UI copy through persisted-language i18n. Broker/company/server names, account IDs, credentials, deposits, and API error payloads remain runtime data.
- 2026-04-27: Integrated the Orrnn public demo-status preflight. The demo registration screen now checks `GET /api/v1/public/demo-status` before showing the creation form, blocks submission while unhealthy, and exposes a retry state for 503/network failures.
- 2026-04-27: Integrated `POST /api/v1/public/demo-account` for public Orrnn demo creation. The registration screen now posts user-entered identity/password data with the demo group from `GET /api/v1/public/demo-groups`, stores the returned login plus `api_key` when present, falls back to V2 login when live deployments omit `api_key`, and treats documented 201 ExceptionResult payloads as creation errors.
- 2026-04-27: Expanded the public demo registration form with visible fields for group, email, master/investor passwords, first/last name, phone, country, currency, leverage, initial balance, and origin broker. The optional backend `comment` field is intentionally not shown in the UI.
- 2026-04-27: Added chart runtime language coverage for the live price label, chart loading/error states, and expiration picker options so changing the persisted language updates ChartScreen text immediately without restarting.
- 2026-05-12: Fixed the Settings and Accounts balance display path so backend numeric strings are normalized before formatting, login-only live account hydration no longer overrides the REST account balance with the zero default, and the active account detail fetch uses the contracted singular `/api/v2/account/{login}` route instead of the plural list route.

## Exit Criteria
- All settings/news/account parity rows are marked complete.

