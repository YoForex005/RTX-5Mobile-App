import { CandleParams } from '../../hooks/useLiveCandles';

type CandleSubscription = {
  symbol: string;
  tf: string;
};

type CandleListener = (symbol: string, tf: string, candles: CandleParams[]) => void;

export class CandlesWebSocketService {
  private static instance: CandlesWebSocketService;
  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_CANDLES_WS_URL || 'ws://69.197.178.27/ws/feed';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private isConnected = false;

  private activeSubscription: CandleSubscription | null = null;
  private listeners: Set<CandleListener> = new Set();
  private candleCache: CandleParams[] = [];
  
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() {}

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
        
        // Force OS TCP Keep-Alive to detect silent network drops (e.g. Wifi -> Cellular)
        this.startHeartbeat();

        if (this.activeSubscription) {
          this.sendSubscription();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);
          this.handlePayload(payload);
        } catch (e) {
          console.warn('[Candles WS] Parse error', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[Candles WS] Closed');
        this.stopHeartbeat();
        this.isConnected = false;
        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[Candles WS] Error', error);
      };
    } catch (e) {
      console.error('[Candles WS] Connection failed', e);
      this.attemptReconnect();
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.activeSubscription = null;
      this.candleCache = [];
      this.stopHeartbeat();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
         // Sending data across the pipe forces the OS layer to ACK the packet.
         // If the user's connection dropped silently, this forces a fast TCP failure and reconnects.
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

  public subscribe(symbol: string, tf: string): void {
    if (this.activeSubscription?.symbol === symbol && this.activeSubscription?.tf === tf) {
      return;
    }

    // Reset cache on new subscription
    this.candleCache = [];
    this.activeSubscription = { symbol, tf };
    
    if (this.isConnected) {
      this.sendSubscription();
    } else {
      this.connect();
    }
  }

  public unsubscribe(): void {
    this.activeSubscription = null;
    this.candleCache = [];
  }

  public addListener(listener: CandleListener): void {
    this.listeners.add(listener);
    // Instantly hydrate new listeners to prevent UI loading spinners waiting for the next market tick
    if (this.activeSubscription && this.candleCache.length > 0) {
      listener(this.activeSubscription.symbol, this.activeSubscription.tf, this.candleCache);
    }
  }

  public removeListener(listener: CandleListener): void {
    this.listeners.delete(listener);
  }

  private sendSubscription(): void {
    if (this.activeSubscription && this.ws?.readyState === WebSocket.OPEN) {
      const tfMap: Record<string, string> = {
        M1: '1m', M5: '5m', M15: '15m', M30: '30m',
        H1: '1h', H4: '4h', D1: '1d', W1: '1w', MN: '1M'
      };
      const internalTf = this.activeSubscription.tf || 'M1';
      const serverTf = tfMap[internalTf.toUpperCase()] || '1m';

      const msg = {
        type: 'subscribe_candles',
        symbol: this.activeSubscription.symbol,
        tf: serverTf,
      };
      
      this.ws.send(JSON.stringify(msg));
      console.log('[Candles WS] Subscribed:', msg);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      console.log(`[Candles WS] Reconnecting in ${Math.round(delay)}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('[Candles WS] Max reconnect attempts reached.');
    }
  }

  private handlePayload(payload: any) {
    let parsedCandles: CandleParams[] = [];
    const symbol = payload.symbol || this.activeSubscription?.symbol || '';
    const tf = payload.tf || this.activeSubscription?.tf || '';

    if (Array.isArray(payload)) {
      payload.forEach((item) => {
        const c = this.parseCandle(item, tf);
        if (c) parsedCandles.push(c);
      });
    } else if (payload.data && Array.isArray(payload.data)) {
      payload.data.forEach((item: any) => {
        const c = this.parseCandle(item, tf);
        if (c) parsedCandles.push(c);
      });
    } else if (payload.candles && Array.isArray(payload.candles)) {
        payload.candles.forEach((item: any) => {
            const c = this.parseCandle(item, tf);
            if (c) parsedCandles.push(c);
        });
    } else {
      const c = this.parseCandle(payload.candle || payload, tf);
      if (c) parsedCandles.push(c);
    }

    if (parsedCandles.length > 0) {
      const mergedCandlesToEmit: CandleParams[] = [];

      // Accumulate into central memory cache to serve future listeners instantly
      parsedCandles.forEach(incoming => {
        if (this.candleCache.length === 0) {
          this.candleCache.push(incoming);
          mergedCandlesToEmit.push(incoming);
          return;
        }

        const lastCandle = this.candleCache[this.candleCache.length - 1];
        if (incoming.time === lastCandle.time) {
          const updatedLastCandle = {
            ...lastCandle,
            close: incoming.close,
            high: Math.max(lastCandle.high, incoming.high),
            low: Math.min(lastCandle.low, incoming.low),
            volume: incoming.volume !== undefined ? incoming.volume : lastCandle.volume
          };
          this.candleCache[this.candleCache.length - 1] = updatedLastCandle;
          mergedCandlesToEmit.push(updatedLastCandle);
        } else if (incoming.time > lastCandle.time) {
          this.candleCache.push(incoming);
          if (this.candleCache.length > 2000) this.candleCache.shift();
          mergedCandlesToEmit.push(incoming);
        } else {
          const existingIdx = this.candleCache.findIndex(c => c.time === incoming.time);
          if (existingIdx !== -1) {
             const existingCandle = this.candleCache[existingIdx];
             const updatedExistingCandle = {
               ...existingCandle,
               close: incoming.close,
               high: Math.max(existingCandle.high, incoming.high),
               low: Math.min(existingCandle.low, incoming.low),
               volume: incoming.volume !== undefined ? incoming.volume : existingCandle.volume
             };
             this.candleCache[existingIdx] = updatedExistingCandle;
             mergedCandlesToEmit.push(updatedExistingCandle);
          } else {
             this.candleCache.push(incoming);
             this.candleCache.sort((a,b) => a.time - b.time);
             mergedCandlesToEmit.push(incoming);
          }
        }
      });
      
      this.listeners.forEach((listener) => listener(symbol, tf, mergedCandlesToEmit));
    }
  }

  private parseCandle(data: any, tf: string): CandleParams | null {
    if (!data) return null;
    
    // Some feeds use 't' instead of 'time'
    const timeValue = data.time ?? data.t;
    const openValue = data.open ?? data.o;
    const highValue = data.high ?? data.h;
    const lowValue = data.low ?? data.l;
    const closeValue = data.close ?? data.c ?? data.price;
    const volValue = data.volume ?? data.v;

    if (timeValue === undefined || closeValue === undefined) return null;

    // Convert ms timestamp to seconds if necessary
    let timeInSeconds = timeValue;
    if (timeValue > 1e11) {
      timeInSeconds = Math.floor(timeValue / 1000);
    }

    // Snap to absolute mathematical timeframe boundary to prevent TradingView geometric overflow
    let intervalSeconds = 60;
    const upperTf = (tf || '1m').toUpperCase();
    if (upperTf === '1M' || upperTf === 'M1') intervalSeconds = 60;
    else if (upperTf === '5M' || upperTf === 'M5') intervalSeconds = 300;
    else if (upperTf === '15M' || upperTf === 'M15') intervalSeconds = 900;
    else if (upperTf === '30M' || upperTf === 'M30') intervalSeconds = 1800;
    else if (upperTf === '1H' || upperTf === 'H1') intervalSeconds = 3600;
    else if (upperTf === '4H' || upperTf === 'H4') intervalSeconds = 14400;
    else if (upperTf === '1D' || upperTf === 'D1') intervalSeconds = 86400;
    else if (upperTf === '1W' || upperTf === 'W1') intervalSeconds = 604800;
    
    timeInSeconds = Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;

    return {
      time: timeInSeconds,
      open: openValue ?? closeValue,
      high: highValue ?? closeValue,
      low: lowValue ?? closeValue,
      close: closeValue,
      volume: volValue ?? 0,
    };
  }
}

export const candlesWsService = CandlesWebSocketService.getInstance();
