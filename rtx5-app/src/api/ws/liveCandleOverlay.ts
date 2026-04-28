import { alignTimeToBucketWithReference, normalizeTimestampToSeconds } from '../../domain/candles';
import type { CandlePriceBasis, LiveOverlayCandle } from '../../domain/candleProvenance';

export type RawQuoteTick = {
  bid?: unknown;
  ask?: unknown;
  last?: unknown;
  timestamp?: unknown;
};

export type ValidatedQuoteTick = {
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
  sequence: number;
  priceBasis: CandlePriceBasis;
  signature: string;
};

export type TickValidationOptions = {
  priceBasis: CandlePriceBasis;
  sequence: number;
  referencePrice?: number | null;
};

const MAX_SPREAD_TO_PRICE_RATIO = 0.1;
const MAX_TICK_MOVE_RATIO = 0.25;

const toPositiveFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveTickPrice = (
  tick: RawQuoteTick,
  priceBasis: CandlePriceBasis,
): { price: number; bid?: number; ask?: number } | null => {
  const bid = toPositiveFiniteNumber(tick.bid);
  const ask = toPositiveFiniteNumber(tick.ask);
  const last = toPositiveFiniteNumber(tick.last);

  if (bid !== null && ask !== null && ask < bid) {
    return null;
  }

  switch (priceBasis) {
    case 'ask':
      return ask === null ? null : { price: ask, bid: bid ?? undefined, ask };
    case 'mid':
      return bid === null || ask === null ? null : { price: (bid + ask) / 2, bid, ask };
    case 'last':
      return last === null ? null : { price: last, bid: bid ?? undefined, ask: ask ?? undefined };
    case 'bid':
    default:
      return bid === null ? null : { price: bid, bid, ask: ask ?? undefined };
  }
};

export const validateQuoteTickForCandle = (
  tick: RawQuoteTick,
  options: TickValidationOptions,
): ValidatedQuoteTick | null => {
  const timestamp = normalizeTimestampToSeconds(tick.timestamp);
  if (timestamp === null) {
    return null;
  }

  const resolved = resolveTickPrice(tick, options.priceBasis);
  if (!resolved || !Number.isFinite(resolved.price) || resolved.price <= 0) {
    return null;
  }

  if (resolved.bid !== undefined && resolved.ask !== undefined) {
    const spread = resolved.ask - resolved.bid;
    if (spread < 0 || spread / resolved.price > MAX_SPREAD_TO_PRICE_RATIO) {
      return null;
    }
  }

  if (
    typeof options.referencePrice === 'number' &&
    Number.isFinite(options.referencePrice) &&
    options.referencePrice > 0 &&
    Math.abs(resolved.price - options.referencePrice) / options.referencePrice > MAX_TICK_MOVE_RATIO
  ) {
    return null;
  }

  return {
    price: resolved.price,
    bid: resolved.bid,
    ask: resolved.ask,
    timestamp,
    sequence: options.sequence,
    priceBasis: options.priceBasis,
    signature: `${timestamp}:${options.priceBasis}:${resolved.bid ?? ''}:${resolved.ask ?? ''}:${resolved.price}`,
  };
};

export const getLiveTickBucketTime = (
  tick: ValidatedQuoteTick,
  timeframe: string,
  referenceBucketTime?: number | null,
): number => alignTimeToBucketWithReference(tick.timestamp, timeframe, referenceBucketTime);

const isTickAfter = (
  tick: ValidatedQuoteTick,
  timestamp: number,
  sequence: number,
): boolean =>
  tick.timestamp > timestamp || (tick.timestamp === timestamp && tick.sequence > sequence);

export const createLiveCandleFromTick = (
  bucketTime: number,
  tick: ValidatedQuoteTick,
): LiveOverlayCandle => ({
  time: bucketTime,
  open: tick.price,
  high: tick.price,
  low: tick.price,
  close: tick.price,
  volume: 0,
  source: 'live',
  closed: false,
  firstTickTs: tick.timestamp,
  lastTickTs: tick.timestamp,
  firstSequence: tick.sequence,
  lastSequence: tick.sequence,
  priceBasis: tick.priceBasis,
});

export const mergeTickIntoLiveCandle = (
  existing: LiveOverlayCandle,
  tick: ValidatedQuoteTick,
): LiveOverlayCandle => {
  const tickIsNewerThanClose = isTickAfter(tick, existing.lastTickTs, existing.lastSequence);

  return {
    ...existing,
    open: existing.open,
    high: Math.max(existing.high, tick.price),
    low: Math.min(existing.low, tick.price),
    close: tickIsNewerThanClose ? tick.price : existing.close,
    volume: existing.volume,
    firstTickTs: existing.firstTickTs,
    lastTickTs: tickIsNewerThanClose ? tick.timestamp : existing.lastTickTs,
    firstSequence: existing.firstSequence,
    lastSequence: tickIsNewerThanClose ? tick.sequence : existing.lastSequence,
  };
};
