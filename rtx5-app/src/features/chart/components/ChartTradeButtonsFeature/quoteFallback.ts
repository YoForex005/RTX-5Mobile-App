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

export type ChartTradeButtonPriceColorInput = {
  currentPrice: number;
  previousPrice?: number | null;
  upColor: string;
  downColor: string;
  fallbackColor: string;
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
  upColor,
  downColor,
  fallbackColor,
}: ChartTradeButtonPriceColorInput): { color: string; direction: 'up' | 'down' | null } {
  const current = toPositiveFiniteNumber(currentPrice);
  const previous = toPositiveFiniteNumber(previousPrice);
  let direction: 'up' | 'down' | null = null;

  if (current !== undefined && previous !== undefined) {
    if (current > previous) {
      direction = 'up';
    } else if (current < previous) {
      direction = 'down';
    }
  }

  return {
    color: direction === 'up' ? upColor : direction === 'down' ? downColor : fallbackColor,
    direction,
  };
}
