import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChartOverlayPayload,
  CHART_LINE_STYLE,
  normalizeChartOverlaySymbol,
  type ChartOverlayCandle,
} from './chartOverlays';

const TEST_CHART_COLORS = {
  background: '#000000',
  foreground: '#94A3B8',
  grid: 'rgba(255,255,255,0.04)',
  candlesUptrend: '#2962FF',
  candlesDowntrend: '#EF5350',
  hollowBody: '#1E293B',
  barsUptrend: '#2962FF',
  barsDowntrend: '#EF5350',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
} as const;

const candles: ChartOverlayCandle[] = Array.from({ length: 40 }, (_, index) => {
  const open = 1.1 + index * 0.001;
  const close = open + (index % 2 === 0 ? 0.0004 : -0.0002);
  return {
    time: 1_700_000_000 + index * 60,
    open,
    high: Math.max(open, close) + 0.0006,
    low: Math.min(open, close) - 0.0005,
    close,
    volume: 100 + index,
  };
});

const BOTH_SIDES = { buyTrade: true, sellTrade: true } as const;
const NO_SIDES = { buyTrade: false, sellTrade: false } as const;

test('normalizeChartOverlaySymbol strips broker suffix variants consistently', () => {
  // Separator-based suffixes
  assert.equal(normalizeChartOverlaySymbol('EURUSDm'), 'EURUSD');
  assert.equal(normalizeChartOverlaySymbol('EURUSD.c'), 'EURUSD');
  assert.equal(normalizeChartOverlaySymbol('xauusd_m'), 'XAUUSD');
  assert.equal(normalizeChartOverlaySymbol('GBP/USD'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol(' GBP / USD.c '), 'GBPUSD');

  // Concatenated broker suffixes (NO separator)
  assert.equal(normalizeChartOverlaySymbol('GBPUSDpro'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDe'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDstd'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDmicro'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDraw'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDstp'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDcent'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('XAUUSDpro'), 'XAUUSD');
  assert.equal(normalizeChartOverlaySymbol('BTCUSDm'), 'BTCUSD');
  assert.equal(normalizeChartOverlaySymbol('BTCUSDpro'), 'BTCUSD');

  // Plain symbols (no suffix)
  assert.equal(normalizeChartOverlaySymbol('GBPUSD'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('XAUUSD'), 'XAUUSD');
  assert.equal(normalizeChartOverlaySymbol('BTCUSD'), 'BTCUSD');
});

test('buildChartOverlayPayload maps open positions for the chart symbol with their SL/TP', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'EURUSDm',
        side: 'buy',
        volume: 0.2,
        openPrice: 1.11111,
        currentPrice: 1.1185,
        pnl: 42,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.106,
        tp: 1.124,
      },
      {
        id: '2',
        symbol: 'GBPUSD',
        side: 'sell',
        volume: 0.1,
        openPrice: 1.25,
        currentPrice: 1.24,
        pnl: 5,
        swap: 0,
        openTime: new Date(candles[6].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  // Only the EURUSD position is in-symbol; the GBPUSD one is excluded.
  assert.deepEqual(
    payload.priceLines.map((line: any) => line.id).sort(),
    ['sl-1', 'open-1', 'tp-1'].sort(),
  );
  const openLine = payload.priceLines.find((line: any) => line.id === 'open-1');
  assert.equal(openLine?.lineStyle, CHART_LINE_STYLE.Dotted);
  assert.equal(openLine?.title, 'BUY 0.20, +42.00 USD');
  assert.equal(openLine?.color, TEST_CHART_COLORS.tradeTpSl);
  assert.equal(openLine?.labelPlacement, 'line');
  assert.equal(payload.markers.length, 0);
});

test('buildChartOverlayPayload drops a position and its SL/TP once it is no longer active', () => {
  const openPosition = {
    id: 'hit-501',
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.1,
    openPrice: 1.111,
    currentPrice: 1.116,
    pnl: 50,
    swap: 0,
    openTime: new Date(candles[5].time * 1000).toISOString(),
    sl: 1.106,
    tp: 1.116,
  };

  const beforeHit = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [openPosition],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  assert.deepEqual(
    beforeHit.priceLines.map((line: any) => line.id).sort(),
    ['open-hit-501', 'sl-hit-501', 'tp-hit-501'].sort(),
  );

  const afterHit = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  assert.deepEqual(afterHit.priceLines, []);
  assert.deepEqual(afterHit.markers, []);
});

test('buildChartOverlayPayload updates open position labels from live bid and ask prices', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'BTCUSD',
    candles,
    positions: [
      {
        id: 'buy-live',
        symbol: 'BTCUSD',
        side: 'buy',
        volume: 0.01,
        openPrice: 61000,
        currentPrice: 61000,
        pnl: -999,
        swap: -0.01,
        commission: -0.02,
        openTime: new Date(candles[5].time * 1000).toISOString(),
      },
      {
        id: 'buy-loss-live',
        symbol: 'BTCUSD',
        side: 'buy',
        volume: 0.01,
        openPrice: 61030,
        currentPrice: 61030,
        pnl: 999,
        swap: 0,
        commission: 0,
        openTime: new Date(candles[7].time * 1000).toISOString(),
      },
      {
        id: 'sell-live',
        symbol: 'BTCUSDm',
        side: 'sell',
        volume: 0.02,
        openPrice: 61020,
        currentPrice: 61020,
        pnl: -999,
        swap: 0,
        commission: 0,
        openTime: new Date(candles[6].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveBid: 61025.3,
    liveAsk: 60950,
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const titleById = new Map(payload.priceLines.map((line: any) => [line.id, line.title]));
  const colorById = new Map(payload.priceLines.map((line: any) => [line.id, line.color]));

  assert.equal(titleById.get('open-buy-live'), 'BUY 0.01, +0.22 USD');
  assert.equal(colorById.get('open-buy-live'), TEST_CHART_COLORS.tradeTpSl);
  assert.equal(titleById.get('open-buy-loss-live'), 'BUY 0.01, -0.05 USD');
  assert.equal(colorById.get('open-buy-loss-live'), TEST_CHART_COLORS.tradeStopOut);
  assert.equal(titleById.get('open-sell-live'), 'SELL 0.02, +1.40 USD');
  assert.equal(colorById.get('open-sell-live'), TEST_CHART_COLORS.tradeTpSl);
});

test('buildChartOverlayPayload keeps open position pnl live when one quote side is missing', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'GBPUSD',
    candles,
    positions: [
      {
        id: 'sell-one-sided',
        symbol: 'GBPUSD',
        side: 'sell',
        volume: 0.1,
        openPrice: 1.2,
        currentPrice: 1.2,
        pnl: -999,
        swap: 0,
        commission: 0,
        openTime: new Date(candles[8].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveBid: 1.199,
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const openLine = payload.priceLines.find((line: any) => line.id === 'open-sell-one-sided');
  assert.equal(openLine?.title, 'SELL 0.10, +10.00 USD');
  assert.equal(openLine?.color, TEST_CHART_COLORS.tradeTpSl);
});

test('buildChartOverlayPayload filters open trades by side via the buy/sell toggles', () => {
  const positions = [
    {
      id: 'buy-1',
      symbol: 'EURUSD',
      side: 'buy' as const,
      volume: 0.1,
      openPrice: 1.11,
      currentPrice: 1.115,
      pnl: 10,
      swap: 0,
      openTime: new Date(candles[5].time * 1000).toISOString(),
    },
    {
      id: 'sell-1',
      symbol: 'EURUSDm',
      side: 'sell' as const,
      volume: 0.1,
      openPrice: 1.12,
      currentPrice: 1.115,
      pnl: 10,
      swap: 0,
      openTime: new Date(candles[6].time * 1000).toISOString(),
    },
  ];

  const buyOnly = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: { buyTrade: true, sellTrade: false },
  });
  assert.deepEqual(
    buyOnly.priceLines.map((line: any) => line.id),
    ['open-buy-1'],
  );

  const sellOnly = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: { buyTrade: false, sellTrade: true },
  });
  assert.deepEqual(
    sellOnly.priceLines.map((line: any) => line.id),
    ['open-sell-1'],
  );

  const both = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });
  assert.deepEqual(
    both.priceLines.map((line: any) => line.id).sort(),
    ['open-buy-1', 'open-sell-1'].sort(),
  );
});

test('buildChartOverlayPayload still renders pattern markers from the drawing tool regardless of trade toggles', () => {
  const patternCandles = candles.map((candle, index) => ({
    ...candle,
    close: candle.open + index * 0.0003,
    high: candle.open + index * 0.0003 + 0.0007,
    low: candle.open + index * 0.0003 - 0.0008,
  }));
  patternCandles[6] = {
    ...patternCandles[6],
    open: 1.204,
    close: 1.2044,
    high: 1.20445,
    low: 1.203,
  };

  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles: patternCandles,
    positions: [],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: NO_SIDES,
    activeTool: 'patterns',
  });

  assert.equal(payload.priceLines.length, 0);
  assert.ok(payload.markers.some((marker: any) => marker.id.startsWith('pattern-')));
});

test('buildChartOverlayPayload returns one shared empty payload when both trade sides are disabled', () => {
  const baseInput = {
    chartSymbol: 'BTCUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'BTCUSD',
        side: 'buy' as const,
        volume: 0.1,
        openPrice: 71234.5,
        currentPrice: 71300,
        pnl: 6.5,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: NO_SIDES,
  };

  const payloadA = buildChartOverlayPayload(baseInput);
  const payloadB = buildChartOverlayPayload({
    ...baseInput,
    candles: candles.slice(0, 10),
  });

  assert.equal(payloadA, payloadB);
  assert.deepEqual(payloadA, { priceLines: [], markers: [] });
});

test('buildChartOverlayPayload shows or hides trades directly from the buy/sell toggles', () => {
  const baseInput = {
    chartSymbol: 'EURUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'EURUSDm',
        side: 'buy' as const,
        volume: 0.2,
        openPrice: 1.11111,
        currentPrice: 1.1185,
        pnl: 42,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.106,
        tp: 1.124,
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: NO_SIDES,
  };

  const visiblePayload = buildChartOverlayPayload({
    ...baseInput,
    showOnChart: BOTH_SIDES,
  });
  const hiddenPayload = buildChartOverlayPayload({
    ...baseInput,
    showOnChart: NO_SIDES,
  });

  assert.deepEqual(
    visiblePayload.priceLines.map((line: any) => line.id).sort(),
    ['open-1', 'sl-1', 'tp-1'].sort(),
  );
  assert.equal(hiddenPayload.priceLines.length, 0);
});

test('buildChartOverlayPayload matches all open positions across slash and suffix symbol variants', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'GBPUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'GBP/USD',
        side: 'sell',
        volume: 0.1,
        openPrice: 1.34198,
        currentPrice: 1.34449,
        pnl: -25.1,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.33,
        tp: 1.35,
      },
      {
        id: '2',
        symbol: 'GBPUSDm',
        side: 'buy',
        volume: 0.2,
        openPrice: 1.34266,
        currentPrice: 1.34442,
        pnl: 35.2,
        swap: 0,
        openTime: new Date(candles[6].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  assert.deepEqual(
    payload.priceLines.map((line: any) => line.id).sort(),
    ['open-1', 'open-2', 'sl-1', 'tp-1'].sort(),
  );
});

test('buildChartOverlayPayload keeps each stacked open position line visible', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'GBPUSD',
    candles,
    positions: [
      {
        id: 'stack-a',
        symbol: 'GBPUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.34266,
        currentPrice: 1.3533,
        pnl: 10,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
      },
      {
        id: 'stack-b',
        symbol: 'GBPUSDm',
        side: 'buy',
        volume: 0.2,
        openPrice: 1.34266,
        currentPrice: 1.3533,
        pnl: 20,
        swap: 0,
        openTime: new Date(candles[6].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const stackedLines = payload.priceLines.filter((line: any) => line.price === 1.34266);
  // MT5-parity: rapid same-price entries remain visible as concentrated
  // labels/lines instead of being hidden by de-duping.
  assert.equal(stackedLines.length, 2);
  assert.deepEqual(
    stackedLines.map((line: any) => line.title).sort(),
    ['BUY 0.10, +10.00 USD', 'BUY 0.20, +20.00 USD'].sort(),
  );
  assert.ok(stackedLines.every((line: any) => line.axisLabelVisible === false));
  assert.ok(stackedLines.every((line: any) => line.labelPlacement === 'line'));
});
