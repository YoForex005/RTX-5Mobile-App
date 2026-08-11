import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  getOrrnnDemoPublicCandles,
  getOrrnnDemoPublicFeedStatus,
  getOrrnnDemoPublicMarketCatalog,
  getOrrnnDemoPublicQuotePayloads,
  isOrrnnDemoPublicMarketSelection,
  ORRNN_DEMO_PUBLIC_FEED_WS_URL,
  ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL,
  resetOrrnnDemoPublicMarketCatalogCache,
  resolveOrrnnDemoPublicCandleTimeframe,
} from './orrnnDemoPublicMarket';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('anonymous public market is active for every logged-out broker selection', () => {
  assert.equal(
    isOrrnnDemoPublicMarketSelection({ brokerId: 'orrnn-demo', isLoggedIn: false }),
    true,
  );
  assert.equal(
    isOrrnnDemoPublicMarketSelection({ brokerId: 'orrnn-demo', isLoggedIn: true }),
    false,
  );
  assert.equal(
    isOrrnnDemoPublicMarketSelection({ brokerId: 'orrnn', isLoggedIn: false }),
    true,
  );
  assert.equal(
    isOrrnnDemoPublicMarketSelection({ brokerId: 'ORRNN-DEMO', isLoggedIn: false }),
    true,
  );
  assert.equal(
    isOrrnnDemoPublicMarketSelection({ brokerId: '', isLoggedIn: false }),
    true,
  );
  assert.equal(
    isOrrnnDemoPublicMarketSelection({ brokerId: 'other-broker', isLoggedIn: true }),
    false,
  );
  assert.equal(ORRNN_DEMO_PUBLIC_FEED_WS_URL, 'wss://demobackend.orrnn.com/ws/feed');
});

test('public quote transport expands deployed tick batches and preserves flat frames', () => {
  const first = { symbol: 'EURUSD', bid: 1.1, ask: 1.2 };
  const second = { symbol: 'GBPUSD', bid: 1.3, ask: 1.4 };
  assert.deepEqual(
    getOrrnnDemoPublicQuotePayloads({ type: 'ticks', ticks: [first, second] }),
    [first, second],
  );
  assert.deepEqual(getOrrnnDemoPublicQuotePayloads(first), [first]);
  assert.deepEqual(
    getOrrnnDemoPublicQuotePayloads({ type: 'subscribed', symbols: ['EURUSD'] }),
    [{ type: 'subscribed', symbols: ['EURUSD'] }],
  );
});

test('public timeframe mapping accepts only the deployed candle contract', () => {
  assert.equal(resolveOrrnnDemoPublicCandleTimeframe('M1'), '1m');
  assert.equal(resolveOrrnnDemoPublicCandleTimeframe('4h'), '4h');
  assert.equal(resolveOrrnnDemoPublicCandleTimeframe('D1'), '1d');
  assert.equal(resolveOrrnnDemoPublicCandleTimeframe('W1'), null);
  assert.equal(resolveOrrnnDemoPublicCandleTimeframe('MN'), null);
});

test('public symbols and candles use exact tokenless URLs and validate the catalog', async (t) => {
  resetOrrnnDemoPublicMarketCatalogCache();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    const requestUrl = String(input);
    requests.push({ url: requestUrl, init });
    if (requestUrl.endsWith('/candles/symbols')) {
      return jsonResponse({
        symbols: ['eurusd', 'GBPUSD'],
        timeframes: ['1m', '5m', '1h', '1d'],
      });
    }
    const selection = new URL(requestUrl);
    const selectedSymbol = selection.searchParams.get('symbol') ?? '';
    const selectedTimeframe = selection.searchParams.get('tf') ?? '';
    return jsonResponse({
      symbol: selectedSymbol,
      tf: selectedTimeframe,
      count: 1,
      candles: [{
        symbol: selectedSymbol,
        tf: selectedTimeframe,
        open: 1.1,
        high: 1.2,
        low: 1,
        close: 1.15,
        time: 1_700_000_000,
        volume: 10,
        closed: true,
      }, {
        symbol: 'USDJPY',
        tf: '1m',
        open: 150,
        high: 151,
        low: 149,
        close: 150.5,
        time: 1_700_000_060,
        volume: 5,
        closed: true,
      }],
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOrrnnDemoPublicMarketCatalogCache();
  });

  const catalog = await getOrrnnDemoPublicMarketCatalog();
  const candles = await getOrrnnDemoPublicCandles('eurusd', 'M1', 900);
  const secondSymbolCandles = await getOrrnnDemoPublicCandles('gbpusd', 'M5', 50);

  assert.deepEqual(catalog.symbols, ['EURUSD', 'GBPUSD']);
  assert.equal(candles.symbol, 'EURUSD');
  assert.equal(candles.tf, '1m');
  assert.equal(candles.count, 1);
  assert.equal(candles.candles.length, 1);
  assert.equal(secondSymbolCandles.symbol, 'GBPUSD');
  assert.equal(secondSymbolCandles.tf, '5m');
  assert.equal(secondSymbolCandles.count, 1);
  assert.equal(requests[0]?.url, `${ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL}/candles/symbols`);
  assert.equal(
    requests[1]?.url,
    `${ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL}/candles?symbol=EURUSD&tf=1m&limit=500`,
  );
  assert.equal(
    requests[2]?.url,
    `${ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL}/candles?symbol=GBPUSD&tf=5m&limit=50`,
  );
  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.has('authorization'), false);
    assert.equal(headers.get('accept'), 'application/json');
  }
});

test('public chart history does not amplify a slow cold read with timeout retries', () => {
  const source = readSource('src/api/orrnnDemoPublicMarket.ts');
  const candleCall = source.slice(
    source.indexOf('timedFetch(', source.indexOf('export async function getOrrnnDemoPublicCandles')),
    source.indexOf('const availableCatalog', source.indexOf('export async function getOrrnnDemoPublicCandles')),
  );

  assert.match(candleCall, /label: 'orrnnDemoPublicMarket\.candles'[\s\S]*timeoutMs: 0/);
});

test('public candles reject a symbol outside an available catalog', async (t) => {
  resetOrrnnDemoPublicMarketCatalogCache();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    return jsonResponse({ symbols: ['EURUSD'], timeframes: ['1m'] });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOrrnnDemoPublicMarketCatalogCache();
  });

  await getOrrnnDemoPublicMarketCatalog();
  await assert.rejects(
    () => getOrrnnDemoPublicCandles('USDJPY', 'M1'),
    /unavailable for USDJPY 1m/,
  );
  assert.equal(requestCount, 2);
});

test('cold Quotes catalog and Chart history warm-up share one catalog request', async (t) => {
  resetOrrnnDemoPublicMarketCatalogCache();
  const originalFetch = globalThis.fetch;
  let catalogRequestCount = 0;
  let candleRequestCount = 0;
  let releaseCatalog = () => {};
  const catalogGate = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });

  globalThis.fetch = (async (input) => {
    const requestUrl = String(input);
    if (requestUrl.endsWith('/candles/symbols')) {
      catalogRequestCount += 1;
      await catalogGate;
      return jsonResponse({ symbols: ['EURUSD'], timeframes: ['1m'] });
    }
    candleRequestCount += 1;
    return jsonResponse({
      symbol: 'EURUSD',
      tf: '1m',
      count: 0,
      candles: [],
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOrrnnDemoPublicMarketCatalogCache();
  });

  const quotesCatalog = getOrrnnDemoPublicMarketCatalog();
  const chartHistory = getOrrnnDemoPublicCandles('EURUSD', 'M1');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const observedCatalogRequestCount = catalogRequestCount;
  const observedCandleRequestCount = candleRequestCount;
  releaseCatalog();
  await Promise.all([quotesCatalog, chartHistory]);

  assert.equal(observedCatalogRequestCount, 1);
  assert.equal(observedCandleRequestCount, 1);
  assert.equal(catalogRequestCount, 1);
  assert.equal(candleRequestCount, 1);
});

test('public feed diagnostics use the tokenless deployed status endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedHeaders = new Headers();
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return jsonResponse({
      market_available: true,
      upstream_connected: true,
      feed_auth_required: false,
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const status = await getOrrnnDemoPublicFeedStatus();
  assert.equal(capturedUrl, 'https://demobackend.orrnn.com/ws/feed/status');
  assert.equal(capturedHeaders?.has('authorization'), false);
  assert.deepEqual(status, {
    market_available: true,
    upstream_connected: true,
    feed_auth_required: false,
  });
});

test('chart and quotes select the isolated public scope while authenticated paths stay intact', () => {
  const candleHook = readSource('src/domain/candles/hooks/useOrrnnDemoPublicCandles.ts');
  const liveCandles = readSource('src/domain/candles/hooks/useLiveCandles.ts');
  const publicCandleQuery = readSource('src/domain/candles/query/orrnnDemoPublicCandles.ts');
  const navigationPrefetch = readSource('src/utils/navigationPrefetch.ts');
  const marketQuery = readSource('src/query/market.ts');
  const quotes = readSource('src/features/quotes/useLiveQuotes.ts');
  const nativeChart = readSource('src/features/chart/ChartScreen.native.tsx');
  const publicMarketApi = readSource('src/api/orrnnDemoPublicMarket.ts');
  const publicMarketSocket = readSource('src/api/ws/orrnnDemoPublicMarketSocket.ts');

  assert.match(publicCandleQuery, /candleKeys\.history\([\s\S]*ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE/);
  assert.match(publicCandleQuery, /getOrrnnDemoPublicCandles\([\s\S]*signal/);
  assert.match(
    candleHook,
    /resolvedHistoryCandles === undefined[\s\S]*orrnnDemoPublicMarketSocket\.subscribeCandle\(/,
  );
  assert.match(candleHook, /useQuery\(queryOptions\)/);
  assert.match(
    candleHook,
    /historyQuery\.data \?\?[\s\S]*queryClient\.getQueryData<CandleParams\[]>\([\s\S]*getOrrnnDemoPublicCandleQueryKey/,
  );
  assert.match(candleHook, /candles\.filter\(\(candle\) => candle\.time !== incoming\.time\)/);
  assert.match(candleHook, /sortAndDedupeCandles/);
  assert.match(liveCandles, /return isPublicDemoSelection \? publicDemoCandles : authenticatedCandles/);
  assert.match(publicCandleQuery, /notifyOnChangeProps: enabled \? undefined : \['data'\]/);
  assert.match(
    candleHook,
    /const cachedRestCandles = resolvedHistoryCandles \?\? EMPTY_PUBLIC_CANDLES/,
  );
  assert.match(marketQuery, /if \(isPublicDemoMarket\) \{[\s\S]*getOrrnnDemoPublicMarketCatalog\(\)/);
  assert.match(quotes, /ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE/);
  assert.match(quotes, /orrnnDemoPublicMarketSocket/);
  assert.match(quotes, /cacheNamespace === ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE[\s\S]*false/);
  assert.match(
    nativeChart,
    /const releaseQuoteDemand = isPublicDemoMarket[\s\S]*orrnnDemoPublicMarketSocket\.subscribeToSymbol\([\s\S]*chartSymbol,[\s\S]*retainLatestChartTradeDisplayQuote[\s\S]*quotesWsService\.subscribeToSymbol\(/,
  );
  assert.doesNotMatch(publicMarketApi, /EURUSD/);
  assert.doesNotMatch(publicMarketSocket, /EURUSD/);
  assert.match(
    publicMarketApi,
    /void getOrrnnDemoPublicMarketCatalog\(signal\)\.catch\(\(\) => undefined\);[\s\S]*const response = await timedFetch\(/,
  );
  assert.match(publicMarketApi, /const availableCatalog = cachedPublicCatalog\?\.value/);
  assert.match(publicMarketApi, /symbol: normalizedSymbol,[\s\S]*tf: publicTimeframe/);
  assert.match(publicMarketSocket, /const symbols = Array\.from\(this\.quoteListeners\.keys\(\)\)[\s\S]*type: 'subscribe', symbols/);
  assert.match(
    publicMarketSocket,
    /const bootstrapQuoteSymbols = Array\.from\(this\.quoteListeners\.keys\(\)\)[\s\S]*encodeURIComponent\(bootstrapQuoteSymbols\.join\(','\)\)[\s\S]*new WebSocket\(socketUrl\)/,
  );
  const batchSubscribeStart = publicMarketSocket.indexOf('subscribeToSymbols(');
  const batchRegisterStart = publicMarketSocket.indexOf(
    'for (const normalizedSymbol of normalizedSymbols)',
    batchSubscribeStart,
  );
  const batchConnectStart = publicMarketSocket.indexOf('this.connect();', batchSubscribeStart);
  assert.ok(
    batchSubscribeStart >= 0 &&
    batchRegisterStart > batchSubscribeStart &&
    batchConnectStart > batchRegisterStart,
  );
  assert.match(
    quotes,
    /ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE\) \{[\s\S]*orrnnDemoPublicMarketSocket\.subscribeToSymbols\([\s\S]*subscriptionSymbols,[\s\S]*listener/,
  );
  assert.match(publicMarketSocket, /type: 'subscribe_candles', symbol, tf/);
  assert.match(
    publicMarketSocket,
    /const receiptMonotonicAt = quoteLatencyMonotonicNow\(\)[\s\S]*for \(const quotePayload of getOrrnnDemoPublicQuotePayloads\(payload\)\)[\s\S]*toQuoteTick\(quotePayload, receivedAt, receiptMonotonicAt\)/,
  );
  assert.match(publicMarketSocket, /feedTickAt: timestamp,[\s\S]*receivedAt,[\s\S]*receiptMonotonicAt,[\s\S]*timestamp/);
  assert.match(publicCandleQuery, /PUBLIC_CANDLE_RETRY_DELAYS_MS/);
  const selectionPrefetchStart = navigationPrefetch.indexOf(
    'export function prefetchChartSelectionHistory',
  );
  const selectionPrefetchEnd = navigationPrefetch.indexOf(
    'export function prefetchLatestDailyCandle',
    selectionPrefetchStart,
  );
  const selectionPrefetchBody = navigationPrefetch.slice(
    selectionPrefetchStart,
    selectionPrefetchEnd,
  );
  assert.ok(
    selectionPrefetchBody.indexOf('isOrrnnDemoPublicMarketSelection')
      < selectionPrefetchBody.indexOf('captureActiveBrokerSession'),
  );
  assert.match(
    selectionPrefetchBody,
    /prefetchOrrnnDemoPublicCandles\(normalizedSymbol, normalizedTimeframe\)/,
  );
  assert.match(nativeChart, /const chartMarketDataCacheNamespace = isPublicDemoMarket[\s\S]*ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE/);
  assert.match(nativeChart, /if \(isPublicDemoMarket\) \{[\s\S]*return sanitizedBackendCandles/);
  assert.match(nativeChart, /!chartSurfaceReady \|\|[\s\S]*\(!isPublicDemoMarket && \(!isLoggedIn \|\| !activeChartSessionCacheNamespace\)\)/);
  assert.match(nativeChart, /const releaseCandleConsumer = isPublicDemoMarket[\s\S]*liveCandlesEngine\.subscribe/);
  assert.match(nativeChart, /if \([\s\S]*!isLoggedIn \|\|[\s\S]*!activeChartSessionCacheNamespace[\s\S]*\) \{[\s\S]*return undefined;[\s\S]*const startupPrefetchKey/);
  assert.match(nativeChart, /!isLoggedIn \|\|[\s\S]*!activeChartSessionCacheNamespace \|\|[\s\S]*!chartRuntimeActive \|\|[\s\S]*!chartSurfaceReady[\s\S]*void refetchChartMarketStatus\(\)/);
  assert.match(nativeChart, /if \(isPublicDemoMarket\) \{[\s\S]*preferences\.setChartSymbol\(nextSymbol\)[\s\S]*preferences\.setChartTimeframe\(nextTimeframe\)/);
});

test('public market socket recycles a demanded OPEN connection when the feed goes silent', () => {
  const source = readSource('src/api/ws/orrnnDemoPublicMarketSocket.ts');

  assert.match(
    source,
    /const PUBLIC_FEED_SILENT_STALE_MS = 8_000;[\s\S]*const PUBLIC_FEED_WATCHDOG_INTERVAL_MS = 3_000;/,
    'the public feed must use the bounded 8-second silence threshold and 3-second watchdog cadence',
  );
  assert.match(
    source,
    /socket\.onopen = \(\) => \{[\s\S]*this\.reconnectAttempts = 0;[\s\S]*this\.lastMessageAt = Date\.now\(\);[\s\S]*this\.syncSubscriptions\(\);[\s\S]*this\.startWatchdog\(\);/,
    'opening the selected public socket must refresh activity time before the watchdog starts',
  );
  assert.match(
    source,
    /socket\.onmessage = \(event\) => \{[\s\S]*this\.lastMessageAt = Date\.now\(\);[\s\S]*this\.handlePayload\(getSocketData\(event\)\);/,
    'every accepted public frame must refresh the watchdog activity time',
  );

  const watchdogStart = source.indexOf('private startWatchdog(): void');
  const watchdogEnd = source.indexOf('private stopWatchdog(): void', watchdogStart);
  assert.notEqual(watchdogStart, -1);
  assert.ok(watchdogEnd > watchdogStart);
  const watchdogBody = source.slice(watchdogStart, watchdogEnd);
  assert.match(
    watchdogBody,
    /this\.socket\?\.readyState !== WebSocket\.OPEN \|\|[\s\S]*!this\.shouldReconnect \|\|[\s\S]*!this\.hasDemand\(\) \|\|[\s\S]*!this\.isAppActive \|\|[\s\S]*!this\.isSelectionActive\(\)[\s\S]*Date\.now\(\) - this\.lastMessageAt <= PUBLIC_FEED_SILENT_STALE_MS[\s\S]*this\.teardownSocket\(false\);[\s\S]*this\.scheduleReconnect\(\);[\s\S]*PUBLIC_FEED_WATCHDOG_INTERVAL_MS/,
    'only a stale OPEN socket with active demand may be torn down and reconnected',
  );
  assert.ok(
    watchdogBody.indexOf('this.teardownSocket(false);')
      < watchdogBody.indexOf('this.scheduleReconnect();'),
    'the silent socket must be fully torn down before reconnect scheduling',
  );
  assert.match(
    source,
    /private teardownSocket\(sendUnsubscribe: boolean\): void \{[\s\S]*this\.stopWatchdog\(\);[\s\S]*const socket = this\.socket;/,
    'every socket teardown must stop the watchdog before releasing the socket',
  );
});
