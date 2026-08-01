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
import type { PositionItem, QuoteItem } from '../../../dev/mock/tradingData';
import type { ChartColorsConfig } from '../../../state/userPreferences';
import {
  formatLivePositionPnl,
  resolveLivePositionPnl,
} from '../../trade/livePositionMetrics';
import type { ChartShowOnChartSettings } from '../chartShowOnChart';
import {
  addUniqueMarker,
  addUniquePriceLine,
  buildClosedPositionMarkers,
  buildPatternMarkers,
  sanitizeCandles,
} from './markerCollections';
import {
  calculatePositionTargetPnl,
  formatPositionVolumeLabel,
  formatTpSlOverlayLabel,
  formatTpSlOverlayValueLabel,
} from './orderHelpers';
import { buildChartPositionStopDragKey } from './positionStopDragKeys';
import { normalizeChartOverlaySymbol } from './symbolUtils';
import {
  CHART_LINE_STYLE,
  CHART_OVERLAY_DEBUG,
  EMPTY_CHART_OVERLAY_PAYLOAD,
  EMPTY_OVERLAY_MARKERS,
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
  liveQuote?: Partial<QuoteItem>;
  liveAccount?: ChartOverlayLiveAccount | null;
  showOnChart: ChartShowOnChartSettings;
  activeTool?: string;
  /**
   * Existing-position protection remains visible while backend modification is
   * locked, but it must not expose a drag entry point. Callers must opt in
   * only after the active broker's existing-position capability is enabled.
   */
  allowPositionStopDragging?: boolean;
};

const hasEnabledTradeSides = (showOnChart: ChartShowOnChartSettings): boolean =>
  showOnChart.buyTrade || showOnChart.sellTrade;

const isTradeSideEnabled = (
  side: 'buy' | 'sell',
  showOnChart: ChartShowOnChartSettings,
): boolean => (side === 'buy' ? showOnChart.buyTrade : showOnChart.sellTrade);

type BuildChartOverlayMarkersInput = Pick<
  BuildChartOverlayPayloadInput,
  'chartSymbol' | 'candles' | 'closedPositions' | 'showOnChart' | 'activeTool'
>;

/**
 * Build candle-anchored markers independently from quote-driven price lines.
 *
 * The native Chart host memoizes this result from candle-time/history inputs,
 * so a bid/ask or open-position P/L tick cannot repeatedly scan closed history
 * or normalize every historical symbol.
 */
export const buildChartOverlayMarkers = ({
  chartSymbol,
  candles,
  closedPositions = [],
  showOnChart,
  activeTool,
}: BuildChartOverlayMarkersInput): ChartOverlayMarker[] => {
  const needsPatternMarkers = activeTool === 'patterns';
  const needsClosedTradeMarkers = hasEnabledTradeSides(showOnChart) && closedPositions.length > 0;
  if (!needsPatternMarkers && !needsClosedTradeMarkers) {
    return EMPTY_OVERLAY_MARKERS;
  }

  const sanitizedCandles = sanitizeCandles(candles);
  if (sanitizedCandles.length === 0) {
    return EMPTY_OVERLAY_MARKERS;
  }

  const markers = new Map<string, ChartOverlayMarker>();
  if (needsPatternMarkers) {
    buildPatternMarkers(sanitizedCandles, activeTool).forEach((marker) => addUniqueMarker(markers, marker));
  }
  if (needsClosedTradeMarkers) {
    buildClosedPositionMarkers(sanitizedCandles, closedPositions, chartSymbol).forEach((marker) =>
      addUniqueMarker(markers, marker),
    );
  }

  if (markers.size === 0) {
    return EMPTY_OVERLAY_MARKERS;
  }
  return Array.from(markers.values()).sort((left, right) => left.time - right.time);
};

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

export type ChartOpenPositionLabelPatch = Pick<
  ChartOverlayPriceLine,
  'id' | 'title' | 'labelValueText' | 'labelValueColor'
>;

type BuildChartOpenPositionLabelPatchesInput = Pick<
  BuildChartOverlayPayloadInput,
  'chartSymbol' | 'positions' | 'colors' | 'sellColor' | 'liveBid' | 'liveAsk' | 'showOnChart'
> & {
  liveQuote?: Partial<QuoteItem>;
};

const buildOpenPositionLabelPatch = (
  position: PositionItem,
  colors: ChartColorsConfig,
  sellColor: string,
  liveQuote?: Partial<QuoteItem>,
): ChartOpenPositionLabelPatch | null => {
  const parsedPrice = Number(position.openPrice);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return null;
  }

  const livePnl = resolveLivePositionPnl(position, liveQuote);
  const labelValueText = `${formatLivePositionPnl(livePnl)} USD`;

  return {
    id: `open-${position.id}`,
    title: `${position.side === 'sell' ? 'SELL' : 'BUY'} ${formatPositionVolumeLabel(Number(position.volume))}, ${labelValueText}`,
    labelValueText,
    labelValueColor: resolveOpenPositionPnlColor(livePnl, position.side, colors, sellColor),
  };
};

/**
 * Builds only the quote-driven fields of open-position labels. This is the
 * per-tick path used by the native Chart bridge; line geometry stays untouched.
 */
export const buildChartOpenPositionLabelPatches = ({
  chartSymbol,
  positions,
  colors,
  sellColor,
  liveBid,
  liveAsk,
  liveQuote,
  showOnChart,
}: BuildChartOpenPositionLabelPatchesInput): ChartOpenPositionLabelPatch[] => {
  if (!hasEnabledTradeSides(showOnChart)) {
    return [];
  }

  const resolvedLiveQuote = liveQuote ?? (
    (typeof liveBid === 'number' && Number.isFinite(liveBid) && liveBid > 0) ||
    (typeof liveAsk === 'number' && Number.isFinite(liveAsk) && liveAsk > 0)
      ? {
          bid: typeof liveBid === 'number' ? liveBid : undefined,
          ask: typeof liveAsk === 'number' ? liveAsk : undefined,
        }
      : undefined
  );
  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  return positions.flatMap((position) => {
    if (
      normalizeChartOverlaySymbol(position.symbol) !== normalizedChartSymbol ||
      !isTradeSideEnabled(position.side, showOnChart)
    ) {
      return [];
    }
    const patch = buildOpenPositionLabelPatch(
      position,
      colors,
      sellColor,
      resolvedLiveQuote,
    );
    return patch ? [patch] : [];
  });
};

/** Applies live text/color patches without changing any overlay line geometry. */
export const applyChartOpenPositionLabelPatches = (
  payload: ChartOverlayPayload,
  patches: readonly ChartOpenPositionLabelPatch[],
): ChartOverlayPayload => {
  if (patches.length === 0 || payload.priceLines.length === 0) {
    return payload;
  }

  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  let changed = false;
  const priceLines = payload.priceLines.map((line) => {
    const patch = patchById.get(line.id);
    if (
      !patch ||
      (
        line.title === patch.title &&
        line.labelValueText === patch.labelValueText &&
        line.labelValueColor === patch.labelValueColor
      )
    ) {
      return line;
    }

    changed = true;
    return {
      ...line,
      title: patch.title,
      labelValueText: patch.labelValueText,
      labelValueColor: patch.labelValueColor,
    };
  });

  return changed ? { ...payload, priceLines } : payload;
};

export const buildChartOverlayPayload = ({
  chartSymbol,
  candles,
  positions,
  closedPositions = [],
  colors,
  sellColor,
  liveBid,
  liveAsk,
  liveQuote,
  showOnChart,
  activeTool,
  allowPositionStopDragging = false,
}: BuildChartOverlayPayloadInput): ChartOverlayPayload => {
  const needsPatternMarkers = activeTool === 'patterns';
  const showTradeSides = hasEnabledTradeSides(showOnChart);
  if (!showTradeSides && !needsPatternMarkers) {
    return EMPTY_CHART_OVERLAY_PAYLOAD;
  }

  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  const resolvedLiveQuote = liveQuote ?? (
    (typeof liveBid === 'number' && Number.isFinite(liveBid) && liveBid > 0) ||
    (typeof liveAsk === 'number' && Number.isFinite(liveAsk) && liveAsk > 0)
      ? {
          bid: typeof liveBid === 'number' ? liveBid : undefined,
          ask: typeof liveAsk === 'number' ? liveAsk : undefined,
        }
      : undefined
  );
  // Show the trader's open positions for this symbol, filtered to the sides the
  // "Show buy trade" / "Show sell trade" preferences enable.
  const symbolPositions = showTradeSides
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
      `closedPositions=${closedPositions.length} | ` +
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

  symbolPositions.forEach((position) => {
    const parsedPrice = Number(position.openPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;

    const labelPatch = buildOpenPositionLabelPatch(
      position,
      colors,
      sellColor,
      resolvedLiveQuote,
    );
    if (!labelPatch) return;
    const sideColor = resolveOpenPositionSideColor(position.side, colors, sellColor);
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
      title: labelPatch.title,
      labelSideText: sideLabel,
      labelValueText: labelPatch.labelValueText,
      labelSideColor: sideColor,
      labelValueColor: labelPatch.labelValueColor,
      labelPlacement: 'line',
    });

    if (showOnChart.slTpLevels) {
      const tpValue = Number(position.tp);
      if (Number.isFinite(tpValue) && tpValue > 0) {
        const tpProjectedPnl = calculatePositionTargetPnl({
          symbol: position.symbol,
          side: position.side,
          volume: Number(position.volume),
          entryPrice: parsedPrice,
          targetPrice: tpValue,
        }) ?? 0;
        const tpColor = colors.tradeTpSl || '#089981';
        addUniquePriceLine(priceLines, {
          id: `tp-${position.id}`,
          price: tpValue,
          color: tpColor,
          lineWidth: 1,
          lineStyle: CHART_LINE_STYLE.Dashed,
          axisLabelVisible: false,
          title: formatTpSlOverlayLabel(
            'tp',
            position.symbol,
            position.side,
            parsedPrice,
            tpValue,
            Number(position.volume),
          ),
          labelSideText: 'TP',
          labelValueText: formatTpSlOverlayValueLabel(
            position.symbol,
            position.side,
            parsedPrice,
            tpValue,
            Number(position.volume),
          ),
          labelSideColor: tpColor,
          labelValueColor: resolveOpenPositionPnlColor(
            tpProjectedPnl,
            position.side,
            colors,
            sellColor,
          ),
          labelPlacement: 'line',
          ...(allowPositionStopDragging
            ? { dragKey: buildChartPositionStopDragKey(position.id, 'tp') }
            : {}),
        });
      }

      const slValue = Number(position.sl);
      if (Number.isFinite(slValue) && slValue > 0) {
        const slProjectedPnl = calculatePositionTargetPnl({
          symbol: position.symbol,
          side: position.side,
          volume: Number(position.volume),
          entryPrice: parsedPrice,
          targetPrice: slValue,
        }) ?? 0;
        const slColor = colors.tradeStopOut || '#F23645';
        addUniquePriceLine(priceLines, {
          id: `sl-${position.id}`,
          price: slValue,
          color: slColor,
          lineWidth: 1,
          lineStyle: CHART_LINE_STYLE.Dashed,
          axisLabelVisible: false,
          title: formatTpSlOverlayLabel(
            'sl',
            position.symbol,
            position.side,
            parsedPrice,
            slValue,
            Number(position.volume),
          ),
          labelSideText: 'SL',
          labelValueText: formatTpSlOverlayValueLabel(
            position.symbol,
            position.side,
            parsedPrice,
            slValue,
            Number(position.volume),
          ),
          labelSideColor: slColor,
          labelValueColor: resolveOpenPositionPnlColor(
            slProjectedPnl,
            position.side,
            colors,
            sellColor,
          ),
          labelPlacement: 'line',
          ...(allowPositionStopDragging
            ? { dragKey: buildChartPositionStopDragKey(position.id, 'sl') }
            : {}),
        });
      }
    }
  });

  const markers = buildChartOverlayMarkers({
    chartSymbol,
    candles,
    closedPositions,
    showOnChart,
    activeTool,
  });

  const result = {
    priceLines: applyRightAxisLabelVisibility(
      Array.from(priceLines.values()).sort((left, right) => left.price - right.price),
    ),
    markers,
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
