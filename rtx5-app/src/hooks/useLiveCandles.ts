import { useState, useEffect } from 'react';

export type CandleParams = {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * Simulates a live data feed of OHLC candles for the chart.
 * Replaces the hardcoded arrays.
 */
export function useLiveCandles(symbol: string, timeframe: string, initialCount = 100) {
  const [candles, setCandles] = useState<CandleParams[]>([]);
  const [latestTick, setLatestTick] = useState<CandleParams | null>(null);

  useEffect(() => {
    let unmounted = false;

    // Base price generation based on symbol
    const isCrypto = symbol.includes('BTC') || symbol.includes('ETH');
    const isGold = symbol.includes('XAU');
    const isJpy = symbol.includes('JPY');
    const basePrice = isCrypto ? 65000 : isGold ? 2350 : isJpy ? 150 : 1.1000;
    
    // Generate historical
    const now = Math.floor(Date.now() / 1000);
    // Align "now" to a 10 second block so simulation is clean
    const alignedNow = now - (now % 60);
    
    const scale = isCrypto ? 10 : isGold ? 0.5 : isJpy ? 0.05 : 0.0005;

    const history: CandleParams[] = [];
    let price = basePrice;
    
    // Assume 1 minute candles for simulation
    for (let i = initialCount; i >= 0; i--) {
      const open = price;
      const vol = (Math.random() - 0.45) * scale * 2;
      const close = open + vol;
      const high = Math.max(open, close) + Math.random() * scale;
      const low = Math.min(open, close) - Math.random() * scale;
      history.push({
        time: alignedNow - (i * 60),
        open, high, low, close
      });
      price = close;
    }
    
    if (!unmounted) {
      setCandles(history);
      setLatestTick(history[history.length - 1]);
    }

    // Simulate live ticking
    const interval = setInterval(() => {
      const currentNow = Math.floor(Date.now() / 1000);
      
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const lastCandle = { ...prev[prev.length - 1] };
        
        // If we crossed a minute boundary, spawn a new candle
        if (currentNow >= lastCandle.time + 60) {
          const newOpen = lastCandle.close;
          const newCandle = {
            time: lastCandle.time + 60,
            open: newOpen,
            high: newOpen,
            low: newOpen,
            close: newOpen
          };
          setLatestTick(newCandle);
          return [...prev, newCandle];
        } else {
          // Update the current candle with a random tick
          const tickChange = (Math.random() - 0.5) * scale * 0.5;
          lastCandle.close = lastCandle.close + tickChange;
          if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
          if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;
          
          setLatestTick({ ...lastCandle });
          
          const newList = [...prev];
          newList[newList.length - 1] = lastCandle;
          return newList;
        }
      });
    }, 1000); // 1 tick per second

    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [symbol, timeframe]);

  return { candles, latestTick };
}
