import { useTradingState } from '../../state/tradingState';

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
  private flushTimer: number | null = null;

  private constructor() {}

  public static getInstance(): QuotesWebSocketService {
    if (!QuotesWebSocketService.instance) {
      QuotesWebSocketService.instance = new QuotesWebSocketService();
    }
    return QuotesWebSocketService.instance;
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

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
        if (this.activeSymbols.size > 0) {
          this.sendSubscription();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);
          // Apply ticks IMMEDIATELY — zero buffering, zero delay
          this.applyPayload(payload);
        } catch (e) {
          console.warn('[Quotes WS] Parse error', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[Quotes WS] Closed');
        this.isConnected = false;
        this.ws = null;
        this.cancelFlush();
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[Quotes WS] Error', error);
      };
    } catch (e) {
      console.error('[Quotes WS] Connection failed', e);
      this.attemptReconnect();
    }
  }

  public disconnect(): void {
    this.cancelFlush();
    if (this.ws) {
      this.activeSymbols.clear();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

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
      this.flushUpdates();
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
    // No-op: we now flush synchronously in applyPayload for nanosecond latency
  }

  private cancelFlush(): void {
    if (this.flushTimer !== null) {
      cancelAnimationFrame(this.flushTimer);
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

        if (!existing) {
          newQuotes[symbol] = { ...data, symbol } as any;
        } else {
          // Spread ALL fields the server sends (high, low, changePct, volume, t, etc.)
          // then override with our computed values so nothing is silently dropped.
          newQuotes[symbol] = {
            ...existing,
            ...data,
            symbol,
            bid,
            ask,
            spread: (ask - bid) * Math.pow(10, existing.digits ?? data.digits ?? 5),
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
