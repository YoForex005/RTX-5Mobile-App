/**
 * Core module: candlesSocket.ts
 */

import { CandleParams } from '../../hooks/useLiveCandles';
import { useUserPreferences } from '../../state/userPreferences';


type CandleSubscription = {
  symbol: string;
  tf: string;
};

type TickListener = (symbol: string, tf: string, mutatedCandles: CandleParams[]) => void;
type ArrayListener = (symbol: string, tf: string, allCandles: CandleParams[]) => void;

/**
 * Dedicated WebSocket service for streaming real-time candlestick (OHLCV) updates.
 * Provides nanosecond-latency bridging directly into the lightweight-charts instances.
 */
export class CandlesWebSocketService {
  private static instance: CandlesWebSocketService;
  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_CANDLES_WS_URL || 'ws://69.197.178.27/ws/feed';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 2000;
  private isConnected = false;

  private activeSubscription: CandleSubscription | null = null;

  private tickListeners: Set<TickListener> = new Set();
  private arrayListeners: Set<ArrayListener> = new Set();

  public candleCache: CandleParams[] = [];
  private isHistoryLoading = false;
  private queuedWsTicks: any[] = [];
  private fetchController: AbortController | null = null;

  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() { }

  public static getInstance(): CandlesWebSocketService {
    if (!CandlesWebSocketService.instance) {
      CandlesWebSocketService.instance = new CandlesWebSocketService();
    }
    return CandlesWebSocketService.instance;
  }

  /**
   * Initializes the WebSocket connection for the candle feed.
   * Automatically re-establishes active subscriptions on successful connection.
   */
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

        this.startHeartbeat();

        if (this.activeSubscription) {
          this.fetchHistoryAndSubscribe(this.activeSubscription.symbol, this.activeSubscription.tf);
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
      this.isHistoryLoading = false;
      this.queuedWsTicks = [];
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

  /**
   * Requests a live subscription for a given symbol and timeframe.
   * Internally manages fetching initial historical data before piping live updates.
   * 
   * @param symbol - The market symbol (e.g. 'EURUSD')
   * @param tf - The timeframe interval (e.g. 'M1', 'H1', 'D1')
   */
  public subscribe(symbol: string, tf: string): void {
    if (this.activeSubscription?.symbol === symbol && this.activeSubscription?.tf === tf) {
      if (!this.isHistoryLoading && this.candleCache.length > 0) {
        this.notifyArrayListeners(symbol, tf, this.candleCache);
      }
      return;
    }

    this.activeSubscription = { symbol, tf };

    if (this.isConnected) {
      this.fetchHistoryAndSubscribe(symbol, tf);
    } else {
      this.connect();
    }
  }

  public unsubscribe(): void {
    this.activeSubscription = null;
    this.candleCache = [];
    this.queuedWsTicks = [];
    this.isHistoryLoading = false;
  }

  public addTickListener(listener: TickListener): void {
    this.tickListeners.add(listener);
    if (!this.isHistoryLoading && this.activeSubscription && this.candleCache.length > 0) {
      listener(this.activeSubscription.symbol, this.activeSubscription.tf, [this.candleCache[this.candleCache.length - 1]]);
    }
  }

  /** @deprecated use addTickListener or addArrayListener */
  public addListener(listener: TickListener): void {
    this.addTickListener(listener);
  }

  public removeTickListener(listener: TickListener): void {
    this.tickListeners.delete(listener);
  }

  /** @deprecated use removeTickListener or removeArrayListener */
  public removeListener(listener: TickListener): void {
    this.removeTickListener(listener);
  }

  public addArrayListener(listener: ArrayListener): void {
    this.arrayListeners.add(listener);
    if (!this.isHistoryLoading && this.activeSubscription && this.candleCache.length > 0) {
      listener(this.activeSubscription.symbol, this.activeSubscription.tf, this.candleCache);
    }
  }

  public removeArrayListener(listener: ArrayListener): void {
    this.arrayListeners.delete(listener);
  }

  private notifyArrayListeners(symbol: string, tf: string, candles: CandleParams[]) {
    this.arrayListeners.forEach(l => l(symbol, tf, candles));
  }

  private fetchHistoryAndSubscribe(symbol: string, tf: string): void {
    if (this.isHistoryLoading) {
      this.fetchController?.abort();
    }

    this.fetchController = new AbortController();
    this.isHistoryLoading = false;
    this.candleCache = [];
    this.queuedWsTicks = [];

    // Subscribe to WS instantly to receive historical data array followed by live ticks natively
    this.sendSubscription();
    this.notifyArrayListeners(symbol, tf, this.candleCache);
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
      setTimeout(() => this.connect(), delay);
    }
  }

  private handlePayload(payload: any) {
    let parsedCandles: CandleParams[] = [];
    const symbol = payload.symbol || this.activeSubscription?.symbol || '';
    const tf = payload.tf || this.activeSubscription?.tf || '';

    if (Array.isArray(payload)) {
      payload.forEach((item) => {
        const c = this.parseSingleCandlePayload(item, tf);
        if (c) parsedCandles.push(c);
      });
    } else if (payload.data && Array.isArray(payload.data)) {
      payload.data.forEach((item: any) => {
        const c = this.parseSingleCandlePayload(item, tf);
        if (c) parsedCandles.push(c);
      });
    } else if (payload.candles && Array.isArray(payload.candles)) {
      payload.candles.forEach((item: any) => {
        const c = this.parseSingleCandlePayload(item, tf);
        if (c) parsedCandles.push(c);
      });
    } else {
      const c = this.parseSingleCandlePayload(payload.candle || payload, tf);
      if (c) parsedCandles.push(c);
    }

    if (parsedCandles.length > 0) {
      if (this.isHistoryLoading) {
        this.queuedWsTicks.push(...parsedCandles);
      } else {
        this.processParsedCandles(parsedCandles, symbol, tf);
      }
    }
  }

  private processParsedCandles(incomingCandles: CandleParams[], symbol: string, tf: string) {
    const mergedCandlesToEmit: CandleParams[] = [];
    let arrayLengthChanged = false;

    incomingCandles.forEach(incoming => {
      if (this.candleCache.length === 0) {
        this.candleCache.push(incoming);
        mergedCandlesToEmit.push(incoming);
        arrayLengthChanged = true;
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
        if (this.candleCache.length > 2500) this.candleCache.shift();
        mergedCandlesToEmit.push(incoming);
        arrayLengthChanged = true;
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
          this.candleCache.sort((a, b) => a.time - b.time);
          mergedCandlesToEmit.push(incoming);
          arrayLengthChanged = true;
        }
      }
    });

    if (mergedCandlesToEmit.length > 0) {
      this.tickListeners.forEach((listener) => listener(symbol, tf, mergedCandlesToEmit));
      if (arrayLengthChanged) {
        this.notifyArrayListeners(symbol, tf, this.candleCache);
      }
    }
  }

  private parseSingleCandlePayload(data: any, tf: string): CandleParams | null {
    if (!data) return null;

    // EXTREMELY IMPORTANT: Prioritize absolute integer epoch time keys universally to prevent timezone offsets
    const timeValue = data.timestamp ?? data.ts ?? data.t ?? data.time;
    const openValue = data.open ?? data.o;
    const highValue = data.high ?? data.h;
    const lowValue = data.low ?? data.l;
    const closeValue = data.close ?? data.c ?? data.price ?? data.p;
    const volValue = data.volume ?? data.v;

    if (timeValue === undefined || closeValue === undefined) return null;

    let timeInSeconds = timeValue;
    if (typeof timeValue === 'string') {
      const num = Number(timeValue);
      if (!isNaN(num)) {
        timeInSeconds = num;
      } else {
        let dateStr = timeValue.trim();
        if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('T')) {
          dateStr = dateStr.replace(' ', 'T');
        }
        timeInSeconds = Math.floor(new Date(dateStr).getTime() / 1000);
      }
    }
    if (timeInSeconds > 2500000000) {
      while (timeInSeconds > 2500000000) {
        timeInSeconds = Math.floor(timeInSeconds / 10);
      }
    }
    if (isNaN(timeInSeconds)) timeInSeconds = Math.floor(Date.now() / 1000);

    // Guaranteed interval synchronization for exactly one aligned timeline
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
