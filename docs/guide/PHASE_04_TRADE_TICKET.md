# Phase 04 - Trade and Order Ticket

## Objective
Replicate Trade tab and order ticket flows, including bulk operations and one-click trading consent.

## In Scope
- Trade header summary metrics.
- Positions list with live PnL updates.
- Position context actions (close, modify, trade, chart, bulk ops).
- Bulk operation menus.
- One-click terms modal and acceptance state.
- Market and pending order ticket variants.

## Out of Scope
- Backend matching engine behavior.
- Risk engine policies beyond UI validation.

## Exact Implementation Tasks
1. Build account summary card linked to `AccountSnapshot`.
2. Build positions list with grouped and sortable rows.
3. Implement long-press action sheet on positions.
4. Implement bulk operations sheet variants.
5. Implement one-click terms modal and persisted consent.
6. Build order ticket form states for all supported order types.
7. Implement SL/TP, expiration, fill policy, and lot-step controls.
8. Wire submission flow and user-facing error/success states.

## API Dependencies
- `GET /v1/account/snapshot`
- `GET /v1/positions`
- `POST /v1/orders`
- WebSocket events: `position.update`, `order.status`, `account.snapshot`

## Acceptance Checklist
- [ ] Trade tab metrics and list parity complete.
- [ ] All order type screens from parity map are implemented.
- [ ] One-click consent gate blocks order shortcut until accepted.
- [ ] Bulk operations menu options are displayed per scope.

## Test Checklist
- [ ] Unit: order ticket validation rules.
- [ ] Integration: trade summary updates on position events.
- [ ] E2E: open position menu, perform action, submit pending order.

## Exit Criteria
- Trading UI flows are functionally complete with no blocking defects.

## Progress Notes
- 2026-03-24: Fixed trade-flow account resolution so open positions, close, and modify actions no longer depend on `liveAccountState.login` being hydrated before the Trade tab loads.
- 2026-03-24: Hardened the order/position flow to refresh using the resolved MT5 login after buy, sell, close, and modify actions, matching the live `/api/v2/orders` and `/api/v2/positions/{login}` contract.
- 2026-04-09: Normalized legacy mock-era symbol aliases such as `BTCUSDm` and `XAUUSDm` to the live backend symbols (`BTCUSD`, `XAUUSD`) across order submission, instrument metadata, and symbol-driven quote/detail flows after live verification showed the trading engine only accepts the unsuffixed symbols for active YoForex accounts.
- 2026-04-09: Centralized trader-tab error classification so order placement, close, close-by, modify, one-click shortcuts, and Trade-tab position refresh now surface whether the failure came from frontend state, API contract/routing, session expiry, rate limiting, or backend/server availability instead of falling back to generic execution errors.
- 2026-04-11: Fixed the V2 account websocket path so the app subscribes with the resolved MT5 login on `metrics.{LOGIN}` and `positions.{LOGIN}`, even when booting from legacy persisted sessions whose `accountDetails.id` still held a non-MT5 user id.
- 2026-04-11: Stopped the Trade header and position rows from overriding authoritative websocket account metrics and live position P/L with local quote-based recalculations; the UI now renders the server-provided balance, equity, margin, free margin, margin level, floating P/L, and per-position net P/L.
- 2026-04-11: Hardened websocket position upserts so partial `positions.{LOGIN}` payloads merge into the existing local position instead of wiping symbol, volume, open price, or net P/L fields when the backend only pushes ticket-level profit updates.
- 2026-04-17: Added a persisted shared `tradeVolume` preference and made the order-ticket and chart quick-trade lot controls directly editable while still respecting instrument min/max/step metadata.
- 2026-04-17: Replaced the bulk-operation header with a constrained fit-to-width title so long bulk mode labels stay centered on smaller phones instead of overflowing.
- 2026-04-20: Moved the bulk-operation detail screen off the shared stack header and onto a fixed safe-area header with balanced left/right slots so the dynamic bulk titles stay centered reliably instead of drifting back after later navigation-shell changes.
- 2026-04-20: Reworked the modify-position SL/TP flow into an MT5-style transparent bottom sheet with a draggable handle and continuous adjustable height, keeping the Trade screen visible behind it while allowing users to pull the sheet up or down and leave it at the height they want.
- 2026-04-20: Switched the modify-position sheet drag from JS-thread height resizing to a fixed-height transform-driven gesture path, which keeps the SL/TP bottom sheet movement noticeably smoother during pull-up and pull-down interactions.
- 2026-04-20: The Trade tab now shows the active account currency alongside floating P/L in the summary header and alongside each position row's right-side P/L value, so the live profit/loss numbers no longer appear as bare amounts without currency context.
- 2026-04-20: The Trade tab's floating P/L header now renders on one line with the label on the left and the live value on the right, and both that header value and each position row's right-side P/L now clamp to exactly two digits after the decimal while still showing the active account currency.
- 2026-04-21: Fixed the Trade tab floating P/L header so, once the current account's open-position snapshot has synced, it derives the aggregate floating value from the locally authoritative open-position list; closing a trade or close-by now updates the header instantly instead of waiting for the next account-metrics websocket tick.
- 2026-04-21: Rebased Trade-tab live P/L rendering on the quote-tick stream so the floating header and each position row's top-right P/L now move immediately with the same bid/ask ticks that update the row's open-to-current price arrow; closing a trade still removes its contribution instantly because the aggregate is recalculated from the remaining open positions.
- 2026-04-21: Hardened the Trade summary live-metrics path to subscribe to both `metrics.{LOGIN}` and `account.{LOGIN}`, unwrap wrapped account metric payloads, and derive equity/free margin/margin level from the freshest floating P/L when quote ticks arrive ahead of the account-summary stream.
- 2026-04-21: Reduced Trade-row quote latency by preconnecting the quotes websocket right after login and moving quote-cache flushes off the timer queue onto a microtask, which removes the extra frontend delay between receiving a bid/ask tick and repainting the open-to-current arrow price.
- 2026-04-21: Isolated the Trade summary's all-symbol quote subscription inside the header component so the parent Trade screen no longer reruns on every quote tick; only the header aggregate and the affected position rows now repaint during live price movement.
- 2026-04-21: Switched each Trade row from the shared quote-store selector path to a direct single-symbol quote-tick listener, so the open-to-current arrow price and per-row floating P/L update immediately from the websocket tick without waiting on the global quote-cache projection step.
- 2026-04-21: Reworked the Trade-row single-symbol quote hook again after regression analysis showed the direct per-row websocket tick-listener path could accumulate too much JS work across many open positions and eventually stall live updates/navigation. Rows now use a store-backed single-symbol selector while keeping the faster websocket preconnect/microtask quote path intact.

