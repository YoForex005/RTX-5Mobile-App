# RTX5 Project Agent Guide

## Mission
Build RTX5 as a frontend-only React Native trading app with near parity to the reference screenshots, shipping on iOS and Android (phone and tablet) with staged OTA reliability.

## Non-Negotiables
1. Frontend only. Do not rebuild backend services.
2. Stack is locked:
- Expo Dev Client
- TypeScript strict mode
- TanStack Query + Zustand
- React Hook Form + Zod
- Custom Skia chart engine
3. No third-party logo visible in chart UI.
4. OTA uses EAS Update channels (`preview`, `staging`, `production`) with runtime gating.
5. No hardcoded runtime behavior in feature code. Use API data, typed config, or persisted user state.
6. User personalization must be stored locally on the device and must remain unchanged until the user changes it.

## Source of Truth Files
- Master roadmap: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/MASTER_GUIDE.md`
- Architecture: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/ARCHITECTURE.md`
- API contracts: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/API_CONTRACTS.md`
- Security gates: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/SECURITY.md`
- OTA release gates: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/OTA_RELEASE.md`
- Test gates: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/TEST_STRATEGY.md`
- Screenshot parity map: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/UI_PARITY_SCREEN_MAP.md`
- Phase index: `/Users/epic1st/Documents/rtx5 mobileapp/docs/guide/README.md`

## Folder Conventions
- `app/` for route definitions.
- `src/features/*` for module-specific screens and hooks.
- `src/ui/*` for shared design-system components.
- `src/api/generated` for OpenAPI-generated code only.
- `src/api/ws` for WebSocket transport.
- `src/domain` for mapping DTOs to UI models.
- `src/state` for Zustand slices.
- `src/query` for TanStack Query config/keys.

## Coding Standards
- Use strict TypeScript types everywhere.
- No direct REST/WS calls inside UI components.
- UI components stay presentational; feature hooks handle state and side effects.
- Keep numeric formatting centralized and reusable.
- Prefer deterministic logic and pure utilities for core calculations.
- Do not hardcode user-specific values in screen files (symbols, timeframe, language, chart state, filters, toggles).
- Persist user state with versioned local storage (`rtx5-app/src/state/userPreferences.ts`) and preserve backward compatibility.

## Local Persistence Requirements (Device-Only)
- Persist and restore quote watchlist membership and view mode.
- Persist and restore current chart symbol and timeframe.
- Persist and restore chart objects/drawings and chart visibility/lock settings.
- Persist and restore one-click trading terms acceptance state.
- Persist and restore history filter range and related user-selected filters.
- Persistence scope is user device only; do not reset unless user explicitly resets or changes values.

## PR Checklist (Required)
- [ ] References one phase file and one acceptance checklist item.
- [ ] Updates affected docs if behavior or contracts changed.
- [ ] Includes unit/integration/E2E evidence for changed flows.
- [ ] Preserves no-logo chart rule.
- [ ] Does not introduce backend implementation changes.
- [ ] Removes hardcoded runtime values from UI flows.
- [ ] Includes migration-safe updates for persisted local state when schema changes.

## Handoff Protocol
1. Update current progress in the relevant `PHASE_*.md` file.
2. Mark completed acceptance and test checklist items.
3. Note any unresolved blockers with owner and next action.
4. If contracts changed, update `API_CONTRACTS.md` and mention migration impact.
5. If release-sensitive, update `OTA_RELEASE.md` and `SECURITY.md` status notes.

## Do Not Rules
- Do not add or modify backend service logic in this repo.
- Do not bypass security or OTA release gates for convenience.
- Do not merge parity-impacting UI changes without updating the screenshot map.
