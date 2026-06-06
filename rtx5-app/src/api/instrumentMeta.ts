import { normalizeQuoteSymbolKey, normalizeSymbol } from '../domain/symbols';

export interface InstrumentMetaDTO {
  symbol: string;
  name?: string;
  category?: string;
  sector?: string;
  spreadMode?: string;
  stopsLevel?: string;
  calculation?: string;
  chartMode?: string;
  contractSize?: number;
  minVolume?: number;
  maxVolume?: number;
  stepVolume?: number;
  tickSize?: number;
  tickValue?: number;
  digits?: number;
  marginInitial?: number;
  marginMaintenance?: number;
  swapLong?: number;
  swapShort?: number;
  baseCurrency?: string;
  profitCurrency?: string;
  sessions?: Array<[string, string]>;
}

const instrumentMetaCache = new Map<string, InstrumentMetaDTO>();

const INSTRUMENT_LIST_KEYS = [
  'instruments',
  'symbols',
  'data',
  'items',
  'results',
  'result',
  'records',
] as const;

const INSTRUMENT_FIELD_KEYS = [
  'symbol',
  'Symbol',
  'SYMBOL',
  'instrument',
  'instrumentSymbol',
  'code',
  'ticker',
] as const;

const DIGITS_FIELD_KEYS = [
  'digits',
  'Digits',
  'DIGITS',
  'precision',
  'pricePrecision',
  'price_digits',
  'decimalPlaces',
] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const normalizeDigits = (value: unknown): number | undefined => {
  const parsed = toFiniteNumber(value);
  return parsed === undefined ? undefined : Math.min(Math.max(Math.floor(parsed), 0), 8);
};

const pickStringField = (record: Record<string, unknown>, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return undefined;
};

const pickDigits = (record: Record<string, unknown>): number | undefined => {
  for (const key of DIGITS_FIELD_KEYS) {
    const digits = normalizeDigits(record[key]);
    if (digits !== undefined) {
      return digits;
    }
  }

  return undefined;
};

const unwrapInstrumentRecord = (payload: unknown): Record<string, unknown> | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  for (const key of ['instrument', 'data', 'result', 'item'] as const) {
    const nested = asRecord(record[key]);
    if (nested) {
      return nested;
    }
  }

  return record;
};

const getScopedCacheKey = (scope: string | undefined, symbol: string) =>
  `${scope ?? 'default'}:${symbol}`;

export const cacheInstrumentMeta = (meta: InstrumentMetaDTO, scope?: string) => {
  const exactKey = normalizeQuoteSymbolKey(meta.symbol);
  const normalizedKey = normalizeSymbol(meta.symbol);
  if (exactKey) {
    instrumentMetaCache.set(getScopedCacheKey(scope, exactKey), meta);
  }
  if (normalizedKey) {
    instrumentMetaCache.set(getScopedCacheKey(scope, normalizedKey), meta);
  }
};

export const getCachedInstrumentMeta = (symbol: string, scope?: string): InstrumentMetaDTO | undefined => {
  const exactKey = normalizeQuoteSymbolKey(symbol);
  const normalizedKey = normalizeSymbol(symbol);
  return (
    instrumentMetaCache.get(getScopedCacheKey(scope, exactKey)) ??
    instrumentMetaCache.get(getScopedCacheKey(scope, normalizedKey))
  );
};

export const normalizeInstrumentMetaPayload = (
  payload: unknown,
  fallbackSymbol?: string,
): InstrumentMetaDTO => {
  const record = unwrapInstrumentRecord(payload) ?? {};
  const symbol = pickStringField(record, INSTRUMENT_FIELD_KEYS) ?? fallbackSymbol ?? '';
  const digits = pickDigits(record);
  const meta: InstrumentMetaDTO = {
    ...(record as Partial<InstrumentMetaDTO>),
    symbol,
  };

  if (digits !== undefined) {
    meta.digits = digits;
  }

  return meta;
};

const collectInstrumentItems = (value: unknown, items: unknown[], visited: Set<unknown>): void => {
  if (!value || visited.has(value)) {
    return;
  }

  if (Array.isArray(value)) {
    visited.add(value);
    for (const item of value) {
      items.push(item);
      const itemRecord = asRecord(item);
      if (!itemRecord) {
        continue;
      }
      for (const key of INSTRUMENT_LIST_KEYS) {
        collectInstrumentItems(itemRecord[key], items, visited);
      }
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  visited.add(value);
  for (const key of INSTRUMENT_LIST_KEYS) {
    collectInstrumentItems(record[key], items, visited);
  }
};

export const primeInstrumentMetaCacheFromCatalogPayload = (payload: unknown, scope?: string): void => {
  const items: unknown[] = [];
  collectInstrumentItems(payload, items, new Set());
  for (const item of items) {
    const meta = normalizeInstrumentMetaPayload(item);
    if (meta.symbol) {
      cacheInstrumentMeta(meta, scope);
    }
  }
};
