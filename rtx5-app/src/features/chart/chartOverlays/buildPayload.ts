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
import {
  calculateOpenPositionLivePnl,
  formatOpenPositionOverlayLabel,
  formatTpSlOverlayLabel,
} from './orderHelpers';
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
  liveBid?: number | null;
  liveAsk?: number | null;
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

// MT5-parity: open-position lines stay as individual dotted lines so the
// trader can see each entry, even when entries are clustered.
// Overlay axis labels stay disabled here because the WebView draws custom
// outlined price boxes for position/order levels.
//
// Multiple positions at the same price level (within 100 ppm — covers
// float-noise from tick-by-tick drift between trades opened in quick
// succession) remain visible, producing the dense clustered look MT5 shows.
// The WebView still handles right-axis boxes separately.
const applyRightAxisLabelVisibility = (lines: ChartOverlayPriceLine[]): ChartOverlayPriceLine[] => {
  return lines.map((line) => ({ ...line, axisLabelVisible: false }));
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
  liveBid,
  liveAsk,
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
        const livePnl =
          calculateOpenPositionLivePnl({
            symbol: position.symbol,
            side: position.side,
            volume: Number(position.volume),
            openPrice: parsedPrice,
            bid: liveBid,
            ask: liveAsk,
            swap: Number(position.swap),
            commission: Number(position.commission),
          }) ?? Number(position.pnl);

        addUniquePriceLine(priceLines, {
          id: `open-${position.id}`,
          price: parsedPrice,
          color: position.side === 'buy' ? colors.tradeOpen || '#2962FF' : sellColor,
          lineWidth: 1,
          lineStyle: CHART_LINE_STYLE.Dotted,
          axisLabelVisible: true,
          title: formatOpenPositionOverlayLabel(position.side, Number(position.volume), livePnl),
          labelPlacement: 'line',
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
