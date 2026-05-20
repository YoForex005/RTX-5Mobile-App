import type { Candle } from '../../domain/candles/core/candleTypes';
import {
  getBucketStart,
  normalizeTimestampToSeconds,
} from '../../domain/candles/core/timeframeUtils';
import { isPriceCoherentWithCandle } from '../../domain/candles/series/priceCoherence';

type LivePriceInput = {
  price: number | null | undefined;
  time?: unknown;
  nowSeconds?: number;
};

const isFinitePositivePrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

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
  if (!isFinitePositivePrice(livePrice.price)) {
    return candles as Candle[];
  }

  const nowSeconds = livePrice.nowSeconds ?? Math.floor(Date.now() / 1000);
  const liveCandle = buildLivePriceCandle(livePrice.price, timeframe, livePrice.time, nowSeconds);
  if (!liveCandle) {
    return candles as Candle[];
  }

  const lastCandle = candles[candles.length - 1];
  if (!lastCandle) {
    return [liveCandle];
  }

  if (isPriceCoherentWithCandle(lastCandle, livePrice.price)) {
    return candles as Candle[];
  }

  return [liveCandle];
};
