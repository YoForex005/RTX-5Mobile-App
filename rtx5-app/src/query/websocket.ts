/**
 * Core module: websocket.ts
 */

import React, { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';

import { wsService } from '../api/ws/socket';
import { quotesWsService } from '../api/ws/quotesSocket';
import { useTradingState, Candle } from '../state/tradingState';
import { mergeHistoryIntoCandleCache } from '../state/candleCache';
import { quotes as mockQuotes } from '../mock/tradingData';
import { normalizeSymbol } from '../domain/symbols';

// ─── WebSocket Global Connection Hook ───────────────────────────────────────

/**
 * Initializes and manages the global WebSocket connection.
 * Mount this in a top-level provider (e.g., _layout.tsx) so the WS connection
 * persists across screens.
 */
export function useWebSocketConnection() {
  useEffect(() => {
    // Attempt connection on mount
    wsService.connect();

    // Clean up on unmount
    return () => {
      wsService.disconnect();
    };
  }, []);

  return { connected: wsService.getConnectionStatus() };
}

// ─── Component Data Hooks (TanStack Query + Zustand) ────────────────────────

/**
 * Hook to subscribe to live price ticks for a specific array of symbols.
 * 
 * NOTE ON ARCHITECTURE:
 * We use `useEffect` to tell the WebSocketService to subscribe.
 * The WebSocketService independently dispatches ticks directly to `useTradingState`.
 * We return the `useTradingState` selector so the component only re-renders
 * when the specific symbols it cares about update.
 */
export function useMarketData(symbols: string[] = []) {
  const normalizedSymbols = React.useMemo(
    () => Array.from(new Set(symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean))),
    [JSON.stringify(symbols)],
  );

  // Selector that picks ONLY the quotes this component cares about.
  // Zustand + shallow comparison ensures we only re-render when one of
  // OUR symbols changes — not when an unrelated symbol ticks.
  // This is the key optimization: a QuoteDetails page watching EURUSD
  // no longer re-renders when BTCUSD ticks.
  const stableKey = JSON.stringify(normalizedSymbols);
  const selector = useCallback(
    (state: any) => {
      if (normalizedSymbols.length === 0) return state.quotes;
      const result: Record<string, any> = {};
      for (const sym of normalizedSymbols) {
        if (state.quotes[sym]) result[sym] = state.quotes[sym];
      }
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey],
  );
  const liveQuotes = useTradingState(useShallow(selector));

  useEffect(() => {
    if (normalizedSymbols.length === 0) return;
    quotesWsService.connect();
    quotesWsService.subscribe(normalizedSymbols);

    return () => {
      quotesWsService.unsubscribe(normalizedSymbols);
    };
  }, [JSON.stringify(normalizedSymbols)]);

  if (symbols.length === 0) return liveQuotes;
  return symbols.reduce((acc, sym) => {
    const normalizedSymbol = normalizeSymbol(sym);
    const mock = mockQuotes.find((m) => normalizeSymbol(m.symbol) === normalizedSymbol);
    const live = liveQuotes[sym] || liveQuotes[normalizedSymbol];
    if (live || mock) {
      acc[sym] = { ...(mock || {}), ...(live || {}), symbol: normalizedSymbol };
    }
    return acc;
  }, {} as Record<string, any>);
}

/**
 * Hook to subscribe to live account metrics (equity, balance, etc).
 */
export function useLiveAccount(accountId: string) {
  const account = useTradingState(state => state.account);

  useEffect(() => {
    if (!accountId) return;

    const channel = `account.${accountId}`;
    wsService.subscribe(channel);

    return () => {
      wsService.unsubscribe(channel);
    };
  }, [accountId]);

  return account;
}

/**
 * Hook to stream candlestick data for a chart.
 * 
 * 1. Subscribes to WebSocket for live candle tick updates
 * 2. Requests candle history via WS
 * 3. If no data arrives within a timeout, generates demo candles as fallback
 * 
 * Returns { candles, isLoading, isError } for the chart to render states.
 */
export function useCandleStream(symbol: string, timeframe: string) {
  const key = `${symbol}.${timeframe}`;
  const candles = useTradingState(state => state.candles[key]);
  const [hasFallback, setHasFallback] = React.useState(false);

  // Subscribe to live candle ticks via WebSocket + request history
  useEffect(() => {
    if (!symbol || !timeframe) return;
    setHasFallback(false);

    const channel = `candles.${symbol}.${timeframe}`;
    wsService.subscribe(channel);

    // Request history via WS
    wsService.requestCandleHistory(symbol, timeframe, 200);

    // Fallback: if no data arrives in 3s, generate demo candles
    const fallbackTimer = setTimeout(() => {
      const store = useTradingState.getState();
      const existing = store.candles[`${symbol}.${timeframe}`];
      if (!existing || existing.length === 0) {
        const demoCandles = generateDemoCandles(symbol, 200);
        mergeHistoryIntoCandleCache(symbol, timeframe, demoCandles);
        setHasFallback(true);
      }
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      wsService.unsubscribe(channel);
    };
  }, [symbol, timeframe]);

  return {
    candles: candles || [],
    isLoading: !candles || candles.length === 0,
    isError: false,
    isFallback: hasFallback,
  };
}

// ─── Demo Candle Generator (fallback when API is unavailable) ────────────────

const DEMO_PRICES: Record<string, number> = {
  EURUSD: 1.0850, GBPUSD: 1.2740, AUDUSD: 0.6480, NZDUSD: 0.5920,
  USDJPY: 149.50, USDCAD: 1.3550, EURGBP: 0.8510, AUDCAD: 0.8790,
  AUDCHF: 0.5840, AUDJPY: 96.80, XAUUSD: 2950.00, BTCUSD: 85000.00,
};

function generateDemoCandles(symbol: string, count: number): Candle[] {
  let price = DEMO_PRICES[symbol] ?? 1.0500;
  const now = Math.floor(Date.now() / 1000);
  const interval = 60; // 1 minute between candles for demo  
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const isUp = Math.random() > 0.49;
    const range = price * 0.001;
    const open = price;
    let close = price + (isUp ? 1 : -1) * (Math.random() * range);
    if (Math.random() > 0.8) {
      close += (isUp ? 1 : -1) * range * 1.5;
    }
    const high = Math.max(open, close) + Math.random() * (range * 0.4);
    const low = Math.min(open, close) - Math.random() * (range * 0.4);
    price = close;

    candles.push({
      time: now - (count - i) * interval,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000) + 100,
    });
  }
  return candles;
}


