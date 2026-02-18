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

