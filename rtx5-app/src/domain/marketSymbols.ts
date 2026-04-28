const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function extractMarketSymbols(payload: unknown): string[] {
  const record = asRecord(payload);
  const list: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.instruments)
      ? record.instruments
      : [];
  const seen = new Set<string>();
  const symbols: string[] = [];

  for (const item of list) {
    const itemRecord = asRecord(item);
    const rawSymbol = typeof item === 'string'
      ? item
      : typeof itemRecord?.symbol === 'string'
        ? itemRecord.symbol
        : null;
    const symbol = rawSymbol?.trim();

    if (!symbol || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    symbols.push(symbol);
  }

  return symbols;
}
