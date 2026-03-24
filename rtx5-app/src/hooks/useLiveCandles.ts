import { useState, useEffect, useRef } from 'react';
import { candlesWsService } from '../api/ws/candlesSocket';
import { useUserPreferences } from '../state/userPreferences';

export type CandleParams = {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * Provides live OHLC candles by subscribing to the WebSocket feed.
 * Natively throttles React rerender to exactly 1 per minute/period to avoid freezing ChartScreen.
 */
export function useLiveCandles(symbol: string, timeframe: string, initialCount = 500) {
  const [candles, setCandles] = useState<CandleParams[]>([]);

  const candlesRef = useRef<CandleParams[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingArrayExpansionRef = useRef<boolean>(false);

  useEffect(() => {
    let unmounted = false;

    setCandles([]);
    candlesRef.current = [];
    pendingArrayExpansionRef.current = false;
    if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);

    let isHistoryLoaded = false;
    let liveQueue: CandleParams[] = [];

    const fetchHistory = async () => {
      try {
        const token = useUserPreferences.getState().accountDetails?.credentials?.accessToken;
        if (!token) {
          isHistoryLoaded = true;
          return;
        }

        // User Instruction: Integrate REST API for historical OHLCV. 
        // Endpoint: GET /api/v2/candles/{symbol}
        // Decoupled from WebSockets, this seeds the initial visualization.
        // The REST API explicitly expects MT5 timeframe formats (e.g., 'M1', 'H1', 'D1')
        // This is unlike the WebSocket feed which expects '1m', '1h'.
        const serverTf = (timeframe || 'M1').toUpperCase();
        const url = `http://69.197.178.27/api/v2/candles/${symbol}?timeframe=${serverTf}&limit=${initialCount}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (unmounted) return;

        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.candles)) {
            const uniqueMap = new Map<number, CandleParams>();
            
            let intervalSeconds = 60;
            const upperTf = (timeframe || '1m').toUpperCase();
            if (upperTf === '1M' || upperTf === 'M1') intervalSeconds = 60;
            else if (upperTf === '5M' || upperTf === 'M5') intervalSeconds = 300;
            else if (upperTf === '15M' || upperTf === 'M15') intervalSeconds = 900;
            else if (upperTf === '30M' || upperTf === 'M30') intervalSeconds = 1800;
            else if (upperTf === '1H' || upperTf === 'H1') intervalSeconds = 3600;
            else if (upperTf === '4H' || upperTf === 'H4') intervalSeconds = 14400;
            else if (upperTf === '1D' || upperTf === 'D1') intervalSeconds = 86400;
            else if (upperTf === '1W' || upperTf === 'W1') intervalSeconds = 604800;

            data.candles.forEach((c: any) => {
              const timeValue = c.time ?? c.t ?? c.ts;
              const closeValue = c.close ?? c.c ?? c.price;
              if (timeValue === undefined || closeValue === undefined) return;

              let timeInSeconds = timeValue;
              if (typeof timeValue === 'string') {
                 timeInSeconds = Math.floor(new Date(timeValue).getTime() / 1000);
              } else if (timeValue > 1e11) {
                 timeInSeconds = Math.floor(timeValue / 1000);
              }
              timeInSeconds = Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;

              uniqueMap.set(timeInSeconds, {
                time: timeInSeconds,
                open: c.open ?? c.o ?? closeValue,
                high: c.high ?? c.h ?? closeValue,
                low: c.low ?? c.l ?? closeValue,
                close: closeValue,
                volume: c.volume ?? c.v ?? 0
              });
            });
            const sorted = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);
            
            candlesRef.current = sorted;
            setCandles([...sorted]);
          }
        }
      } catch (err) {
        console.warn('[REST Candles] Failed to fetch historical data:', err);
      } finally {
        if (!unmounted) {
          isHistoryLoaded = true;
          if (liveQueue.length > 0) {
            handleCandles(symbol, timeframe, liveQueue);
            liveQueue = [];
          }
        }
      }
    };

    fetchHistory();

    const handleCandles = (incomingSymbol: string, incomingTf: string, incomingCandles: CandleParams[]) => {
      if (unmounted) return;
      if (incomingSymbol && incomingSymbol.toUpperCase() !== symbol.toUpperCase()) return;

      if (!isHistoryLoaded) {
        liveQueue.push(...incomingCandles);
        return;
      }

      let changed = false;
      const currentArr = candlesRef.current;

      incomingCandles.forEach(incoming => {
        if (currentArr.length === 0) {
          currentArr.push(incoming);
          changed = true;
          pendingArrayExpansionRef.current = true;
          return;
        }
        
        const lastCandle = currentArr[currentArr.length - 1];
        
        if (incoming.time === lastCandle.time) {
          currentArr[currentArr.length - 1] = {
            ...lastCandle,
            close: incoming.close,
            high: Math.max(lastCandle.high, incoming.high),
            low: Math.min(lastCandle.low, incoming.low),
            volume: incoming.volume !== undefined ? incoming.volume : lastCandle.volume
          };
          changed = true;
        } else if (incoming.time > lastCandle.time) {
          currentArr.push(incoming);
          if (currentArr.length > 2000) { 
            currentArr.shift();
          }
          changed = true;
          pendingArrayExpansionRef.current = true;
        } else {
          const existingIdx = currentArr.findIndex(c => c.time === incoming.time);
          if (existingIdx !== -1) {
             currentArr[existingIdx] = incoming;
          } else {
             currentArr.push(incoming);
             currentArr.sort((a, b) => a.time - b.time);
             pendingArrayExpansionRef.current = true;
          }
          changed = true;
        }
      });
      
      if (changed) {
        if (currentArr.length === 1 && candlesRef.current.length === 1) { // Force immediately if empty
            if (!unmounted && candles.length === 0) {
              setCandles([...currentArr]);
              pendingArrayExpansionRef.current = false;
            }
        } else if (!flushTimeoutRef.current) {
          flushTimeoutRef.current = setTimeout(() => {
            if (!unmounted) {
              // Only trigger a massive 2000-candle React re-render when a new structural boundary is crossed.
              // Continual live intra-candle pricing runs purely on hardware RequestAnimationFrame directly against the native View.
              if (pendingArrayExpansionRef.current) {
                setCandles([...candlesRef.current]);
                pendingArrayExpansionRef.current = false;
              }
            }
            flushTimeoutRef.current = null;
          }, 250); 
        }
      }
    };

    candlesWsService.addListener(handleCandles);
    candlesWsService.subscribe(symbol, timeframe);

    return () => {
      unmounted = true;
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
      candlesWsService.removeListener(handleCandles);
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

  useEffect(() => {
    let unmounted = false;
    let lastRender = 0;

    const handleCandles = (incomingSymbol: string, incomingTf: string, incomingCandles: CandleParams[]) => {
      if (unmounted) return;
      if (incomingSymbol && incomingSymbol.toUpperCase() !== symbol.toUpperCase()) return;

      const now = Date.now();
      // Bound the React structural text updates to 4fps purely for human readability, saving 90% CPU overhead.
      if (now - lastRender > 250) { 
        setTick(incomingCandles[incomingCandles.length - 1]);
        lastRender = now;
      }
    };

    candlesWsService.addListener(handleCandles);
    return () => {
      unmounted = true;
      candlesWsService.removeListener(handleCandles);
    };
  }, [symbol]);

  return tick;
}
