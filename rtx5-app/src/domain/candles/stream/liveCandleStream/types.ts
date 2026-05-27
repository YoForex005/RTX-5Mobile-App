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
  firstUpdateTime?: number;
  lastUpdateTime?: number;
  lastBackendUpdateTime?: number;
  lastQuoteTime?: number;
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
  /**
   * Optional pagination boundary for the next older-history request.
   * It advances even when a requested page is empty so M1 weekend/session gaps
   * cannot make the frontend request the same empty window forever.
   */
  historyPaginationCursorTime: number | null;
  /**
   * Number of candles the UI stream is allowed to materialize.
   * Starts at the normal recent window and grows only when left-scroll
   * pagination proves the user needs older history.
   */
  renderHistoryLimit: number;
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
  /** True when a left-scroll older-history page fetch is in progress. */
  historyPageLoading: boolean;
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
/** Smaller left-scroll page size so older history can be prepended without a heavy full-window fetch. */
export const PAGINATED_HISTORY_LIMIT = Math.min(500, MAX_CANDLE_SERIES_LENGTH);
/** Hard cap for lazily rendered history; high enough for deep M1 scroll, bounded for mobile WebView cost. */
export const MAX_RENDERED_HISTORY_CANDLES = Math.max(MAX_CANDLE_SERIES_LENGTH, 10_000);
/** Retained normalized REST history cap; larger than render cap so repeated pagination can dedupe safely. */
export const MAX_RETAINED_HISTORY_CANDLES = Math.max(MAX_RENDERED_HISTORY_CANDLES, MAX_CANDLE_SERIES_LENGTH * 8);
/** Max buffer size before we forcefully drop ticks to save memory. */
export const MAX_BUFFERED_LIVE_EVENTS = 4096;
/** Throttle interval in ms for flushing real-time ticks into the UI. */
export const FLUSH_INTERVAL_MS = 100;

export const EMPTY_CANDLES: readonly CandleParams[] = Object.freeze([]) as readonly CandleParams[];

export type { CandleStreamState };
