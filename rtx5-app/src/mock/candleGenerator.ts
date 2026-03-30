/**
 * Core module: candleGenerator.ts
 */

export function generateMockCandles(symbol: string, timeframe: string, count: number = 200) {
  const now = Math.floor(Date.now() / 1000);
  let basePrice = 1.1000;
  if (symbol.includes('JPY')) basePrice = 150.0;
  else if (symbol.includes('XAU')) basePrice = 2350.0;
  else if (symbol.includes('BTC')) basePrice = 65000.0;

  let tfSeconds = 60;
  if (timeframe === 'M5') tfSeconds = 300;
  else if (timeframe === 'M15') tfSeconds = 900;
  else if (timeframe === 'H1') tfSeconds = 3600;
  else if (timeframe === 'H4') tfSeconds = 14400;
  else if (timeframe === 'D1') tfSeconds = 86400;

  const data = [];
  let currentOpen = basePrice;

  // Generate sequentially backwards then reverse
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * tfSeconds;
    const isUp = Math.random() > 0.5;
    
    // Random volatility scaled for price and timeframe
    const volatility = basePrice * (symbol.includes('BTC') ? 0.002 : 0.0005) * (tfSeconds / 60);
    
    const close = currentOpen + (isUp ? 1 : -1) * (Math.random() * volatility);
    const high = Math.max(currentOpen, close) + Math.random() * volatility * 0.5;
    const low = Math.min(currentOpen, close) - Math.random() * volatility * 0.5;

    data.push({
      time: time,
      open: currentOpen,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000),
    });

    currentOpen = close;
  }

  return data;
}
