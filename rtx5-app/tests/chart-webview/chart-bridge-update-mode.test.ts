import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChartSeriesSnapshot,
  getChartSeriesUpdateMode,
} from '../../src/features/chart/liveChartSync';
import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';
import { makeCandle } from '../support/candleTestUtils';

const source = readChartScreenSource();

test('active candle changes use incremental updateTick mode', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.25, high: 1.25 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'incremental');
});

test('new candle appended cleanly uses incremental updateTick mode', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'incremental');
});

test('older history correction forces updateChartData full reload', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.22, high: 1.22 }),
    makeCandle(180, { close: 1.3 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'full_reload');
});

test('symbol timeframe chart type and theme changes invalidate init signature', () => {
  assertSourceContains(
    source,
    /const currentSig = useMemo\([\s\S]*chartSymbol[\s\S]*normalizeTimeframe\(chartTimeframe\)[\s\S]*chartType[\s\S]*chartColorsSignature/,
    'init signature must include symbol, normalized timeframe, chart type, and colors',
  );
  assertSourceContains(
    source,
    /if \(lastInitSigRef\.current !== currentSig\)[\s\S]*chartInitializedRef\.current = false/,
    'signature changes must mark the WebView chart as not initialized',
  );
});

test('ChartScreen routes full reload and incremental update to the correct bridge functions', () => {
  const syncEffectStart = source.indexOf('const nextSnapshot = buildChartSeriesSnapshot');
  assert.notEqual(syncEffectStart, -1, 'series sync effect was not found');
  const syncEffect = source.slice(syncEffectStart, source.indexOf('useEffect(() => {', syncEffectStart + 1));

  assertSourceContains(syncEffect, /updateMode === 'full_reload'[\s\S]*updateChartData\(/, 'full reload must call updateChartData');
  assertSourceContains(syncEffect, /else \{[\s\S]*updateTick\(/, 'incremental mode must call updateTick');
});

test('WebView full data reload restores overlays and market price lines after setData', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /series\.setData\(mapped\)/, 'updateChartData must call setData');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'stale overlay refs must be cleared');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'overlays must be reapplied after setData');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'market lines must be restored after setData');
});
