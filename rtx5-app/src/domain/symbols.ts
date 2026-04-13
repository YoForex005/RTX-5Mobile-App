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

const KNOWN_BASE_SYMBOLS = new Set([
  'US30', 'SPX500', 'NAS100', 'GER40', 'UK100', 'FRA40', 'JP225',
  'USOIL', 'UKOIL', 'NGAS',
]);

const BROKER_SUFFIXES_RE = /(?:PRO|ECN|STD|STP|RAW|ZERO|CENT|MICRO|MINI|NANO|FIX|VAR|SWAP|NDD|PRIME|CLASSIC|STANDARD|M|C|E|X|S|R|B|F|K)$/;

export const normalizeSymbol = (symbol: string): string => {
  const normalized = symbol.trim().toUpperCase().replace(/[\/\s]+/g, '');
  if (!normalized) return '';

  const strippedTransportSuffix = normalized.replace(/[._-].*$/, '');

  if (EXPLICIT_SYMBOL_ALIASES[strippedTransportSuffix]) {
    return EXPLICIT_SYMBOL_ALIASES[strippedTransportSuffix];
  }

  if (strippedTransportSuffix.endsWith('M')) {
    const withoutSuffix = strippedTransportSuffix.slice(0, -1);
    if (LEGACY_SUFFIX_BASES.has(withoutSuffix)) {
      return withoutSuffix;
    }
  }

  if (KNOWN_BASE_SYMBOLS.has(strippedTransportSuffix)) {
    return strippedTransportSuffix;
  }

  if (strippedTransportSuffix.length === 6) {
    return strippedTransportSuffix;
  }

  if (strippedTransportSuffix.length > 6) {
    const strippedBrokerSuffix = strippedTransportSuffix.replace(BROKER_SUFFIXES_RE, '');
    if (strippedBrokerSuffix.length >= 5 && strippedBrokerSuffix.length <= 6) {
      return strippedBrokerSuffix;
    }
    return strippedTransportSuffix.slice(0, 6);
  }

  return strippedTransportSuffix;
};
