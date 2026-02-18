# Phase 05 - History Module

## Objective
Deliver history parity for Positions, Orders, and Deals with sorting, filtering, and report entry.

## In Scope
- Segmented history tabs.
- Date range filtering (today, week, month, custom).
- Sorting menu fields and direction.
- Footer totals and summary values.
- Trade report entry action.

## Out of Scope
- Full report generation backend logic.

## Exact Implementation Tasks
1. Build segmented tab container for history kinds.
2. Implement history filters screen and date presets.
3. Implement sorting sheet and apply logic.
4. Render list rows per history kind with proper fields.
5. Implement totals footer and empty states.
6. Add report action entry and navigation hook.

## API Dependencies
- `GET /v1/history`
- Optional report metadata endpoint.

## Acceptance Checklist
- [ ] Positions/Orders/Deals views match screenshot behavior.
- [ ] Filter and sort state persist across tab switches.
- [ ] Totals footer values update correctly with filters.

## Test Checklist
- [ ] Unit: history filter and sort mapping.
- [ ] Integration: tab switch with active filters.
- [ ] E2E: open filters, choose range, verify resulting rows.

## Exit Criteria
- History flows are parity-complete and validated in E2E suite.

