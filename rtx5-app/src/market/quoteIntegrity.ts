import { MARKET_QUOTE_STALE_AFTER_MS } from './quotePolicy';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
} from '../state/activeBrokerSession';
import { getFeedHealthSnapshot } from './feedHealthRuntime';
import {
  feedHealthAllowsPriceActions,
  feedHealthStateMatchesIdentity,
} from './feedHealthState';
import { recordMarketDataEvent } from './marketDataTelemetry';

export type QuoteTransport = 'websocket' | 'rest_snapshot';

export type ExecutableQuoteInput = {
  bid?: unknown;
  ask?: unknown;
  lastReceivedAt?: unknown;
  lastTickAt?: unknown;
  feedTickAt?: unknown;
  ageMs?: unknown;
  ageSec?: unknown;
  transport?: QuoteTransport;
  stale?: boolean;
  tradable?: boolean;
  degraded?: boolean;
};

export type QuoteActionAvailability =
  | { allowed: true; bid: number; ask: number }
  | {
      allowed: false;
      reason:
        | 'missing_quote'
        | 'snapshot_only'
        | 'invalid_price'
        | 'stale_quote'
        | 'degraded_quote'
        | 'not_tradable'
        | 'feed_unavailable';
    };

const toFinitePositiveNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Fail-closed policy for any action that can execute at the displayed price.
 * REST is intentionally display/snapshot-only; only a fresh, explicitly
 * tradable websocket quote can enable a price action.
 */
export const resolveQuoteActionAvailability = (
  quote: ExecutableQuoteInput | null | undefined,
  now = Date.now(),
): QuoteActionAvailability => {
  if (!quote) {
    return { allowed: false, reason: 'missing_quote' };
  }

  if (quote.transport !== 'websocket') {
    return { allowed: false, reason: 'snapshot_only' };
  }

  const bid = toFinitePositiveNumber(quote.bid);
  const ask = toFinitePositiveNumber(quote.ask);
  if (bid === undefined || ask === undefined || ask < bid) {
    return { allowed: false, reason: 'invalid_price' };
  }

  const receivedAt = toFinitePositiveNumber(quote.lastReceivedAt ?? quote.lastTickAt);
  if (
    quote.stale === true ||
    receivedAt === undefined ||
    now - receivedAt > MARKET_QUOTE_STALE_AFTER_MS
  ) {
    return { allowed: false, reason: 'stale_quote' };
  }

  const feedTickAt = toFinitePositiveNumber(quote.feedTickAt);
  const reportedAgeMs = toFinitePositiveNumber(quote.ageMs);
  const reportedAgeSec = toFinitePositiveNumber(quote.ageSec);
  const sourceAgeMs = feedTickAt === undefined ? Number.POSITIVE_INFINITY : now - feedTickAt;
  const effectiveSourceAgeMs = Math.max(
    sourceAgeMs,
    reportedAgeMs ?? 0,
    reportedAgeSec === undefined ? 0 : reportedAgeSec * 1_000,
  );
  if (
    feedTickAt === undefined ||
    sourceAgeMs < 0 ||
    !Number.isFinite(effectiveSourceAgeMs) ||
    effectiveSourceAgeMs > MARKET_QUOTE_STALE_AFTER_MS
  ) {
    return { allowed: false, reason: 'stale_quote' };
  }

  if (quote.degraded === true) {
    return { allowed: false, reason: 'degraded_quote' };
  }

  if (quote.tradable !== true) {
    return { allowed: false, reason: 'not_tradable' };
  }

  return { allowed: true, bid, ask };
};

/** Active-session guard layered over the quote-local freshness checks. */
export const resolveSessionQuoteActionAvailability = (
  quote: ExecutableQuoteInput | null | undefined,
  now = Date.now(),
): QuoteActionAvailability => {
  const availability = resolveQuoteActionAvailability(quote, now);
  if (!availability.allowed) return availability;

  const capture = captureActiveBrokerSession();
  if (!capture) return { allowed: false, reason: 'feed_unavailable' };
  const identity = getActiveBrokerSessionIdentity(capture.session);
  const health = getFeedHealthSnapshot();
  if (
    !feedHealthStateMatchesIdentity(health, identity) ||
    !feedHealthAllowsPriceActions(health, now)
  ) {
    return { allowed: false, reason: 'feed_unavailable' };
  }
  return availability;
};

export const quoteActionBlockMessage = (availability: QuoteActionAvailability): string => {
  if (availability.allowed) {
    return '';
  }

  switch (availability.reason) {
    case 'snapshot_only':
      return 'A delayed market snapshot is available, but a live tradable quote is required.';
    case 'stale_quote':
      return 'The live quote is stale. Wait for the market feed to recover and try again.';
    case 'degraded_quote':
      return 'The market feed is degraded. Wait for a complete live quote and try again.';
    case 'not_tradable':
      return 'This live quote is not currently marked tradable.';
    case 'invalid_price':
      return 'The live bid/ask is invalid. Wait for the next quote and try again.';
    case 'feed_unavailable':
      return 'Market data is unavailable or delayed. Wait for broker feed health to recover.';
    default:
      return 'A live tradable quote is required before placing this order.';
  }
};

/** Records only the action category and fail-closed reason, never prices or symbols. */
export const recordBlockedPriceAction = (
  action: string,
  availability: QuoteActionAvailability,
): void => {
  if (availability.allowed) return;
  const capture = captureActiveBrokerSession();
  recordMarketDataEvent('trade_blocked', {
    action,
    reason: availability.reason,
    brokerId: capture?.session.brokerId,
    sessionEpoch: capture?.session.sessionEpoch,
  });
};
