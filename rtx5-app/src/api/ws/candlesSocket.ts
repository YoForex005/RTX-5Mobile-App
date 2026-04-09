/**
 * Core module: candlesSocket.ts
 */

import { AppState, NativeEventSubscription } from 'react-native';
import { Candle } from '../../state/tradingState';
import { getCandleHistory } from '../candles';
import {
  buildFlatGapCandles,
  CandleStreamEvent,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  getBucketGapCount,
  getCurrentBucketTime,
  getExpectedNextCandleTime,
  isBucketAlignedCandle,
  isStructurallyValidCandle,
  isWithinLiveBucketHorizon,
  mergeCandleUpdate,
  normalizeCandle,
  normalizeSymbol,
  normalizeTimeframe,
  sortAndDedupeCandles,
} from '../../domain/candles';

type CandleSubscription = {
  symbol: string;
  tf: string;
};

type TickListener = (symbol: string, tf: string, mutatedCandles: Candle[]) => void;
type ArrayListener = (symbol: string, tf: string, allCandles: Candle[]) => void;
type StreamListener = (event: CandleStreamEvent) => void;

type ParsedIncomingCandle = {
  candle: Candle;
  hasExplicitHighLow: boolean;
};

const hasFiniteField = (input: Record<string, unknown>, keys: string[]): boolean => {
  for (const key of keys) {
    const value = input[key];
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) {
      return true;
    }
  }

  return false;
};

/**
 * Dedicated WebSocket service for streaming real-time candlestick (OHLCV) updates.
 * The internal candle cache is the single source of truth for all renderers.
 */
export class CandlesWebSocketService {
  private static instance: CandlesWebSocketService;
  private static readonly MAX_AUTO_GAP_FILL_CANDLES = 5;
  // The initial REST->live handoff must be at least as strict as steady-state updates.
  // Larger rebuilds create detached probe candles when history is stale.
  private static readonly MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES = 5;
  private static readonly MAX_ACCEPTABLE_HISTORY_STALENESS_CANDLES = 5;
  private static readonly RECENT_HISTORY_HEAL_LIMIT = 12;
  private static readonly RECENT_HISTORY_HEAL_DELAY_MS = 900;

  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_CANDLES_WS_URL || 'ws://69.197.178.27/ws/feed';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 2000;
  private isConnected = false;

  private activeSubscription: CandleSubscription | null = null;

  private tickListeners: Set<TickListener> = new Set();
  private arrayListeners: Set<ArrayListener> = new Set();
  private streamListeners: Set<StreamListener> = new Set();

  public candleCache: Candle[] = [];
  private isHistoryLoading = false;
  private queuedWsTicks: ParsedIncomingCandle[] = [];
  private fetchController: AbortController | null = null;
  private hasLiveEdgeForSubscription = false;
  private hasSeededHistoryForSubscription = false;
  private hasStaleHistoryForSubscription = false;
  private activeBucketNeedsHistoryHeal = false;
  private recentHistoryHealTimer: NodeJS.Timeout | null = null;
  private isRecentHistoryHealInFlight = false;

  private heartbeatInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private lastMessageAt: number = Date.now();
  private resyncTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[Candles WS] App wake up detected. Reconnecting feed...');
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
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Candles WS] Connected to', this.url);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.startHeartbeat();
        this.startWatchdog();

        if (this.activeSubscription) {
          this.fetchHistoryAndSubscribe(this.activeSubscription.symbol, this.activeSubscription.tf, 'resync');
        }
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
        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        // The browser/RN WebSocket `error` event fires for any low-level
        // hiccup (network blip, server restart, TLS renegotiation) and
        // carries no useful information beyond "something went wrong" —
        // the actual recovery path is the `onclose` handler above which
        // calls attemptReconnect(). Logging this as console.error spams
        // the LogBox with a noisy red overlay every time the user briefly
        // loses signal, even though the reconnect succeeds within a
        // second. Downgrade to console.warn so it stays in Metro logs
        // for diagnostic purposes but no longer triggers the dev-mode
        // error overlay.
        console.warn('[Candles WS] connection error (will auto-reconnect via onclose)');
      };
    } catch (error) {
      console.error('[Candles WS] Connection failed', error);
      this.attemptReconnect();
    }
  }

  public disconnect(): void {
    this.fetchController?.abort();
    this.clearResyncTimer();
    this.clearRecentHistoryHealTimer();
    this.isRecentHistoryHealInFlight = false;

    if (this.ws) {
      this.activeSubscription = null;
      this.candleCache = [];
      this.isHistoryLoading = false;
      this.queuedWsTicks = [];
      this.hasLiveEdgeForSubscription = false;
      this.hasSeededHistoryForSubscription = false;
      this.hasStaleHistoryForSubscription = false;
      this.activeBucketNeedsHistoryHeal = false;
      this.stopHeartbeat();
      this.stopWatchdog();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  public subscribe(symbol: string, tf: string): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(tf);
    const isNew =
      normalizeSymbol(this.activeSubscription?.symbol ?? '') !== normalizedSymbol ||
      normalizeTimeframe(this.activeSubscription?.tf ?? '') !== normalizedTimeframe;

    if (!isNew) {
      if (!this.isHistoryLoading && !this.hasSeededHistoryForSubscription) {
        this.fetchHistoryAndSubscribe(normalizedSymbol, normalizedTimeframe, 'history_seed');
        return;
      }

      if (!this.isHistoryLoading) {
        this.emitFullSync(normalizedSymbol, normalizedTimeframe, 'history_seed');
      }
      return;
    }

    this.fetchController?.abort();
    this.clearResyncTimer();
    this.clearRecentHistoryHealTimer();

    this.activeSubscription = { symbol: normalizedSymbol, tf: normalizedTimeframe };
    this.candleCache = [];
    this.queuedWsTicks = [];
    this.isHistoryLoading = false;
    this.hasLiveEdgeForSubscription = false;
    this.hasSeededHistoryForSubscription = false;
    this.hasStaleHistoryForSubscription = false;
    this.activeBucketNeedsHistoryHeal = false;
    this.isRecentHistoryHealInFlight = false;

    this.emitFullSync(normalizedSymbol, normalizedTimeframe, 'subscription_change');

    if (this.isConnected) {
      this.fetchHistoryAndSubscribe(normalizedSymbol, normalizedTimeframe, 'history_seed');
    } else {
      this.connect();
    }
  }

  public unsubscribe(): void {
    this.fetchController?.abort();
    this.clearResyncTimer();
    this.clearRecentHistoryHealTimer();
    this.activeSubscription = null;
    this.candleCache = [];
    this.queuedWsTicks = [];
    this.isHistoryLoading = false;
    this.hasLiveEdgeForSubscription = false;
    this.hasSeededHistoryForSubscription = false;
    this.hasStaleHistoryForSubscription = false;
    this.activeBucketNeedsHistoryHeal = false;
    this.isRecentHistoryHealInFlight = false;
  }

  public addTickListener(listener: TickListener): void {
    this.tickListeners.add(listener);
    if (!this.isHistoryLoading && this.activeSubscription && this.candleCache.length > 0) {
      listener(this.activeSubscription.symbol, this.activeSubscription.tf, [this.candleCache[this.candleCache.length - 1]]);
    }
  }

  public removeTickListener(listener: TickListener): void {
    this.tickListeners.delete(listener);
  }

  public addArrayListener(listener: ArrayListener): void {
    this.arrayListeners.add(listener);
    if (!this.isHistoryLoading && this.activeSubscription) {
      listener(this.activeSubscription.symbol, this.activeSubscription.tf, [...this.candleCache]);
    }
  }

  public removeArrayListener(listener: ArrayListener): void {
    this.arrayListeners.delete(listener);
  }

  public addStreamListener(listener: StreamListener): void {
    this.streamListeners.add(listener);
    if (!this.isHistoryLoading && this.activeSubscription) {
      listener({
        type: 'full_sync',
        symbol: this.activeSubscription.symbol,
        tf: this.activeSubscription.tf,
        candles: [...this.candleCache],
        reason: 'history_seed',
      });
    }
  }

  public removeStreamListener(listener: StreamListener): void {
    this.streamListeners.delete(listener);
  }

  private triggerInvisibleReconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch (_error) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.stopHeartbeat();
    this.stopWatchdog();
    setTimeout(() => {
      this.reconnectAttempts = 0;
      this.connect();
    }, 500);
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
      if (!this.activeSubscription) return;

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

  private clearResyncTimer() {
    if (this.resyncTimer) {
      clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
    }
  }

  private clearRecentHistoryHealTimer() {
    if (this.recentHistoryHealTimer) {
      clearTimeout(this.recentHistoryHealTimer);
      this.recentHistoryHealTimer = null;
    }
  }

  private logPipeline(event: string, details: Record<string, unknown>) {
    try {
      console.log(`[Candles WS] ${event}`, details);
    } catch (_error) {}
  }

  private matchesActiveSubscription(symbol: string, tf: string): boolean {
    if (!this.activeSubscription) return false;

    return (
      normalizeSymbol(this.activeSubscription.symbol) === normalizeSymbol(symbol) &&
      normalizeTimeframe(this.activeSubscription.tf) === normalizeTimeframe(tf)
    );
  }

  private emitStreamEvent(event: CandleStreamEvent) {
    this.streamListeners.forEach((listener) => listener(event));
  }

  private notifyArrayListeners(symbol: string, tf: string, candles: Candle[]) {
    const snapshot = [...candles];
    this.arrayListeners.forEach((listener) => listener(symbol, tf, snapshot));
  }

  private emitTickListeners(symbol: string, tf: string, candles: Candle[]) {
    if (candles.length === 0) return;
    const snapshot = candles.map((candle) => ({ ...candle }));
    this.tickListeners.forEach((listener) => listener(symbol, tf, snapshot));
  }

  private emitFullSync(
    symbol: string,
    tf: string,
    reason: 'subscription_change' | 'history_seed' | 'resync' | 'historical_patch',
    candles: Candle[] = this.candleCache,
  ) {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(tf);
    const snapshot = [...candles];

    this.emitStreamEvent({
      type: 'full_sync',
      symbol: normalizedSymbol,
      tf: normalizedTimeframe,
      candles: snapshot,
      reason,
    });
    this.notifyArrayListeners(normalizedSymbol, normalizedTimeframe, snapshot);

    if (snapshot.length > 0) {
      this.emitTickListeners(normalizedSymbol, normalizedTimeframe, [snapshot[snapshot.length - 1]]);
    }
  }

  private requestResync(symbol: string, tf: string, reason: string): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(tf);

    if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) {
      return;
    }

    this.emitStreamEvent({
      type: 'resync_required',
      symbol: normalizedSymbol,
      tf: normalizedTimeframe,
      reason,
    });
    this.logPipeline('resync_required', {
      symbol: normalizedSymbol,
      tf: normalizedTimeframe,
      reason,
      cacheSize: this.candleCache.length,
      lastCacheTime: this.candleCache[this.candleCache.length - 1]?.time ?? null,
    });

    if (this.resyncTimer || this.isHistoryLoading) {
      return;
    }

    const delayMs = reason.startsWith('history_stale') ? 5000 : 50;

    this.resyncTimer = setTimeout(() => {
      this.resyncTimer = null;
      if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) {
        return;
      }
      this.fetchHistoryAndSubscribe(normalizedSymbol, normalizedTimeframe, 'resync');
    }, delayMs);
  }

  private fetchHistoryAndSubscribe(symbol: string, tf: string, reason: 'history_seed' | 'resync'): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(tf);

    if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) {
      return;
    }

    if (this.isHistoryLoading) {
      this.fetchController?.abort();
    }

    this.fetchController = new AbortController();
    const controller = this.fetchController;
    this.isHistoryLoading = true;
    this.queuedWsTicks = [];
    this.hasLiveEdgeForSubscription = false;
    this.hasSeededHistoryForSubscription = false;
    this.hasStaleHistoryForSubscription = false;
    this.activeBucketNeedsHistoryHeal = false;
    this.clearRecentHistoryHealTimer();
    this.logPipeline('history_fetch_start', {
      symbol: normalizedSymbol,
      tf: normalizedTimeframe,
      reason,
    });

    this.sendSubscription(normalizedSymbol, normalizedTimeframe);

    void getCandleHistory(normalizedSymbol, normalizedTimeframe, DEFAULT_CANDLE_HISTORY_LIMIT, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return;
        if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) return;

        const normalizedHistory = sortAndDedupeCandles(history.candles);
        const latestHistoryCandle = normalizedHistory[normalizedHistory.length - 1];
        const currentBucketTime = getCurrentBucketTime(normalizedTimeframe);
        const historyGapCount = latestHistoryCandle
          ? getBucketGapCount(latestHistoryCandle.time, currentBucketTime, normalizedTimeframe)
          : 0;
        const clientClockSuggestsStale =
          !!latestHistoryCandle &&
          historyGapCount > CandlesWebSocketService.MAX_ACCEPTABLE_HISTORY_STALENESS_CANDLES;

        // Keep the normalized history snapshot visible and validate the handoff
        // against the first live candle rather than the device clock alone.
        this.candleCache = normalizedHistory;
        this.isHistoryLoading = false;
        this.hasLiveEdgeForSubscription = false;
        this.hasSeededHistoryForSubscription = this.candleCache.length > 0;
        this.hasStaleHistoryForSubscription = clientClockSuggestsStale;
        this.activeBucketNeedsHistoryHeal = false;

        if (normalizedHistory.length > 0) {
          this.logPipeline('history_fetch_success', {
            symbol: normalizedSymbol,
            tf: normalizedTimeframe,
            reason,
            count: normalizedHistory.length,
            latestHistoryTime: latestHistoryCandle?.time ?? null,
            currentBucketTime,
            historyGapCount,
            accepted: true,
            clientClockSuggestsStale,
          });
          this.emitFullSync(normalizedSymbol, normalizedTimeframe, reason);
        }

        if (clientClockSuggestsStale) {
          this.logPipeline('history_fetch_client_clock_gap_detected', {
            symbol: normalizedSymbol,
            tf: normalizedTimeframe,
            reason,
            latestHistoryTime: latestHistoryCandle?.time ?? null,
            currentBucketTime,
            historyGapCount,
            action: 'wait_for_first_live_candle',
          });
        }

        if (this.queuedWsTicks.length > 0) {
          const queuedTicks = this.dedupeParsedIncomingCandles(this.queuedWsTicks);
          this.queuedWsTicks = [];
          this.processParsedCandles(queuedTicks, normalizedSymbol, normalizedTimeframe);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;

        console.warn('[Candles WS] History fetch failed, continuing with live stream only:', error);
        this.isHistoryLoading = false;
        this.hasLiveEdgeForSubscription = false;
        this.hasSeededHistoryForSubscription = false;
        this.hasStaleHistoryForSubscription = false;
        this.activeBucketNeedsHistoryHeal = false;
        this.logPipeline('history_fetch_failed', {
          symbol: normalizedSymbol,
          tf: normalizedTimeframe,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
        this.emitStreamEvent({
          type: 'resync_required',
          symbol: normalizedSymbol,
          tf: normalizedTimeframe,
          reason: 'history_fetch_failed',
        });

        if (this.queuedWsTicks.length > 0) {
          const queuedTicks = this.dedupeParsedIncomingCandles(this.queuedWsTicks);
          this.queuedWsTicks = [];
          this.processParsedCandles(queuedTicks, normalizedSymbol, normalizedTimeframe);
        }
      });
  }

  private sendSubscription(symbol: string, tf: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    const tfMap: Record<string, string> = {
      M1: '1m',
      M5: '5m',
      M15: '15m',
      M30: '30m',
      H1: '1h',
      H4: '4h',
      D1: '1d',
      W1: '1w',
      MN: '1M',
    };

    const msg = {
      type: 'subscribe_candles',
      symbol,
      tf: tfMap[normalizeTimeframe(tf)] || '1m',
    };

    this.ws.send(JSON.stringify(msg));
    console.log('[Candles WS] Subscribed:', msg);
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      setTimeout(() => this.connect(), delay);
    }
  }

  private handlePayload(payload: any) {
    if (!this.activeSubscription) return;

    const activeSymbol = normalizeSymbol(this.activeSubscription.symbol);
    const activeTimeframe = normalizeTimeframe(this.activeSubscription.tf);
    const payloadSymbol = typeof payload?.symbol === 'string' ? normalizeSymbol(payload.symbol) : activeSymbol;
    const payloadTimeframe = typeof payload?.tf === 'string' ? normalizeTimeframe(payload.tf) : activeTimeframe;

    if (payloadSymbol !== activeSymbol) {
      return;
    }

    if (payloadTimeframe !== activeTimeframe) {
      return;
    }

    const parsedCandles = this.extractParsedCandles(payload, payloadTimeframe);
    if (parsedCandles.length === 0) {
      return;
    }

    if (this.isHistoryLoading) {
      this.queuedWsTicks.push(...parsedCandles);
      return;
    }

    this.processParsedCandles(parsedCandles, activeSymbol, activeTimeframe);
  }

  private extractParsedCandles(payload: any, timeframe: string): ParsedIncomingCandle[] {
    const parsed: ParsedIncomingCandle[] = [];

    const pushParsed = (item: any) => {
      const candle = this.parseSingleCandlePayload(item, timeframe);
      if (candle) {
        parsed.push(candle);
      }
    };

    if (Array.isArray(payload)) {
      payload.forEach(pushParsed);
    } else if (payload?.data && Array.isArray(payload.data)) {
      payload.data.forEach(pushParsed);
    } else if (payload?.candles && Array.isArray(payload.candles)) {
      payload.candles.forEach(pushParsed);
    } else {
      pushParsed(payload?.candle ?? payload);
    }

    return this.dedupeParsedIncomingCandles(parsed);
  }

  private processParsedCandles(incomingCandles: ParsedIncomingCandle[], symbol: string, tf: string) {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(tf);

    if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) {
      return;
    }

    const canonicalEvents: CandleStreamEvent[] = [];
    let shouldFullSync = false;
    let fullSyncReason: 'history_seed' | 'resync' | 'historical_patch' = 'historical_patch';
    let cacheChanged = false;
    let shouldScheduleRecentHistoryHeal = false;
    let recentHistoryHealReason = 'closed_bucket_missing_explicit_high_low';

    for (const incomingEntry of incomingCandles) {
      const incoming = incomingEntry.candle;

      if (!isStructurallyValidCandle(incoming) || !isBucketAlignedCandle(incoming, normalizedTimeframe)) {
        this.requestResync(normalizedSymbol, normalizedTimeframe, 'invalid_ohlc_or_bucket');
        continue;
      }

      if (this.candleCache.length === 0) {
        this.candleCache = [incoming];
        cacheChanged = true;
        shouldFullSync = true;
        fullSyncReason = 'resync';
        this.hasLiveEdgeForSubscription = true;
        this.hasStaleHistoryForSubscription = false;
        this.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
        continue;
      }

      const lastCandle = this.candleCache[this.candleCache.length - 1];

      if (incoming.time === lastCandle.time) {
        const merged = mergeCandleUpdate(lastCandle, incoming);
        if (!merged) {
          this.requestResync(normalizedSymbol, normalizedTimeframe, 'invalid_replace_last');
          continue;
        }

        this.candleCache[this.candleCache.length - 1] = merged;
        cacheChanged = true;
        canonicalEvents.push({
          type: 'replace_last',
          symbol: normalizedSymbol,
          tf: normalizedTimeframe,
          candle: merged,
        });
        this.logPipeline('replace_last', {
          symbol: normalizedSymbol,
          tf: normalizedTimeframe,
          candleTime: merged.time,
          lastCacheTime: lastCandle.time,
        });
        this.hasLiveEdgeForSubscription = true;
        this.hasStaleHistoryForSubscription = false;
        this.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
        continue;
      }

      const expectedNextTime = getExpectedNextCandleTime(lastCandle.time, normalizedTimeframe);

      if (incoming.time === expectedNextTime) {
        if (this.activeBucketNeedsHistoryHeal) {
          shouldScheduleRecentHistoryHeal = true;
          recentHistoryHealReason = 'closed_bucket_missing_explicit_high_low';
        }

        this.candleCache.push(incoming);
        cacheChanged = true;
        canonicalEvents.push({
          type: 'append',
          symbol: normalizedSymbol,
          tf: normalizedTimeframe,
          candle: incoming,
        });
        this.logPipeline('append', {
          symbol: normalizedSymbol,
          tf: normalizedTimeframe,
          candleTime: incoming.time,
          previousTime: lastCandle.time,
          gapCandles: 0,
        });
        this.hasLiveEdgeForSubscription = true;
        this.hasStaleHistoryForSubscription = false;
        this.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
        continue;
      }

      if (incoming.time > expectedNextTime) {
        if (isWithinLiveBucketHorizon(incoming.time, normalizedTimeframe)) {
          const gapFillCandles = buildFlatGapCandles(lastCandle, incoming.time, normalizedTimeframe);

          if (
            !this.hasLiveEdgeForSubscription &&
            gapFillCandles.length <= CandlesWebSocketService.MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES
          ) {
            this.candleCache.push(...gapFillCandles, incoming);
            cacheChanged = true;
            shouldFullSync = true;
            fullSyncReason = 'resync';
            shouldScheduleRecentHistoryHeal = gapFillCandles.length > 0;
            if (gapFillCandles.length > 0) {
              recentHistoryHealReason = 'initial_handoff_gap_fill_backfill';
            }
            this.logPipeline('initial_handoff_rebuild', {
              symbol: normalizedSymbol,
              tf: normalizedTimeframe,
              incomingTime: incoming.time,
              lastHistoryTime: lastCandle.time,
              gapCandles: gapFillCandles.length,
              action: 'full_sync',
            });
            this.hasLiveEdgeForSubscription = true;
            this.hasStaleHistoryForSubscription = false;
            this.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
            continue;
          }

          if (!this.hasLiveEdgeForSubscription) {
            this.logPipeline('initial_handoff_blocked', {
              symbol: normalizedSymbol,
              tf: normalizedTimeframe,
              incomingTime: incoming.time,
              lastHistoryTime: lastCandle.time,
              gapCandles: gapFillCandles.length,
              action: 'resync_required',
            });
            this.requestResync(normalizedSymbol, normalizedTimeframe, 'history_stale_live_handoff_blocked');
            continue;
          }

          if (gapFillCandles.length <= CandlesWebSocketService.MAX_AUTO_GAP_FILL_CANDLES) {
            if (this.activeBucketNeedsHistoryHeal || gapFillCandles.length > 0) {
              shouldScheduleRecentHistoryHeal = true;
              recentHistoryHealReason = gapFillCandles.length > 0
                ? 'gap_fill_backfill'
                : 'closed_bucket_missing_explicit_high_low';
            }

            for (const filler of gapFillCandles) {
              this.candleCache.push(filler);
              canonicalEvents.push({
                type: 'append',
                symbol: normalizedSymbol,
                tf: normalizedTimeframe,
                candle: filler,
              });
            }

            this.candleCache.push(incoming);
            cacheChanged = true;
            canonicalEvents.push({
              type: 'append',
              symbol: normalizedSymbol,
              tf: normalizedTimeframe,
              candle: incoming,
            });
            this.logPipeline('append_with_gap_fill', {
              symbol: normalizedSymbol,
              tf: normalizedTimeframe,
              incomingTime: incoming.time,
              previousTime: lastCandle.time,
              gapCandles: gapFillCandles.length,
            });
            this.hasLiveEdgeForSubscription = true;
            this.hasStaleHistoryForSubscription = false;
            this.activeBucketNeedsHistoryHeal = !incomingEntry.hasExplicitHighLow;
            continue;
          }
        }

        this.requestResync(normalizedSymbol, normalizedTimeframe, 'unexpected_time_gap');
        continue;
      }

      const existingIdx = this.candleCache.findIndex((candle) => candle.time === incoming.time);
      if (existingIdx === -1) {
        this.requestResync(normalizedSymbol, normalizedTimeframe, 'out_of_order_missing_bucket');
        continue;
      }

      const mergedHistorical = mergeCandleUpdate(this.candleCache[existingIdx], incoming);
      if (!mergedHistorical) {
        this.requestResync(normalizedSymbol, normalizedTimeframe, 'invalid_historical_patch');
        continue;
      }

      this.candleCache[existingIdx] = mergedHistorical;
      cacheChanged = true;
      shouldFullSync = true;
      fullSyncReason = 'historical_patch';
    }

    if (!cacheChanged) {
      return;
    }

    if (this.candleCache.length > 2500) {
      this.candleCache = this.candleCache.slice(-2500);
      shouldFullSync = true;
      fullSyncReason = 'historical_patch';
    }

    if (shouldFullSync) {
      if (shouldScheduleRecentHistoryHeal) {
        this.scheduleRecentHistoryHeal(normalizedSymbol, normalizedTimeframe, recentHistoryHealReason);
      }
      this.emitFullSync(normalizedSymbol, normalizedTimeframe, fullSyncReason);
      return;
    }

    const incrementalCandles = canonicalEvents
      .filter((event): event is Extract<CandleStreamEvent, { type: 'append' | 'replace_last' }> => event.type === 'append' || event.type === 'replace_last')
      .map((event) => event.candle);

    if (incrementalCandles.length > 0) {
      this.emitTickListeners(normalizedSymbol, normalizedTimeframe, incrementalCandles);
    }

    canonicalEvents.forEach((event) => this.emitStreamEvent(event));
    this.notifyArrayListeners(normalizedSymbol, normalizedTimeframe, this.candleCache);

    if (shouldScheduleRecentHistoryHeal) {
      this.scheduleRecentHistoryHeal(normalizedSymbol, normalizedTimeframe, recentHistoryHealReason);
    }
  }

  private scheduleRecentHistoryHeal(symbol: string, tf: string, reason: string): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(tf);

    if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) {
      return;
    }

    this.clearRecentHistoryHealTimer();
    this.recentHistoryHealTimer = setTimeout(() => {
      this.recentHistoryHealTimer = null;

      if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) {
        return;
      }

      if (this.isHistoryLoading || this.isRecentHistoryHealInFlight) {
        return;
      }

      this.isRecentHistoryHealInFlight = true;

      void getCandleHistory(
        normalizedSymbol,
        normalizedTimeframe,
        CandlesWebSocketService.RECENT_HISTORY_HEAL_LIMIT,
      )
        .then((history) => {
          if (!this.matchesActiveSubscription(normalizedSymbol, normalizedTimeframe)) {
            return;
          }

          const healedCandles = sortAndDedupeCandles(history.candles);
          if (healedCandles.length === 0) {
            return;
          }

          const changed = this.applyRecentHistoryHeal(healedCandles, normalizedTimeframe);

          this.logPipeline('recent_history_heal', {
            symbol: normalizedSymbol,
            tf: normalizedTimeframe,
            reason,
            fetchedCount: healedCandles.length,
            cacheChanged: changed,
          });

          if (changed) {
            this.emitFullSync(normalizedSymbol, normalizedTimeframe, 'historical_patch');
          }
        })
        .catch((error) => {
          this.logPipeline('recent_history_heal_failed', {
            symbol: normalizedSymbol,
            tf: normalizedTimeframe,
            reason,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          this.isRecentHistoryHealInFlight = false;
        });
    }, CandlesWebSocketService.RECENT_HISTORY_HEAL_DELAY_MS);
  }

  private applyRecentHistoryHeal(recentHistory: Candle[], timeframe: string): boolean {
    if (this.candleCache.length === 0) {
      return false;
    }

    const currentLastTime = this.candleCache[this.candleCache.length - 1].time;
    const cacheTimes = new Map(this.candleCache.map((candle, index) => [candle.time, index]));
    const nextCache = [...this.candleCache];
    let changed = false;

    for (const historical of recentHistory) {
      if (!isStructurallyValidCandle(historical) || !isBucketAlignedCandle(historical, timeframe)) {
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

    this.candleCache = sortAndDedupeCandles(nextCache);
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

  private dedupeParsedIncomingCandles(entries: ParsedIncomingCandle[]): ParsedIncomingCandle[] {
    const sorted = [...entries].sort((a, b) => a.candle.time - b.candle.time);
    const deduped: ParsedIncomingCandle[] = [];

    for (const entry of sorted) {
      const last = deduped[deduped.length - 1];
      if (!last || last.candle.time !== entry.candle.time) {
        deduped.push(entry);
        continue;
      }

      const merged = mergeCandleUpdate(last.candle, entry.candle);
      if (!merged) {
        continue;
      }

      deduped[deduped.length - 1] = {
        candle: merged,
        hasExplicitHighLow: last.hasExplicitHighLow || entry.hasExplicitHighLow,
      };
    }

    return deduped;
  }

  private parseSingleCandlePayload(data: any, tf: string): ParsedIncomingCandle | null {
    if (!data) return null;
    const payload = typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!payload) return null;

    const candle = normalizeCandle(payload, tf);
    if (!candle) return null;

    return {
      candle,
      hasExplicitHighLow:
        hasFiniteField(payload, ['high', 'h', 'High', 'H']) &&
        hasFiniteField(payload, ['low', 'l', 'Low', 'L']),
    };
  }
}

export const candlesWsService = CandlesWebSocketService.getInstance();
