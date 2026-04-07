/**
 * Core module: quotesSocket.ts
 */

import { useTradingState } from '../../state/tradingState';
import { AppState, NativeEventSubscription } from 'react-native';
import { quotes as mockQuotes } from '../../mock/tradingData';

const symbolSpecs = new Map(mockQuotes.map((q) => [q.symbol, q]));


/**
 * High-frequency WebSocket service delivering minimal-latency Bid/Ask quote ticks.
 * Syncs directly into a Zustand store, aggregating batches via requestAnimationFrame for performance.
 */
export class QuotesWebSocketService {
  private static instance: QuotesWebSocketService;
  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_QUOTES_WS_URL || 'ws://69.197.178.27/ws/feed';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private isConnected = false;

  private activeSymbols: Set<string> = new Set();
  private pendingUpdates: Map<string, any> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private lastMessageAt: number = Date.now();
  private watchdogInterval: NodeJS.Timeout | null = null;

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
          this.lastMessageAt = Date.now();
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
    if (this.ws) {
      this.activeSymbols.clear();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
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

  /**
   * Subscribes to tick updates for a batch of symbols.
   * Does not overwrite existing active symbols.
   * @param symbols - Array of strings (e.g., ['EURUSD', 'BTCUSD'])
   */
  public subscribe(symbols: string[]): void {
    let changed = false;
    for (const sym of symbols) {
      if (!this.activeSymbols.has(sym)) {
        this.activeSymbols.add(sym);
        changed = true;
      }
    }
    if (changed && this.isConnected) this.sendSubscription();
  }

  public unsubscribe(symbols: string[]): void {
    let changed = false;
    for (const sym of symbols) {
      if (this.activeSymbols.has(sym)) {
        this.activeSymbols.delete(sym);
        changed = true;
      }
    }
    if (changed && this.isConnected) this.sendSubscription();
  }

  /**
   * Exact override for the active symbol subscription list.
   * Triggers an immediate diff sync over the active socket.
   */
  public setSubscriptions(symbols: string[]): void {
    this.activeSymbols = new Set(symbols);
    if (this.isConnected) this.sendSubscription();
  }

  private sendSubscription(): void {
    const syms = Array.from(this.activeSymbols);
    if (syms.length > 0) this.send({ type: 'subscribe', symbols: syms });
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
    // Normalize timestamp: some servers send `t` instead of `time`
    if (data.t != null && data.time == null) data = { ...data, time: data.t };
    this.pendingUpdates.set(data.symbol, data);
    return true;
  }

  private scheduleFlush(): void {
    if (!this.flushTimer) {
      // Throttle updates to roughly 60FPS to prevent JS thread locking
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushUpdates();
      }, 16);
    }
  }

  private cancelFlush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingUpdates.clear();
  }

  private flushUpdates(): void {
    if (this.pendingUpdates.size === 0) return;

    const updates = new Map(this.pendingUpdates);
    this.pendingUpdates.clear();

    useTradingState.setState((state) => {
      const newQuotes = { ...state.quotes };

      updates.forEach((data, symbol) => {
        const bid: number = data.bid;
        const ask: number = data.ask;
        const existing = newQuotes[symbol];
        const spec = symbolSpecs.get(symbol);
        const lastTickAt = Date.now();

        if (!existing) {
          const digits = data.digits ?? spec?.digits ?? 5;
          const volume = data.volume ?? spec?.volume ?? 0;
          newQuotes[symbol] = { ...spec, ...data, symbol, digits, volume, lastTickAt } as any;
          
          if (newQuotes[symbol].ask && newQuotes[symbol].bid) {
            newQuotes[symbol].spread = (newQuotes[symbol].ask - newQuotes[symbol].bid) * Math.pow(10, digits);
          }
        } else {
          // Spread ALL fields the server sends (high, low, changePct, volume, t, etc.)
          // then override with our computed values so nothing is silently dropped.
          const digits = existing.digits ?? data.digits ?? spec?.digits ?? 5;
          // Simulate volume increment if the socket feed doesn't stream volume data
          const simulatedVolBump = data.volume === undefined ? Math.floor(Math.random() * 8) + 1 : 0;
          const volume = data.volume ?? (existing.volume ? existing.volume + simulatedVolBump : (spec?.volume ?? 0));

          newQuotes[symbol] = {
            ...spec,
            ...existing,
            ...data,
            symbol,
            bid,
            ask,
            digits,
            volume,
            lastTickAt,
            spread: (ask - bid) * Math.pow(10, digits),
            prevBid: bid !== existing.bid ? existing.bid : existing.prevBid,
            prevAsk: ask !== existing.ask ? existing.ask : existing.prevAsk,
          };
        }
      });

      return { quotes: newQuotes, tickCount: state.tickCount + 1 };
    });
  }
}

export const quotesWsService = QuotesWebSocketService.getInstance();
