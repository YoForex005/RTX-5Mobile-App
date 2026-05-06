/**
 * Pure helpers for tick-trace processing. No React dependencies — easy to
 * unit-test and reuse from the live hook.
 */
import type { TickPoint } from './types';

export const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export const clampValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const roundToDecimals = (value: number, priceDecimals: number) =>
  Number(value.toFixed(Math.max(0, priceDecimals)));

export const isFiniteTickValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isValidTickPoint = (tick: TickPoint | null | undefined): tick is TickPoint =>
  Boolean(
    tick
      && isFiniteTickValue(tick.time)
      && isFiniteTickValue(tick.bid)
      && isFiniteTickValue(tick.ask)
      && tick.ask >= tick.bid,
  );

export const appendTick = (ticks: TickPoint[], nextTick: TickPoint, maxTicks: number) => {
  const nextTicks = [...ticks, nextTick];
  return nextTicks.length > maxTicks ? nextTicks.slice(nextTicks.length - maxTicks) : nextTicks;
};

export const resolveFallbackTickSize = (ticks: TickPoint[], priceDecimals: number) => {
  const fallbackPoint = Math.pow(10, -Math.max(0, priceDecimals || 0));
  const values = ticks
    .flatMap((tick) => [tick.bid, tick.ask])
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  let minDiff = Number.POSITIVE_INFINITY;
  for (let index = 1; index < values.length; index += 1) {
    const diff = Math.abs(values[index] - values[index - 1]);
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
    }
  }

  return Number.isFinite(minDiff) ? Math.max(fallbackPoint, minDiff) : fallbackPoint;
};

export const createDemoTick = (
  seedTick: TickPoint,
  priceDecimals: number,
  preferredBid?: number | null,
  preferredAsk?: number | null,
): TickPoint => {
  const fallbackPoint = Math.pow(10, -Math.max(0, priceDecimals || 0));
  const referenceSpread = isFiniteTickValue(preferredAsk)
    && isFiniteTickValue(preferredBid)
    && preferredAsk >= preferredBid
    ? preferredAsk - preferredBid
    : seedTick.ask - seedTick.bid;
  const spreadBase = Math.max(referenceSpread, fallbackPoint * 2);
  const deltaUnit = Math.max(fallbackPoint, spreadBase / 6);
  const moveOptions = [-3, -2, -1, 1, 2, 3];
  const shouldMove = Math.random() > 0.35;

  let nextBid = seedTick.bid;
  if (shouldMove) {
    const moveMultiplier = moveOptions[Math.floor(Math.random() * moveOptions.length)];
    nextBid = seedTick.bid + moveMultiplier * deltaUnit;
  }

  const spreadNoise = Math.random() > 0.7 ? deltaUnit * (Math.random() > 0.5 ? 1 : -1) * 0.35 : 0;
  const nextSpread = Math.max(fallbackPoint * 2, spreadBase + spreadNoise);

  return {
    time: Date.now(),
    bid: roundToDecimals(nextBid, priceDecimals),
    ask: roundToDecimals(nextBid + nextSpread, priceDecimals),
  };
};
