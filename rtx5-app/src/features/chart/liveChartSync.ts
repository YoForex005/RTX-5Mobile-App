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
