import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
  'utf8',
);

test('native chart builds execution history from deals with closed-position fallback', () => {
  assert.match(source, /useChartDealsQuery\(accountLogin,/);
  assert.match(
    source,
    /buildChartTradeHistoryOverlay\(\{[\s\S]*chartSymbol,[\s\S]*chartTimeframe,[\s\S]*candles: overlayMarkerCandles,[\s\S]*openPositions: retainedChartTradeOpenings,[\s\S]*deals: chartDeals,[\s\S]*closedPositions,/,
  );
  assert.match(source, /retainChartTradeOpenings\([\s\S]*chartMarketDataCacheNamespace,[\s\S]*positions/);
  assert.match(source, /refetchClosedPositions\(\)[\s\S]*refetchChartDeals\(\)/);
});

test('inactive chart never seeds a new account scope from the previous session positions', () => {
  const retentionStart = source.indexOf('const chartTradeOpeningRetentionRef');
  const retentionEnd = source.indexOf('const preferencesHydrated', retentionStart);
  assert.notEqual(retentionStart, -1);
  assert.notEqual(retentionEnd, -1);

  const retentionSource = source.slice(retentionStart, retentionEnd);
  const activeFirstGate = /chartRuntimeActive\s*\?\s*positions\s*:\s*(?:\[\]|EMPTY_[A-Z0-9_]+)/;
  const inactiveFirstGate = /!chartRuntimeActive\s*\?\s*(?:\[\]|EMPTY_[A-Z0-9_]+)\s*:\s*positions/;
  assert.ok(
    activeFirstGate.test(retentionSource) || inactiveFirstGate.test(retentionSource),
    'retention must receive no positions while the chart is inactive because its retained array can belong to the prior account',
  );
});

test('trade history follows only its own persisted toggle and stays off Renko', () => {
  assert.match(
    source,
    /chartType === 'renko'[\s\S]*chartDisplay\.showTradeHistory !== true[\s\S]*tradeHistorySegments: EMPTY_CHART_TRADE_HISTORY_SEGMENTS/,
  );
  assert.match(
    source,
    /key: 'showTradeHistory', label: 'Show trade history'/,
  );
});

test('native overlay signature and bridge payload include exact connector geometry', () => {
  assert.match(
    source,
    /const overlayPayload = useMemo\(\(\) => \(\{[\s\S]*tradeHistorySegments: tradeHistoryOverlay\.tradeHistorySegments/,
  );
  assert.match(
    source,
    /overlayTradeHistoryGeometrySignature[\s\S]*fromTime: segment\.fromTime[\s\S]*fromPrice: segment\.fromPrice[\s\S]*toTime: segment\.toTime[\s\S]*toPrice: segment\.toPrice/,
  );
  assert.match(
    source,
    /setChartOverlays\([\s\S]*JSON\.stringify\(latestPayload\)[\s\S]*JSON\.stringify\(chartDataContextSig\)/,
  );
});
