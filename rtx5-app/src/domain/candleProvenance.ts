import {
  isBucketAlignedCandle,
  isStructurallyValidCandle,
  normalizeTimeframe,
  sortAndDedupeCandles,
} from './candles';
import type { Candle } from '../state/tradingState';

export type CandlePriceBasis = 'bid' | 'ask' | 'mid' | 'last';

export type TrustedHistoryCandle = Candle & {
  source: 'rest';
  closed: true;
  priceBasis: CandlePriceBasis;
  serverTimeframe: string;
  receivedAtMs?: number;
};

export const CANDLE_PRICE_BASIS_VALUES: readonly CandlePriceBasis[] = ['bid', 'ask', 'mid', 'last'];

export const normalizeCandlePriceBasis = (value: unknown): CandlePriceBasis | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return CANDLE_PRICE_BASIS_VALUES.includes(normalized as CandlePriceBasis)
    ? (normalized as CandlePriceBasis)
    : null;
};

export const getConfiguredCandlePriceBasis = (): CandlePriceBasis =>
  normalizeCandlePriceBasis(process.env.EXPO_PUBLIC_CANDLE_PRICE_BASIS) ?? 'bid';

const coerceClosedFlag = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'closed', 'complete', 'completed', 'final'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'open', 'forming', 'current', 'partial', 'incomplete'].includes(normalized)) {
      return false;
    }
  }

  return null;
};

export const getExplicitClosedFlag = (input: unknown): boolean | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;
  return (
    coerceClosedFlag(record.closed) ??
    coerceClosedFlag(record.isClosed) ??
    coerceClosedFlag(record.complete) ??
    coerceClosedFlag(record.completed) ??
    coerceClosedFlag(record.final) ??
    coerceClosedFlag(record.isFinal) ??
    null
  );
};

export const isTrustedHistoryCandle = (candle: Candle): candle is TrustedHistoryCandle => {
  const record = candle as Record<string, unknown>;
  return record.source === 'rest' && record.closed === true && isStructurallyValidCandle(candle);
};

export const markTrustedHistoryCandle = (
  candle: Candle,
  timeframe: string,
  priceBasis: CandlePriceBasis,
): TrustedHistoryCandle | null => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (!isStructurallyValidCandle(candle) || !isBucketAlignedCandle(candle, normalizedTimeframe)) {
    return null;
  }

  return {
    ...candle,
    source: 'rest',
    closed: true,
    priceBasis,
    serverTimeframe: normalizedTimeframe,
  };
};

export const markTrustedHistorySeries = (
  candles: Candle[],
  timeframe: string,
  priceBasis: CandlePriceBasis,
): TrustedHistoryCandle[] =>
  sortAndDedupeCandles(
    candles.filter((candle) => {
      const record = candle as Record<string, unknown>;
      return record.source !== 'live' && record.source !== 'live_candle' && record.closed !== false;
    }),
  )
    .map((candle) => markTrustedHistoryCandle(candle, timeframe, priceBasis))
    .filter((candle): candle is TrustedHistoryCandle => candle !== null);

export const stripCandleProvenance = (candle: Candle): Candle => ({
  time: candle.time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
  volume: candle.volume,
});

export type RestHistorySeedCandles = {
  candles: Candle[];
  closedHistoryLastTime: number | null;
  currentCandleTime: number | null;
};

export const buildRestHistorySeedCandles = (
  closedHistory: readonly Candle[],
  currentCandle: Candle | null | undefined,
): RestHistorySeedCandles => {
  const safeClosedHistory = sortAndDedupeCandles(
    closedHistory
      .filter(isStructurallyValidCandle)
      .map(stripCandleProvenance),
  );
  const safeCurrentCandle = currentCandle && isStructurallyValidCandle(currentCandle)
    ? stripCandleProvenance(currentCandle)
    : null;
  const candles = sortAndDedupeCandles([
    ...safeClosedHistory,
    ...(safeCurrentCandle ? [safeCurrentCandle] : []),
  ]);

  return {
    candles,
    closedHistoryLastTime: safeClosedHistory[safeClosedHistory.length - 1]?.time ?? null,
    currentCandleTime: safeCurrentCandle?.time ?? null,
  };
};

export const splitRestHistoryCandles = (
  candles: Candle[],
  timeframe: string,
  priceBasis: CandlePriceBasis,
): { closedHistory: TrustedHistoryCandle[]; currentCandle: Candle | null } => {
  const normalizedCandles = candles
    .filter(isStructurallyValidCandle)
    .sort((left, right) => left.time - right.time);
  const closedHistory: TrustedHistoryCandle[] = [];
  let currentCandle: Candle | null = null;

  for (let index = 0; index < normalizedCandles.length; index += 1) {
    const candle = normalizedCandles[index];
    const record = candle as Record<string, unknown>;
    const explicitClosed = getExplicitClosedFlag(candle);
    const isLast = index === normalizedCandles.length - 1;
    const isLiveSource = record.source === 'live' || record.source === 'live_candle';
    const shouldTreatAsClosed =
      !isLiveSource &&
      (explicitClosed === true || (explicitClosed === null && !isLast));

    if (!shouldTreatAsClosed) {
      currentCandle = candle;
      continue;
    }

    const trusted = markTrustedHistoryCandle(candle, timeframe, priceBasis);
    if (trusted) {
      closedHistory.push(trusted);
    }
  }

  return {
    closedHistory: markTrustedHistorySeries(closedHistory, timeframe, priceBasis),
    currentCandle,
  };
};
