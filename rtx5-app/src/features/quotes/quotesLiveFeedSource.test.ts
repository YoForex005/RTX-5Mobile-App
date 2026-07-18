import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('quotes tab owns the full watchlist live feed snapshot path', () => {
  const serviceSource = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const reconnectBackoffSource = readSource('src/api/ws/reconnectBackoff.ts');
  const tickProcessorSource = readSource('src/api/ws/quotesSocket/tickProcessor.ts');
  const queryWebsocketSource = readSource('src/query/websocket.ts');
  const liveQuotesSource = readSource('src/features/quotes/useLiveQuotes.ts');
  const quotesScreenSource = readSource('src/features/quotes/QuotesScreen.tsx');

  const subscribeToSymbolStart = serviceSource.indexOf('public subscribeToSymbol');
  const unsubscribeStart = serviceSource.indexOf('let unsubscribed = false', subscribeToSymbolStart);
  assert.notEqual(subscribeToSymbolStart, -1);
  assert.notEqual(unsubscribeStart, -1);

  assert.match(serviceSource, /import \{ brokerApi \} from '..\/..\/brokerApi'/);
  assert.match(
    serviceSource,
    /private async resolveSocketUrlAsync\(\): Promise<\{[\s\S]*url: string;[\s\S]*identity: ActiveBrokerSessionIdentity;[\s\S]*\}>/,
  );
  assert.doesNotMatch(serviceSource, /private failedBrokerSocketUrls: Set<string> = new Set\(\)/);
  assert.match(serviceSource, /brokerApi\.getQuoteWebSocketUrl\(\)/);
  assert.match(serviceSource, /private markBrokerSocketUnavailable\(socketUrl: string, reason: string\): boolean/);
  assert.match(serviceSource, /private shouldStayOnBrokerMarketSocket\(socketUrl: string\): boolean/);
  assert.match(serviceSource, /Retrying the selected broker market socket/);
  assert.match(
    serviceSource,
    /const capture = captureActiveBrokerSession\(\);[\s\S]*if \(!capture\) \{[\s\S]*this\.pendingBrokerMarketBlockReason = 'logged_out';[\s\S]*throw new Error\('No active broker session is available\.'\)/,
  );
  assert.match(serviceSource, /Market data requires a logged-in broker session\. Skipping public feed fallback/);
  assert.match(serviceSource, /redactMarketSocketUrl\(socketUrl\)/);
  assert.match(serviceSource, /createTickChannel = \(symbol: string\): string => `ticks\.\$\{symbol\}`/);
  assert.match(serviceSource, /type: 'subscribe', symbols: subscribeSymbols/);
  assert.match(serviceSource, /type: 'unsubscribe', symbols: unsubscribeSymbols/);
  assert.match(serviceSource, /buildCandleChannelSubscriptionMessages\('subscribe'/);
  assert.doesNotMatch(serviceSource, /DEFAULT_QUOTES_WS_URL|EXPO_PUBLIC_QUOTES_WS_URL/);
  assert.match(serviceSource, /this\.openResolvedSocket\(resolved\)/);
  assert.match(serviceSource, /if \(!isActiveBrokerSessionCurrent\(identity\)\)/);
  assert.match(
    serviceSource,
    /public acceptNormalizedTick\([\s\S]*evaluateQuoteStreamTick\([\s\S]*this\.lastAcceptedTickBySymbol\.set/,
  );
  assert.match(serviceSource, /AppState\.addEventListener\('change'/);
  assert.match(serviceSource, /resolveNextReconnectAttempt\(\{[\s\S]*currentAttempt: this\.reconnectAttempts/);
  assert.match(reconnectBackoffSource, /const upperBound = Math\.min\(safeCap, safeBase \* 2 \*\* safeAttempt\)/);
  assert.match(reconnectBackoffSource, /return Math\.floor\(sample \* upperBound\)/);
  assert.match(serviceSource, /const QUOTE_WS_RECONNECT_BASE_DELAY_MS = 750/);
  assert.match(serviceSource, /const QUOTE_WS_RECONNECT_MAX_DELAY_MS = 5_000/);
  assert.match(serviceSource, /const QUOTE_WS_RECONNECT_COOLDOWN_MS = 10_000/);
  assert.match(serviceSource, /const QUOTE_WS_SILENT_STALE_MS = 8_000/);
  assert.match(serviceSource, /const QUOTE_WS_WATCHDOG_INTERVAL_MS = 3_000/);
  assert.match(serviceSource, /const QUOTE_WS_INTERACTION_RECONNECT_DEFER_MS = 2_500/);
  assert.match(serviceSource, /private reconnectDeferredUntil = 0/);
  assert.match(serviceSource, /public deferReconnectForInteraction\(durationMs = QUOTE_WS_INTERACTION_RECONNECT_DEFER_MS\): void \{/);
  assert.match(serviceSource, /public resumeReconnectAfterInteraction\(\): void \{[\s\S]*this\.reconnectDeferredUntil = 0;[\s\S]*this\.clearReconnectTimer\(\);[\s\S]*this\.connect\(\);/);
  assert.match(serviceSource, /private getInteractionReconnectDelay\(now = Date\.now\(\)\): number \{/);
  assert.match(serviceSource, /const deferredMs = this\.getInteractionReconnectDelay\(\);[\s\S]*this\.scheduleReconnect\(deferredMs\);[\s\S]*return;/);
  assert.match(serviceSource, /const resolvedDelayMs = Math\.max\(delayMs, this\.getInteractionReconnectDelay\(\)\)/);
  assert.match(reconnectBackoffSource, /Math\.min\([\s\S]*capMs[\s\S]*\)/);
  assert.match(serviceSource, /staleFor > QUOTE_WS_SILENT_STALE_MS/);
  assert.match(serviceSource, /In logged-in broker mode, reconnect only to the selected broker[\s\S]*\/ws\/v2 market socket/);
  assert.match(
    serviceSource,
    /const socketUrl = this\.url;[\s\S]*markBrokerSocketUnavailable\(socketUrl, 'silent after open'\)[\s\S]*return;[\s\S]*Silent TCP drop detected[\s\S]*this\.triggerInvisibleReconnect\(\)/,
  );

  const eagerUrlIndex = serviceSource.indexOf("private url = ''");
  assert.ok(eagerUrlIndex > -1, 'quote socket URL should start empty and resolve from the authenticated broker session');

  const subscribeToSymbolSource = serviceSource.slice(subscribeToSymbolStart, unsubscribeStart);
  assert.match(
    subscribeToSymbolSource,
    /for \(const key of listenerKeys\) \{[\s\S]*bucket\.add\(listener\);[\s\S]*this\.symbolConsumerCounts = applyQuoteSubscriptionDelta/,
  );
  assert.match(subscribeToSymbolSource, /this\.symbolConsumerCounts = applyQuoteSubscriptionDelta/);
  assert.match(subscribeToSymbolSource, /this\.syncActiveSymbols\(\)/);
  assert.doesNotMatch(subscribeToSymbolSource, /this\.send\(\{ type: 'subscribe', symbols: transportSymbols \}\)/);
  assert.match(
    serviceSource,
    /public emitSymbolTick\(symbol: string, tick: QuoteTickEvent\): void \{[\s\S]*const listenerKeys = new Set\(\[[\s\S]*resolveQuoteListenerKeys\(symbol\)[\s\S]*resolveQuoteListenerKeys\(tick\.symbol\)[\s\S]*tick\.rawSymbol \? resolveQuoteListenerKeys\(tick\.rawSymbol\) : \[\][\s\S]*const listeners = new Set<SymbolTickListener>\(\)/,
  );
  assert.match(tickProcessorSource, /bridge\.emitSymbolTick\(normalizedUpdate\.rawSymbol \|\| normalizedUpdate\.symbol, tickEvent\)/);
  assert.doesNotMatch(tickProcessorSource, /if \(normalizedUpdate\.rawSymbol !== normalizedUpdate\.symbol\) \{[\s\S]*bridge\.emitSymbolTick\(normalizedUpdate\.symbol, tickEvent\)/);

  assert.match(tickProcessorSource, /const tickEvent: QuoteTickEvent = \{[\s\S]*rawSymbol: normalizedUpdate\.rawSymbol/);
  assert.match(tickProcessorSource, /transport: 'websocket'/);
  assert.match(tickProcessorSource, /bridge\.acceptNormalizedTick\?\.\(raw, normalized\.update, receivedAt\) === false/);
  assert.match(
    liveQuotesSource,
    /captureActiveBrokerSession,[\s\S]*getActiveBrokerSessionIdentity,[\s\S]*isActiveBrokerSessionCurrent/,
  );
  assert.match(
    queryWebsocketSource,
    /captureActiveBrokerSession,[\s\S]*getActiveBrokerSessionIdentity,[\s\S]*isActiveBrokerSessionCurrent/,
  );
  assert.match(queryWebsocketSource, /const activeSession = useActiveBrokerQuerySession\(\)/);
  assert.match(queryWebsocketSource, /scheduledCommitProvenanceRef/);
  assert.match(queryWebsocketSource, /scheduleQuoteCommit\(effectProvenance\)/);
  assert.match(queryWebsocketSource, /scheduleCommit\(effectProvenance\)/);
  assert.match(queryWebsocketSource, /commitQuoteSnapshotIfSessionCurrent\(scheduledProvenance/);
  assert.match(queryWebsocketSource, /const LIVE_SYMBOL_REST_DIRECT_TICK_SUPPRESS_MS = 2_000/);
  assert.match(queryWebsocketSource, /const hasRecentDirectSymbolTick = \(entry: RestQuoteFallbackEntry/);
  assert.match(queryWebsocketSource, /if \(hasRecentDirectSymbolTick\(entry\)\) \{[\s\S]*return;/);
  assert.match(
    queryWebsocketSource,
    /const sessionCapture = captureActiveBrokerSession\(\);[\s\S]*if \(!sessionCapture\) \{[\s\S]*return;[\s\S]*\}[\s\S]*const sessionIdentity = getActiveBrokerSessionIdentity\(sessionCapture\.session\)/,
  );
  assert.match(
    queryWebsocketSource,
    /if \(!selectedTick\) \{[\s\S]*return;[\s\S]*\}[\s\S]*requestGeneration !== liveQuoteRuntimeGeneration[\s\S]*!isActiveBrokerSessionCurrent\(sessionIdentity\)[\s\S]*hasRecentDirectSymbolTick\(entry\)[\s\S]*publishQuoteTickToSharedStores\(selectedTick\)/,
  );
  assert.match(queryWebsocketSource, /directTickAnchors: Map<LiveSymbolQuoteListener, LiveSymbolDirectTickAnchor>/);
  assert.match(queryWebsocketSource, /const subscribeLiveSymbolRestQuoteFallback = \([\s\S]*getDirectTickAt\?: LiveSymbolDirectTickAnchor/);
  assert.match(queryWebsocketSource, /const wsListener: LiveSymbolQuoteListener = \(tick\) => \{[\s\S]*directQuoteTickAtRef\.current = Date\.now\(\);[\s\S]*transport: 'websocket'/);
  assert.match(queryWebsocketSource, /const restListener: LiveSymbolQuoteListener = applyQuoteTick/);
  assert.match(queryWebsocketSource, /subscribeLiveSymbolRestQuoteFallback\([\s\S]*\(\) => directQuoteTickAtRef\.current/);
  assert.match(liveQuotesSource, /const uniqueQuoteSymbolKeys = \(symbols: string\[\]\): string\[\] =>\s*Array\.from\(new Set\(symbols\.flatMap\(getSnapshotKeys\)\)\)/);
  assert.match(liveQuotesSource, /const notifySymbolImmediately = \(symbol: string\): void => \{[\s\S]*pendingNotifySymbols\.delete\(symbol\);[\s\S]*notifySymbol\(symbol\);[\s\S]*\}/);
  assert.match(liveQuotesSource, /export const ingestLiveQuoteTick = \(tick: QuoteTickEvent, notifyImmediately = true\): void =>/);
  assert.match(liveQuotesSource, /scheduleSymbolNotification\(scopedKey, notifyImmediately\)/);
  assert.match(liveQuotesSource, /export function useLiveQuoteSubscription\(symbol: string, active: boolean\): void \{[\s\S]*quotesWsService\.subscribeToSymbol\(symbol, \(tick\) => \{[\s\S]*transport: 'websocket'/);
  const watchlistHookStart = liveQuotesSource.indexOf('export function useWatchlistLiveQuotes');
  const snapshotHookStart = liveQuotesSource.indexOf('export function useLiveQuoteSnapshot', watchlistHookStart);
  assert.notEqual(watchlistHookStart, -1);
  assert.notEqual(snapshotHookStart, -1);
  const watchlistHookSource = liveQuotesSource.slice(watchlistHookStart, snapshotHookStart);
  assert.match(watchlistHookSource, /const subscriptionSymbols = useMemo\(/);
  assert.match(watchlistHookSource, /quotesWsService\.subscribeToSymbol\(symbol, listener\)/);
  assert.match(watchlistHookSource, /unsubscribers\.forEach\(\(unsubscribe\) => unsubscribe\(\)\)/);
  assert.match(watchlistHookSource, /ingestLiveQuoteTick\(\{ \.\.\.tick, transport: 'websocket' \}, true\)/);
  assert.match(watchlistHookSource, /useRestQuoteSnapshotRepair\([\s\S]*normalizedSymbols,[\s\S]*options\?\.restFallbackActive \?\? active,[\s\S]*cacheNamespace/);
  assert.match(watchlistHookSource, /return active && cacheNamespace \? subscriptionSymbols : \[\]/);
  assert.doesNotMatch(watchlistHookSource, /addTickListener/);
  assert.match(liveQuotesSource, /export const subscribeLiveQuoteSnapshots = \(/);
  assert.match(
    liveQuotesSource,
    /subscribeLiveQuoteSnapshots[\s\S]*uniqueQuoteSymbolKeys\(symbols\)[\s\S]*subscribeSnapshot\(symbol, listener\)/,
  );
  assert.match(liveQuotesSource, /export const getLiveQuoteFreshnessAnchorForSymbols = \(symbols: string\[\]\): number =>/);
  assert.match(
    liveQuotesSource,
    /getLiveQuoteFreshnessAnchorForSymbols[\s\S]*hasDisplayableLiveQuotePrice\(snapshot\)[\s\S]*getQuoteFreshnessAnchor\(snapshot\)/,
  );
  assert.match(liveQuotesSource, /export function useLiveQuoteFreshnessAnchor\(symbols: string\[\], active: boolean\): number \{/);
  assert.match(
    liveQuotesSource,
    /useLiveQuoteFreshnessAnchor[\s\S]*return subscribeLiveQuoteSnapshots\(normalizedSymbols, listener\)[\s\S]*return getLiveQuoteFreshnessAnchorForSymbols\(normalizedSymbols\)/,
  );
  assert.match(liveQuotesSource, /apiClient\(`\/quotes\?symbols=\$\{symbolsQuery\}`\)/);
  assert.match(
    liveQuotesSource,
    /const sessionCapture = captureActiveBrokerSession\(\);[\s\S]*if \(!sessionCapture\) \{[\s\S]*return;[\s\S]*\}[\s\S]*const sessionIdentity = getActiveBrokerSessionIdentity\(sessionCapture\.session\)/,
  );
  assert.match(liveQuotesSource, /!isActiveBrokerSessionCurrent\(sessionIdentity\)/);
  assert.match(liveQuotesSource, /asQuoteSnapshotArray\(payload\)\.forEach/);
  assert.match(liveQuotesSource, /const QUOTE_REST_SNAPSHOT_STALE_MS = 2_000/);
  assert.match(liveQuotesSource, /const needsRestQuoteSnapshot = \(symbol: string, now = Date\.now\(\)\): boolean =>/);
  assert.match(liveQuotesSource, /const freshnessAnchor = getQuoteFreshnessAnchor\(snapshot\)/);
  assert.match(liveQuotesSource, /const symbolsNeedingFallback = symbols\.filter\(\(symbol\) => needsRestQuoteSnapshot\(symbol\)\)/);
  assert.match(liveQuotesSource, /await fetchRestQuoteSnapshots\(symbolsNeedingFallback, requestGeneration\)/);
  // Volume backfill: the REST /quotes snapshot is the lone volume source, so a
  // fresh-priced symbol must still adopt its volume (no "Vol: --" lag on open)
  // instead of dropping the whole payload behind the price-freshness guard.
  assert.match(
    liveQuotesSource,
    /if \(isRestQuotePriceStale\(symbol\)\) \{[\s\S]*ingestRestQuoteSnapshot\(symbol, snapshot\)[\s\S]*\} else \{[\s\S]*ingestRestQuoteVolumeOnly\(symbol, snapshot\)/,
  );
  assert.match(liveQuotesSource, /const ingestRestQuoteVolumeOnly = \(requestedSymbol: string, payload: unknown\): void =>/);
  assert.match(liveQuotesSource, /return !hasBackendQuoteVolume\(resolveSnapshot\(symbol\)\)/);
  assert.doesNotMatch(liveQuotesSource, /skipAuth: true/);
  assert.doesNotMatch(liveQuotesSource, /QUOTE_REST_SNAPSHOT_POLL_MS|setInterval\s*\(/);
  assert.doesNotMatch(queryWebsocketSource, /setInterval\s*\(/);
  assert.doesNotMatch(queryWebsocketSource, /quotes as mockQuotes/);
  assert.match(liveQuotesSource, /transport: 'rest_snapshot'[\s\S]*tradable: false/);
  assert.match(liveQuotesSource, /WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS = 16/);
  assert.match(liveQuotesSource, /let snapshotNotificationPauseDepth = 0/);
  assert.match(liveQuotesSource, /export const areLiveQuoteSnapshotNotificationsPaused = \(\): boolean =>/);
  assert.match(liveQuotesSource, /export const pauseLiveQuoteSnapshotNotifications = \(/);
  assert.match(liveQuotesSource, /if \(snapshotNotificationPauseDepth > 0\) \{[\s\S]*pendingNotifySymbols\.add\(symbol\);[\s\S]*return;[\s\S]*\}/);
  assert.match(liveQuotesSource, /cancelled \|\| areLiveQuoteSnapshotNotificationsPaused\(\)/);
  // Quote display caches are bound to the immutable session namespace and are
  // memory-only; a symbol-only persisted cache could leak broker A into B.
  assert.match(liveQuotesSource, /captureActiveBrokerSession\(\)\?\.session\.cacheNamespace/);
  assert.match(liveQuotesSource, /const scopeQuoteSnapshotKey = \(symbolKey: string\): string =>/);
  assert.doesNotMatch(liveQuotesSource, /AsyncStorage|QUOTE_VOLUME_CACHE_STORAGE_KEY|loadVolumeCache/);
  assert.match(quotesScreenSource, /volumeLabel\(item\.volume \?\? item\.cachedVolume\)/);
  assert.match(quotesScreenSource, /const QUOTE_ROW_HEIGHT = 88/);
  assert.match(quotesScreenSource, /const QUOTE_ROW_SIMPLE_HEIGHT = 64/);
  assert.match(quotesScreenSource, /const getQuoteItemLayout = useCallback/);
  assert.match(quotesScreenSource, /getItemLayout=\{getQuoteItemLayout\}/);
  assert.doesNotMatch(quotesScreenSource, /const rawLastPrice = item\.close \?\? item\.last/);
  assert.doesNotMatch(quotesScreenSource, /\{t\('Last'\)\}:/);
  assert.match(quotesScreenSource, /const quoteStickyFeedActive = quoteCatalogActive && isLoggedIn/);
  assert.doesNotMatch(quotesScreenSource, /useFeedStatusActiveSymbols/);
  assert.match(quotesScreenSource, /const feedAwareSymbols = apiSymbols/);
  assert.match(quotesScreenSource, /quotesWsService\.setSubscriptions\(quoteFeedSymbols\)/);
  assert.match(
    quotesScreenSource,
    /useWatchlistLiveQuotes\(quoteFeedSymbols, quoteStickyFeedActive, \{[\s\S]*restFallbackActive: quoteRestFallbackActive,[\s\S]*\}\)/,
  );
  assert.match(quotesScreenSource, /const quoteRestFallbackActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesScreenSource, /pauseLiveQuoteSnapshotNotifications/);
  assert.match(quotesScreenSource, /quotesWsService\.deferReconnectForInteraction\?\.\(durationMs\)/);
  assert.match(quotesScreenSource, /quotesWsService\.resumeReconnectAfterInteraction\?\.\(\)/);
  assert.match(quotesScreenSource, /pauseQuoteSheetFeed\(routeChange \? QUOTE_SHEET_ROUTE_FEED_PAUSE_MS : QUOTE_SHEET_OPTION_FEED_PAUSE_MS\)/);
  assert.match(quotesScreenSource, /const handleSymbolPressIn = useCallback\([\s\S]*pauseQuoteSheetFeed\(\)/);
  assert.match(quotesScreenSource, /liveUpdatesActive=\{quoteStickyFeedActive\}/);
  assert.match(quotesScreenSource, /<TickCounter[\s\S]*active=\{quoteStickyFeedActive\}[\s\S]*symbols=\{quoteFeedSymbols\}/);
  assert.match(quotesScreenSource, /areLiveQuoteSnapshotNotificationsPaused\(\)/);
  assert.doesNotMatch(quotesScreenSource, /quotesActionSheetOpen|quoteSheetTouchPending|quoteSheetInteractionBusy|quoteVisibleFeedActive/);
  assert.doesNotMatch(quotesScreenSource, /const quoteFeedActive\s*=/);
  assert.doesNotMatch(quotesScreenSource, /useSidebarQuoteFeedPaused|SIDEBAR_QUOTE_FEED_PAUSE/);
  assert.match(quotesScreenSource, /const QUOTE_SPEED_SAMPLE_INTERVAL_MS = 250/);
  assert.match(quotesScreenSource, /const QUOTE_SPEED_WINDOW_MS = 1_000/);
  assert.match(quotesScreenSource, /const trackedSymbols = useMemo\([\s\S]*normalizeQuoteSymbolKey/);
  assert.match(quotesScreenSource, /const tickTimesRef = useRef<number\[\]>\(\[\]\)/);
  assert.match(quotesScreenSource, /tickTimesRef\.current\.push\(ts\)/);
  assert.match(quotesScreenSource, /quotesWsService\.subscribeToSymbol\(symbol, listener\)/);
  assert.match(quotesScreenSource, /unsubscribers\.forEach\(\(unsubscribe\) => unsubscribe\(\)\)/);
  const tickCounterSource = quotesScreenSource.slice(quotesScreenSource.indexOf('function TickCounter'));
  assert.doesNotMatch(tickCounterSource, /quotesWsService\.addTickListener\(listener\)/);
  assert.doesNotMatch(tickCounterSource, /quotesWsService\.removeTickListener\(listener\)/);
  assert.match(quotesScreenSource, /Date\.now\(\) - QUOTE_SPEED_WINDOW_MS/);
  assert.match(quotesScreenSource, /setTps\(Math\.max\(0, tickTimesRef\.current\.length\)\)/);
  assert.match(quotesScreenSource, /const last = lastTickAtRef\.current/);
  assert.doesNotMatch(quotesScreenSource, /snapshotTimesRef|latestSnapshotAtRef|visibleUpdateCount/);
  assert.doesNotMatch(quotesScreenSource, /lastSampledStateTicks|stateTickDelta|useTradingState\.getState\(\)\.tickCount/);
  assert.doesNotMatch(quotesScreenSource, /useLiveQuoteSubscription\(liveSymbol, feedActive\)/);
});
