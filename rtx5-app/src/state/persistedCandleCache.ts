import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  MAX_CANDLE_SERIES_LENGTH,
  isRenderableCandleBootstrapSeed,
  isTrustworthyCandleBootstrapSeed,
  normalizeSymbol,
  normalizeTimeframe,
  sortAndDedupeCandles,
} from '../domain/candles';
import { Candle, useTradingState } from './tradingState';

const STORAGE_KEY = 'rtx5:chart-candle-cache:v1';
const STORAGE_VERSION = 1;
const MAX_PERSISTED_ENTRIES = 16;
const PERSIST_THROTTLE_MS = 5000;

type PersistedCandleCacheEntry = {
  symbol: string;
  timeframe: string;
  updatedAt: number;
  candles: Candle[];
};

type PersistedCandleCacheState = {
  version: typeof STORAGE_VERSION;
  entries: Record<string, PersistedCandleCacheEntry>;
};

const emptyStorage = (): PersistedCandleCacheState => ({
  version: STORAGE_VERSION,
  entries: {},
});

const normalizeCacheKey = (symbol: string, timeframe: string) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);

  if (!normalizedSymbol || !normalizedTimeframe) {
    return null;
  }

  return {
    key: `${normalizedSymbol}.${normalizedTimeframe}`,
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  };
};

const sanitizeCandles = (candles: Candle[]): Candle[] =>
  sortAndDedupeCandles(candles)
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.volume),
    )
    .slice(-MAX_CANDLE_SERIES_LENGTH);

const parseStorage = (raw: string | null): PersistedCandleCacheState => {
  if (!raw) {
    return emptyStorage();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCandleCacheState>;
    if (parsed.version !== STORAGE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
      return emptyStorage();
    }

    return {
      version: STORAGE_VERSION,
      entries: parsed.entries,
    };
  } catch (error) {
    console.warn('[persistedCandleCache] Failed to parse candle cache', error);
    return emptyStorage();
  }
};

let storageSnapshot: PersistedCandleCacheState | null = null;
let storageReadPromise: Promise<PersistedCandleCacheState> | null = null;
let storageWriteQueue: Promise<void> = Promise.resolve();
const pendingWrites = new Map<string, PersistedCandleCacheEntry>();
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastWriteAt = new Map<string, number>();
const lastScheduledSignature = new Map<string, string>();
const hydrationPromises = new Map<string, Promise<Candle[]>>();

const readStorage = async (): Promise<PersistedCandleCacheState> => {
  if (storageSnapshot) {
    return storageSnapshot;
  }

  if (!storageReadPromise) {
    storageReadPromise = AsyncStorage.getItem(STORAGE_KEY)
      .then(parseStorage)
      .catch((error) => {
        console.warn('[persistedCandleCache] Failed to read candle cache', error);
        return emptyStorage();
      })
      .then((state) => {
        storageSnapshot = state;
        return state;
      });
  }

  return storageReadPromise;
};

const trimEntries = (entries: Record<string, PersistedCandleCacheEntry>) => {
  const ordered = Object.entries(entries).sort(
    (left, right) => right[1].updatedAt - left[1].updatedAt,
  );
  return Object.fromEntries(ordered.slice(0, MAX_PERSISTED_ENTRIES));
};

const flushPersistedEntry = (key: string) => {
  const entry = pendingWrites.get(key);
  if (!entry) {
    return;
  }

  pendingWrites.delete(key);
  lastWriteAt.set(key, Date.now());

  storageWriteQueue = storageWriteQueue
    .then(async () => {
      const current = await readStorage();
      const nextState: PersistedCandleCacheState = {
        version: STORAGE_VERSION,
        entries: trimEntries({
          ...current.entries,
          [key]: entry,
        }),
      };

      storageSnapshot = nextState;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    })
    .catch((error) => {
      console.warn('[persistedCandleCache] Failed to write candle cache', error);
    });
};

const schedulePersistedEntry = (key: string) => {
  if (writeTimers.has(key)) {
    return;
  }

  const elapsed = Date.now() - (lastWriteAt.get(key) ?? 0);
  const delay = Math.max(0, PERSIST_THROTTLE_MS - elapsed);
  const timer = setTimeout(() => {
    writeTimers.delete(key);
    flushPersistedEntry(key);
  }, delay);
  writeTimers.set(key, timer);
};

const buildSignature = (candles: Candle[]): string => {
  const last = candles[candles.length - 1];
  return last ? `${candles.length}:${last.time}:${last.open}:${last.high}:${last.low}:${last.close}:${last.volume}` : 'empty';
};

export const persistCanonicalCandleCache = (
  symbol: string,
  timeframe: string,
  candles: Candle[],
): void => {
  const normalized = normalizeCacheKey(symbol, timeframe);
  if (!normalized || candles.length === 0) {
    return;
  }

  const safeCandles = sanitizeCandles(candles);
  if (!isTrustworthyCandleBootstrapSeed(safeCandles, normalized.timeframe)) {
    return;
  }

  const signature = buildSignature(safeCandles);
  if (lastScheduledSignature.get(normalized.key) === signature) {
    return;
  }

  lastScheduledSignature.set(normalized.key, signature);
  pendingWrites.set(normalized.key, {
    symbol: normalized.symbol,
    timeframe: normalized.timeframe,
    updatedAt: Date.now(),
    candles: safeCandles,
  });
  schedulePersistedEntry(normalized.key);
};

export const hydratePersistedCandleCache = async (
  symbol: string,
  timeframe: string,
): Promise<Candle[]> => {
  const normalized = normalizeCacheKey(symbol, timeframe);
  if (!normalized) {
    return [];
  }

  const existingHydration = hydrationPromises.get(normalized.key);
  if (existingHydration) {
    return existingHydration;
  }

  const hydration = readStorage()
    .then((state) => {
      const entry = state.entries[normalized.key];
      if (!entry || !Array.isArray(entry.candles)) {
        return [];
      }

      const safeCandles = sanitizeCandles(entry.candles);
      if (!isRenderableCandleBootstrapSeed(safeCandles, normalized.timeframe)) {
        return [];
      }

      useTradingState.getState().setCandleHistory(
        normalized.symbol,
        normalized.timeframe,
        safeCandles,
      );
      return safeCandles;
    })
    .catch((error) => {
      console.warn('[persistedCandleCache] Failed to hydrate candle cache', error);
      return [];
    })
    .finally(() => {
      hydrationPromises.delete(normalized.key);
    });

  hydrationPromises.set(normalized.key, hydration);
  return hydration;
};
