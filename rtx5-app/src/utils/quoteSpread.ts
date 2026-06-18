const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const resolveDigits = (digits: unknown): number | undefined => {
  const parsed = toFiniteNumber(digits);
  if (parsed === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(8, Math.floor(parsed)));
};

export const calculateQuoteSpreadPoints = (
  bid: unknown,
  ask: unknown,
  digits: unknown,
): number | undefined => {
  const safeBid = toFiniteNumber(bid);
  const safeAsk = toFiniteNumber(ask);
  const safeDigits = resolveDigits(digits);

  if (safeBid === undefined || safeAsk === undefined || safeDigits === undefined || safeAsk < safeBid) {
    return undefined;
  }

  // Market Watch style spread: ask minus bid converted to display points.
  // Round both prices first so the spread matches what the user sees on screen.
  const scale = 10 ** safeDigits;
  const bidPoints = Math.round(safeBid * scale);
  const askPoints = Math.round(safeAsk * scale);
  return Math.max(0, askPoints - bidPoints);
};
