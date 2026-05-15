import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCandleWsToken,
  createCandleChannel,
  extractCandlePayloadContext,
  getCandlePayloadItems,
  resolveCandlesWsUrl,
  resolveCandleWsTimeframe,
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

test('appendCandleWsToken keeps the URL anonymous when no token is available', () => {
  assert.equal(
    appendCandleWsToken('wss://backend.orrnn.com/ws/v2', null),
    'wss://backend.orrnn.com/ws/v2',
  );
  assert.equal(
    appendCandleWsToken('wss://backend.orrnn.com/ws/v2?foo=1', null),
    'wss://backend.orrnn.com/ws/v2?foo=1',
  );
});

test('appendCandleWsToken appends JWT when URL has no existing query string', () => {
  assert.equal(
    appendCandleWsToken('wss://backend.orrnn.com/ws/v2', 'jwt.token.here'),
    'wss://backend.orrnn.com/ws/v2?token=jwt.token.here',
  );
});

test('appendCandleWsToken url-encodes JWTs containing reserved characters', () => {
  assert.equal(
    appendCandleWsToken('wss://backend.orrnn.com/ws/v2', 'a b/c+d=e&f'),
    'wss://backend.orrnn.com/ws/v2?token=a%20b%2Fc%2Bd%3De%26f',
  );
});

test('appendCandleWsToken merges JWT into an existing query string without colliding with other params', () => {
  assert.equal(
    appendCandleWsToken('wss://backend.orrnn.com/ws/v2?foo=1&bar=2', 'jwt'),
    'wss://backend.orrnn.com/ws/v2?foo=1&bar=2&token=jwt',
  );
});

test('appendCandleWsToken replaces a stale token instead of accumulating duplicates on reconnect', () => {
  const stale = 'wss://backend.orrnn.com/ws/v2?token=old.jwt';
  assert.equal(
    appendCandleWsToken(stale, 'new.jwt'),
    'wss://backend.orrnn.com/ws/v2?token=new.jwt',
  );

  const staleWithExtra = 'wss://backend.orrnn.com/ws/v2?token=old.jwt&foo=1';
  assert.equal(
    appendCandleWsToken(staleWithExtra, 'new.jwt'),
    'wss://backend.orrnn.com/ws/v2?foo=1&token=new.jwt',
  );
});

test('resolveCandleWsTimeframe maps app timeframes to backend live-channel tokens', () => {
  assert.equal(resolveCandleWsTimeframe('M1'), '1m');
  assert.equal(resolveCandleWsTimeframe('M5'), '5m');
  assert.equal(resolveCandleWsTimeframe('H1'), '1h');
  assert.equal(resolveCandleWsTimeframe('MN'), '1M');
  assert.equal(resolveCandleWsTimeframe('bad'), null);
});

test('createCandleChannel normalizes symbols and uses backend websocket timeframe tokens', () => {
  assert.equal(createCandleChannel('EURUSD.c', 'M1'), 'candles.EURUSD.1m');
  assert.equal(createCandleChannel('XAUUSDm', 'H1'), 'candles.XAUUSD.1h');
});

test('extractCandlePayloadContext parses v2 candle channels', () => {
  assert.deepEqual(
    extractCandlePayloadContext({ channel: 'candles.EURUSD.1m' }),
    { symbol: 'EURUSD', tf: 'M1' },
  );
});

test('getCandlePayloadItems unwraps v2 snapshot and update payloads', () => {
  const snapshot = {
    channel: 'candles.EURUSD.1m',
    data: {
      candles: [
        { time: 1777431540, open: 1.17076, high: 1.17076, low: 1.17073, close: 1.17074, volume: 7 },
        { time: 1777431480, open: 1.17083, high: 1.17083, low: 1.17073, close: 1.17074, volume: 13 },
      ],
    },
  };
  const update = {
    channel: 'candles.EURUSD.1m',
    data: {
      candle: { time: 1777431600, open: 1.17074, high: 1.1708, low: 1.1707, close: 1.17078, volume: 5 },
    },
  };
  const directUpdate = {
    channel: 'candles.EURUSD.1m',
    data: {
      type: 'candle',
      symbol: 'EURUSD',
      tf: '1m',
      time: 1777431660,
      open: 1.17078,
      high: 1.17082,
      low: 1.17072,
      close: 1.1708,
      volume: 6,
      closed: false,
    },
  };

  assert.equal(getCandlePayloadItems(snapshot).length, 2);
  assert.deepEqual(getCandlePayloadItems(update), [update.data.candle]);
  assert.deepEqual(getCandlePayloadItems(directUpdate), [directUpdate.data]);
});
