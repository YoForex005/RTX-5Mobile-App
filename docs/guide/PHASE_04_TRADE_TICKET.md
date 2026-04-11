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

