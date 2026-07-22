import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('native chart gates only one-click execution on the executable quote policy', () => {
  const component = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  );
  const handler = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
  );

  // The full websocket quote carries transport/freshness evidence. The
  // price-only latestQuote object must never be used as executable evidence.
  assert.match(component, /resolveSessionQuoteActionAvailability\(liveQuote\)/);
  assert.match(component, /quoteActionAllowed: quoteActionAvailability\.allowed/);
  assert.match(component, /quoteActionQuote: liveQuote/);
  assert.doesNotMatch(component, /resolveSessionQuoteActionAvailability\(latestQuote\)/);
  assert.doesNotMatch(component, /quoteActionQuote: latestQuote/);
  assert.match(component, /resolveChartTradeButtonDisplayQuote/);
  // Tiles stay pressable when quote is not executable; handler fails closed.
  assert.match(component, /const tradeBlocked = chartTradeActionDisabled \|\| lotInvalid/);
  assert.doesNotMatch(component, /tradeBlocked = chartTradeActionDisabled \|\| lotInvalid \|\| !quoteActionAvailability/);
  assert.match(handler, /resolveSessionQuoteActionAvailability\(quoteActionQuoteRef\.current\)/);
  // Queue drain can skip a same-turn recheck after the tap already validated the quote.
  assert.match(
    handler,
    /function processNextQueuedTrade\(options\?: \{ skipQuoteRecheck\?: boolean \}\)[\s\S]*if \(!options\?\.skipQuoteRecheck\)[\s\S]*currentQuoteAvailability[\s\S]*if \(!currentQuoteAvailability\.allowed\)/,
  );
  assert.match(
    handler,
    /if \(!oneClickAccepted\)[\s\S]*showOrderTicketLaunch\(symbol, 'chart'\)[\s\S]*return;[\s\S]*One-click ON:/,
  );
  assert.match(
    handler,
    /One-click ON:[\s\S]*resolveSessionQuoteActionAvailability\(\s*quoteActionQuoteRef\.current,\s*Date\.now\(\),\s*\)[\s\S]*if \(!currentQuoteAvailability\.allowed\)/,
  );
  assert.doesNotMatch(handler, /if \(!quoteActionAllowed\) \{\s*const currentQuoteAvailability/);
  assert.match(handler, /resolveChartTradeActionDisabled\(\{[\s\S]*isCurrentChartSymbol,[\s\S]*oneClickAccepted,[\s\S]*quoteActionAllowed,/);
  assert.match(handler, /isChartTradeActionVisuallyLocked = \(side: TradeSide\) => isChartTradeActionBusy\(side\)/);
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
