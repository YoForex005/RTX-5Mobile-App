import type { PriceAlert } from '../../api/alerts';
import type { ClosedPosition } from '../../api/positions';
import { normalizeSymbol } from '../../domain/symbols';
import type { PositionItem } from '../../mock/tradingData';
import type { ChartColorsConfig } from '../../state/userPreferences';

export const CHART_LINE_STYLE = {
  Solid: 0,
  Dotted: 1,
  Dashed: 2,
  LargeDashed: 3,
  SparseDotted: 4,
} as const;

export type ChartOverlayPriceLine = {
  id: string;
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: number;
  axisLabelVisible: boolean;
  title: string;
};

export type ChartOverlayMarkerPosition =
  | 'aboveBar'
  | 'belowBar'
  | 'atPriceTop'
  | 'atPriceBottom'
  | 'atPriceMiddle';

export type ChartOverlayMarkerShape = 'arrowUp' | 'arrowDown' | 'circle' | 'square';

export type ChartOverlayMarker = {
  id: string;
  time: number;
  position: ChartOverlayMarkerPosition;
  color: string;
  shape: ChartOverlayMarkerShape;
  text?: string;
  size?: number;
  price?: number;
};

export type ChartOverlayPayload = {
  priceLines: ChartOverlayPriceLine[];
  markers: ChartOverlayMarker[];
};

export type ChartOverlayCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type ChartOverlayLiveAccount = {
  equity: number;
  margin: number;
  marginLevel?: number;
};

type BuildChartOverlayPayloadInput = {
  chartSymbol: string;
  candles: ChartOverlayCandle[];
  positions: PositionItem[];
  closedPositions?: ClosedPosition[];
  alerts?: PriceAlert[];
  colors: ChartColorsConfig;
  sellColor: string;
  liveAccount?: ChartOverlayLiveAccount | null;
  showOpenPositions: boolean;
  showTpSlStopLimit: boolean;
  showClosedPositions: boolean;
  showTradingSignals: boolean;
  showHmrPeriods: boolean;
  showPriceAlerts: boolean;
  showPotentialStopOut: boolean;
  activeTool?: string;
};

const STOP_OUT_MARGIN_LEVEL_FRACTION = 0.5;
const MAX_CLOSED_POSITION_MARKERS = 8;
const MAX_HMR_MARKERS = 3;

const clampMarkerSize = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(value ?? 1, 1.8));
};

const sanitizeCandles = (candles: ChartOverlayCandle[]): ChartOverlayCandle[] =>
  candles
    .filter(
      (candle) =>
        Number.isFinite(candle?.time) &&
        Number.isFinite(candle?.open) &&
        Number.isFinite(candle?.high) &&
        Number.isFinite(candle?.low) &&
        Number.isFinite(candle?.close),
    )
    .sort((left, right) => left.time - right.time);

const toUpper = (value: string): string => value.trim().toUpperCase();

// Known base symbols that are NOT 6 characters (the standard XXXYYY forex
// format). Everything else is assumed to be 6-char forex (EURUSD, GBPUSD…).
const KNOWN_BASE_SYMBOLS = new Set([
  'US30', 'SPX500', 'NAS100', 'GER40', 'UK100', 'FRA40', 'JP225',
  'USOIL', 'UKOIL', 'NGAS',
]);

// Common MT5 broker suffixes that get concatenated without a separator.
// e.g. GBPUSDpro, EURUSDecn, XAUUSDmicro, BTCUSDstd
const BROKER_SUFFIXES_RE = /(?:PRO|ECN|STD|STP|RAW|ZERO|CENT|MICRO|MINI|NANO|FIX|VAR|SWAP|NDD|PRIME|CLASSIC|STANDARD|M|C|E|X|S|R|B|F|K)$/;

export const normalizeChartOverlaySymbol = (symbol: string): string => {
  const normalized = normalizeSymbol(symbol ?? '');
  // Step 1: strip everything after a separator (., _, -)
  const strippedTransportSuffix = normalized.replace(/[._-].*$/, '');
  const upper = strippedTransportSuffix.toUpperCase();

  // Step 2: if already a known non-6-char base symbol, return it
  if (KNOWN_BASE_SYMBOLS.has(upper)) return upper;

  // Step 3: for 6-char symbols (standard forex pair), return as-is
  if (upper.length === 6) return upper;

  // Step 4: for longer symbols, strip known broker suffixes
  // e.g. GBPUSDPRO → GBPUSD, XAUUSDMICRO → XAUUSD, BTCUSDM → BTCUSD
  if (upper.length > 6) {
    const stripped = upper.replace(BROKER_SUFFIXES_RE, '');
    // Only accept the stripping if we end up with a reasonable base (≥5 chars)
    if (stripped.length >= 5 && stripped.length <= 6) return stripped;
    // Fallback: take the first 6 characters (covers GBPUSDPRO → GBPUSD etc.)
    return upper.slice(0, 6);
  }

  // Step 5: shorter symbols (US30, NGAS, etc.) — return as-is
  return upper;
};

const resolveDisplayPrecision = (symbol: string): number => {
  const normalized = normalizeChartOverlaySymbol(symbol);
  if (normalized.includes('JPY')) return 3;
  if (normalized.includes('XAU') || normalized.includes('XAG')) return 2;
  if (normalized.includes('BTC') || normalized.includes('ETH')) return 2;
  return 5;
};

const inferContractSize = (symbol: string): number => {
  const normalized = normalizeChartOverlaySymbol(symbol);
  if (normalized.includes('XAU') || normalized.includes('XAG')) return 100;
  if (normalized.includes('BTC') || normalized.includes('ETH')) return 1;
  if (
    normalized.includes('US30') ||
    normalized.includes('SPX') ||
    normalized.includes('NAS') ||
    normalized.includes('GER') ||
    normalized.includes('UK')
  ) {
    return 10;
  }
  if (normalized.includes('JPY')) return 1000;
  return 100000;
};

const addUniquePriceLine = (target: Map<string, ChartOverlayPriceLine>, line: ChartOverlayPriceLine) => {
  const parsedPrice = Number(line.price);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;
  target.set(line.id, { ...line, price: parsedPrice });
};

const addUniqueMarker = (target: Map<string, ChartOverlayMarker>, marker: ChartOverlayMarker) => {
  const parsedTime = Number(marker.time);
  if (!Number.isFinite(parsedTime)) return;
  
  let parsedPrice = marker.price;
  if (parsedPrice !== undefined) {
    parsedPrice = Number(parsedPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;
  }
  
  target.set(marker.id, {
    ...marker,
    time: parsedTime,
    price: parsedPrice,
    size: clampMarkerSize(marker.size),
  });
};

const findNearestCandleTime = (candles: ChartOverlayCandle[], rawTime: number): number | null => {
  if (!Number.isFinite(rawTime) || candles.length === 0) return null;

  let low = 0;
  let high = candles.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = candles[mid].time;
    if (candidate === rawTime) return candidate;
    if (candidate < rawTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const previous = candles[Math.max(0, high)];
  const next = candles[Math.min(candles.length - 1, low)];
  if (!previous) return next?.time ?? null;
  if (!next) return previous.time;
  return Math.abs(previous.time - rawTime) <= Math.abs(next.time - rawTime)
    ? previous.time
    : next.time;
};

const buildPatternMarkers = (
  candles: ChartOverlayCandle[],
  activeTool: string | undefined,
): ChartOverlayMarker[] => {
  if (activeTool !== 'patterns' || candles.length === 0) return [];

  const markers: ChartOverlayMarker[] = [];
  candles.forEach((candle) => {
    const isGreen = candle.close > candle.open;
    const isRed = candle.open > candle.close;
    const body = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

    if (isGreen && lowerShadow > body * 1.5 && upperShadow < body * 0.5) {
      markers.push({
        id: `pattern-lower-${candle.time}`,
        time: candle.time,
        position: 'belowBar',
        color: '#089981',
        shape: 'arrowUp',
        text: 'Pattern',
        size: 1,
      });
    } else if (isRed && upperShadow > body * 1.5 && lowerShadow < body * 0.5) {
      markers.push({
        id: `pattern-upper-${candle.time}`,
        time: candle.time,
        position: 'aboveBar',
        color: '#F23645',
        shape: 'arrowDown',
        text: 'Pattern',
        size: 1,
      });
    }
  });

  return markers;
};

const buildTradingSignalMarkers = (
  candles: ChartOverlayCandle[],
  colors: ChartColorsConfig,
): ChartOverlayMarker[] => {
  if (candles.length < 20) return [];

  const closes = candles.map((candle) => candle.close);
  const latest = candles[candles.length - 1];

  const average = (window: number, offset: number = 0) => {
    const end = closes.length - offset;
    const start = Math.max(0, end - window);
    const values = closes.slice(start, end);
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const fastNow = average(5);
  const slowNow = average(20);
  const fastPrev = average(5, 1);
  const slowPrev = average(20, 1);

  const isBullish = fastNow >= slowNow;
  const label = (fastNow - slowNow) * (fastPrev - slowPrev) <= 0 ? 'Signal' : 'Trend';

  return [
    {
      id: `signal-${latest.time}`,
      time: latest.time,
      position: isBullish ? 'belowBar' : 'aboveBar',
      color: isBullish ? colors.tradeTpSl || '#22C55E' : colors.tradeStopOut || '#EF4444',
      shape: isBullish ? 'arrowUp' : 'arrowDown',
      text: label,
      size: 1.1,
    },
  ];
};

const buildHmrMarkers = (candles: ChartOverlayCandle[]): ChartOverlayMarker[] => {
  if (candles.length < 12) return [];

  const ranges = candles
    .map((candle) => candle.high - candle.low)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (ranges.length === 0) return [];

  const percentileIndex = Math.max(0, Math.floor((ranges.length - 1) * 0.85));
  const threshold = ranges[percentileIndex];
  const minGap = Math.max(4, Math.floor(candles.length * 0.08));

  const selected: ChartOverlayMarker[] = [];
  let lastAcceptedIndex = -minGap;

  candles.forEach((candle, index) => {
    const candleRange = candle.high - candle.low;
    if (candleRange < threshold) return;
    if (index - lastAcceptedIndex < minGap) return;
    lastAcceptedIndex = index;
    selected.push({
      id: `hmr-${candle.time}`,
      time: candle.time,
      position: 'aboveBar',
      color: '#F59E0B',
      shape: 'square',
      text: 'HMR',
      size: 1,
    });
  });

  return selected.slice(-MAX_HMR_MARKERS);
};

const buildClosedPositionMarkers = (
  candles: ChartOverlayCandle[],
  closedPositions: ClosedPosition[],
  chartSymbol: string,
): ChartOverlayMarker[] => {
  if (candles.length === 0 || closedPositions.length === 0) return [];

  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  const fromTime = candles[0].time;
  const toTime = candles[candles.length - 1].time;

  return closedPositions
    .filter((position) => normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol)
    .filter((position) => {
      const tc = Number(position.time_close);
      const pc = Number(position.price_close ?? position.price_current);
      return Number.isFinite(tc) && Number.isFinite(pc);
    })
    .filter((position) => {
      const time = Number(position.time_close ?? 0);
      return time >= fromTime && time <= toTime;
    })
    .sort((left, right) => Number(left.time_close ?? 0) - Number(right.time_close ?? 0))
    .slice(-MAX_CLOSED_POSITION_MARKERS)
    .reduce<ChartOverlayMarker[]>((accumulator, position) => {
      const alignedTime = findNearestCandleTime(candles, Number(position.time_close ?? 0));
      if (!alignedTime) return accumulator;

      const markerPrice = Number(position.price_close ?? position.price_current ?? 0);
      const isBuy = toUpper(position.side) === 'BUY';
      accumulator.push({
        id: `closed-${position.ticket}`,
        time: alignedTime,
        position: 'atPriceMiddle',
        price: markerPrice,
        color: '#64748B',
        shape: isBuy ? 'circle' : 'square',
        text: 'Closed',
        size: 1,
      });
      return accumulator;
    }, []);
};

const buildPriceAlertLines = (
  alerts: PriceAlert[],
  chartSymbol: string,
): ChartOverlayPriceLine[] => {
  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);

  return alerts
    .filter((alert) => !alert.triggered)
    .filter((alert) => normalizeChartOverlaySymbol(alert.symbol) === normalizedChartSymbol)
    .map((alert) => ({
      id: `alert-${alert.id}`,
      price: alert.price,
      color: alert.condition === 'above' ? '#10B981' : '#F59E0B',
      lineWidth: 1,
      lineStyle: CHART_LINE_STYLE.SparseDotted,
      axisLabelVisible: true,
      title: alert.condition === 'above' ? 'ALERT ABOVE' : 'ALERT BELOW',
    }));
};

const buildPotentialStopOutLine = (
  positions: PositionItem[],
  candles: ChartOverlayCandle[],
  liveAccount: ChartOverlayLiveAccount | null | undefined,
  colors: ChartColorsConfig,
): ChartOverlayPriceLine | null => {
  if (positions.length === 0 || !liveAccount) return null;

  const equity = Number(liveAccount.equity ?? 0);
  const margin = Number(liveAccount.margin ?? 0);
  if (!Number.isFinite(equity) || !Number.isFinite(margin) || equity <= 0 || margin <= 0) {
    return null;
  }

  const stopOutEquity = margin * STOP_OUT_MARGIN_LEVEL_FRACTION;
  const lossBudget = equity - stopOutEquity;
  if (!Number.isFinite(lossBudget) || lossBudget <= 0) return null;

  const totalExposure = positions.reduce((sum, position) => {
    const contractSize = inferContractSize(position.symbol);
    const signedVolume = position.side === 'buy' ? position.volume : -position.volume;
    return sum + signedVolume * contractSize;
  }, 0);

  if (!Number.isFinite(totalExposure) || Math.abs(totalExposure) < 0.000001) return null;

  const candlePrice = candles[candles.length - 1]?.close;
  const weightedPositionPrice =
    positions.reduce((sum, position) => sum + position.currentPrice * Math.abs(position.volume), 0) /
    Math.max(1, positions.reduce((sum, position) => sum + Math.abs(position.volume), 0));

  const currentPrice = Number.isFinite(candlePrice) && candlePrice! > 0 ? candlePrice! : weightedPositionPrice;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const priceDelta = lossBudget / Math.abs(totalExposure);
  const stopOutPrice = currentPrice - Math.sign(totalExposure) * priceDelta;
  if (!Number.isFinite(stopOutPrice) || stopOutPrice <= 0) return null;

  return {
    id: 'potential-stop-out',
    price: stopOutPrice,
    color: colors.tradeStopOut || '#DC2626',
    lineWidth: 1,
    lineStyle: CHART_LINE_STYLE.LargeDashed,
    axisLabelVisible: true,
    title: 'STOP OUT',
  };
};

export const buildChartOverlayPayload = ({
  chartSymbol,
  candles,
  positions,
  closedPositions = [],
  alerts = [],
  colors,
  sellColor,
  liveAccount,
  showOpenPositions,
  showTpSlStopLimit,
  showClosedPositions,
  showTradingSignals,
  showHmrPeriods,
  showPriceAlerts,
  showPotentialStopOut,
  activeTool,
}: BuildChartOverlayPayloadInput): ChartOverlayPayload => {
  const sanitizedCandles = sanitizeCandles(candles);
  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  const symbolPositions = positions.filter(
    (position) => normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol,
  );

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(
      `[ChartOverlay] chart=${chartSymbol} (norm=${normalizedChartSymbol}) | ` +
      `totalPositions=${positions.length} matchingPositions=${symbolPositions.length} | ` +
      `flags: open=${showOpenPositions} tpsl=${showTpSlStopLimit} closed=${showClosedPositions} ` +
      `signals=${showTradingSignals} hmr=${showHmrPeriods} alerts=${showPriceAlerts} stopOut=${showPotentialStopOut}`,
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

      const precision = resolveDisplayPrecision(position.symbol);

      if (showOpenPositions) {
        addUniquePriceLine(priceLines, {
          id: `open-${position.id}`,
          price: parsedPrice,
          color: position.side === 'buy' ? colors.tradeOpen || '#2962FF' : sellColor,
          lineWidth: 1,
          lineStyle: CHART_LINE_STYLE.Dashed,
          axisLabelVisible: true,
          title: `${position.side.toUpperCase()} ${position.volume} at ${parsedPrice.toFixed(precision)}`,
        });
      }

      if (showTpSlStopLimit) {
        const precision = resolveDisplayPrecision(position.symbol);
        const tpValue = Number(position.tp);
        if (Number.isFinite(tpValue) && tpValue > 0) {
          addUniquePriceLine(priceLines, {
            id: `tp-${position.id}`,
            price: tpValue,
            color: colors.tradeTpSl || '#089981',
            lineWidth: 1,
            lineStyle: CHART_LINE_STYLE.Dashed,
            axisLabelVisible: true,
            title: `TP ${tpValue.toFixed(precision)}`,
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
            axisLabelVisible: true,
            title: `SL ${slValue.toFixed(precision)}`,
          });
        }
      }
    });
  }

  if (showPotentialStopOut) {
    const stopOutLine = buildPotentialStopOutLine(symbolPositions, sanitizedCandles, liveAccount, colors);
    if (stopOutLine) addUniquePriceLine(priceLines, stopOutLine);
  }

  if (showPriceAlerts) {
    buildPriceAlertLines(alerts, chartSymbol).forEach((line) => addUniquePriceLine(priceLines, line));
  }

  if (showClosedPositions) {
    buildClosedPositionMarkers(sanitizedCandles, closedPositions, chartSymbol).forEach((marker) =>
      addUniqueMarker(markers, marker),
    );
  }

  if (showTradingSignals) {
    buildTradingSignalMarkers(sanitizedCandles, colors).forEach((marker) => addUniqueMarker(markers, marker));
  }

  if (showHmrPeriods) {
    buildHmrMarkers(sanitizedCandles).forEach((marker) => addUniqueMarker(markers, marker));
  }

  buildPatternMarkers(sanitizedCandles, activeTool).forEach((marker) => addUniqueMarker(markers, marker));

  const result = {
    priceLines: Array.from(priceLines.values()).sort((left, right) => left.price - right.price),
    markers: Array.from(markers.values()).sort((left, right) => left.time - right.time),
  };

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(
      `[ChartOverlay] OUTPUT: ${result.priceLines.length} priceLines, ${result.markers.length} markers`,
    );
    result.priceLines.forEach((l) => console.log(`  line id=${l.id} price=${l.price} title="${l.title}"`));
  }

  return result;
};
