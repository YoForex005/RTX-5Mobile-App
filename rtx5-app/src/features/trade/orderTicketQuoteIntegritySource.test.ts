import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/trade/OrderTicketScreen.tsx'),
  'utf8',
);

test('order ticket uses only direct quote bid and ask for displayed prices', () => {
  assert.match(source, /useLiveQuoteSubscription\(symbol, routeQueriesActive\)/);
  assert.match(source, /const BID = typeof liveQuote\?\.bid/);
  assert.match(source, /const ASK = typeof liveQuote\?\.ask/);
  assert.doesNotMatch(source, /useLiveTick|latestClose|syntheticAskOffset/);
});

test('market and pending submissions recheck session feed health and quote integrity', () => {
  assert.match(source, /resolveSessionQuoteActionAvailability\(liveQuote, Date\.now\(\)\)/);
  const marketHandler = source.slice(
    source.indexOf('const handlePlaceOrder'),
    source.indexOf('const queryClient'),
  );
  const pendingHandler = source.slice(
    source.indexOf('const handlePlacePendingOrder'),
    source.indexOf('return (', source.indexOf('const handlePlacePendingOrder')),
  );
  assert.match(marketHandler, /currentQuoteAvailability\.allowed/);
  assert.match(marketHandler, /Market Data Unavailable/);
  assert.match(pendingHandler, /currentQuoteAvailability\.allowed/);
  assert.match(pendingHandler, /Market Data Unavailable/);
  assert.match(source, /disabled=\{tradeActionDisabled \|\| pendingEntryPrice <= 0\}/);
});
