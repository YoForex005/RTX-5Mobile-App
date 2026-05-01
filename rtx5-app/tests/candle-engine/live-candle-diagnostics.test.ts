import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readCanonicalLiveStreamSource = (): string => {
  const candidates = [
    resolve(process.cwd(), 'src/candles/liveCandleStream.ts'),
    resolve(process.cwd(), 'rtx5-app/src/candles/liveCandleStream.ts'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, 'liveCandleStream.ts was not found from the test working directory');
  return readFileSync(filePath, 'utf8');
};

const source = readCanonicalLiveStreamSource();

const readRepoSource = (relativePath: string): string => {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), 'rtx5-app', relativePath),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, `${relativePath} was not found from the test working directory`);
  return readFileSync(filePath, 'utf8');
};

test('canonical live stream exposes safe REST history prefetch for fast timeframe switches', () => {
  assert.match(source, /const DEFAULT_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH/);
  assert.match(source, /public async prefetchHistory\(symbol: string, timeframe: string\): Promise<number>/);
  assert.match(source, /getCandleHistory\(normalizedSymbol, normalizedTimeframe, DEFAULT_HISTORY_LIMIT\)/);
  assert.match(source, /candleMemoryCache\.set\(normalizedSymbol, normalizedTimeframe, candles\)/);
  assert.match(source, /syncMergedCandleCache\(normalizedSymbol, normalizedTimeframe, candles, \{ canonical: true \}\)/);
});

test('canonical live stream seeds REST history plus backend current candle before websocket merge', () => {
  assert.match(source, /const getHistorySeedSnapshot = \(history: CandleHistorySnapshot\): HistorySeedSnapshot =>/);
  assert.match(source, /buildRestHistorySeedCandles\(history\.closedCandles, history\.currentCandle\)/);
  assert.match(source, /closedHistoryLastTime: seed\.closedHistoryLastTime/);
  assert.match(source, /currentCandleTime: seed\.currentCandleTime/);
  assert.match(source, /const historySeed = getHistorySeedSnapshot\(history\)/);
  assert.match(source, /const historyCandles = historySeed\.candles/);
  assert.doesNotMatch(source, /normalizeHistoryCandles\(history\.candles/);
  assert.doesNotMatch(source, /history\.candles\.length > 0 \? history\.candles/);
});

test('canonical live stream protects history requests from stale responses', () => {
  assert.match(source, /entry\.requestId \+= 1/);
  assert.match(source, /entry\.abortController\?\.abort\(\)/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /live\.requestId !== requestId \|\| controller\.signal\.aborted/);
});

test('canonical live stream buffers and replays live data around REST history', () => {
  assert.match(source, /entry\.bufferedEvents = \[\]/);
  assert.match(source, /entry\.bufferedEvents\.push\(event\)/);
  assert.match(source, /sort\(\(left, right\) => getEventTime\(left\) - getEventTime\(right\) \|\| left\.order - right\.order\)/);
  assert.match(source, /this\.applyLiveEvents\(live, replayEvents\)/);
});

test('canonical live stream does not generate candles from quote ticks', () => {
  assert.doesNotMatch(source, /applyTickToCandleMap/);
  assert.doesNotMatch(source, /ingestQuoteTick/);
  assert.doesNotMatch(source, /quotesWsService\.addTickListener/);
  assert.doesNotMatch(source, /quotesWsService\.subscribe/);
  assert.match(source, /ingestLiveCandle\(rawCandle: unknown, symbol\?: string, timeframe\?: string\): void/);
});

test('backend candle cache bootstrap does not reject valid intraday gaps', () => {
  const domainSource = readRepoSource('src/domain/candles.ts');
  const querySource = readRepoSource('src/query/websocket.ts');
  const tradingStateSource = readRepoSource('src/state/tradingState.ts');
  const hookSource = readRepoSource('src/hooks/useLiveCandles.ts');
  const historyQuerySource = readRepoSource('src/api/candleHistoryQuery.ts');

  assert.match(domainSource, /return normalized\.length >= minCandles/);
  assert.doesNotMatch(domainSource, /hasIntradayInternalGaps/);
  assert.doesNotMatch(domainSource, /INTRADAY_BOOTSTRAP_TIMEFRAMES/);
  assert.doesNotMatch(querySource, /requestCandleHistory\(symbol, timeframe, 200\)/);
  assert.doesNotMatch(querySource, /const channel = `candles\.\$\{symbol\}\.\$\{timeframe\}`/);
  assert.doesNotMatch(tradingStateSource, /getBucketStart\(newCandle\.time/);
  assert.match(hookSource, /normalizeTimeframeStrict\(timeframe\)/);
  assert.match(historyQuerySource, /return normalizedTimeframe \? \[normalizedTimeframe\] : \[\]/);
});

test('canonical live stream commits one merged timestamp-keyed series', () => {
  assert.match(source, /materializeCandleMap\(entry\.candleMap, MAX_CANDLE_SERIES_LENGTH\)/);
  assert.match(source, /candleMemoryCache\.set\(entry\.symbol, entry\.timeframe, nextCandles\)/);
  assert.match(source, /syncMergedCandleCache\(entry\.symbol, entry\.timeframe, nextCandles, \{ canonical: true \}\)/);
  assert.doesNotMatch(source, /historyCandles: entry\.historyCandles\.length/);
  assert.doesNotMatch(source, /liveCandles: entry\.liveCandles\.length/);
});
