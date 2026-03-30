/**
 * Core module: tradingState.ts
 */

import { create } from 'zustand';
import { QuoteItem } from '../mock/tradingData';

/** Represents a single financial timeframe segment (a candlestick). */
export type Candle = {
  /** Unix timestamp (in seconds) representing the start of the timeframe period */
  time: number;
  /** Price at the moment the candle opened */
  open: number;
  /** Highest price reached during the timeframe */
  high: number;
  /** Lowest price reached during the timeframe */
  low: number;
  /** Price at the moment the candle closed (or current price if active) */
  close: number;
  /** Total traded volume (or tick count) during the timeframe */
  volume: number;
};

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
  /** Dictionary of historic/live candles Keyed by "Symbol.Timeframe" e.g. "EURUSD.H1" */
  candles: Record<string, Candle[]>; 

  /** Updates or merges quote data for a specific symbol */
  setQuote: (symbol: string, data: Partial<QuoteItem>) => void;
  /** Updates the overall account summary */
  setAccount: (data: Partial<AccountSummary>) => void;
  /** Completely replaces the candle history list for a specific symbol/timeframe pair */
  setCandleHistory: (symbol: string, timeframe: string, history: Candle[]) => void;
  /** Appends a new candle or updates the terminal (active) candle in real-time */
  updateCandle: (symbol: string, timeframe: string, candle: Candle) => void;
};


export const useTradingState = create<TradingState>((set) => ({
  quotes: {},
  tickCount: 0,
  account: null,
  candles: {},

  setQuote: (symbol, data) =>
    set((state) => {
      const existing = state.quotes[symbol];
      if (!existing) {
        // We only want to patch existing full quotes or require the caller to provide enough data
        // For our simplified WebSocket ticks, it usually just sends { symbol, bid, ask }
        // We will merge it. Note: the actual app structure might require `QuoteItem` to be fully formed.
        // If a new quote ticks we haven't seen, we'll cast it to `QuoteItem`.
        return {
          quotes: {
            ...state.quotes,
            [symbol]: { ...data, symbol } as QuoteItem,
          },
        };
      }
      
      // Because they send identical bids/asks over WS often without changing ticks, compute delta:
      const incomingBid = data.bid;
      const incomingAsk = data.ask;
      
      const prevBidState = incomingBid && incomingBid !== existing.bid ? existing.bid : existing.prevBid;
      const prevAskState = incomingAsk && incomingAsk !== existing.ask ? existing.ask : existing.prevAsk;

      return {
        quotes: {
          ...state.quotes,
          [symbol]: {
            ...existing,
            ...data,
            // Automatically calculate spread if bid/ask provided
            spread: (data.ask && data.bid) ? (data.ask - data.bid) * Math.pow(10, existing.digits ?? 5) : existing.spread,
            // Track previous prices
            prevBid: prevBidState,
            prevAsk: prevAskState,
          },
        },
      };
    }),

  setAccount: (data) =>
    set((state) => ({
      account: state.account ? { ...state.account, ...data } : (data as AccountSummary),
    })),

  setCandleHistory: (symbol, timeframe, history) =>
    set((state) => ({
      candles: {
        ...state.candles,
        [`${symbol}.${timeframe}`]: history,
      },
    })),

  updateCandle: (symbol, timeframe, newCandle) =>
    set((state) => {
      const key = `${symbol}.${timeframe}`;
      const existing = state.candles[key] || [];
      if (existing.length === 0) {
        return { candles: { ...state.candles, [key]: [newCandle] } };
      }

      // If the incoming candle has the same timestamp as the last one, it's an update.
      // If it's newer, we append it.
      const last = existing[existing.length - 1];
      let nextList = [...existing];
      if (last.time === newCandle.time) {
        nextList[nextList.length - 1] = newCandle;
      } else if (newCandle.time > last.time) {
        nextList.push(newCandle);
        if (nextList.length > 1000) nextList.shift(); // Keep bounded
      }

      return {
        candles: { ...state.candles, [key]: nextList },
      };
    }),
}));
