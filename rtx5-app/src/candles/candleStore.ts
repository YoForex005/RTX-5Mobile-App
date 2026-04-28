import type { Candle, CandleStreamKey } from './candleTypes';
import { sanitizeCandlesForChart } from './chartAdapter';
import { createCandleStreamKey } from './timeframeUtils';

const DEFAULT_MAX_CACHE_ENTRIES = 32;
const DEFAULT_MAX_CANDLES_PER_ENTRY = 2500;

type CacheEntry = {
  key: CandleStreamKey;
  candles: Candle[];
  updatedAt: number;
};

export class CandleMemoryCache {
  private entries = new Map<CandleStreamKey, CacheEntry>();

  constructor(
    private readonly maxEntries = DEFAULT_MAX_CACHE_ENTRIES,
    private readonly maxCandlesPerEntry = DEFAULT_MAX_CANDLES_PER_ENTRY,
  ) {}

  get(symbol: string, timeframe: string): Candle[] {
    const key = createCandleStreamKey(symbol, timeframe);
    const entry = this.entries.get(key);
    if (!entry) {
      return [];
    }

    entry.updatedAt = Date.now();
    return entry.candles.map((candle) => ({ ...candle }));
  }

  set(symbol: string, timeframe: string, candles: readonly Candle[]): Candle[] {
    const key = createCandleStreamKey(symbol, timeframe);
    const safeCandles = sanitizeCandlesForChart(candles).slice(-this.maxCandlesPerEntry);
    this.entries.set(key, {
      key,
      candles: safeCandles,
      updatedAt: Date.now(),
    });
    this.trim();
    return safeCandles;
  }

  delete(symbol: string, timeframe: string): void {
    this.entries.delete(createCandleStreamKey(symbol, timeframe));
  }

  clear(): void {
    this.entries.clear();
  }

  private trim(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const ordered = Array.from(this.entries.values()).sort((left, right) => right.updatedAt - left.updatedAt);
    const keep = new Set(ordered.slice(0, this.maxEntries).map((entry) => entry.key));
    for (const key of this.entries.keys()) {
      if (!keep.has(key)) {
        this.entries.delete(key);
      }
    }
  }
}

export const candleMemoryCache = new CandleMemoryCache();
