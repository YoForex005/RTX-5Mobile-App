/**
 * Core module: quotesSocket.ts
 */

import { useTradingState } from '../../state/tradingState';
import { AppState, NativeEventSubscription } from 'react-native';
import { quotes as mockQuotes } from '../../mock/tradingData';
import { recordUiFeedGap } from '../../dev/uiInteractionDiagnostics';
import { applyQuoteSubscriptionDelta, buildActiveQuoteSymbols } from './quoteSubscriptionState';
import { resolveQuoteTickTimestamp } from './quoteTimestamp';

const symbolSpecs = new Map(mockQuotes.map((q) => [q.symbol, q]));


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
  private isConnected = false;

  private activeSymbols: Set<string> = new Set();
  private stickySymbols: Set<string> = new Set();
  private symbolConsumerCounts: Map<string, number> = new Map();
  private pendingUpdates: Map<string, any> = new Map();
  private flushScheduled = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private lastMessageAt: number = Date.now();
  private lastRecordedFeedGapAt: number = 0;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private tickListeners: Set<(tick: QuoteTickEvent) => void> = new Set();

  private constructor() {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[Quotes WS] App wake up detected. Reconnecting feed...');
        this.triggerInvisibleReconnect();
      }
    });
  }

  private triggerInvisibleReconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch (e) {}
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
  }

  public removeTickListener(listener: (tick: QuoteTickEvent) => void): void {
    this.tickListeners.delete(listener);
  }

  /**
   * Dispatches the initial connection sequence and applies auto-reconnect logic.
   */
  public connect(): void {
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
        this.stopHeartbeat();
        this.stopWatchdog();
        this.isConnected = false;
        this.ws = null;
        this.cancelFlush();
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.warn('[Quotes WS] Connection error (will auto-reconnect)');
      };
    } catch (e) {
      console.error('[Quotes WS] Connection failed', e);
      this.attemptReconnect();
    }
  }

  public disconnect(): void {
    this.cancelFlush();
    this.stopHeartbeat();
    this.stopWatchdog();
    this.activeSymbols.clear();
    this.stickySymbols.clear();
    this.symbolConsumerCounts.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
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
    this.syncActiveSymbols();
  }

  public unsubscribe(symbols: string[]): void {
    this.symbolConsumerCounts = applyQuoteSubscriptionDelta(this.symbolConsumerCounts, symbols, -1);
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
      return;
    }

    this.activeSymbols = nextActiveSymbols;
    if (this.isConnected) {
      this.sendSubscription();
    }
  }

  private send(msg: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      console.log(`[Quotes WS] Reconnecting in ${Math.round(delay)}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('[Quotes WS] Max reconnect attempts reached.');
    }
  }

  // ─── Tick Processing ─────────────────────────────────────────────────────────

  private applyPayload(payload: any) {
    let hasUpdates = false;

    if (Array.isArray(payload)) {
      payload.forEach((d) => {
        if (this.applyTick(d)) hasUpdates = true;
      });
    } else if (payload.symbol && payload.bid != null && payload.ask != null) {
      if (this.applyTick(payload)) hasUpdates = true;
    } else if (payload.data && Array.isArray(payload.data)) {
      payload.data.forEach((d: any) => {
        if (this.applyTick(d)) hasUpdates = true;
      });
    }

    if (hasUpdates) {
      this.scheduleFlush();
    }
  }

  private applyTick(data: any): boolean {
    if (!data.symbol || data.bid == null || data.ask == null) return false;
    const normalizedTimestamp = resolveQuoteTickTimestamp(data);
    data = {
      ...data,
      time: normalizedTimestamp,
      timestamp: normalizedTimestamp,
      t: normalizedTimestamp,
    };

    this.emitTick({
      symbol: String(data.symbol),
      bid: data.bid,
      ask: data.ask,
      timestamp: normalizedTimestamp,
    });

    // Preserve intra-flush wick extremes. When several ticks arrive within
    // the same event-loop turn, naively overwriting the pending entry would
    // discard any spike high or dip low, leaving the candle wick incomplete.
    // We carry forward bidHigh / bidLow so the candle engine can replay the
    // extremes and grow the wick on both sides before settling on the close.
    const existing = this.pendingUpdates.get(data.symbol);
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

    this.pendingUpdates.set(data.symbol, data);
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

    // Flush in the same JS turn instead of going through RN's timer queue.
    // That removes a visible delay on the Trade rows where the arrow price
    // and floating P/L are driven directly from quote ticks.
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      this.flushUpdates();
    });
  }

  private cancelFlush(): void {
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

      updates.forEach((data, symbol) => {
        const bid: number = data.bid;
        const ask: number = data.ask;
        const existing = newQuotes[symbol];
        const spec = symbolSpecs.get(symbol);

        if (!existing) {
          const digits = data.digits ?? spec?.digits ?? 5;
          const volume = data.volume ?? spec?.volume ?? 0;
          const entry: any = { symbol, digits, volume, lastTickAt: now, bid, ask };
          // Copy spec defaults then server data in one pass
          if (spec) { const s = spec as any; for (const k in s) { if (entry[k] === undefined) entry[k] = s[k]; } }
          for (const k in data) { if (k !== 'symbol') entry[k] = data[k]; }
          entry.lastTickAt = now;
          entry.spread = (ask - bid) * Math.pow(10, digits);
          newQuotes[symbol] = entry;
        } else {
          const digits = existing.digits ?? data.digits ?? spec?.digits ?? 5;
          const volume = data.volume ?? (existing.volume ? existing.volume + (Math.floor(Math.random() * 8) + 1) : (spec?.volume ?? 0));

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
          updated.lastTickAt = now;
          updated.spread = (ask - bid) * Math.pow(10, digits);
          updated.prevBid = bid !== existing.bid ? existing.bid : existing.prevBid;
          updated.prevAsk = ask !== existing.ask ? existing.ask : existing.prevAsk;
          newQuotes[symbol] = updated;
        }
      });

      return { quotes: newQuotes, tickCount: state.tickCount + 1 };
    });
  }
}

export type QuoteTickEvent = {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
};

export const quotesWsService = QuotesWebSocketService.getInstance();
