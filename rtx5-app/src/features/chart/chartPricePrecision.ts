const MAX_CHART_DISPLAY_DECIMALS = 8;
const DEFAULT_CHART_DISPLAY_DECIMALS = 2;

export type ChartDisplayDecimalInput = {
  instrumentDigits?: unknown;
  liveQuoteDigits?: unknown;
  liveQuoteDigitsFromBackend?: boolean;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const normalizeChartDisplayDecimals = (digits: unknown): number | undefined => {
  const parsed = toFiniteNumber(digits);
  return parsed === undefined
    ? undefined
    : Math.min(Math.max(Math.floor(parsed), 0), MAX_CHART_DISPLAY_DECIMALS);
};

export const resolveChartDisplayDecimals = ({
  instrumentDigits,
  liveQuoteDigits,
  liveQuoteDigitsFromBackend = false,
}: ChartDisplayDecimalInput): number => {
  const instrumentDecimals = normalizeChartDisplayDecimals(instrumentDigits);
  if (instrumentDecimals !== undefined) {
    return instrumentDecimals;
  }

  if (liveQuoteDigitsFromBackend) {
    const liveQuoteDecimals = normalizeChartDisplayDecimals(liveQuoteDigits);
    if (liveQuoteDecimals !== undefined) {
      return liveQuoteDecimals;
    }
  }

  return DEFAULT_CHART_DISPLAY_DECIMALS;
};
