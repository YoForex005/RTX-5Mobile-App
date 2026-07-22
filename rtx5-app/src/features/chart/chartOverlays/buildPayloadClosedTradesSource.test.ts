import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildClosedPositionMarkers } from './markerCollections';
import { buildChartOverlayPayload } from './buildPayload';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('overlay payload builder wires closed-position markers when trade sides are shown', () => {
  const source = readSource('src/features/chart/chartOverlays/buildPayload.ts');
  assert.match(source, /buildClosedPositionMarkers/);
  assert.match(source, /needsClosedTradeMarkers/);
  assert.match(
    source,
    /buildClosedPositionMarkers\(sanitizedCandles, closedPositions, chartSymbol\)/,
  );
});

test('buildClosedPositionMarkers places Closed markers on the candle series', () => {
  const candles = [
    { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 1_700_000_060, open: 1.5, high: 2.1, low: 1.4, close: 2 },
    { time: 1_700_000_120, open: 2, high: 2.2, low: 1.9, close: 2.1 },
  ];
  const markers = buildClosedPositionMarkers(
    candles,
    [
      {
        ticket: 42,
        account_login: 1,
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.1,
        price_close: 1.15,
        profit: 5,
        swap: 0,
        time_create: 1_700_000_000,
        time_update: 1_700_000_060,
        time_close: 1_700_000_060,
      },
    ],
    'EURUSD',
  );
  assert.equal(markers.length, 1);
  assert.equal(markers[0].text, 'Closed');
  assert.equal(markers[0].time, 1_700_000_060);
  assert.equal(markers[0].price, 1.15);
});

test('buildChartOverlayPayload includes closed markers when buy/sell trade is enabled', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles: [
      { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5 },
      { time: 1_700_000_060, open: 1.5, high: 2.1, low: 1.4, close: 2 },
    ],
    positions: [],
    closedPositions: [
      {
        ticket: 7,
        account_login: 1,
        symbol: 'EURUSD',
        side: 'sell',
        volume: 0.2,
        price_open: 1.2,
        price_close: 1.18,
        profit: 4,
        swap: 0,
        time_create: 1_700_000_000,
        time_update: 1_700_000_060,
        time_close: 1_700_000_060,
      },
    ],
    colors: {
      tradeOpen: '#2962FF',
      tradeTpSl: '#089981',
      tradeStopOut: '#F23645',
    } as any,
    sellColor: '#DC2626',
    showOnChart: { buyTrade: true, sellTrade: true, slTpLevels: true },
  });
  assert.ok(payload.markers.some((marker) => marker.text === 'Closed'));
});
