import type { Candle, LiveCandle, RawCandle } from '../core/candleTypes';
import { normalizeSymbol, normalizeTimeframeStrict, normalizeTimestampToSeconds } from '../core/timeframeUtils';
import { logInvalidCandleInDevelopment, validateCandle } from '../core/candleValidator';
import { isCandleInternallyCoherent } from '../series/priceCoherence';

// --- Field Mapping Constants ---
// These arrays define the possible keys that might contain relevant data in an unstructured payload.

/** Possible keys for extracting the timestamp of a candle. */
const TIME_KEYS = ['time', 'timestamp', 'ts', 't', 'date', 'datetime', 'serverTime', 'server_time'];
/** Possible keys for extracting the open price. */
const OPEN_KEYS = ['open', 'Open', 'OPEN', 'o', 'O'];
/** Possible keys for extracting the high price. */
const HIGH_KEYS = ['high', 'High', 'HIGH', 'h', 'H'];
/** Possible keys for extracting the low price. */
const LOW_KEYS = ['low', 'Low', 'LOW', 'l', 'L'];
/** Possible keys for extracting the close price. */
const CLOSE_KEYS = ['close', 'Close', 'CLOSE', 'c', 'C'];
/** Possible keys for extracting the volume. */
const VOLUME_KEYS = ['volume', 'Volume', 'VOLUME', 'vol', 'tickVolume', 'tick_volume', 'v', 'V'];
/** Possible keys for extracting the symbol. */
const SYMBOL_KEYS = ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol'];
/** Possible keys for extracting the timeframe. */
const TIMEFRAME_KEYS = ['timeframe', 'Timeframe', 'TIMEFRAME', 'tf', 'TF', 'period', 'interval'];
/** Possible keys for extracting the boolean closed flag. */
const CLOSED_KEYS = [
  'closed',
  'isClosed',
  'complete',
  'completed',
  'final',
  'isFinal',
  'Closed',
  'CLOSED',
  'is_closed',
  'is_complete',
];
// --- Extraction Utilities ---

/** Safely casts an unknown value to a Record if it is an object and not an array. */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Iterates through a list of possible keys and returns the first non-empty value. */
const pickFirst = (record: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
};

/** Attempts to parse a value into a finite number. Returns null if invalid or NaN. */
const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Ensures a parsed number is greater than or equal to zero. */
const toNonNegativeFiniteNumber = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  return parsed === null || parsed < 0 ? null : parsed;
};

/** Normalizes various boolean/string/number representations of "true/false" into a strict boolean. */
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

/** Searches a record for a valid "closed" flag using known keys. */
const pickClosedFlag = (record: Record<string, unknown>): boolean | null => {
  for (const key of CLOSED_KEYS) {
    const closed = coerceClosedFlag(record[key]);
    if (closed !== null) {
      return closed;
    }
  }
  return null;
};

/**
 * Traverses common nested payload structures (e.g., { candle: { ... } } or { data: { ... } })
 * to find the actual record containing candle data.
 */
const getNestedCandleRecord = (raw: unknown): Record<string, unknown> | null => {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  return asRecord(record.candle) ?? asRecord(record.bar) ?? asRecord(record.data) ?? record;
};

/**
 * Core normalization logic. Extracts OHLCV values from an unknown JSON object,
 * ensures strict numeric constraints, and sanitizes minor float math errors in geometry.
 *
 * @param raw The raw JSON object from the backend.
 * @param label A label used for debugging if the candle is invalid.
 * @returns A strictly validated Candle, or null if the payload is corrupted.
 */
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
  const closed = pickClosedFlag(record);

  if (time === null || open === null || high === null || low === null || close === null) {
    logInvalidCandleInDevelopment(`${label}:missing_ohlc`, raw);
    return null;
  }

  // Sanitize OHLC geometry to prevent dropping candles due to backend aggregation precision errors.
  // If the backend returns a high that is slightly lower than open/close due to float math,
  // we fix it instead of dropping the entire minute of data.
  const safeHigh = Math.max(open, close, high);
  const safeLow = Math.min(open, close, low);

  const candle: Candle = {
    time,
    open,
    high: safeHigh,
    low: safeLow,
    close,
    volume,
  };

  if (!validateCandle(candle)) {
    logInvalidCandleInDevelopment(`${label}:invalid_ohlc`, raw);
    return null;
  }
  if (!isCandleInternallyCoherent(candle)) {
    logInvalidCandleInDevelopment(`${label}:incoherent_ohlc`, raw);
    return null;
  }

  return closed === null ? candle : ({ ...candle, closed } as Candle);
};

/**
 * Parses an unknown payload specifically expecting a historical candle (REST response).
 * Strips out symbol/timeframe metadata since history is usually fetched per-symbol/timeframe.
 */
export const normalizeHistoryCandle = (raw: unknown): Candle | null =>
  normalizeBackendCandle(raw, 'history');

/**
 * Parses an unknown payload specifically expecting a live candle (WebSocket response).
 * Optionally preserves inline symbol and timeframe tags which are common in multiplexed streams.
 */
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

/** Bulk parses an array of raw historical candles, filtering out any invalid entries. */
export const normalizeHistoryCandles = (rawCandles: unknown[]): Candle[] =>
  rawCandles
    .map(normalizeHistoryCandle)
    .filter((candle): candle is Candle => candle !== null);

/** Extracts the raw underlying object record from a JSON payload if possible. */
export const normalizeRawCandleRecord = (raw: unknown): RawCandle | null => asRecord(raw);
