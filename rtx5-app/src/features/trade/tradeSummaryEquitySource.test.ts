import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readTradeSummarySource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/SummaryHeader.tsx'), 'utf8');

test('trade summary keeps equity in expanded details, not the floating pnl header', () => {
  const summarySource = readTradeSummarySource();
  const heroStart = summarySource.indexOf('{/* The Hero: Unrealized P/L */}');
  const detailsStart = summarySource.indexOf('{tradeSummaryDetailsVisible ?');
  const collapsedHeaderSource = summarySource.slice(heroStart, detailsStart);
  const expandedDetailsSource = summarySource.slice(detailsStart);

  assert.notEqual(heroStart, -1);
  assert.notEqual(detailsStart, -1);
  assert.match(collapsedHeaderSource, /\{t\('Floating Profit\/Loss'\)\}/);
  assert.match(collapsedHeaderSource, /\{fmt\.pnlPrecise\(safeFloating\)\} \{accountCurrency\}/);
  assert.doesNotMatch(collapsedHeaderSource, /\{t\('Equity'\)\}/);
  assert.doesNotMatch(collapsedHeaderSource, /\{fmt\.decimal\(safeEquity\)\}/);
  assert.match(expandedDetailsSource, /\{t\('Equity'\)\}[\s\S]*\{fmt\.decimal\(safeEquity\)\}/);
});

test('trade summary renders normalized margin fields and uses the REST summary as fallback', () => {
  const summarySource = readTradeSummarySource();

  assert.match(summarySource, /label=\{t\('Margin'\)\} value=\{fmt\.decimal\(safeMargin\)\}/);
  assert.match(summarySource, /label=\{t\('Free Margin'\)\} value=\{fmt\.decimal\(safeFreeMargin\)\}/);
  assert.match(summarySource, /label=\{t\('Margin Level'\)\} value=\{`\$\{fmt\.decimal\(safeMarginLevel\)\}%`\}/);
  assert.match(summarySource, /floating: restAccountSummary\.profit/);
  assert.match(summarySource, /restTradingAccount \?\? selectedTradingAccount/);
  assert.match(summarySource, /metricFlags: state\.metricFlags/);
});
