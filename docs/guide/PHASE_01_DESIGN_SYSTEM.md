# Phase 01 - Design System and App Shell

## Objective
Implement the dark themed design system and responsive shell to support near parity UI across phone and tablet.

## In Scope
- Theme tokens: colors, typography, spacing, radius, elevation.
- Reusable primitives: text, buttons, rows, cards, list items, badges.
- Bottom tab shell parity.
- Adaptive layout framework for tablet split panes.

## Out of Scope
- Feature-specific business behavior.
- Live data integrations.

## Exact Implementation Tasks
1. Define design tokens in a central theme module.
2. Build reusable primitives and wrappers.
3. Create shared price and PnL display components.
4. Implement tab icons, selected states, and safe-area handling.
5. Add tablet breakpoint utilities and split-pane scaffolds.
6. Build global sheet/modal presentation style matching reference app.

## API Dependencies
- None.

## Acceptance Checklist
- [ ] Dark theme visually matches target baseline.
- [ ] Shared components are used by all feature modules.
- [ ] Tablet and phone render without layout breakage.
- [ ] Modal/action sheet style parity achieved.

## Test Checklist
- [ ] Snapshot tests for primitives.
- [ ] Visual regression checks for shell screens.
- [ ] Manual orientation test on tablet.

## Exit Criteria
- UI foundation is complete and feature teams only consume shared components.

