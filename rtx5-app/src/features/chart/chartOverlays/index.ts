/**
 * Public entry for chart overlay payload assembly. Split for the 500-line
 * ceiling into:
 *   - `types.ts`              — shared types & constants
 *   - `symbolUtils.ts`        — broker-symbol normalization + precision helpers
 *   - `orderHelpers.ts`       — order/status normalize + label formatters
 *   - `markerCollections.ts`  — pattern / signal / HMR / closed-position markers
 *   - `lineBuilders.ts`       — pending-order / alert / stop-out lines
 *   - `buildPayload.ts`       — top-level `buildChartOverlayPayload`
 */
export {
  CHART_LINE_STYLE,
  type ChartOverlayPriceLine,
  type ChartOverlayMarkerPosition,
  type ChartOverlayMarkerShape,
  type ChartOverlayMarker,
  type ChartOverlayPayload,
  type ChartOverlayCandle,
} from './types';
export { normalizeChartOverlaySymbol } from './symbolUtils';
export { buildChartOverlayPayload } from './buildPayload';
