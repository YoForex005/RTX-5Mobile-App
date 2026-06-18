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
