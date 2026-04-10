import test from 'node:test';
import assert from 'node:assert/strict';

import type { PriceAlert } from '../../api/alerts';
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
    showOpenPositions: true,
    showTpSlStopLimit: true,
    showClosedPositions: true,
    showTradingSignals: false,
    showHmrPeriods: false,
    showPriceAlerts: true,
    showPotentialStopOut: true,
  });

  assert.deepEqual(
    payload.priceLines.map((line) => line.id).sort(),
    ['sl-1', 'open-1', 'tp-1', 'alert-7', 'potential-stop-out'].sort(),
  );
  assert.equal(payload.priceLines.find((line) => line.id === 'open-1')?.lineStyle, CHART_LINE_STYLE.Dashed);
  assert.equal(payload.priceLines.find((line) => line.id === 'alert-7')?.title, 'ALERT ABOVE');
  assert.equal(payload.markers.length, 1);
  assert.equal(payload.markers[0].id, 'closed-99');
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
    showOpenPositions: false,
    showTpSlStopLimit: false,
    showClosedPositions: false,
    showTradingSignals: true,
    showHmrPeriods: true,
    showPriceAlerts: false,
    showPotentialStopOut: false,
    activeTool: 'patterns',
  });

  assert.ok(payload.markers.some((marker) => marker.id.startsWith('signal-')));
  assert.ok(payload.markers.some((marker) => marker.id.startsWith('hmr-')));
  assert.ok(payload.markers.some((marker) => marker.id.startsWith('pattern-')));
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
    showClosedPositions: false,
    showTradingSignals: false,
    showHmrPeriods: false,
    showPriceAlerts: false,
    showPotentialStopOut: false,
  };

  const visiblePayload = buildChartOverlayPayload({
    ...baseInput,
    showOpenPositions: true,
    showTpSlStopLimit: true,
  });
  const hiddenPayload = buildChartOverlayPayload({
    ...baseInput,
    showOpenPositions: false,
    showTpSlStopLimit: false,
  });

  assert.deepEqual(
    visiblePayload.priceLines.map((line) => line.id).sort(),
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
    showOpenPositions: true,
    showTpSlStopLimit: true,
    showClosedPositions: false,
    showTradingSignals: false,
    showHmrPeriods: false,
    showPriceAlerts: false,
    showPotentialStopOut: false,
  });

  assert.deepEqual(
    payload.priceLines.map((line) => line.id).sort(),
    ['open-1', 'open-2', 'sl-1', 'tp-1'].sort(),
  );
});
