import type { Candle } from '../../domain/candles/core/candleTypes';
import {
  getBucketStart,
  normalizeTimestampToSeconds,
} from '../../domain/candles/core/timeframeUtils';
import {
  areCandlePricesCoherent,
  isPriceCoherentWithCandle,
} from '../../domain/candles/series/priceCoherence';

type LivePriceInput = {
  price: number | null | undefined;
  time?: unknown;
  nowSeconds?: number;
};

const isFinitePositivePrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const MIN_TRUSTED_HISTORY_PREFIX_TO_KEEP = 20;
const MAX_UNCONFIRMED_FLAT_TAIL_CANDLES = 5;

const isFlatQuoteOnlyCandle = (candle: Candle): boolean => {
  const values = [candle.open, candle.high, candle.low, candle.close];
  if (!values.every(Number.isFinite)) {
    return false;
  }

  return values.every((value) => value === candle.close);
};

type RuntimeCandleMetadata = {
  closed?: boolean;
  lastBackendUpdateTime?: number;
  lastQuoteTime?: number;
  source?: 'history' | 'live_candle';
};

const finiteRuntimeTime = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const isQuoteGeneratedFlatTailCandle = (candle: Candle): boolean => {
  if (!isFlatQuoteOnlyCandle(candle)) {
    return false;
  }

  const runtimeCandle = candle as Candle & RuntimeCandleMetadata;
  if (runtimeCandle.source !== 'live_candle' || runtimeCandle.closed === true) {
    return false;
  }

  const lastQuoteTime = finiteRuntimeTime(runtimeCandle.lastQuoteTime);
  if (lastQuoteTime === null) {
    return false;
  }

  const lastBackendUpdateTime = finiteRuntimeTime(runtimeCandle.lastBackendUpdateTime);
  return lastBackendUpdateTime === null || lastQuoteTime > lastBackendUpdateTime;
};

const removeIncoherentFlatTail = (candles: readonly Candle[]): readonly Candle[] => {
  if (candles.length <= MIN_TRUSTED_HISTORY_PREFIX_TO_KEEP) {
    return candles;
  }

  let tailStart = candles.length;
  while (
    tailStart > 0 &&
    candles.length - tailStart < MAX_UNCONFIRMED_FLAT_TAIL_CANDLES &&
    isQuoteGeneratedFlatTailCandle(candles[tailStart - 1])
  ) {
    tailStart -= 1;
  }

  if (tailStart === candles.length || tailStart < MIN_TRUSTED_HISTORY_PREFIX_TO_KEEP) {
    return candles;
  }

  const historyAnchor = candles[tailStart - 1];
  if (!historyAnchor) {
    return candles;
  }

  for (let index = tailStart; index < candles.length; index += 1) {
    const tailCandle = candles[index];
    if (tailCandle && !areCandlePricesCoherent(historyAnchor, tailCandle)) {
      return candles.slice(0, index);
    }
  }

  return candles;
};

const buildLivePriceCandle = (
  price: number,
  timeframe: string,
  time: unknown,
  nowSeconds: number,
): Candle | null => {
  const normalizedTime = normalizeTimestampToSeconds(time) ?? nowSeconds;
  if (!Number.isFinite(normalizedTime) || normalizedTime <= 0) {
    return null;
  }

  const bucketTime = getBucketStart(normalizedTime, timeframe) ?? Math.floor(normalizedTime);
  return {
    time: bucketTime,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 0,
  };
};

export const resolveLivePriceCoherentCandles = (
  candles: readonly Candle[],
  timeframe: string,
  livePrice: LivePriceInput,
): Candle[] => {
  const displayCandles = removeIncoherentFlatTail(candles);

  if (!isFinitePositivePrice(livePrice.price)) {
    return displayCandles as Candle[];
  }

  const nowSeconds = livePrice.nowSeconds ?? Math.floor(Date.now() / 1000);
  const liveCandle = buildLivePriceCandle(livePrice.price, timeframe, livePrice.time, nowSeconds);
  if (!liveCandle) {
    return displayCandles as Candle[];
  }

  const lastCandle = displayCandles[displayCandles.length - 1];
  if (!lastCandle) {
    return [liveCandle];
  }

  if (isPriceCoherentWithCandle(lastCandle, livePrice.price)) {
    let coherentStartIndex = displayCandles.length - 1;
    for (let index = displayCandles.length - 2; index >= 0; index -= 1) {
      if (!isPriceCoherentWithCandle(displayCandles[index], livePrice.price)) {
        break;
      }
      coherentStartIndex = index;
    }

    if (coherentStartIndex > 0) {
      if (coherentStartIndex >= MIN_TRUSTED_HISTORY_PREFIX_TO_KEEP) {
        return displayCandles as Candle[];
      }

      return displayCandles.slice(coherentStartIndex) as Candle[];
    }

    return displayCandles as Candle[];
  }

  if (displayCandles.length >= MIN_TRUSTED_HISTORY_PREFIX_TO_KEEP) {
    if (liveCandle.time > lastCandle.time) {
      return displayCandles as Candle[];
    }
    if (liveCandle.time === lastCandle.time) {
      return displayCandles as Candle[];
    }
    return displayCandles as Candle[];
  }

  return [liveCandle];
};
