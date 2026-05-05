import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCandleChannel,
  extractCandlePayloadContext,
  getCandlePayloadItems,
  resolveCandlesWsUrl,
} from './candlesSocketProtocol';

test('resolveCandlesWsUrl upgrades stale quote-feed candle config to channel websocket', () => {
  assert.equal(resolveCandlesWsUrl(undefined), 'wss://backend.orrnn.com/ws/v2');
  assert.equal(
    resolveCandlesWsUrl('wss://backend.orrnn.com/ws/feed'),
    'wss://backend.orrnn.com/ws/v2',
  );
  assert.equal(
    resolveCandlesWsUrl('wss://backend.orrnn.com/ws/feed?token=abc'),
    'wss://backend.orrnn.com/ws/v2?token=abc',
  );
});

test('createCandleChannel normalizes symbols and timeframe aliases', () => {
  assert.equal(createCandleChannel('EURUSD.c', '1m'), 'candles.EURUSD.M1');
  assert.equal(createCandleChannel('XAUUSDm', 'H1'), 'candles.XAUUSD.H1');
});

test('extractCandlePayloadContext parses v2 candle channels', () => {
  assert.deepEqual(
    extractCandlePayloadContext({ channel: 'candles.EURUSD.M1' }),
    { symbol: 'EURUSD', tf: 'M1' },
  );
});

test('getCandlePayloadItems unwraps v2 snapshot and update payloads', () => {
  const snapshot = {
    channel: 'candles.EURUSD.M1',
    data: {
      candles: [
        { time: 1777431540, open: 1.17076, high: 1.17076, low: 1.17073, close: 1.17074, volume: 7 },
        { time: 1777431480, open: 1.17083, high: 1.17083, low: 1.17073, close: 1.17074, volume: 13 },
      ],
    },
  };
  const update = {
    channel: 'candles.EURUSD.M1',
    data: {
      candle: { time: 1777431600, open: 1.17074, high: 1.1708, low: 1.1707, close: 1.17078, volume: 5 },
    },
  };

  assert.equal(getCandlePayloadItems(snapshot).length, 2);
  assert.deepEqual(getCandlePayloadItems(update), [update.data.candle]);
});
