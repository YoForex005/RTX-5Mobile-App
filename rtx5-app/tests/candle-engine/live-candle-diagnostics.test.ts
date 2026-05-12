import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readCanonicalLiveStreamSource = (): string => {
  // Prefer the split folder structure introduced after the 500-line refactor.
  const folderCandidates = [
    resolve(process.cwd(), 'src/domain/candles/stream/liveCandleStream'),
    resolve(process.cwd(), 'rtx5-app/src/domain/candles/stream/liveCandleStream'),
    resolve(process.cwd(), 'src/candles/stream/liveCandleStream'),
    resolve(process.cwd(), 'rtx5-app/src/candles/stream/liveCandleStream'),
  ];
  for (const folder of folderCandidates) {
    if (existsSync(folder) && statSync(folder).isDirectory()) {
      return readdirSync(folder)
        .filter((entry) => entry.endsWith('.ts'))
        .map((entry) => readFileSync(resolve(folder, entry), 'utf8'))
        .join('\n');
    }
  }
  // Legacy single-file fallback.
  const candidates = [
    resolve(process.cwd(), 'src/domain/candles/stream/liveCandleStream.ts'),
    resolve(process.cwd(), 'rtx5-app/src/domain/candles/stream/liveCandleStream.ts'),
    resolve(process.cwd(), 'src/candles/stream/liveCandleStream.ts'),
    resolve(process.cwd(), 'rtx5-app/src/candles/stream/liveCandleStream.ts'),
    resolve(process.cwd(), 'src/candles/liveCandleStream.ts'),
    resolve(process.cwd(), 'rtx5-app/src/candles/liveCandleStream.ts'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, 'stream/liveCandleStream not found from the test working directory');
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
  assert.match(source, /syncMergedCandleCache\(normalizedSymbol, normalizedTimeframe, history\.closedCandles, \{ canonical: true \}\)/);
});

test('canonical live stream seeds REST history plus backend current candle before websocket merge', () => {
  assert.match(source, /const getHistorySeedSnapshot = \(history: CandleHistorySnapshot\): HistorySeedSnapshot =>/);
  assert.match(source, /buildRestHistorySeedCandles\(history\.closedCandles, history\.currentCandle\)/);
  assert.match(source, /closedHistoryLastTime: seed\.closedHistoryLastTime/);
  assert.match(source, /currentCandleTime: seed\.currentCandleTime/);
  assert.match(source, /const historySeed = getHistorySeedSnapshot\(history\)/);
  assert.match(source, /let historyCandles = historySeed\.candles/);
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
  // Accept either `this.applyLiveEvents` (in-class call) or `manager.applyLiveEvents`
  // (the extracted historyFetching helper post 500-line refactor).
  assert.match(source, /(?:this|manager)\.applyLiveEvents\(live, replayEvents\)/);
});

test('canonical live stream uses quote ticks only through the managed active-candle extension', () => {
  assert.doesNotMatch(source, /applyTickToCandleMap/);
  assert.doesNotMatch(source, /ingestQuoteTick/);
  assert.doesNotMatch(source, /quotesWsService\.addTickListener/);
  assert.doesNotMatch(source, /quotesWsService\.subscribe/);
  assert.match(source, /extendActiveCandlesFromQuoteTick/);
  assert.match(source, /applyQuoteTickExtensionToCandleMap/);
  assert.match(source, /ingestLiveCandle\(rawCandle: unknown, symbol\?: string, timeframe\?: string\): void/);
});

test('backend candle cache bootstrap does not reject valid intraday gaps', () => {
  const domainSource = readRepoSource('src/domain/candles/core/candles.ts');
  const querySource = readRepoSource('src/query/websocket.ts');
  const tradingStateSource = readRepoSource('src/state/tradingState.ts');
  const hookSource = readRepoSource('src/domain/candles/hooks/useLiveCandles.ts');
  const historyQuerySource = readRepoSource('src/domain/candles/api/candleHistoryQuery.ts');

  assert.match(domainSource, /return normalized\.length >= minCandles/);
  assert.doesNotMatch(domainSource, /hasIntradayInternalGaps/);
  assert.doesNotMatch(domainSource, /INTRADAY_BOOTSTRAP_TIMEFRAMES/);
  assert.doesNotMatch(querySource, /requestCandleHistory\(symbol, timeframe, 200\)/);
  assert.doesNotMatch(querySource, /const channel = `candles\.\$\{symbol\}\.\$\{timeframe\}`/);
  assert.doesNotMatch(tradingStateSource, /getBucketStart\(newCandle\.time/);
  assert.match(hookSource, /normalizeTimeframeStrict\(timeframe\)/);
  assert.match(historyQuerySource, /return normalizedTimeframe \? \[normalizedTimeframe\] : \[\]/);
});

test('canonical live stream commits one fresh history plus backend live candle series', () => {
  assert.match(source, /historyCandles: Candle\[]/);
  assert.match(source, /liveCandleMap: Map<number, MutableCandle>/);
  assert.match(source, /materializeLiveCandleMap\(entry\.liveCandleMap, entry\.historyLastTime\)/);
  assert.match(source, /buildFreshHistoryLiveCandleSeries\(/);
  assert.match(source, /candleMemoryCache\.set\(entry\.symbol, entry\.timeframe, safeNextCandles\)/);
  assert.match(source, /syncMergedCandleCache\(symbol, timeframe, history\.closedCandles, \{ canonical: true \}\)/);
  assert.doesNotMatch(source, /syncMergedCandleCache\(entry\.symbol, entry\.timeframe, nextCandles, \{ canonical: true \}\)/);
  assert.doesNotMatch(source, /materializeCandleMap\(entry\.candleMap/);
});
