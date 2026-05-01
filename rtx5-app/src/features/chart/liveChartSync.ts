export type RenderableChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type ChartSeriesSnapshot = {
  length: number;
  firstTime: number | null;
  lastTime: number | null;
  lastSignature: string;
  previousLastSignature: string;
  tailWithoutLastSignature: string;
};

export type ChartSeriesUpdateMode = 'noop' | 'incremental' | 'full_reload';

export type ChartCandleGap = {
  fromTime: number;
  expectedTime: number;
  toTime: number;
  missingSeconds: number;
  label: string;
};

export const EMPTY_CHART_SERIES_SNAPSHOT: ChartSeriesSnapshot = {
  length: 0,
  firstTime: null,
  lastTime: null,
  lastSignature: '',
  previousLastSignature: '',
  tailWithoutLastSignature: '',
};

const buildCandleSignature = (candle: RenderableChartCandle | undefined): string => {
  if (!candle) {
    return '';
  }

  return `${candle.time}:${candle.open}:${candle.high}:${candle.low}:${candle.close}:${candle.volume ?? 0}`;
};

const TIMEFRAME_SECONDS: Record<string, number> = {
  M1: 60,
  M3: 3 * 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H2: 2 * 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
  W1: 7 * 24 * 60 * 60,
  MN: 30 * 24 * 60 * 60,
};

const normalizeChartTimeframe = (timeframe: string): string => {
  const raw = String(timeframe ?? '').trim();
  if (!raw) {
    return 'M1';
  }

  const caseSensitiveAliases: Record<string, string> = {
    '1m': 'M1',
    '3m': 'M3',
    '5m': 'M5',
    '15m': 'M15',
    '30m': 'M30',
    '1h': 'H1',
    '2h': 'H2',
    '4h': 'H4',
    '1d': 'D1',
    '1w': 'W1',
    '1M': 'MN',
  };
  const caseSensitive = caseSensitiveAliases[raw];
  if (caseSensitive) {
    return caseSensitive;
  }

  const normalized = raw.toUpperCase();
  return normalized;
};

const getChartTimeframeSeconds = (timeframe: string): number =>
  TIMEFRAME_SECONDS[normalizeChartTimeframe(timeframe)] ?? TIMEFRAME_SECONDS.M1;

const getExpectedNextChartCandleTime = (time: number, timeframe: string): number => {
  const normalizedTimeframe = normalizeChartTimeframe(timeframe);
  if (normalizedTimeframe !== 'MN') {
    return time + getChartTimeframeSeconds(normalizedTimeframe);
  }

  const date = new Date(time * 1000);
  return Math.floor(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
    ) / 1000,
  );
};

export const formatCandleGapDuration = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || parts.length > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${remainingSeconds}s`);

  return parts.join(' ');
};

export const resolveLatestCandleGap = (
  candles: RenderableChartCandle[],
  timeframe: string,
): ChartCandleGap | null => {
  if (candles.length < 2) {
    return null;
  }

  const sortedCandles = [...candles]
    .filter((candle) => Number.isFinite(candle.time))
    .sort((left, right) => left.time - right.time);

  for (let index = sortedCandles.length - 2; index >= 0; index -= 1) {
    const current = sortedCandles[index];
    const next = sortedCandles[index + 1];
    const expectedTime = getExpectedNextChartCandleTime(current.time, timeframe);
    const missingSeconds = next.time - expectedTime;

    if (missingSeconds > 0) {
      return {
        fromTime: current.time,
        expectedTime,
        toTime: next.time,
        missingSeconds,
        label: formatCandleGapDuration(missingSeconds),
      };
    }
  }

  return null;
};

export const buildChartSeriesSnapshot = (
  candles: RenderableChartCandle[],
  tailSize: number = 12,
): ChartSeriesSnapshot => {
  if (candles.length === 0) {
    return EMPTY_CHART_SERIES_SNAPSHOT;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const previousLast = candles[candles.length - 2];
  const tailWithoutLast = candles.slice(Math.max(0, candles.length - tailSize), candles.length - 1);

  return {
    length: candles.length,
    firstTime: first?.time ?? null,
    lastTime: last?.time ?? null,
    lastSignature: buildCandleSignature(last),
    previousLastSignature: buildCandleSignature(previousLast),
    tailWithoutLastSignature: tailWithoutLast.map(buildCandleSignature).join('|'),
  };
};

export const getChartSeriesUpdateMode = (
  previous: ChartSeriesSnapshot,
  next: ChartSeriesSnapshot,
): ChartSeriesUpdateMode => {
  if (next.length === 0) {
    return 'noop';
  }

  if (previous.length === 0) {
    return 'full_reload';
  }

  if (next.firstTime !== previous.firstTime) {
    return 'full_reload';
  }

  if (next.length < previous.length || next.length > previous.length + 1) {
    return 'full_reload';
  }

  if (next.length === previous.length + 1) {
    return next.previousLastSignature === previous.lastSignature ? 'incremental' : 'full_reload';
  }

  if (
    next.lastSignature === previous.lastSignature &&
    next.tailWithoutLastSignature === previous.tailWithoutLastSignature
  ) {
    return 'noop';
  }

  if (
    next.lastTime === previous.lastTime &&
    next.tailWithoutLastSignature === previous.tailWithoutLastSignature
  ) {
    return 'incremental';
  }

  return 'full_reload';
};
