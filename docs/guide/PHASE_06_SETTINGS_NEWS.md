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

## Exit Criteria
- All settings/news/account parity rows are marked complete.

