/**
 * High-frequency WebSocket service delivering minimal-latency Bid/Ask quote ticks.
 * Syncs directly into a Zustand store, aggregating batches via requestAnimationFrame for performance.
 *
 * Originally a single 800-line file; split for the 500-line ceiling. Tick
 * normalization lives in `tickProcessor.ts`, the rAF/setTimeout flush
 * pipeline in `flushPipeline.ts`. The class below owns connection state,
 * subscription bookkeeping, reconnect strategy, and listener fan-out.
 */
import { AppState, NativeEventSubscription } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import {
  buildBrokerWsUrl,
  shouldUseBrokerHostedQuoteFeed,
} from '../../brokerRouting';
import {
  ACTIVE_BROKER_ID_KEY,
  ACTIVE_BROKER_LOGO_URL_KEY,
  ACTIVE_BROKER_SERVER_URL_KEY,
} from '../../../state/brokerSessionStorage';
import { useUserPreferences } from '../../../state/userPreferences';
import { getSecureItemAsync } from '../../../utils/secureStorage';
import { recordUiFeedGap } from '../../../dev/uiInteractionDiagnostics';
import {
  applyQuoteSubscriptionDelta,
  buildActiveQuoteSymbols,
  expandQuoteTransportSymbols,
  resolveQuoteTransportSymbols,
} from '../quoteSubscriptionState';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../../domain/symbols';
import type { QuoteTickEvent } from '../quoteTickNormalizer';
import {
  cancelFlush,
  flushUpdates as flushUpdatesImpl,
  scheduleFlush,
  type FlushPipelineState,
} from './flushPipeline';
import {
  processIncomingPayload,
  type TickProcessorBridge,
} from './tickProcessor';
import type { GlobalTickListener, SymbolTickListener } from './types';

const shouldLogCandleDiagnostics = (): boolean =>
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CANDLE_FEED === 'true';

const QUOTE_WS_MAX_RECONNECT_ATTEMPTS = 20;
const QUOTE_WS_RECONNECT_BASE_DELAY_MS = 750;
const QUOTE_WS_RECONNECT_MAX_DELAY_MS = 5_000;
const QUOTE_WS_RECONNECT_COOLDOWN_MS = 10_000;
const QUOTE_WS_SILENT_STALE_MS = 8_000;
const QUOTE_WS_WATCHDOG_INTERVAL_MS = 3_000;
const DEFAULT_QUOTES_WS_URL = 'wss://backend.orrnn.com/ws/feed';

const resolveQuoteListenerKeys = (symbol: string): string[] => {
  const rawKey = normalizeQuoteSymbolKey(symbol);
  const baseKey = normalizeSymbol(symbol);
  return Array.from(new Set([rawKey, baseKey].filter(Boolean)));
};

export class QuotesWebSocketService implements TickProcessorBridge, FlushPipelineState {
  private static instance: QuotesWebSocketService;
  private ws: WebSocket | null = null;
  private url = this.resolveSocketUrl();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = QUOTE_WS_MAX_RECONNECT_ATTEMPTS;
  private reconnectDelay = QUOTE_WS_RECONNECT_BASE_DELAY_MS;
  private reconnectCooldownMs = QUOTE_WS_RECONNECT_COOLDOWN_MS;
  private isConnected = false;
  private shouldReconnect = false;
  private isResolvingSocketUrl = false;

  private activeSymbols: Set<string> = new Set();
  private stickySymbols: Set<string> = new Set();
  private symbolConsumerCounts: Map<string, number> = new Map();
  private storeConsumerCounts: Map<string, number> = new Map();
  /** @internal Used by the flush pipeline. */
  public pendingUpdates: Map<string, any> = new Map();
  /** @internal Used by the flush pipeline. */
  public flushScheduled = false;
  /** @internal Used by the flush pipeline. */
  public flushAnimationFrame: number | null = null;
  /** @internal Used by the flush pipeline. */
  public flushTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private lastMessageAt: number = Date.now();
  private lastRecordedFeedGapAt: number = 0;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private tickListeners: Set<GlobalTickListener> = new Set();
  // Per-symbol listeners — fire synchronously for each parsed tick, bypassing
  // the global Zustand state pipeline. This is the canonical path for live
  // bid/ask UI on the Quotes screen because it survives JS-thread throttling
  // that can stall the rAF/setTimeout-driven `flushUpdates` queue under load.
  private symbolListeners: Map<string, Set<SymbolTickListener>> = new Map();
  private diagnosticLogCounts: Map<string, number> = new Map();

  private constructor() {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && this.shouldReconnect && this.hasActiveDemand()) {
        console.log('[Quotes WS] App wake up detected. Reconnecting feed...');
        this.triggerInvisibleReconnect();
      }
    });
  }

  private triggerInvisibleReconnect() {
    if (!this.shouldReconnect || !this.hasActiveDemand()) {
      return;
    }

    this.clearReconnectTimer();
    this.clearNetInfoListener();
    this.reconnectAttempts = 0;
    this.teardownSocket();
    this.scheduleReconnect(500);
  }

  public static getInstance(): QuotesWebSocketService {
    if (!QuotesWebSocketService.instance) {
      QuotesWebSocketService.instance = new QuotesWebSocketService();
    }
    return QuotesWebSocketService.instance;
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  private resolveSocketUrl(): string {
    if (process.env.EXPO_PUBLIC_QUOTES_WS_URL) {
      return process.env.EXPO_PUBLIC_QUOTES_WS_URL;
    }

    const brokerServerUrl = useUserPreferences.getState().brokerServerUrl;
    return shouldUseBrokerHostedQuoteFeed(brokerServerUrl)
      ? buildBrokerWsUrl(brokerServerUrl, '/ws/feed', DEFAULT_QUOTES_WS_URL)
      : DEFAULT_QUOTES_WS_URL;
  }

  private async resolveSocketUrlAsync(): Promise<string> {
    if (process.env.EXPO_PUBLIC_QUOTES_WS_URL) {
      return process.env.EXPO_PUBLIC_QUOTES_WS_URL;
    }

    const state = useUserPreferences.getState();
    if (state.brokerServerUrl) {
      return shouldUseBrokerHostedQuoteFeed(state.brokerServerUrl)
        ? buildBrokerWsUrl(state.brokerServerUrl, '/ws/feed', DEFAULT_QUOTES_WS_URL)
        : DEFAULT_QUOTES_WS_URL;
    }

    const [storedBrokerId, storedServerUrl, storedLogoUrl] = await Promise.all([
      getSecureItemAsync(ACTIVE_BROKER_ID_KEY).catch(() => ''),
      getSecureItemAsync(ACTIVE_BROKER_SERVER_URL_KEY).catch(() => ''),
      getSecureItemAsync(ACTIVE_BROKER_LOGO_URL_KEY).catch(() => ''),
    ]);

    if (!storedServerUrl) {
      return DEFAULT_QUOTES_WS_URL;
    }

    const latestState = useUserPreferences.getState();
    if (!latestState.brokerServerUrl) {
      latestState.setBrokerConnection(
        latestState.brokerId || storedBrokerId || '',
        storedServerUrl,
        latestState.brokerLogoUrl || storedLogoUrl || '',
      );
    }

    return shouldUseBrokerHostedQuoteFeed(storedServerUrl)
      ? buildBrokerWsUrl(storedServerUrl, '/ws/feed', DEFAULT_QUOTES_WS_URL)
      : DEFAULT_QUOTES_WS_URL;
  }

  public addTickListener(listener: GlobalTickListener): void {
    this.tickListeners.add(listener);
    this.logCandleFeed('tick_listener_added', { listeners: this.tickListeners.size }, 10);
  }

  public removeTickListener(listener: GlobalTickListener): void {
    this.tickListeners.delete(listener);
    this.logCandleFeed('tick_listener_removed', { listeners: this.tickListeners.size }, 10);
  }

  /**
   * Subscribe to ticks for a specific symbol with synchronous delivery.
   *
   * This is the canonical live-bid/ask path for the Quotes screen. Each parsed
   * tick is emitted to the symbol's listeners immediately — there's no queue,
   * no rAF, no setTimeout, and no Zustand setState in between.
   *
   * Also takes care of demand-counting so the underlying socket subscription
   * is opened/closed automatically when the first/last consumer arrives/leaves.
   */
  public subscribeToSymbol(symbol: string, listener: SymbolTickListener): () => void {
    const listenerKeys = resolveQuoteListenerKeys(symbol);
    const transportSymbols = resolveQuoteTransportSymbols(symbol);
    if (listenerKeys.length === 0 || transportSymbols.length === 0) {
      return () => {};
    }

    for (const key of listenerKeys) {
      let bucket = this.symbolListeners.get(key);
      if (!bucket) {
        bucket = new Set();
        this.symbolListeners.set(key, bucket);
      }
      bucket.add(listener);
    }

    this.symbolConsumerCounts = applyQuoteSubscriptionDelta(this.symbolConsumerCounts, transportSymbols, 1);
    this.syncActiveSymbols();

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      for (const key of listenerKeys) {
        const set = this.symbolListeners.get(key);
        if (set) {
          set.delete(listener);
          if (set.size === 0) {
            this.symbolListeners.delete(key);
          }
        }
      }
      this.symbolConsumerCounts = applyQuoteSubscriptionDelta(this.symbolConsumerCounts, transportSymbols, -1);
      this.syncActiveSymbols();
    };
  }

  /** @internal Used by `processTick`. */
  public emitSymbolTick(symbol: string, tick: QuoteTickEvent): void {
    const bucket = this.symbolListeners.get(normalizeQuoteSymbolKey(symbol));
    if (!bucket || bucket.size === 0) {
      return;
    }
    bucket.forEach((listener) => {
      try {
        listener(tick);
      } catch (error) {
        console.warn('[Quotes WS] Symbol listener error', error);
      }
    });
  }

  /** @internal Used by `processTick` to skip global store churn when only row snapshots are listening. */
  public shouldStageQuoteUpdate(): boolean {
    return this.storeConsumerCounts.size > 0;
  }

  /** Dispatches the initial connection sequence and applies auto-reconnect logic. */
  public connect(): void {
    if (!this.hasActiveDemand()) {
      this.shouldReconnect = false;
      return;
    }

    this.shouldReconnect = true;
    this.clearReconnectTimer();

    if (this.isResolvingSocketUrl) {
      return;
    }

    this.isResolvingSocketUrl = true;
    void this.resolveSocketUrlAsync()
      .then((nextUrl) => {
        this.isResolvingSocketUrl = false;
        this.openResolvedSocket(nextUrl);
      })
      .catch((error) => {
        this.isResolvingSocketUrl = false;
        console.warn('[Quotes WS] Failed to resolve broker socket URL. Will retry.', error);
        this.attemptReconnect();
      });
  }

  private openResolvedSocket(nextUrl: string): void {
    if (!this.shouldReconnect || !this.hasActiveDemand()) {
      return;
    }

    if (this.url !== nextUrl) {
      this.url = nextUrl;
      this.teardownSocket();
    }

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Quotes WS] Connected to', this.url);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.clearNetInfoListener();

        this.startHeartbeat();
        this.startWatchdog();

        if (this.activeSymbols.size > 0) {
          this.sendSubscription();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const now = Date.now();
          const feedGapMs = now - this.lastMessageAt;
          this.lastMessageAt = now;
          this.recordFeedGapIfNeeded(feedGapMs);
          const payload = JSON.parse(event.data as string);
          if (processIncomingPayload(this, payload) && this.pendingUpdates.size > 0) {
            scheduleFlush(this);
          }
        } catch (e) {
          console.warn('[Quotes WS] Parse error', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[Quotes WS] Closed');
        this.teardownSocket(false);
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        console.warn('[Quotes WS] Connection error (will auto-reconnect)');
      };
    } catch (e) {
      console.warn('[Quotes WS] Connection failed during initialization. Will retry.', e);
      this.teardownSocket();
      this.attemptReconnect();
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.clearNetInfoListener();
    this.activeSymbols.clear();
    this.stickySymbols.clear();
    this.symbolConsumerCounts.clear();
    this.storeConsumerCounts.clear();
    this.teardownSocket();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogInterval = setInterval(() => {
      if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) return;
      if (this.activeSymbols.size === 0) return;

      const staleFor = Date.now() - this.lastMessageAt;
      if (staleFor > QUOTE_WS_SILENT_STALE_MS) {
        console.warn(`[Quotes WS] Silent TCP drop detected (${Math.round(staleFor / 1000)}s). Healing invisibly...`);
        this.triggerInvisibleReconnect();
      }
    }, QUOTE_WS_WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  private recordFeedGapIfNeeded(feedGapMs: number): void {
    if (this.activeSymbols.size === 0) {
      return;
    }

    if (feedGapMs < 1_200) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRecordedFeedGapAt < 5_000) {
      return;
    }

    this.lastRecordedFeedGapAt = now;
    recordUiFeedGap('quotes.ws.gap', feedGapMs, `${this.activeSymbols.size} active symbol(s)`);
  }

  /**
   * Subscribes to tick updates for a batch of symbols.
   * Does not overwrite existing active symbols.
   */
  public subscribe(symbols: string[]): void {
    this.storeConsumerCounts = applyQuoteSubscriptionDelta(this.storeConsumerCounts, expandQuoteTransportSymbols(symbols), 1);
    this.logCandleFeed('subscribe_requested', { symbols }, 20);
    this.syncActiveSymbols();
  }

  public unsubscribe(symbols: string[]): void {
    this.storeConsumerCounts = applyQuoteSubscriptionDelta(this.storeConsumerCounts, expandQuoteTransportSymbols(symbols), -1);
    this.logCandleFeed('unsubscribe_requested', { symbols }, 20);
    this.syncActiveSymbols();
  }

  /** Exact override for the active symbol subscription list. */
  public setSubscriptions(symbols: string[]): void {
    this.stickySymbols = new Set(expandQuoteTransportSymbols(symbols));
    this.syncActiveSymbols();
  }

  private sendSubscription(): void {
    const syms = Array.from(this.activeSymbols);
    if (syms.length > 0) this.send({ type: 'subscribe', symbols: syms });
  }

  private syncActiveSymbols(): void {
    const nextActiveSymbols = new Set(buildActiveQuoteSymbols(this.stickySymbols, this.getMergedConsumerCounts()));
    const changed =
      nextActiveSymbols.size !== this.activeSymbols.size ||
      Array.from(nextActiveSymbols).some((symbol) => !this.activeSymbols.has(symbol));

    if (!changed) {
      if (this.activeSymbols.size > 0 && !this.isConnected) {
        this.connect();
      }
      return;
    }

    this.activeSymbols = nextActiveSymbols;
    if (this.activeSymbols.size === 0) {
      this.shouldReconnect = false;
      this.reconnectAttempts = 0;
      this.clearReconnectTimer();
      this.clearNetInfoListener();
      this.teardownSocket();
      return;
    }

    if (this.isConnected) {
      this.sendSubscription();
      return;
    }

    this.connect();
  }

  private send(msg: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect || !this.hasActiveDemand() || this.reconnectTimer) {
      return;
    }

    NetInfo.fetch()
      .then((state) => {
        if (!this.shouldReconnect || !this.hasActiveDemand()) {
          return;
        }

        if (state.isConnected === false) {
          console.log('[Quotes WS] Network offline. Pausing reconnect attempts.');
          if (!this.netInfoUnsubscribe) {
            this.netInfoUnsubscribe = NetInfo.addEventListener((nextState) => {
              if (nextState.isConnected && this.shouldReconnect && this.hasActiveDemand()) {
                console.log('[Quotes WS] Network restored. Resuming connection...');
                this.clearNetInfoListener();
                this.reconnectAttempts = 0;
                this.connect();
              }
            });
          }
          return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.warn(
            `[Quotes WS] Reconnect budget exhausted. Cooling down for ${Math.round(this.reconnectCooldownMs / 1000)}s before retrying.`,
          );
          this.reconnectAttempts = 0;
          this.scheduleReconnect(this.reconnectCooldownMs);
          return;
        }

        this.reconnectAttempts += 1;
        const delay = Math.min(
          this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
          QUOTE_WS_RECONNECT_MAX_DELAY_MS,
        );
        console.log(`[Quotes WS] Reconnecting in ${Math.round(delay)}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.scheduleReconnect(delay);
      })
      .catch(() => {
        if (!this.shouldReconnect || !this.hasActiveDemand()) {
          return;
        }

        const fallbackDelay = Math.min(
          this.reconnectDelay * Math.pow(1.5, Math.max(this.reconnectAttempts, 1) - 1),
          QUOTE_WS_RECONNECT_MAX_DELAY_MS,
        );
        console.warn(`[Quotes WS] Network status check failed. Retrying in ${Math.round(fallbackDelay)}ms.`);
        this.scheduleReconnect(fallbackDelay);
      });
  }

  private hasActiveDemand(): boolean {
    return this.activeSymbols.size > 0;
  }

  private getMergedConsumerCounts(): Map<string, number> {
    const merged = new Map(this.symbolConsumerCounts);
    this.storeConsumerCounts.forEach((count, symbol) => {
      merged.set(symbol, (merged.get(symbol) ?? 0) + count);
    });
    return merged;
  }

  /** @internal Used by the tick processor for rate-limited debug logs. */
  public logCandleFeed(event: string, details?: Record<string, unknown>, limit = 12): void {
    if (!shouldLogCandleDiagnostics()) {
      return;
    }

    const nextCount = (this.diagnosticLogCounts.get(event) ?? 0) + 1;
    this.diagnosticLogCounts.set(event, nextCount);
    if (nextCount <= limit || nextCount % 1000 === 0) {
      console.log(`[CANDLE-FEED] ${event}`, details ? { ...details, count: nextCount } : { count: nextCount });
    }
  }

  private scheduleReconnect(delayMs: number): void {
    if (!this.shouldReconnect || !this.hasActiveDemand() || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearNetInfoListener(): void {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
  }

  private teardownSocket(resetDemand: boolean = false): void {
    const currentSocket = this.ws;

    this.stopHeartbeat();
    this.stopWatchdog();
    cancelFlush(this);
    this.isConnected = false;
    this.ws = null;

    if (currentSocket) {
      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      try {
        currentSocket.close();
      } catch (error) {
        console.warn('[Quotes WS] Socket close failed', error);
      }
    }

    if (resetDemand) {
      this.activeSymbols.clear();
      this.stickySymbols.clear();
      this.symbolConsumerCounts.clear();
      this.storeConsumerCounts.clear();
    }
  }

  /** @internal Used by the tick processor. */
  public emitTick(tick: QuoteTickEvent): void {
    this.tickListeners.forEach((listener) => {
      try {
        listener(tick);
      } catch (error) {
        console.warn('[Quotes WS] Tick listener error', error);
      }
    });
  }

  /** @internal Test seam — exposes the flush body for direct invocation. */
  public flushUpdates(): void {
    flushUpdatesImpl(this);
  }
}
