import { useEffect } from 'react';
import { useTradingState } from '../state/tradingState';

export function useLiveTickSimulator(symbol: string, timeframe: string, isDemo: boolean = true) {
  useEffect(() => {
    if (!isDemo) return;

    let basePrice = 1.1000;
    if (symbol.includes('JPY')) basePrice = 150.0;
    else if (symbol.includes('XAU')) basePrice = 2350.0;
    else if (symbol.includes('BTC')) basePrice = 65000.0;

    let ticksCount = 0;
    const ticksPerCandle = 5;

    const interval = setInterval(() => {
      const store = useTradingState.getState();
      const currentCandles = store.candles[`${symbol}.${timeframe}`];
      if (!currentCandles || currentCandles.length === 0) return;

      const lastCandle = currentCandles[currentCandles.length - 1];
      const volatility = basePrice * (symbol.includes('BTC') ? 0.001 : 0.0002);
      const shift = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * volatility);

      ticksCount++;

      // Once we hit tick threshold, step into a new candle
      if (ticksCount >= ticksPerCandle) {
        ticksCount = 0;
        let tfSeconds = 60;
        if (timeframe === 'M5') tfSeconds = 300;
        else if (timeframe === 'M15') tfSeconds = 900;
        else if (timeframe === 'H1') tfSeconds = 3600;
        else if (timeframe === 'H4') tfSeconds = 14400;
        else if (timeframe === 'D1') tfSeconds = 86400;

        const newTime = lastCandle.time + tfSeconds;
        const newOpen = lastCandle.close; // open where old close left off
        const close = newOpen + shift;
        const high = Math.max(newOpen, close) + Math.random() * volatility * 0.2;
        const low = Math.min(newOpen, close) - Math.random() * volatility * 0.2;

        store.updateCandle(symbol, timeframe, {
          time: newTime,
          open: newOpen,
          high,
          low,
          close,
          volume: Math.floor(Math.random() * 50),
        });
      } else {
        // Just update the latest tick within candle boundaries
        const newClose = lastCandle.close + shift;
        const newHigh = Math.max(lastCandle.high, newClose);
        const newLow = Math.min(lastCandle.low, newClose);

        store.updateCandle(symbol, timeframe, {
          time: lastCandle.time,
          open: lastCandle.open,
          high: newHigh,
          low: newLow,
          close: newClose,
          volume: lastCandle.volume + Math.floor(Math.random() * 10),
        });
      }

    }, 1000); // 1 real tick per second

    return () => clearInterval(interval);
  }, [symbol, timeframe, isDemo]);
}
