export type ExactChartQuoteSnapshot = Readonly<{
  scopeKey: string;
  bid: number;
  ask: number;
  feedTickAt?: number;
  receivedAt?: number;
  transport?: string;
  source?: string;
  authority?: string;
}>;

export type ExactChartQuoteInput = {
  bid?: unknown;
  ask?: unknown;
  feedTickAt?: unknown;
  timestamp?: unknown;
  lastTickAt?: unknown;
  receivedAt?: unknown;
  lastReceivedAt?: unknown;
  transport?: unknown;
  source?: unknown;
  authority?: unknown;
};

const positiveFinite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const cleanString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Capture an exact backend Bid/Ask pair for display. No side is calculated from
 * candle close, spread, symbol precision, or another broker's cached value.
 */
export const captureExactChartQuote = (
  scopeKey: string,
  quote: ExactChartQuoteInput | null | undefined,
): ExactChartQuoteSnapshot | null => {
  if (!scopeKey || !quote) return null;
  const bid = positiveFinite(quote.bid);
  const ask = positiveFinite(quote.ask);
  if (bid === undefined || ask === undefined || ask < bid) return null;

  const feedTickAt =
    positiveFinite(quote.feedTickAt) ??
    positiveFinite(quote.timestamp) ??
    positiveFinite(quote.lastTickAt);
  const receivedAt =
    positiveFinite(quote.receivedAt) ?? positiveFinite(quote.lastReceivedAt);

  return {
    scopeKey,
    bid,
    ask,
    ...(feedTickAt === undefined ? {} : { feedTickAt }),
    ...(receivedAt === undefined ? {} : { receivedAt }),
    ...(cleanString(quote.transport) === undefined ? {} : { transport: cleanString(quote.transport) }),
    ...(cleanString(quote.source) === undefined ? {} : { source: cleanString(quote.source) }),
    ...(cleanString(quote.authority) === undefined ? {} : { authority: cleanString(quote.authority) }),
  };
};

export const readExactChartQuoteForScope = (
  scopeKey: string,
  retained: ExactChartQuoteSnapshot | null | undefined,
): ExactChartQuoteSnapshot | null =>
  retained?.scopeKey === scopeKey ? retained : null;

export const isSameExactChartQuote = (
  left: ExactChartQuoteSnapshot | null | undefined,
  right: ExactChartQuoteSnapshot | null | undefined,
): boolean =>
  left?.scopeKey === right?.scopeKey &&
  left?.bid === right?.bid &&
  left?.ask === right?.ask &&
  left?.feedTickAt === right?.feedTickAt &&
  left?.receivedAt === right?.receivedAt;
