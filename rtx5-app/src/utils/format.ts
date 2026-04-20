/**
 * Common formatting utilities for consistent UI presentation of numeric financial data.
 * Guarantees safe fallbacks for undefined/null values to prevent crashes.
 */
export const fmt = {
  price: (value: number) => (value || 0).toFixed(2),
  pnl: (value: number) => `${(value || 0) >= 0 ? '+' : ''}${(value || 0).toFixed(2)}`,
  pnlPrecise: (value: number) => {
    const safe = Number.isFinite(value) ? value : 0;
    return `${safe >= 0 ? '+' : ''}${safe.toFixed(2)}`;
  },
  pct: (value: number) => `${(value || 0) >= 0 ? '+' : ''}${(value || 0).toFixed(2)}%`,
  int: (value: number) => {
    const fixed = (value || 0).toFixed(0);
    return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },
  decimal: (value: number) => {
    const fixed = (value || 0).toFixed(2);
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  },
  symbol: (symbol?: string) => (symbol || '').replace(/\//g, ''),
};
