import type { Candle, MutableCandle } from './candleTypes';
import { validateCandle } from './candleValidator';

export const cloneCandle = <TCandle extends Candle>(candle: TCandle): TCandle => ({ ...candle });

export const sortAndDedupeCandles = <TCandle extends Candle>(candles: readonly TCandle[]): TCandle[] => {
  const byTime = new Map<number, TCandle>();

  for (const candle of candles) {
    if (!validateCandle(candle)) {
      continue;
    }
    byTime.set(candle.time, cloneCandle(candle));
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
    .filter(validateCandle)
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

export const mergeHistoryAndLiveMaps = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  limit?: number,
): Candle[] => {
  const map = createCandleMap(historyCandles);
  for (const candle of sortAndDedupeCandles(liveCandles)) {
    map.set(candle.time, {
      ...candle,
      source: 'live_candle',
      closed: false,
    });
  }

  return materializeCandleMap(map, limit);
};
