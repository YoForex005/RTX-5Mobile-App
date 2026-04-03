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
- [ ] Integration: navigation from settings to all sub-screens.
- [ ] E2E: open broker list, open account details, read mailbox list.

## Progress Notes
- Settings hub layout was redesigned with a responsive premium card structure, a live market preview section tied to the active chart/watchlist context, and direct navigation affordances for accounts, mailbox, news, brokers, and chart settings on mobile widths.
- The settings hub live chart card now renders through the shared chart preview component so chart palette changes from chart properties appear in the settings preview with the same persisted colors and display options as the main chart screen.

## Exit Criteria
- All settings/news/account parity rows are marked complete.

