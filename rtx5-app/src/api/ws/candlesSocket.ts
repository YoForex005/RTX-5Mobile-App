/**
 * Core module: candlesSocket.ts
 */

import { AppState, NativeEventSubscription } from 'react-native';
import { Candle } from '../../state/tradingState';
import { getCandleHistory } from '../candles';
import {
  buildFlatGapCandles,
  CandleStreamEvent,
  dedupeIncomingCandlePayloads,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  getBucketGapCount,
  getCurrentBucketTime,
  getExpectedNextCandleTime,
  isBucketAlignedCandle,
  isStructurallyValidCandle,
  isWithinLiveBucketHorizon,
  mergeCandleUpdate,
  NormalizedIncomingCandle,
  normalizeSymbol,
  normalizeTimeframe,
  parseIncomingCandlePayload,
  sortAndDedupeCandles,
} from '../../domain/candles';

type FullSyncReason = 'subscription_change' | 'history_seed' | 'resync' | 'historical_patch';
type HistoryFetchReason = 'history_seed' | 'resync';

type TickListener = (symbol: string, tf: string, mutatedCandles: Candle[]) => void;
type ArrayListener = (symbol: string, tf: string, allCandles: Candle[]) => void;
type StreamListener = (event: CandleStreamEvent) => void;

type SubscriptionState = {
  key: string;
  symbol: string;
  tf: string;
  consumerCount: number;
  candleCache: Candle[];
  isHistoryLoading: boolean;
  queuedWsTicks: NormalizedIncomingCandle[];
  fetchController: AbortController | null;
  hasLiveEdgeForSubscription: boolean;
  hasSeededHistoryForSubscription: boolean;
  hasStaleHistoryForSubscription: boolean;
  activeBucketNeedsHistoryHeal: boolean;
  recentHistoryHealTimer: NodeJS.Timeout | null;
  isRecentHistoryHealInFlight: boolean;
  resyncTimer: NodeJS.Timeout | null;
};

const createSubscriptionKey = (symbol: string, tf: string): string =>
  `${normalizeSymbol(symbol)}::${normalizeTimeframe(tf)}`;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

export class CandlesWebSocketService {
  private static instance: CandlesWebSocketService;
  private static readonly MAX_AUTO_GAP_FILL_CANDLES = 5;
  private static readonly MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES = 5;
  private static readonly MAX_ACCEPTABLE_HISTORY_STALENESS_CANDLES = 5;
  private static readonly RECENT_HISTORY_HEAL_LIMIT = 12;
  private static readonly RECENT_HISTORY_HEAL_DELAY_MS = 900;

  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_CANDLES_WS_URL || 'wss://backend.orrnn.com/ws/feed';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 2000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private manualDisconnect = false;

  private subscriptions = new Map<string, SubscriptionState>();
  private symbolConsumerCounts = new Map<string, number>();
  private serverSubscribedSymbols = new Set<string>();

  private tickListeners: Set<TickListener> = new Set();
  private arrayListeners: Set<ArrayListener> = new Set();
  private streamListeners: Set<StreamListener> = new Set();

  public candleCache: Candle[] = [];
  private lastSnapshotKey: string | null = null;

  private heartbeatInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private lastMessageAt: number = Date.now();

  private constructor() {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && this.subscriptions.size > 0) {
        this.logPipeline('app_wake_reconnect', { activeSubscriptions: this.subscriptions.size });
        this.triggerInvisibleReconnect();
      }
    });
  }

  public static getInstance(): CandlesWebSocketService {
    if (!CandlesWebSocketService.instance) {
      CandlesWebSocketService.instance = new CandlesWebSocketService();
    }
    return CandlesWebSocketService.instance;
  }

  public connect(): void {
    if (this.subscriptions.size === 0) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.manualDisconnect = false;
    this.clearReconnectTimer();

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Candles WS] Connected to', this.url);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.serverSubscribedSymbols.clear();
        this.startHeartbeat();
        this.startWatchdog();
        this.syncServerSubscriptions();
        this.refetchAllSubscriptionsAfterReconnect();
      };

      this.ws.onmessage = (event) => {
        try {
          this.lastMessageAt = Date.now();
          const payload = JSON.parse(event.data as string);
          this.handlePayload(payload);
        } catch (error) {
          console.warn('[Candles WS] Parse error', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[Candles WS] Closed');
        this.stopHeartbeat();
        this.stopWatchdog();
        this.isConnected = false;
        this.serverSubscribedSymbols.clear();
        this.ws = null;

        if (!this.manualDisconnect && this.subscriptions.size > 0) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = () => {
        console.warn('[Candles WS] connection error (will auto-reconnect via onclose)');
      };
    } catch (error) {
      console.error('[Candles WS] Connection failed', error);
      this.attemptReconnect();
    }
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.stopWatchdog();

    for (const state of this.subscriptions.values()) {
      this.disposeSubscriptionResources(state);
    }

    this.subscriptions.clear();
    this.symbolConsumerCounts.clear();
    this.serverSubscribedSymbols.clear();
    this.candleCache = [];
    this.lastSnapshotKey = null;

    if (this.ws) {
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch (_error) {}
      this.ws = null;
    }

    this.isConnected = false;
  }

  public subscribe(symbol: string, tf: string): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(tf);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    this.manualDisconnect = false;

    const key = createSubscriptionKey(normalizedSymbol, normalizedTimeframe);
    let state = this.subscriptions.get(key);
    const isNewState = !state;

    if (!state) {
      state = this.createSubscriptionState(normalizedSymbol, normalizedTimeframe);
      this.subscriptions.set(key, state);
    }

    state.consumerCount += 1;
    this.incrementSymbolConsumerCount(normalizedSymbol);

    if (this.isConnected) {
      this.ensureServerSymbolSubscription(normalizedSymbol);
    } else {
      this.connect();
    }

    if (state.isHistoryLoading) {
      return;
    }

    if (!state.hasSeededHistoryForSubscription) {
      if (this.isConnected) {
        this.fetchHistoryAndSubscribe(state, 'history_seed');
      }
      return;
    }

    if (!isNewState && state.candleCache.length > 0) {
      this.emitFullSync(state, 'history_seed');
    }
  }

  public unsubscribe(symbol?: string, tf?: string): void {
    const normalizedSymbol = normalizeSymbol(symbol ?? '');
    const normalizedTimeframe = normalizeTimeframe(tf ?? '');
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    const key = createSubscriptionKey(normalizedSymbol, normalizedTimeframe);
    const state = this.subscriptions.get(key);
    if (!state) {
      return;
    }

    state.consumerCount = Math.max(0, state.consumerCount - 1);
    this.decrementSymbolConsumerCount(normalizedSymbol);

    if (state.consumerCount > 0) {
      return;
    }

    this.disposeSubscriptionResources(state);
    this.subscriptions.delete(key);
    this.releaseServerSymbolSubscriptionIfUnused(normalizedSymbol);

    if (this.lastSnapshotKey === key) {
      const fallbackState = this.subscriptions.values().next().value as SubscriptionState | undefined;
      this.lastSnapshotKey = fallbackState?.key ?? null;
      this.candleCache = fallbackState ? [...fallbackState.candleCache] : [];
    }
  }

  public refresh(symbol: string, tf: string): void {
    const state = this.getSubscriptionState(symbol, tf);
    if (!state) {
      return;
    }

    this.clearStateResyncTimer(state);
    this.clearStateRecentHistoryHealTimer(state);
    state.fetchController?.abort();
    state.fetchController = null;
    state.isHistoryLoading = false;
    state.queuedWsTicks = [];
    state.hasLiveEdgeForSubscription = false;
    state.hasSeededHistoryForSubscription = false;
    state.hasStaleHistoryForSubscription = false;
    state.activeBucketNeedsHistoryHeal = false;
    state.isRecentHistoryHealInFlight = false;

    if (this.isConnected) {
      this.ensureServerSymbolSubscription(state.symbol);
      this.fetchHistoryAndSubscribe(state, 'resync');
    } else {
      this.connect();
    }
  }

  public addTickListener(listener: TickListener): void {
    this.tickListeners.add(listener);

    for (const state of this.subscriptions.values()) {
      if (state.isHistoryLoading || state.candleCache.length === 0) {
        continue;
      }

      const latest = state.candleCache[state.candleCache.length - 1];
      listener(state.symbol, state.tf, [{ ...latest }]);
    }
  }

  public removeTickListener(listener: TickListener): void {
    this.tickListeners.delete(listener);
  }

  public addArrayListener(listener: ArrayListener): void {
    this.arrayListeners.add(listener);

    for (const state of this.subscriptions.values()) {
      if (state.isHistoryLoading) {
        continue;
      }

      listener(state.symbol, state.tf, [...state.candleCache]);
    }
  }

  public removeArrayListener(listener: ArrayListener): void {
    this.arrayListeners.delete(listener);
  }

  public addStreamListener(listener: StreamListener): void {
    this.streamListeners.add(listener);

    for (const state of this.subscriptions.values()) {
      if (state.isHistoryLoading) {
        continue;
      }

      listener({
        type: 'full_sync',
        symbol: state.symbol,
        tf: state.tf,
        candles: [...state.candleCache],
        reason: state.hasSeededHistoryForSubscription ? 'history_seed' : 'subscription_change',
      });
    }
  }

  public removeStreamListener(listener: StreamListener): void {
    this.streamListeners.delete(listener);
  }

  private createSubscriptionState(symbol: string, tf: string): SubscriptionState {
    return {
      key: createSubscriptionKey(symbol, tf),
      symbol,
      tf,
      consumerCount: 0,
      candleCache: [],
      isHistoryLoading: false,
      queuedWsTicks: [],
      fetchController: null,
      hasLiveEdgeForSubscription: false,
      hasSeededHistoryForSubscription: false,
      hasStaleHistoryForSubscription: false,
      activeBucketNeedsHistoryHeal: false,
      recentHistoryHealTimer: null,
      isRecentHistoryHealInFlight: false,
      resyncTimer: null,
    };
  }

  private getSubscriptionState(symbol: string, tf: string): SubscriptionState | undefined {
    return this.subscriptions.get(createSubscriptionKey(symbol, tf));
  }

  private isTrackedState(state: SubscriptionState): boolean {
    return this.subscriptions.get(state.key) === state;
  }

  private incrementSymbolConsumerCount(symbol: string): void {
    const current = this.symbolConsumerCounts.get(symbol) ?? 0;
    this.symbolConsumerCounts.set(symbol, current + 1);
  }

  private decrementSymbolConsumerCount(symbol: string): void {
    const current = this.symbolConsumerCounts.get(symbol) ?? 0;
    const next = Math.max(0, current - 1);

    if (next === 0) {
      this.symbolConsumerCounts.delete(symbol);
      return;
    }

    this.symbolConsumerCounts.set(symbol, next);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private triggerInvisibleReconnect(): void {
    if (this.subscriptions.size === 0) {
      return;
    }

    this.manualDisconnect = false;
    this.serverSubscribedSymbols.clear();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (_error) {}
    } else {
      this.connect();
    }
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
      if (this.subscriptions.size === 0) return;

      const staleFor = Date.now() - this.lastMessageAt;
      if (staleFor > 35000) {
        console.warn(`[Candles WS] Silent TCP drop detected (${Math.round(staleFor / 1000)}s). Healing invisibly...`);
        this.triggerInvisibleReconnect();
      }
    }, 10000);
  }

  private stopWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.manualDisconnect || this.subscriptions.size === 0) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay =
      this.reconnectAttempts <= this.maxReconnectAttempts
        ? Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 45_000)
        : 30_000;

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualDisconnect && this.subscriptions.size > 0) {
        this.connect();
      }
    }, delay);
  }

  private refetchAllSubscriptionsAfterReconnect(): void {
    for (const state of this.subscriptions.values()) {
      const reason: HistoryFetchReason = state.hasSeededHistoryForSubscription ? 'resync' : 'history_seed';
      this.fetchHistoryAndSubscribe(state, reason);
    }
  }

  private syncServerSubscriptions(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const symbol of this.symbolConsumerCounts.keys()) {
      this.ensureServerSymbolSubscription(symbol);
    }
  }

  private ensureServerSymbolSubscription(symbol: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.serverSubscribedSymbols.has(symbol)) {
      return;
    }

    this.ws.send(JSON.stringify({ type: 'subscribe', symbols: [symbol] }));
    this.serverSubscribedSymbols.add(symbol);
    this.logPipeline('feed_subscribe', { symbol });
  }

  private releaseServerSymbolSubscriptionIfUnused(symbol: string): void {
    if ((this.symbolConsumerCounts.get(symbol) ?? 0) > 0) {
      return;
    }

    if (!this.serverSubscribedSymbols.has(symbol)) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbols: [symbol] }));
      this.logPipeline('feed_unsubscribe', { symbol });
    }

    this.serverSubscribedSymbols.delete(symbol);
  }

  private disposeSubscriptionResources(state: SubscriptionState): void {
    state.fetchController?.abort();
    state.fetchController = null;
    this.clearStateResyncTimer(state);
    this.clearStateRecentHistoryHealTimer(state);
    state.isHistoryLoading = false;
    state.queuedWsTicks = [];
    state.isRecentHistoryHealInFlight = false;
  }

  private clearStateResyncTimer(state: SubscriptionState): void {
    if (state.resyncTimer) {
      clearTimeout(state.resyncTimer);
      state.resyncTimer = null;
    }
  }

  private clearStateRecentHistoryHealTimer(state: SubscriptionState): void {
    if (state.recentHistoryHealTimer) {
      clearTimeout(state.recentHistoryHealTimer);
      state.recentHistoryHealTimer = null;
    }
  }

  private logPipeline(event: string, details: Record<string, unknown>) {
    try {
      console.log(`[Candles WS] ${event}`, details);
    } catch (_error) {}
  }

  private emitStreamEvent(event: CandleStreamEvent): void {
    this.streamListeners.forEach((listener) => listener(event));
  }

  private notifyArrayListeners(symbol: string, tf: string, candles: Candle[]): void {
    const snapshot = [...candles];
    this.arrayListeners.forEach((listener) => listener(symbol, tf, snapshot));
  }

  private emitTickListeners(symbol: string, tf: string, candles: Candle[]): void {
    if (candles.length === 0) {
      return;
    }

    const snapshot = candles.map((candle) => ({ ...candle }));
    this.tickListeners.forEach((listener) => listener(symbol, tf, snapshot));
  }

  private updatePublicSnapshot(state: SubscriptionState, candles: Candle[]): void {
    this.lastSnapshotKey = state.key;
    this.candleCache = [...candles];
  }

  private emitFullSync(
    state: SubscriptionState,
    reason: FullSyncReason,
    candles: Candle[] = state.candleCache,
  ): void {
    const snapshot = [...candles];
    this.updatePublicSnapshot(state, snapshot);

    this.emitStreamEvent({
      type: 'full_sync',
      symbol: state.symbol,
      tf: state.tf,
      candles: snapshot,
      reason,
    });
    this.notifyArrayListeners(state.symbol, state.tf, snapshot);

    if (snapshot.length > 0) {
      this.emitTickListeners(state.symbol, state.tf, [snapshot[snapshot.length - 1]]);
    }
  }

  private requestResync(state: SubscriptionState, reason: string): void {
    if (!this.isTrackedState(state)) {
      return;
    }

    this.emitStreamEvent({
      type: 'resync_required',
      symbol: state.symbol,
      tf: state.tf,
      reason,
    });
    this.logPipeline('resync_required', {
      symbol: state.symbol,
      tf: state.tf,
      reason,
      cacheSize: state.candleCache.length,
      lastCacheTime: state.candleCache[state.candleCache.length - 1]?.time ?? null,
    });

    if (state.resyncTimer || state.isHistoryLoading) {
      return;
    }

    const delayMs = reason.startsWith('history_stale') ? 5000 : 50;

    state.resyncTimer = setTimeout(() => {
      state.resyncTimer = null;
      if (!this.isTrackedState(state)) {
        return;
      }

      this.fetchHistoryAndSubscribe(state, 'resync');
    }, delayMs);
  }

  private fetchHistoryAndSubscribe(state: SubscriptionState, reason: HistoryFetchReason): void {
    if (!this.isTrackedState(state)) {
      return;
    }

    if (state.isHistoryLoading) {
      state.fetchController?.abort();
    }

    const controller = new AbortController();
    state.fetchController = controller;
    state.isHistoryLoading = true;
    state.queuedWsTicks = [];
    state.hasLiveEdgeForSubscription = false;
    state.hasSeededHistoryForSubscription = false;
    state.hasStaleHistoryForSubscription = false;
    state.activeBucketNeedsHistoryHeal = false;
    this.clearStateResyncTimer(state);
    this.clearStateRecentHistoryHealTimer(state);

    this.logPipeline('history_fetch_start', {
      symbol: state.symbol,
      tf: state.tf,
      reason,
    });

    this.ensureServerSymbolSubscription(state.symbol);

    void getCandleHistory(state.symbol, state.tf, DEFAULT_CANDLE_HISTORY_LIMIT, controller.signal)
      .then((history) => {
        if (controller.signal.aborted || !this.isTrackedState(state)) {
          return;
        }

        const normalizedHistory = sortAndDedupeCandles(history.candles);
        const latestHistoryCandle = normalizedHistory[normalizedHistory.length - 1];
        const currentBucketTime = getCurrentBucketTime(state.tf);
        const historyGapCount = latestHistoryCandle
          ? getBucketGapCount(latestHistoryCandle.time, currentBucketTime, state.tf)
          : 0;
        const clientClockSuggestsStale =
          !!latestHistoryCandle &&
          historyGapCount > CandlesWebSocketService.MAX_ACCEPTABLE_HISTORY_STALENESS_CANDLES;

        state.candleCache = normalizedHistory;
        state.isHistoryLoading = false;
        state.hasLiveEdgeForSubscription = false;
        state.hasSeededHistoryForSubscription = state.candleCache.length > 0;
        state.hasStaleHistoryForSubscription = clientClockSuggestsStale;
        state.activeBucketNeedsHistoryHeal = false;

        if (normalizedHistory.length > 0) {
          this.logPipeline('history_fetch_success', {
            symbol: state.symbol,
            tf: state.tf,
            reason,
            count: normalizedHistory.length,
            latestHistoryTime: latestHistoryCandle?.time ?? null,
            currentBucketTime,
            historyGapCount,
            accepted: true,
            clientClockSuggestsStale,
          });
          this.emitFullSync(state, reason);
        }

        if (clientClockSuggestsStale) {
          this.logPipeline('history_fetch_client_clock_gap_detected', {
            symbol: state.symbol,
            tf: state.tf,
            reason,
            latestHistoryTime: latestHistoryCandle?.time ?? null,
            currentBucketTime,
            historyGapCount,
            action: 'wait_for_first_live_candle',
          });
        }

        if (state.queuedWsTicks.length > 0) {
          const queuedTicks = dedupeIncomingCandlePayloads(state.queuedWsTicks);
          state.queuedWsTicks = [];
          this.processParsedCandles(state, queuedTicks);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || !this.isTrackedState(state)) {
          return;
        }

        console.warn('[Candles WS] History fetch failed, continuing with live stream only:', error);
        state.isHistoryLoading = false;
        state.hasLiveEdgeForSubscription = false;
        state.hasSeededHistoryForSubscription = false;
        state.hasStaleHistoryForSubscription = false;
        state.activeBucketNeedsHistoryHeal = false;

        this.logPipeline('history_fetch_failed', {
          symbol: state.symbol,
          tf: state.tf,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });

        this.emitStreamEvent({
          type: 'resync_required',
          symbol: state.symbol,
          tf: state.tf,
          reason: 'history_fetch_failed',
        });

        if (state.queuedWsTicks.length > 0) {
          const queuedTicks = dedupeIncomingCandlePayloads(state.queuedWsTicks);
          state.queuedWsTicks = [];
          this.processParsedCandles(state, queuedTicks);
        }
      })
      .finally(() => {
        if (this.isTrackedState(state) && state.fetchController === controller) {
          state.fetchController = null;
        }
      });
  }

  private handlePayload(payload: unknown): void {
    if (this.subscriptions.size === 0) {
      return;
    }

    const statesBySymbol = new Map<string, SubscriptionState[]>();
    for (const state of this.subscriptions.values()) {
      const entries = statesBySymbol.get(state.symbol);
      if (entries) {
        entries.push(state);
      } else {
        statesBySymbol.set(state.symbol, [state]);
      }
    }

    for (const [symbol, states] of statesBySymbol.entries()) {
      for (const state of states) {
        const parsedCandles = this.extractParsedCandlesForSymbol(payload, symbol, state.tf);
        if (parsedCandles.length === 0) {
          continue;
        }

        if (state.isHistoryLoading) {
          state.queuedWsTicks.push(...parsedCandles);
          continue;
        }

        this.processParsedCandles(state, parsedCandles);
      }
    }
  }

  private extractParsedCandlesForSymbol(
    payload: unknown,
    targetSymbol: string,
    timeframe: string,
  ): NormalizedIncomingCandle[] {
    const parsed: NormalizedIncomingCandle[] = [];
    const singleActiveSymbol = this.getSingleActiveSymbol();

    const pushParsed = (item: unknown, fallbackSymbol: string | null = null) => {
      const record = asRecord(item);
      if (!record) {
        return;
      }

      const resolvedSymbol = this.resolvePayloadSymbol(record) ?? fallbackSymbol ?? singleActiveSymbol;
      if (resolvedSymbol && resolvedSymbol !== targetSymbol) {
        return;
      }

      const normalized = parseIncomingCandlePayload(record, timeframe);
      if (normalized) {
        parsed.push(normalized);
      }
    };

    if (Array.isArray(payload)) {
      payload.forEach((item) => pushParsed(item));
      return dedupeIncomingCandlePayloads(parsed);
    }

    const record = asRecord(payload);
    if (!record) {
      return [];
    }

    const parentSymbol =
      this.resolvePayloadSymbol(record) ??
      this.resolvePayloadSymbol(record.candle) ??
      this.resolvePayloadSymbol(record.data);

    const nestedItems =
      (Array.isArray(record.data) ? record.data : null) ??
      (Array.isArray(record.candles) ? record.candles : null) ??
      (Array.isArray(record.items) ? record.items : null);

    if (nestedItems) {
      nestedItems.forEach((item) => pushParsed(item, parentSymbol));
      return dedupeIncomingCandlePayloads(parsed);
    }

    pushParsed(record.candle ?? record, parentSymbol);
    return dedupeIncomingCandlePayloads(parsed);
  }

  private resolvePayloadSymbol(payload: unknown): string | null {
    const record = asRecord(payload);
    if (!record) {
      return null;
    }

    const candidate =
      (typeof record.symbol === 'string' ? record.symbol : null) ??
      (typeof record.s === 'string' ? record.s : null) ??
      (typeof record.Symbol === 'string' ? record.Symbol : null) ??
      (typeof record.instrument === 'string' ? record.instrument : null);

    if (!candidate) {
      return null;
    }

    const normalized = normalizeSymbol(candidate);
    return normalized || null;
  }

  private getSingleActiveSymbol(): string | null {
    const symbols = Array.from(new Set(Array.from(this.subscriptions.values()).map((state) => state.symbol)));
    return symbols.length === 1 ? symbols[0] : null;
  }

  private processParsedCandles(state: SubscriptionState, incomingCandles: NormalizedIncomingCandle[]): void {
    if (!this.isTrackedState(state)) {
      return;
    }

    const canonicalEvents: CandleStreamEvent[] = [];
    let shouldFullSync = false;
    let fullSyncReason: Extract<FullSyncReason, 'history_seed' | 'resync' | 'historical_patch'> = 'historical_patch';
    let cacheChanged = false;
    let shouldScheduleRecentHistoryHeal = false;
    let recentHistoryHealReason = 'closed_bucket_missing_explicit_high_low';

    for (const incomingEntry of incomingCandles) {
      const incoming = incomingEntry.candle;

      if (!isStructurallyValidCandle(incoming) || !isBucketAlignedCandle(incoming, state.tf)) {
        this.requestResync(state, 'invalid_ohlc_or_bucket');
        continue;
      }

      if (state.candleCache.length === 0) {
        state.candleCache = [incoming];
        cacheChanged = true;
        shouldFullSync = true;
        fullSyncReason = 'resync';
        state.hasLiveEdgeForSubscription = true;
        state.hasStaleHistoryForSubscription = false;
        state.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
        continue;
      }

      const lastCandle = state.candleCache[state.candleCache.length - 1];

      if (incoming.time === lastCandle.time) {
        const merged = mergeCandleUpdate(lastCandle, incoming);
        if (!merged) {
          this.requestResync(state, 'invalid_replace_last');
          continue;
        }

        state.candleCache[state.candleCache.length - 1] = merged;
        cacheChanged = true;
        canonicalEvents.push({
          type: 'replace_last',
          symbol: state.symbol,
          tf: state.tf,
          candle: merged,
        });
        this.logPipeline('replace_last', {
          symbol: state.symbol,
          tf: state.tf,
          candleTime: merged.time,
          lastCacheTime: lastCandle.time,
        });
        state.hasLiveEdgeForSubscription = true;
        state.hasStaleHistoryForSubscription = false;
        state.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
        continue;
      }

      const expectedNextTime = getExpectedNextCandleTime(lastCandle.time, state.tf);

      if (incoming.time === expectedNextTime) {
        if (state.activeBucketNeedsHistoryHeal) {
          shouldScheduleRecentHistoryHeal = true;
          recentHistoryHealReason = 'closed_bucket_missing_explicit_high_low';
        }

        state.candleCache.push(incoming);
        cacheChanged = true;
        canonicalEvents.push({
          type: 'append',
          symbol: state.symbol,
          tf: state.tf,
          candle: incoming,
        });
        this.logPipeline('append', {
          symbol: state.symbol,
          tf: state.tf,
          candleTime: incoming.time,
          previousTime: lastCandle.time,
          gapCandles: 0,
        });
        state.hasLiveEdgeForSubscription = true;
        state.hasStaleHistoryForSubscription = false;
        state.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
        continue;
      }

      if (incoming.time > expectedNextTime) {
        if (isWithinLiveBucketHorizon(incoming.time, state.tf)) {
          const gapFillCandles = buildFlatGapCandles(lastCandle, incoming.time, state.tf);

          if (
            !state.hasLiveEdgeForSubscription &&
            gapFillCandles.length <= CandlesWebSocketService.MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES
          ) {
            state.candleCache.push(...gapFillCandles, incoming);
            cacheChanged = true;
            shouldFullSync = true;
            fullSyncReason = 'resync';
            shouldScheduleRecentHistoryHeal = gapFillCandles.length > 0;
            if (gapFillCandles.length > 0) {
              recentHistoryHealReason = 'initial_handoff_gap_fill_backfill';
            }
            this.logPipeline('initial_handoff_rebuild', {
              symbol: state.symbol,
              tf: state.tf,
              incomingTime: incoming.time,
              lastHistoryTime: lastCandle.time,
              gapCandles: gapFillCandles.length,
              action: 'full_sync',
            });
            state.hasLiveEdgeForSubscription = true;
            state.hasStaleHistoryForSubscription = false;
            state.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
            continue;
          }

          if (!state.hasLiveEdgeForSubscription) {
            this.logPipeline('initial_handoff_blocked', {
              symbol: state.symbol,
              tf: state.tf,
              incomingTime: incoming.time,
              lastHistoryTime: lastCandle.time,
              gapCandles: gapFillCandles.length,
              action: 'resync_required',
            });
            this.requestResync(state, 'history_stale_live_handoff_blocked');
            continue;
          }

          if (gapFillCandles.length <= CandlesWebSocketService.MAX_AUTO_GAP_FILL_CANDLES) {
            if (state.activeBucketNeedsHistoryHeal || gapFillCandles.length > 0) {
              shouldScheduleRecentHistoryHeal = true;
              recentHistoryHealReason =
                gapFillCandles.length > 0 ? 'gap_fill_backfill' : 'closed_bucket_missing_explicit_high_low';
            }

            for (const filler of gapFillCandles) {
              state.candleCache.push(filler);
              canonicalEvents.push({
                type: 'append',
                symbol: state.symbol,
                tf: state.tf,
                candle: filler,
              });
            }

            state.candleCache.push(incoming);
            cacheChanged = true;
            canonicalEvents.push({
              type: 'append',
              symbol: state.symbol,
              tf: state.tf,
              candle: incoming,
            });
            this.logPipeline('append_with_gap_fill', {
              symbol: state.symbol,
              tf: state.tf,
              incomingTime: incoming.time,
              previousTime: lastCandle.time,
              gapCandles: gapFillCandles.length,
            });
            state.hasLiveEdgeForSubscription = true;
            state.hasStaleHistoryForSubscription = false;
            state.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
            continue;
          }
        }

        this.requestResync(state, 'unexpected_time_gap');
        continue;
      }

      const existingIdx = state.candleCache.findIndex((candle) => candle.time === incoming.time);
      if (existingIdx === -1) {
        this.requestResync(state, 'out_of_order_missing_bucket');
        continue;
      }

      const mergedHistorical = mergeCandleUpdate(state.candleCache[existingIdx], incoming);
      if (!mergedHistorical) {
        this.requestResync(state, 'invalid_historical_patch');
        continue;
      }

      state.candleCache[existingIdx] = mergedHistorical;
      cacheChanged = true;
      shouldFullSync = true;
      fullSyncReason = 'historical_patch';
    }

    if (!cacheChanged) {
      return;
    }

    if (state.candleCache.length > 2500) {
      state.candleCache = state.candleCache.slice(-2500);
      shouldFullSync = true;
      fullSyncReason = 'historical_patch';
    }

    if (shouldFullSync) {
      if (shouldScheduleRecentHistoryHeal) {
        this.scheduleRecentHistoryHeal(state, recentHistoryHealReason);
      }
      this.emitFullSync(state, fullSyncReason);
      return;
    }

    const incrementalCandles = canonicalEvents
      .filter(
        (event): event is Extract<CandleStreamEvent, { type: 'append' | 'replace_last' }> =>
          event.type === 'append' || event.type === 'replace_last',
      )
      .map((event) => event.candle);

    if (incrementalCandles.length > 0) {
      this.emitTickListeners(state.symbol, state.tf, incrementalCandles);
    }

    canonicalEvents.forEach((event) => this.emitStreamEvent(event));
    this.notifyArrayListeners(state.symbol, state.tf, state.candleCache);
    this.updatePublicSnapshot(state, state.candleCache);

    if (shouldScheduleRecentHistoryHeal) {
      this.scheduleRecentHistoryHeal(state, recentHistoryHealReason);
    }
  }

  private scheduleRecentHistoryHeal(state: SubscriptionState, reason: string): void {
    if (!this.isTrackedState(state)) {
      return;
    }

    this.clearStateRecentHistoryHealTimer(state);
    state.recentHistoryHealTimer = setTimeout(() => {
      state.recentHistoryHealTimer = null;

      if (!this.isTrackedState(state)) {
        return;
      }

      if (state.isHistoryLoading || state.isRecentHistoryHealInFlight) {
        return;
      }

      state.isRecentHistoryHealInFlight = true;

      void getCandleHistory(state.symbol, state.tf, CandlesWebSocketService.RECENT_HISTORY_HEAL_LIMIT)
        .then((history) => {
          if (!this.isTrackedState(state)) {
            return;
          }

          const healedCandles = sortAndDedupeCandles(history.candles);
          if (healedCandles.length === 0) {
            return;
          }

          const changed = this.applyRecentHistoryHeal(state, healedCandles);

          this.logPipeline('recent_history_heal', {
            symbol: state.symbol,
            tf: state.tf,
            reason,
            fetchedCount: healedCandles.length,
            cacheChanged: changed,
          });

          if (changed) {
            this.emitFullSync(state, 'historical_patch');
          }
        })
        .catch((error) => {
          this.logPipeline('recent_history_heal_failed', {
            symbol: state.symbol,
            tf: state.tf,
            reason,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (this.isTrackedState(state)) {
            state.isRecentHistoryHealInFlight = false;
          }
        });
    }, CandlesWebSocketService.RECENT_HISTORY_HEAL_DELAY_MS);
  }

  private applyRecentHistoryHeal(state: SubscriptionState, recentHistory: Candle[]): boolean {
    if (state.candleCache.length === 0) {
      return false;
    }

    const currentLastTime = state.candleCache[state.candleCache.length - 1].time;
    const cacheTimes = new Map(state.candleCache.map((candle, index) => [candle.time, index]));
    const nextCache = [...state.candleCache];
    let changed = false;

    for (const historical of recentHistory) {
      if (!isStructurallyValidCandle(historical) || !isBucketAlignedCandle(historical, state.tf)) {
        continue;
      }

      const existingIndex = cacheTimes.get(historical.time);
      if (existingIndex === undefined) {
        if (historical.time < currentLastTime) {
          nextCache.push(historical);
          changed = true;
        }
        continue;
      }

      const existing = nextCache[existingIndex];
      const healed =
        historical.time < currentLastTime
          ? historical
          : mergeCandleUpdate(existing, historical) ?? historical;

      if (!this.areCandlesEqual(existing, healed)) {
        nextCache[existingIndex] = healed;
        changed = true;
      }
    }

    if (!changed) {
      return false;
    }

    state.candleCache = sortAndDedupeCandles(nextCache);
    return true;
  }

  private areCandlesEqual(a: Candle, b: Candle): boolean {
    return (
      a.time === b.time &&
      a.open === b.open &&
      a.high === b.high &&
      a.low === b.low &&
      a.close === b.close &&
      a.volume === b.volume
    );
  }
}

export const candlesWsService = CandlesWebSocketService.getInstance();
