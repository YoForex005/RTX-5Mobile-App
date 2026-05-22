import { DEFAULT_QUOTE_WATCHLIST } from './quoteWatchlistDefaults';

export const DEFAULT_ADD_SYMBOL_CATALOG: readonly string[] = Object.freeze([
  ...DEFAULT_QUOTE_WATCHLIST,
  'AUDCAD',
  'AUDCHF',
  'AUDJPY',
  'AUDUSD',
  'EURGBP',
  'EURJPY',
  'GBPJPY',
  'NZDUSD',
  'USDCAD',
  'USDCHF',
  'XAGUSD',
  'XPTUSD',
  'XPDUSD',
  'ETHUSD',
  'LTCUSD',
  'XRPUSD',
  'US30',
  'NAS100',
  'SPX500',
  'GER40',
  'UK100',
  'JPN225',
  'WTIUSD',
  'BRENTUSD',
  'NATGAS',
  'COPPERUSD',
]);

const pushUniqueSymbol = (target: string[], seen: Set<string>, symbol: string | null | undefined) => {
  const trimmed = symbol?.trim();
  if (!trimmed) return;

  const key = trimmed.toUpperCase();
  if (seen.has(key)) return;

  seen.add(key);
  target.push(trimmed);
};

export const buildAddSymbolCatalog = (
  apiSymbols: readonly string[] | null | undefined,
  existingSymbols: readonly string[] = [],
): string[] => {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const brokerSymbols = apiSymbols ?? [];

  if (brokerSymbols.length > 0) {
    brokerSymbols.forEach((symbol) => pushUniqueSymbol(ordered, seen, symbol));
    return ordered;
  }

  existingSymbols.forEach((symbol) => pushUniqueSymbol(ordered, seen, symbol));
  DEFAULT_ADD_SYMBOL_CATALOG.forEach((symbol) => pushUniqueSymbol(ordered, seen, symbol));
  return ordered;
};
