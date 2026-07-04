import { isCryptoSymbol } from '../../domain/symbols';

const normalizeChartSymbolKey = (symbol: string): string => {
  const compact = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const withoutNamedSuffix = compact.replace(/(?:MICRO|PRO|RAW|STD|STP|CENT|ECN)$/i, '');
  if (withoutNamedSuffix.length > 6 && /^[A-Z]{6}[A-Z]$/.test(withoutNamedSuffix)) {
    const suffix = withoutNamedSuffix.slice(-1);
    if (suffix === 'C' || suffix === 'E' || suffix === 'M') {
      return withoutNamedSuffix.slice(0, -1);
    }
  }
  return withoutNamedSuffix;
};

const CURRENCY_NAMES: Record<string, string> = {
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  NZD: 'New Zealand Dollar',
  USD: 'US Dollar',
};

export const SYMBOL_FLAGS: Record<string, [string, string]> = {
  EURUSD: ['eu', 'us'],
  GBPUSD: ['gb', 'us'],
  AUDUSD: ['au', 'us'],
  USDJPY: ['us', 'jp'],
  NZDUSD: ['nz', 'us'],
  USDCAD: ['us', 'ca'],
  EURGBP: ['eu', 'gb'],
  AUDCAD: ['au', 'ca'],
  AUDCHF: ['au', 'ch'],
  AUDJPY: ['au', 'jp'],
};

export const SYMBOL_LOGOS: Record<string, string> = {
  BTCUSD: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  XAUUSD: 'https://assets.coingecko.com/coins/images/10481/small/tether-gold.png',
};

export const SYMBOL_NAMES: Record<string, string> = {
  AUDCAD: 'Australian Dollar / Canadian Dollar',
  AUDCHF: 'Australian Dollar / Swiss Franc',
  AUDJPY: 'Australian Dollar / Japanese Yen',
  AUDUSD: 'Australian Dollar / US Dollar',
  BTCUSD: 'Bitcoin / US Dollar',
  ETHUSD: 'Ethereum / US Dollar',
  EURGBP: 'Euro / British Pound',
  EURJPY: 'Euro / Japanese Yen',
  EURUSD: 'Euro / US Dollar',
  GBPJPY: 'British Pound / Japanese Yen',
  GBPUSD: 'British Pound / US Dollar',
  NZDUSD: 'New Zealand Dollar / US Dollar',
  USDCAD: 'US Dollar / Canadian Dollar',
  USDCHF: 'US Dollar / Swiss Franc',
  USDJPY: 'US Dollar / Japanese Yen',
  XAGUSD: 'Silver / US Dollar',
  XAUUSD: 'Gold / US Dollar',
  XPDUSD: 'Palladium / US Dollar',
  XPTUSD: 'Platinum / US Dollar',
};

export const DEFAULT_CHART_SYMBOLS: readonly string[] = Object.freeze(Object.keys(SYMBOL_NAMES));

export const SYMBOL_CATEGORY: Record<string, string> = {
  BTCUSD: 'CRYPTO',
  ETHUSD: 'CRYPTO',
  XAGUSD: 'METAL',
  XAUUSD: 'METAL',
  XPDUSD: 'METAL',
  XPTUSD: 'METAL',
};

export const resolveChartSymbolKey = (symbol: string): string => normalizeChartSymbolKey(symbol);

export const resolveChartSymbolCategory = (symbol: string): string | null => {
  const key = normalizeChartSymbolKey(symbol);
  if (!key) {
    return null;
  }

  if (isCryptoSymbol(key)) {
    return 'CRYPTO';
  }

  const knownCategory = SYMBOL_CATEGORY[key];
  if (knownCategory) {
    return knownCategory;
  }

  if (/^[A-Z]{6}$/.test(key)) {
    const base = key.slice(0, 3);
    const quote = key.slice(3);
    if (CURRENCY_NAMES[base] && CURRENCY_NAMES[quote]) {
      return 'FOREX';
    }
  }

  return null;
};

export const resolveChartSymbolFullName = (symbol: string): string => {
  const key = normalizeChartSymbolKey(symbol);
  if (!key) {
    return symbol;
  }

  const knownName = SYMBOL_NAMES[key];
  if (knownName) {
    return knownName;
  }

  if (/^[A-Z]{6}$/.test(key)) {
    const base = key.slice(0, 3);
    const quote = key.slice(3);
    return `${CURRENCY_NAMES[base] ?? base} / ${CURRENCY_NAMES[quote] ?? quote}`;
  }

  return key;
};
