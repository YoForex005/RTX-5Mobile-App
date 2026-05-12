import type { Candle, LiveCandle, MutableCandle } from '../core/candleTypes';
import {
  getBucketStart,
  getExpectedNextCandleTime,
  normalizeTimestampToSeconds,
} from '../core/timeframeUtils';
import { validateCandle } from '../core/candleValidator';
import { areCandleValuesEqual } from './candleSeriesMerger';
import { isPriceCoherentWithCandle } from './priceCoherence';

/**
 * Options used when applying a live candle update from the backend to the internal candle map.
 */
export type ApplyCandleOptions = {
  /** 
   * A unix timestamp threshold. Any live candle whose bucket starts before this time
   * is considered part of the closed history and will be ignored to prevent corrupting historical data.
   */
  historyCutoffTime?: number | null;
};

/**
 * Represents the outcome of attempting to apply a live candle update.
 */
export type ApplyCandleResult = {
  /** The finalized public candle object, or null if the update was ignored/invalid. */
  candle: Candle | null;
  /** True if the existing candle was changed or a new one was added. */
  changed: boolean;
  /** True if the incoming live candle update was rejected and not applied. */
  ignored: boolean;
  /** The reason why the update was ignored (e.g., 'older_than_history_cutoff', 'stale_tick'). */
  reason?: string;
};

/**
 * Converts a mutable internal candle representation into a read-only public Candle format.
 * Strips out internal tracking properties.
 */
const toPublicCandle = (candle: MutableCandle): Candle => ({
  time: candle.time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
  volume: candle.volume ?? 0,
});

/**
 * Processes a "Live Candle" update received directly from the backend (usually via WebSocket).
 * 
 * Unlike raw ticks, a live candle contains pre-aggregated OHLCV values. This function merges
 * these authoritative updates into the frontend's real-time candle map, handling out-of-order 
 * messages and respecting history boundaries.
 *
 * @param candleMap - The mutable map storing the current real-time session's candles.
 * @param liveCandle - The incoming aggregated candle update from the backend.
 * @param timeframe - The timeframe resolution of the chart (e.g., '1m', '1H').
 * @param options - Additional validation rules like history cutoffs.
 * @returns The result of the update operation, indicating if the UI needs to redraw.
 */
export const applyLiveCandleToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  liveCandle: LiveCandle,
  timeframe?: string,
  options: ApplyCandleOptions = {},
): ApplyCandleResult => {
  if (!validateCandle(liveCandle)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_live_candle' };
  }

  const bucketStart = timeframe ? getBucketStart(liveCandle.time, timeframe) : liveCandle.time;
  if (bucketStart === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_bucket' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && bucketStart < historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const existing = candleMap.get(bucketStart);
  const eventTime = liveCandle.time;
  const isOutOfOrderSameBucket =
    existing?.source === 'live_candle' &&
    typeof existing.lastUpdateTime === 'number' &&
    eventTime < existing.lastUpdateTime;

  // No `late_missing_bucket` rejection here. Backend is the source of truth for
  // live candles. If history ends at T0 and live has emitted a future bucket Tf,
  // a subsequent backend live candle for a bucket Ti where T0 < Ti < Tf is a
  // legitimate backfill — not a stale message — and must fill the gap. The only
  // boundary that protects closed history is `historyCutoffTime`, enforced
  // above. Same-bucket replays are still guarded by the `lastUpdateTime` stale
  // check above: out-of-order same-bucket snapshots can still widen wicks, but
  // cannot rewind the close of the latest accepted snapshot.

  const incoming: Candle = {
    time: bucketStart,
    open: liveCandle.open,
    high: liveCandle.high,
    low: liveCandle.low,
    close: liveCandle.close,
    volume: liveCandle.volume ?? 0,
  };
  const exactReplay = existing && areCandleValuesEqual(toPublicCandle(existing), incoming);
  if (exactReplay) {
    return { candle: toPublicCandle(existing), changed: false, ignored: false };
  }

  // Backend live-candle snapshots are AUTHORITATIVE: each one carries the
  // current OHLCV for the active bucket as the broker computed it. We must
  // overwrite, not merge — merging would (a) freeze `open` to the history
  // bucket's value, (b) accumulate volume across every snapshot via summing,
  // and (c) prevent the broker from correcting an over-widened high/low back
  // down. The only same-bucket nuance is out-of-order delivery: if a snapshot
  // arrives whose event time precedes the latest one we accepted, we keep the
  // current `close` but still let the snapshot widen high/low and update
  // volume to its broker-supplied value.
  const next: MutableCandle = isOutOfOrderSameBucket && existing
    ? {
        time: bucketStart,
        open: incoming.open,
        high: Math.max(existing.high, incoming.high),
        low: Math.min(existing.low, incoming.low),
        close: existing.close,
        // Live candle volume is the broker's cumulative tick count for the
        // bucket. An out-of-order snapshot reports an EARLIER count — keep
        // the latest (existing) count instead of regressing.
        volume: Math.max(existing.volume ?? 0, incoming.volume),
        source: 'live_candle',
        closed: liveCandle.closed ?? existing.closed ?? false,
        firstUpdateTime:
          existing.firstUpdateTime === undefined
            ? eventTime
            : Math.min(existing.firstUpdateTime, eventTime),
        lastUpdateTime: existing.lastUpdateTime ?? eventTime,
      }
    : {
        ...incoming,
        source: 'live_candle',
        closed: liveCandle.closed ?? false,
        firstUpdateTime:
          existing?.firstUpdateTime === undefined
            ? eventTime
            : Math.min(existing.firstUpdateTime, eventTime),
        lastUpdateTime: eventTime,
      };

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_live_candle' };
  }

  candleMap.set(bucketStart, next);

  const result: ApplyCandleResult = {
    candle: toPublicCandle(next),
    changed: !existing || !areCandleValuesEqual(toPublicCandle(existing), toPublicCandle(next)),
    ignored: false,
  };
  if (isOutOfOrderSameBucket) {
    result.reason = 'merged_out_of_order_live_candle';
  }
  return result;
};

/**
 * Options used when extrapolating the active candle's shape using a raw quote tick.
 */
export type ApplyQuoteTickExtensionOptions = {
  /** Unix timestamp representing the end of the strictly validated historical period. */
  historyCutoffTime?: number | null;
  /**
   * Optional latest REST history candle. When the live candle map has no
   * entry at the active bucket but REST already returned a candle whose time
   * matches the active bucket, the extension may seed from that REST candle —
   * its OHLC came from backend so this is not invention.
   */
  latestHistoryCandle?: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'> | null;
};

/**
 * Represents the outcome of applying a quote tick to extend the active candle.
 */
export type ApplyQuoteTickExtensionResult = {
  /** The resulting extrapolated candle, or null if ignored. */
  candle: Candle | null;
  /** True if the tick caused the candle's price or boundaries to move. */
  changed: boolean;
  /** True if the tick was rejected. */
  ignored: boolean;
  /** The reason the tick was rejected. */
  reason?: string;
};

/**
 * Extend the active live candle's close (and widen high/low) using a single
 * real-time price tick from the quote feed.
 *
 * STRICT extension contract:
 *   - Updates an existing backend bucket when one is present.
 *   - Can open only the next contiguous live bucket from the last real
 *     backend candle/quote-built live candle, using live tick price data.
 *   - Never modifies closed history (gated by `historyCutoffTime`).
 *   - The next backend `applyLiveCandleToCandleMap` call fully overwrites the
 *     bucket, so backend remains the authoritative source on every snapshot.
 *
 * Why this exists: most broker WS candle channels publish updates only on
 * bar-close (or on a slow cadence), while real-time price movement within
 * the active bar arrives only via the quote feed. Without this extension the
 * forming candle stays static while the bid/ask line moves above the chart.
 */
export const applyQuoteTickExtensionToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  tick: { price: number; time: unknown },
  timeframe: string,
  options: ApplyQuoteTickExtensionOptions = {},
): ApplyQuoteTickExtensionResult => {
  if (!Number.isFinite(tick.price) || tick.price <= 0) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_price' };
  }
  const timeSeconds = normalizeTimestampToSeconds(tick.time);
  if (timeSeconds === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_timestamp' };
  }

  const bucketStart = getBucketStart(timeSeconds, timeframe);
  if (bucketStart === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_bucket' };
  }

  // Use strict `<` (not `<=`) to match `applyLiveCandleToCandleMap`.
  // `historyCutoff` is the last CLOSED candle's bucket time. A tick at
  // exactly that bucket is the transition point and must be allowed
  // through so the forming candle can receive live updates.
  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && bucketStart < historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  let existing = candleMap.get(bucketStart);
  if (!existing) {
    const restTail = options.latestHistoryCandle;
    // Backend history timestamps may not be bucket-aligned (e.g. 1713744062
    // for an M1 bucket starting at 1713744060). Align the rest tail's time
    // to its bucket start before comparing, otherwise the equality check
    // always fails and ticks are rejected as 'tick_older_than_history'.
    const restTailBucket = restTail ? (getBucketStart(restTail.time, timeframe) ?? restTail.time) : null;
    if (restTail && restTailBucket === bucketStart) {
      if (!isPriceCoherentWithCandle(restTail, tick.price)) {
        return { candle: null, changed: false, ignored: true, reason: 'stale_history_seed' };
      }
      existing = {
        time: bucketStart,
        open: restTail.open,
        high: restTail.high,
        low: restTail.low,
        close: restTail.close,
        volume: restTail.volume ?? 0,
        source: 'live_candle',
        closed: false,
      };
    } else {
      const liveTailTime = Array.from(candleMap.keys()).reduce<number | null>(
        (latest, time) => (latest === null || time > latest ? time : latest),
        null,
      );
      const latestKnownBucket = [restTailBucket, liveTailTime]
        .filter((time): time is number => typeof time === 'number' && Number.isFinite(time))
        .reduce<number | null>((latest, time) => (latest === null || time > latest ? time : latest), null);

      if (latestKnownBucket !== null && bucketStart < latestKnownBucket) {
        return {
          candle: null,
          changed: false,
          ignored: true,
          reason: restTailBucket !== null && restTailBucket > bucketStart
            ? 'tick_older_than_history'
            : 'tick_older_than_live_tail',
        };
      }

      if (latestKnownBucket === null) {
        existing = {
          time: bucketStart,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: 0,
          source: 'live_candle',
          closed: false,
        };
      } else {
        const expectedNextBucket = getExpectedNextCandleTime(latestKnownBucket, timeframe);
        if (bucketStart !== expectedNextBucket) {
          return { candle: null, changed: false, ignored: true, reason: 'no_active_backend_candle' };
        }

        const liveTail = liveTailTime === latestKnownBucket ? candleMap.get(latestKnownBucket) : undefined;
        const seed = liveTail ?? (restTailBucket === latestKnownBucket ? restTail : null);
        if (!seed) {
          return { candle: null, changed: false, ignored: true, reason: 'no_active_backend_candle' };
        }
        if (!isPriceCoherentWithCandle(seed, tick.price)) {
          return { candle: null, changed: false, ignored: true, reason: 'stale_history_seed' };
        }

        existing = {
          time: bucketStart,
          open: seed.close,
          high: Math.max(seed.close, tick.price),
          low: Math.min(seed.close, tick.price),
          close: tick.price,
          volume: 0,
          source: 'live_candle',
          closed: false,
        };
      }
    }
  }

  const next: MutableCandle = {
    ...existing,
    high: Math.max(existing.high, tick.price),
    low: Math.min(existing.low, tick.price),
    close: tick.price,
    source: 'live_candle',
    closed: false,
    // IMPORTANT: do NOT advance `lastUpdateTime` here. That field is used by
    // `applyLiveCandleToCandleMap` to reject out-of-order BACKEND snapshots.
    // If we wrote `tick.time` to it, a subsequent backend snapshot whose
    // `time` field is the bucket-start (always older than mid-bucket tick
    // times) would be rejected as stale and never overwrite our tick-driven
    // OHLC. Preserving the existing `lastUpdateTime` keeps backend
    // authoritative.
  };

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_tick' };
  }

  const changed =
    !candleMap.has(bucketStart) ||
    next.close !== existing.close ||
    next.high !== existing.high ||
    next.low !== existing.low;

  candleMap.set(bucketStart, next);

  return {
    candle: toPublicCandle(next),
    changed,
    ignored: false,
  };
};
