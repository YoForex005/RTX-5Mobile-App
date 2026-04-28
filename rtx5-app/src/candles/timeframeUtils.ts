import { normalizeSymbol as normalizeMarketSymbol } from '../domain/symbols';
import type { CandleStreamKey, Timeframe } from './candleTypes';

export const SUPPORTED_TIMEFRAMES: readonly Timeframe[] = [
  'M1',
  'M3',
  'M5',
  'M15',
  'M30',
  'H1',
  'H2',
  'H4',
  'D1',
  'W1',
  'MN',
];

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M3: 3 * 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H2: 2 * 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
  W1: 7 * 24 * 60 * 60,
  MN: 30 * 24 * 60 * 60,
};

const CASE_SENSITIVE_ALIASES: Record<string, Timeframe> = {
  '1m': 'M1',
  '3m': 'M3',
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': 'H1',
  '2h': 'H2',
  '4h': 'H4',
  '1d': 'D1',
  '1w': 'W1',
  '1M': 'MN',
};

const NORMALIZED_ALIASES: Record<string, Timeframe> = {
  '1': 'M1',
  '3': 'M3',
  '5': 'M5',
  '15': 'M15',
  '30': 'M30',
  '60': 'H1',
  '120': 'H2',
  '240': 'H4',
  M1: 'M1',
  M3: 'M3',
  M5: 'M5',
  M15: 'M15',
  M30: 'M30',
  H1: 'H1',
  H2: 'H2',
  H4: 'H4',
  D1: 'D1',
  W1: 'W1',
  MN: 'MN',
  MN1: 'MN',
  MONTH: 'MN',
  MONTHLY: 'MN',
  '1MIN': 'M1',
  '3MIN': 'M3',
  '5MIN': 'M5',
  '15MIN': 'M15',
  '30MIN': 'M30',
  '1H': 'H1',
  '2H': 'H2',
  '4H': 'H4',
  '1D': 'D1',
  '1W': 'W1',
  '1MO': 'MN',
};

const DAY_SECONDS = 24 * 60 * 60;

export const normalizeSymbol = (symbol: string): string => normalizeMarketSymbol(symbol);

export const normalizeTimeframeStrict = (timeframe: unknown): Timeframe | null => {
  const raw = String(timeframe ?? '').trim();
  if (!raw) {
    return null;
  }

  const caseSensitive = CASE_SENSITIVE_ALIASES[raw];
  if (caseSensitive) {
    return caseSensitive;
  }

  const normalized = raw.toUpperCase();
  return NORMALIZED_ALIASES[normalized] ?? null;
};

export const isSupportedTimeframe = (timeframe: unknown): boolean =>
  normalizeTimeframeStrict(timeframe) !== null;

export const normalizeTimeframe = (timeframe: string | number | null | undefined): Timeframe =>
  normalizeTimeframeStrict(timeframe) ?? 'M1';

export const getTimeframeSeconds = (timeframe: string): number =>
  TIMEFRAME_SECONDS[normalizeTimeframe(timeframe)];

export const getTimeframeMs = (timeframe: string): number =>
  getTimeframeSeconds(timeframe) * 1000;

export const normalizeTimestampToSeconds = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  let numeric: number | null = null;

  if (typeof value === 'number') {
    numeric = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsedNumber = Number(trimmed);
    if (Number.isFinite(parsedNumber)) {
      numeric = parsedNumber;
    } else {
      const parsedDate = Date.parse(trimmed);
      if (Number.isFinite(parsedDate)) {
        numeric = parsedDate;
      }
    }
  } else if (value instanceof Date) {
    numeric = value.getTime();
  }

  if (numeric === null || !Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  if (numeric > 4.2e16) return Math.floor(numeric / 1_000_000_000);
  if (numeric > 4.2e13) return Math.floor(numeric / 1_000_000);
  if (numeric > 4.2e10) return Math.floor(numeric / 1_000);
  return Math.floor(numeric);
};

export const normalizeTimestampToMs = (value: unknown): number | null => {
  const seconds = normalizeTimestampToSeconds(value);
  return seconds === null ? null : seconds * 1000;
};

const getUtcDayStart = (timestampSeconds: number): number => {
  const date = new Date(timestampSeconds * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
};

const getUtcWeekStart = (timestampSeconds: number): number => {
  const dayStart = getUtcDayStart(timestampSeconds);
  const date = new Date(dayStart * 1000);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return dayStart - daysSinceMonday * DAY_SECONDS;
};

const getUtcMonthStart = (timestampSeconds: number): number => {
  const date = new Date(timestampSeconds * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
};

export const getBucketStart = (timestamp: unknown, timeframe: string): number | null => {
  const timestampSeconds = normalizeTimestampToSeconds(timestamp);
  if (timestampSeconds === null) {
    return null;
  }

  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'D1') {
    return getUtcDayStart(timestampSeconds);
  }
  if (normalizedTimeframe === 'W1') {
    return getUtcWeekStart(timestampSeconds);
  }
  if (normalizedTimeframe === 'MN') {
    return getUtcMonthStart(timestampSeconds);
  }

  const intervalSeconds = getTimeframeSeconds(normalizedTimeframe);
  return Math.floor(timestampSeconds / intervalSeconds) * intervalSeconds;
};

export const getBucketStartMs = (timestamp: unknown, timeframe: string): number | null => {
  const bucketStart = getBucketStart(timestamp, timeframe);
  return bucketStart === null ? null : bucketStart * 1000;
};

const addUtcMonths = (timestampSeconds: number, monthOffset: number): number => {
  const date = new Date(timestampSeconds * 1000);
  return Math.floor(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + monthOffset,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ) / 1000,
  );
};

export const getExpectedNextCandleTime = (lastTime: number, timeframe: string): number => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'MN') {
    return addUtcMonths(getUtcMonthStart(lastTime), 1);
  }

  return lastTime + getTimeframeSeconds(normalizedTimeframe);
};

export const getBucketGapCount = (fromTime: number, toTime: number, timeframe: string): number => {
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime <= fromTime) {
    return 0;
  }

  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe !== 'MN') {
    return Math.floor((toTime - fromTime) / getTimeframeSeconds(normalizedTimeframe));
  }

  let cursor = getUtcMonthStart(fromTime);
  let count = 0;
  while (cursor < toTime && count < 600) {
    cursor = getExpectedNextCandleTime(cursor, normalizedTimeframe);
    count += 1;
  }
  return count;
};

export const createCandleStreamKey = (symbol: string, timeframe: string): CandleStreamKey => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  return `${normalizedSymbol}:${normalizedTimeframe}`;
};
