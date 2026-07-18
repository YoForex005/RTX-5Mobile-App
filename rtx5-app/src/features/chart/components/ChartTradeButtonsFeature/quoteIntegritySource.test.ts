import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('native chart quick trades use the fail-closed executable quote policy', () => {
  const component = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  );
  const handler = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
  );

  assert.match(component, /resolveSessionQuoteActionAvailability\(latestQuote\)/);
  assert.match(component, /quoteActionAllowed: quoteActionAvailability\.allowed/);
  assert.match(component, /quoteActionQuote: latestQuote/);
  assert.match(handler, /resolveSessionQuoteActionAvailability\(quoteActionQuoteRef\.current\)/);
  assert.match(handler, /function processNextQueuedTrade\(\)[\s\S]*currentQuoteAvailability[\s\S]*if \(!currentQuoteAvailability\.allowed\)/);
  assert.match(handler, /chartTradeActionDisabled = !isCurrentChartSymbol \|\| !quoteActionAllowed/);
});

test('web chart quick trades never use candle close as order price availability', () => {
  const source = readSource('src/features/chart/ChartScreen.web.tsx');
  const start = source.indexOf('const LiveTradeButtons');
  const end = source.indexOf('// Micro-component:', start + 1);
  const tradeButtons = source.slice(start, end === -1 ? undefined : end);

  assert.match(tradeButtons, /resolveSessionQuoteActionAvailability\(q\)/);
  assert.match(tradeButtons, /disabled=\{isPending \|\| !quoteActionAvailability\.allowed\}/);
  assert.doesNotMatch(tradeButtons, /latestTick|latestClose|\.close/);
});
