/**
 * Core module: socket.ts
 */

import { useTradingState } from '../../state/tradingState';
import NetInfo from '@react-native-community/netinfo';

type SubscriptionMessage = {
  type: 'subscribe' | 'unsubscribe';
  channel: string; // e.g., 'prices', 'quotes.EURUSD', 'account.900767', 'candles.EURUSD.H1'
};

type WsMessage = SubscriptionMessage | { type: 'ping' | 'get_channels' };

/**
 * (Legacy) General purpose WebSocket service that manages multi-channel subscriptions.
 * Modern implementations have split into dedicated high-throughput services 
 * (QuotesWebSocketService, CandlesWebSocketService, etc.).
 */
export class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_WS_URL || 'wss://backend.orrnn.com/ws';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private isConnected = false;
  private netInfoUnsubscribe: (() => void) | null = null;
  
  // Track active subscriptions so we can resubscribe on reconnect
  private activeSubscriptions: Set<string> = new Set();
  
  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Dispatches the initial connection sequence and restores active channels if reconnecting.
   */
  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return; // Already connecting or connected
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected to', this.url);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Re-establish active subscriptions if this is a reconnect
        this.activeSubscriptions.forEach(channel => {
          this.send({ type: 'subscribe', channel });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);
          this.handleMessage(payload);
        } catch (e) {
          console.warn('[WebSocket] Error parsing message', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Connection closed');
        this.isConnected = false;
        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error', error);
      };
    } catch (e) {
      console.error('[WebSocket] Connection failed', e);
      this.attemptReconnect();
    }
  }

  /**
   * Gracefully tears down the connection and clears all active subscription state locally.
   */
  public disconnect(): void {
    if (this.ws) {
      this.activeSubscriptions.clear();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  public subscribe(channel: string): void {
    if (!this.activeSubscriptions.has(channel)) {
      this.activeSubscriptions.add(channel);
      if (this.isConnected) {
        this.send({ type: 'subscribe', channel });
      }
    }
  }

  public unsubscribe(channel: string): void {
    if (this.activeSubscriptions.has(channel)) {
      this.activeSubscriptions.delete(channel);
      if (this.isConnected) {
        this.send({ type: 'unsubscribe', channel });
      }
    }
  }

  private send(msg: WsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached.');
      return;
    }

    NetInfo.fetch().then((state) => {
      if (state.isConnected === false) {
        console.log('[WebSocket] Network offline. Pausing reconnect attempts.');
        if (!this.netInfoUnsubscribe) {
          this.netInfoUnsubscribe = NetInfo.addEventListener(newState => {
            if (newState.isConnected) {
              console.log('[WebSocket] Network restored. Resuming connection...');
              if (this.netInfoUnsubscribe) {
                this.netInfoUnsubscribe();
                this.netInfoUnsubscribe = null;
              }
              this.connect();
            }
          });
        }
        return;
      }

      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      console.log(`[WebSocket] Reconnecting in ${Math.round(delay)}ms... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => this.connect(), delay);
    });
  }


  // ─── Message Routing ────────────────────────────────────────────────────────

  private handleMessage(payload: any) {
    const { type, channel, data } = payload;
    const store = useTradingState.getState();

    if (type === 'channel_message') {
      // 1. Live Prices
      if (channel === 'prices' || channel.startsWith('quotes.')) {
        if (data.symbol && data.bid && data.ask) {
          store.setQuote(data.symbol, { 
            bid: data.bid, 
            ask: data.ask,
            lastTickAt: data.lastTickAt ?? data.timestamp ?? data.time ?? data.t,
            lastReceivedAt: Date.now(),
          });
        }
      }
      
      // 2. Account Updates
      if (channel.startsWith('account.')) {
        store.setAccount(data);
      }
      
    }
  }
}

// Export a singleton instance
export const wsService = WebSocketService.getInstance();
