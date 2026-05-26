const toPositiveFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
};

export type ChartTradeButtonQuoteInput = {
  liveBid?: unknown;
  liveAsk?: unknown;
  fallbackBid?: unknown;
  fallbackAsk?: unknown;
};

export type ChartTradeButtonPriceDirection = 'up' | 'down' | null;

export type ChartTradeButtonPriceColorInput = {
  currentPrice: unknown;
  previousPrice?: unknown;
  previousDirection?: ChartTradeButtonPriceDirection;
  upColor: string;
  downColor: string;
  fallbackColor: string;
};

export type ChartTradeButtonPriceColorResult = {
  color: string;
  direction: ChartTradeButtonPriceDirection;
  lastPrice: number | null;
};

export function resolveChartTradeButtonQuote({
  liveBid,
  liveAsk,
  fallbackBid,
  fallbackAsk,
}: ChartTradeButtonQuoteInput): { bid: number; ask: number } {
  return {
    bid: toPositiveFiniteNumber(liveBid) ?? toPositiveFiniteNumber(fallbackBid) ?? 0,
    ask: toPositiveFiniteNumber(liveAsk) ?? toPositiveFiniteNumber(fallbackAsk) ?? 0,
  };
}

export function resolveChartTradeButtonPriceColor({
  currentPrice,
  previousPrice,
  previousDirection = null,
  upColor,
  downColor,
  fallbackColor,
}: ChartTradeButtonPriceColorInput): ChartTradeButtonPriceColorResult {
  const current = toPositiveFiniteNumber(currentPrice);
  const previous = toPositiveFiniteNumber(previousPrice);

  if (current === undefined) {
    return { color: fallbackColor, direction: null, lastPrice: previous ?? null };
  }

  let direction = previousDirection;
  if (previous !== undefined) {
    if (current > previous) {
      direction = 'up';
    } else if (current < previous) {
      direction = 'down';
    }
  }

  const color = direction === 'up' ? upColor : direction === 'down' ? downColor : fallbackColor;

  return { color, direction, lastPrice: current };
}
