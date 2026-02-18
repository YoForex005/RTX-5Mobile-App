export const fmt = {
  price: (value: number, digits = 2) => value.toFixed(digits),
  pnl: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`,
  pct: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
  int: (value: number) => value.toLocaleString('en-US'),
};
