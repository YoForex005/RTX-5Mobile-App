import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeQuoteTickPayload } from '../../src/api/ws/quoteTickNormalizer';
import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  validateQuoteTickForCandle,
} from '../../src/api/ws/liveCandleOverlay';
import { buildChartSeriesSnapshot, getChartSeriesUpdateMode } from '../../src/features/chart/liveChartSync';
import { materializeCanonicalHistoryAndLiveCandles } from '../../src/domain/candles';
import { resolveVisibleSeriesMode, shouldSyncVisibleSeriesCache } from '../../src/api/ws/liveCandlesEnginePolicy';
import { makeTrustedHistoryCandle, secondsUtc } from '../support/candleTestUtils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('same live quote payload can move bid ask and reach the candle engine with timestamp', () => {
  const payload = {
    symbol: 'XAUUSDm',
    bidPrice: '2300.10',
    askPrice: '2300.40',
    serverTime: secondsUtc(2024, 3, 22, 10, 3, 23),
  };

  const normalized = normalizeQuoteTickPayload(payload);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  const uiQuote = {
    symbol: normalized.update.symbol,
    bid: normalized.update.bid,
    ask: normalized.update.ask,
  };
  assert.deepEqual(uiQuote, { symbol: 'XAUUSD', bid: 2300.1, ask: 2300.4 });
  assert.equal(normalized.update.timestamp, secondsUtc(2024, 3, 22, 10, 3, 23));

  const engineTick = validateQuoteTickForCandle(
    {
      bid: normalized.update.bid,
      ask: normalized.update.ask,
      last: normalized.update.last,
      timestamp: normalized.update.timestamp,
    },
    { priceBasis: 'bid', sequence: 1, referencePrice: 2300 },
  );

  assert.ok(engineTick, 'normalized quote must become a canonical candle-engine tick');
  assert.equal(engineTick.price, 2300.1);
});

test('normalized live quote generates a contiguous live candle and chart incremental update', () => {
  const history = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 2299.5 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 1, 0), { close: 2299.8 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 2, 0), { close: 2300.0 }),
  ];
  const normalized = normalizeQuoteTickPayload({
    symbol: 'XAUUSD',
    Bid: 2300.1,
    Ask: 2300.4,
    lastTickAt: secondsUtc(2024, 3, 22, 10, 3, 5),
  });

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  const tick = validateQuoteTickForCandle(
    normalized.update,
    { priceBasis: 'bid', sequence: 1, referencePrice: history[history.length - 1].close },
  );
  assert.ok(tick);

  const liveCandle = createLiveCandleFromTick(getLiveTickBucketTime(tick, 'M1'), tick);
  const visible = materializeCanonicalHistoryAndLiveCandles(history, [liveCandle], 'M1');
  const previousSnapshot = buildChartSeriesSnapshot(history);
  const nextSnapshot = buildChartSeriesSnapshot(visible);

  assert.equal(liveCandle.time, secondsUtc(2024, 3, 22, 10, 3, 0));
  assert.equal(liveCandle.open, 2300.1);
  assert.equal(liveCandle.high, 2300.1);
  assert.equal(liveCandle.low, 2300.1);
  assert.equal(liveCandle.close, 2300.1);
  assert.equal(getChartSeriesUpdateMode(previousSnapshot, nextSnapshot), 'incremental');
});

test('quote payload without server timestamp is visible as bid ask but cannot create a candle', () => {
  const normalized = normalizeQuoteTickPayload({
    symbol: 'EURUSD',
    bid: 1.085,
    ask: 1.0852,
  });

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  assert.equal(normalized.update.timestamp, null);
  assert.equal(
    validateQuoteTickForCandle(
      normalized.update,
      { priceBasis: 'bid', sequence: 1, referencePrice: 1.084 },
    ),
    null,
  );
});

test('bid ask only socket payload without server timestamp cannot generate a candle', () => {
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

  const tick = validateQuoteTickForCandle(
    normalized.update,
    { priceBasis: 'bid', sequence: 1, referencePrice: 2301 },
  );
  assert.equal(tick, null);
});

test('live data can materialize a keyed candle stream even when REST history is empty', () => {
  const normalized = normalizeQuoteTickPayload(
    {
      symbol: 'XAUUSD',
      bid: 2302.2,
      ask: 2302.5,
    },
    secondsUtc(2024, 3, 22, 10, 5, 12) * 1000,
  );

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  const tick = validateQuoteTickForCandle(
    normalized.update,
    { priceBasis: 'bid', sequence: 1 },
  );
  assert.ok(tick);

  const liveCandle = createLiveCandleFromTick(getLiveTickBucketTime(tick, 'M1'), tick);
  assert.equal(resolveVisibleSeriesMode([], [liveCandle], [], 'M1'), 'current');
  assert.equal(shouldSyncVisibleSeriesCache('current', [liveCandle], 'M1'), true);
  assert.deepEqual(
    {
      time: liveCandle.time,
      open: liveCandle.open,
      high: liveCandle.high,
      low: liveCandle.low,
      close: liveCandle.close,
      volume: liveCandle.volume,
    },
    {
      time: secondsUtc(2024, 3, 22, 10, 5, 0),
      open: 2302.2,
      high: 2302.2,
      low: 2302.2,
      close: 2302.2,
      volume: 0,
    },
  );
});

test('useLiveCandles subscribes backend candle socket instead of quote-tick candle fallback', () => {
  const source = readFileSync(join(process.cwd(), 'src/hooks/useLiveCandles.ts'), 'utf8');
  const socketSource = readFileSync(join(process.cwd(), 'src/api/ws/candlesSocket.ts'), 'utf8');

  assert.match(source, /candlesWsService\.subscribe\(normalizedSymbol, normalizedTimeframe\)/);
  assert.match(source, /candlesWsService\.unsubscribe\(normalizedSymbol, normalizedTimeframe\)/);
  assert.doesNotMatch(source, /quote_store_fallback_tick/);
  assert.doesNotMatch(source, /liveCandlesEngine\.ingestQuoteTick/);
  assert.match(socketSource, /const hasBackendCandleShape = \(payload: unknown\): boolean =>/);
  assert.match(socketSource, /if \(!hasBackendCandleShape\(item\)\) \{/);
  assert.doesNotMatch(source, /pushPrice\(/);
});
