import { normalizeSymbol } from '../../domain/symbols';

export const DEFAULT_QUOTE_WATCHLIST = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'BTCUSD',
] as const;

const buildAvailableSymbolLookup = (availableSymbols: readonly string[]): Map<string, string> => {
  const byNormalized = new Map<string, string>();

  for (const symbol of availableSymbols) {
    const normalized = normalizeSymbol(symbol);
    if (normalized && !byNormalized.has(normalized)) {
      byNormalized.set(normalized, symbol);
    }
  }

  return byNormalized;
};

export const resolveQuoteFeedSymbols = (
  requestedSymbols: readonly string[],
  availableSymbols: readonly string[] = [],
): string[] => {
  if (availableSymbols.length === 0) {
    return [...requestedSymbols];
  }

  const availableByNormalized = buildAvailableSymbolLookup(availableSymbols);
  return requestedSymbols.map((symbol) => {
    const normalized = normalizeSymbol(symbol);
    return (normalized && availableByNormalized.get(normalized)) || symbol;
  });
};

export const buildDefaultQuoteWatchlist = (availableSymbols: string[]): string[] => {
  if (availableSymbols.length === 0) {
    return [...DEFAULT_QUOTE_WATCHLIST];
  }

  const defaults = resolveQuoteFeedSymbols([...DEFAULT_QUOTE_WATCHLIST], availableSymbols)
    .filter((symbol) => availableSymbols.includes(symbol));

  return defaults.length > 0 ? defaults : availableSymbols.slice(0, 5);
};
