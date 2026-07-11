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

import { brokerApi } from '../../brokerApi';
import { useUserPreferences } from '../../../state/userPreferences';
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
import {
  buildCandleChannelSubscriptionMessages,
  createCandleFeedSubscription,
  type CandleFeedSubscription,
} from './candleSubscriptions';
import type { GlobalTickListener, SymbolTickListener } from './types';

const shouldLogCandleDiagnostics = (): boolean =>
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CANDLE_FEED === 'true';

const QUOTE_WS_MAX_RECONNECT_ATTEMPTS = 20;
const QUOTE_WS_RECONNECT_BASE_DELAY_MS = 750;
const QUOTE_WS_RECONNECT_MAX_DELAY_MS = 5_000;
const QUOTE_WS_RECONNECT_COOLDOWN_MS = 10_000;
const QUOTE_WS_SILENT_STALE_MS = 8_000;
const QUOTE_WS_WATCHDOG_INTERVAL_MS = 3_000;
const QUOTE_WS_INTERACTION_RECONNECT_DEFER_MS = 2_500;
const BROKER_MARKET_AUTH_FAILURE_CLOSE_CODES = new Set([1008, 4001]);

type BrokerMarketBlockReason = 'logged_out' | 'auth_session' | 'broker_domain' | null;

const resolveQuoteListenerKeys = (symbol: string): string[] => {
  const rawKey = normalizeQuoteSymbolKey(symbol);
  const baseKey = normalizeSymbol(symbol);
  return Array.from(new Set([rawKey, baseKey].filter(Boolean)));
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const extractSymbolList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean);
  }

  const symbol = String(value ?? '').trim();
  return symbol ? [symbol] : [];
};

const redactMarketSocketUrl = (url: string): string =>
  url.replace(/([?&]token=)[^&]*/i, '$1***');

const createTickChannel = (symbol: string): string => `ticks.${symbol}`;

const extractSymbolFromTickChannel = (channel: string): string => {
  const trimmed = channel.trim();
  return trimmed.toLowerCase().startsWith('ticks.')
    ? trimmed.slice('ticks.'.length).trim()
    : '';
};

const extractSubscriptionAck = (
  payload: unknown,
): { type: 'subscribed' | 'unsubscribed'; symbols: string[] } | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const type = String(record.type ?? record.event ?? record.status ?? '').trim().toLowerCase();
  if (type !== 'subscribed' && type !== 'unsubscribed') {
    return null;
  }

  const symbols = extractSymbolList(record.symbols).concat(extractSymbolList(record.symbol));
  const channels = extractSymbolList(record.channels).concat(extractSymbolList(record.channel));
  const channelSymbols = channels.map(extractSymbolFromTickChannel).filter(Boolean);
  symbols.push(...channelSymbols);
  return symbols.length > 0 ? { type, symbols } : null;
};

export class QuotesWebSocketService implements TickProcessorBridge, FlushPipelineState {
  private static instance: QuotesWebSocketService;
  private ws: WebSocket | null = null;
  private url = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = QUOTE_WS_MAX_RECONNECT_ATTEMPTS;
  private reconnectDelay = QUOTE_WS_RECONNECT_BASE_DELAY_MS;
  private reconnectCooldownMs = QUOTE_WS_RECONNECT_COOLDOWN_MS;
  private isConnected = false;
  private shouldReconnect = false;
  private isResolvingSocketUrl = false;
  private pendingBrokerMarketBlockReason: BrokerMarketBlockReason = null;

  private activeSymbols: Set<string> = new Set();
  private sentSymbols: Set<string> = new Set();
  private pendingSubscribeSymbols: Set<string> = new Set();
  private pendingUnsubscribeSymbols: Set<string> = new Set();
  private confirmedSymbols: Set<string> = new Set();
  private stickySymbols: Set<string> = new Set();
  private symbolConsumerCounts: Map<string, number> = new Map();
  private storeConsumerCounts: Map<string, number> = new Map();
  private candleConsumerCounts: Map<string, number> = new Map();
  private activeCandleSubscriptions: Map<string, CandleFeedSubscription> = new Map();
  private sentCandleSubscriptions: Map<string, CandleFeedSubscription> = new Map();
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
  private reconnectDeferredUntil = 0;
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

    const deferredMs = this.getInteractionReconnectDelay();
    if (deferredMs > 0) {
      this.scheduleReconnect(deferredMs);
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

  public deferReconnectForInteraction(durationMs = QUOTE_WS_INTERACTION_RECONNECT_DEFER_MS): void {
    const until = Date.now() + Math.max(0, durationMs);
    if (until <= this.reconnectDeferredUntil) {
      return;
    }

    this.reconnectDeferredUntil = until;
    if (this.reconnectTimer) {
      this.clearReconnectTimer();
      this.scheduleReconnect(0);
    }
  }

  private getInteractionReconnectDelay(now = Date.now()): number {
    return Math.max(0, this.reconnectDeferredUntil - now);
  }

  private async resolveSocketUrlAsync(): Promise<string> {
    const state = useUserPreferences.getState();
    if (!state.isLoggedIn) {
      this.pendingBrokerMarketBlockReason = 'logged_out';
      return '';
    }

    try {
      const socketUrl = await brokerApi.getWebSocketUrl();
      this.pendingBrokerMarketBlockReason = null;
      return socketUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      this.pendingBrokerMarketBlockReason = /domain is missing|domain unavailable|backend domain/i.test(message)
        ? 'broker_domain'
        : 'auth_session';
      throw error;
    }
  }

  private shouldStayOnBrokerMarketSocket(socketUrl: string): boolean {
    const state = useUserPreferences.getState();
    if (!state.isLoggedIn) {
      return false;
    }

    return /\/ws\/v2(?:\?|$)/.test(socketUrl);
  }

  private markBrokerSocketUnavailable(socketUrl: string, reason: string): boolean {
    if (this.shouldStayOnBrokerMarketSocket(socketUrl)) {
      console.warn(
        `[Quotes WS] Broker market socket unavailable (${reason}). Retrying broker /ws/v2 socket.`,
        { socketUrl: redactMarketSocketUrl(socketUrl) },
      );
      this.clearReconnectTimer();
      this.teardownSocket(false);
      this.attemptReconnect();
      return true;
    }
    return false;
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
    this.markSymbolsConfirmed([symbol, tick.symbol, tick.rawSymbol ?? '']);
    const listenerKeys = new Set([
      ...resolveQuoteListenerKeys(symbol),
      ...resolveQuoteListenerKeys(tick.symbol),
      ...(tick.rawSymbol ? resolveQuoteListenerKeys(tick.rawSymbol) : []),
    ]);
    const listeners = new Set<SymbolTickListener>();

    listenerKeys.forEach((key) => {
      const bucket = this.symbolListeners.get(key);
      if (!bucket || bucket.size === 0) {
        return;
      }
      bucket.forEach((listener) => listeners.add(listener));
    });

    if (listeners.size === 0) {
      return;
    }
    listeners.forEach((listener) => {
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
    const deferredMs = this.getInteractionReconnectDelay();
    if (deferredMs > 0) {
      this.scheduleReconnect(deferredMs);
      return;
    }

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

    const deferredMs = this.getInteractionReconnectDelay();
    if (deferredMs > 0) {
      this.scheduleReconnect(deferredMs);
      return;
    }

    if (!nextUrl) {
      if (this.url !== nextUrl) {
        this.url = nextUrl;
        this.teardownSocket();
      }
      const reason = this.pendingBrokerMarketBlockReason;
      console.warn(
        reason === 'logged_out'
          ? '[Quotes WS] Market data requires a logged-in broker session. Skipping public feed fallback.'
          : reason === 'auth_session'
            ? '[Quotes WS] Authenticated broker market socket unavailable. Waiting for a valid access token.'
            : '[Quotes WS] No broker market /ws/v2 URL available for logged-in session. Waiting for broker domain.',
      );
      this.attemptReconnect();
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
      const socketUrl = this.url;
      let didOpen = false;
      this.ws = new WebSocket(socketUrl);

      this.ws.onopen = () => {
        didOpen = true;
        console.log('[Quotes WS] Connected to', redactMarketSocketUrl(socketUrl));
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.clearNetInfoListener();
        this.resetTransportSubscriptionState();

        this.startHeartbeat();
        this.startWatchdog();

        if (this.activeSymbols.size > 0) {
          this.sendSubscription();
        }
        if (this.activeCandleSubscriptions.size > 0) {
          this.sendCandleSubscriptionDiff();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const now = Date.now();
          const feedGapMs = now - this.lastMessageAt;
          this.lastMessageAt = now;
          this.recordFeedGapIfNeeded(feedGapMs);
          const payload = JSON.parse(event.data as string);
          this.handleSubscriptionAckPayload(payload);
          if (processIncomingPayload(this, payload) && this.pendingUpdates.size > 0) {
            scheduleFlush(this);
          }
        } catch (e) {
          console.warn('[Quotes WS] Parse error', e);
        }
      };

      this.ws.onclose = (event) => {
        if (this.isBrokerMarketAuthFailure(socketUrl, event?.code)) {
          console.warn('[Quotes WS] Broker market socket auth rejected. Stopping reconnect until a fresh token is available.', {
            code: event?.code,
            socketUrl: redactMarketSocketUrl(socketUrl),
          });
          this.shouldReconnect = false;
          this.reconnectAttempts = 0;
          this.clearReconnectTimer();
          this.teardownSocket(false);
          return;
        }
        if (!didOpen && this.markBrokerSocketUnavailable(socketUrl, 'closed before open')) {
          return;
        }
        console.log('[Quotes WS] Closed');
        this.teardownSocket(false);
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        if (!didOpen && this.markBrokerSocketUnavailable(socketUrl, 'connection error before open')) {
          return;
        }
        console.warn('[Quotes WS] Connection error (will auto-reconnect)');
      };
    } catch (e) {
      console.warn('[Quotes WS] Connection failed during initialization. Will retry.', e);
      this.teardownSocket();
      this.attemptReconnect();
    }
  }

  private isBrokerMarketAuthFailure(socketUrl: string, code: number | undefined): boolean {
    return (
      typeof code === 'number' &&
      BROKER_MARKET_AUTH_FAILURE_CLOSE_CODES.has(code) &&
      this.shouldStayOnBrokerMarketSocket(socketUrl)
    );
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.clearNetInfoListener();
    this.activeSymbols.clear();
    this.resetTransportSubscriptionState();
    this.stickySymbols.clear();
    this.symbolConsumerCounts.clear();
    this.storeConsumerCounts.clear();
    this.candleConsumerCounts.clear();
    this.activeCandleSubscriptions.clear();
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
      if (!this.hasActiveDemand()) return;

      const staleFor = Date.now() - this.lastMessageAt;
      if (staleFor > QUOTE_WS_SILENT_STALE_MS) {
        const socketUrl = this.url;
        // In logged-in broker mode, reconnect only to the selected broker
        // /ws/v2 market socket so mobile stays in parity with the web terminal.
        if (this.markBrokerSocketUnavailable(socketUrl, 'silent after open')) {
          return;
        }

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
    if (!this.hasActiveDemand()) {
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

  public subscribeToCandles(symbol: string, tf: string): () => void {
    const subscription = createCandleFeedSubscription(symbol, tf);
    if (!subscription) {
      return () => {};
    }

    this.candleConsumerCounts.set(
      subscription.key,
      (this.candleConsumerCounts.get(subscription.key) ?? 0) + 1,
    );
    this.activeCandleSubscriptions.set(subscription.key, subscription);
    this.logCandleFeed('subscribe_candle_channels_requested', {
      symbol: subscription.symbol,
      tf: subscription.tf,
      bridgeTf: subscription.bridgeTf,
    }, 20);
    this.syncActiveCandleSubscriptions();

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;

      const nextCount = (this.candleConsumerCounts.get(subscription.key) ?? 0) - 1;
      if (nextCount <= 0) {
        this.candleConsumerCounts.delete(subscription.key);
        this.activeCandleSubscriptions.delete(subscription.key);
      } else {
        this.candleConsumerCounts.set(subscription.key, nextCount);
      }

      this.syncActiveCandleSubscriptions();
    };
  }

  private sendSubscription(): void {
    this.sendSubscriptionDiff(new Set(this.activeSymbols));
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
      if (this.isConnected && this.sentSymbols.size > 0) {
        this.sendSubscriptionDiff(new Set());
      }
      if (this.hasActiveDemand()) {
        if (!this.isConnected) {
          this.connect();
        }
        return;
      }
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

  private syncActiveCandleSubscriptions(): void {
    if (this.activeCandleSubscriptions.size === 0) {
      if (this.isConnected && this.sentCandleSubscriptions.size > 0) {
        this.sendCandleSubscriptionDiff();
      }
      if (!this.hasActiveDemand()) {
        this.shouldReconnect = false;
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.clearNetInfoListener();
        this.teardownSocket();
      }
      return;
    }

    if (this.isConnected) {
      this.sendCandleSubscriptionDiff();
      return;
    }

    this.connect();
  }

  private send(msg: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendSubscriptionDiff(nextDesiredSymbols: Set<string>): void {
    const subscribeSymbols = Array.from(nextDesiredSymbols).filter((symbol) => !this.sentSymbols.has(symbol));
    const unsubscribeSymbols = Array.from(this.sentSymbols).filter((symbol) => !nextDesiredSymbols.has(symbol));

    if (unsubscribeSymbols.length > 0) {
      this.send({
        action: 'unsubscribe',
        channels: unsubscribeSymbols.map(createTickChannel),
      });
      unsubscribeSymbols.forEach((symbol) => {
        this.sentSymbols.delete(symbol);
        this.confirmedSymbols.delete(symbol);
        this.pendingSubscribeSymbols.delete(symbol);
        this.pendingUnsubscribeSymbols.add(symbol);
      });
      this.logCandleFeed('unsubscribe_diff_sent', { symbols: unsubscribeSymbols }, 20);
    }

    if (subscribeSymbols.length > 0) {
      this.send({
        action: 'subscribe',
        channels: subscribeSymbols.map(createTickChannel),
      });
      subscribeSymbols.forEach((symbol) => {
        this.sentSymbols.add(symbol);
        this.pendingUnsubscribeSymbols.delete(symbol);
        this.pendingSubscribeSymbols.add(symbol);
      });
      this.logCandleFeed('subscribe_diff_sent', { symbols: subscribeSymbols }, 20);
    }
  }

  private sendCandleSubscriptionDiff(): void {
    const unsubscribeSubscriptions = Array.from(this.sentCandleSubscriptions.entries())
      .filter(([key]) => !this.activeCandleSubscriptions.has(key))
      .map(([, subscription]) => subscription);
    const subscribeSubscriptions = Array.from(this.activeCandleSubscriptions.entries())
      .filter(([key]) => !this.sentCandleSubscriptions.has(key))
      .map(([, subscription]) => subscription);

    for (const message of buildCandleChannelSubscriptionMessages('unsubscribe', unsubscribeSubscriptions)) {
      this.send(message);
      this.logCandleFeed('unsubscribe_candle_channels_diff_sent', {
        channels: message.channels,
      }, 20);
    }
    unsubscribeSubscriptions.forEach((subscription) => {
      this.sentCandleSubscriptions.delete(subscription.key);
    });

    for (const message of buildCandleChannelSubscriptionMessages('subscribe', subscribeSubscriptions)) {
      this.send(message);
      this.logCandleFeed('subscribe_candle_channels_diff_sent', {
        channels: message.channels,
      }, 20);
    }
    subscribeSubscriptions.forEach((subscription) => {
      this.sentCandleSubscriptions.set(subscription.key, subscription);
    });
  }

  private handleSubscriptionAckPayload(payload: unknown): void {
    if (Array.isArray(payload)) {
      payload.forEach((item) => this.handleSubscriptionAckPayload(item));
      return;
    }

    const ack = extractSubscriptionAck(payload);
    if (!ack) {
      return;
    }

    const symbols = expandQuoteTransportSymbols(ack.symbols);
    symbols.forEach((symbol) => {
      if (ack.type === 'subscribed') {
        this.pendingSubscribeSymbols.delete(symbol);
        this.pendingUnsubscribeSymbols.delete(symbol);
        this.sentSymbols.add(symbol);
        if (this.activeSymbols.has(symbol)) {
          this.confirmedSymbols.add(symbol);
        }
        return;
      }

      this.pendingUnsubscribeSymbols.delete(symbol);
      this.pendingSubscribeSymbols.delete(symbol);
      this.confirmedSymbols.delete(symbol);
      this.sentSymbols.delete(symbol);
    });
    this.logCandleFeed('subscription_ack', { type: ack.type, symbols }, 20);
  }

  private markSymbolsConfirmed(symbols: string[]): void {
    const transportSymbols = expandQuoteTransportSymbols(symbols);
    transportSymbols.forEach((symbol) => {
      if (!this.activeSymbols.has(symbol)) {
        return;
      }
      this.sentSymbols.add(symbol);
      this.pendingSubscribeSymbols.delete(symbol);
      this.pendingUnsubscribeSymbols.delete(symbol);
      this.confirmedSymbols.add(symbol);
    });
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect || !this.hasActiveDemand() || this.reconnectTimer) {
      return;
    }

    const deferredMs = this.getInteractionReconnectDelay();
    if (deferredMs > 0) {
      this.scheduleReconnect(deferredMs);
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
    return this.activeSymbols.size > 0 || this.activeCandleSubscriptions.size > 0;
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

    const resolvedDelayMs = Math.max(delayMs, this.getInteractionReconnectDelay());
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, resolvedDelayMs);
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
    this.resetTransportSubscriptionState();

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
      this.candleConsumerCounts.clear();
      this.activeCandleSubscriptions.clear();
    }
  }

  private resetTransportSubscriptionState(): void {
    this.sentSymbols.clear();
    this.pendingSubscribeSymbols.clear();
    this.pendingUnsubscribeSymbols.clear();
    this.confirmedSymbols.clear();
    this.sentCandleSubscriptions.clear();
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
