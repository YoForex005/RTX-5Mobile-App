# Phase 02 - Quotes Module

## Objective
Deliver full Quotes parity: search, list/table modes, edit/reorder, swipe actions, context actions, and symbol details.

## In Scope
- Quotes list mode.
- Quotes table mode.
- Search field and filtering.
- Edit mode with reorder affordances.
- Swipe actions and long-press action menu.
- Symbol details screen.

## Out of Scope
- Chart rendering.
- Trade execution.

## Exact Implementation Tasks
1. Build quotes query hooks using typed contracts.
2. Implement list and table renderers with virtualization.
3. Implement search indexing and debounce behavior.
4. Add edit mode with reorder UI and persistence hooks.
5. Add swipe actions (delete/statistics) with confirm flows.
6. Add symbol context menu: Chart, Details, Statistics, Delete.
7. Build symbol details screen with session/symbol metadata.

## API Dependencies
- `GET /v1/quotes`
- Symbol metadata endpoint used by details view.
- WebSocket `quote.tick` event.

## Acceptance Checklist
- [ ] All quote screens/actions from parity map work.
- [ ] Price updates stream without visible stutter.
- [ ] Search and edit states are retained when switching tabs.

## Test Checklist
- [ ] Unit: quote mappers and formatters.
- [x] Unit: active-language dictionary coverage includes Quotes freshness/status labels, symbol card microcopy, add-asset modal, and context actions.
- [ ] Integration: search + filter + mode switching.
- [ ] E2E: swipe action and context menu flow.

## Exit Criteria
- Quotes module reaches parity checklist with no P1 defects.

## Progress Notes
- 2026-04-08: Quotes tab dark theme refreshed with a desk-style shell, stronger quote card hierarchy, and retained live/search/edit flows for `IMG_3044.PNG` scope.
- 2026-04-08: Restored the previous quote symbol card treatment while keeping the refreshed quotes screen shell/background in place.
- 2026-04-08: Removed the large market-desk hero panel from the quotes screen while preserving the updated dark background treatment.
- 2026-04-08: Retuned the quotes search bar color in dark mode to a clearer blue-slate field for better contrast against the background.
- 2026-04-08: Removed the floating orb shapes from the quotes screen background while keeping the full-screen theme wash intact.
- 2026-04-22: Symbol details `Market Sentiment` no longer uses a UI-local clamped placeholder path. The buyers/sellers split now comes from one typed domain calculator shared with the day-range logic, using the current quote plus the latest `D1` candle range when available and falling back to the quote snapshot only when daily history is unavailable.
- 2026-04-22: Removed the decorative dot separator that was rendered immediately before `Spread` on the main Quotes card stats row, so the spread label now displays directly without the extra ornament.
- 2026-04-22: Added a fixed inline gap between the `Vol` and `Spread` stats on the main Quotes card row after removing the decorative separator, so the two values remain visually separated without reintroducing the dot.
- 2026-04-25: Routed Quotes runtime labels through i18n: quote freshness/status (`Updated`, `Speed`, `Status`, `LIVE`), symbol card microcopy, add-asset modal, search/empty states, and context actions now follow the active language while live symbol/price data remains API-owned.

