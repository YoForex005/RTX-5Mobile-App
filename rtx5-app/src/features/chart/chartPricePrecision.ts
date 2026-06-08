import {
  normalizePriceDigits,
  resolveDecimalsFromPriceValue,
  resolveDecimalsFromPriceStep,
} from '../../utils/pricePrecision';

const DEFAULT_CHART_DISPLAY_DECIMALS = 2;

export type ChartDisplayDecimalInput = {
  instrumentDigits?: unknown;
  instrumentPoint?: unknown;
  instrumentTickSize?: unknown;
  liveQuoteDigits?: unknown;
  liveQuoteDigitsFromBackend?: boolean;
  liveQuoteBid?: unknown;
  liveQuoteAsk?: unknown;
  liveQuoteLast?: unknown;
};

export const normalizeChartDisplayDecimals = (digits: unknown): number | undefined => {
  return normalizePriceDigits(digits);
};

export const normalizeChartPriceStepDecimals = (step: unknown): number | undefined => {
  return resolveDecimalsFromPriceStep(step);
};

export const inferChartPriceDecimalsFromValues = (values: unknown[]): number | undefined => {
  const inferred = values
    .map((value) => resolveDecimalsFromPriceValue(value))
    .filter((value): value is number => value !== undefined);

  return inferred.length > 0 ? Math.max(...inferred) : undefined;
};

export const resolveChartDisplayDecimals = ({
  instrumentDigits,
  instrumentPoint,
  instrumentTickSize,
  liveQuoteDigits,
  liveQuoteDigitsFromBackend = false,
  liveQuoteBid,
  liveQuoteAsk,
  liveQuoteLast,
}: ChartDisplayDecimalInput): number => {
  const instrumentDecimals = normalizeChartDisplayDecimals(instrumentDigits);
  if (instrumentDecimals !== undefined) {
    return instrumentDecimals;
  }

  const instrumentPointDecimals = normalizeChartPriceStepDecimals(instrumentPoint);
  if (instrumentPointDecimals !== undefined) {
    return instrumentPointDecimals;
  }

  const instrumentTickSizeDecimals = normalizeChartPriceStepDecimals(instrumentTickSize);
  if (instrumentTickSizeDecimals !== undefined) {
    return instrumentTickSizeDecimals;
  }

  if (liveQuoteDigitsFromBackend) {
    const liveQuoteDecimals = normalizeChartDisplayDecimals(liveQuoteDigits);
    if (liveQuoteDecimals !== undefined) {
      return liveQuoteDecimals;
    }
  }

  const inferredPriceDecimals = inferChartPriceDecimalsFromValues([
    liveQuoteBid,
    liveQuoteAsk,
    liveQuoteLast,
  ]);
  if (inferredPriceDecimals !== undefined) {
    return inferredPriceDecimals;
  }

  const liveQuoteFallbackDecimals = normalizeChartDisplayDecimals(liveQuoteDigits);
  if (liveQuoteFallbackDecimals !== undefined) {
    return liveQuoteFallbackDecimals;
  }

  return DEFAULT_CHART_DISPLAY_DECIMALS;
};
