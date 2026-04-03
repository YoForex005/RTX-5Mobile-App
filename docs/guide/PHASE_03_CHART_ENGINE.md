# Phase 03 - Chart Engine

## Objective
Build a custom Skia chart engine that replicates chart interactions and tools with no third-party chart logo.

## In Scope
- Candle and line chart rendering.
- Timeframe selector and quick timeframe bar.
- Pan/zoom/crosshair interactions.
- Objects manager and drawing tools.
- Indicator and settings action sheet entry points.

## Out of Scope
- Strategy automation.
- Broker-side advanced order logic.

## Exact Implementation Tasks
1. Build chart core renderer with Skia and gesture handling.
2. Add axes, grid, crosshair, and current price marker.
3. Add timeframe quick bar and modal picker.
4. Add chart action sheet with Indicators, Objects, Settings.
5. Implement objects manager screen (add, lock all, hide all).
6. Add persistence of selected timeframe and visible overlays.
7. Add chart performance instrumentation and FPS logging.

## API Dependencies
- `GET /v1/candles`
- WebSocket incremental candle/tick updates.
- Symbol metadata for price precision.

## Acceptance Checklist
- [ ] No third-party logo is rendered on chart surface.
- [ ] Timeframe switching and object tools match parity behavior.
- [x] Interaction remains responsive under active updates.

## Progress Notes
- Chart bootstrap now hydrates candle history from `/api/v2/candles/GBPUSD` with `limit=500` before live websocket merging.
- Candle normalization was added to prevent broken bars caused by unsorted timestamps, duplicate periods, or invalid OHLC bounds.
- Live candle recovery was hardened so a validated realtime candle can advance the active series even when REST history reconnects behind the current bucket; bounded flat gap-fill handles short drift, and stale-history handoff now rebuilds the missing timestamp chain into a canonical full sync instead of appending a detached live candle.
- Stale REST history is now blocked from seeding the renderer cache; when the history tail is too old, the service waits for a safe live/resync handoff instead of drawing a detached candle gap.
- Fullscreen chart mode now presents the drawing tools as a vertical left-side overlay rail on both native and web, with draw-manager rebinds after chart reload and clear actions so tools remain usable through fullscreen transitions.
- Chart settings now expose a tabbed properties screen with MT-style Show and Colors controls backed by persisted display/color preferences; the live chart consumes those settings for grid, volume, ticker/OHLC overlay, quick-trade controls, bid/ask price lines, trade overlays, and themeable chart colors.
- Chart properties layout was refreshed for mobile with a prominent live-preview hero, realtime bid/ask/spread chips, and tighter responsive spacing in the Common/Show/Colors controls to support parity-oriented settings work.
- Chart color edits now propagate through one persisted preference path so manual hex edits and picker changes update the properties preview and the live chart renderer consistently, including hollow-body chart colors.

## Test Checklist
- [ ] Unit: candle transforms and viewport math.
- [ ] Integration: timeframe and object state persistence.
- [ ] E2E: open chart actions, open objects manager, switch timeframe.

## Exit Criteria
- Chart parity is accepted by product review with performance budget met.

