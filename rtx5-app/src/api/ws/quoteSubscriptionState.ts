export const applyQuoteSubscriptionDelta = (
  currentCounts: ReadonlyMap<string, number>,
  symbols: string[],
  delta: 1 | -1,
): Map<string, number> => {
  const nextCounts = new Map(currentCounts);

  for (const symbol of symbols) {
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

  for (const symbol of stickySymbols) {
    if (symbol) {
      merged.add(symbol);
    }
  }

  consumerCounts.forEach((count, symbol) => {
    if (count > 0 && symbol) {
      merged.add(symbol);
    }
  });

  return Array.from(merged);
};
