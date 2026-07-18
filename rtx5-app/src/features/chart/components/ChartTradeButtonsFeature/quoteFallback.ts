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
  // Candle/snapshot fallbacks are retained in the call shape for compatibility
  // with chart renderers, but are never eligible for a trade-button price.
  fallbackBid: _fallbackBid,
  fallbackAsk: _fallbackAsk,
}: ChartTradeButtonQuoteInput): { bid: number; ask: number } {
  return {
    bid: toPositiveFiniteNumber(liveBid) ?? 0,
    ask: toPositiveFiniteNumber(liveAsk) ?? 0,
  };
}
