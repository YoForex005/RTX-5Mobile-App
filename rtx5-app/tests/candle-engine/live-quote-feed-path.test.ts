import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { normalizeQuoteTickPayload } from '../../src/api/ws/quoteTickNormalizer';
import { buildChartSeriesSnapshot, getChartSeriesUpdateMode } from '../../src/features/chart/liveChartSync';
import { resolveVisibleSeriesMode, shouldSyncVisibleSeriesCache } from '../../src/domain/candles/ws/liveCandlesEnginePolicy';
import { makeTrustedHistoryCandle, secondsUtc } from '../support/candleTestUtils';

test('live quote payload updates bid ask data without becoming a candle input', () => {
  const payload = {
    symbol: 'XAUUSDm',
    bidPrice: '2300.10',
    askPrice: '2300.40',
    serverTime: secondsUtc(2024, 3, 22, 10, 3, 23),
  };

  const normalized = normalizeQuoteTickPayload(payload);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  assert.deepEqual(
    {
      symbol: normalized.update.symbol,
      bid: normalized.update.bid,
      ask: normalized.update.ask,
      timestamp: normalized.update.timestamp,
    },
    {
      symbol: 'XAUUSD',
      bid: 2300.1,
      ask: 2300.4,
      timestamp: secondsUtc(2024, 3, 22, 10, 3, 23),
    },
  );
});

test('backend live candle snapshot, not quote tick, creates the chart incremental update', () => {
  const history = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 2299.5 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 1, 0), { close: 2299.8 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 2, 0), { close: 2300.0 }),
  ];
  const map = createCandleMap(history);
  const result = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 10, 3, 5),
      open: 2300.0,
      high: 2300.4,
      low: 2299.9,
      close: 2300.1,
      volume: 12,
    },
    'M1',
    { historyCutoffTime: history[history.length - 1].time },
  );
  const visible = materializeCandleMap(map);
  const previousSnapshot = buildChartSeriesSnapshot(history);
  const nextSnapshot = buildChartSeriesSnapshot(visible);

  assert.equal(result.ignored, false);
  assert.equal(visible[visible.length - 1].time, secondsUtc(2024, 3, 22, 10, 3, 0));
  assert.deepEqual(visible[visible.length - 1], {
    time: secondsUtc(2024, 3, 22, 10, 3, 0),
    open: 2300.0,
    high: 2300.4,
    low: 2299.9,
    close: 2300.1,
    volume: 12,
  });
  assert.equal(getChartSeriesUpdateMode(previousSnapshot, nextSnapshot), 'incremental');
});

test('bid ask only socket payload remains visible even without candle timestamp', () => {
  const normalized = normalizeQuoteTickPayload({
    symbol: 'XAUUSD.c',
    bidPrice: 2301.2,
    askPrice: 2301.5,
  });

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  assert.equal(normalized.update.symbol, 'XAUUSD');
  assert.equal(normalized.update.timestamp, null);
  assert.equal(normalized.update.timestampSource, 'missing');
});

test('backend live data can materialize a keyed candle stream even when REST history is empty', () => {
  const map = createCandleMap();
  const result = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 10, 5, 12),
      open: 2302.1,
      high: 2302.5,
      low: 2302.0,
      close: 2302.2,
      volume: 4,
    },
    'M1',
  );
  const liveCandles = materializeCandleMap(map);

  assert.equal(result.ignored, false);
  assert.equal(resolveVisibleSeriesMode([], liveCandles, [], 'M1'), 'current');
  assert.equal(shouldSyncVisibleSeriesCache('current', liveCandles, 'M1'), true);
  assert.deepEqual(liveCandles, [
    {
      time: secondsUtc(2024, 3, 22, 10, 5, 0),
      open: 2302.1,
      high: 2302.5,
      low: 2302.0,
      close: 2302.2,
      volume: 4,
    },
  ]);
});

test('useLiveCandles subscribes backend candle socket instead of quote-tick candle fallback', () => {
  const source = readFileSync(join(process.cwd(), 'src/domain/candles/hooks/useLiveCandles.ts'), 'utf8');
  const socketSource = readFileSync(join(process.cwd(), 'src/domain/candles/ws/candlesSocket.ts'), 'utf8');
  const protocolSource = readFileSync(join(process.cwd(), 'src/domain/candles/ws/candlesSocketProtocol.ts'), 'utf8');

  assert.match(source, /candlesWsService\.subscribe\(normalizedSymbol, normalizedTimeframe\)/);
  assert.match(source, /candlesWsService\.unsubscribe\(normalizedSymbol, normalizedTimeframe\)/);
  assert.doesNotMatch(source, /quote_store_fallback_tick/);
  assert.doesNotMatch(source, /liveCandlesEngine\.ingestQuoteTick/);
  assert.doesNotMatch(source, /normalizeLiveTick/);
  assert.match(socketSource, /resolveCandlesWsUrl\(process\.env\.EXPO_PUBLIC_CANDLES_WS_URL\)/);
  assert.match(socketSource, /createCandleChannel\(state\.symbol, state\.tf\)/);
  assert.match(socketSource, /action: 'subscribe', channel/);
  assert.match(protocolSource, /export const hasBackendCandleShape = \(payload: unknown\): boolean =>/);
  assert.match(protocolSource, /export const getCandlePayloadItems = \(payload: unknown\): unknown\[\] =>/);
  assert.match(protocolSource, /export const extractCandlePayloadContext = \(payload: unknown\)/);
  assert.match(socketSource, /if \(!hasBackendCandleShape\(item\)\) \{/);
  assert.doesNotMatch(source, /pushPrice\(/);
});
