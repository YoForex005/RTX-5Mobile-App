import { normalizeSymbol } from '../../domain/symbols';

export const applyQuoteSubscriptionDelta = (
  currentCounts: ReadonlyMap<string, number>,
  symbols: string[],
  delta: 1 | -1,
): Map<string, number> => {
  const nextCounts = new Map(currentCounts);

  for (const rawSymbol of symbols) {
    const symbol = normalizeSymbol(rawSymbol);
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
    const symbol = normalizeSymbol(rawSymbol);
    if (symbol) {
      merged.add(symbol);
    }
  }

  consumerCounts.forEach((count, rawSymbol) => {
    const symbol = normalizeSymbol(rawSymbol);
    if (count > 0 && symbol) {
      merged.add(symbol);
    }
  });

  return Array.from(merged);
};
