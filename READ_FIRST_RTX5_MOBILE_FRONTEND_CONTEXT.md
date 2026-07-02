# READ THIS FILE WHEN FRONTEND HAS ANY ISSUE, A FRONTEND PROMPT ASKS BACKEND TO FIX ANYTHING, OR BACKEND SAYS FRONTEND MUST FIX IT

```text
READ THIS FILE WHEN FRONTEND HAS ANY ISSUE
OR WHEN A FRONTEND PROMPT ASKS BACKEND TO FIX ANYTHING
OR WHEN BACKEND SAYS THE BACKEND CONTRACT IS IMPLEMENTED AND FRONTEND MUST FIX IT
================================================================================
```

# RTX5 Mobile Frontend Context Tree For Backend Agents

Generated: 2026-07-02

This file is a backend-read-first prompt for any Codex/backend agent working on RTX5 backend fixes that affect the mobile app. When a problem, bug report, or fix request comes from the frontend/mobile app side, read this file before changing backend code. The goal is to understand what the current Expo/React Native frontend already does, which backend contracts it expects, which screens consume those contracts, and how to decide whether a bug belongs in the backend or frontend.

Do not treat this file as a replacement for the source. Treat it as the map, then verify the exact current code when making a fix.

This prompt is intentionally broader than a backend endpoint contract. It is also the whole-app screen and feature map. Some screens are backend-connected today, some are hybrid, some are local-only, and some are static preview surfaces waiting for future backend contracts. A backend agent must understand that difference before deciding where a fix belongs.

## Backend Agent Operating Rules

1. Start from the symptom and locate the mobile screen in the screen tree below.
2. Follow that screen to its query, REST endpoint, websocket channel, state store, and renderer.
3. Test the backend contract at the broker service domain used by the app, not only the shared backend.
4. If the backend contract is wrong, fix backend and return evidence: endpoint, payload, expected shape, actual shape, and patched files.
5. If the backend contract is correct, say clearly that backend is OK and identify the frontend file/function that should be patched.
6. Never return real tokens, passwords, refresh tokens, feed tokens, or full `.env` values in logs or prompts. Use redacted samples.
7. For broker/login/feed/chart issues, always preserve broker-domain routing. The app expects logged-in broker sessions to use the selected broker services domain.
8. For candle/chart issues, separate four layers before fixing anything: broker routing, REST history shape, quote tick feed shape, and chart renderer behavior.
9. For trade sync issues, separate order placement from realtime propagation. A successful `POST /orders` does not prove account/positions/order lifecycle fan-out is working.
10. Keep backend responses backward-compatible where possible. This frontend accepts many aliases, but exact fields listed below are the safest contract.
11. If the screen is local-only or static-preview today, say that clearly. Do not pretend there is an existing backend contract.
12. If the user wants a currently static/local UI connected to backend, design the backend contract from the frontend TypeScript model named in this file.

## Repository Tree

```text
C:\Users\ADMIN\RTX-5Mobile-App
|-- BACKEND_CANDLE_HISTORY_FRONTEND_CONTRACT_PROMPT.md
|-- BACKEND_LIVE_CANDLE_SPEED_FRONTEND_CONTRACT_PROMPT.md
|-- READ_FIRST_RTX5_MOBILE_FRONTEND_CONTEXT.md            <-- this file
|-- rtx5-app/
|   |-- app/                         Expo Router route tree
|   |-- src/
|   |   |-- api/                     REST clients, websocket services, routing helpers
|   |   |-- query/                   TanStack Query hooks over api/
|   |   |-- state/                   Zustand stores, SecureStore session persistence
|   |   |-- domain/                  trading/candles/account domain logic
|   |   |-- features/                screen implementations
|   |   |-- services/                startup/bootstrap/Sentry
|   |   |-- ui/                      shared components/theme
|   |   |-- utils/                   formatting, latency, navigation, OTA
|   |-- tests/                       candle/chart stability tests
|   |-- package.json                 scripts and dependencies
|   |-- app.config.js                Expo config, public Sentry DSN config, OTA flags
|   |-- eas.json                     EAS profiles and public environment flags
```

## This File Equals The App

Use this section as the full mobile-app atlas. The older sections below are still important, but they are mostly backend contracts. This section explains every major screen family, whether it is already connected to backend, whether it is local-only today, and what a future backend would need to provide if the UI becomes live.

Status labels used below:

```text
live-backend:
|-- screen already calls a real REST endpoint, websocket, or broker-domain service

hybrid:
|-- screen combines backend data with local persisted preferences, local fallbacks, or computed UI state

local-state:
|-- screen is functional, but its data/actions are stored only on device state, SecureStore, AsyncStorage, or route params

static-preview:
|-- screen exists and displays typed preview/static/mock data from frontend files; no live backend is currently wired

static-config:
|-- screen displays app configuration, local copy, legal/support config, or app metadata

navigation-only:
|-- route only redirects or wraps another screen
```

Backend agents must not assume every visible UI already has a backend endpoint. If a feature is marked `static-preview`, `static-config`, or `local-state`, the correct backend response is usually: "frontend currently has this UI, but no live backend contract is wired yet; here is the endpoint contract that would be needed." Do not invent a backend bug for a frontend-only screen.

## Complete Expo Route Tree

```text
rtx5-app/app/
|-- _layout.tsx
|   |-- status: hybrid
|   |-- role: app root, providers, Sentry, splash coordination, preference hydration, broker realtime bootstrap
|   |-- backend touchpoints: brokerRealtimeService, bootstrapApp, token refresh, broker/account state refresh after login
|   |-- local state: persisted user preferences, secure broker session, candle cache hydration
|
|-- index.tsx
|   |-- status: navigation-only
|   |-- role: redirects the app to /quotes
|
|-- contest-login.tsx
|   |-- status: navigation-only
|   |-- role: redirects legacy contest login entry to /login
|
|-- login.tsx
|   |-- status: live-backend
|   |-- screen role: broker/account login
|   |-- backend: broker directory/config, auth proxy or selected broker service, token persistence, optional feed auth bootstrap
|   |-- local state: selected broker, server URL, account details, secure token/session storage
|   |-- backend must preserve: selected broker service-domain routing, redacted login diagnostics, concrete auth error messages
|
|-- register.tsx
|   |-- status: live-backend plus static-config
|   |-- screen role: demo account registration/new account flow
|   |-- backend: public demo account create flow and selected broker origin fields
|   |-- static config: terms/privacy/support links from app config
|   |-- local state: terms/privacy acceptance, form fields, broker selection
|
|-- (tabs)/_layout.tsx
|   |-- status: hybrid
|   |-- role: tab navigator for quotes, chart, trade, history, settings
|   |-- runtime: lazy=false, detachInactiveScreens=false, freezeOnBlur=false; tab screens stay warm
|   |-- shared UI: global action sheets, sidebar drawer, eager chart/webview readiness
|
|-- (tabs)/quotes.tsx
|   |-- status: hybrid
|   |-- component: src/features/quotes/QuotesScreen.tsx
|   |-- backend: market symbols, watchlist endpoints, quote feed websocket, feed status/snapshot fallback
|   |-- local state: quote view mode, display order, persisted volume cache, locally selected watchlist behavior
|
|-- (tabs)/chart.tsx
|   |-- status: hybrid
|   |-- component: src/features/chart/ChartScreen.ts
|   |-- platform files: ChartScreen.native.tsx and ChartScreen.web.tsx
|   |-- backend: candle history REST, quote feed websocket, optional server candle websocket, instrument metadata, alerts, market symbols
|   |-- local state: chart symbol/timeframe, drawings, colors, indicators, menu order, price source, preferences
|
|-- (tabs)/trade.tsx
|   |-- status: live-backend
|   |-- component: src/features/trade/TradeScreen/TradeScreen.tsx
|   |-- backend: account summary, positions, quote feed, account websocket realtime, order/position lifecycle
|   |-- local state: trade summary collapsed state, selected chart symbol, prefilled order ticket context
|
|-- (tabs)/history.tsx
|   |-- status: live-backend
|   |-- component: src/features/history/HistoryScreen.tsx
|   |-- backend: closed positions, deals, orders, account summary
|   |-- local state: date range/filter state, active tab/sort UI, summary expanded state
|
|-- (tabs)/settings.tsx
|   |-- status: hybrid
|   |-- component: src/features/settings/SettingsScreen/SettingsScreen.tsx
|   |-- backend: broker config, account details, live account state, logout session cleanup
|   |-- local state: theme, language, one-click terms, chart drawings count, quote symbols count, search and route readiness
|
|-- quotes/details.tsx
|   |-- status: hybrid
|   |-- component: src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx
|   |-- backend: live market data, instrument metadata, optional place order mutation
|   |-- local fallback: static instrument metadata, flags/icons, computed market sentiment
|   |-- navigation: can open /trade/order-ticket or set chart symbol and open chart tab
|
|-- quotes/market-statistics.tsx
|   |-- status: hybrid
|   |-- component: src/features/quotes/MarketStatisticsScreen/MarketStatisticsScreen.tsx
|   |-- backend: market symbols/live quotes when available
|   |-- local fallback: quote/watchlist-derived statistics and display-only metrics
|
|-- chart/alerts.tsx
|   |-- status: live-backend
|   |-- component: src/features/chart/PriceAlertsScreen/PriceAlertsScreen.tsx
|   |-- backend: alerts query and create/update/delete mutations
|   |-- local state: form state, selected symbol, alert row UI
|
|-- chart/analytics.tsx
|   |-- status: local-state/static-ui
|   |-- component: src/features/chart/ChartAnalyticsScreen.tsx
|   |-- role: chart analytics settings/summary surface
|   |-- future backend: analytics metrics, signal history, AI/market analysis payloads if product decides to make it live
|
|-- chart/calculator.tsx
|   |-- status: hybrid
|   |-- component: src/features/chart/ChartTradingCalculatorScreen.tsx
|   |-- backend: calculator APIs where wired, instrument metadata, account context
|   |-- local state: input fields, selected symbol, lot/price calculations
|
|-- chart/colors.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/ChartColorsScreen.tsx
|   |-- role: edits chart color schema/preferences in userPreferences
|   |-- future backend: optional user preference sync/template storage
|
|-- chart/indicator-config.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/IndicatorConfigScreen/IndicatorConfigScreen.tsx
|   |-- role: edits indicator params from local indicator registry and route params
|   |-- future backend: optional cloud-synced chart templates/indicator presets
|
|-- chart/indicator-level.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/IndicatorLevelScreen.tsx
|   |-- role: edits indicator level settings
|
|-- chart/indicator-line-style.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/IndicatorLineStyleScreen.tsx
|   |-- role: edits line style for indicator config
|
|-- chart/indicators.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/IndicatorsScreen.tsx
|   |-- role: lists/activates indicators from frontend indicator registry
|
|-- chart/menu-order.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/ChartMenuOrderScreen.tsx
|   |-- role: edits chart toolbar/menu ordering in preferences
|
|-- chart/objects.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/ObjectsScreen/ObjectsScreen.tsx
|   |-- role: lists chart drawings/objects and updates visibility/lock/remove behavior
|   |-- backend: none today; drawings persist locally
|   |-- future backend: drawing sync, templates, cross-device chart layouts
|
|-- chart/open-order-mode.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/ChartOpenOrderModeScreen.tsx
|   |-- role: chart order interaction mode preference
|
|-- chart/preferences.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/ChartPreferencesScreen.tsx
|   |-- role: display and interaction toggles for chart
|
|-- chart/price-source.tsx
|   |-- status: local-state plus quote-feed dependency
|   |-- component: src/features/chart/ChartPriceSourceScreen.tsx
|   |-- role: selects bid/ask/mid/last-style chart price source
|   |-- backend: quote feed must provide enough bid/ask data for selected source to be meaningful
|
|-- chart/schema-colors.tsx
|   |-- status: local-state
|   |-- component: src/features/settings/ChartPropertiesScreen.tsx
|   |-- role: settings-style chart property/color editor reused under chart stack
|
|-- chart/settings.tsx
|   |-- status: local-state
|   |-- component: src/features/chart/ChartSettingsScreen.tsx
|   |-- role: chart settings menu/screen
|
|-- chart/specification.tsx
|   |-- status: hybrid
|   |-- component: src/features/chart/ChartSpecificationScreen.tsx
|   |-- backend: instrument metadata/trading sessions if present
|   |-- local fallback: chart symbol metadata and local session formatting
|
|-- trade/order-ticket.tsx
|   |-- status: live-backend
|   |-- component: src/features/trade/OrderTicketScreen.tsx
|   |-- backend: POST orders, margin calculation, instrument metadata, market symbols, live tick feed
|   |-- local state: volume, order type/side, one-click acceptance, confirmation modal state
|
|-- trade/modify-position.tsx
|   |-- status: live-backend
|   |-- component: src/features/trade/ModifyPositionScreen.tsx
|   |-- backend: modify position API, positions cache, live tick/candles, instrument metadata
|   |-- local state: selected position snapshot, SL/TP inputs
|
|-- trade/close-position.tsx
|   |-- status: live-backend
|   |-- component: src/features/trade/ClosePositionScreen.tsx
|   |-- backend: close position API and realtime position removal/update
|   |-- local state: confirmation state and selected position snapshot
|
|-- trade/close-by.tsx
|   |-- status: live-backend
|   |-- component: src/features/trade/CloseByScreen.tsx
|   |-- backend: close-by compatible opposite positions and close-by order action
|
|-- trade/bulk.tsx
|   |-- status: live-backend
|   |-- component: src/features/trade/BulkOperationScreen.tsx
|   |-- backend: bulk close/profit/loss/all operation support through order/position APIs
|   |-- local state: selected bulk mode, filtered position set
|
|-- trade/one-click-terms.tsx
|   |-- status: local-state
|   |-- component: src/features/trade/OneClickTermsScreen.tsx
|   |-- role: local terms acceptance gate before one-click trading
|   |-- backend: none today; backend still must validate every order request normally
|
|-- history/filter.tsx
|   |-- status: local-state
|   |-- component: HistoryFilterScreen or HistoryNetProfitLossScreen depending route params
|   |-- role: edits history filters/date ranges or shows net profit/loss details
|   |-- backend: none directly; HistoryScreen applies this state to backend-fetched rows
|
|-- settings/accounts.tsx
|   |-- status: hybrid
|   |-- component: src/features/settings/AccountsScreen.tsx
|   |-- backend: accounts list, broker config/servers, health, MT5 status, signInWithCredentials, broker realtime reconnect
|   |-- local state: saved accounts store, secure credential cleanup, active broker/session persistence
|
|-- settings/brokers.tsx
|   |-- status: live-backend
|   |-- component: src/features/settings/BrokersScreen/BrokersScreen.tsx
|   |-- backend: broker directory/server list
|   |-- local fallback: brokerData helpers and search/filter UI
|
|-- settings/broker-detail.tsx
|   |-- status: live-backend
|   |-- component: src/features/settings/BrokerDetailScreen.tsx
|   |-- backend: selected broker config/detail, server URL/domain fields
|
|-- settings/charts.tsx
|   |-- status: local-state
|   |-- component: src/features/settings/ChartPropertiesScreen.tsx
|   |-- role: chart property/preferences editor from settings stack
|
|-- settings/economic-calendar.tsx
|   |-- status: static-preview
|   |-- component: src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx
|   |-- current data: src/dev/mock/calendarData.ts via fetchEconomicCalendarData()
|   |-- behavior: filters by date tab, impact, currency; refresh interval is 5 minutes while focused
|   |-- future backend: economic calendar endpoint with event id, currency, impact, forecast/previous/actual, timestamp, source, country/flag, calendar-day grouping
|
|-- settings/interface.tsx
|   |-- status: local-state/static-config
|   |-- component: src/features/settings/InterfaceScreen.tsx
|   |-- role: theme/language and interface preferences
|   |-- backend: none today; future optional user preference sync
|
|-- settings/journal.tsx
|   |-- status: hybrid
|   |-- component: DeferredRouteScreen -> src/features/settings/JournalScreen/JournalScreen.tsx
|   |-- backend: positions, closed position history, deals
|   |-- local state: journal notes/manual entries through journalState, daily retention helpers, analytics/review tabs
|
|-- settings/help.tsx
|   |-- status: static-config
|   |-- component: DeferredRouteScreen -> src/features/settings/HelpScreen.tsx
|   |-- current data: HELP_FAQ_ITEMS, categories Account/Trading/Charts/Safety, support email config
|   |-- future backend: CMS/help FAQ endpoint and support ticket endpoint if mailto is replaced
|
|-- settings/user-guide.tsx
|   |-- status: static-config
|   |-- component: src/features/settings/UserGuideScreen.tsx
|   |-- current data: GUIDE_MANUAL_SECTIONS, GUIDE_MANUAL_INTRO, GUIDE_FOOTER_NOTE
|   |-- future backend: CMS/app-guide endpoint if copy should update without app release
|
|-- settings/legal.tsx
|   |-- status: static-config
|   |-- component: src/features/settings/LegalDocumentScreen.tsx
|   |-- current data: legalDocumentViewModel.ts with terms/privacy documents
|   |-- future backend: legal document version endpoint and acceptance audit, if required
|
|-- settings/about.tsx
|   |-- status: static-config plus device metadata
|   |-- component: src/features/settings/AboutScreen.tsx
|   |-- current data: app version/build, ABOUT_ACTIONS, legal links, store target, developer email
|   |-- future backend: release notes, support/ticket creation, account-deletion request API
|
|-- settings/contact-developer.tsx
|   |-- status: static-config/local-mailto
|   |-- component: DeveloperContactRequestScreen from AboutScreen
|   |-- current action: builds mailto to configured developer/support email
|   |-- future backend: support ticket endpoint with category, title, message, app/platform/account context
|
|-- settings/account-deletion.tsx
|   |-- status: static-config/local-mailto
|   |-- component: DeveloperContactRequestScreen with account-deletion category
|   |-- current action: builds account deletion mailto with account login/server context
|   |-- future backend: authenticated account deletion request endpoint, status tracking, consent/audit fields
```

## Active Surface Rule

This prompt lists only UI reachable from the current tabs, visible Settings rows, Sidebar drawer, About actions, or in-screen action flows. Old or unlinked component files can exist in the repository, but they are intentionally excluded until they are wired into the app UI.

## Full Screen Family Data Ownership Map

```text
Authentication and broker selection
|-- screens: login.tsx, register.tsx, settings/brokers, settings/broker-detail, settings/accounts
|-- backend-connected now:
|   |-- broker directory and broker config
|   |-- auth/login against selected broker service or auth proxy
|   |-- public demo account registration
|   |-- account list/details/summary
|   |-- health and MT5 status probes
|-- frontend-owned now:
|   |-- selected broker UI state
|   |-- SecureStore tokens/session metadata
|   |-- saved account display cache
|   |-- broker logo lookup and local account switching UI
|-- backend must return:
|   |-- stable broker id/domain/server fields
|   |-- account login that can be used by account, order, position, deal, and websocket paths
|   |-- concrete auth errors instead of generic "broker invalid" errors when broker is valid

Quotes and market watch
|-- screens: /quotes, /quotes/details, /quotes/market-statistics
|-- files: QuotesScreen.tsx, useLiveQuotes.ts, quoteWatchlistDefaults.ts, addSymbolCatalog.ts, SymbolDetailsScreen/*, MarketStatisticsScreen/*
|-- backend-connected now:
|   |-- market symbols/instrument catalog
|   |-- watchlist query/add/remove/replace
|   |-- quote feed websocket /ws/feed
|   |-- feed status/snapshot fallback
|   |-- instrument metadata
|   |-- optional order placement from symbol detail action
|-- frontend-owned now:
|   |-- quote row display mode/list/table
|   |-- local live quote snapshot cache and throttled notifications
|   |-- volume cache in AsyncStorage
|   |-- static flags/icons/instrument fallback metadata
|   |-- row action sheets and navigation to chart/trade/details/statistics
|-- backend must return:
|   |-- bid/ask or equivalent normalized tick fields
|   |-- stable symbol names that match market symbols and websocket subscriptions
|   |-- enough fields for spread, high/low, change, and stale/fresh indicators

Chart workspace
|-- screens: /chart plus chart/* settings routes
|-- core files: ChartScreen.native.tsx, ChartScreen.web.tsx, ChartScreen.styles.ts, ChartScreen.constants.ts
|-- renderer files: rendering/ChartWebViewHtml.ts, rendering/lightweightChartsBundle.ts, preview/LiveChartPreview.*
|-- chart data files: domain/candles/api/*, domain/candles/hooks/useLiveCandles.ts, domain/candles/series/liveCandleAggregator.ts, domain/candles/ws/*
|-- UI feature files: ChartTradeButtonsFeature/*, ChartTradeControls.tsx, ChartTradeFeature.tsx, ChartLiveHeaders.tsx, ChartToolbarMenuFeature.tsx, ChartTimeframePickerSheet.tsx, ChartTapRadialMenu.tsx
|-- drawing files: drawingPersistence.ts, drawingTools/*, drawingTools/runtime/*, plugins/*
|-- indicator files: indicatorRegistry/*, IndicatorConfigScreen/*, IndicatorsScreen.tsx, IndicatorLevelScreen.tsx, IndicatorLineStyleScreen.tsx
|-- overlays: chartOverlays/*, ChartFixedHorizontalGridOverlay.tsx, DraggableChartMetaOverlay.tsx, PendingOrderPreviewChart.tsx
|-- backend-connected now:
|   |-- candle history REST
|   |-- quote tick websocket
|   |-- optional server candle websocket if compatibility flags are enabled
|   |-- instrument metadata/trading hours/specification
|   |-- market symbols
|   |-- alerts APIs
|   |-- order placement and margin calculator from chart trading controls
|-- frontend-owned now:
|   |-- chart symbol/timeframe
|   |-- chart colors/schema
|   |-- menu order
|   |-- drawing objects and object visibility/lock state
|   |-- indicator registry/config
|   |-- price source selection
|   |-- open order mode
|   |-- WebView bridge payload handling
|-- backend must return:
|   |-- strict valid OHLC candles; impossible OHLC ranges must not be sent
|   |-- timestamps in seconds or parseable ISO that frontend normalization accepts
|   |-- ordered candle history with no duplicate time collisions unless replacing the same candle
|   |-- quote ticks fast enough for active chart and trade buttons
|   |-- instrument digits/tick size/trading sessions where available

Trade and execution
|-- screens: /trade, /trade/order-ticket, /trade/modify-position, /trade/close-position, /trade/close-by, /trade/bulk, /trade/one-click-terms
|-- files: TradeScreen/*, OrderTicketScreen.tsx, ModifyPositionScreen.tsx, ClosePositionScreen.tsx, CloseByScreen.tsx, BulkOperationScreen.tsx, OneClickTermsScreen.tsx
|-- helper files: accountSummary.ts, livePositionMetrics.ts, tradeFlow.ts, closePositionFlow.ts, orderTicketPreviewUtils.ts, OrderTickExecutionGraph/*
|-- backend-connected now:
|   |-- positions query and account websocket updates
|   |-- account summary/equity/margin
|   |-- order submit, pending order submit
|   |-- modify position
|   |-- close/close-by/bulk operations
|   |-- margin calculation
|   |-- quote feed for live bid/ask and execution graph
|-- frontend-owned now:
|   |-- one-click terms acceptance
|   |-- trade volume preference
|   |-- optimistic selected position snapshots for detail routes
|   |-- error classification/display
|-- backend must return:
|   |-- order success/failure with stable identifiers and useful error payloads
|   |-- realtime fan-out after order placement, close, modify, and close-by
|   |-- updated positions, account metrics, and history/deals after lifecycle events

History and reporting
|-- screens: /history, /history/filter
|-- files: HistoryScreen.tsx, HistoryFilterScreen/*, HistoryNetProfitLossScreen.tsx, derivedClosedPositions.ts, historyMoney.ts, historyDateRange.ts
|-- backend-connected now:
|   |-- GET closed positions
|   |-- GET deals
|   |-- GET orders
|   |-- GET account summary
|-- frontend-owned now:
|   |-- history range and custom from/to dates
|   |-- tab/sort/filter UI
|   |-- derived closed-position reconstruction from deals when backend history lags
|-- backend must return:
|   |-- order/deal/position ids or ticket fields where possible
|   |-- close/open timestamps and broker-time parseable values
|   |-- profit, swap, commission, fee, deposit/balance rows with clear numeric signs

Settings shell
|-- screen: /settings
|-- file: SettingsScreen/SettingsScreen.tsx
|-- visible rows/actions:
|   |-- account card -> /settings/accounts
|   |-- connected metrics: quote count, drawing count, one-click state
|   |-- New Account -> /register
|   |-- Economic Calendar -> /settings/economic-calendar
|   |-- Theme -> local light/dark toggle
|   |-- Language Preference -> /settings/interface
|   |-- Journal -> /settings/journal
|   |-- Support -> mailto built by buildHelpMailto()
|   |-- Help -> /settings/help
|   |-- Logout -> disconnect account/candle websockets, clear tokens/session, reset live account, route /login
|-- backend-connected now:
|   |-- account details query
|   |-- broker config query
|   |-- live account state
|-- frontend-owned now:
|   |-- theme mode
|   |-- language
|   |-- one-click accepted flag
|   |-- search overlay and route preloading

Settings content and support screens
|-- screens: Accounts, Brokers, Broker Detail, Chart Properties, Interface, Economic Calendar, Journal, Help, User Guide, Legal, About, Contact Developer, Account Deletion
|-- backend-connected now:
|   |-- Accounts/Brokers/Broker Detail
|   |-- Journal partially through trade/account history APIs
|-- frontend-only today:
|   |-- Chart Properties, Interface, Economic Calendar mock, Help FAQ, User Guide, Legal documents, About, Contact Developer mailto, Account Deletion mailto
|-- backend future candidates:
|   |-- support tickets
|   |-- economic calendar provider data
|   |-- help/user-guide CMS
|   |-- legal document versioning/acceptance audit
|   |-- user preference sync
|   |-- account deletion request workflow
```

## Local, Static, And Future Backend Candidate Tree

If a user reports an issue on one of these screens, first determine whether the bug is frontend-only today or whether product is asking backend to create a new contract.

```text
Local preference surfaces:
|-- Theme: userPreferences themeMode
|-- Language: userPreferences language from SUPPORTED_LANGUAGES
|-- Chart colors/schema: userPreferences chart color fields
|-- Chart menu order/preferences/price source/open order mode: userPreferences
|-- Chart drawings/objects: drawingPersistence and userPreferences drawing state
|-- One-click terms: userPreferences oneClickAccepted
|-- Trade volume: userPreferences tradeVolume
|-- History filters: userPreferences historyRange/historyFromMs/historyToMs
|-- Quote view mode/watchlist display cache: quotes state/hooks plus watchlist backend where connected

Static config/legal/support surfaces:
|-- Help FAQ: helpViewModel.ts
|-- User Guide: userGuideViewModel.ts
|-- Legal Terms/Privacy: legalDocumentViewModel.ts
|-- About actions/store links/support email: aboutViewModel.ts and config/legalLinks
|-- Support/contact/account deletion: mailto links, not live support-ticket backend today

Static preview/product surfaces:
|-- Economic Calendar: src/dev/mock/calendarData.ts

Future backend candidate endpoints:
|-- /support/tickets
|-- /support/account-deletion-requests
|-- /economic-calendar/events
|-- /cms/help-faq
|-- /cms/user-guide
|-- /legal/documents
|-- /legal/acceptance
|-- /user/preferences
|-- /chart/templates
|-- /chart/drawings
```

## Backend Agent Decision Rules For Any Future Mobile Issue

```text
1. Identify the route and screen file.
2. Check this file's status label:
   |-- live-backend: test the actual backend endpoint/channel.
   |-- hybrid: test backend, then check local state/fallback interaction.
   |-- local-state: backend is probably not involved unless a new sync feature is requested.
   |-- static-preview/static-config: backend endpoint likely does not exist yet; propose a contract rather than "fixing" a non-existent backend.
3. For live-backend screens, verify the selected broker service domain, not only the shared API base URL.
4. For static-preview screens, verify the frontend view model file before designing backend fields. The view model already describes the UI shape.
5. For future backend work, keep the frontend response shape close to the existing TypeScript models so the frontend integration is low-risk.
6. If backend is correct, return the exact frontend file/function to patch.
7. If frontend is correct and backend is missing/wrong, return the backend endpoint/channel, expected payload, actual payload, and patch plan.
```

## Frontend Runtime Summary

```text
Expo app: rtx5-app
Framework: Expo Router + React Native 0.81 + React 19
State: Zustand + SecureStore + AsyncStorage
Server-state cache: TanStack Query
Chart engine: TradingView Lightweight Charts bundled into WebView/native bridge and web renderer
Realtime:
|-- quote feed websocket: broker /ws/feed
|-- account/trade websocket: broker /ws/v2?token=JWT
|-- optional candle websocket: broker /ws/v2?broker_id=...
Default screen after launch: /quotes
Primary tabs: quotes, chart, trade, history, settings
```

Important runtime behavior:

```text
app/_layout.tsx
|-- wraps the app in ErrorBoundary, AppProviders, ThemeProvider, Sentry
|-- prevents splash hide until fonts and user preferences hydrate
|-- hydrates persisted candle cache after startup
|-- if logged in:
|   |-- auto-migrates legacy small numeric account ids by fetching /accounts
|   |-- starts brokerRealtimeService.connect()
|   |-- runs bootstrapApp()
|   |-- refreshes positions and account summary on idle timers
|   |-- refreshes access token and broker realtime on app foreground
|-- if logged out:
|   |-- disconnects brokerRealtimeService

app/(tabs)/_layout.tsx
|-- primary tabs are eagerly mounted: lazy=false
|-- inactive screens are not detached: detachInactiveScreens=false
|-- inactive screens are not frozen: freezeOnBlur=false
|-- global ActionSheet and SidebarDrawer live here
|-- chart WebView can boot before first visible chart visit
```

## Environment Variable Tree

Do not paste real values into backend prompts. Use these variable names to understand routing and toggles.

```text
Core backend and routing:
|-- EXPO_PUBLIC_API_BASE_URL
|-- EXPO_PUBLIC_AUTH_PROXY_API_BASE_URL
|-- EXPO_PUBLIC_API_V1_BASE_URL
|-- EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL
|-- EXPO_PUBLIC_DEMO_API_BASE_URL

Websocket overrides:
|-- EXPO_PUBLIC_QUOTES_WS_URL
|-- EXPO_PUBLIC_ACCOUNT_WS_URL
|-- EXPO_PUBLIC_CANDLES_WS_URL
|-- EXPO_PUBLIC_WS_URL

Feed auth:
|-- EXPO_PUBLIC_FEED_BROKER_TOKEN
|-- EXPO_PUBLIC_BROKER_FEED_TOKEN
|-- EXPO_PUBLIC_MYPROP_FEED_TOKEN
|-- EXPO_PUBLIC_WS_FEED_TOKEN
|-- EXPO_PUBLIC_FEED_TOKEN
|-- EXPO_PUBLIC_FEED_BROKER_ID
|-- EXPO_PUBLIC_BROKER_FEED_ID
|-- EXPO_PUBLIC_MYPROP_FEED_BROKER_ID

Candle engine:
|-- EXPO_PUBLIC_CANDLE_PRICE_BASIS
|-- EXPO_PUBLIC_CANDLE_SOURCE_MODE
|-- EXPO_PUBLIC_ENABLE_SERVER_CANDLE_STREAMS
|-- EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE
|-- EXPO_PUBLIC_DEBUG_CANDLE_FEED
|-- EXPO_PUBLIC_DEBUG_CANDLE_STREAM
|-- EXPO_PUBLIC_DEBUG_CANDLE_TABLE

Debug and diagnostics:
|-- EXPO_PUBLIC_DEBUG_API_LATENCY
|-- EXPO_PUBLIC_API_FETCH_TIMEOUT_MS
|-- EXPO_PUBLIC_DEBUG_ACCOUNT_WS
|-- EXPO_PUBLIC_DEBUG_ACCOUNTS_API
|-- EXPO_PUBLIC_DEBUG_ACCOUNTS_SCREEN
|-- EXPO_PUBLIC_DEBUG_POSITIONS_API
|-- EXPO_PUBLIC_DEBUG_POSITIONS_STATE
|-- EXPO_PUBLIC_DEBUG_CHART_TRADE
|-- EXPO_PUBLIC_ENABLE_DATA_ANALYZER

Demo registration:
|-- EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID
|-- EXPO_PUBLIC_ORRNN_DEMO_INITIAL_BALANCE
|-- EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER
|-- EXPO_PUBLIC_ORIGIN_BROKER

Legal/support/app:
|-- EXPO_PUBLIC_TERMS_URL
|-- EXPO_PUBLIC_PRIVACY_POLICY_URL
|-- EXPO_PUBLIC_DEVELOPER_EMAIL
|-- EXPO_PUBLIC_SUPPORT_EMAIL
|-- EXPO_PUBLIC_IOS_APP_STORE_ID
|-- EXPO_PUBLIC_APP_DISPLAY_VERSION
|-- EXPO_PUBLIC_APP_ENV
|-- EXPO_PUBLIC_DISABLE_OTA_UPDATES
|-- EXPO_PUBLIC_SENTRY_DSN

Local test-login prefill:
|-- EXPO_PUBLIC_PREFILL_TEST_LOGIN
|-- EXPO_PUBLIC_TEST_BROKER_ID
|-- EXPO_PUBLIC_TEST_BROKER_NAME
|-- EXPO_PUBLIC_TEST_BROKER_SERVER_URL
|-- EXPO_PUBLIC_TEST_USERNAME
|-- EXPO_PUBLIC_TEST_PASSWORD

Build/runtime overrides:
|-- RTX5_FORCE_EXPO_VERSION
|-- RTX5_FORCE_RUNTIME_VERSION
```

## Broker Routing Tree

Source of truth:

```text
src/api/brokerRouting.ts
src/api/brokerApi.ts
src/api/apiClient.ts
src/state/brokerSessionStorage.ts
src/api/feedAuth.ts
```

Routing contract:

```text
Unauthenticated default REST base:
|-- EXPO_PUBLIC_API_BASE_URL or https://backend.orrnn.com/api/v2

Public broker directory base:
|-- EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL
|-- else EXPO_PUBLIC_API_V1_BASE_URL
|-- else https://testsuperbackend.orrnn.com/api/v1

Logged-in broker REST base:
|-- selected broker service root + /api/v2
|-- selected broker service root is discovered from broker directory fields:
|   |-- server_url
|   |-- market_api_url
|   |-- domains.services
|   |-- services_domain
|   |-- domains.server
|   |-- server_domain
|   |-- domains.domain_name
|   |-- domain_name
|   |-- feed_status_https_url
|   |-- feed_status_url
|   |-- feed_wss_url
|   |-- feed_ws_url
|   |-- feed_url
|   |-- wss_url
|   |-- ws_url
|   |-- server

Logged-in broker websocket bases:
|-- quote feed: wss://{brokerHost}/ws/feed
|-- account/trade realtime: wss://{brokerHost}/ws/v2?token=JWT
|-- optional candle stream: wss://{brokerHost}/ws/v2?broker_id={broker_id}
```

Strict security/transport rules:

```text
normalizeBrokerServerUrl()
|-- converts http/ws/wss to https root for service discovery
|-- strips trailing /api/v2, /ws, /ws/feed, /ws/v2 paths
|-- accepts only https
|-- accepts domain-like hosts only
|-- rejects raw IPv4 and IPv6 hosts
|-- rejects shared backend origins as broker service domains

buildBrokerWsUrl()
|-- uses WSS
|-- derives websocket host from broker services domain
|-- never uses raw IP for production broker websocket routing

brokerApi.request()
|-- injects Bearer token unless skipAuth=true
|-- refreshes JWT proactively inside 60 seconds of expiry
|-- retries once after 401 with refreshed token
|-- appends _t=Date.now() to GET requests to avoid stale cache
|-- returns a 400 BROKER_BACKEND_DOMAIN_UNAVAILABLE response if logged in without a valid broker service domain
```

Backend implication:

```text
Every enabled broker in /broker/servers must expose a valid HTTPS services domain.
The mobile app will not treat shared backend URLs or raw IPs as valid logged-in broker service roots.
If backend tests only https://backend.orrnn.com/api/v2 after login, the test is incomplete.
```

## Screen Route Tree And Backend Dependencies

```text
app/index.tsx
|-- redirects to /quotes

app/(tabs)/quotes.tsx -> src/features/quotes/QuotesScreen.tsx
|-- UI: live quote list, watchlist, add/remove/reorder, symbol action sheet
|-- REST:
|   |-- GET /watchlist
|   |-- POST /watchlist/{symbol}
|   |-- DELETE /watchlist/{symbol}
|   |-- PUT /watchlist
|   |-- GET /instruments
|   |-- GET /quotes?symbols=...
|   |-- GET {brokerRoot}/ws/feed/status?broker_id=...
|-- WS:
|   |-- /ws/feed subscribe/unsubscribe quote ticks
|-- State:
|   |-- useTradingState.quotes
|   |-- AsyncStorage quote volume cache
|   |-- useUserPreferences watchlist/chart symbol
|-- Related routes:
|   |-- app/quotes/details.tsx -> SymbolDetailsScreen
|   |-- app/quotes/market-statistics.tsx -> MarketStatisticsScreen

app/(tabs)/chart.tsx -> src/features/chart/ChartScreen.native.tsx and ChartScreen.web.tsx
|-- UI: candlestick chart, symbol/timeframe picker, drawing tools, trade buttons, overlays
|-- REST:
|   |-- GET /candles/{symbol}?timeframe={tf}&limit={count}
|   |-- GET /candles/{symbol}?tf={tf}&count={count}
|   |-- GET /market-data/candles/{symbol}?timeframe={tf}&limit={count}
|   |-- GET /quotes?symbols=...
|   |-- GET /positions/{login}/history?limit=...&offset=...
|   |-- GET /orders/{login}?limit=...
|   |-- GET /alerts
|   |-- GET /account/{login}
|   |-- GET /instruments/{symbol}
|   |-- GET /market/status/{symbol}
|   |-- POST /orders
|   |-- POST /orders/pending
|-- WS:
|   |-- default active candle source: /ws/feed quote ticks
|   |-- optional server candle source: /ws/v2 candles.SYMBOL.tfToken
|-- Renderer:
|   |-- native: src/features/chart/rendering/ChartWebViewHtml.ts
|   |-- web: src/features/chart/ChartScreen.web.tsx
|-- Related routes:
|   |-- chart/objects
|   |-- chart/settings
|   |-- chart/preferences
|   |-- chart/schema-colors
|   |-- chart/colors
|   |-- chart/price-source
|   |-- chart/open-order-mode
|   |-- chart/calculator
|   |-- chart/analytics
|   |-- chart/indicators
|   |-- chart/indicator-config
|   |-- chart/indicator-line-style
|   |-- chart/indicator-level
|   |-- chart/specification
|   |-- chart/alerts
|   |-- chart/menu-order

app/(tabs)/trade.tsx -> src/features/trade/TradeScreen/TradeScreen.tsx
|-- UI: account summary, open positions, fast close/modify/order actions
|-- REST:
|   |-- GET /positions/{login}?limit=50&offset=0
|   |-- GET /account/{login}
|   |-- POST /orders
|   |-- POST /orders/pending
|   |-- POST /positions/{ticket}/close
|   |-- POST /positions/{ticket}/modify
|-- WS:
|   |-- /ws/feed for live bid/ask and position P/L
|   |-- /ws/v2?token=JWT for positions/account/orders/deals/history lifecycle
|-- State:
|   |-- usePositionsState
|   |-- useLiveAccountState
|   |-- useTradingState.quotes
|-- Related routes:
|   |-- trade/order-ticket
|   |-- trade/one-click-terms
|   |-- trade/close-position
|   |-- trade/close-by
|   |-- trade/modify-position
|   |-- trade/bulk

app/(tabs)/history.tsx -> src/features/history/HistoryScreen.tsx
|-- UI: closed trades, orders/deals/account statistics, filter, net P/L detail
|-- REST:
|   |-- GET /positions/{login}/history?limit=...&offset=...
|   |-- GET /account/deals?limit=...&offset=...&from=...&to=...
|   |-- GET /deals/{login}?limit=...&offset=...&from=...&to=...
|   |-- GET /orders/{login}?limit=...
|   |-- GET /account/orders?limit=...&offset=...
|   |-- GET /account/{login}
|-- Related routes:
|   |-- history/filter

app/(tabs)/settings.tsx -> src/features/settings/SettingsScreen/SettingsScreen.tsx
|-- UI: account card, broker login, support links, local app settings
|-- REST/WS depends on selected settings route
|-- logout disconnects account websocket and clears live account state
|-- Related routes:
|   |-- settings/accounts -> AccountsScreen, GET /accounts, GET /account/{login}
|   |-- settings/brokers -> BrokersScreen, GET /broker/servers
|   |-- settings/broker-detail -> BrokerDetailScreen, /health + POST /auth/login
|   |-- settings/journal -> JournalScreen, uses deals/positions/history plus local journal state
|   |-- settings/charts -> local chart properties/preferences
|   |-- settings/economic-calendar -> currently app-side/mock calendar data
|   |-- settings/interface -> local interface/language/theme settings
|   |-- settings/user-guide -> local/static guide content
|   |-- settings/help -> local/static help/support content
|   |-- settings/legal -> local/legal URLs
|   |-- settings/account-deletion -> local/account-deletion instructions
|   |-- settings/contact-developer -> configured support/developer email
|   |-- settings/about -> app version, legal links, optional App Store id

app/login.tsx
|-- UI: broker selection + account credentials
|-- REST:
|   |-- GET /broker/servers through public broker directory base
|   |-- GET {brokerRoot}/health
|   |-- POST {brokerRoot}/api/v2/auth/login
|   |-- optional GET /broker/config?broker_id=...
|-- On success:
|   |-- persists broker id, broker service URL, logo URL
|   |-- persists access token, refresh token, expires_at
|   |-- extracts/persists feed token if backend returns one
|   |-- stores account login/name/server/account type in user preferences
|   |-- invalidates account query caches and navigates to /quotes

app/register.tsx
|-- UI: demo account registration
|-- REST:
|   |-- GET /public/demo-status through public demo API base
|   |-- GET /public/demo-groups through public demo API base
|   |-- POST /public/demo-account through public demo API base
|   |-- GET /broker/servers to find auth route for demo broker
|   |-- POST {brokerRoot}/api/v2/auth/login after account creation
|-- Public demo account create response must include login number
```

## REST Endpoint Contract Tree

All authenticated `/api/v2` REST calls go through `apiClient`/`brokerApi` and use selected broker service root after login.

```text
Auth:
|-- POST /auth/login
|   |-- body: { username, password, broker_id }
|   |-- called against broker service root, never shared backend, after broker selection
|   |-- expected response fields:
|   |   |-- access_token or token
|   |   |-- refresh_token or refreshToken
|   |   |-- expires_in or expires_at
|   |   |-- account_login or accountLogin or user.account_login or user.id
|   |   |-- username/name/account_name/accountName
|   |   |-- broker_id or brokerId
|   |   |-- account_type/accountType/is_demo/isDemo/group/account_group
|   |   |-- optional feed_broker_token/broker_feed_token/feed_token/ws_feed_token/market_data_token/quote_feed_token
|-- POST /auth/refresh
|   |-- body: { refresh_token, broker_id? }
|   |-- expected response: new access token, refresh token, expiry, optional broker id, optional feed token
|-- POST /auth/change-password
|   |-- body: { current_password, new_password }
|-- GET /auth/me
|   |-- used by startup bootstrap; failures are non-fatal but should work for logged-in sessions

Broker directory and broker config:
|-- GET /broker/servers
|   |-- called on PUBLIC_BROKER_DIRECTORY_BASE_URL
|   |-- response can be array or { value: [...] }
|   |-- each enabled row should contain broker_id, broker_name, server name, logo_url, and a valid service-domain field
|-- GET /broker/config?broker_id={brokerId}
|   |-- returns broker branding, legal links, leverage limits, feature flags
|-- GET {brokerRoot}/health
|   |-- used before login and by health checks

Public demo:
|-- GET /public/demo-status
|   |-- healthy when service=orrnn-demo, status=ok, broker=active, database=connected, demo_groups_available>0
|-- GET /public/demo-groups
|   |-- response: { groups: [{ name, description, currency, leverage }], count }
|-- POST /public/demo-account
|   |-- unauthenticated
|   |-- body: group, email, master_pass, investor_pass, first_name, last_name?, phone?, country?, currency?, leverage?, initial_balance?, origin_broker?, comment?
|   |-- success status expected: 200
|   |-- response must include numeric login

Accounts and account summary:
|-- GET /accounts
|   |-- response: flat array of account rows
|-- GET /account/{login}
|   |-- response: single account row
|   |-- used for account summary and account details
|   |-- should include login, name, group, currency, leverage, balance, equity, used/free margin, margin_level, floating/open position data when available

Quotes and market data:
|-- GET /quotes?symbols=A,B
|   |-- REST fallback for live quotes
|   |-- logged-in calls use auth and broker service domain
|   |-- logged-out calls skip auth
|   |-- response may be array or wrapped; each quote should include symbol, bid, ask, timestamp/time/t, optional digits/point/tickSize/volume/high/low/open/spread
|-- GET /instruments
|   |-- used by Quotes symbol catalog, order symbol fallback, startup bootstrap, chart symbol picker
|-- GET /instruments/{symbol}
|   |-- used by chart specification/details/order precision
|-- GET /market/status
|   |-- used by startup bootstrap
|-- GET /market/status/{symbol}
|   |-- used by chart specification and trading hours
|-- GET {brokerRoot}/ws/feed/status?broker_id={brokerId}
|   |-- used to infer active symbols and feed health

Candle history:
|-- GET /candles/{symbol}?timeframe={tf}&limit={count}[&from={unixSec}&to={unixSec}]
|-- GET /candles/{symbol}?tf={tf}&count={count}[&from={unixSec}&to={unixSec}]
|-- GET /market-data/candles/{symbol}?timeframe={tf}&limit={count}[&from={unixSec}&to={unixSec}]
|-- accepted response wrappers:
|   |-- [...]
|   |-- { candles: [...] }
|   |-- { data: [...] }
|   |-- { data: { candles/items/results/bars: [...] } }
|   |-- { result: [...] }
|   |-- { result: { candles/items: [...] } }
|   |-- { payload: [...] }
|   |-- { payload: { candles/items: [...] } }
|-- each candle should include time plus open/high/low/close and optional volume
|-- time and pagination bounds must be Unix seconds; milliseconds are normalized by frontend but backend should use seconds
|-- frontend has no logged-in anonymous `/history` fallback; broker history must work at broker /api/v2

Watchlist:
|-- GET /watchlist
|   |-- array or { data: [...] }
|   |-- item: { symbol, added_at, sort_order }
|-- POST /watchlist/{symbol}
|   |-- 400 duplicate is treated as no-op by frontend
|-- DELETE /watchlist/{symbol}
|-- PUT /watchlist
|   |-- body must be array: [{ symbol, sort_order }]
|   |-- do not require Swagger object { symbols: [...] } for this mobile frontend

Alerts:
|-- GET /alerts
|   |-- array or { data: [...] }
|   |-- item: { id, symbol, condition, price, message?, triggered, created_at? }
|-- POST /alerts
|   |-- body: { symbol, condition: "above"|"below", price, message? }
|   |-- mobile treats 200 and 201 as success
|-- DELETE /alerts/{id}

Trading orders:
|-- GET /orders/{login}?limit={limit}
|-- GET /account/orders?limit={limit}&offset={offset}
|-- POST /orders
|   |-- body built by frontend:
|   |   |-- login: integer
|   |   |-- symbol: string
|   |   |-- side: "buy"|"sell"
|   |   |-- volume: number
|   |   |-- optional price_sl, price_tp, comment, trailing_stop, trailing_step, magic
|   |-- frontend intentionally omits broker_id; backend should resolve broker from JWT
|   |-- accepted response aliases:
|   |   |-- ticket can become position_ticket and order_ticket
|   |   |-- price_open can become price
|   |-- if symbol/market-data miss occurs, frontend retries symbol candidates and may fetch /instruments
|-- POST /orders/pending
|   |-- body built from pendingOrderPayload.ts
|   |-- frontend retries symbol candidates on symbol/market-data miss
|   |-- response should include price_open or price

Positions:
|-- GET /positions/{login}?limit={limit}&offset={offset}
|   |-- array or wrapped array in data/positions/items/result
|-- GET /positions/{login}/history?limit={limit}&offset={offset}
|   |-- closed history loader paginates up to 50 pages and dedupes
|-- POST /positions/{ticket}/close
|   |-- body omitted for full close
|   |-- optional body: { ticket_by, volume }
|   |-- Retry-After header is used on 429
|-- POST /positions/{ticket}/modify
|   |-- body includes SL/TP/trailing fields
|   |-- Retry-After header is used on 429

Deals and history:
|-- GET /account/deals?limit={limit}&offset={offset}[&from={unixSec}&to={unixSec}]
|-- GET /deals/{login}?limit={limit}&offset={offset}[&from={unixSec}&to={unixSec}]
|-- accepted wrappers: data, deals, items, records, rows, result, history
|-- deal item should include ticket, order_ticket, position_ticket, account_login, symbol, action, entry, volume, price, profit, swap, commission, fee, magic, comment, time

Calculators:
|-- POST /calculate/margin
|   |-- body: { account_login, symbol, side, volume }
|   |-- real response expected by frontend: { contract_value, free_margin, max_lots, pip_value, required_margin }
|-- POST /calculate/profit
|   |-- body: { symbol, volume, side, open_price, close_price }
|   |-- real response expected by frontend: { pip_value, pips, profit }

Secondary account and platform:
|-- GET /api/account/transactions?type={type}&limit={limit}
|-- GET /api/account/equity-history?period={period}&interval={interval}
|-- GET /exposure
|-- GET /health or {brokerRoot}/health
|-- POST /email/send
|-- GET /api/mt5/status
|-- GET /api/mt5/groups
|-- POST /api/mt5/account/create
```

## Websocket Contract Tree

### Quote Feed Websocket

Frontend source:

```text
src/api/ws/quotesSocket/QuotesWebSocketService.ts
src/api/ws/quotesSocket/tickProcessor.ts
src/api/ws/quoteTickNormalizer.ts
src/query/websocket.ts
src/features/quotes/useLiveQuotes.ts
src/domain/candles/stream/liveCandleStream/manager.ts
```

Connection:

```text
Logged out:
|-- EXPO_PUBLIC_QUOTES_WS_URL if valid secure WSS domain
|-- else wss://backend.orrnn.com/ws/feed

Logged in:
|-- wss://{brokerServiceHost}/ws/feed?broker_id={brokerId}
|-- if feed token exists:
|   |-- wss://{brokerServiceHost}/ws/feed?broker_id={brokerId}&token={redacted}
|-- frontend stays on broker feed and does not fall back to shared backend when logged in
```

Subscription messages:

```json
{ "type": "subscribe", "symbols": ["EURUSD", "XAUUSD"] }
{ "type": "unsubscribe", "symbols": ["EURUSD"] }
{ "type": "ping" }
```

Accepted subscription ack:

```json
{ "type": "subscribed", "symbols": ["EURUSD"] }
{ "type": "unsubscribed", "symbols": ["EURUSD"] }
```

Accepted tick envelopes:

```text
Array of ticks
{ data: [...] }
{ ticks: [...] }
{ prices: [...] }
{ quotes: [...] }
{ items: [...] }
{ payload: [...] }
{ message: [...] }
{ data: { ...tick } }
{ tick: { ...tick } }
{ quote: { ...tick } }
{ price: { ...tick } }
{ payload: { ...tick } }
{ message: { ...tick } }
```

Best tick shape to send:

```json
{
  "symbol": "EURUSD",
  "bid": 1.16345,
  "ask": 1.16365,
  "timestamp_ms": 1782990000123,
  "digits": 5,
  "point": 0.00001,
  "tickSize": 0.00001,
  "volume": 123,
  "sequence": 123456,
  "tick_id": "provider-tick-id",
  "source": "broker-feed"
}
```

Normalizer accepts aliases:

```text
symbol: symbol, Symbol, SYMBOL, s, S, instrument, instrumentSymbol, or channel like quotes.EURUSD
bid: bid, Bid, BID, bidPrice, BidPrice, bid_price, b, B
ask: ask, Ask, ASK, askPrice, AskPrice, ask_price, a, A
last/price: last, lastPrice, price, close, c
open/high/low/previous close/change/spread/volume/digits/point/tickSize supported with common aliases
timestamp: timestamp_ms, time_ms, serverTimeMs, timestamp, time, t, tick_time, source_time, lastTickAt, serverTime, created_at, updated_at, received_at
```

Tick rejection rules:

```text
drop if no payload object
drop if no symbol
drop if bid missing, non-finite, or <= 0
ask may fall back to bid if missing, but tick is marked degraded
drop if ask < bid
drop if timestamp missing only for feed timestamp, but frontend can fall back to received_at
```

Quote feed consumers:

```text
Quotes list:
|-- per-symbol synchronous listeners
|-- REST fallback every 500ms in useLiveQuotes when stale/volume missing

Trade rows/header:
|-- useLiveSymbolQuote/useLiveSymbolQuotes
|-- commit interval can be 0 or 16ms
|-- direct WS tick suppresses REST fallback for 2 seconds

Chart:
|-- quote ticks extend active candle in liveCandleStream by default
|-- tick price uses bid first, ask fallback
|-- quote tick volume contribution defaults to 1
```

Reconnect behavior:

```text
heartbeat ping every 15s
watchdog reconnects if no messages for >8s while subscribed
network offline pauses reconnect until network returns
auth failure close codes 1008 or 4001 stop reconnect until a fresh token is available
log URLs redact token query
```

### Feed Status Endpoint

```text
GET {brokerRoot}/ws/feed/status?broker_id={brokerId}
```

Mobile uses this endpoint to identify active symbols and feed health before deeper debugging.

Accepted active-symbol sources:

```text
symbol_status / symbolStatus:
|-- object keyed by symbol or array of rows
|-- row is live if status live/ok, has_data/has_quote true, or has positive bid/ask
|-- stale/silent rows ignored unless positive quote exists
|-- last_tick_age_sec <= 90 is considered fresh

active_symbols / activeSymbols:
|-- array of symbols or row objects

available_symbols / availableSymbols minus silent_symbols:
|-- fallback when no explicit active list exists
```

Useful backend fields:

```text
feed_auth_required
upstream_connected
provider_connected
active_symbols
silent_symbols
symbol_status
last_tick_age_sec
last_bid
last_ask
last_tick_time
```

### Account And Trade Realtime Websocket

Frontend sources:

```text
src/api/ws/accountSocket.ts
src/api/ws/accountSocket.helpers.ts
src/api/ws/BrokerRealtimeService.ts
src/state/liveAccountState.ts
src/state/positionsState.ts
```

Connection:

```text
wss://{brokerServiceHost}/ws/v2?token={JWT}
```

Subscription protocols used:

```json
{ "action": "subscribe", "channel": "metrics.200074" }
{ "action": "subscribe", "channel": "account.200074" }
{ "action": "subscribe", "channel": "positions.200074" }
{ "action": "subscribe", "channel": "orders.200074" }
{ "action": "subscribe", "channel": "deals.200074" }
{ "action": "subscribe", "channel": "history.200074" }
{ "action": "subscribe", "channels": ["ticks.EURUSD", "positions.200074", "account.200074"] }
{ "action": "ping" }
```

Accepted message envelope:

```text
{ channel, event?, type?, action?, data }
{ channel, payload }
{ channel, result }
or flat object with event/type/action and fields
```

Account metrics accepted aliases:

```text
login/account_login/id
balance
equity
margin/usedMargin/used_margin
margin_free/freeMargin/free_margin/margin_available
margin_level/marginLevel
floating/pnl/profit/floatingPnl/floating_pnl/unrealized_pl
```

Positions accepted shapes:

```text
snapshot array
{ positions: [...] }
{ items: [...] }
{ data: [...] }
{ result: [...] }
single update with ticket/id/position_ticket/order_ticket/symbol/volume/side/price_open/profit/pnl
event hints: event, type, action, status, state, position_state, positionStatus
```

Important backend expectation:

```text
After POST /orders, POST /orders/pending, POST /positions/{ticket}/close, or POST /positions/{ticket}/modify,
backend should broadcast lifecycle updates on positions.LOGIN, account.LOGIN/metrics.LOGIN, orders.LOGIN,
deals.LOGIN, and/or history.LOGIN as appropriate.

If mobile order placement succeeds but another terminal does not update until refresh, the likely backend gap is
realtime fan-out/listener/cache invalidation outside the mobile order POST.
```

### Candle Websocket

Frontend sources:

```text
src/domain/candles/ws/candlesSocketProtocol.ts
src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts
src/domain/candles/ws/liveCandlesEnginePolicy.ts
src/domain/candles/stream/liveCandleStream/manager.ts
```

Connection:

```text
Logged out:
|-- EXPO_PUBLIC_CANDLES_WS_URL if configured and valid
|-- else wss://backend.orrnn.com/ws/v2

Logged in:
|-- wss://{brokerServiceHost}/ws/v2?broker_id={brokerId}
|-- no API token is attached to candle websocket
```

Server candle stream is not the default active candle source. It is enabled only when:

```text
EXPO_PUBLIC_CANDLE_SOURCE_MODE=server
or EXPO_PUBLIC_ENABLE_SERVER_CANDLE_STREAMS is true
and EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE is true
```

Default production mode:

```text
active candle body movement comes from quote ticks on /ws/feed
server candle payloads arriving on quote feed are ignored unless server candle mode is enabled
```

Subscription messages for /ws/v2:

```json
{ "action": "subscribe", "channel": "candles.EURUSD.1m" }
{ "action": "unsubscribe", "channel": "candles.EURUSD.1m" }
```

Timeframe channel mapping:

```text
M1 -> 1m
M5 -> 5m
M15 -> 15m
M30 -> 30m
H1 -> 1h
H4 -> 4h
D1 -> 1d
W1 -> 1w
MN -> 1M
```

Accepted candle envelopes:

```text
{ channel: "candles.EURUSD.1m", data: { open, high, low, close, time } }
{ channel: "candles.EURUSD.1m", candle: { ... } }
{ data: [...] }
{ candles: [...] }
{ items: [...] }
{ bars: [...] }
{ result: { candles/items/bars/data: [...] } }
single flat candle object with symbol/timeframe/open/high/low/close/time
```

Required candle data:

```text
time or timestamp in Unix seconds preferred
open/high/low/close finite numbers
volume optional
symbol and timeframe should be explicit in payload or channel
server_time/serverTime/server_timestamp/updated_at/received_at can be used as updateTime ordering signal
```

Critical candle ordering rule:

```text
Candle bucket time is the candle start time.
Backend server_time/updateTime is the event ordering time.
Do not make server_time replace the bucket time.
Delayed same-bucket backend snapshots must not rewind newer quote-fed candles.
```

## Chart Candle Data Flow Tree

```text
ChartScreen opens or symbol/timeframe changes
|-- useLiveCandles(symbol, timeframe, active)
|   |-- normalize symbol/timeframe
|   |-- subscribe liveCandleStream
|   |-- prefetch REST history
|   |-- hydrate persisted candle cache
|   |-- subscribe quote socket to symbol
|   |-- optionally subscribe candle websocket if env-gated server mode is enabled
|
|-- liveCandleStream.ensureEntry()
|   |-- seed from memory cache or persisted cache if available
|   |-- runLoadHistory()
|   |-- GET /candles or /market-data/candles
|   |-- split closed history and current candle
|   |-- store historyLastTime cutoff
|
|-- quote feed tick arrives
|   |-- quoteTickNormalizer validates tick
|   |-- tickProcessor emits quote listeners
|   |-- liveCandleStream.extendActiveCandlesFromQuoteTick()
|   |-- applyQuoteTickExtensionToCandleMap()
|   |-- rAF/16ms flush
|   |-- sanitizeCandlesForChart()
|   |-- ChartScreen renderer update
|
|-- server candle arrives if enabled
|   |-- CandlesWebSocketService extracts symbol/timeframe context
|   |-- normalizeLiveCandle()
|   |-- applyLiveCandleToCandleMap()
|   |-- updateTime/server_time used for ordering
|   |-- stale server candle after newer quote tick is ignored unless closing snapshot semantics allow merge
```

Renderer behavior:

```text
Native:
|-- ChartScreen.native.tsx sends data to ChartWebViewHtml.ts
|-- WebView exposes updateChartData and updateTick
|-- active candle updates should use incremental updateTick when possible
|-- full reload is for first load, symbol/timeframe change, bridge recovery, or history correction

Web:
|-- ChartScreen.web.tsx uses lightweight-charts directly
|-- active candle updates use series.update()
```

Backend debugging for chart:

```text
If chart history is missing:
|-- test broker-domain GET /candles/{symbol}?timeframe=M1&limit=...
|-- check auth/JWT and broker service domain
|-- check response contains parseable candles array
|-- check candle timestamps are seconds and OHLC are finite

If current candle does not move:
|-- check /ws/feed/status for broker_id
|-- check /ws/feed emits fresh bid/ask ticks for the chart symbol
|-- check quote tick timestamp and symbol names
|-- do not assume candle websocket is the source unless env-gated server mode is enabled

If candle jumps/rewinds:
|-- inspect server_time/updateTime vs bucket time
|-- verify backend candle snapshots do not arrive with older event time than already processed quote ticks
|-- verify OHLC ranges are valid and bid/ask basis is consistent
```

## Trade And Order Flow Tree

```text
OrderTicketScreen or Chart trade buttons
|-- user taps buy/sell/pending
|-- frontend builds payload with login, symbol, side, volume, optional SL/TP/trailing/comment/magic
|-- ordersApi.placeMarketOrder() or placePendingOrder()
|-- apiClient injects Bearer token
|-- POST /orders or POST /orders/pending at broker /api/v2
|-- frontend optimistically refreshes positions/account/orders
|-- backend should broadcast realtime lifecycle on /ws/v2 channels
|-- positionsState updates open positions
|-- live quote listeners recompute row/header P/L
```

Order response compatibility:

```text
Frontend can unwrap { data }, { result }, arrays, or flat object.
Frontend maps ticket -> position_ticket/order_ticket when missing.
Frontend maps price_open -> price for market orders.
Frontend maps price -> price_open for pending orders when needed.
```

Trade rejection behavior:

```text
Frontend treats graceful { status: "rejected"|"failed"|"error" } inside 200 as an error.
For 429, frontend reads Retry-After.
For market-data/symbol misses, frontend retries symbol candidates and may call /instruments.
For auth/ownership/rate-limit/SLTP errors, frontend does not keep retrying symbol aliases.
```

Backend should return useful errors:

```json
{
  "message": "No quote available for XAUUSD",
  "code": "NO_MARKET_DATA",
  "detail": "symbol has no fresh bid/ask"
}
```

Avoid opaque HTML or empty 500 bodies. Mobile surfaces message/detail/error to users and logs.

## State And Cache Tree

```text
SecureStore:
|-- broker_id
|-- server_url
|-- logo_url
|-- access_token
|-- refresh_token
|-- expires_at
|-- feed_broker_token
|-- broker_feed_token
|-- feed_token
|-- ws_feed_token

Zustand user preferences:
|-- login state
|-- accountDetails with credentials
|-- brokerId, brokerServerUrl, brokerLogoUrl
|-- chartSymbol, chartTimeframe
|-- trade volume/preferences
|-- isDemoAccount
|-- chart colors/settings/drawing preferences

Zustand trading state:
|-- quotes by symbol
|-- account snapshot

Zustand live account state:
|-- live balance/equity/margin/free margin/margin level/floating flags

Zustand positions state:
|-- open positions
|-- optimistic close state
|-- refreshPositions(login)
|-- applyPositionsSnapshot()
|-- upsertPosition()

TanStack Query:
|-- accounts, account detail, account summary
|-- positions, position history
|-- orders, account orders
|-- deals/account deals
|-- watchlist, alerts
|-- instruments, market status
|-- broker servers/config
|-- public demo status/groups
|-- calculators, health, exposure, transactions, equity history

Candle caches:
|-- in-memory candleMemoryCache
|-- persistedCandleCache
|-- LiveCandleStreamManager entries keyed by symbol/timeframe
```

## Backend Issue Ownership Decision Tree

Use this section when a user reports a mobile problem.

```text
Login fails
|-- Does /broker/servers include the selected broker with valid HTTPS service domain?
|-- Does {brokerRoot}/health return 2xx?
|-- Does POST {brokerRoot}/api/v2/auth/login accept {username,password,broker_id}?
|-- Does response include access token and account_login?
|-- If backend returns correct payload and mobile still fails, inspect app/login.tsx and authSession.ts.

Broker list wrong or broker unavailable
|-- Check PUBLIC_BROKER_DIRECTORY_BASE_URL /broker/servers.
|-- Verify domain fields are not raw IPs and are not shared backend origins.
|-- Verify enabled brokers include services domain fields.

Quotes frozen or bid/ask missing
|-- Check GET {brokerRoot}/ws/feed/status?broker_id=...
|-- Check direct WSS /ws/feed with broker_id and token if required.
|-- Verify ticks include symbol,bid,ask,timestamp.
|-- Verify ask >= bid.
|-- Verify tick symbols match frontend normalized symbols.
|-- If /ws/feed is healthy, inspect quoteTickNormalizer/tickProcessor/useLiveQuotes.

Quote volume or spread wrong
|-- Verify feed sends volume or tick_volume as non-negative.
|-- Verify digits/point/tickSize are sent either in tick or /instruments.
|-- Frontend computes spread points from rounded bid/ask and digits.

Chart history blank
|-- Check broker /api/v2 /candles and /market-data/candles routes.
|-- Response must include array under accepted wrappers.
|-- Candle time must be parseable, preferably Unix seconds.
|-- OHLC must be finite and coherent: high >= max(open, close), low <= min(open, close).
|-- Check auth and broker domain before frontend renderer.

Live active candle slow or not moving
|-- Check quote feed first, not candle websocket.
|-- Default active candle source is quote ticks.
|-- If server candle source is intentionally enabled, verify env flags and /ws/v2 candle channel contract.

Candle rewinds or drifts from web terminal
|-- Check server_time/updateTime ordering.
|-- Bucket time must remain bucket start.
|-- Backend should not send delayed forming snapshots that overwrite newer quote-fed state without correct updateTime.
|-- Verify bid basis vs ask/mid basis; mobile defaults candle price basis to bid unless configured.

Order placed but positions/account not updating live
|-- First confirm POST /orders returned success.
|-- Then check /ws/v2 fan-out on positions.LOGIN, account.LOGIN or metrics.LOGIN, orders.LOGIN, deals.LOGIN, history.LOGIN.
|-- If REST refresh shows correct positions but websocket does not broadcast, backend realtime fan-out is the likely issue.

Order rejected unexpectedly
|-- Check backend error body message/detail/error.
|-- Check market data freshness for symbol.
|-- Check backend resolves broker from JWT because frontend omits broker_id from order body.
|-- Check symbol aliases and /instruments catalog.
|-- Check Retry-After for rate limits.

Close/modify does not update
|-- Check POST /positions/{ticket}/close or /modify status and body.
|-- Check positions and account realtime broadcast.
|-- Check GET /positions/{login} and /positions/{login}/history after action.

History empty
|-- Check /positions/{login}/history.
|-- Check /account/deals and /deals/{login} with from/to Unix seconds.
|-- Check /orders/{login} and /account/orders.
|-- If backend returns wrapped data, verify wrapper is one frontend accepts.

Watchlist reorder fails
|-- Mobile PUT /watchlist sends array [{symbol, sort_order}], not {symbols:[...]}.
|-- Backend should accept this array contract.

Alerts fail
|-- Mobile accepts 200 or 201 from POST /alerts.
|-- GET /alerts should include triggered boolean where possible.

Calculators wrong
|-- Margin calculation is server-authoritative.
|-- Profit calculation is server-authoritative.
|-- Do not rely on mobile-side approximations for final values.

Settings static pages look wrong
|-- Many settings pages are local/static and not backend-driven.
|-- Backend should only be blamed if route uses an API listed above.
```

## Backend Contract Acceptance Checklist

Before telling the frontend agent to fix anything, confirm these backend items:

```text
Broker routing:
|-- /broker/servers returns valid HTTPS broker service domains.
|-- broker service domain serves /health, /api/v2, /ws/feed, /ws/v2.
|-- raw IPs are not required by mobile.

Auth:
|-- /auth/login works at broker /api/v2.
|-- login response includes access token, refresh token, expiry, account login, broker id.
|-- /auth/refresh works with refresh_token and optional broker_id.
|-- refresh can return feed token and frontend will persist it.

Feed:
|-- /ws/feed/status exists at broker root and accepts broker_id query.
|-- /ws/feed accepts broker_id query and token query when feed_auth_required=true.
|-- quote ticks are fresh, frequent, and include bid/ask/time/symbol.
|-- socket close code 1008/4001 should mean auth/token rejection.

Candles:
|-- /candles/{symbol} or /market-data/candles/{symbol} returns valid history for logged-in broker sessions.
|-- from/to pagination uses Unix seconds.
|-- OHLC is valid and not silently repaired server-side into impossible ranges.
|-- optional server candle stream uses candles.SYMBOL.tfToken channel and correct updateTime semantics.

Trade:
|-- /orders and /orders/pending resolve broker from JWT.
|-- responses include ticket/price_open/status fields or compatible aliases.
|-- errors include message/detail/error.
|-- rate limit errors include Retry-After.
|-- order/position/account/deal lifecycle websocket fan-out works after mutations.

Accounts/history:
|-- /accounts returns flat account array.
|-- /account/{login} returns account metrics.
|-- /positions/{login} and /positions/{login}/history return arrays or accepted wrappers.
|-- /account/deals and /deals/{login} support from/to seconds.

Market metadata:
|-- /instruments and /instruments/{symbol} include symbol precision, point/tick size, contract size where available.
|-- /market/status/{symbol} returns session open/close data where available.
```

## What Backend Should Return To The Frontend/User

When backend changes are complete, return a concise but evidence-heavy report:

```text
1. Symptom tested:
   - screen:
   - broker_id:
   - account login:
   - symbol/timeframe if relevant:

2. Endpoints/websockets tested:
   - exact path, redacted query, method
   - status code
   - sample redacted response keys

3. Backend finding:
   - backend bug fixed, or backend contract already correct

4. Backend files changed:
   - file paths
   - what changed

5. Payload contract now satisfied:
   - fields present
   - timing/freshness
   - websocket channel names

6. Verification:
   - commands run
   - direct API/WS probes
   - before/after evidence

7. If frontend still needs work:
   - exact frontend file/function
   - exact mismatch proven by backend evidence
```

## Useful Frontend Verification Commands

Run from `C:\Users\ADMIN\RTX-5Mobile-App\rtx5-app` when validating frontend compatibility after backend changes.

```powershell
npm run typecheck
```

Focused contract tests:

```powershell
npx --yes tsx --test src/api/auth.test.ts src/api/brokerRouting.test.ts src/api/feedAuth.test.ts src/api/feedStatus.test.ts
npx --yes tsx --test src/api/ws/quoteTickNormalizer.test.ts src/api/ws/quotesSocket/tickProcessor.test.ts src/api/ws/quotesSocket/flushPipeline.test.ts
npx --yes tsx --test src/domain/candles/api/candles.test.ts src/domain/candles/ws/candlesSocket.test.ts src/domain/candles/series/liveCandleAggregator.test.ts
npx --yes tsx --test src/api/orders/placeMarketOrder.test.ts src/api/orders/pendingOrderPayload.test.ts src/api/accounts.test.ts src/api/instruments.test.ts
npm run test:stability
```

Use the full stability suite for broad candle/chart changes. Use typecheck for every frontend patch.

## Source File Index For Backend Agents

Every file below has a plain comment after `=>`. Read the comment first to understand what the file does, then open the file when you need exact code.

```text
Expo route files:
|-- rtx5-app/app/_layout.tsx => app root; sets providers, Sentry, splash timing, session bootstrap, and broker realtime startup/cleanup.
|-- rtx5-app/app/index.tsx => launch redirect; sends the user to the Quotes tab.
|-- rtx5-app/app/login.tsx => login route; authenticates selected broker/account and stores session state.
|-- rtx5-app/app/register.tsx => demo/new account route; creates demo accounts and handles legal acceptance.
|-- rtx5-app/app/contest-login.tsx => legacy route redirect; sends old contest-login entry to the normal login screen.
|-- rtx5-app/app/(tabs)/_layout.tsx => main tab shell; mounts Quotes, Chart, Trade, History, Settings and shared drawers/action sheets.
|-- rtx5-app/app/(tabs)/quotes.tsx => Quotes tab route; opens the market watch/quotes list screen.
|-- rtx5-app/app/(tabs)/chart.tsx => Chart tab route; opens the chart workspace.
|-- rtx5-app/app/(tabs)/trade.tsx => Trade tab route; opens positions and trade actions.
|-- rtx5-app/app/(tabs)/history.tsx => History tab route; opens orders, positions, and deals history.
|-- rtx5-app/app/(tabs)/settings.tsx => Settings tab route; opens account/app settings.
|-- rtx5-app/app/quotes/details.tsx => symbol detail route; shows one symbol's quote, metadata, actions, and chart/trade navigation.
|-- rtx5-app/app/quotes/market-statistics.tsx => market statistics route; shows quote/watchlist market summary data.
|-- rtx5-app/app/chart/alerts.tsx => chart alerts route; opens price alert list/create/edit UI.
|-- rtx5-app/app/chart/analytics.tsx => chart analytics route; opens chart analytics/insight UI.
|-- rtx5-app/app/chart/calculator.tsx => chart calculator route; opens trading calculator inputs and results.
|-- rtx5-app/app/chart/colors.tsx => chart colors route; edits chart candle/background/grid color settings.
|-- rtx5-app/app/chart/indicator-config.tsx => indicator config route; edits selected indicator parameters.
|-- rtx5-app/app/chart/indicator-level.tsx => indicator level route; edits indicator level values.
|-- rtx5-app/app/chart/indicator-line-style.tsx => indicator line style route; edits indicator line style/color/width.
|-- rtx5-app/app/chart/indicators.tsx => indicators route; lists and enables chart indicators.
|-- rtx5-app/app/chart/menu-order.tsx => chart menu order route; changes chart menu/tool ordering.
|-- rtx5-app/app/chart/objects.tsx => chart objects route; lists drawings/objects and lets user show, hide, lock, or remove them.
|-- rtx5-app/app/chart/open-order-mode.tsx => open order mode route; changes how chart trading order placement behaves.
|-- rtx5-app/app/chart/preferences.tsx => chart preferences route; edits chart display and interaction preferences.
|-- rtx5-app/app/chart/price-source.tsx => price source route; selects bid/ask/mid style source for chart display.
|-- rtx5-app/app/chart/schema-colors.tsx => chart schema route; reuses settings chart properties screen for colors/schema.
|-- rtx5-app/app/chart/settings.tsx => chart settings route; opens chart settings menu screen.
|-- rtx5-app/app/chart/specification.tsx => chart specification route; shows symbol specs and trading sessions.
|-- rtx5-app/app/trade/order-ticket.tsx => order ticket route; places market/pending orders.
|-- rtx5-app/app/trade/modify-position.tsx => modify position route; changes SL/TP or position settings.
|-- rtx5-app/app/trade/close-position.tsx => close position route; confirms and closes a single position.
|-- rtx5-app/app/trade/close-by.tsx => close-by route; closes opposite positions against each other.
|-- rtx5-app/app/trade/bulk.tsx => bulk trade route; handles close all/profit/loss style bulk actions.
|-- rtx5-app/app/trade/one-click-terms.tsx => one-click terms route; stores local acceptance before one-click trading.
|-- rtx5-app/app/history/filter.tsx => history filter route; edits date range/filter or opens net profit/loss detail mode.
|-- rtx5-app/app/settings/accounts.tsx => accounts route; manages active and saved trading accounts.
|-- rtx5-app/app/settings/brokers.tsx => brokers route; shows broker directory/search/select UI.
|-- rtx5-app/app/settings/broker-detail.tsx => broker detail route; shows selected broker details/server data.
|-- rtx5-app/app/settings/charts.tsx => settings chart route; opens chart property editor from Settings.
|-- rtx5-app/app/settings/economic-calendar.tsx => economic calendar route; opens mock/preview calendar event UI.
|-- rtx5-app/app/settings/interface.tsx => interface route; edits theme/language/interface preferences.
|-- rtx5-app/app/settings/journal.tsx => journal route; lazy-loads trade journal screen.
|-- rtx5-app/app/settings/help.tsx => help route; lazy-loads FAQ/help screen.
|-- rtx5-app/app/settings/user-guide.tsx => user guide route; opens static app user manual.
|-- rtx5-app/app/settings/legal.tsx => legal route; opens terms/privacy document screen based on route params.
|-- rtx5-app/app/settings/about.tsx => about route; shows app version, links, rating, and support actions.
|-- rtx5-app/app/settings/contact-developer.tsx => contact route; opens mailto-based developer/support request form.
|-- rtx5-app/app/settings/account-deletion.tsx => account deletion route; opens mailto-based account deletion request form.

Routing/auth/session:
|-- rtx5-app/src/api/brokerRouting.ts => resolves selected broker service/auth/feed base URLs and keeps broker-domain routing correct.
|-- rtx5-app/src/api/brokerApi.ts => broker-aware API wrapper used after login so requests go to the selected broker service.
|-- rtx5-app/src/api/apiClient.ts => shared fetch/client helper for REST calls, auth headers, timeout, errors, and base URL handling.
|-- rtx5-app/src/api/auth.ts => low-level auth API functions and login/session payload handling.
|-- rtx5-app/src/api/authSession.ts => high-level sign-in/session helper used by login/account switching flows.
|-- rtx5-app/src/state/brokerSessionStorage.ts => secure token/session persistence and cleanup for broker auth.

Broker/demo registration:
|-- rtx5-app/src/api/broker.ts => broker directory/config API types and calls.
|-- rtx5-app/src/api/publicDemo.ts => demo account registration API client.
|-- rtx5-app/app/login.tsx => login screen route where broker/account credentials are submitted.
|-- rtx5-app/app/register.tsx => registration screen route where demo account data is submitted.
|-- rtx5-app/src/features/settings/BrokersScreen/BrokersScreen.tsx => broker list UI with search, selection, and directory data.
|-- rtx5-app/src/features/settings/BrokerDetailScreen.tsx => broker detail UI showing selected broker/server/domain information.

Quote/feed:
|-- rtx5-app/src/api/feedAuth.ts => resolves feed token/broker id and feed websocket auth settings.
|-- rtx5-app/src/api/feedStatus.ts => calls feed status/snapshot endpoints for quote-feed diagnostics and fallback data.
|-- rtx5-app/src/api/ws/quotesSocket/QuotesWebSocketService.ts => quote feed websocket service; connects, subscribes, reconnects, and emits ticks.
|-- rtx5-app/src/api/ws/quotesSocket/tickProcessor.ts => normalizes and filters raw quote websocket ticks before state updates.
|-- rtx5-app/src/api/ws/quoteTickNormalizer.ts => converts many backend tick aliases into the frontend quote tick shape.
|-- rtx5-app/src/query/websocket.ts => hooks for live market data and symbol quote subscriptions.
|-- rtx5-app/src/features/quotes/useLiveQuotes.ts => quote snapshot store/hook; merges websocket ticks, REST snapshots, stale logic, and volume cache.
|-- rtx5-app/src/features/quotes/QuotesScreen.tsx => main market watch UI with quote rows, search, add/delete, action sheets, and list/table modes.
|-- rtx5-app/src/features/quotes/addSymbolCatalog.ts => groups market symbols for the add-symbol/search UI.
|-- rtx5-app/src/features/quotes/quoteWatchlistDefaults.ts => default watchlist and symbol mapping helpers for broker feed variants.
|-- rtx5-app/src/features/quotes/liveQuoteSnapshot.ts => quote snapshot type/helpers used by live quote UI.
|-- rtx5-app/src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx => symbol details UI with live quote metrics, metadata, buy/sell/chart actions.
|-- rtx5-app/src/features/quotes/SymbolDetailsScreen/instrumentMeta.ts => static fallback metadata, flags, icons, and trading sessions for symbol details.
|-- rtx5-app/src/features/quotes/MarketStatisticsScreen/MarketStatisticsScreen.tsx => market statistics UI derived from available symbols/watchlist/quotes.

Chart/candles:
|-- rtx5-app/src/domain/candles/api/candles.ts => REST candle-history client and candle payload normalization boundary.
|-- rtx5-app/src/domain/candles/api/candleHistoryQuery.ts => TanStack/history query wrapper for loading chart candles.
|-- rtx5-app/src/domain/candles/ws/candlesSocketProtocol.ts => server candle websocket message types and parser rules.
|-- rtx5-app/src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts => optional candle websocket service for server-pushed candle updates.
|-- rtx5-app/src/domain/candles/ws/liveCandlesEnginePolicy.ts => decides whether chart uses tick-built candles or server candle stream.
|-- rtx5-app/src/domain/candles/hooks/useLiveCandles.ts => main hook that provides historical plus live candles to chart screens.
|-- rtx5-app/src/domain/candles/stream/liveCandleStream/manager.ts => manages live candle stream subscriptions, history fetch, and updates.
|-- rtx5-app/src/domain/candles/series/liveCandleAggregator.ts => turns quote ticks/candle updates into valid live OHLC candles.
|-- rtx5-app/src/features/chart/ChartScreen.native.tsx => native mobile chart screen with WebView bridge, toolbar, drawing, indicators, and trade controls.
|-- rtx5-app/src/features/chart/ChartScreen.web.tsx => web chart screen implementation for browser/dev web runtime.
|-- rtx5-app/src/features/chart/rendering/ChartWebViewHtml.ts => HTML/JS chart renderer loaded inside WebView; validates and renders candle payloads.
|-- rtx5-app/src/features/chart/preview/LiveChartPreview.native.tsx => native mini chart preview used inside related UI surfaces.
|-- rtx5-app/src/features/chart/preview/LiveChartPreview.web.tsx => web mini chart preview with live candles/quotes.
|-- rtx5-app/src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx => buy/sell buttons on chart using live quote and order handlers.
|-- rtx5-app/src/features/chart/components/ChartTradeControls.tsx => chart trade control UI such as lot/order controls.
|-- rtx5-app/src/features/chart/components/ChartDrawingToolsFeature.tsx => drawing toolbar/sidebar/action sheet UI for chart objects.
|-- rtx5-app/src/features/chart/components/ChartToolbarMenuFeature.tsx => chart toolbar menu actions and navigation to chart settings screens.
|-- rtx5-app/src/features/chart/components/ChartTimeframePickerSheet.tsx => timeframe picker sheet and grouped timeframe actions.
|-- rtx5-app/src/features/chart/drawingPersistence.ts => saves/loads chart drawings locally and shapes drawing persistence data.
|-- rtx5-app/src/features/chart/drawingTools/index.ts => list of drawing tools and commands shown in the chart UI.
|-- rtx5-app/src/features/chart/drawingTools/runtime/index.ts => runtime JS definitions for enhanced drawing tools inside chart renderer.
|-- rtx5-app/src/features/chart/indicatorRegistry/registry.ts => indicator catalog/definitions used by indicators and config screens.
|-- rtx5-app/src/features/chart/IndicatorsScreen.tsx => indicator list UI where users enable/select indicators.
|-- rtx5-app/src/features/chart/IndicatorConfigScreen/IndicatorConfigScreen.tsx => indicator settings UI for selected indicator parameters.
|-- rtx5-app/src/features/chart/ObjectsScreen/ObjectsScreen.tsx => chart objects/drawings list UI with visibility/lock/delete actions.
|-- rtx5-app/src/features/chart/PriceAlertsScreen/PriceAlertsScreen.tsx => price alert screen with alert rows and create/edit/delete actions.
|-- rtx5-app/src/features/chart/ChartSpecificationScreen.tsx => symbol specification screen showing metadata/trading sessions.
|-- rtx5-app/src/features/chart/ChartTradingCalculatorScreen.tsx => trading calculator screen for margin/profit-style calculations.
|-- rtx5-app/src/features/chart/ChartPreferencesScreen.tsx => local chart display/behavior preference screen.
|-- rtx5-app/src/features/chart/ChartColorsScreen.tsx => chart color editor for candles, grid, background, text, and related styles.
|-- rtx5-app/src/features/chart/ChartPriceSourceScreen.tsx => price-source selection UI for bid/ask/mid/last-style chart behavior.
|-- rtx5-app/src/features/chart/ChartOpenOrderModeScreen.tsx => chart open-order interaction mode settings.
|-- rtx5-app/src/features/chart/ChartMenuOrderScreen.tsx => chart menu order customization screen.
|-- rtx5-app/src/features/chart/ChartAnalyticsScreen.tsx => chart analytics/summary surface; mostly frontend display unless backend analytics is added.
|-- rtx5-app/src/features/chart/chartOverlays/index.ts => builds chart overlays for orders, positions, markers, and chart annotations.

Trade/account realtime:
|-- rtx5-app/src/api/ws/accountSocket.ts => account/trade realtime websocket service for account metrics, positions, and order lifecycle updates.
|-- rtx5-app/src/api/ws/accountSocket.helpers.ts => helper functions for account websocket message parsing and URL/session handling.
|-- rtx5-app/src/api/ws/BrokerRealtimeService.ts => orchestrates broker realtime connection and reconnect behavior after login/foreground.
|-- rtx5-app/src/api/orders/index.ts => order API facade used by order ticket and trade actions.
|-- rtx5-app/src/api/orders/placeMarketOrder.ts => builds and sends market order payloads.
|-- rtx5-app/src/api/orders/placePendingOrder.ts => builds and sends pending order payloads.
|-- rtx5-app/src/api/positions/index.ts => positions API facade for open positions, modify, close, close-by, and history-related calls.
|-- rtx5-app/src/state/positionsState.ts => local realtime positions store used by Trade, Chart, and History flows.
|-- rtx5-app/src/state/liveAccountState.ts => local realtime account metrics store for balance/equity/margin/login.
|-- rtx5-app/src/features/trade/TradeScreen/TradeScreen.tsx => main Trade tab UI with open positions, action sheets, summary, and refresh fallback.
|-- rtx5-app/src/features/trade/TradeScreen/SummaryHeader.tsx => trade account summary header with live P/L, balance, equity, margin, and bulk action entry.
|-- rtx5-app/src/features/trade/OrderTicketScreen.tsx => order entry screen for market/pending orders, volume, SL/TP, calculator, and confirmation.
|-- rtx5-app/src/features/trade/ModifyPositionScreen.tsx => modify selected position screen for SL/TP changes and live quote/candle context.
|-- rtx5-app/src/features/trade/ClosePositionScreen.tsx => single-position close confirmation and execution screen.
|-- rtx5-app/src/features/trade/CloseByScreen.tsx => close-by screen for matching opposite positions.
|-- rtx5-app/src/features/trade/BulkOperationScreen.tsx => bulk close operations screen for all/profit/loss/matching groups.
|-- rtx5-app/src/features/trade/OneClickTermsScreen.tsx => local one-click trading terms acceptance screen.
|-- rtx5-app/src/features/trade/tradeFlow.ts => helpers for position filtering, selected position lookup, and bulk mode behavior.
|-- rtx5-app/src/features/trade/closePositionFlow.ts => helpers for close-position UI and payload decision logic.
|-- rtx5-app/src/features/trade/livePositionMetrics.ts => computes live P/L and display metrics from positions and quotes.
|-- rtx5-app/src/features/trade/OrderTickExecutionGraph/OrderTickExecutionGraph.tsx => small live tick graph used by order execution UI.

History:
|-- rtx5-app/src/api/deals.ts => deals/history API client and deal DTO types.
|-- rtx5-app/src/api/positions/closedHistory.ts => closed-position history API client.
|-- rtx5-app/src/api/transactions.ts => transaction/history API client where available.
|-- rtx5-app/src/api/equityHistory.ts => equity history API client where available.
|-- rtx5-app/src/features/history/HistoryScreen.tsx => main History tab UI with Orders, Positions, Deals, summaries, sorting, and filters.
|-- rtx5-app/src/features/history/HistoryFilterScreen/HistoryFilterScreen.tsx => history date/filter editor screen.
|-- rtx5-app/src/features/history/HistoryNetProfitLossScreen.tsx => net profit/loss detail screen using history/deal data.
|-- rtx5-app/src/features/history/derivedClosedPositions.ts => rebuilds closed positions from deals when backend position history is delayed.
|-- rtx5-app/src/features/history/historyDateRange.ts => resolves saved/custom history date ranges.
|-- rtx5-app/src/features/history/historyMoney.ts => calculates deposits, closed P/L, swap, commission, fees, and totals.

Watchlist/alerts/calculators/instruments:
|-- rtx5-app/src/api/watchlist.ts => watchlist REST client for read/add/remove/replace symbols.
|-- rtx5-app/src/api/alerts.ts => price alert REST client for alert list and mutations.
|-- rtx5-app/src/api/calculators.ts => trading calculator REST client and payload/result types.
|-- rtx5-app/src/api/instruments.ts => instrument metadata API client for digits, sessions, contract details, and specs.
|-- rtx5-app/src/api/marketStatus.ts => market status API client for market/session open/closed state.
|-- rtx5-app/src/query/watchlist.ts => TanStack Query hooks for watchlist APIs.
|-- rtx5-app/src/query/alerts.ts => TanStack Query hooks for alert APIs.
|-- rtx5-app/src/query/calculators.ts => TanStack Query hooks for calculator APIs.
|-- rtx5-app/src/query/instruments.ts => TanStack Query hooks for instrument metadata APIs.
|-- rtx5-app/src/query/marketStatus.ts => TanStack Query hooks for market status APIs.

Settings/backend-connected:
|-- rtx5-app/src/features/settings/SettingsScreen/SettingsScreen.tsx => main Settings tab UI with account card, metrics, theme/language/help/journal/logout rows.
|-- rtx5-app/src/features/settings/AccountsScreen.tsx => accounts management UI with active account, saved accounts, switch/delete, broker logos, and reconnect.
|-- rtx5-app/src/features/settings/BrokersScreen/BrokersScreen.tsx => broker directory UI with broker search/filter/list selection.
|-- rtx5-app/src/features/settings/BrokersScreen/brokerData.ts => broker list helper/fallback data shape for broker screen.
|-- rtx5-app/src/features/settings/BrokerDetailScreen.tsx => selected broker detail UI and server/domain information.
|-- rtx5-app/src/features/settings/accountConnectionStatus.ts => helper that decides when a real authenticated account session exists.
|-- rtx5-app/src/features/settings/ChangePasswordSheet.tsx => account password-change sheet UI; verify backend wiring before assuming it is live.

Settings/local/static/future-backend candidates:
|-- rtx5-app/src/features/settings/ChartPropertiesScreen.tsx => settings screen for chart colors/properties; stores choices locally in user preferences.
|-- rtx5-app/src/features/settings/InterfaceScreen.tsx => interface settings screen for theme/language/display preferences.
|-- rtx5-app/src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx => economic calendar UI with date/impact/currency filters and mock-data refresh behavior.
|-- rtx5-app/src/dev/mock/calendarData.ts => mock economic calendar event data provider used by EconomicCalendarScreen.
|-- rtx5-app/src/features/settings/JournalScreen/JournalScreen.tsx => trade journal UI with journal list, filters, analytics/review tabs, notes, and pull refresh.
|-- rtx5-app/src/features/settings/JournalScreen/liveJournal.ts => hook that builds journal entries from live/open positions, position history, deals, and local journal state.
|-- rtx5-app/src/features/settings/JournalScreen/liveJournalMapper.ts => converts positions/deals into journal entry objects for the journal UI.
|-- rtx5-app/src/features/settings/JournalScreen/journalRetention.ts => keeps journal entries within the intended local-day retention window.
|-- rtx5-app/src/features/settings/HelpScreen.tsx => FAQ/help UI with search and category filters.
|-- rtx5-app/src/features/settings/helpViewModel.ts => static FAQ items, help categories, summary helpers, and support mailto builder.
|-- rtx5-app/src/features/settings/UserGuideScreen.tsx => static RTX5 app user guide/manual screen.
|-- rtx5-app/src/features/settings/userGuideViewModel.ts => guide manual sections, bullets, intro copy, footer disclaimer, and summary helper.
|-- rtx5-app/src/features/settings/LegalDocumentScreen.tsx => displays Terms or Privacy Policy based on route parameter.
|-- rtx5-app/src/features/settings/legalDocumentViewModel.ts => static Terms and Privacy Policy document content and updated labels.
|-- rtx5-app/src/features/settings/AboutScreen.tsx => about screen with app version, store/rating links, user guide/legal/contact/account deletion actions.
|-- rtx5-app/src/features/settings/aboutViewModel.ts => about-screen actions, contact categories, store link builder, contact mailto, and account deletion message builder.

Startup/providers:
|-- rtx5-app/app/_layout.tsx => root provider/bootstrap file for app startup and session-aware realtime behavior.
|-- rtx5-app/app/(tabs)/_layout.tsx => tab provider/shell file for always-warm primary tabs and shared UI overlays.
|-- rtx5-app/src/state/providers/AppProviders.tsx => central React providers including TanStack Query and app state providers.
|-- rtx5-app/src/services/bootstrapApp.ts => post-login app bootstrap service that refreshes important account/trading data.
```

## Final Instruction To Backend Agent

If a future prompt says "backend should fix mobile issue", do not guess. Use this tree to locate the screen and data path, then prove the exact contract boundary. The correct outcome is either:

```text
Backend fix required:
|-- include failing backend endpoint/channel proof
|-- patch backend
|-- provide redacted before/after payloads
|-- state which mobile screen should now work

or

Backend contract is OK:
|-- include backend proof
|-- point to exact frontend file/function that mismatches the proven backend contract
|-- do not invent a backend workaround for a frontend-only renderer/state bug
```
