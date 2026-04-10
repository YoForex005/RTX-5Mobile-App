const EXPLICIT_SYMBOL_ALIASES: Record<string, string> = {
  BTCUSDM: 'BTCUSD',
  ETHUSDM: 'ETHUSD',
  XAUUSDM: 'XAUUSD',
  XAGUSDM: 'XAGUSD',
  MBTUSDM: 'MBTUSD',
};

const LEGACY_SUFFIX_BASES = new Set([
  'BTCUSD',
  'ETHUSD',
  'XAUUSD',
  'XAGUSD',
  'MBTUSD',
]);

export const normalizeSymbol = (symbol: string): string => {
  const normalized = symbol.trim().toUpperCase().replace(/[\/\s]+/g, '');
  if (!normalized) return '';

  if (EXPLICIT_SYMBOL_ALIASES[normalized]) {
    return EXPLICIT_SYMBOL_ALIASES[normalized];
  }

  if (normalized.endsWith('M')) {
    const withoutSuffix = normalized.slice(0, -1);
    if (LEGACY_SUFFIX_BASES.has(withoutSuffix)) {
      return withoutSuffix;
    }
  }

  return normalized;
};
