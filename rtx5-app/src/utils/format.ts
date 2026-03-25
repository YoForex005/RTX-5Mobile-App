export const fmt = {
  price: (value: number, digits = 2) => (value || 0).toFixed(digits),
  pnl: (value: number) => `${(value || 0) >= 0 ? '+' : ''}${(value || 0).toFixed(2)}`,
  pct: (value: number) => `${(value || 0) >= 0 ? '+' : ''}${(value || 0).toFixed(2)}%`,
  int: (value: number) => (value || 0).toLocaleString('en-US'),
  decimal: (value: number, digits = 2) =>
    (value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  symbol: (symbol?: string) => (symbol || '').replace(/\//g, ''),
};
