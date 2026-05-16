import type { Candle, LiveCandle, MutableCandle } from '../core/candleTypes';
import {
  getBucketStart,
  getExpectedNextCandleTime,
  normalizeTimestampToSeconds,
} from '../core/timeframeUtils';
import { validateCandle } from '../core/candleValidator';
import {
  areCandleValuesEqual,
  bucketCandle,
  toPublicCandle,
} from '../core/candleUtils';
import { isPriceCoherentWithCandle } from './priceCoherence';

export type ApplyCandleOptions = {
  historyCutoffTime?: number | null;
};

export type ApplyCandleResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
};

export type ApplyQuoteTickExtensionOptions = {
  historyCutoffTime?: number | null;
  latestHistoryCandle?: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'> | null;
};

export type ApplyQuoteTickExtensionResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
};

const getMapTailTime = (candleMap: Map<number, MutableCandle>): number | null => {
  let tail: number | null = null;
  for (const time of candleMap.keys()) {
    if (tail === null || time > tail) {
      tail = time;
    }
  }
  return tail;
};

const getLatestKnownBucket = (...times: Array<number | null>): number | null =>
  times
    .filter((time): time is number => typeof time === 'number' && Number.isFinite(time))
    .reduce<number | null>((latest, time) => (latest === null || time > latest ? time : latest), null);

const finiteOrNull = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const getLastBackendUpdateTime = (candle: MutableCandle | undefined): number | null => {
  if (!candle) {
    return null;
  }
  return finiteOrNull(candle.lastBackendUpdateTime) ?? (
    candle.lastQuoteTime === undefined ? finiteOrNull(candle.lastUpdateTime) : null
  );
};

const getLastRealtimeUpdateTime = (candle: MutableCandle | undefined): number | null => {
  if (!candle) {
    return null;
  }
  const backendTime = getLastBackendUpdateTime(candle);
  const quoteTime = finiteOrNull(candle.lastQuoteTime);
  if (backendTime === null) {
    return quoteTime;
  }
  if (quoteTime === null) {
    return backendTime;
  }
  return Math.max(backendTime, quoteTime);
};

const seedFromCandleClose = (
  bucketStart: number,
  seed: Pick<Candle, 'close'>,
  price: number,
): MutableCandle => ({
  time: bucketStart,
  open: seed.close,
  high: Math.max(seed.close, price),
  low: Math.min(seed.close, price),
  close: price,
  volume: 0,
  source: 'live_candle',
  closed: false,
});

const seedFromTick = (bucketStart: number, price: number): MutableCandle => ({
  time: bucketStart,
  open: price,
  high: price,
  low: price,
  close: price,
  volume: 0,
  source: 'live_candle',
  closed: false,
});

const seedFromHistoryBucket = (
  bucketStart: number,
  historyCandle: Pick<Candle, 'open' | 'high' | 'low' | 'close' | 'volume'>,
  price: number,
): MutableCandle => ({
  time: bucketStart,
  open: historyCandle.open,
  high: Math.max(historyCandle.high, historyCandle.open, historyCandle.close, price),
  low: Math.min(historyCandle.low, historyCandle.open, historyCandle.close, price),
  close: price,
  volume: historyCandle.volume ?? 0,
  source: 'live_candle',
  closed: false,
});

export const applyLiveCandleToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  liveCandle: LiveCandle,
  timeframe?: string,
  options: ApplyCandleOptions = {},
): ApplyCandleResult => {
  const incoming = bucketCandle(liveCandle, timeframe);
  if (!incoming) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_live_candle' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && incoming.time <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const existing = candleMap.get(incoming.time);
  const isClosingSnapshot = liveCandle.closed === true;
  if (existing?.source === 'live_candle' && existing.closed === true && !isClosingSnapshot) {
    return { candle: toPublicCandle(existing), changed: false, ignored: true, reason: 'closed_live_candle' };
  }

  if (existing && areCandleValuesEqual(toPublicCandle(existing), incoming)) {
    return { candle: toPublicCandle(existing), changed: false, ignored: false };
  }

  const eventTime = normalizeTimestampToSeconds(liveCandle.time) ?? incoming.time;
  const lastBackendUpdateTime = getLastBackendUpdateTime(existing);
  const outOfOrderSameBucket =
    existing?.source === 'live_candle' &&
    lastBackendUpdateTime !== null &&
    eventTime < lastBackendUpdateTime;

  let next: MutableCandle;
  if (!existing || existing.source === 'history' || isClosingSnapshot) {
    next = {
      ...incoming,
      source: 'live_candle',
      closed: liveCandle.closed ?? false,
      firstUpdateTime: existing?.firstUpdateTime ?? eventTime,
      lastUpdateTime: eventTime,
      lastBackendUpdateTime: eventTime,
      lastQuoteTime: existing?.lastQuoteTime,
    };
  } else if (outOfOrderSameBucket) {
    next = {
      time: incoming.time,
      open: existing.open,
      high: Math.max(existing.high, incoming.high, incoming.open, incoming.close, existing.open, existing.close),
      low: Math.min(existing.low, incoming.low, incoming.open, incoming.close, existing.open, existing.close),
      close: existing.close,
      volume: Math.max(existing.volume ?? 0, incoming.volume ?? 0),
      source: 'live_candle',
      closed: existing.closed ?? false,
      firstUpdateTime: Math.min(existing.firstUpdateTime ?? eventTime, eventTime),
      lastUpdateTime: existing.lastUpdateTime,
      lastBackendUpdateTime: existing.lastBackendUpdateTime,
      lastQuoteTime: existing.lastQuoteTime,
    };
  } else {
    next = {
      ...incoming,
      source: 'live_candle',
      closed: false,
      firstUpdateTime: Math.min(existing.firstUpdateTime ?? eventTime, eventTime),
      lastUpdateTime: eventTime,
      lastBackendUpdateTime: eventTime,
      lastQuoteTime: existing.lastQuoteTime,
    };
  }

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_live_candle' };
  }

  candleMap.set(incoming.time, next);
  const result: ApplyCandleResult = {
    candle: toPublicCandle(next),
    changed: !existing || !areCandleValuesEqual(toPublicCandle(existing), toPublicCandle(next)),
    ignored: false,
  };
  if (outOfOrderSameBucket) {
    result.reason = 'merged_out_of_order_live_candle';
  }
  return result;
};

export const applyQuoteTickExtensionToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  tick: { price: number; time: unknown },
  timeframe: string,
  options: ApplyQuoteTickExtensionOptions = {},
): ApplyQuoteTickExtensionResult => {
  if (!Number.isFinite(tick.price) || tick.price <= 0) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_price' };
  }

  const tickTime = normalizeTimestampToSeconds(tick.time);
  if (tickTime === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_timestamp' };
  }

  const bucketStart = getBucketStart(tickTime, timeframe);
  if (bucketStart === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_bucket' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && bucketStart <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const hadExistingBucket = candleMap.has(bucketStart);
  let existing = candleMap.get(bucketStart);
  if (existing?.closed === true) {
    return { candle: toPublicCandle(existing), changed: false, ignored: true, reason: 'closed_live_candle' };
  }
  const lastRealtimeUpdateTime = getLastRealtimeUpdateTime(existing);
  if (
    existing?.source === 'live_candle' &&
    lastRealtimeUpdateTime !== null &&
    tickTime < lastRealtimeUpdateTime
  ) {
    return { candle: toPublicCandle(existing), changed: false, ignored: true, reason: 'stale_quote_tick' };
  }

  if (!existing) {
    const restTail = options.latestHistoryCandle ?? null;
    const restTailBucket = restTail ? (getBucketStart(restTail.time, timeframe) ?? restTail.time) : null;
    const liveTailTime = getMapTailTime(candleMap);
    const latestKnownBucket = getLatestKnownBucket(restTailBucket, liveTailTime);

    if (restTail && restTailBucket === bucketStart) {
      if (!isPriceCoherentWithCandle(restTail, tick.price)) {
        existing = seedFromTick(bucketStart, tick.price);
      } else {
        existing = seedFromHistoryBucket(bucketStart, restTail, tick.price);
      }
    } else if (latestKnownBucket !== null && bucketStart < latestKnownBucket) {
      return {
        candle: null,
        changed: false,
        ignored: true,
        reason: restTailBucket !== null && restTailBucket > bucketStart
          ? 'tick_older_than_history'
          : 'tick_older_than_live_tail',
      };
    } else if (latestKnownBucket !== null && bucketStart === getExpectedNextCandleTime(latestKnownBucket, timeframe)) {
      const liveTail = liveTailTime === latestKnownBucket ? candleMap.get(latestKnownBucket) : undefined;
      const seed = liveTail ?? (restTailBucket === latestKnownBucket ? restTail : null);
      if (seed && !isPriceCoherentWithCandle(seed, tick.price)) {
        existing = seedFromTick(bucketStart, tick.price);
      } else {
        existing = seed ? seedFromCandleClose(bucketStart, seed, tick.price) : seedFromTick(bucketStart, tick.price);
      }
    } else if (latestKnownBucket === null) {
      existing = seedFromTick(bucketStart, tick.price);
    } else {
      // The backend candle channel may be behind the quote feed by several
      // buckets. Do not fabricate the missing buckets; open only the current
      // tick bucket so the chart keeps forming live while preserving the gap.
      existing = seedFromTick(bucketStart, tick.price);
    }
  }

  const next: MutableCandle = {
    ...existing,
    high: Math.max(existing.high, tick.price),
    low: Math.min(existing.low, tick.price),
    close: tick.price,
    source: 'live_candle',
    closed: false,
    firstUpdateTime:
      existing.firstUpdateTime === undefined
        ? tickTime
        : Math.min(existing.firstUpdateTime, tickTime),
    lastUpdateTime: Math.max(existing.lastUpdateTime ?? tickTime, tickTime),
    lastQuoteTime: Math.max(existing.lastQuoteTime ?? tickTime, tickTime),
  };

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_tick' };
  }

  candleMap.set(bucketStart, next);
  return {
    candle: toPublicCandle(next),
    changed: !hadExistingBucket ||
      next.high !== existing.high ||
      next.low !== existing.low ||
      next.close !== existing.close,
    ignored: false,
  };
};
