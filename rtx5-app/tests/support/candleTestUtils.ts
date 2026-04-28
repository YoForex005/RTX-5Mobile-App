import assert from 'node:assert/strict';

import {
  getBucketGapCount,
  getExpectedNextCandleTime,
  isStructurallyValidCandle,
  materializeCanonicalHistoryAndLiveCandles,
  normalizeSymbol,
  sortAndDedupeCandles,
} from '../../src/domain/candles';
import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
  validateQuoteTickForCandle,
  type RawQuoteTick,
  type ValidatedQuoteTick,
} from '../../src/api/ws/liveCandleOverlay';
import type {
  CandlePriceBasis,
  LiveOverlayCandle,
  TrustedHistoryCandle,
} from '../../src/domain/candleProvenance';
import type { Candle } from '../../src/state/tradingState';

export type CandleOverrides = Partial<Candle> & Record<string, unknown>;

export type MockHistoryRequest = {
  symbol: string;
  timeframe: string;
  limit?: number;
  from?: number;
  to?: number;
  signal?: AbortSignal;
};

type MockRestResponse =
  | { type: 'history'; candles: Candle[]; delayMs: number }
  | { type: 'failure'; error: Error; delayMs: number };

export type MockQuoteTick = {
  symbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  timestamp: number;
};

type MockQuoteListener = (tick: MockQuoteTick) => void;

export const secondsUtc = (
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number => Math.floor(Date.UTC(year, monthIndex, day, hour, minute, second) / 1000);

export const makeCandle = (time: number, overrides: CandleOverrides = {}): Candle => {
  const open = typeof overrides.open === 'number' ? overrides.open : 1.1;
  const close = typeof overrides.close === 'number' ? overrides.close : open;
  const high = typeof overrides.high === 'number' ? overrides.high : Math.max(open, close);
  const low = typeof overrides.low === 'number' ? overrides.low : Math.min(open, close);

  return {
    time,
    open,
    high,
    low,
    close,
    volume: typeof overrides.volume === 'number' ? overrides.volume : 10,
    ...overrides,
  };
};

export const makeTrustedHistoryCandle = (
  time: number,
  overrides: CandleOverrides & {
    priceBasis?: CandlePriceBasis;
    serverTimeframe?: string;
  } = {},
): TrustedHistoryCandle => ({
  ...makeCandle(time, overrides),
  source: 'rest',
  closed: true,
  priceBasis: overrides.priceBasis ?? 'bid',
  serverTimeframe: overrides.serverTimeframe ?? 'M1',
});

export const makeLiveOverlayCandle = (
  time: number,
  overrides: CandleOverrides & {
    firstTickTs?: number;
    lastTickTs?: number;
    firstSequence?: number;
    lastSequence?: number;
    priceBasis?: CandlePriceBasis;
  } = {},
): LiveOverlayCandle => ({
  ...makeCandle(time, overrides),
  source: 'live',
  closed: false,
  firstTickTs: overrides.firstTickTs ?? time,
  lastTickTs: overrides.lastTickTs ?? time,
  firstSequence: overrides.firstSequence ?? 1,
  lastSequence: overrides.lastSequence ?? 1,
  priceBasis: overrides.priceBasis ?? 'bid',
});

export const cloneCandles = <TCandle extends Candle>(candles: readonly TCandle[]): TCandle[] =>
  candles.map((candle) => ({ ...candle }));

export const validateBidTick = (
  price: number,
  timestamp: number,
  sequence = 1,
  input: Partial<RawQuoteTick> = {},
  referencePrice?: number | null,
): ValidatedQuoteTick => {
  const validated = validateQuoteTickForCandle(
    {
      bid: price,
      ask: price + 0.0001,
      timestamp,
      ...input,
    },
    {
      priceBasis: 'bid',
      sequence,
      referencePrice,
    },
  );
  assert.ok(validated, `expected valid tick for timestamp=${timestamp} price=${price}`);
  return validated;
};

export const assertNoDuplicateCandleTimes = (
  candles: readonly Pick<Candle, 'time'>[],
  label = 'candle series',
): void => {
  const seen = new Set<number>();
  for (const candle of candles) {
    assert.equal(seen.has(candle.time), false, `${label} contains duplicate time ${candle.time}`);
    seen.add(candle.time);
  }
};

export const assertValidCandleSeries = (
  candles: readonly Candle[],
  label = 'candle series',
): void => {
  assertNoDuplicateCandleTimes(candles, label);
  let previousTime = -Infinity;
  candles.forEach((candle, index) => {
    assert.equal(isStructurallyValidCandle(candle), true, `${label}[${index}] has invalid OHLC`);
    assert.ok(candle.time > previousTime, `${label}[${index}] is not strictly sorted by time`);
    previousTime = candle.time;
  });
};

export const assertContinuousHistoryLive = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  _timeframe: string,
  label = 'history/live',
): void => {
  assertNoDuplicateCandleTimes([...historyCandles, ...liveCandles], label);
};

export const materializeAndAssertClean = (
  historyCandles: Candle[],
  liveCandles: Candle[],
  timeframe: string,
): Candle[] => {
  assertContinuousHistoryLive(historyCandles, liveCandles, timeframe);
  const materialized = materializeCanonicalHistoryAndLiveCandles(historyCandles, liveCandles, timeframe);
  assertValidCandleSeries(materialized);
  return materialized;
};

export const reduceTicksToLiveCandle = (
  timeframe: string,
  ticks: Array<{ price: number; timestamp: number; sequence?: number }>,
  referenceBucketTime?: number,
): LiveOverlayCandle | null => {
  let candle: LiveOverlayCandle | null = null;

  ticks.forEach((input, index) => {
    const tick = validateBidTick(
      input.price,
      input.timestamp,
      input.sequence ?? index + 1,
      {},
      candle?.close ?? input.price,
    );
    const bucketTime = getLiveTickBucketTime(tick, timeframe, referenceBucketTime);
    if (!candle) {
      candle = createLiveCandleFromTick(bucketTime, tick);
      return;
    }
    assert.equal(bucketTime, candle.time, 'reduceTicksToLiveCandle only accepts one bucket');
    candle = mergeTickIntoLiveCandle(candle, tick);
  });

  return candle;
};

export const buildContiguousHistory = (
  startTime: number,
  count: number,
  timeframe: string,
  overrides: (index: number, time: number) => CandleOverrides = () => ({}),
): TrustedHistoryCandle[] => {
  const candles: TrustedHistoryCandle[] = [];
  let time = startTime;
  for (let index = 0; index < count; index += 1) {
    candles.push(makeTrustedHistoryCandle(time, overrides(index, time)));
    time = getExpectedNextCandleTime(time, timeframe);
  }
  return candles;
};

export class MockRestHistoryProvider {
  readonly requests: MockHistoryRequest[] = [];

  private readonly responses: MockRestResponse[] = [];

  queueHistory(candles: Candle[], delayMs = 0): this {
    this.responses.push({ type: 'history', candles: cloneCandles(candles), delayMs });
    return this;
  }

  queueFailure(error: Error | string = new Error('mock REST failure'), delayMs = 0): this {
    this.responses.push({
      type: 'failure',
      error: typeof error === 'string' ? new Error(error) : error,
      delayMs,
    });
    return this;
  }

  async fetchHistory(request: MockHistoryRequest): Promise<Candle[]> {
    this.requests.push({ ...request, symbol: normalizeSymbol(request.symbol) });
    const next = this.responses.shift();
    if (!next) {
      return [];
    }

    if (next.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, next.delayMs));
    }

    if (request.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    if (next.type === 'failure') {
      throw next.error;
    }

    return cloneCandles(next.candles);
  }
}

export class MockWebSocketQuoteStream {
  private readonly listenersBySymbol = new Map<string, Set<MockQuoteListener>>();

  private connected = true;

  subscribe(symbol: string, listener: MockQuoteListener): () => void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const listeners = this.listenersBySymbol.get(normalizedSymbol) ?? new Set<MockQuoteListener>();
    listeners.add(listener);
    this.listenersBySymbol.set(normalizedSymbol, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersBySymbol.delete(normalizedSymbol);
      }
    };
  }

  disconnect(): void {
    this.connected = false;
  }

  reconnect(): void {
    this.connected = true;
  }

  listenerCount(symbol: string): number {
    return this.listenersBySymbol.get(normalizeSymbol(symbol))?.size ?? 0;
  }

  emit(tick: MockQuoteTick): number {
    if (!this.connected) {
      return 0;
    }

    const normalizedSymbol = normalizeSymbol(tick.symbol);
    const listeners = this.listenersBySymbol.get(normalizedSymbol);
    if (!listeners) {
      return 0;
    }

    const normalizedTick = { ...tick, symbol: normalizedSymbol };
    listeners.forEach((listener) => listener(normalizedTick));
    return listeners.size;
  }

  emitBurst(symbol: string, ticks: Array<Omit<MockQuoteTick, 'symbol'>>): number {
    return ticks.reduce((count, tick) => count + this.emit({ ...tick, symbol }), 0);
  }
}

export const normalizeVisibleTimes = (candles: Candle[]): number[] =>
  sortAndDedupeCandles(candles).map((candle) => candle.time);
