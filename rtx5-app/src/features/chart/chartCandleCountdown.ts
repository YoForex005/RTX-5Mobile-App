import {
  getExpectedNextCandleTime,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
} from '../../domain/candles/core/timeframeUtils';

export const CHART_CANDLE_COUNTDOWN_FIXED_SECONDS = Object.freeze({
  M1: 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
  W1: 7 * 24 * 60 * 60,
  MN: null,
} as const);

type ChartCandleCountdownInput = Readonly<{
  candleOpenTime: unknown;
  nowMs?: number;
  timeframe: unknown;
}>;

export const resolveChartCandleCloseTimeMs = (
  candleOpenTime: unknown,
  timeframe: unknown,
): number | null => {
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  const candleOpenSeconds = normalizeTimestampToSeconds(candleOpenTime);
  if (!normalizedTimeframe || candleOpenSeconds === null) {
    return null;
  }

  return getExpectedNextCandleTime(candleOpenSeconds, normalizedTimeframe) * 1000;
};

/**
 * Returns the selected timeframe's remaining whole display seconds.
 *
 * The current candle timestamp is the authority for the active bucket. Once
 * its formal boundary is reached this remains at zero until the candle engine
 * receives the first tick for the next bucket; this helper never creates bars.
 */
export const getChartCandleCountdownSeconds = ({
  candleOpenTime,
  nowMs = Date.now(),
  timeframe,
}: ChartCandleCountdownInput): number | null => {
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  const candleOpenSeconds = normalizeTimestampToSeconds(candleOpenTime);
  if (
    !normalizedTimeframe ||
    candleOpenSeconds === null ||
    !Number.isFinite(nowMs) ||
    nowMs < 0
  ) {
    return null;
  }

  const closeTimeMs = getExpectedNextCandleTime(candleOpenSeconds, normalizedTimeframe) * 1000;
  const bucketDurationSeconds = Math.max(0, Math.round(closeTimeMs / 1000 - candleOpenSeconds));
  const remainingSeconds = Math.max(0, Math.ceil((closeTimeMs - nowMs) / 1000));

  // A device clock that is behind the candle open must not display more than
  // one complete selected-timeframe bucket.
  return Math.min(bucketDurationSeconds, remainingSeconds);
};

const padCountdownUnit = (value: number): string => String(value).padStart(2, '0');

export const formatChartCandleCountdown = (remainingSeconds: number | null): string | null => {
  if (remainingSeconds === null || !Number.isFinite(remainingSeconds) || remainingSeconds < 0) {
    return null;
  }

  const totalSeconds = Math.floor(remainingSeconds);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  if (days > 0) {
    return `${days}d ${padCountdownUnit(hours)}:${padCountdownUnit(minutes)}:${padCountdownUnit(seconds)}`;
  }
  if (totalHours > 0) {
    return `${padCountdownUnit(totalHours)}:${padCountdownUnit(minutes)}:${padCountdownUnit(seconds)}`;
  }
  return `${padCountdownUnit(totalMinutes)}:${padCountdownUnit(seconds)}`;
};

