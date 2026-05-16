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
- [x] Unit: quote tick timestamp normalization converts backend seconds, milliseconds, and ISO timestamps into UI freshness milliseconds, while quote UI freshness can use the separate socket receive timestamp.
- [x] Unit: quote price formatting preserves broker digits so live FX/JPY/metal ticks are visible instead of rounded to two decimals.
- [x] Unit: quote price-change detection ignores duplicate bid/ask snapshots for direction/previous-price state, while the Quotes speed indicator reports received feed ticks.
- [x] Unit: quote subscription state normalizes broker suffixes before counting and sending live feed subscriptions.
- [x] Unit: quote live snapshots refresh receive-time state on duplicate backend feed payloads while preserving previous bid/ask only for real price movement.
- [x] Unit: quote default watchlist fallback starts the public feed when the instrument catalog is temporarily unavailable and no device-local watchlist exists.
- [x] Unit: quote symbol action sheets use prebuilt instant configs, open from touch-down through the immediate action guard, and avoid leaving the tapped row in a held/pressed visual state.
- [ ] Integration: search + filter + mode switching.
- [ ] E2E: swipe action and context menu flow.

## Exit Criteria
- Quotes module reaches parity checklist with no P1 defects.

## Progress Notes
- 2026-05-16: Made Quotes symbol menus faster without sacrificing scroll safety. Tap and long-press ActionSheet configs are prebuilt per watchlist symbol, quote cards suppress held/pressed feedback when opening sheets, the tap path now opens from touch-down through the immediate action guard, and instant ActionSheets paint on the first modal frame instead of waiting for an Android layout opacity pass.
- 2026-04-08: Quotes tab dark theme refreshed with a desk-style shell, stronger quote card hierarchy, and retained live/search/edit flows for `IMG_3044.PNG` scope.
- 2026-04-08: Restored the previous quote symbol card treatment while keeping the refreshed quotes screen shell/background in place.
- 2026-04-08: Removed the large market-desk hero panel from the quotes screen while preserving the updated dark background treatment.
- 2026-04-08: Retuned the quotes search bar color in dark mode to a clearer blue-slate field for better contrast against the background.
- 2026-04-08: Removed the floating orb shapes from the quotes screen background while keeping the full-screen theme wash intact.
- 2026-04-22: Symbol details `Market Sentiment` no longer uses a UI-local clamped placeholder path. The buyers/sellers split now comes from one typed domain calculator shared with the day-range logic, using the current quote plus the latest `D1` candle range when available and falling back to the quote snapshot only when daily history is unavailable.
- 2026-04-22: Removed the decorative dot separator that was rendered immediately before `Spread` on the main Quotes card stats row, so the spread label now displays directly without the extra ornament.
- 2026-04-22: Added a fixed inline gap between the `Vol` and `Spread` stats on the main Quotes card row after removing the decorative separator, so the two values remain visually separated without reintroducing the dot.
- 2026-04-25: Routed Quotes runtime labels through i18n: quote freshness/status (`Updated`, `Speed`, `Status`, `LIVE`), symbol card microcopy, add-asset modal, search/empty states, and context actions now follow the active language while live symbol/price data remains API-owned.
- 2026-05-01: Quotes now store backend feed time separately from frontend receive time. Quote rows and the header render incoming bid/ask data when the socket is actively receiving messages, while the stale backend feed timestamp remains available for diagnostics and candle/trade safety checks.
- 2026-05-01: Quote bid/ask displays now use each instrument's broker `digits` instead of forcing two decimals. EURUSD/GBPUSD now render pip-level changes such as `1.17121`, USDJPY uses three decimals, and two-decimal instruments remain unchanged.
- 2026-05-01: The Quotes header speed now counts received WebSocket quote ticks instead of only bid/ask price changes. A direct 20-second feed sample showed the backend repeating unchanged bid/ask and feed timestamps for the default symbols, so row prices only move when the backend sends new values, while the header still proves the feed is arriving.
- 2026-05-01: Quote WebSocket subscriptions and row lookups now canonicalize broker-suffixed symbols such as `GBPUSD.c` and `XAUUSDm` before matching live store entries. This keeps watchlist personalization unchanged while allowing live bid/ask payloads that arrive under the bare backend symbol to render immediately.
- 2026-05-01: Replaced the Quotes tab's old row-level live quote hook with a fresh `useSyncExternalStore` watchlist feed. The watchlist hook now owns the `/ws/feed` subscription, rows consume per-symbol snapshots directly, duplicate backend snapshots refresh `lastReceivedAt` without faking price movement, and verified feed fields such as `daily_open`, `previous_close`, and session high/low are normalized into the row snapshot.
- 2026-05-01: Removed nested focus gating from the Quotes watchlist websocket subscription and header feed-status listener. The route wrapper already controls mount/unmount, so the visible Quotes list now stays subscribed and reports incoming ticks even if `useIsFocused()` briefly reports false during tab transitions or pushed quote sub-screens.
- 2026-05-01: Removed the root auth-state disconnect for the public quotes websocket. `RootLayout` no longer clears active quote subscriptions when `isLoggedIn` is false; market-data demand is now owned by the visible quote/chart/trade consumers. Also moved the curated startup symbols into typed quote config so a fresh device can subscribe to the public feed even if `/instruments` is temporarily unavailable.
