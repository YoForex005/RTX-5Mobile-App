import AsyncStorage from '@react-native-async-storage/async-storage';

import { sanitizeCandlesForChart } from '../normalization/chartAdapter';
import {
  MAX_PERSISTED_CANDLE_CACHE_ENTRIES,
  MAX_CANDLE_SERIES_LENGTH,
  isTrustworthyCandleBootstrapSeed,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/candles';
import type { Candle } from '../../../state/tradingState';
import { useTradingState } from '../../../state/tradingState';

const STORAGE_KEY = 'rtx5:chart-candle-cache:v1';
/** Schema version. Bump this if `PersistedCandleCacheEntry` structure changes. */
const STORAGE_VERSION = 3;
/** Minimum delay between writing to device storage to prevent IO thrashing. */
const PERSIST_THROTTLE_MS = 5000;

/** Represents a single cached candle series on disk. */
type PersistedCandleCacheEntry = {
  symbol: string;
  timeframe: string;
  /** Unix timestamp of when this entry was last saved. */
  updatedAt: number;
  candles: Candle[];
};

/** The full payload saved to AsyncStorage. */
type PersistedCandleCacheState = {
  version: typeof STORAGE_VERSION;
  /** Map of normalized string keys (e.g. "EURUSD.M1") to their cache entries. */
  entries: Record<string, PersistedCandleCacheEntry>;
};

/** Returns an empty shell for the persistent state. */
const emptyStorage = (): PersistedCandleCacheState => ({
  version: STORAGE_VERSION,
  entries: {},
});

const normalizeCacheKey = (symbol: string, timeframe: string) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);

  if (!normalizedSymbol || !normalizedTimeframe) {
    return null;
  }

  return {
    key: `${normalizedSymbol}.${normalizedTimeframe}`,
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  };
};

/** Ensures a restored array of candles fits within safe memory limits. */
const sanitizeCandles = (candles: Candle[], timeframe: string): Candle[] =>
  sanitizeCandlesForChart(candles).slice(-MAX_CANDLE_SERIES_LENGTH);

/** 
 * Enforces a maximum number of cached chart series on disk. 
 * Evicts the least-recently-updated charts if the limit is exceeded.
 */
const trimEntries = (entries: Record<string, PersistedCandleCacheEntry>) => {
  const ordered = Object.entries(entries).sort(
    (left, right) => right[1].updatedAt - left[1].updatedAt,
  );
  return Object.fromEntries(ordered.slice(0, MAX_PERSISTED_CANDLE_CACHE_ENTRIES));
};

/**
 * Safely parses the raw JSON string from AsyncStorage into the typed state object.
 * Validates OHLCV structure and silently discards corrupted or outdated entries.
 */
const parseStorage = (raw: string | null): PersistedCandleCacheState => {
  if (!raw) {
    return emptyStorage();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCandleCacheState>;
    if (!parsed.entries || typeof parsed.entries !== 'object') {
      return emptyStorage();
    }

    const sanitizedEntries: Record<string, PersistedCandleCacheEntry> = {};
    for (const [key, entry] of Object.entries(parsed.entries as Record<string, Partial<PersistedCandleCacheEntry> & { candles?: Candle[] }>)) {
      if (!entry.symbol || !entry.timeframe || !Array.isArray(entry.candles)) {
        continue;
      }

      const timeframe = normalizeTimeframeStrict(entry.timeframe);
      if (!timeframe) {
        continue;
      }
      const candles = sanitizeCandles(entry.candles, timeframe);
      if (!isTrustworthyCandleBootstrapSeed(candles, timeframe)) {
        continue;
      }

      sanitizedEntries[key] = {
        symbol: normalizeSymbol(entry.symbol),
        timeframe,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
        candles,
      };
    }

    return {
      version: STORAGE_VERSION,
      entries: trimEntries(sanitizedEntries),
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

/**
 * Asynchronously writes a specific pending entry to disk.
 * Uses a chained Promise queue (`storageWriteQueue`) to ensure atomic writes
 * and prevent data corruption from overlapping saves.
 */
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

/**
 * Throttles writes to disk for a specific chart key.
 * Ensures we don't hammer the device storage when a high-frequency WS stream
 * tries to cache every few seconds.
 */
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

/**
 * Creates a fast string representation of the tail of the candle series.
 * Used to skip redundant disk writes if the newest candle hasn't changed.
 */
const buildSignature = (candles: Candle[]): string => {
  const last = candles[candles.length - 1];
  return last ? `${candles.length}:${last.time}:${last.open}:${last.high}:${last.low}:${last.close}:${last.volume}` : 'empty';
};

/**
 * Queues an array of historical candles to be saved to device storage.
 * - Rejects empty arrays or data lacking enough candles to bootstrap a chart.
 * - Deduplicates writes using a string signature of the latest candle.
 * - Throttles the actual disk IO.
 */
export const persistCanonicalCandleCache = (
  symbol: string,
  timeframe: string,
  candles: Candle[],
): void => {
  const normalized = normalizeCacheKey(symbol, timeframe);
  if (!normalized || candles.length === 0) {
    return;
  }

  const safeCandles = sanitizeCandles(candles, normalized.timeframe);
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

/**
 * Loads a cached series from device storage and injects it into the in-memory Zustand state.
 * Enables "zero-latency" chart rendering when navigating back to a previously viewed symbol.
 * - Deduplicates concurrent hydration requests for the same key.
 * - Silently catches and handles corrupted storage scenarios.
 */
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

      const safeCandles = sanitizeCandles(entry.candles, normalized.timeframe);
      if (!isTrustworthyCandleBootstrapSeed(safeCandles, normalized.timeframe)) {
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
