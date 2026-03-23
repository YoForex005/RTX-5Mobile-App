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
export function useLiveCandles(symbol: string, timeframe: string, initialCount = 1000) {
  const [candles, setCandles] = useState<CandleParams[]>([]);
  const [latestTick, setLatestTick] = useState<CandleParams | null>(null);

  useEffect(() => {
    let unmounted = false;

    // Base price generation based on symbol
    const isCrypto = symbol.includes('BTC') || symbol.includes('ETH');
    const isGold = symbol.includes('XAU');
    const isJpy = symbol.includes('JPY');
    const basePrice = isCrypto ? 65000 : isGold ? 2350 : isJpy ? 150 : 1.1000;

    // Generate massive historical and future data block to simulate infinite scrolling
    const now = Math.floor(Date.now() / 1000);
    const alignedNow = now - (now % 60);
    const scale = isCrypto ? 10 : isGold ? 0.5 : isJpy ? 0.05 : 0.0005;

    const dataBlock: CandleParams[] = [];
    let price = basePrice;

    // 10000 candles in the past, up to present, then 10000 in the future
    for (let i = -10000; i <= 10000; i++) {
      const open = price;
      const vol = (Math.random() - 0.45) * scale * 2;
      const close = open + vol;
      const high = Math.max(open, close) + Math.random() * scale;
      const low = Math.min(open, close) - Math.random() * scale;
      // Volume perfectly correlates to structural magnitude of the candle size
      const volume = Math.floor((Math.abs(close - open) / scale) * 2000) + Math.floor(Math.random() * 500) + 100;

      dataBlock.push({
        time: alignedNow + (i * 60),
        open, high, low, close, volume
      });
      price = close;
    }

    if (!unmounted) {
      setCandles(dataBlock);
      // Let the live tick update the 'current' candle conceptually, though we have future ones.
      // We'll just update the candle exactly at 'now'.
      const currentIdx = dataBlock.findIndex(c => c.time === alignedNow);
      if (currentIdx !== -1) {
        setLatestTick(dataBlock[currentIdx]);
      }
    }

    // Simulate live ticking on the 'now' candle, creating moving illusion
    const interval = setInterval(() => {
      const currentNow = Math.floor(Date.now() / 1000);
      const currentAlignedNow = currentNow - (currentNow % 60);

      setCandles(prev => {
        if (prev.length === 0) return prev;

        // Find the candle that corresponds to the CURRENT time and update it
        const currentIdx = prev.findIndex(c => c.time === currentAlignedNow);
        if (currentIdx === -1) return prev;

        const targetCandle = { ...prev[currentIdx] };

        const tickChange = (Math.random() - 0.5) * scale * 0.5;
        targetCandle.close = targetCandle.close + tickChange;
        if (targetCandle.close > targetCandle.high) targetCandle.high = targetCandle.close;
        if (targetCandle.close < targetCandle.low) targetCandle.low = targetCandle.close;
        
        // Dynamically shrink or grow volume directly tied to the new candle height
        targetCandle.volume = Math.floor((Math.abs(targetCandle.close - targetCandle.open) / scale) * 2000) + Math.floor(Math.random() * 500) + 100;

        setLatestTick({ ...targetCandle });

        const newList = [...prev];
        newList[currentIdx] = targetCandle;
        return newList;
      });
    }, 1000);

    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [symbol, timeframe]);

  return { candles, latestTick };
}
