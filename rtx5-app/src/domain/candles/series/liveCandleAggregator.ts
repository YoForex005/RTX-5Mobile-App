import type { Candle, LiveCandle, MutableCandle } from '../core/candleTypes';
import { getBucketStart, normalizeTimestampToSeconds } from '../core/timeframeUtils';
import { validateCandle } from '../core/candleValidator';
import {
  areCandleValuesEqual,
  mergeCandleByTimestamp,
} from './candleSeriesMerger';

export type ApplyCandleOptions = {
  historyCutoffTime?: number | null;
};

export type ApplyCandleResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
};

const toPublicCandle = (candle: MutableCandle): Candle => ({
  time: candle.time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
  volume: candle.volume ?? 0,
});

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
  if (typeof historyCutoff === 'number' && bucketStart <= historyCutoff) {
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

  const merged = existing
    ? mergeCandleByTimestamp(existing, incoming, {
        closeSource: isOutOfOrderSameBucket ? 'existing' : 'incoming',
        volumeStrategy: 'sum',
      })
    : incoming;

  const next: MutableCandle = {
    ...merged,
    source: 'live_candle',
    closed: liveCandle.closed ?? false,
    firstUpdateTime:
      existing?.firstUpdateTime === undefined
        ? eventTime
        : Math.min(existing.firstUpdateTime, eventTime),
    lastUpdateTime: isOutOfOrderSameBucket ? existing?.lastUpdateTime ?? eventTime : eventTime,
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

export type ApplyQuoteTickExtensionOptions = {
  historyCutoffTime?: number | null;
  // Optional latest REST history candle. When the live candle map has no
  // entry at the active bucket but REST already returned a candle whose time
  // matches the active bucket, the extension may seed from that REST candle —
  // its OHLC came from backend so this is not invention.
  latestHistoryCandle?: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'> | null;
};

export type ApplyQuoteTickExtensionResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
};

/**
 * Extend the active live candle's close (and widen high/low) using a single
 * real-time price tick from the quote feed.
 *
 * STRICT extension contract:
 *   - Only updates an EXISTING bucket created by backend (live candle map or
 *     `latestHistoryCandle` when its time === the active bucket).
 *   - Never invents a new bucket. If neither matches, returns `ignored=true`.
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

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && bucketStart <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  let existing = candleMap.get(bucketStart);
  if (!existing) {
    const restTail = options.latestHistoryCandle;
    if (!restTail || restTail.time !== bucketStart) {
      return { candle: null, changed: false, ignored: true, reason: 'no_active_backend_candle' };
    }
    existing = {
      time: restTail.time,
      open: restTail.open,
      high: restTail.high,
      low: restTail.low,
      close: restTail.close,
      volume: restTail.volume ?? 0,
      source: 'live_candle',
      closed: false,
      // We deliberately do NOT seed `firstUpdateTime`/`lastUpdateTime` from the
      // tick — those fields are reserved for backend snapshot ordering. The
      // quote-tick extension is a transient overlay that backend snapshots
      // must always be able to overwrite.
    };
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
