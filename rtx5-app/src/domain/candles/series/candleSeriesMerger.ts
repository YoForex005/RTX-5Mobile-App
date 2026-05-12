import type { Candle, MutableCandle } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import { areCandlePricesCoherent, isCandleInternallyCoherent } from './priceCoherence';

export const cloneCandle = <TCandle extends Candle>(candle: TCandle): TCandle => ({ ...candle });

export type CandleVolumeMergeStrategy = 'sum' | 'incoming' | 'existing' | 'max';

export type CandleMergeOptions = {
  closeSource?: 'incoming' | 'existing';
  volumeStrategy?: CandleVolumeMergeStrategy;
};

const hasFiniteVolume = (candle: Pick<Candle, 'volume'>): boolean =>
  Number.isFinite(candle.volume);

const resolveMergedVolume = (
  existing: Candle,
  incoming: Candle,
  strategy: CandleVolumeMergeStrategy,
): number => {
  const existingVolume = hasFiniteVolume(existing) ? existing.volume : 0;
  const incomingVolume = hasFiniteVolume(incoming) ? incoming.volume : 0;

  switch (strategy) {
    case 'incoming':
      return incomingVolume;
    case 'existing':
      return existingVolume;
    case 'max':
      return Math.max(existingVolume, incomingVolume);
    case 'sum':
    default:
      return existingVolume + incomingVolume;
  }
};

export const areCandleValuesEqual = (left: Candle, right: Candle): boolean =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  (left.volume ?? 0) === (right.volume ?? 0);

export const mergeCandleByTimestamp = <TCandle extends Candle>(
  existing: TCandle,
  incoming: Candle,
  options: CandleMergeOptions = {},
): TCandle => {
  const closeSource = options.closeSource ?? 'incoming';
  const volumeStrategy = options.volumeStrategy ?? 'sum';
  const next = {
    ...existing,
    ...incoming,
    time: existing.time,
    open: existing.open,
    high: Math.max(existing.high, incoming.high),
    low: Math.min(existing.low, incoming.low),
    close: closeSource === 'existing' ? existing.close : incoming.close,
    volume: resolveMergedVolume(existing, incoming, volumeStrategy),
  };

  return next as TCandle;
};

export const mergeCandleIntoMap = (
  candleMap: Map<number, MutableCandle>,
  candle: Candle,
  options: CandleMergeOptions & {
    source?: MutableCandle['source'];
    closed?: boolean;
    firstUpdateTime?: number;
    lastUpdateTime?: number;
  } = {},
): MutableCandle | null => {
  if (!validateCandle(candle) || !isCandleInternallyCoherent(candle)) {
    return null;
  }

  const existing = candleMap.get(candle.time);
  const next: MutableCandle = existing
    ? areCandlePricesCoherent(existing, candle)
      ? mergeCandleByTimestamp(existing, candle, options)
      : { ...candle }
    : {
        ...candle,
      };

  next.source = options.source ?? existing?.source;
  next.closed = options.closed ?? existing?.closed;
  next.firstUpdateTime = options.firstUpdateTime ?? existing?.firstUpdateTime;
  next.lastUpdateTime = options.lastUpdateTime ?? existing?.lastUpdateTime;

  if (!validateCandle(next) || !isCandleInternallyCoherent(next)) {
    return null;
  }

  candleMap.set(candle.time, next);
  return next;
};

export const sortAndDedupeCandles = <TCandle extends Candle>(candles: readonly TCandle[]): TCandle[] => {
  const byTime = new Map<number, TCandle>();

  for (const candle of candles) {
    if (!validateCandle(candle) || !isCandleInternallyCoherent(candle)) {
      continue;
    }
    const existing = byTime.get(candle.time);
    byTime.set(
      candle.time,
      existing
        ? areCandlePricesCoherent(existing, candle)
          ? mergeCandleByTimestamp(existing, candle)
          : cloneCandle(candle)
        : cloneCandle(candle),
    );
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
};

export const createCandleMap = (candles: readonly Candle[] = []): Map<number, MutableCandle> => {
  const map = new Map<number, MutableCandle>();
  for (const candle of sortAndDedupeCandles(candles)) {
    map.set(candle.time, {
      ...candle,
      source: 'history',
      closed: true,
    });
  }
  return map;
};

export const mergeHistoryCandles = (historyCandles: readonly Candle[]): Candle[] =>
  sortAndDedupeCandles(historyCandles);

export const materializeCandleMap = (
  candleMap: Map<number, MutableCandle>,
  limit?: number,
): Candle[] => {
  const candles = Array.from(candleMap.values())
    .filter((candle) => validateCandle(candle) && isCandleInternallyCoherent(candle))
    .map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume ?? 0,
    }))
    .sort((left, right) => left.time - right.time);

  return typeof limit === 'number' && limit > 0 ? candles.slice(-limit) : candles;
};

import { getBucketStart } from '../core/timeframeUtils';

export const mergeHistoryAndLiveMaps = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  timeframe: string,
  limit?: number,
): Candle[] => {
  const map = new Map<number, MutableCandle>();
  
  for (const candle of sortAndDedupeCandles(historyCandles)) {
    const bucketStart = getBucketStart(candle.time, timeframe) ?? candle.time;
    map.set(bucketStart, {
      ...candle,
      source: 'history',
      closed: true,
    });
  }

  for (const candle of sortAndDedupeCandles(liveCandles)) {
    const bucketStart = getBucketStart(candle.time, timeframe) ?? candle.time;
    mergeCandleIntoMap(map, { ...candle, time: bucketStart }, {
      source: 'live_candle',
      closed: false,
      volumeStrategy: 'sum',
    });
  }

  return materializeCandleMap(map, limit);
};
