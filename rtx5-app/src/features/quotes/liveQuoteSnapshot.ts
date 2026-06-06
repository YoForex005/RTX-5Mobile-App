import { normalizeQuoteTickTimestampToMs } from '../../api/ws/quoteTimestamp';
import type { QuoteTickEvent } from '../../api/ws/quoteTickNormalizer';
import { normalizeSymbol } from '../../domain/symbols';
import { quotes as mockQuotes, type QuoteItem } from '../../dev/mock/tradingData';
import { hasQuotePriceChange } from '../../utils/quotePriceChange';
import { calculateQuoteSpreadPoints } from '../../utils/quoteSpread';

export const LIVE_QUOTE_STALE_MS = 45_000;

export type LiveQuoteSnapshot = Partial<QuoteItem> & {
  symbol: string;
  dailyOpen?: number;
  previousClose?: number;
  updateSeq?: number;
};

const quoteSpecBySymbol = new Map(
  mockQuotes.map((quote) => [normalizeSymbol(quote.symbol), quote]),
);

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

const resolveDigits = (
  symbol: string,
  bid: number,
  tickDigits?: number,
  previousDigits?: number,
  specDigits?: number,
): number => {
  const candidate = toFiniteNumber(tickDigits) ?? toFiniteNumber(previousDigits) ?? toFiniteNumber(specDigits);
  if (candidate !== undefined) {
    return Math.max(0, Math.min(8, Math.floor(candidate)));
  }

  if (symbol.endsWith('JPY')) return 3;
  if (bid >= 100) return 2;
  return 5;
};

const resolveChangePct = (
  tick: QuoteTickEvent,
  bid: number,
  previous?: LiveQuoteSnapshot,
): number | undefined => {
  const explicit = toFiniteNumber(tick.changePct);
  if (explicit !== undefined) {
    return explicit;
  }

  const reference =
    toFiniteNumber(tick.previousClose) ??
    toFiniteNumber(tick.dailyOpen) ??
    toFiniteNumber(tick.open) ??
    toFiniteNumber(previous?.open);

  if (reference === undefined || reference <= 0) {
    return previous?.changePct;
  }

  return ((bid - reference) / reference) * 100;
};

export const getQuoteFreshnessAnchor = (
  quote: Partial<QuoteItem> | undefined,
): number | undefined => {
  const lastReceivedAt = toFiniteNumber(quote?.lastReceivedAt);
  if (lastReceivedAt !== undefined) {
    return lastReceivedAt;
  }

  return toFiniteNumber(quote?.lastTickAt);
};

export const hasFreshLiveQuote = (
  quote: Partial<QuoteItem> | undefined,
  now = Date.now(),
): boolean => {
  const freshnessAnchor = getQuoteFreshnessAnchor(quote);
  return (
    !!quote &&
    toFiniteNumber(quote.bid) !== undefined &&
    toFiniteNumber(quote.ask) !== undefined &&
    freshnessAnchor !== undefined &&
    now - freshnessAnchor <= LIVE_QUOTE_STALE_MS
  );
};

export const hasDisplayableLiveQuotePrice = (
  quote: Partial<QuoteItem> | undefined,
): boolean =>
  !!quote &&
  toFiniteNumber(quote.bid) !== undefined &&
  toFiniteNumber(quote.ask) !== undefined;

export const buildInitialLiveQuoteSnapshot = (
  rawSymbol: string,
  liveQuote?: Partial<QuoteItem>,
): LiveQuoteSnapshot | undefined => {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return undefined;
  }

  const spec = quoteSpecBySymbol.get(symbol);
  if (!spec && !liveQuote) {
    return undefined;
  }

  const merged = {
    ...(spec || {}),
    ...(liveQuote || {}),
    symbol,
  };
  const spread = calculateQuoteSpreadPoints(merged.bid, merged.ask, merged.digits);

  return {
    ...merged,
    ...(spread === undefined ? {} : { spread }),
  };
};

export const applyLiveQuoteTickToSnapshot = (
  rawSymbol: string,
  previous: LiveQuoteSnapshot | undefined,
  tick: QuoteTickEvent,
  updateSeq: number,
  now = Date.now(),
): LiveQuoteSnapshot | undefined => {
  const requestedSymbol = normalizeSymbol(rawSymbol);
  const tickSymbol = normalizeSymbol(tick.symbol);
  const symbol = requestedSymbol || tickSymbol;
  if (!symbol || (tickSymbol && tickSymbol !== symbol)) {
    return previous;
  }

  const bid = toFiniteNumber(tick.bid);
  const ask = toFiniteNumber(tick.ask);
  if (bid === undefined || ask === undefined || ask < bid) {
    return previous;
  }

  const spec = quoteSpecBySymbol.get(symbol);
  const base = previous ?? buildInitialLiveQuoteSnapshot(symbol);
  const receivedAt = normalizeQuoteTickTimestampToMs(tick.receivedAt) ?? now;
  const feedTickAt = normalizeQuoteTickTimestampToMs(tick.feedTickAt ?? tick.timestamp);
  const lastTickAt = feedTickAt ?? receivedAt;
  const digits = resolveDigits(symbol, bid, tick.digits, base?.digits, spec?.digits);
  const bidChanged = base?.bid !== bid;
  const askChanged = base?.ask !== ask;
  const priceChanged = hasQuotePriceChange(base, tick);
  const previousClose = toFiniteNumber(tick.previousClose);
  const dailyOpen = toFiniteNumber(tick.dailyOpen);
  const open = dailyOpen ?? toFiniteNumber(tick.open) ?? base?.open ?? spec?.open;
  const high = toFiniteNumber(tick.high) ?? base?.high ?? spec?.high;
  const low = toFiniteNumber(tick.low) ?? base?.low ?? spec?.low;
  const volume = toFiniteNumber(tick.volume) ?? base?.volume ?? spec?.volume;
  const spread = calculateQuoteSpreadPoints(bid, ask, digits) ?? base?.spread ?? spec?.spread ?? 0;

  return {
    ...(spec || {}),
    ...(base || {}),
    symbol,
    bid,
    ask,
    prevBid: bidChanged ? base?.bid : base?.prevBid,
    prevAsk: askChanged ? base?.ask : base?.prevAsk,
    digits,
    spread,
    high,
    low,
    open,
    close: toFiniteNumber(tick.last) ?? base?.close ?? spec?.close,
    volume,
    changePct: resolveChangePct(tick, bid, base),
    feedTickAt: feedTickAt ?? undefined,
    lastTickAt,
    lastReceivedAt: receivedAt,
    lastPriceChangedAt: priceChanged ? receivedAt : base?.lastPriceChangedAt,
    previousClose,
    dailyOpen,
    updateSeq,
  } as LiveQuoteSnapshot;
};
