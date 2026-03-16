import { create } from 'zustand';
import { QuoteItem } from '../mock/tradingData';

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AccountSummary = {
  floating: number;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  credit?: number;
};

type TradingState = {
  quotes: Record<string, QuoteItem>;
  account: AccountSummary | null;
  candles: Record<string, Candle[]>; // Keyed by "Symbol.Timeframe" e.g. "EURUSD.H1"

  setQuote: (symbol: string, data: Partial<QuoteItem>) => void;
  setAccount: (data: Partial<AccountSummary>) => void;
  setCandleHistory: (symbol: string, timeframe: string, history: Candle[]) => void;
  updateCandle: (symbol: string, timeframe: string, candle: Candle) => void;
};

export const useTradingState = create<TradingState>((set) => ({
  quotes: {},
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
