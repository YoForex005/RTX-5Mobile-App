import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('quotes tab owns the full watchlist live feed snapshot path', () => {
  const serviceSource = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const tickProcessorSource = readSource('src/api/ws/quotesSocket/tickProcessor.ts');
  const liveQuotesSource = readSource('src/features/quotes/useLiveQuotes.ts');
  const quotesScreenSource = readSource('src/features/quotes/QuotesScreen.tsx');

  const subscribeToSymbolStart = serviceSource.indexOf('public subscribeToSymbol');
  const unsubscribeStart = serviceSource.indexOf('let unsubscribed = false', subscribeToSymbolStart);
  assert.notEqual(subscribeToSymbolStart, -1);
  assert.notEqual(unsubscribeStart, -1);

  const subscribeToSymbolSource = serviceSource.slice(subscribeToSymbolStart, unsubscribeStart);
  assert.match(
    subscribeToSymbolSource,
    /for \(const key of listenerKeys\) \{[\s\S]*bucket\.add\(listener\);[\s\S]*this\.symbolConsumerCounts = applyQuoteSubscriptionDelta/,
  );
  assert.match(subscribeToSymbolSource, /this\.symbolConsumerCounts = applyQuoteSubscriptionDelta/);
  assert.match(subscribeToSymbolSource, /this\.syncActiveSymbols\(\)/);
  assert.doesNotMatch(subscribeToSymbolSource, /this\.send\(\{ type: 'subscribe', symbols: transportSymbols \}\)/);

  assert.match(tickProcessorSource, /const tickEvent: QuoteTickEvent = \{[\s\S]*rawSymbol: normalizedUpdate\.rawSymbol/);
  assert.match(liveQuotesSource, /const uniqueQuoteSymbolKeys = \(symbols: string\[\]\): string\[\] =>\s*Array\.from\(new Set\(symbols\.flatMap\(getSnapshotKeys\)\)\)/);
  assert.match(liveQuotesSource, /export function useLiveQuoteSubscription\(symbol: string, active: boolean\): void \{[\s\S]*quotesWsService\.subscribeToSymbol\(symbol, ingestLiveQuoteTick\)/);
  const watchlistHookStart = liveQuotesSource.indexOf('export function useWatchlistLiveQuotes');
  const snapshotHookStart = liveQuotesSource.indexOf('export function useLiveQuoteSnapshot', watchlistHookStart);
  assert.notEqual(watchlistHookStart, -1);
  assert.notEqual(snapshotHookStart, -1);
  const watchlistHookSource = liveQuotesSource.slice(watchlistHookStart, snapshotHookStart);
  assert.match(watchlistHookSource, /quotesWsService\.addTickListener\(listener\)/);
  assert.match(watchlistHookSource, /ingestLiveQuoteTick\(tick\)/);
  assert.doesNotMatch(watchlistHookSource, /subscribeToSymbol/);
  assert.match(quotesScreenSource, /const quoteStickyFeedActive = quoteRouteActive/);
  assert.match(quotesScreenSource, /const quoteFeedActive = quoteStickyFeedActive/);
  assert.match(quotesScreenSource, /quotesWsService\.setSubscriptions\(quoteFeedSymbols\)/);
  assert.match(
    quotesScreenSource,
    /const liveTrackedSymbols = useWatchlistLiveQuotes\(quoteFeedSymbols, quoteFeedActive\)/,
  );
  assert.doesNotMatch(quotesScreenSource, /useLiveQuoteSubscription\(liveSymbol, feedActive\)/);
});
