import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';

import {
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
  resetOrrnnDemoPublicMarketCatalogCache,
} from '../../../api/orrnnDemoPublicMarket';
import {
  getOrrnnDemoPublicCandleQueryKey,
  getOrrnnDemoPublicCandleQueryOptions,
  resolveOrrnnDemoPublicCandleSelection,
} from './orrnnDemoPublicCandles';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

test('public candle query keys isolate the anonymous namespace, symbol, and timeframe', () => {
  assert.deepEqual(
    getOrrnnDemoPublicCandleQueryKey('eurusd', '1m'),
    ['candles', ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE, 'history', 'EURUSD', 'M1'],
  );
  assert.deepEqual(
    getOrrnnDemoPublicCandleQueryKey('GBPUSD', 'H1'),
    ['candles', ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE, 'history', 'GBPUSD', 'H1'],
  );
  assert.deepEqual(
    resolveOrrnnDemoPublicCandleSelection(' xauusd ', '4h'),
    { symbol: 'XAUUSD', timeframe: 'H4' },
  );
  assert.equal(resolveOrrnnDemoPublicCandleSelection('EURUSD', 'W1'), null);
});

test('navigation prefetch and the chart query join one public REST request and reuse its cache', async (t) => {
  resetOrrnnDemoPublicMarketCatalogCache();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let releaseCandleResponse = () => {};
  const candleResponseGate = new Promise<void>((resolve) => {
    releaseCandleResponse = resolve;
  });

  globalThis.fetch = (async (input, init) => {
    const requestUrl = String(input);
    requests.push({ url: requestUrl, init });
    if (requestUrl.endsWith('/candles/symbols')) {
      return jsonResponse({ symbols: ['EURUSD'], timeframes: ['1m'] });
    }

    await candleResponseGate;
    return jsonResponse({
      symbol: 'EURUSD',
      tf: '1m',
      count: 1,
      candles: [{
        symbol: 'EURUSD',
        tf: '1m',
        time: 1_700_000_000,
        open: 1.1,
        high: 1.2,
        low: 1,
        close: 1.15,
        volume: 10,
        closed: true,
      }],
    });
  }) as typeof fetch;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  t.after(() => {
    queryClient.clear();
    globalThis.fetch = originalFetch;
    resetOrrnnDemoPublicMarketCatalogCache();
  });

  const options = {
    ...getOrrnnDemoPublicCandleQueryOptions('eurusd', 'M1'),
    retry: false as const,
  };
  const navigationWarmup = queryClient.fetchQuery(options);
  const chartMount = queryClient.fetchQuery(options);

  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(requests.filter((request) => request.url.endsWith('/candles/symbols')).length, 1);
  assert.equal(requests.filter((request) => request.url.includes('/candles?')).length, 1);
  assert.match(
    requests.find((request) => request.url.includes('/candles?'))?.url ?? '',
    /[?&]limit=120(?:&|$)/,
  );

  releaseCandleResponse();
  const [prefetchedCandles, mountedCandles] = await Promise.all([
    navigationWarmup,
    chartMount,
  ]);

  assert.equal(prefetchedCandles.length, 1);
  assert.equal(mountedCandles.length, 1);
  assert.equal(prefetchedCandles[0]?.source, 'rest');
  assert.strictEqual(prefetchedCandles, mountedCandles);
  assert.strictEqual(
    queryClient.getQueryData(getOrrnnDemoPublicCandleQueryKey('EURUSD', 'M1')),
    prefetchedCandles,
  );
  for (const request of requests) {
    assert.equal(new Headers(request.init?.headers).has('authorization'), false);
  }
});
