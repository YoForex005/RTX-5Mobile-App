/**
 * Top-level overlay-payload builder. Composes per-feature builders into a
 * single deduplicated, sorted `ChartOverlayPayload` for the chart's WebView
 * to render.
 *
 * The chart only draws the trader's own open positions, gated by side: the
 * "Show buy trade" / "Show sell trade" preferences. A shown position is drawn
 * with its open line, while the MT5-style "SL/TP levels" preference controls
 * its protective Stop Loss / Take Profit lines. Pattern markers from the
 * drawing tools are independent of these preferences and still render when
 * active.
 */
import type { PriceAlert } from '../../../api/alerts';
import type { LoginOrder } from '../../../api/orders';
import type { ClosedPosition } from '../../../api/positions';
import type { PositionItem } from '../../../dev/mock/tradingData';
import type { ChartColorsConfig } from '../../../state/userPreferences';
import type { ChartShowOnChartSettings } from '../chartShowOnChart';
import {
  addUniqueMarker,
  addUniquePriceLine,
  buildPatternMarkers,
  sanitizeCandles,
} from './markerCollections';
import {
  calculateOpenPositionLivePnl,
  formatOpenPositionOverlayLabel,
  formatPositionVolumeLabel,
  formatSignedUsdOverlayLabel,
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

const hasEnabledTradeSides = (showOnChart: ChartShowOnChartSettings): boolean =>
  showOnChart.buyTrade || showOnChart.sellTrade;

const isTradeSideEnabled = (
  side: 'buy' | 'sell',
  showOnChart: ChartShowOnChartSettings,
): boolean => (side === 'buy' ? showOnChart.buyTrade : showOnChart.sellTrade);

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

const resolveOpenPositionPnlColor = (
  pnl: number,
  side: 'buy' | 'sell',
  colors: ChartColorsConfig,
  sellColor: string,
): string => {
  if (pnl > 0) return colors.tradeTpSl || '#089981';
  if (pnl < 0) return colors.tradeStopOut || sellColor || '#DC2626';
  return side === 'buy' ? colors.tradeOpen || '#2962FF' : sellColor;
};

const resolveOpenPositionSideColor = (
  side: 'buy' | 'sell',
  colors: ChartColorsConfig,
  sellColor: string,
): string => (side === 'buy' ? colors.tradeOpen || '#2962FF' : sellColor || '#DC2626');

export const buildChartOverlayPayload = ({
  chartSymbol,
  candles,
  positions,
  colors,
  sellColor,
  liveBid,
  liveAsk,
  showOnChart,
  activeTool,
}: BuildChartOverlayPayloadInput): ChartOverlayPayload => {
  const needsPatternMarkers = activeTool === 'patterns';
  if (!hasEnabledTradeSides(showOnChart) && !needsPatternMarkers) {
    return EMPTY_CHART_OVERLAY_PAYLOAD;
  }

  // Only the pattern drawing tool needs candle data now.
  const sanitizedCandles = needsPatternMarkers ? sanitizeCandles(candles) : EMPTY_OVERLAY_CANDLES;
  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  // Show the trader's open positions for this symbol, filtered to the sides the
  // "Show buy trade" / "Show sell trade" preferences enable.
  const symbolPositions = hasEnabledTradeSides(showOnChart)
    ? positions.filter(
        (position) =>
          normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol &&
          isTradeSideEnabled(position.side, showOnChart),
      )
    : [];

  if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_OVERLAY_DEBUG) {
    console.log(
      `[ChartOverlay] chart=${chartSymbol} (norm=${normalizedChartSymbol}) | ` +
      `totalPositions=${positions.length} matchingPositions=${symbolPositions.length} | ` +
      `flags: buy=${showOnChart.buyTrade} sell=${showOnChart.sellTrade} sltp=${showOnChart.slTpLevels}`,
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

  symbolPositions.forEach((position) => {
    const parsedPrice = Number(position.openPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;

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
    const sideColor = resolveOpenPositionSideColor(position.side, colors, sellColor);
    const pnlColor = resolveOpenPositionPnlColor(livePnl, position.side, colors, sellColor);
    const sideLabel = `${position.side === 'sell' ? 'SELL' : 'BUY'} ${formatPositionVolumeLabel(
      Number(position.volume),
    )}`;

    addUniquePriceLine(priceLines, {
      id: `open-${position.id}`,
      price: parsedPrice,
      color: sideColor,
      lineWidth: 1,
      lineStyle: CHART_LINE_STYLE.Dotted,
      axisLabelVisible: true,
      title: formatOpenPositionOverlayLabel(position.side, Number(position.volume), livePnl),
      labelSideText: sideLabel,
      labelValueText: formatSignedUsdOverlayLabel(livePnl),
      labelSideColor: sideColor,
      labelValueColor: pnlColor,
      labelPlacement: 'line',
    });

    if (showOnChart.slTpLevels) {
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
