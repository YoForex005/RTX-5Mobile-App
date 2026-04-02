/**
 * Common formatting utilities for consistent UI presentation of numeric financial data.
 * Guarantees safe fallbacks for undefined/null values to prevent crashes.
 */
export const fmt = {
  price: (value: number) => (value || 0).toFixed(2),
  pnl: (value: number) => `${(value || 0) >= 0 ? '+' : ''}${(value || 0).toFixed(2)}`,
  pct: (value: number) => `${(value || 0) >= 0 ? '+' : ''}${(value || 0).toFixed(2)}%`,
  int: (value: number) => (value || 0).toLocaleString('en-US'),
  decimal: (value: number) =>
    (value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  symbol: (symbol?: string) => (symbol || '').replace(/\//g, ''),
};
