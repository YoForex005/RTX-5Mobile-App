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
- 2026-04-22: The shared sidebar drawer now unmounts completely whenever it is closed instead of leaving an always-mounted full-screen overlay in the tree. That removes one more hidden touch-interception risk from the root shell and prevents closed drawer layers from interfering with taps on other screens.
- 2026-04-22: Reduced shared option-tap latency by replacing the `ActionSheet`'s fixed 110ms post-dismiss wait with a short next-frame handoff. Option selections still wait for the sheet to leave the screen, but they now fire after roughly 1-2 frames instead of a hard tenth-of-a-second delay.
- 2026-04-22: Stabilized the shared searchable `ActionSheet` keyboard layout so the chart symbol picker no longer shrinks its own sheet height when the search keyboard opens. The sheet now keeps a stable height, uses live window dimensions, lifts above the Android keyboard instead of compressing and drifting during symbol search, keeps symbol-row taps active while the search field is focused, and lets the chart symbol picker commit the selected symbol immediately on tap instead of waiting for sheet dismissal first.
- 2026-04-22: Finalized the native chart header and top-toolbar touch path by keeping the larger touch targets and direct route/menu opens, but moving the main toolbar actions back to standard touch-release handling (`onPress`). The earlier touch-down activation path was firing chart toolbar flows before the gesture had actually completed, which made taps feel swallowed and could start chart-menu/screen transitions while the finger was still down.
- 2026-04-22: Removed the `History` account-summary chevron affordance while preserving tap-to-toggle on the summary label itself, so the panel still shows and hides but no longer renders the extra up/down icon in that header row.
- 2026-04-22: Kept the chart tab route mounted while `/chart/*` child screens are pushed from the toolbar and chart menus, and those destination pages continue to use normal full-screen stack screens instead of overlay/modal presentation. The problematic path was the chart route tearing itself down on blur during the same navigation transition, which could briefly collapse the live chart shell and produce the "shrunk app" effect when opening chart toolbar destinations such as `Objects` or `Settings`.
- 2026-04-22: Reworked the chart viewport's bottom-right horizontal 3-dot menu (`Show/Hide Volume Bar`, `Reset`) off the shared bottom-sheet `ActionSheet` path and onto an anchored in-chart popover with touch-down opening. That removes the extra release-delay feel on the 3-dot button and avoids the visual “chart shrinks under a sheet” effect for this small contextual menu.
- 2026-04-22: Removed the native chart top-toolbar chart-type picker from the shared bottom-sheet `ActionSheet` path and replaced it with an in-chart popover under the toolbar icon. That avoids the same Android visual "chart shrinks under a sheet" effect for the small `Candlestick / Hollow / OHLC / Line` menu while keeping chart-type changes local to the chart surface.
- 2026-04-22: Restored a true manual lot-entry path for the compact native chart trade footer. The regression was caused by reusing the same `footerLotEditorFocused` state for both keyboard editing and the floating quick-lot picker, so tapping the lot value opened the lower preset panel instead of focusing a numeric input. Manual lot taps now open a real `TextInput` with keyboard focus, the quick-lot panel is separated into its own state, and the lot controls use standard touch-release handling instead of touch-down activation.
- 2026-04-22: Fixed the remaining native chart manual-lot keyboard layout issue where the shared bottom tab bar still stayed visible above the Android keyboard. The root cause was the tabs shell explicitly setting `tabBarHideOnKeyboard: false`, which kept the navbar mounted during inline chart text entry. The tabs shell now follows the standard mobile keyboard behavior (`tabBarHideOnKeyboard: true`) and the chart also drives an explicit inline-input visibility flag so manual lot edit/comment focus hides the tab bar immediately even before keyboard animations settle.
- 2026-04-22: Corrected the native chart floating `SELL / lot / BUY` dock offset during manual lot editing. The dock had been reusing the generic chart `keyboardInset`, which intentionally subtracts `safeInsets.bottom` for scroll/content padding but leaves an absolutely positioned footer too low on gesture-nav devices. The footer dock now uses its own bottom offset that restores the bottom safe inset, and it applies an additional keyboard clearance so the inline lot-edit row sits visibly higher above the keyboard instead of sinking into the dark keyboard/nav strip.
- 2026-04-22: Rebalanced the compact native chart `SELL / lot / BUY` footer row without widening the center lot control. The side `SELL` / `BUY` buttons keep their original footprint, while the compact lot control now matches their row height instead of sitting slightly taller.
- 2026-04-22: Removed the remaining bottom-gap artifact under the compact chart lot control. The issue was the center lot slot using a fixed-height child while the row height was actually being set by the slightly taller `SELL` / `BUY` buttons. The lot slot now stretches with the row and lets its inner control fill that height, without changing the side button dimensions.
- 2026-04-22: Hardened the shared quotes websocket lifecycle so transport failures no longer surface as screen-visible console errors. The underlying bug was an idle/no-demand quotes socket being allowed to connect with zero active symbols, plus a max-retry path that ended with `console.error('[Quotes WS] Max reconnect attempts reached.')`. The quotes feed now only connects when there is real symbol demand, intentional closes no longer re-enter auto-reconnect, offline states pause retries until network returns, and retry-budget exhaustion falls back to a cooldown-based background retry instead of a red-box style error path.
- 2026-04-22: Removed the native chart top-toolbar pencil flow from the shared bottom-sheet `ActionSheet` path and routed it back through the existing in-chart drawing-tools rail. That avoids the same Android “chart shrinks under a sheet” presentation issue already seen on other small chart menus and keeps drawing-tool selection inside the chart viewport instead of opening a full bottom sheet.
- 2026-04-22: Hardened native chart fullscreen layout so the chart no longer relies on a guessed `screenHeight` min-height during fullscreen transitions. The lower blank flash was coming from the fullscreen shell forcing `minHeight` from `Dimensions` while the tab bar and safe-area chrome were still changing, which could leave the WebView viewport one layout step behind and briefly expose an empty lower band. Fullscreen now stays host-height-driven and also forces a follow-up viewport resize sync across the next layout frames after every fullscreen toggle.
- 2026-04-22: Fixed the remaining fullscreen-exit right-side blank strip in the native chart WebView bridge. The actual issue was the inner HTML `#chart` element being pinned to explicit pixel width/height during resize recovery; if one fullscreen-exit resize was late or missed, the DOM stayed stuck at the narrower fullscreen width and left a white band on the right after exit. The chart bridge now keeps `#chart` host-fill (`100%` width/height) during init, resize, and recovery, while still resizing the chart instance with measured pixels, so fullscreen exit no longer depends on one perfectly timed DOM width write.

