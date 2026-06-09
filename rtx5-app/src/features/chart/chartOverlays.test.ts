import test from 'node:test';
import assert from 'node:assert/strict';

import type { PriceAlert } from '../../api/alerts';
import type { LoginOrder } from '../../api/orders';
import type { ClosedPosition } from '../../api/positions';
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

test('buildChartOverlayPayload maps active positions, alerts, and closed history for the chart symbol', () => {
  const closedPositions: ClosedPosition[] = [
    {
      ticket: 99,
      account_login: 1,
      symbol: 'EURUSDm',
      side: 'buy',
      volume: 0.1,
      price_open: 1.101,
      price_close: candles[20].close,
      profit: 12,
      swap: 0,
      commission: 0,
      time_create: candles[18].time,
      time_update: candles[20].time,
      time_close: candles[20].time,
    },
  ];

  const alerts: PriceAlert[] = [
    {
      id: 7,
      symbol: 'EURUSD',
      condition: 'above',
      price: 1.133,
      message: 'Breakout',
      triggered: false,
      created_at: candles[10].time,
    },
  ];

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
    closedPositions,
    alerts,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: {
      equity: 5_000,
      margin: 1_000,
      marginLevel: 500,
    },
    showOnChart: {
      openPositions: true,
      tpSlStopLimit: true,
      closedPositions: true,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: true,
      potentialStopOut: true,
    },
  });

  assert.deepEqual(
    payload.priceLines.map((line: any) => line.id).sort(),
    ['sl-1', 'open-1', 'tp-1', 'alert-7', 'potential-stop-out'].sort(),
  );
  const openLine = payload.priceLines.find((line: any) => line.id === 'open-1');
  assert.equal(openLine?.lineStyle, CHART_LINE_STYLE.Dotted);
  assert.equal(openLine?.title, 'BUY 0.20, +42.00 USD');
  assert.equal(openLine?.color, TEST_CHART_COLORS.tradeTpSl);
  assert.equal(openLine?.labelPlacement, 'line');
  assert.equal(payload.priceLines.find((line: any) => line.id === 'alert-7')?.title, 'ALERT ABOVE');
  assert.equal(payload.markers.length, 1);
  assert.equal(payload.markers[0].id, 'closed-99');
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
    showOnChart: {
      openPositions: true,
      tpSlStopLimit: false,
      closedPositions: false,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: false,
      potentialStopOut: false,
    },
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
    showOnChart: {
      openPositions: true,
      tpSlStopLimit: false,
      closedPositions: false,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: false,
      potentialStopOut: false,
    },
  });

  const openLine = payload.priceLines.find((line: any) => line.id === 'open-sell-one-sided');
  assert.equal(openLine?.title, 'SELL 0.10, +10.00 USD');
  assert.equal(openLine?.color, TEST_CHART_COLORS.tradeTpSl);
});

test('buildChartOverlayPayload adds active pending stop and limit orders to TP/SL/Stop/Limit overlays', () => {
  const orders: LoginOrder[] = [
    {
      ticket: 55,
      account_login: 1,
      symbol: 'EURUSDm',
      type: 'buy_limit',
      side: 'buy',
      volume: 0.15,
      price_open: 1.1095,
      price_sl: 1.1045,
      price_tp: 1.1155,
      status: 'pending',
      comment: '',
      time_setup: candles[12].time,
      time_done: 0,
    },
    {
      ticket: 56,
      account_login: 1,
      symbol: 'EURUSDm',
      type: 'sell_stop',
      side: 'sell',
      volume: 0.1,
      price_open: 1.0985,
      status: 'canceled',
      comment: '',
      time_setup: candles[13].time,
      time_done: candles[14].time,
    },
  ];

  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [],
    orders,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: {
      openPositions: false,
      tpSlStopLimit: true,
      closedPositions: false,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: false,
      potentialStopOut: false,
    },
  });

  assert.deepEqual(
    payload.priceLines.map((line: any) => line.id).sort(),
    ['order-entry-55', 'order-sl-55', 'order-tp-55'].sort(),
  );
  assert.equal(payload.priceLines.find((line: any) => line.id === 'order-entry-55')?.title, 'BUY LIMIT 0.15');
  assert.equal(payload.priceLines.find((line: any) => line.id === 'order-entry-55')?.lineStyle, CHART_LINE_STYLE.Solid);
});

test('buildChartOverlayPayload keeps pattern, signal, and HMR markers behind toggle state', () => {
  const signalCandles = candles.map((candle, index) => ({
    ...candle,
    close: candle.open + index * 0.0003,
    high: candle.open + index * 0.0003 + 0.0007,
    low: candle.open + index * 0.0003 - 0.0008,
  }));
  signalCandles[6] = {
    ...signalCandles[6],
    open: 1.204,
    close: 1.2044,
    high: 1.20445,
    low: 1.203,
  };

  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles: signalCandles,
    positions: [],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: {
      openPositions: false,
      tpSlStopLimit: false,
      closedPositions: false,
      tradingSignals: true,
      hmrPeriods: true,
      priceAlerts: false,
      potentialStopOut: false,
    },
    activeTool: 'patterns',
  });

  assert.ok(payload.markers.some((marker: any) => marker.id.startsWith('signal-')));
  assert.ok(payload.markers.some((marker: any) => marker.id.startsWith('hmr-')));
  assert.ok(payload.markers.some((marker: any) => marker.id.startsWith('pattern-')));
});

test('buildChartOverlayPayload returns one shared empty payload when all overlays are disabled', () => {
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
    orders: [
      {
        ticket: 55,
        account_login: 1,
        symbol: 'BTCUSD',
        type: 'buy_limit',
        side: 'buy' as const,
        volume: 0.1,
        price_open: 71000,
        status: 'pending',
        comment: '',
        time_setup: candles[8].time,
        time_done: 0,
      },
    ] satisfies LoginOrder[],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: {
      equity: 5_000,
      margin: 1_000,
      marginLevel: 500,
    },
    showOnChart: {
      openPositions: false,
      tpSlStopLimit: false,
      closedPositions: false,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: false,
      potentialStopOut: false,
    },
  };

  const payloadA = buildChartOverlayPayload(baseInput);
  const payloadB = buildChartOverlayPayload({
    ...baseInput,
    candles: candles.slice(0, 10),
  });

  assert.equal(payloadA, payloadB);
  assert.deepEqual(payloadA, { priceLines: [], markers: [] });
});

test('buildChartOverlayPayload follows the show-on-chart flags without any secondary trade-level gate', () => {
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
    liveAccount: {
      equity: 5_000,
      margin: 1_000,
      marginLevel: 500,
    },
    showOnChart: {
      openPositions: false,
      tpSlStopLimit: false,
      closedPositions: false,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: false,
      potentialStopOut: false,
    },
  };

  const visiblePayload = buildChartOverlayPayload({
    ...baseInput,
    showOnChart: {
      ...baseInput.showOnChart,
      openPositions: true,
      tpSlStopLimit: true,
    },
  });
  const hiddenPayload = buildChartOverlayPayload({
    ...baseInput,
    showOnChart: {
      ...baseInput.showOnChart,
      openPositions: false,
      tpSlStopLimit: false,
    },
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
    showOnChart: {
      openPositions: true,
      tpSlStopLimit: true,
      closedPositions: false,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: false,
      potentialStopOut: false,
    },
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
    showOnChart: {
      openPositions: true,
      tpSlStopLimit: false,
      closedPositions: false,
      tradingSignals: false,
      hmrPeriods: false,
      priceAlerts: false,
      potentialStopOut: false,
    },
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
