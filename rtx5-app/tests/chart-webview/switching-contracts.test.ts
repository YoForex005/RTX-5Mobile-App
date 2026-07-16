import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSourceContains,
  assertSourceOmits,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('timeframe switch resets time range and commits only the selected timeframe', () => {
  assertSourceContains(
    source,
    /const handleTimeframeSelect = useCallback[\s\S]*setActiveDateRange\('auto'\)[\s\S]*setCustomDateValue\(null\)[\s\S]*warmChartContextAndCommit\(chartSymbol, nextTimeframe\)/,
    'timeframe switch must reset range and commit new timeframe',
  );
});

test('symbol switch resets time range and commits only the selected symbol', () => {
  assertSourceContains(
    source,
    /const handleSymbolSelect = useCallback[\s\S]*setActiveDateRange\('auto'\)[\s\S]*setCustomDateValue\(null\)[\s\S]*warmChartContextAndCommit\(nextSymbol, chartTimeframe\)/,
    'symbol switch must reset range and commit new symbol',
  );
});

test('symbol and timeframe switching reuse the initialized WebView surface', () => {
  const currentSigStart = source.indexOf('const currentSig = useMemo');
  const currentSigEnd = source.indexOf('useEffect(() => {', currentSigStart);
  assert.notEqual(currentSigStart, -1);
  assert.notEqual(currentSigEnd, -1);
  const currentSigSource = source.slice(currentSigStart, currentSigEnd);

  assertSourceContains(
    source,
    /const chartDataContextSig = useMemo\([\s\S]*`\$\{chartSymbol\}-\$\{normalizeTimeframe\(chartTimeframe\)\}`/,
    'symbol/timeframe must be tracked as a data context separate from the chart shell',
  );
  assert.doesNotMatch(
    currentSigSource,
    /chartSymbol|chartTimeframe/,
    'symbol/timeframe must not force a full WebView init signature rebuild',
  );
  assert.doesNotMatch(
    currentSigSource,
    /displayDecimals/,
    'display precision must update through the WebView bridge instead of reinitializing the chart',
  );
  assertSourceContains(
    source,
    /setDisplayDecimals\(\$\{displayDecimals\}\)/,
    'display precision changes must be pushed to the initialized WebView chart',
  );
});

test('symbol and timeframe switching commits immediately and refreshes the target history context', () => {
  assertSourceContains(
    source,
    /const refreshSelectedChartHistory = useCallback\([\s\S]*liveCandlesEngine\.prefetchHistory\(nextSymbol, nextTimeframe\)[\s\S]*liveCandlesEngine\.refreshHistoryForContext\(nextSymbol, nextTimeframe\)/,
    'fast chart switches must start the selected context prefetch before refreshing an existing target context',
  );
  assertSourceContains(
    source,
    /const warmChartContextAndCommit = useCallback\([\s\S]*\(nextSymbol: string, nextTimeframe: string\)[\s\S]*refreshSelectedChartHistory\(nextSymbol, nextTimeframe\)[\s\S]*setChartSymbol\(nextSymbol\)[\s\S]*setChartTimeframe\(nextTimeframe\)/,
    'chart switch commit must request the selected context history without waiting before changing the active chart context',
  );
  assertSourceContains(
    source,
    /warmChartContextAndCommit\(chartSymbol, nextTimeframe\)/,
    'timeframe switch must commit through the immediate chart context path',
  );
  assertSourceContains(
    source,
    /warmChartContextAndCommit\(nextSymbol, chartTimeframe\)/,
    'symbol switch must commit through the immediate chart context path',
  );
});

test('symbol and timeframe switching full-reloads data and resets the first view', () => {
  assertSourceContains(
    source,
    /const contextChanged = renderedDataContextSigRef\.current !== chartDataContextSig[\s\S]*const updateMode = contextChanged[\s\S]*\? 'full_reload'[\s\S]*: getChartSeriesUpdateMode/,
    'symbol/timeframe changes must force updateChartData on the existing chart surface',
  );
  assertSourceContains(
    source,
    /updateChartData\(\$\{JSON\.stringify\(mapped\)\}, \{ resetVisibleRange: \$\{contextChanged\} \}\)/,
    'symbol/timeframe full reloads must reset the visible range for the newly selected context',
  );
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*renderedDataContextSigRef\.current = '';[\s\S]*clearRenderedMarketPriceLines\(\);[\s\S]*\}, \[chartDataContextSig, clearRenderedMarketPriceLines\]\)/,
    'symbol/timeframe changes must clear stale context bridge state without blanking the canvas',
  );
});

test('symbol and timeframe switching relies on the context reload for the auto viewport', () => {
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*if \(!hasCandles \|\| !webViewReady \|\| !chartCanvasReady\)[\s\S]*if \(activeDateRange === 'auto'\) \{[\s\S]*return;[\s\S]*applyNativeTimeRange\(activeDateRange, customDateValue\)/,
    'automatic range sync must not call the auto recent viewport reset after a symbol/timeframe reload',
  );
  assertSourceContains(
    source,
    /const handleResetChartViewport = useCallback\([\s\S]*applyNativeTimeRange\(activeDateRange, customDateValue\)/,
    'manual viewport reset must still be able to apply the current auto/custom range',
  );
});

test('symbol-specific drawings use a normalized drawing bucket', () => {
  assertSourceContains(
    source,
    /const chartDrawingBucketKey = useMemo\(\(\) => getChartDrawingBucketKey\(chartSymbol\), \[chartSymbol\]\)/,
    'drawing bucket key must be derived from active chart symbol',
  );
  assertSourceContains(
    source,
    /chartDrawingRecordsBySymbol\[chartDrawingBucketKey\] \?\? \[\]/,
    'drawing records must be loaded from the active symbol bucket',
  );
});

test('symbol change recalculates decimals and quote fallback from backend metadata without synthetic spreads', () => {
  const displayDecimalsStart = source.indexOf('const rawDisplayDecimals = useMemo');
  const displayDecimalsEnd = source.indexOf('const sanitizedCandles', displayDecimalsStart);
  assert.notEqual(displayDecimalsStart, -1);
  assert.notEqual(displayDecimalsEnd, -1);
  const displayDecimalsSource = source.slice(displayDecimalsStart, displayDecimalsEnd);

  assertSourceContains(
    displayDecimalsSource,
    /const rawDisplayDecimals = useMemo\([\s\S]*resolveChartDisplayDecimals\(\{[\s\S]*instrumentDigits: chartInstrumentMeta\?\.digits[\s\S]*instrumentPoint: chartInstrumentMeta\?\.point[\s\S]*instrumentTickSize: chartInstrumentMeta\?\.tickSize[\s\S]*liveQuoteDigits: chartLiveQuote\?\.digits[\s\S]*liveQuoteDigitsFromBackend: hasCoherentLiveChartQuote && chartLiveQuoteDigitsSource === 'backend'/,
    'display decimals must react to backend instrument precision metadata and trusted backend quote digits',
  );
  assertSourceOmits(
    displayDecimalsSource,
    /const rawDisplayDecimals = useMemo\([\s\S]*baseSymbol\.includes\('BTC'\)/,
    'display decimals must not use frontend symbol-family precision guesses',
  );
  assertSourceContains(
    source,
    /const \{ bid: chartBid, ask: chartAsk \} = useMemo\([\s\S]*resolveChartTradeButtonQuote\(\{[\s\S]*fallbackBid: latestChartClose,[\s\S]*fallbackAsk: latestChartClose/,
    'chart quote fallback must come from the latest backend chart price when live bid/ask is unavailable',
  );
  assertSourceOmits(
    source,
    /const quoteFallbackSpread =/,
    'chart quote fallback must not invent symbol-family spreads for native bid/ask lines',
  );
});
