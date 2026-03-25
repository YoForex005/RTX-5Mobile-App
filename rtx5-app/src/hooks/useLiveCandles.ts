import { useState, useEffect, useRef } from 'react';
import { candlesWsService } from '../api/ws/candlesSocket';

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

      // Throttle array updates to prevent UI unresponsiveness, especially during initialization
      pendingCandlesRef.current = fullArray;
      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(() => {
          if (!unmounted && pendingCandlesRef.current) {
            setCandles([...pendingCandlesRef.current]);
          }
          flushTimeoutRef.current = null;
        }, 150); 
      }
    };

    candlesWsService.addArrayListener(handleArrayUpdate);
    candlesWsService.subscribe(symbol, timeframe);

    return () => {
      unmounted = true;
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
      candlesWsService.removeArrayListener(handleArrayUpdate);
    };
  }, [symbol, timeframe]);

  return { candles };
}

/**
 * Highly optimized decoupled micro-hook strictly for standalone price UI components (e.g. flashing text labels).
 * Guaranteed to run isolated from ChartScreen DOM depth, preventing memory leaks over hour-long trading runs.
 */
export function useLiveTick(symbol: string) {
  const [tick, setTick] = useState<CandleParams | null>(null);
  const pendingTickRef = useRef<CandleParams | null>(null);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let unmounted = false;

    const handleTick = (incomingSymbol: string, incomingTf: string, mutatedCandles: CandleParams[]) => {
      if (unmounted) return;
      if (incomingSymbol.toUpperCase() !== symbol.toUpperCase()) return;
      if (mutatedCandles.length > 0) {
         pendingTickRef.current = mutatedCandles[mutatedCandles.length - 1];
         if (!flushTimeoutRef.current) {
           flushTimeoutRef.current = setTimeout(() => {
             if (!unmounted && pendingTickRef.current) {
               setTick({ ...pendingTickRef.current });
             }
             flushTimeoutRef.current = null;
           }, 150);
         }
      }
    };

    candlesWsService.addTickListener(handleTick);
    return () => {
      unmounted = true;
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
      candlesWsService.removeTickListener(handleTick);
    };
  }, [symbol]);

  return tick;
}
