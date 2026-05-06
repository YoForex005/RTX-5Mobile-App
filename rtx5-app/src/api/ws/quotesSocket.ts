/**
 * Core module: quotesSocket.ts
 */

import { useTradingState } from '../../state/tradingState';
import { AppState, NativeEventSubscription } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { quotes as mockQuotes } from '../../dev/mock/tradingData';
import { recordUiFeedGap } from '../../dev/uiInteractionDiagnostics';
import { applyQuoteSubscriptionDelta, buildActiveQuoteSymbols } from './quoteSubscriptionState';
import { normalizeQuoteTickPayload, type QuoteTickEvent } from './quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from './quoteTimestamp';
import { hasQuotePriceChange } from '../../utils/quotePriceChange';
import { normalizeSymbol } from '../../domain/symbols';
import { liveCandleStream } from '../../domain/candles/stream/liveCandleStream';

const symbolSpecs = new Map(mockQuotes.map((q) => [q.symbol, q]));

const shouldLogCandleDiagnostics = (): boolean =>
  typeof __DEV__ === 'undefined' || __DEV__;

/**
 * High-frequency WebSocket service delivering minimal-latency Bid/Ask quote ticks.
 * Syncs directly into a Zustand store, aggregating batches via requestAnimationFrame for performance.
 */
export class QuotesWebSocketService {
  private static instance: QuotesWebSocketService;
  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_QUOTES_WS_URL || 'wss://backend.orrnn.com/ws/feed';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private reconnectCooldownMs = 60000;
  private isConnected = false;
  private shouldReconnect = false;

  private activeSymbols: Set<string> = new Set();
  private stickySymbols: Set<string> = new Set();
  private symbolConsumerCounts: Map<string, number> = new Map();
  private pendingUpdates: Map<string, any> = new Map();
  private flushScheduled = false;
  private flushAnimationFrame: number | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private lastMessageAt: number = Date.now();
  private lastRecordedFeedGapAt: number = 0;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private tickListeners: Set<(tick: QuoteTickEvent) => void> = new Set();
  // Per-symbol listeners — fire synchronously for each parsed tick, bypassing
  // the global Zustand state pipeline. This is the canonical path for live
  // bid/ask UI on the Quotes screen because it survives JS-thread throttling
  // that can stall the rAF/setTimeout-driven `flushUpdates` queue under load.
  private symbolListeners: Map<string, Set<(tick: QuoteTickEvent) => void>> = new Map();
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

  public addTickListener(listener: (tick: QuoteTickEvent) => void): void {
    this.tickListeners.add(listener);
    this.logCandleFeed('tick_listener_added', { listeners: this.tickListeners.size }, 10);
  }

  public removeTickListener(listener: (tick: QuoteTickEvent) => void): void {
    this.tickListeners.delete(listener);
    this.logCandleFeed('tick_listener_removed', { listeners: this.tickListeners.size }, 10);
  }

  /**
   * Subscribe to ticks for a specific symbol with synchronous delivery.
   *
   * This is the canonical live-bid/ask path for the Quotes screen. Each parsed
   * tick is emitted to the symbol's listeners immediately — there's no queue,
   * no rAF, no setTimeout, and no Zustand setState in between. The component
   * receives the bid/ask within the same JS turn the WS message was parsed,
   * which means it cannot be stalled by JS-thread throttling that blocks the
   * batched `flushUpdates` pipeline.
   *
   * Also takes care of demand-counting so the underlying socket subscription
   * is opened/closed automatically when the first/last consumer arrives/leaves.
   *
   * Returns an unsubscribe function. Always call it on component unmount.
   */
  public subscribeToSymbol(
    symbol: string,
    listener: (tick: QuoteTickEvent) => void,
  ): () => void {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) {
      return () => {};
    }

    this.symbolConsumerCounts = applyQuoteSubscriptionDelta(
      this.symbolConsumerCounts,
      [normalized],
      1,
    );
    this.syncActiveSymbols();

    let bucket = this.symbolListeners.get(normalized);
    if (!bucket) {
      bucket = new Set();
      this.symbolListeners.set(normalized, bucket);
    }
    bucket.add(listener);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      const set = this.symbolListeners.get(normalized);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.symbolListeners.delete(normalized);
        }
      }
      this.symbolConsumerCounts = applyQuoteSubscriptionDelta(
        this.symbolConsumerCounts,
        [normalized],
        -1,
      );
      this.syncActiveSymbols();
    };
  }

  private emitSymbolTick(symbol: string, tick: QuoteTickEvent): void {
    const bucket = this.symbolListeners.get(symbol);
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

  /**
   * Dispatches the initial connection sequence and applies auto-reconnect logic.
   */
  public connect(): void {
    if (!this.hasActiveDemand()) {
      this.shouldReconnect = false;
      return;
    }

    this.shouldReconnect = true;
    this.clearReconnectTimer();

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
          this.applyPayload(payload);
        } catch (e) {
          console.warn('[Quotes WS] Parse error', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[Quotes WS] Closed');
        this.teardownSocket(false);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
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
      if (staleFor > 35000) {
        console.warn(`[Quotes WS] Silent TCP drop detected (${Math.round(staleFor/1000)}s). Healing invisibly...`);
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
    recordUiFeedGap(
      'quotes.ws.gap',
      feedGapMs,
      `${this.activeSymbols.size} active symbol(s)`,
    );
  }

  /**
   * Subscribes to tick updates for a batch of symbols.
   * Does not overwrite existing active symbols.
   * @param symbols - Array of strings (e.g., ['EURUSD', 'BTCUSD'])
   */
  public subscribe(symbols: string[]): void {
    this.symbolConsumerCounts = applyQuoteSubscriptionDelta(this.symbolConsumerCounts, symbols, 1);
    this.logCandleFeed('subscribe_requested', { symbols }, 20);
    this.syncActiveSymbols();
  }

  public unsubscribe(symbols: string[]): void {
    this.symbolConsumerCounts = applyQuoteSubscriptionDelta(this.symbolConsumerCounts, symbols, -1);
    this.logCandleFeed('unsubscribe_requested', { symbols }, 20);
    this.syncActiveSymbols();
  }

  /**
   * Exact override for the active symbol subscription list.
   * Triggers an immediate diff sync over the active socket.
   */
  public setSubscriptions(symbols: string[]): void {
    this.stickySymbols = new Set(symbols);
    this.syncActiveSymbols();
  }

  private sendSubscription(): void {
    const syms = Array.from(this.activeSymbols);
    if (syms.length > 0) this.send({ type: 'subscribe', symbols: syms });
  }

  private syncActiveSymbols(): void {
    const nextActiveSymbols = new Set(buildActiveQuoteSymbols(this.stickySymbols, this.symbolConsumerCounts));
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
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 45000);
        console.log(`[Quotes WS] Reconnecting in ${Math.round(delay)}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.scheduleReconnect(delay);
      })
      .catch(() => {
        if (!this.shouldReconnect || !this.hasActiveDemand()) {
          return;
        }

        const fallbackDelay = Math.min(this.reconnectDelay * Math.pow(1.5, Math.max(this.reconnectAttempts, 1) - 1), 15000);
        console.warn(`[Quotes WS] Network status check failed. Retrying in ${Math.round(fallbackDelay)}ms.`);
        this.scheduleReconnect(fallbackDelay);
      });
  }

  private hasActiveDemand(): boolean {
    return this.activeSymbols.size > 0;
  }

  private logCandleFeed(event: string, details?: Record<string, unknown>, limit = 12): void {
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
    this.cancelFlush();
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
    }
  }

  // ─── Tick Processing ─────────────────────────────────────────────────────────

  private applyPayload(payload: any) {
    let hasUpdates = false;
    const applyCandidate = (candidate: unknown) => {
      if (this.applyTick(candidate)) hasUpdates = true;
    };
    const payloadRecord = payload && typeof payload === 'object' ? payload : null;

    if (Array.isArray(payload)) {
      payload.forEach(applyCandidate);
    } else if (payloadRecord?.data && Array.isArray(payloadRecord.data)) {
      payloadRecord.data.forEach(applyCandidate);
    } else if (payloadRecord?.data && typeof payloadRecord.data === 'object') {
      applyCandidate(payloadRecord.data);
    } else {
      applyCandidate(payload);
    }

    if (hasUpdates) {
      this.scheduleFlush();
    }
  }

  private applyTick(data: any): boolean {
    const receivedAt = Date.now();
    const normalized = normalizeQuoteTickPayload(data, receivedAt);
    if (!normalized.ok) {
      this.logCandleFeed('tick_dropped_before_store', {
        reason: normalized.reason,
        rawKeys: normalized.rawKeys,
      });
      return false;
    }

    const normalizedUpdate = normalized.update;
    const normalizedTimestamp = normalizedUpdate.timestamp;
    const normalizedTimestampMs = normalizeQuoteTickTimestampToMs(normalizedTimestamp);
    const liveListenerTimestamp = normalizedTimestamp ?? receivedAt;
    if (normalizedUpdate.timestampSource === 'received_at') {
      this.logCandleFeed('tick_timestamp_fallback_received_at', {
        symbol: normalizedUpdate.symbol,
        timestamp: normalizedTimestamp,
        rawKeys: normalizedUpdate.rawKeys,
      }, 20);
    }
    data = {
      ...(data && typeof data === 'object' ? data : {}),
      symbol: normalizedUpdate.symbol,
      bid: normalizedUpdate.bid,
      ask: normalizedUpdate.ask,
      ...(normalizedUpdate.last === undefined ? {} : { last: normalizedUpdate.last }),
      ...(normalizedUpdate.high === undefined ? {} : { high: normalizedUpdate.high }),
      ...(normalizedUpdate.low === undefined ? {} : { low: normalizedUpdate.low }),
      ...(normalizedUpdate.open === undefined ? {} : { open: normalizedUpdate.open }),
      ...(normalizedUpdate.dailyOpen === undefined ? {} : { dailyOpen: normalizedUpdate.dailyOpen }),
      ...(normalizedUpdate.previousClose === undefined ? {} : { previousClose: normalizedUpdate.previousClose }),
      ...(normalizedUpdate.changePct === undefined ? {} : { changePct: normalizedUpdate.changePct }),
      ...(normalizedUpdate.spread === undefined ? {} : { spread: normalizedUpdate.spread }),
      ...(normalizedUpdate.volume === undefined ? {} : { volume: normalizedUpdate.volume }),
      ...(normalizedUpdate.digits === undefined ? {} : { digits: normalizedUpdate.digits }),
      feedTickAt: normalizedTimestampMs ?? undefined,
      lastReceivedAt: receivedAt,
      ...(normalizedTimestamp === null
        ? {}
        : {
            time: normalizedTimestamp,
            timestamp: normalizedTimestamp,
            t: normalizedTimestamp,
          }),
    };

    const tickEvent: QuoteTickEvent = {
      symbol: normalizedUpdate.symbol,
      bid: normalizedUpdate.bid,
      ask: normalizedUpdate.ask,
      last: normalizedUpdate.last,
      high: normalizedUpdate.high,
      low: normalizedUpdate.low,
      open: normalizedUpdate.open,
      dailyOpen: normalizedUpdate.dailyOpen,
      previousClose: normalizedUpdate.previousClose,
      changePct: normalizedUpdate.changePct,
      spread: normalizedUpdate.spread,
      volume: normalizedUpdate.volume,
      digits: normalizedUpdate.digits,
      feedTickAt: normalizedTimestampMs ?? undefined,
      receivedAt,
      timestamp: liveListenerTimestamp,
    };
    this.emitTick(tickEvent);
    // Fan out to per-symbol listeners synchronously. This is the path the
    // Quotes screen relies on for live bid/ask updates — it doesn't need to
    // wait for the rAF/setTimeout-driven Zustand flush.
    this.emitSymbolTick(normalizedUpdate.symbol, tickEvent);
    // Extend the chart's active candle so its close (and wick high/low) keep
    // ticking in real time even when the backend candle channel is quiet
    // between authoritative snapshots. The engine guards this strictly:
    //   - Only updates an EXISTING bucket created by backend.
    //   - Never invents a new bucket / closed-history candle.
    //   - Backend live_candle snapshots fully overwrite the bucket on arrival,
    //     preserving backend authority on every snapshot.
    // We pick `bid` as the price source (matches the configured candle price
    // basis); falling back to `ask` if `bid` is somehow missing.
    const tickPriceForCandle = Number.isFinite(normalizedUpdate.bid)
      ? normalizedUpdate.bid
      : Number.isFinite(normalizedUpdate.ask)
        ? normalizedUpdate.ask
        : null;
    if (tickPriceForCandle !== null) {
      try {
        liveCandleStream.extendActiveCandlesFromQuoteTick(normalizedUpdate.symbol, {
          price: tickPriceForCandle,
          time: liveListenerTimestamp,
        });
      } catch (_error) {
        // Defensive: under hot-module-reload the singleton may pre-date this
        // method on its prototype. Skip silently — the chart still receives
        // backend candle snapshots via the dedicated candle WS.
      }
    }
    this.logCandleFeed('tick_emitted_to_quote_listeners', {
      symbol: normalizedUpdate.symbol,
      bid: normalizedUpdate.bid,
      ask: normalizedUpdate.ask,
      timestamp: liveListenerTimestamp,
      feedTickAt: normalizedTimestampMs,
      receivedAt,
      rawKeys: normalizedUpdate.rawKeys,
    }, 8);

    // Preserve intra-flush quote extremes. When several ticks arrive within
    // the same event-loop turn, naively overwriting the pending entry would
    // discard any spike high or dip low before quote consumers can render it.
    const existing = this.pendingUpdates.get(normalizedUpdate.symbol);
    if (existing) {
      const prevHigh = typeof existing.bidHigh === 'number' ? existing.bidHigh : existing.bid;
      const prevLow = typeof existing.bidLow === 'number' ? existing.bidLow : existing.bid;
      data = {
        ...data,
        bidHigh: Math.max(prevHigh, data.bid),
        bidLow: Math.min(prevLow, data.bid),
      };
    } else {
      data = { ...data, bidHigh: data.bid, bidLow: data.bid };
    }

    this.pendingUpdates.set(normalizedUpdate.symbol, data);
    return true;
  }

  private emitTick(tick: QuoteTickEvent): void {
    this.tickListeners.forEach((listener) => {
      try {
        listener(tick);
      } catch (error) {
        console.warn('[Quotes WS] Tick listener error', error);
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) {
      return;
    }

    // Coalesce inbound ticks to the next visual frame so React isn't asked to
    // re-render once per WS message. Race rAF and setTimeout — whichever fires
    // first wins. We can't rely on rAF alone: under the React Native new
    // architecture, the JS animation loop can be paused (no active animations
    // / scrolling), so rAF callbacks may never fire and the flush would be
    // stranded forever. setTimeout(16) is the unconditional safety net.
    this.flushScheduled = true;
    const commitFlush = () => {
      if (this.flushAnimationFrame !== null) {
        cancelAnimationFrame(this.flushAnimationFrame);
        this.flushAnimationFrame = null;
      }
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      if (!this.flushScheduled) {
        return;
      }
      this.flushScheduled = false;
      this.flushUpdates();
    };

    this.flushTimer = setTimeout(commitFlush, 16);
    if (typeof requestAnimationFrame === 'function') {
      this.flushAnimationFrame = requestAnimationFrame(commitFlush);
    }
  }

  private cancelFlush(): void {
    if (this.flushAnimationFrame !== null) {
      cancelAnimationFrame(this.flushAnimationFrame);
      this.flushAnimationFrame = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushScheduled = false;
    this.pendingUpdates.clear();
  }

  private flushUpdates(): void {
    if (this.pendingUpdates.size === 0) return;

    const updates = this.pendingUpdates;
    this.pendingUpdates = new Map();
    const now = Date.now();

    useTradingState.setState((state) => {
      const newQuotes = { ...state.quotes };
      let priceChangeCount = 0;

      updates.forEach((data, symbol) => {
        const bid: number = data.bid;
        const ask: number = data.ask;
        const existing = newQuotes[symbol];
        const spec = symbolSpecs.get(symbol);
        const feedTickAt =
          normalizeQuoteTickTimestampToMs(data.feedTickAt ?? data.lastTickAt ?? data.timestamp ?? data.time ?? data.t);
        const lastReceivedAt =
          normalizeQuoteTickTimestampToMs(data.lastReceivedAt) ?? now;
        const lastTickAt = feedTickAt ?? now;
        const priceChanged = hasQuotePriceChange(existing, {
          bid,
          ask,
          bidHigh: data.bidHigh,
          bidLow: data.bidLow,
        });
        const lastPriceChangedAt = priceChanged
          ? lastReceivedAt
          : existing?.lastPriceChangedAt;

        if (!existing) {
          const digits = data.digits ?? spec?.digits ?? 5;
          const volume = data.volume ?? spec?.volume ?? 0;
          const entry: any = {
            symbol,
            digits,
            volume,
            feedTickAt,
            lastTickAt,
            lastReceivedAt,
            lastPriceChangedAt,
            bid,
            ask,
          };
          // Copy spec defaults then server data in one pass
          if (spec) { const s = spec as any; for (const k in s) { if (entry[k] === undefined) entry[k] = s[k]; } }
          for (const k in data) { if (k !== 'symbol') entry[k] = data[k]; }
          entry.feedTickAt = feedTickAt ?? undefined;
          entry.lastTickAt = lastTickAt;
          entry.lastReceivedAt = lastReceivedAt;
          entry.lastPriceChangedAt = lastPriceChangedAt;
          entry.spread = (ask - bid) * Math.pow(10, digits);
          newQuotes[symbol] = entry;
        } else {
          const digits = existing.digits ?? data.digits ?? spec?.digits ?? 5;
          const volume = data.volume ?? existing.volume ?? spec?.volume ?? 0;

          // Single object creation — merge existing + server data in one allocation
          const updated: any = {};
          // Copy existing (cheapest — already has spec baked in from first tick)
          for (const k in existing) { updated[k] = (existing as any)[k]; }
          // Overlay server-sent fields
          for (const k in data) { updated[k] = data[k]; }
          // Override computed fields
          updated.symbol = symbol;
          updated.bid = bid;
          updated.ask = ask;
          updated.digits = digits;
          updated.volume = volume;
          updated.feedTickAt = feedTickAt ?? undefined;
          updated.lastTickAt = lastTickAt;
          updated.lastReceivedAt = lastReceivedAt;
          updated.lastPriceChangedAt = lastPriceChangedAt;
          updated.spread = (ask - bid) * Math.pow(10, digits);
          updated.prevBid = bid !== existing.bid ? existing.bid : existing.prevBid;
          updated.prevAsk = ask !== existing.ask ? existing.ask : existing.prevAsk;
          newQuotes[symbol] = updated;
        }

        if (priceChanged) {
          priceChangeCount += 1;
        }
      });

      // Always bump tickCount per flushed symbol so live-feed subscribers
      // re-render on every tick — including identical-price heartbeats.
      // priceChangeCount is retained as a hint but not used for gating.
      void priceChangeCount;
      return { quotes: newQuotes, tickCount: state.tickCount + updates.size };
    });
  }
}

export type { QuoteTickEvent } from './quoteTickNormalizer';

type GlobalQuotesWebSocketRegistry = typeof globalThis & {
  __RTX5_QUOTES_WS_SERVICE__?: QuotesWebSocketService;
};

const quotesWebSocketRegistry = globalThis as GlobalQuotesWebSocketRegistry;

export const quotesWsService =
  quotesWebSocketRegistry.__RTX5_QUOTES_WS_SERVICE__ ??
  (quotesWebSocketRegistry.__RTX5_QUOTES_WS_SERVICE__ = QuotesWebSocketService.getInstance());
