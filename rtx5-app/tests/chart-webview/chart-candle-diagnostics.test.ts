import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('ChartScreen keeps full-series diagnostics and exposes the canonical atomic live bridge path', () => {
  assertSourceContains(source, /\[CHART-CANDLES\]/, 'ChartScreen must log direct useLiveCandles output');
  assertSourceContains(source, /\[CHART-BRIDGE\] useLiveCandles_update/, 'ChartScreen must log candle hook updates');
  assertSourceContains(source, /\[CHART-BRIDGE\] candle_sync_mode/, 'ChartScreen must log update mode decisions');
  assertSourceContains(source, /\[CHART-BRIDGE\] inject_updateChartData/, 'ChartScreen must log full candle reload injections');
  assertSourceContains(source, /const liveUpdate = \{[\s\S]*livePrice: lastCandle\.close,[\s\S]*revision,[\s\S]*updateLiveTick\(/, 'the direct live path must expose the Bid close and ordered revision in one bridge payload');
  assert.doesNotMatch(source, /\[CHART-BRIDGE\] inject_setLivePriceLine/, 'live Bid-line paints must not be logged as a separate delayed bridge call');
});

test('WebView candle bridge keeps diagnostics while the live path is one atomic queued update', () => {
  const updateDataBody = extractFunctionBody(source, 'updateChartData');
  const applyTickBody = extractFunctionBody(source, 'applyTickUpdate');
  const updateTickBody = extractFunctionBody(source, 'updateTick');
  const updateLiveTickBody = extractFunctionBody(source, 'updateLiveTick');

  assertSourceContains(updateDataBody, /\[WEBVIEW-CANDLE\] updateChartData/, 'WebView full reload must log candle data receipt');
  assertSourceContains(updateTickBody, /\[WEBVIEW-CANDLE\] updateTick_queued/, 'WebView incremental path must log queued ticks');
  assertSourceContains(updateLiveTickBody, /pendingTick = \{[\s\S]*tick: update\.candle[\s\S]*livePrice: update\.livePrice/, 'WebView live diagnostics must share the same queued transaction used for painting');
  assertSourceContains(applyTickBody, /\[WEBVIEW-CANDLE\] applyTickUpdate/, 'WebView must log applied candle ticks');
  assertSourceContains(applyTickBody, /tick\.time < lastBarTime[\s\S]*\[WEBVIEW-CANDLE\] applyTickUpdate_rejected/, 'WebView must log stale tick rejection');
});

test('ChartScreen warms candle history before cold timeframe switches', () => {
  assertSourceContains(source, /import \{ liveCandlesEngine \} from '\.\.\/\.\.\/api\/ws\/liveCandlesEngine'/, 'ChartScreen must be able to warm the canonical candle engine');
  assertSourceContains(source, /const prefetchChartTimeframeHistory = useCallback[\s\S]*liveCandlesEngine\.prefetchHistory/, 'ChartScreen must prefetch through the engine, not the WebView');
  assertSourceContains(source, /handleOpenTimeframePicker[\s\S]*showChartTimeframePicker\(\)[\s\S]*scheduleIdleWork[\s\S]*prefetchChartTimeframeHistory\(chartSymbol, tf\)/, 'opening the timeframe picker must paint first, then warm alternate timeframes off the critical path');
  assertSourceContains(source, /const prefetchSymbolPickerHistory = useCallback[\s\S]*availableSymbols[\s\S]*slice\(0, CHART_SYMBOL_PICKER_PREFETCH_LIMIT\)[\s\S]*prefetchChartTimeframeHistory\(targetSymbol, chartTimeframe\)/, 'opening the symbol picker must warm likely target symbols for the current timeframe');
  assertSourceContains(source, /handleOpenSymbolPicker[\s\S]*prefetchSymbolPickerHistory\(\)/, 'symbol picker open must start capped background symbol-history prefetch');
  assertSourceContains(source, /refreshSelectedChartHistory[\s\S]*liveCandlesEngine\.prefetchHistory\(nextSymbol, nextTimeframe\)[\s\S]*liveCandlesEngine\.refreshHistoryForContext\(nextSymbol, nextTimeframe\)/, 'selected symbol history must start before the chart context commit');
  assertSourceContains(source, /warmChartContextAndCommit[\s\S]*refreshSelectedChartHistory\(nextSymbol, nextTimeframe\)/, 'selecting a symbol or timeframe must refresh an existing target context without waiting');
});
