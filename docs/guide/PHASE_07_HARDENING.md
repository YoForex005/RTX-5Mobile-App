# Phase 07 - Hardening and Reliability

## Objective
Harden RTX5 for secure, observable, and stable beta operation.

## In Scope
- Security control implementation checks.
- Feature flags and kill switches.
- Sentry and Crashlytics release instrumentation.
- Performance and memory profiling.
- Accessibility and resilience checks.

## Out of Scope
- New feature development.

## Exact Implementation Tasks
1. Validate secure token storage and biometric app lock.
2. Enable cert pinning for production API domains.
3. Enforce root/jailbreak detection policy.
4. Add redaction middleware for logs and analytics.
5. Connect release tags to Sentry and Crashlytics.
6. Add remote kill-switch consumption in UI guards.
7. Run performance profiling under high quote throughput.
8. Fix all release-blocking defects.

## API Dependencies
- Feature flags endpoint (`/v1/flags/mobile`).
- Error tracking DSN/config values.

## Acceptance Checklist
- [ ] Security checklist in `SECURITY.md` passes.
- [ ] Observability events are visible in staging tools.
- [ ] Critical journeys meet performance thresholds.
- [ ] No open P0/P1 issues remain.

## Test Checklist
- [ ] Unit: redaction and kill-switch guards.
- [ ] Integration: app lock lifecycle.
- [ ] E2E: degraded network and reconnect scenarios.

## Exit Criteria
- Release readiness sign-off from security, QA, and mobile leads.

## Progress Notes
- 2026-04-21: Reduced perceived tap latency across shared navigation surfaces and main feature screens by shortening global sheet/drawer animations, removing extra press delay on shared `Pressable` controls, and firing lightweight chart/history/settings/quotes menu-open actions on touch-down instead of waiting on slower release-driven flows.
- 2026-04-21: Added a dev-only floating interaction diagnostics overlay plus per-action latency tracing for shared UI surfaces and key chart/trade/history/settings/quotes controls so on-device testing can show tap-to-next-frame timing directly inside the app.
- 2026-04-21: Removed the tab-route unmount pattern that was recreating Quotes/Chart/Trade on every bottom-tab switch, restored frozen mounted tabs for faster navigation, and made chart/history live polling focus-aware so hidden screens stop background churn without interrupting the core websocket/store pipeline.
- 2026-04-21: Upgraded the dev interaction diagnostics into a persisted UI performance log with route-change timing, bottom-tab press timing, JS-thread stall detection, and quote websocket gap samples so future freeze investigations can separate UI blocking from feed pauses using on-device history instead of one-off console logs.
- 2026-04-21: Removed the per-interaction AsyncStorage write path from the UI diagnostics recorder and switched it to buffered snapshot persistence, so tracing remains available without adding new tap delay or interfering with live candles while the app is busy.
- 2026-04-21: Hardened local dev refresh on Android by adding a USB/localhost dev-client startup script with `adb reverse`, and by making the native chart WebViews remount on dev bundle-source changes so chart HTML/JS edits reflect on device without requiring repeated manual full reloads.
- 2026-04-21: Follow-up interaction analysis found the same touch-down state-switching pattern outside the chart trade sheet. `History` top controls and `Order Ticket` form toggles now trigger on touch release instead of touch down, matching the chart-sheet tab fix and removing another source of blocked-feeling taps inside scrollable forms.
- 2026-04-21: Standardized Android transparent overlay modals onto a shared `overFullScreen` presentation contract with translucent system bars and hardware acceleration across chart, quotes, settings, brokers, and QR flows so overlay screens no longer visually shrink/compress the app window when they open.
- 2026-04-21: Restored focus-managed lifecycles for the heavy live tabs (`Quotes`, `Chart`, `Trade`) and disabled tab blur-freezing, so once a tab loses focus its expensive live subtree unmounts and stops background quote/chart work instead of gradually blocking taps and navigation across the whole app.
- 2026-04-21: Moved the main app-header, settings search, quotes header, and native chart toolbar controls back to standard touch-release handling (`onPress`) instead of touch-down firing, because the touch-down path was making taps feel swallowed or inconsistent while live UI work was active.
- 2026-04-21: Hardened the shared option-flow by waiting for `ActionSheet` dismissal to settle before running the selected action, and removed the 60s live-candle engine retention window so hidden chart routes stop websocket merge work immediately instead of continuing to load the JS thread in the background.
- 2026-04-21: Removed the always-mounted dev interaction diagnostics overlay/runtime from the root app path, disabled diagnostics by default, and stopped option actions from waiting on `InteractionManager`, because those dev-only diagnostics hooks and interaction waits were interfering with normal option selection and app navigation under load.
- 2026-04-21: Removed the legacy sticky Quotes watchlist subscription path on pull-to-refresh and explicitly clear sticky quote subscriptions on Quotes mount/unmount, so the whole watchlist no longer stays globally subscribed after leaving Quotes and no longer floods every screen with unnecessary websocket quote updates.

