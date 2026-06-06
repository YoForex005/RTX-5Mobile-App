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

test('symbol and timeframe switching invalidate WebView init signature', () => {
  assertSourceContains(
    source,
    /const currentSig = useMemo\([\s\S]*`\$\{chartSymbol\}-\$\{normalizeTimeframe\(chartTimeframe\)\}/,
    'currentSig must include chart symbol and normalized timeframe',
  );
});

test('symbol and timeframe switching commits immediately and warms history in the background', () => {
  assertSourceContains(
    source,
    /const chartSwitchCommitSeqRef = useRef\(0\)/,
    'fast chart switches must keep a sequence for stale background prefetch diagnostics',
  );
  assertSourceContains(
    source,
    /const warmChartContextAndCommit = useCallback\([\s\S]*\(nextSymbol: string, nextTimeframe: string\)[\s\S]*void prefetchChartTimeframeHistory\(nextSymbol, nextTimeframe\)[\s\S]*setChartSymbol\(nextSymbol\)[\s\S]*setChartTimeframe\(nextTimeframe\)/,
    'chart switch commit must not wait for history before changing the active chart context',
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

test('symbol and timeframe switching clear stale canvas readiness before reinit', () => {
  assertSourceContains(
    source,
    /if \(lastInitSigRef\.current !== currentSig\) \{[\s\S]*chartInitializedRef\.current = false[\s\S]*setChartCanvasReady\(false\)[\s\S]*setChartPlotArea\(null\)/,
    'chart config changes must clear the stale WebView ready state',
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

test('symbol change recalculates decimals and spread fallback from active symbol metadata', () => {
  const displayDecimalsStart = source.indexOf('const displayDecimals = useMemo');
  const displayDecimalsEnd = source.indexOf('const liveChartPrice', displayDecimalsStart);
  assert.notEqual(displayDecimalsStart, -1);
  assert.notEqual(displayDecimalsEnd, -1);
  const displayDecimalsSource = source.slice(displayDecimalsStart, displayDecimalsEnd);

  assertSourceContains(
    displayDecimalsSource,
    /const displayDecimals = useMemo\([\s\S]*resolveChartDisplayDecimals\(\{[\s\S]*instrumentDigits: chartInstrumentMeta\?\.digits[\s\S]*liveQuoteDigits: chartLiveQuote\?\.digits[\s\S]*liveQuoteDigitsFromBackend: hasLiveChartQuote && chartLiveQuoteDigitsSource === 'backend'/,
    'display decimals must react to backend instrument digits and trusted backend quote digits',
  );
  assertSourceOmits(
    displayDecimalsSource,
    /const displayDecimals = useMemo\([\s\S]*baseSymbol\.includes\('BTC'\)/,
    'display decimals must not use frontend symbol-family precision guesses',
  );
  assertSourceContains(
    source,
    /const quoteFallbackSpread =[\s\S]*baseSymbol\.includes\('BTC'\)[\s\S]*baseSymbol\.includes\('XAU'\)/,
    'fallback spread must react to active base symbol',
  );
});
