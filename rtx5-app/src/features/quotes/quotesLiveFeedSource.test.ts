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

  assert.match(serviceSource, /getSecureItemAsync\(ACTIVE_BROKER_SERVER_URL_KEY\)/);
  assert.match(serviceSource, /private async resolveSocketUrlAsync\(\): Promise<string>/);
  assert.match(serviceSource, /private failedBrokerSocketUrls: Set<string> = new Set\(\)/);
  assert.match(serviceSource, /private resolveBrokerSocketUrl\(serverUrl\?: string \| null\): string/);
  assert.match(serviceSource, /private markBrokerSocketUnavailable\(socketUrl: string, reason: string\): boolean/);
  assert.match(serviceSource, /Falling back to shared feed/);
  assert.match(serviceSource, /this\.scheduleReconnect\(250\)/);
  assert.match(serviceSource, /this\.resolveBrokerSocketUrl\(state\.brokerServerUrl\)/);
  assert.match(serviceSource, /this\.resolveBrokerSocketUrl\(storedServerUrl\)/);
  assert.match(serviceSource, /shouldUseBrokerHostedQuoteFeed\(serverUrl\)/);
  assert.match(serviceSource, /DEFAULT_QUOTES_WS_URL = 'wss:\/\/backend\.orrnn\.com\/ws\/feed'/);
  assert.match(serviceSource, /this\.openResolvedSocket\(nextUrl\)/);
  assert.match(serviceSource, /const QUOTE_WS_RECONNECT_BASE_DELAY_MS = 750/);
  assert.match(serviceSource, /const QUOTE_WS_RECONNECT_MAX_DELAY_MS = 5_000/);
  assert.match(serviceSource, /const QUOTE_WS_RECONNECT_COOLDOWN_MS = 10_000/);
  assert.match(serviceSource, /const QUOTE_WS_SILENT_STALE_MS = 8_000/);
  assert.match(serviceSource, /const QUOTE_WS_WATCHDOG_INTERVAL_MS = 3_000/);
  assert.match(serviceSource, /Math\.min\([\s\S]*QUOTE_WS_RECONNECT_MAX_DELAY_MS[\s\S]*\)/);
  assert.match(serviceSource, /staleFor > QUOTE_WS_SILENT_STALE_MS/);

  const failedBrokerSocketUrlsIndex = serviceSource.indexOf('private failedBrokerSocketUrls');
  const eagerUrlIndex = serviceSource.indexOf('private url = this.resolveSocketUrl()');
  assert.ok(
    failedBrokerSocketUrlsIndex > -1 && eagerUrlIndex > -1 && failedBrokerSocketUrlsIndex < eagerUrlIndex,
    'failedBrokerSocketUrls must initialize before url because resolveSocketUrl reads it during construction',
  );

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
  assert.match(watchlistHookSource, /useRestQuoteSnapshotFallback\(normalizedSymbols, active\)/);
  assert.doesNotMatch(watchlistHookSource, /subscribeToSymbol/);
  assert.match(liveQuotesSource, /apiClient\([\s\S]*`\/quotes\?symbols=\$\{symbolsQuery\}`[\s\S]*isLoggedIn \? \{\} : \{ skipAuth: true, skipRefresh: true \}[\s\S]*\)/);
  assert.match(liveQuotesSource, /asQuoteSnapshotArray\(payload\)\.forEach/);
  assert.match(liveQuotesSource, /const QUOTE_REST_SNAPSHOT_STALE_MS = 2_000/);
  assert.match(liveQuotesSource, /const needsRestQuoteSnapshot = \(symbol: string, now = Date\.now\(\)\): boolean =>/);
  assert.match(liveQuotesSource, /const freshnessAnchor = getQuoteFreshnessAnchor\(snapshot\)/);
  assert.match(liveQuotesSource, /const symbolsNeedingFallback = symbols\.filter\(\(symbol\) => needsRestQuoteSnapshot\(symbol\)\)/);
  assert.match(liveQuotesSource, /await fetchRestQuoteSnapshots\(symbolsNeedingFallback\)/);
  assert.match(liveQuotesSource, /if \(!matchesRequestedSymbol \|\| !needsRestQuoteSnapshot\(symbol\)\)/);
  assert.match(liveQuotesSource, /isLoggedIn \? \{\} : \{ skipAuth: true, skipRefresh: true \}/);
  assert.match(liveQuotesSource, /QUOTE_REST_SNAPSHOT_POLL_MS = 500/);
  assert.match(liveQuotesSource, /WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS = 16/);
  assert.match(quotesScreenSource, /const quoteStickyFeedActive = quoteRouteActive/);
  assert.match(quotesScreenSource, /const quoteFeedActive =\s*quoteStickyFeedActive/);
  assert.match(quotesScreenSource, /quotesWsService\.setSubscriptions\(quoteFeedSymbols\)/);
  assert.match(
    quotesScreenSource,
    /const liveTrackedSymbols = useWatchlistLiveQuotes\(quoteFeedSymbols, quoteFeedActive\)/,
  );
  assert.doesNotMatch(quotesScreenSource, /useLiveQuoteSubscription\(liveSymbol, feedActive\)/);
});
