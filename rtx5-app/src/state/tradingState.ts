/**
 * Core module: tradingState.ts
 */

import { create } from 'zustand';
import { QuoteItem, quotes as mockQuotes } from '../mock/tradingData';
import type { Candle } from '../candles/candleTypes';
import { sanitizeCandlesForChart } from '../candles/chartAdapter';
import { normalizeSymbol, normalizeTimeframeStrict, normalizeTimestampToMs } from '../candles/timeframeUtils';
import { hasQuotePriceChange } from '../utils/quotePriceChange';

const symbolSpecs = new Map(mockQuotes.map((q) => [q.symbol, q]));


/** Represents a single financial timeframe segment (a candlestick). */
export type { Candle };

/** High-level overview of the trading account's equity and margin usage. */
export type AccountSummary = {
  /** Unrealized profit or loss across all open positions */
  floating: number;
  /** Base currency code for the account (e.g., 'USD', 'EUR') */
  currency: string;
  /** Settled cash balance excluding open positions */
  balance: number;
  /** Total value of the account (balance + floating PnL) */
  equity: number;
  /** Margin funds locked by open positions */
  margin: number;
  /** Available margin funds for opening new positions */
  freeMargin: number;
  /** Margin health indicator (equity / margin * 100) */
  marginLevel: number;
  /** Optional credit or bonus funds provided by the broker */
  credit?: number;
};

/**
 * Global Zustand store managing real-time market data (quotes and candles) 
 * and generic account summaries.
 */
type TradingState = {
  /** Dictionary of live quotes keyed by symbol (e.g., 'EURUSD') */
  quotes: Record<string, QuoteItem>;
  /** Primitive counter — increments on every live tick for reliable React 19 re-renders */
  tickCount: number; 
  /** Current account summary snapshot */
  account: AccountSummary | null;
  /**
   * Canonical chart-visible candle cache keyed by "Symbol.Timeframe" e.g. "EURUSD.H1".
   * This must remain the healed/merged series the chart can safely render on remount,
   * not a raw REST-history-only buffer.
   */
  candles: Record<string, Candle[]>; 

  /** Updates or merges quote data for a specific symbol */
  setQuote: (symbol: string, data: Partial<QuoteItem>) => void;
  /** Updates the overall account summary */
  setAccount: (data: Partial<AccountSummary>) => void;
  /**
   * Low-level cache write for canonical candle series only.
   * Raw history snapshots should be routed through `state/candleCache.ts`.
   */
  setCandleHistory: (symbol: string, timeframe: string, history: Candle[]) => void;
};


export const useTradingState = create<TradingState>((set) => ({
  quotes: {},
  tickCount: 0,
  account: null,
  candles: {},

  setQuote: (symbol, data) =>
    set((state) => {
      const normalizedSymbol = normalizeSymbol(symbol);
      if (!normalizedSymbol) {
        return state;
      }

      const existing = state.quotes[normalizedSymbol];
      const spec = symbolSpecs.get(normalizedSymbol);
      const feedTickAt = normalizeTimestampToMs(
        data.feedTickAt ?? data.lastTickAt ?? (data as Record<string, unknown>).timestamp ?? (data as Record<string, unknown>).time ?? (data as Record<string, unknown>).t,
      );
      const lastReceivedAt =
        normalizeTimestampToMs(data.lastReceivedAt ?? (data as Record<string, unknown>).receivedAt) ??
        (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : existing?.lastReceivedAt);
      const priceChanged = hasQuotePriceChange(existing, data);
      const lastPriceChangedAt = priceChanged
        ? lastReceivedAt
        : existing?.lastPriceChangedAt;

      if (!existing) {
        // We only want to patch existing full quotes or require the caller to provide enough data
        // For our simplified WebSocket ticks, it usually just sends { symbol, bid, ask }
        // We will merge it. Note: the actual app structure might require `QuoteItem` to be fully formed.
        // If a new quote ticks we haven't seen, we'll cast it to `QuoteItem`.
        const digits = data.digits ?? spec?.digits ?? 5;
        const volume = data.volume ?? spec?.volume ?? 0;
        const lastTickAt =
          feedTickAt ??
          (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : undefined);
        const newQuote = {
          ...spec,
          ...data,
          symbol: normalizedSymbol,
          digits,
          volume,
          feedTickAt: feedTickAt ?? undefined,
          lastTickAt,
          lastReceivedAt,
          lastPriceChangedAt,
        } as QuoteItem;
        
        if (newQuote.ask && newQuote.bid) {
          newQuote.spread = (newQuote.ask - newQuote.bid) * Math.pow(10, digits);
        }

        return {
          quotes: {
            ...state.quotes,
            [normalizedSymbol]: newQuote,
          },
          tickCount: state.tickCount + (priceChanged ? 1 : 0),
        };
      }
      
      // Because they send identical bids/asks over WS often without changing ticks, compute delta:
      const incomingBid = data.bid;
      const incomingAsk = data.ask;
      
      const prevBidState = incomingBid && incomingBid !== existing.bid ? existing.bid : existing.prevBid;
      const prevAskState = incomingAsk && incomingAsk !== existing.ask ? existing.ask : existing.prevAsk;

      const digits = existing.digits ?? data.digits ?? spec?.digits ?? 5;
      const volume = data.volume ?? existing.volume ?? spec?.volume ?? 0;
      const lastTickAt =
        feedTickAt ??
        (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : existing.lastTickAt);

      return {
        quotes: {
          ...state.quotes,
          [normalizedSymbol]: {
            ...spec,
            ...existing,
            ...data,
            symbol: normalizedSymbol,
            digits,
            volume,
            feedTickAt: feedTickAt ?? undefined,
            lastTickAt,
            lastReceivedAt,
            lastPriceChangedAt,
            // Automatically calculate spread if bid/ask provided
            spread: (data.ask && data.bid) ? (data.ask - data.bid) * Math.pow(10, digits) : existing.spread,
            // Track previous prices
            prevBid: prevBidState,
            prevAsk: prevAskState,
          },
        },
        tickCount: state.tickCount + (priceChanged ? 1 : 0),
      };
    }),

  setAccount: (data) =>
    set((state) => ({
      account: state.account ? { ...state.account, ...data } : (data as AccountSummary),
    })),

  setCandleHistory: (symbol, timeframe, history) =>
    set((state) => {
      const normalizedSymbol = normalizeSymbol(symbol);
      const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
      if (!normalizedSymbol || !normalizedTimeframe) {
        return state;
      }

      return {
        candles: {
          ...state.candles,
          [`${normalizedSymbol}.${normalizedTimeframe}`]: sanitizeCandlesForChart(history),
        },
      };
    }),

}));
