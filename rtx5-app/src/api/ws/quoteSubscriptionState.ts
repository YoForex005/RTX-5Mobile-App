import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';

export const normalizeQuoteTransportSymbol = (symbol: string): string =>
  symbol.trim().replace(/[\/\s]+/g, '');

export const resolveQuoteTransportSymbols = (symbol: string): string[] => {
  const transportSymbol = normalizeQuoteTransportSymbol(symbol);
  if (!transportSymbol) {
    return [];
  }

  const normalizedKey = normalizeQuoteSymbolKey(transportSymbol);
  const baseSymbol = normalizeSymbol(transportSymbol);
  const symbols = [transportSymbol];
  if (baseSymbol && baseSymbol !== normalizedKey) {
    symbols.push(baseSymbol);
  }
  return Array.from(new Set(symbols));
};

export const expandQuoteTransportSymbols = (symbols: string[]): string[] =>
  Array.from(new Set(symbols.flatMap(resolveQuoteTransportSymbols)));

export const applyQuoteSubscriptionDelta = (
  currentCounts: ReadonlyMap<string, number>,
  symbols: string[],
  delta: 1 | -1,
): Map<string, number> => {
  const nextCounts = new Map(currentCounts);

  for (const rawSymbol of symbols) {
    const symbol = normalizeQuoteTransportSymbol(rawSymbol);
    if (!symbol) {
      continue;
    }

    const current = nextCounts.get(symbol) ?? 0;
    const next = current + delta;

    if (next <= 0) {
      nextCounts.delete(symbol);
      continue;
    }

    nextCounts.set(symbol, next);
  }

  return nextCounts;
};

export const buildActiveQuoteSymbols = (
  stickySymbols: Iterable<string>,
  consumerCounts: ReadonlyMap<string, number>,
): string[] => {
  const merged = new Set<string>();

  for (const rawSymbol of stickySymbols) {
    const symbol = normalizeQuoteTransportSymbol(rawSymbol);
    if (symbol) {
      merged.add(symbol);
    }
  }

  consumerCounts.forEach((count, rawSymbol) => {
    const symbol = normalizeQuoteTransportSymbol(rawSymbol);
    if (count > 0 && symbol) {
      merged.add(symbol);
    }
  });

  return Array.from(merged);
};
