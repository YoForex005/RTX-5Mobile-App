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
