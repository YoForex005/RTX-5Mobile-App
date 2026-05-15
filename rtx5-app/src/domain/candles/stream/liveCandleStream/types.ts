import type { Candle, CandleStreamState, LiveCandle, MutableCandle, Timeframe } from '../../core/candleTypes';
import { MAX_CANDLE_SERIES_LENGTH } from '../../core/candles';
import type { createCandleStreamKey } from '../../core/timeframeUtils';
import type { getCandleHistory } from '../../api/candles';

/**
 * Extended Candle type used internally by the stream manager to track optional metadata 
 * like bid/ask lines and provenance source, without polluting the public Candle interface.
 */
export type CandleParams = Candle & {
  bid?: number;
  ask?: number;
  source?: 'history' | 'live_candle' | 'rest' | 'live';
  closed?: boolean;
  priceBasis?: string;
  serverTimeframe?: string;
};

export type StreamListener = () => void;

/**
 * A normalized, sortable wrapper around real-time events that mutate the active candle.
 * We attach an `order` sequence number so that if multiple ticks arrive in the same
 * millisecond, we can still guarantee deterministic replay order.
 */
export type BufferedLiveEvent =
  | { type: 'live_candle'; candle: LiveCandle; order: number }
  // Quote-tick extension. Carries a single price + timestamp from the quote
  // feed and mutates an already-open active bucket's close (and widens
  // high/low), or opens the current tick bucket when the candle backend is
  // stale. It never backfills missing buckets or touches closed history.
  // Any subsequent backend live_candle snapshot fully overwrites the bucket's
  // OHLC, so backend remains authoritative.
  | { type: 'quote_tick_extension'; price: number; time: number; order: number };

export type UnorderedLiveEvent =
  | { type: 'live_candle'; candle: LiveCandle }
  | { type: 'quote_tick_extension'; price: number; time: number };

/**
 * The core state container for a single managed candle stream (e.g. "EURUSD:M1").
 * Tracks the historical base layer, the live overlay map, connection status, 
 * pending buffered events, and active subscribers.
 */
export type StreamEntry = {
  key: string;
  symbol: string;
  timeframe: Timeframe;
  requestId: number;
  streamKey: ReturnType<typeof createCandleStreamKey>;
  /** Authoritative closed candles from REST. */
  historyCandles: Candle[];
  /** Mutable map of real-time forming candles, keyed by bucket start time. */
  liveCandleMap: Map<number, MutableCandle>;
  /** Timestamp of the last fully closed historical candle. */
  historyLastTime: number | null;
  /** The finalized, merged, and sorted array of candles exposed to the UI. */
  candles: CandleParams[];
  /** Subscribed UI components. */
  listeners: Set<StreamListener>;
  /** Number of active UI components demanding this stream. */
  consumers: number;
  /** True if currently bootstrapping or syncing data. */
  loading: boolean;
  /** True if the initial REST history fetch is still in progress. */
  historyLoading: boolean;
  error: string | null;
  isLiveConnected: boolean;
  lastUpdateTime: number | null;
  abortController: AbortController | null;
  /** Events waiting to be flushed into the liveCandleMap on the next tick. */
  bufferedEvents: BufferedLiveEvent[];
  pendingEvents: BufferedLiveEvent[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  eventOrder: number;
};

export type CandleHistorySnapshot = Awaited<ReturnType<typeof getCandleHistory>>;

export type HistorySeedSnapshot = {
  candles: Candle[];
  closedHistoryLastTime: number | null;
  currentCandleTime: number | null;
};

/** Default max number of candles to keep in memory per stream to prevent leaks. */
export const DEFAULT_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH;
/** Max buffer size before we forcefully drop ticks to save memory. */
export const MAX_BUFFERED_LIVE_EVENTS = 4096;
/** Throttle interval in ms for flushing real-time ticks into the UI. */
export const FLUSH_INTERVAL_MS = 100;

export const EMPTY_CANDLES: readonly CandleParams[] = Object.freeze([]) as readonly CandleParams[];

export type { CandleStreamState };
