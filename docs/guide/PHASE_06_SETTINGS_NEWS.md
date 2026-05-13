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
- [x] Unit: list item formatting helpers.
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
- 2026-05-13: Refined the News list/category screen with a professional market-desk header, category chips, featured headline, impact labels, symbol chips, and a true empty category state. The headline metadata mapping now lives in a pure `newsViewModel` helper with focused unit coverage.
- 2026-05-13: Refined the Mailbox list with a secure account-message header, unread/action metrics, filter chips, priority lead message, professional message rows, unread/read indicators, and an empty filtered state. Mailbox message metadata now lives in `mailboxViewModel` with deterministic unit coverage.
- 2026-05-13: Replaced the generic MQL5 Algo Trading placeholder with a dedicated frontend-only automation desk screen. The settings row now routes to a professional module/guardrail view with filter chips, status metrics, and focused view-model tests while preserving the no-backend-automation constraint.
- 2026-05-13: Replaced the generic Traders Community placeholder with a dedicated community desk screen. The settings row now routes to a professional stream with metrics, filter chips, market idea cards, status/sentiment metadata, and privacy/education guardrails backed by focused view-model tests.
- 2026-05-13: Replaced the remaining generic User Guide and About placeholders with dedicated professional screens. User Guide now presents workflow filters, step cards, and pre-trade safety checks; About now presents app version/release metadata, platform capabilities, and release guardrails. The Settings Help row now routes to User Guide, and both surfaces have focused view-model tests.
- 2026-05-13: Fixed the News, User Guide, and MQL5 Algo Trading hero headers so their header cards stay anchored above the scrollable body while filters, cards, and list content scroll underneath.
- 2026-05-13: Reworked Traders Community, MQL5 Algo Trading, User Guide, and About into enterprise settings detail consoles with fixed command headers, search, telemetry summaries, operational filters, lead briefs, dense registers, shared professional styling, and expanded view-model tests for summaries/search/filter behavior.
- 2026-05-13: Reworked the News screen into a denser enterprise newsroom with a fixed command header, search, source/status telemetry, impact filtering, desk summary metrics, a lead brief, and severity-coded feed rows. The news view model now includes desk summaries and filter/search helpers with focused tests.
- 2026-05-13: Rebuilt Market News into a premium dark market-intelligence screen with dynamic API-ready sections for breaking news, category tabs, impact filters, AI market brief, economic calendar preview, latest news, watchlist news, loading/empty/error/offline states, and a bottom News navigation state. Preview values are isolated as placeholder data and remain replaceable by provider/API/state payloads.
- 2026-05-13: Rebuilt Trader Community as a dedicated premium fintech community screen with market sentiment, category tabs, verified trader cards, live trading rooms, professional idea posts, a market poll, bottom community navigation, and education-only compliance copy.
- 2026-05-13: Consolidated News, Mailbox, Traders Community, MQL5 Algo Trading, User Guide, and About onto shared enterprise settings primitives. All six now use centered screen headings, consistent search/filter/metric/guardrail styling, cleaner neutral color treatment, and copy that avoids implying live, encrypted, or connected runtime behavior when the screen is showing reference/static app content.
- 2026-05-13: Tightened the Mailbox screen after visual review: added the missing centered top navigation heading, made the command panel less bulky, switched mailbox chrome back to the neutral app accent, condensed metrics into a single enterprise row, and reduced the featured message card typography for a cleaner inbox presentation.
- 2026-05-13: Reworked Mailbox again into a dedicated enterprise inbox surface instead of the generic detail-page hero. The screen now uses a compact command panel, focused unread/action summary, short search field, tighter filter rail, smaller action notice, dense message rows, and mailbox-specific styling for a cleaner operational message workflow.
- 2026-05-13: Matched the Mailbox top area to the provided dark-theme reference while keeping light-theme support: the header is now a flat inbox workspace with a large mailbox mark, right-side unread tile, full-width search input, and three icon-labeled metric cards for total messages, action items, and global account scope.
- 2026-05-13: Refined the Mailbox message history rows into cleaner enterprise inbox cards with grouped source/time metadata, status pills, restrained priority/review tags, and clearer unread/read indicators instead of the previous loose alert-row presentation.
- 2026-05-13: Added theme-aware enterprise gradients to the Mailbox total/action/scope metric cards and high-priority action notice, preserving contrast across light and dark themes with restrained borders and elevation.
- 2026-05-13: Rebuilt MQL5 Algo Trading as a premium dark algo command center with API-ready account, performance, category, strategy, active-bot, risk-control, and activity models. The screen now includes loading/empty/error/offline states, active Algo bottom navigation, and confirmation UX for stop/emergency actions while keeping preview values isolated in the view model.
- 2026-05-13: Rebuilt Mailbox as a premium dark trading communication hub with API-ready mailbox state, category, priority, announcement, message, attachment, support, and UI action models. The screen now includes summary cards, dynamic filters, important updates, compact secure message cards, a detail bottom sheet, destructive-action confirmation, support shortcut, active Mailbox navigation, and focused view-model tests.
- 2026-05-13: Added light-theme parity to MQL5 Algo Trading and Market News. Both screens now derive screen gradients, cards, nav surfaces, refresh chrome, icons, and status bars from the active persisted theme while preserving the premium dark presentation.
- 2026-05-13: Refined Mailbox into a secure fintech communication center with the requested header, unread/critical/support summary strip, professional search, category tabs, quick filters, priority-coded message cards, detail view, filter sheet, long-press action sheet, empty/loading/error states, and active Mailbox bottom navigation. The mailbox palette now supports both dark and light themes while keeping dark mode as the primary presentation.
- 2026-05-13: Removed the app bottom navigation from MQL5 Algo Trading so the automation screen opens as a focused settings detail surface, and simplified Mailbox visible metadata by removing repeated sender-type/status details, redundant header/action icons, support metrics, and low-value related-information rows while keeping the dynamic API-ready data model intact.
- 2026-05-13: Redesigned MQL5 Algo Trading into a cleaner enterprise algo control center for light and dark themes with the requested account card, performance snapshot, strategy filters, featured strategy cards, active bot controls, grouped risk controls, and recent activity timeline while preserving the frontend-only preview data model.
- 2026-05-13: Removed the app bottom navigation from Market News and cleaned the visible news surface by removing AI/watchlist extras, notification/profile chrome, save/share buttons, duplicated source/category metadata, and calendar forecast-value clutter. The screen now focuses on breaking news, category/impact filters, compact economic events, latest news, and the trading-risk disclaimer.
- 2026-05-13: Refined Mailbox visual density into a premium fintech communication center: compact header actions, smaller four-card summary metrics, tighter search and chip rails, a calmer important-update card, denser message rows with high-signal metadata only, compact support metrics, and safer bottom-nav spacing while retaining the API-ready mailbox model.
- 2026-05-13: Removed the app bottom navigation from Mailbox so the message center opens as a focused communication detail surface with reclaimed bottom spacing.
- 2026-05-13: Tightened the Trading Journal Analytics and Review gutters so the tab rail, metric cards, equity/review cards, and reflection surfaces use the shared compact page margin without the previous double left/right spacing.
- 2026-05-13: Refined the Trading Journal Analytics tab with denser Performance Desk metric cards, a more compact Equity Curve panel, tighter Strategy Edge and Session Quality cards, and softer enterprise-radius surfaces.
- 2026-05-13: Updated the Market News breaking-news card to match the supplied compact reference: dark red/blue hero surface, breaking badge, bookmark control, source/time metadata, red market-pulse visual, affected-symbol chips, and blue read-more action.
- 2026-05-13: Upgraded the Market News card system across breaking news, AI market brief, economic events, latest news, and watchlist matches. Cards now use consistent top meta rows, compact headlines/summaries, capped symbol chips with +N overflow, smaller badges, structured action rows, and denser fintech-style spacing without adding backend behavior.
- 2026-05-13: Strengthened the Market News breaking-card visual layer with a warmer red-to-blue gradient overlay, larger right-side dotted globe/world treatment, and sharper red market-signal line while preserving API-driven headline/source/symbol content.
- 2026-05-13: Cleaned the Market News lower card stack by removing visible previous/forecast/actual clutter from upcoming economic rows, tightening latest-news action rows, and upgrading watchlist news into compact personalized intelligence cards with symbol, impact, timestamp, and open action.
- 2026-05-13: Reworked the Market News breaking-card layout to match the supplied hero reference more closely: oversized breaking badge, large bookmark control, separate freshness row, larger headline/summary, source/time metadata, divider, affected-symbol rail, and larger read-more CTA over the globe/signal background.
- 2026-05-13: Extracted Market News breaking news into a standalone `BreakingNewsCard` component with its own API-ready data shape, loading/error/empty support, dynamic saved/read URL handling, mobile-safe symbol overflow, no impact badge, and a fixed premium hero layout instead of the previous overlapping inline implementation.
- 2026-05-13: Refined the standalone `BreakingNewsCard` world visual with left-shifted dotted continent clusters, calmer globe grid lines, and a repositioned red market pulse so the map reads as a global finance graphic on mobile instead of a generic dot circle.
- 2026-05-13: Updated the Market News breaking-news preview copy to the supplied reference text and reduced the standalone card scale with fixed mobile height, smaller badge/save controls, tighter headline/summary/meta spacing, compact chips, and a smaller read-more CTA while preserving API-driven fields.
- 2026-05-13: Expanded the `BreakingNewsCard` map treatment from a small right-side globe icon into a left-shifted dotted world-map background with continent-style dot clusters, subtle global grid lines, and the red market signal layered over the larger map.
- 2026-05-13: Tightened the `BreakingNewsCard` footer so the Affected Symbols label and chips stack cleanly on the left while a smaller read-more CTA stays pinned to the bottom-right.
- 2026-05-13: Updated `BreakingNewsCard` affected-symbol chips to stay on one line with responsive `+N` overflow when the current mobile width cannot fit every symbol.
- 2026-05-13: Aligned the `BreakingNewsCard` read-more CTA on the same footer row as the one-line affected-symbol chips, with symbol overflow calculated after reserving CTA space.
- 2026-05-13: Matched the mobile Breaking News reference closer by removing the lightning mark from the badge, tightening the top-right bookmark control, and shifting the dotted world-map globe into the right-side headline background position.
- 2026-05-13: Upgraded the AI Market Brief card into a compact market-intelligence panel with a stronger meta header, accent summary treatment, dedicated affected-market chips, sentiment/confidence chips, and more professional preview copy.
- 2026-05-13: Upgraded Watchlist News into compact personalized intelligence cards with a symbol-first identity row, match context label, restrained impact placement, tighter headline hierarchy, and a cleaner bottom time/open action row.
- 2026-05-13: Fixed Watchlist News text visibility by moving the cards to theme-aware gradients and dedicated light/dark contrast styles for the title, match label, timestamp, and open action.
- 2026-05-13: Upgraded Latest Market News cards into professional trading-intelligence cards with source/category/time hierarchy, market-exposure grouping, affected symbols, impact/risk labels, compact save/read/share actions, and more realistic preview news copy.
- 2026-05-13: Simplified Market News card density by removing nested exposure panels, duplicate freshness rows, extra risk chips, decorative source icons, and watchlist match filler so cards keep only high-signal trading context.

## Exit Criteria
- All settings/news/account parity rows are marked complete.

