import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('ChartScreen logs the canonical useLiveCandles to WebView candle bridge path', () => {
  assertSourceContains(source, /\[CHART-CANDLES\]/, 'ChartScreen must log direct useLiveCandles output');
  assertSourceContains(source, /\[CHART-BRIDGE\] useLiveCandles_update/, 'ChartScreen must log candle hook updates');
  assertSourceContains(source, /\[CHART-BRIDGE\] candle_sync_mode/, 'ChartScreen must log update mode decisions');
  assertSourceContains(source, /\[CHART-BRIDGE\] inject_updateChartData/, 'ChartScreen must log full candle reload injections');
  assertSourceContains(source, /\[CHART-BRIDGE\] inject_updateTick/, 'ChartScreen must log incremental candle injections');
  assertSourceContains(source, /\[CHART-BRIDGE\] inject_setLivePriceLine/, 'ChartScreen must log live price line injections separately');
});

test('WebView candle bridge logs updateChartData updateTick and rejected stale ticks', () => {
  const updateDataBody = extractFunctionBody(source, 'updateChartData');
  const applyTickBody = extractFunctionBody(source, 'applyTickUpdate');
  const updateTickBody = extractFunctionBody(source, 'updateTick');

  assertSourceContains(updateDataBody, /\[WEBVIEW-CANDLE\] updateChartData/, 'WebView full reload must log candle data receipt');
  assertSourceContains(updateTickBody, /\[WEBVIEW-CANDLE\] updateTick_queued/, 'WebView incremental path must log queued ticks');
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
