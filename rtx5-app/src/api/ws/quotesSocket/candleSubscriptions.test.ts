import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCandleChannelSubscriptionMessages,
  createCandleFeedSubscription,
} from './candleSubscriptions';
import {
  toBridgeCandleTf,
  toRestCandleTf,
} from '../../../domain/candles/core/candles';

test('toBridgeCandleTf maps app timeframes to broker websocket candle keys', () => {
  assert.equal(toBridgeCandleTf('M1'), '1m');
  assert.equal(toBridgeCandleTf('M5'), '5m');
  assert.equal(toBridgeCandleTf('M15'), '15m');
  assert.equal(toBridgeCandleTf('M30'), '30m');
  assert.equal(toBridgeCandleTf('H1'), '1h');
  assert.equal(toBridgeCandleTf('H4'), '4h');
  assert.equal(toBridgeCandleTf('D1'), '1d');
  assert.equal(toBridgeCandleTf('W1'), null);
  assert.equal(toBridgeCandleTf('MN'), null);
});

test('toRestCandleTf keeps REST candle requests on app timeframe labels', () => {
  assert.equal(toRestCandleTf('1m'), 'M1');
  assert.equal(toRestCandleTf('M1'), 'M1');
  assert.equal(toRestCandleTf('H1'), 'H1');
  assert.equal(toRestCandleTf('D1'), 'D1');
  assert.equal(toRestCandleTf('MN1'), 'MN');
});

test('candle subscriptions send v2 channel messages with bridge timeframe keys', () => {
  const eurUsd = createCandleFeedSubscription('EURUSD', 'M1');
  const xauUsd = createCandleFeedSubscription('XAUUSD', '1m');
  const btcUsd = createCandleFeedSubscription('BTCUSD', 'D1');

  assert.ok(eurUsd);
  assert.ok(xauUsd);
  assert.ok(btcUsd);
  assert.deepEqual(
    buildCandleChannelSubscriptionMessages('subscribe', [eurUsd, xauUsd, btcUsd]),
    [
      { action: 'subscribe', channels: ['candles.EURUSD.1m', 'candles.XAUUSD.1m'] },
      { action: 'subscribe', channels: ['candles.BTCUSD.1d'] },
    ],
  );
});
