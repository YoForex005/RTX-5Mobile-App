import type { Candle, CandleStreamState, LiveCandle, MutableCandle, Timeframe } from '../../core/candleTypes';
import { MAX_CANDLE_SERIES_LENGTH } from '../../core/candles';
import type { createCandleStreamKey } from '../../core/timeframeUtils';
import type { getCandleHistory } from '../../api/candles';

export type CandleParams = Candle & {
  bid?: number;
  ask?: number;
  source?: 'history' | 'live_candle' | 'rest' | 'live';
  closed?: boolean;
  priceBasis?: string;
  serverTimeframe?: string;
};

export type StreamListener = () => void;

export type BufferedLiveEvent =
  | { type: 'live_candle'; candle: LiveCandle; order: number }
  // Quote-tick extension. Carries a single price + timestamp from the quote
  // feed and ONLY mutates the close (and widens high/low) of the active
  // bucket's candle that backend already created. It never invents a new
  // bucket and never touches closed history. Any subsequent backend
  // live_candle snapshot fully overwrites the bucket's OHLC, so backend
  // remains authoritative.
  | { type: 'quote_tick_extension'; price: number; time: number; order: number };

export type UnorderedLiveEvent =
  | { type: 'live_candle'; candle: LiveCandle }
  | { type: 'quote_tick_extension'; price: number; time: number };

export type StreamEntry = {
  key: string;
  symbol: string;
  timeframe: Timeframe;
  requestId: number;
  streamKey: ReturnType<typeof createCandleStreamKey>;
  historyCandles: Candle[];
  liveCandleMap: Map<number, MutableCandle>;
  historyLastTime: number | null;
  candles: CandleParams[];
  listeners: Set<StreamListener>;
  consumers: number;
  loading: boolean;
  historyLoading: boolean;
  error: string | null;
  isLiveConnected: boolean;
  lastUpdateTime: number | null;
  abortController: AbortController | null;
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

export const DEFAULT_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH;
export const MAX_BUFFERED_LIVE_EVENTS = 4096;
export const FLUSH_INTERVAL_MS = 16;

export const EMPTY_CANDLES: readonly CandleParams[] = Object.freeze([]) as readonly CandleParams[];

export type { CandleStreamState };
