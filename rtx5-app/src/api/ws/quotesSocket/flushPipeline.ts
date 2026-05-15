/**
 * Pending-tick flush pipeline.
 *
 * Quote ticks are coalesced on a short timer so React isn't asked to re-render
 * once per WS message. The broker can deliver bursts that are faster than a
 * mobile chart can paint; keeping only the latest per-symbol snapshot per
 * interval preserves the current price while leaving touch/navigation work
 * room on the JS thread.
 *
 * Extracted from `QuotesWebSocketService` so the service stays under the
 * 500-line ceiling.
 */
import { useTradingState } from '../../../state/tradingState';
import { quotes as mockQuotes } from '../../../dev/mock/tradingData';
import { hasQuotePriceChange } from '../../../utils/quotePriceChange';
import { normalizeQuoteTickTimestampToMs } from '../quoteTimestamp';

const symbolSpecs = new Map(mockQuotes.map((q) => [q.symbol, q]));
const QUOTE_STORE_FLUSH_INTERVAL_MS = 50;

export interface FlushPipelineState {
  flushScheduled: boolean;
  flushAnimationFrame: number | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  pendingUpdates: Map<string, any>;
}

export const scheduleFlush = (state: FlushPipelineState): void => {
  if (state.flushScheduled) {
    return;
  }

  state.flushScheduled = true;
  const commitFlush = () => {
    if (state.flushAnimationFrame !== null) {
      cancelAnimationFrame(state.flushAnimationFrame);
      state.flushAnimationFrame = null;
    }
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    if (!state.flushScheduled) {
      return;
    }
    state.flushScheduled = false;
    flushUpdates(state);
  };

  state.flushTimer = setTimeout(commitFlush, QUOTE_STORE_FLUSH_INTERVAL_MS);
};

export const cancelFlush = (state: FlushPipelineState): void => {
  if (state.flushAnimationFrame !== null) {
    cancelAnimationFrame(state.flushAnimationFrame);
    state.flushAnimationFrame = null;
  }
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  state.flushScheduled = false;
  state.pendingUpdates.clear();
};

export const flushUpdates = (state: FlushPipelineState): void => {
  if (state.pendingUpdates.size === 0) return;

  const updates = state.pendingUpdates;
  state.pendingUpdates = new Map();
  const now = Date.now();

  useTradingState.setState((tradingState) => {
    const newQuotes = { ...tradingState.quotes };
    let priceChangeCount = 0;

    updates.forEach((data, symbol) => {
      const bid: number = data.bid;
      const ask: number = data.ask;
      const existing = newQuotes[symbol];
      const spec = symbolSpecs.get(symbol);
      const feedTickAt =
        normalizeQuoteTickTimestampToMs(data.feedTickAt ?? data.lastTickAt ?? data.timestamp ?? data.time ?? data.t);
      const lastReceivedAt =
        normalizeQuoteTickTimestampToMs(data.lastReceivedAt) ?? now;
      const lastTickAt = feedTickAt ?? now;
      const priceChanged = hasQuotePriceChange(existing, {
        bid,
        ask,
        bidHigh: data.bidHigh,
        bidLow: data.bidLow,
      });
      const lastPriceChangedAt = priceChanged
        ? lastReceivedAt
        : existing?.lastPriceChangedAt;

      if (!existing) {
        const digits = data.digits ?? spec?.digits ?? 5;
        const volume = data.volume ?? spec?.volume ?? 0;
        const entry: any = {
          symbol,
          digits,
          volume,
          feedTickAt,
          lastTickAt,
          lastReceivedAt,
          lastPriceChangedAt,
          bid,
          ask,
        };
        // Copy spec defaults then server data in one pass
        if (spec) { const s = spec as any; for (const k in s) { if (entry[k] === undefined) entry[k] = s[k]; } }
        for (const k in data) { if (k !== 'symbol') entry[k] = data[k]; }
        entry.feedTickAt = feedTickAt ?? undefined;
        entry.lastTickAt = lastTickAt;
        entry.lastReceivedAt = lastReceivedAt;
        entry.lastPriceChangedAt = lastPriceChangedAt;
        entry.spread = (ask - bid) * Math.pow(10, digits);
        newQuotes[symbol] = entry;
      } else {
        const digits = existing.digits ?? data.digits ?? spec?.digits ?? 5;
        const volume = data.volume ?? existing.volume ?? spec?.volume ?? 0;

        // Single object creation — merge existing + server data in one allocation
        const updated: any = {};
        // Copy existing (cheapest — already has spec baked in from first tick)
        for (const k in existing) { updated[k] = (existing as any)[k]; }
        // Overlay server-sent fields
        for (const k in data) { updated[k] = data[k]; }
        // Override computed fields
        updated.symbol = symbol;
        updated.bid = bid;
        updated.ask = ask;
        updated.digits = digits;
        updated.volume = volume;
        updated.feedTickAt = feedTickAt ?? undefined;
        updated.lastTickAt = lastTickAt;
        updated.lastReceivedAt = lastReceivedAt;
        updated.lastPriceChangedAt = lastPriceChangedAt;
        updated.spread = (ask - bid) * Math.pow(10, digits);
        updated.prevBid = bid !== existing.bid ? existing.bid : existing.prevBid;
        updated.prevAsk = ask !== existing.ask ? existing.ask : existing.prevAsk;
        newQuotes[symbol] = updated;
      }

      if (priceChanged) {
        priceChangeCount += 1;
      }
    });

    // Always bump tickCount per flushed symbol so live-feed subscribers
    // re-render on every tick — including identical-price heartbeats.
    // priceChangeCount is retained as a hint but not used for gating.
    void priceChangeCount;
    return { quotes: newQuotes, tickCount: tradingState.tickCount + updates.size };
  });
};
