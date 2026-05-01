export const DEFAULT_QUOTE_WATCHLIST = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'BTCUSD',
] as const;

export const buildDefaultQuoteWatchlist = (availableSymbols: string[]): string[] => {
  if (availableSymbols.length === 0) {
    return [...DEFAULT_QUOTE_WATCHLIST];
  }

  const available = new Set(availableSymbols);
  const defaults = DEFAULT_QUOTE_WATCHLIST.filter((symbol) => available.has(symbol));
  return defaults.length > 0 ? defaults : availableSymbols.slice(0, 5);
};
