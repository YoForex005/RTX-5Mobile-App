/**
 * Compatibility entry point for the canonical candle stream.
 *
 * The production candle pipeline lives in `src/candles/stream`; this module keeps
 * the existing imports stable while keeping chart candles on the backend
 * history + backend live-candle path.
 */

export {
  EMPTY_CANDLES,
  liveCandleStream as liveCandlesEngine,
  type CandleParams,
  type LiveCandleStreamManager,
} from '../stream/liveCandleStream';
