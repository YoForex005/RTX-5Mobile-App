/**
 * Live Market Candlestick Connector Hook
 * 
 * Acts as the bridge between standard React Query hooks and the 
 * high-frequency `CandlesWebSocketService`. 
 * It manages the transition from historical REST data into active streaming.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { candlesWsService } from '../api/ws/candlesSocket';
import { normalizeTimeframe } from '../domain/candles';

export type CandleParams = {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * Provides live OHLC candles by subscribing to the unified WebSocket/REST feed.
 * Natively throttles React rerender to exactly 1 per minute/period to avoid freezing ChartScreen.
 */
export function useLiveCandles(symbol: string, timeframe: string) {
  const [candles, setCandles] = useState<CandleParams[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandlesRef = useRef<CandleParams[] | null>(null);

  useEffect(() => {
    let unmounted = false;

    setCandles([]);
    pendingCandlesRef.current = null;
    if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);

    const handleArrayUpdate = (incomingSymbol: string, incomingTf: string, fullArray: CandleParams[]) => {
      if (unmounted) return;
      if (incomingSymbol.toUpperCase() !== symbol.toUpperCase()) return;
      if (normalizeTimeframe(incomingTf) !== normalizeTimeframe(timeframe)) return;

      // Keep UI updates near-real-time without flooding React on bursty feeds.
      pendingCandlesRef.current = fullArray;
      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(() => {
          if (!unmounted && pendingCandlesRef.current) {
            setCandles([...pendingCandlesRef.current]);
          }
          flushTimeoutRef.current = null;
        }, 16);
      }
    };

    candlesWsService.addArrayListener(handleArrayUpdate);
    if (symbol && timeframe) {
      candlesWsService.subscribe(symbol, timeframe);
    }

    return () => {
      unmounted = true;
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
      candlesWsService.removeArrayListener(handleArrayUpdate);
    };
    // accessToken is intentionally NOT a dependency. Token refresh is a
    // background concern handled by the WebSocket service itself; tying the
    // candle subscription to it caused the entire candle array to be wiped
    // (and a fresh history fetch to fire) every time the auth refresh
    // landed — which the user perceived as the chart "refreshing on its
    // own" whenever they switched tabs at the wrong moment. The hook now
    // re-subscribes ONLY on a real symbol or timeframe change.
  }, [symbol, timeframe]);

  /**
   * Force a fresh fetch of historical candles + WebSocket re-subscription.
   * Used by the chart screen's manual refresh button. Mirrors what
   * unsubscribe + subscribe does internally so the candlesWsService
   * treats it as a brand-new subscription and re-runs fetchHistoryAndSubscribe.
   */
  const refresh = useCallback(() => {
    if (!symbol || !timeframe) return;
    setCandles([]);
    pendingCandlesRef.current = null;
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    candlesWsService.unsubscribe();
    candlesWsService.subscribe(symbol, timeframe);
  }, [symbol, timeframe]);

  return { candles, refresh };
}

/**
 * Highly optimized decoupled micro-hook strictly for standalone price UI components (e.g. flashing text labels).
 * Guaranteed to run isolated from ChartScreen DOM depth, preventing memory leaks over hour-long trading runs.
 */
export function useLiveTick(symbol: string, timeframe?: string) {
  const [tick, setTick] = useState<CandleParams | null>(null);
  const pendingTickRef = useRef<CandleParams | null>(null);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let unmounted = false;

    const handleTick = (incomingSymbol: string, incomingTf: string, mutatedCandles: CandleParams[]) => {
      if (unmounted) return;
      if (incomingSymbol.toUpperCase() !== symbol.toUpperCase()) return;
      if (timeframe && normalizeTimeframe(incomingTf) !== normalizeTimeframe(timeframe)) return;
      if (mutatedCandles.length > 0) {
        pendingTickRef.current = mutatedCandles[mutatedCandles.length - 1];
        if (!flushTimeoutRef.current) {
          flushTimeoutRef.current = setTimeout(() => {
            if (!unmounted && pendingTickRef.current) {
              setTick({ ...pendingTickRef.current });
            }
            flushTimeoutRef.current = null;
          }, 16);
        }
      }
    };

    candlesWsService.addTickListener(handleTick);
    return () => {
      unmounted = true;
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
      candlesWsService.removeTickListener(handleTick);
    };
  }, [symbol, timeframe]);

  return tick;
}
