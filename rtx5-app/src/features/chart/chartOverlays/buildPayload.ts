/**
 * Top-level overlay-payload builder. Composes per-feature builders into a
 * single deduplicated, sorted `ChartOverlayPayload` for the chart's WebView
 * to render.
 */
import type { PriceAlert } from '../../../api/alerts';
import type { LoginOrder } from '../../../api/orders';
import type { ClosedPosition } from '../../../api/positions';
import type { PositionItem } from '../../../dev/mock/tradingData';
import type { ChartColorsConfig } from '../../../state/userPreferences';
import type { ChartShowOnChartSettings } from '../chartShowOnChart';
import {
  buildPendingOrderLines,
  buildPotentialStopOutLine,
  buildPriceAlertLines,
} from './lineBuilders';
import {
  addUniqueMarker,
  addUniquePriceLine,
  buildClosedPositionMarkers,
  buildHmrMarkers,
  buildPatternMarkers,
  buildTradingSignalMarkers,
  sanitizeCandles,
} from './markerCollections';
import { formatPositionVolumeLabel, formatTpSlOverlayLabel } from './orderHelpers';
import { normalizeChartOverlaySymbol } from './symbolUtils';
import {
  CHART_LINE_STYLE,
  CHART_OVERLAY_DEBUG,
  EMPTY_CHART_OVERLAY_PAYLOAD,
  EMPTY_OVERLAY_CANDLES,
  type ChartOverlayCandle,
  type ChartOverlayLiveAccount,
  type ChartOverlayMarker,
  type ChartOverlayPayload,
  type ChartOverlayPriceLine,
} from './types';

type BuildChartOverlayPayloadInput = {
  chartSymbol: string;
  candles: ChartOverlayCandle[];
  positions: PositionItem[];
  orders?: LoginOrder[];
  closedPositions?: ClosedPosition[];
  alerts?: PriceAlert[];
  colors: ChartColorsConfig;
  sellColor: string;
  liveAccount?: ChartOverlayLiveAccount | null;
  showOnChart: ChartShowOnChartSettings;
  activeTool?: string;
};

const hasEnabledOverlayFeatures = (showOnChart: ChartShowOnChartSettings): boolean =>
  showOnChart.openPositions ||
  showOnChart.tpSlStopLimit ||
  showOnChart.closedPositions ||
  showOnChart.tradingSignals ||
  showOnChart.hmrPeriods ||
  showOnChart.priceAlerts ||
  showOnChart.potentialStopOut;

// MT5-parity: open-position lines show a colored box on the right price scale
// (axisLabelVisible: true) so the trader can see the entry price at a glance.
// Non-positional lines (alerts, pattern overlays, stop-out warning) keep the
// box suppressed so they don't crowd the axis.
//
// Multiple positions at the same price level (within 100 ppm — covers
// float-noise from tick-by-tick drift between trades opened in quick
// succession) collapse to a SINGLE line + single right-axis box so the chart
// never renders a stack of identical labels on top of each other. Exact
// equality alone wouldn't catch this because back-to-back fills capture
// slightly different mid-prices even though they all display the same.
const LINES_KEEPING_RIGHT_AXIS_LABEL = /^(open-|order-entry-|order-sl-|order-tp-|sl-|tp-)/;
const SAME_PRICE_LEVEL_RELATIVE_TOLERANCE = 1e-4;
const isSamePriceLevel = (a: number, b: number): boolean => {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= scale * SAME_PRICE_LEVEL_RELATIVE_TOLERANCE;
};
const applyRightAxisLabelVisibility = (lines: ChartOverlayPriceLine[]): ChartOverlayPriceLine[] => {
  // MT5-parity: position / order / SL / TP lines get axisLabelVisible: false
  // here so the WebView's custom DOM renderer (in ChartWebViewHtml.ts) can
  // draw an OUTLINED box (white background, colored border + text) instead
  // of the lightweight-charts default FILLED box. Only live bid/ask labels
  // stay filled. Same-price duplicates collapse to one line so the chart
  // doesn't render overlapping horizontal lines at the same level.
  const labeledLevels: number[] = [];
  const out: ChartOverlayPriceLine[] = [];
  for (const line of lines) {
    const eligible = LINES_KEEPING_RIGHT_AXIS_LABEL.test(line.id);
    if (!eligible) {
      out.push({ ...line, axisLabelVisible: false });
      continue;
    }
    if (labeledLevels.some((existing) => isSamePriceLevel(existing, line.price))) {
      continue;
    }
    labeledLevels.push(line.price);
    out.push({ ...line, axisLabelVisible: false });
  }
  return out;
};

export const buildChartOverlayPayload = ({
  chartSymbol,
  candles,
  positions,
  orders = [],
  closedPositions = [],
  alerts = [],
  colors,
  sellColor,
  liveAccount,
  showOnChart,
  activeTool,
}: BuildChartOverlayPayloadInput): ChartOverlayPayload => {
  const needsPatternMarkers = activeTool === 'patterns';
  if (!hasEnabledOverlayFeatures(showOnChart) && !needsPatternMarkers) {
    return EMPTY_CHART_OVERLAY_PAYLOAD;
  }

  const needsCandleData =
    needsPatternMarkers ||
    showOnChart.closedPositions ||
    showOnChart.tradingSignals ||
    showOnChart.hmrPeriods ||
    showOnChart.potentialStopOut;
  const sanitizedCandles = needsCandleData ? sanitizeCandles(candles) : EMPTY_OVERLAY_CANDLES;
  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  const needsPositionData =
    showOnChart.openPositions ||
    showOnChart.tpSlStopLimit ||
    showOnChart.potentialStopOut;
  const symbolPositions = needsPositionData
    ? positions.filter((position) => normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol)
    : [];
  const symbolOrders = showOnChart.tpSlStopLimit
    ? orders.filter((order) => normalizeChartOverlaySymbol(order.symbol) === normalizedChartSymbol)
    : [];

  if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_OVERLAY_DEBUG) {
    console.log(
      `[ChartOverlay] chart=${chartSymbol} (norm=${normalizedChartSymbol}) | ` +
      `totalPositions=${positions.length} matchingPositions=${symbolPositions.length} | ` +
      `totalOrders=${orders.length} matchingOrders=${symbolOrders.length} | ` +
      `flags: open=${showOnChart.openPositions} tpsl=${showOnChart.tpSlStopLimit} closed=${showOnChart.closedPositions} ` +
      `signals=${showOnChart.tradingSignals} hmr=${showOnChart.hmrPeriods} alerts=${showOnChart.priceAlerts} stopOut=${showOnChart.potentialStopOut}`,
    );
    if (symbolPositions.length > 0) {
      symbolPositions.forEach((p) =>
        console.log(
          `  pos id=${p.id} sym=${p.symbol} ${p.side} vol=${p.volume} open=${p.openPrice} sl=${p.sl} tp=${p.tp}`,
        ),
      );
    }
  }

  const priceLines = new Map<string, ChartOverlayPriceLine>();
  const markers = new Map<string, ChartOverlayMarker>();

  if (symbolPositions.length > 0) {
    symbolPositions.forEach((position) => {
      const parsedPrice = Number(position.openPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;

      if (showOnChart.openPositions) {
        addUniquePriceLine(priceLines, {
          id: `open-${position.id}`,
          price: parsedPrice,
          color: position.side === 'buy' ? colors.tradeOpen || '#2962FF' : sellColor,
          lineWidth: 1,
          lineStyle: CHART_LINE_STYLE.Dashed,
          axisLabelVisible: true,
          title: `${position.side === 'buy' ? 'BUY' : 'SELL'} ${formatPositionVolumeLabel(Number(position.volume))}`,
        });
      }

      if (showOnChart.tpSlStopLimit) {
        const tpValue = Number(position.tp);
        if (Number.isFinite(tpValue) && tpValue > 0) {
          addUniquePriceLine(priceLines, {
            id: `tp-${position.id}`,
            price: tpValue,
            color: colors.tradeTpSl || '#089981',
            lineWidth: 1,
            lineStyle: CHART_LINE_STYLE.Dashed,
            axisLabelVisible: false,
            title: formatTpSlOverlayLabel('tp', position.symbol, parsedPrice, tpValue, Number(position.volume)),
          });
        }

        const slValue = Number(position.sl);
        if (Number.isFinite(slValue) && slValue > 0) {
          addUniquePriceLine(priceLines, {
            id: `sl-${position.id}`,
            price: slValue,
            color: colors.tradeStopOut || '#F23645',
            lineWidth: 1,
            lineStyle: CHART_LINE_STYLE.Dashed,
            axisLabelVisible: false,
            title: formatTpSlOverlayLabel('sl', position.symbol, parsedPrice, slValue, Number(position.volume)),
          });
        }
      }
    });
  }

  if (showOnChart.tpSlStopLimit) {
    buildPendingOrderLines(symbolOrders, colors, sellColor).forEach((line) => addUniquePriceLine(priceLines, line));
  }

  if (showOnChart.potentialStopOut) {
    const stopOutLine = buildPotentialStopOutLine(symbolPositions, sanitizedCandles, liveAccount, colors);
    if (stopOutLine) addUniquePriceLine(priceLines, stopOutLine);
  }

  if (showOnChart.priceAlerts) {
    buildPriceAlertLines(alerts, chartSymbol).forEach((line) => addUniquePriceLine(priceLines, line));
  }

  if (showOnChart.closedPositions) {
    buildClosedPositionMarkers(sanitizedCandles, closedPositions, chartSymbol).forEach((marker) =>
      addUniqueMarker(markers, marker),
    );
  }

  if (showOnChart.tradingSignals) {
    buildTradingSignalMarkers(sanitizedCandles, colors).forEach((marker) => addUniqueMarker(markers, marker));
  }

  if (showOnChart.hmrPeriods) {
    buildHmrMarkers(sanitizedCandles).forEach((marker) => addUniqueMarker(markers, marker));
  }

  if (needsPatternMarkers) {
    buildPatternMarkers(sanitizedCandles, activeTool).forEach((marker) => addUniqueMarker(markers, marker));
  }

  const result = {
    priceLines: applyRightAxisLabelVisibility(
      Array.from(priceLines.values()).sort((left, right) => left.price - right.price),
    ),
    markers: Array.from(markers.values()).sort((left, right) => left.time - right.time),
  };

  if (result.priceLines.length === 0 && result.markers.length === 0) {
    return EMPTY_CHART_OVERLAY_PAYLOAD;
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_OVERLAY_DEBUG) {
    console.log(
      `[ChartOverlay] OUTPUT: ${result.priceLines.length} priceLines, ${result.markers.length} markers`,
    );
    result.priceLines.forEach((l) => console.log(`  line id=${l.id} price=${l.price} title="${l.title}"`));
  }

  return result;
};
