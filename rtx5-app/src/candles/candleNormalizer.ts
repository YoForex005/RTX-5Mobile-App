import type { Candle, LiveCandle, RawCandle } from './candleTypes';
import { normalizeSymbol, normalizeTimeframeStrict, normalizeTimestampToSeconds } from './timeframeUtils';
import { logInvalidCandleInDevelopment, validateCandle } from './candleValidator';

const TIME_KEYS = ['time', 'timestamp', 'ts', 't', 'date', 'datetime', 'serverTime', 'server_time'];
const OPEN_KEYS = ['open', 'Open', 'OPEN', 'o', 'O'];
const HIGH_KEYS = ['high', 'High', 'HIGH', 'h', 'H'];
const LOW_KEYS = ['low', 'Low', 'LOW', 'l', 'L'];
const CLOSE_KEYS = ['close', 'Close', 'CLOSE', 'c', 'C'];
const VOLUME_KEYS = ['volume', 'Volume', 'VOLUME', 'vol', 'tickVolume', 'tick_volume', 'v', 'V'];
const SYMBOL_KEYS = ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol'];
const TIMEFRAME_KEYS = ['timeframe', 'Timeframe', 'TIMEFRAME', 'tf', 'TF', 'period', 'interval'];
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const pickFirst = (record: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNonNegativeFiniteNumber = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  return parsed === null || parsed < 0 ? null : parsed;
};

const getNestedCandleRecord = (raw: unknown): Record<string, unknown> | null => {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  return asRecord(record.candle) ?? asRecord(record.bar) ?? asRecord(record.data) ?? record;
};

const normalizeBackendCandle = (raw: unknown, label: string): Candle | null => {
  const record = getNestedCandleRecord(raw);
  if (!record) {
    logInvalidCandleInDevelopment(`${label}:missing_record`, raw);
    return null;
  }

  const time = normalizeTimestampToSeconds(pickFirst(record, TIME_KEYS));
  const open = toFiniteNumber(pickFirst(record, OPEN_KEYS));
  const high = toFiniteNumber(pickFirst(record, HIGH_KEYS));
  const low = toFiniteNumber(pickFirst(record, LOW_KEYS));
  const close = toFiniteNumber(pickFirst(record, CLOSE_KEYS));
  const volume = toNonNegativeFiniteNumber(pickFirst(record, VOLUME_KEYS)) ?? 0;

  if (time === null || open === null || high === null || low === null || close === null) {
    logInvalidCandleInDevelopment(`${label}:missing_ohlc`, raw);
    return null;
  }

  const candle: Candle = {
    time,
    open,
    high,
    low,
    close,
    volume,
  };

  if (!validateCandle(candle)) {
    logInvalidCandleInDevelopment(`${label}:invalid_ohlc`, raw);
    return null;
  }

  return candle;
};

export const normalizeHistoryCandle = (raw: unknown): Candle | null =>
  normalizeBackendCandle(raw, 'history');

export const normalizeLiveCandle = (raw: unknown): LiveCandle | null => {
  const record = getNestedCandleRecord(raw);
  const candle = normalizeBackendCandle(record ?? raw, 'live_candle');
  if (!record || !candle) {
    return null;
  }

  const symbolValue = pickFirst(record, SYMBOL_KEYS);
  const timeframeValue = pickFirst(record, TIMEFRAME_KEYS);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframeValue);
  return {
    ...candle,
    ...(typeof symbolValue === 'string' ? { symbol: normalizeSymbol(symbolValue) } : {}),
    ...(normalizedTimeframe ? { timeframe: normalizedTimeframe } : {}),
  };
};

export const normalizeHistoryCandles = (rawCandles: unknown[]): Candle[] =>
  rawCandles
    .map(normalizeHistoryCandle)
    .filter((candle): candle is Candle => candle !== null);

export const normalizeRawCandleRecord = (raw: unknown): RawCandle | null => asRecord(raw);
