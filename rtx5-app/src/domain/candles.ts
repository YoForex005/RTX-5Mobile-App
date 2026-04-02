import { Candle } from '../state/tradingState';

export const DEFAULT_CANDLE_HISTORY_LIMIT = 500;

const TIMEFRAME_SECONDS: Record<string, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
  MN: 2592000,
};

export type CandleStreamEvent =
  | { type: 'full_sync'; symbol: string; tf: string; candles: Candle[]; reason: 'subscription_change' | 'history_seed' | 'resync' | 'historical_patch' }
  | { type: 'replace_last'; symbol: string; tf: string; candle: Candle }
  | { type: 'append'; symbol: string; tf: string; candle: Candle }
  | { type: 'resync_required'; symbol: string; tf: string; reason: string };

export const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

export const normalizeTimeframe = (timeframe: string): string => {
  const tf = timeframe.trim().toUpperCase();
  const aliases: Record<string, string> = {
    '1M': 'M1',
    '5M': 'M5',
    '15M': 'M15',
    '30M': 'M30',
    '1H': 'H1',
    '4H': 'H4',
    '1D': 'D1',
    '1W': 'W1',
    '1MO': 'MN',
  };

  return aliases[tf] ?? tf;
};

export const getTimeframeSeconds = (timeframe: string): number => {
  return TIMEFRAME_SECONDS[normalizeTimeframe(timeframe)] ?? 60;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const alignTimeToBucket = (timeInSeconds: number, timeframe: string): number => {
  const intervalSeconds = getTimeframeSeconds(timeframe);
  return Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
};

const normalizeTimeValue = (value: unknown, timeframe: string): number | null => {
  if (value === null || value === undefined) return null;

  let timeInSeconds: number | null = null;

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      timeInSeconds = numeric;
    } else {
      const asDate = Date.parse(value);
      if (Number.isFinite(asDate)) {
        timeInSeconds = Math.floor(asDate / 1000);
      }
    }
  } else if (typeof value === 'number') {
    timeInSeconds = value;
  }

  if (timeInSeconds === null) return null;

  while (timeInSeconds > 2_500_000_000) {
    timeInSeconds = Math.floor(timeInSeconds / 10);
  }

  return alignTimeToBucket(timeInSeconds, timeframe);
};

export const isStructurallyValidCandle = (
  candle: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> | null | undefined,
): candle is Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> => {
  if (!candle) return false;

  return (
    Number.isFinite(candle.time) &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close) &&
    candle.high >= candle.low
  );
};

export const isBucketAlignedCandle = (candle: Pick<Candle, 'time'>, timeframe: string): boolean => {
  return candle.time === alignTimeToBucket(candle.time, timeframe);
};

export const normalizeCandle = (input: Record<string, unknown>, timeframe: string): Candle | null => {
  const time = normalizeTimeValue(input.time ?? input.timestamp ?? input.ts ?? input.t, timeframe);
  const close = toFiniteNumber(input.close ?? input.c ?? input.price ?? input.p);
  const open = toFiniteNumber(input.open ?? input.o ?? input.close ?? input.c ?? input.price ?? input.p);
  const high = toFiniteNumber(input.high ?? input.h ?? input.close ?? input.c ?? input.price ?? input.p);
  const low = toFiniteNumber(input.low ?? input.l ?? input.close ?? input.c ?? input.price ?? input.p);
  const volume = toFiniteNumber(input.volume ?? input.v) ?? 0;

  if (time === null || open === null || high === null || low === null || close === null) {
    return null;
  }

  const candle: Candle = {
    time,
    open,
    high: Math.max(open, high, low, close),
    low: Math.min(open, high, low, close),
    close,
    volume: Math.max(volume, 0),
  };

  return isStructurallyValidCandle(candle) && isBucketAlignedCandle(candle, timeframe) ? candle : null;
};

export const mergeCandleUpdate = (existing: Candle, incoming: Candle): Candle | null => {
  const merged: Candle = {
    time: existing.time,
    open: existing.open,
    high: Math.max(existing.high, incoming.high, existing.open, incoming.close),
    low: Math.min(existing.low, incoming.low, existing.open, incoming.close),
    close: incoming.close,
    volume: Number.isFinite(incoming.volume) ? incoming.volume : existing.volume,
  };

  return isStructurallyValidCandle(merged) ? merged : null;
};

export const sortAndDedupeCandles = (candles: Candle[]): Candle[] => {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];

  for (const candle of sorted) {
    if (!isStructurallyValidCandle(candle)) continue;

    const last = deduped[deduped.length - 1];
    if (!last || last.time !== candle.time) {
      deduped.push(candle);
      continue;
    }

    const merged = mergeCandleUpdate(last, candle);
    if (merged) {
      deduped[deduped.length - 1] = merged;
    }
  }

  return deduped;
};

export const normalizeCandleSeries = (candles: unknown[], timeframe: string): Candle[] => {
  const normalized = candles
    .map((item) => (item && typeof item === 'object' ? normalizeCandle(item as Record<string, unknown>, timeframe) : null))
    .filter((item): item is Candle => item !== null);

  return sortAndDedupeCandles(normalized);
};

export const getExpectedNextCandleTime = (lastTime: number, timeframe: string): number => {
  return lastTime + getTimeframeSeconds(timeframe);
};
