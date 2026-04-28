/**
 * Backend live-candle WebSocket compatibility service.
 *
 * This service no longer generates gap fillers, timer candles, or local OHLC.
 * It only subscribes to backend candle messages and forwards valid payloads
 * into the canonical `liveCandlesEngine` stream.
 */

import { liveCandlesEngine } from './liveCandlesEngine';
import type { CandleStreamEvent } from '../../domain/candles';
import { normalizeSymbol, normalizeTimeframeStrict } from '../../domain/candles';
import type { Candle } from '../../state/tradingState';

type TickListener = (symbol: string, tf: string, mutatedCandles: Candle[]) => void;
type ArrayListener = (symbol: string, tf: string, allCandles: Candle[]) => void;
type StreamListener = (event: CandleStreamEvent) => void;

type SubscriptionState = {
  key: string;
  symbol: string;
  tf: string;
  consumerCount: number;
  candles: Candle[];
  engineUnsubscribe: (() => void) | null;
};

const createSubscriptionKey = (symbol: string, tf: string): string => {
  const normalizedTimeframe = normalizeTimeframeStrict(tf);
  return `${normalizeSymbol(symbol)}::${normalizedTimeframe ?? ''}`;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const pickString = (record: Record<string, unknown> | null, keys: readonly string[]): string | null => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
};

const pickTimeframeValue = (record: Record<string, unknown> | null, keys: readonly string[]): unknown => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const getNestedRecord = (record: Record<string, unknown> | null): Record<string, unknown> | null =>
  asRecord(record?.candle) ??
  asRecord(record?.bar) ??
  asRecord(record?.data) ??
  asRecord(record?.payload) ??
  null;

const hasAnyKey = (record: Record<string, unknown> | null, keys: readonly string[]): boolean =>
  Boolean(record && keys.some((key) => record[key] !== undefined && record[key] !== null && record[key] !== ''));

const hasBackendCandleShape = (payload: unknown): boolean => {
  const record = asRecord(payload);
  const nested = getNestedRecord(record);
  const candidate = nested ?? record;
  return (
    hasAnyKey(candidate, ['open', 'Open', 'OPEN', 'o', 'O']) &&
    hasAnyKey(candidate, ['high', 'High', 'HIGH', 'h', 'H']) &&
    hasAnyKey(candidate, ['low', 'Low', 'LOW', 'l', 'L']) &&
    hasAnyKey(candidate, ['close', 'Close', 'CLOSE', 'c', 'C'])
  );
};

const extractPayloadContext = (payload: unknown): { symbol: string | null; tf: string | null } => {
  const record = asRecord(payload);
  const nested = getNestedRecord(record);
  const symbol =
    pickString(record, ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol']) ??
    pickString(nested, ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol']);
  const timeframe =
    pickTimeframeValue(record, ['timeframe', 'Timeframe', 'TIMEFRAME', 'tf', 'TF', 'period', 'interval']) ??
    pickTimeframeValue(nested, ['timeframe', 'Timeframe', 'TIMEFRAME', 'tf', 'TF', 'period', 'interval']);

  return {
    symbol: symbol ? normalizeSymbol(symbol) : null,
    tf: normalizeTimeframeStrict(timeframe),
  };
};

const getPayloadItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.candles)) return record.candles;
  if (Array.isArray(record.items)) return record.items;
  if (record.candle) return [record.candle];
  if (record.data && typeof record.data === 'object') return [record.data];
  return [record];
};

export class CandlesWebSocketService {
  private static instance: CandlesWebSocketService;

  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_CANDLES_WS_URL || 'wss://backend.orrnn.com/ws/feed';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private manualDisconnect = false;
  private isConnected = false;

  private subscriptions = new Map<string, SubscriptionState>();
  private tickListeners: Set<TickListener> = new Set();
  private arrayListeners: Set<ArrayListener> = new Set();
  private streamListeners: Set<StreamListener> = new Set();

  public candleCache: Candle[] = [];

  public static getInstance(): CandlesWebSocketService {
    if (!CandlesWebSocketService.instance) {
      CandlesWebSocketService.instance = new CandlesWebSocketService();
    }
    return CandlesWebSocketService.instance;
  }

  public connect(): void {
    if (this.subscriptions.size === 0 || this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.manualDisconnect = false;
    this.clearReconnectTimer();

    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.sendSubscriptions();
      };
      this.ws.onmessage = (event) => {
        try {
          this.handlePayload(JSON.parse(event.data as string));
        } catch (error) {
          console.warn('[Candles WS] Parse error', error);
        }
      };
      this.ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        if (!this.manualDisconnect && this.subscriptions.size > 0) {
          this.scheduleReconnect();
        }
      };
      this.ws.onerror = () => {
        console.warn('[Candles WS] connection error');
      };
    } catch (error) {
      console.warn('[Candles WS] connection failed', error);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    for (const state of this.subscriptions.values()) {
      state.engineUnsubscribe?.();
    }
    this.subscriptions.clear();
    this.candleCache = [];

    if (this.ws) {
      try {
        this.ws.close();
      } catch (_error) {}
      this.ws = null;
    }
    this.isConnected = false;
  }

  public subscribe(symbol: string, tf: string): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframeStrict(tf);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    const key = createSubscriptionKey(normalizedSymbol, normalizedTimeframe);
    let state = this.subscriptions.get(key);
    if (!state) {
      state = {
        key,
        symbol: normalizedSymbol,
        tf: normalizedTimeframe,
        consumerCount: 0,
        candles: [],
        engineUnsubscribe: null,
      };
      state.engineUnsubscribe = liveCandlesEngine.subscribe(normalizedSymbol, normalizedTimeframe, () => {
        this.handleEngineUpdate(state as SubscriptionState);
      });
      this.subscriptions.set(key, state);
    }

    state.consumerCount += 1;
    this.connect();
    if (this.isConnected) {
      this.sendSubscription(normalizedSymbol);
    }
  }

  public unsubscribe(symbol?: string, tf?: string): void {
    const normalizedSymbol = normalizeSymbol(symbol ?? '');
    const normalizedTimeframe = normalizeTimeframeStrict(tf);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    const key = createSubscriptionKey(normalizedSymbol, normalizedTimeframe);
    const state = this.subscriptions.get(key);
    if (!state) {
      return;
    }

    state.consumerCount = Math.max(0, state.consumerCount - 1);
    if (state.consumerCount > 0) {
      return;
    }

    state.engineUnsubscribe?.();
    this.subscriptions.delete(key);
    this.send({ type: 'unsubscribe', symbols: [normalizedSymbol] });
    if (this.subscriptions.size === 0 && this.ws) {
      this.ws.close();
    }
  }

  public refresh(symbol: string, tf: string): void {
    liveCandlesEngine.refresh(symbol, tf);
  }

  public addTickListener(listener: TickListener): void {
    this.tickListeners.add(listener);
  }

  public removeTickListener(listener: TickListener): void {
    this.tickListeners.delete(listener);
  }

  public addArrayListener(listener: ArrayListener): void {
    this.arrayListeners.add(listener);
  }

  public removeArrayListener(listener: ArrayListener): void {
    this.arrayListeners.delete(listener);
  }

  public addStreamListener(listener: StreamListener): void {
    this.streamListeners.add(listener);
  }

  public removeStreamListener(listener: StreamListener): void {
    this.streamListeners.delete(listener);
  }

  private handlePayload(payload: unknown): void {
    const items = getPayloadItems(payload);
    if (items.length === 0) {
      return;
    }

    const outerContext = extractPayloadContext(payload);
    const states = Array.from(this.subscriptions.values());

    for (const item of items) {
      if (!hasBackendCandleShape(item)) {
        continue;
      }

      const itemContext = extractPayloadContext(item);
      const symbol = itemContext.symbol ?? outerContext.symbol;
      const tf = itemContext.tf ?? outerContext.tf;

      if (symbol && tf) {
        liveCandlesEngine.ingestLiveCandle(item, symbol, tf);
        continue;
      }

      const candidates = states.filter((state) => {
        if (symbol && state.symbol !== symbol) return false;
        if (tf && state.tf !== tf) return false;
        return true;
      });

      // A backend candle without enough routing metadata is safe only when it
      // maps to exactly one active subscription. Otherwise applying it would
      // pollute other symbols/timeframes.
      if (candidates.length === 1) {
        liveCandlesEngine.ingestLiveCandle(item, candidates[0].symbol, candidates[0].tf);
      }
    }
  }

  private handleEngineUpdate(state: SubscriptionState): void {
    const candles = liveCandlesEngine.getCandles(state.symbol, state.tf);
    const previous = state.candles;
    state.candles = candles;
    this.candleCache = candles;

    this.arrayListeners.forEach((listener) => listener(state.symbol, state.tf, candles));

    const previousLast = previous[previous.length - 1];
    const nextLast = candles[candles.length - 1];
    if (!nextLast) {
      this.emitStream({
        type: 'full_sync',
        symbol: state.symbol,
        tf: state.tf,
        candles,
        reason: 'resync',
      });
      return;
    }

    if (!previousLast || candles.length < previous.length || candles.length > previous.length + 1) {
      this.emitStream({
        type: 'full_sync',
        symbol: state.symbol,
        tf: state.tf,
        candles,
        reason: 'resync',
      });
      return;
    }

    if (previousLast.time === nextLast.time) {
      this.tickListeners.forEach((listener) => listener(state.symbol, state.tf, [nextLast]));
      this.emitStream({ type: 'replace_last', symbol: state.symbol, tf: state.tf, candle: nextLast });
      return;
    }

    this.tickListeners.forEach((listener) => listener(state.symbol, state.tf, [nextLast]));
    this.emitStream({ type: 'append', symbol: state.symbol, tf: state.tf, candle: nextLast });
  }

  private emitStream(event: CandleStreamEvent): void {
    this.streamListeners.forEach((listener) => listener(event));
  }

  private sendSubscriptions(): void {
    const symbols = Array.from(new Set(Array.from(this.subscriptions.values()).map((state) => state.symbol)));
    if (symbols.length > 0) {
      this.send({ type: 'subscribe', symbols });
    }
  }

  private sendSubscription(symbol: string): void {
    this.send({ type: 'subscribe', symbols: [symbol] });
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempts, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualDisconnect && this.subscriptions.size > 0) {
        this.connect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const candlesWsService = CandlesWebSocketService.getInstance();
