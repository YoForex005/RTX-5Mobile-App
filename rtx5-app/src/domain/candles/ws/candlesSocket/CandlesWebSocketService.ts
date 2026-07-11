/**
 * Backend live-candle WebSocket service.
 *
 * This service subscribes to backend candle messages and forwards valid
 * payloads into the canonical `liveCandlesEngine` stream.
 *
 * Authentication: candle channels use the same authenticated `/ws/v2` broker
 * market socket as the webterminal.
 */

import { brokerApi } from '../../../../api/brokerApi';
import { liveCandleStream as liveCandlesEngine } from '../../stream/liveCandleStream';
import {
  createCandleChannel,
  extractCandlePayloadContext,
  getCandlePayloadItems,
  hasBackendCandleShape,
} from '../candlesSocketProtocol';
import type { CandleStreamEvent } from '../../core/candles';
import { normalizeSymbol, normalizeTimeframeStrict } from '../../core/candles';
import type { Candle } from '../../../../state/tradingState';
import { useUserPreferences } from '../../../../state/userPreferences';
import { createSubscriptionKey } from './authToken';
import type { ArrayListener, StreamListener, SubscriptionState, TickListener } from './types';

const redactCandleSocketUrl = (url: string): string =>
  url.replace(/([?&]token=)[^&]*/i, '$1***');

export class CandlesWebSocketService {
  private static instance: CandlesWebSocketService;

  private ws: WebSocket | null = null;
  private url = '';
  private activeBrokerId = '';
  private isResolvingSocketUrl = false;
  private tokenWatcherUnsubscribe: (() => void) | null = null;
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

  private async resolveSocketUrlAsync(): Promise<string> {
    const state = useUserPreferences.getState();
    if (!state.isLoggedIn) {
      return '';
    }
    return brokerApi.getWebSocketUrl();
  }

  /**
   * Establishes the WebSocket connection and resubscribes all active candle channels.
   */
  public connect(): void {
    void this.connectAsync();
  }

  private async connectAsync(): Promise<void> {
    if (this.subscriptions.size === 0) {
      return;
    }
    if (this.isResolvingSocketUrl) {
      return;
    }

    const brokerId = this.resolveConnectionBrokerId();
    this.isResolvingSocketUrl = true;
    let nextUrl = '';
    try {
      nextUrl = await this.resolveSocketUrlAsync();
    } catch (error) {
      this.isResolvingSocketUrl = false;
      console.warn('[Candles WS] Failed to resolve broker candle websocket URL.', error);
      this.scheduleReconnect();
      return;
    }
    this.isResolvingSocketUrl = false;
    if (!nextUrl) {
      if (this.url !== nextUrl) {
        this.url = nextUrl;
        this.tearDownSocketSafe();
      }
      console.warn('[Candles WS] Authenticated broker candle websocket unavailable. Waiting for broker session.');
      this.scheduleReconnect();
      return;
    }

    // If the socket is already up but the connection identity has rotated, tear
    // it down so the next connection uses the current broker URL/auth mode.
    if (
      (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) &&
      (this.activeBrokerId !== brokerId || this.url !== nextUrl)
    ) {
      this.url = nextUrl;
      this.tearDownSocketSafe();
    } else if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.url = nextUrl;
    this.manualDisconnect = false;
    this.clearReconnectTimer();
    // Defensive call: under hot-module-reload the singleton may pre-date the
    // method being added to the prototype. Skip silently rather than crash —
    // the worst outcome is that token rotation won't trigger an auto-reconnect
    // until the next cold start, but live candles still flow on the current
    // token.
    if (typeof this.startTokenWatcher === 'function') {
      try {
        this.startTokenWatcher();
      } catch (_error) {}
    }

    try {
      this.activeBrokerId = brokerId;
      const wsUrl = this.url;
      this.ws = new WebSocket(wsUrl);
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
      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.ws = null;
        if (!this.manualDisconnect && this.subscriptions.size > 0) {
          console.warn('[Candles WS] closed', {
            code: event?.code,
            reason: event?.reason,
            socketUrl: redactCandleSocketUrl(wsUrl),
          });
        }
        if (!this.manualDisconnect && this.subscriptions.size > 0) {
          this.scheduleReconnect();
        }
      };
      this.ws.onerror = () => {
        console.warn('[Candles WS] connection error', {
          readyState: this.ws?.readyState,
          socketUrl: redactCandleSocketUrl(wsUrl),
        });
      };
    } catch (error) {
      console.warn('[Candles WS] connection failed', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Intentionally closes the WebSocket connection and halts the automatic reconnect loop.
   * Cleans up all subscriptions and internal state.
   */
  public disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    if (typeof this.stopTokenWatcher === 'function') {
      try {
        this.stopTokenWatcher();
      } catch (_error) {}
    }
    for (const state of this.subscriptions.values()) {
      state.engineUnsubscribe?.();
    }
    this.subscriptions.clear();
    this.candleCache = [];
    this.activeBrokerId = '';

    this.tearDownSocketSafe();
  }

  /**
   * Closes the WebSocket and resets `this.ws`/`this.isConnected`. Inlines the
   * cleanup so the call site never crashes if a hot-module-reload swap left a
   * stale singleton without the `teardownSocket` method on its prototype.
   */
  private tearDownSocketSafe(): void {
    if (typeof this.teardownSocket === 'function') {
      try {
        this.teardownSocket();
        return;
      } catch (_error) {}
    }
    const socket = this.ws;
    this.ws = null;
    this.isConnected = false;
    if (!socket) {
      return;
    }
    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    } catch (_error) {}
    try {
      socket.close();
    } catch (_error) {}
  }

  /**
   * Requests a live candle stream for a specific market symbol and timeframe.
   * Multiplexes the subscription if the socket is already open, or initiates a connection.
   */
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
      this.sendSubscription(normalizedSymbol, normalizedTimeframe);
    }
  }

  /**
   * Decrements the consumer count for a specific stream. If no consumers remain,
   * sends an unsubscribe message to the backend and cleans up the engine listener.
   */
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
    this.sendUnsubscription(normalizedSymbol, normalizedTimeframe);
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

  /**
   * Processes all incoming WebSocket messages. Routes them to the correct candle stream
   * based on explicit channel metadata or payload context.
   */
  private handlePayload(payload: unknown): void {
    const items = getCandlePayloadItems(payload);
    if (items.length === 0) {
      return;
    }

    const outerContext = extractCandlePayloadContext(payload);
    const states = Array.from(this.subscriptions.values());

    for (const item of items) {
      if (!hasBackendCandleShape(item)) {
        continue;
      }

      const itemContext = extractCandlePayloadContext(item);
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
    const states = Array.from(this.subscriptions.values());
    if (this.usesChannelProtocol()) {
      const channels = Array.from(
        new Set(states.map((state) => createCandleChannel(state.symbol, state.tf)).filter(Boolean)),
      );
      channels.forEach((channel) => {
        this.send({ action: 'subscribe', channel });
      });
      return;
    }

    if (this.usesHistoryProtocol()) {
      states.forEach((state) => {
        this.send({ action: 'subscribe', symbol: state.symbol, tf: state.tf });
      });
      return;
    }

    const symbols = Array.from(new Set(states.map((state) => state.symbol)));
    if (symbols.length > 0) {
      this.send({ type: 'subscribe', symbols });
    }
  }

  private sendSubscription(symbol: string, tf: string): void {
    const channel = createCandleChannel(symbol, tf);
    if (this.usesChannelProtocol() && channel) {
      this.send({ action: 'subscribe', channel });
      return;
    }

    if (this.usesHistoryProtocol()) {
      this.send({ action: 'subscribe', symbol, tf });
      return;
    }

    this.send({ type: 'subscribe', symbols: [symbol] });
  }

  private sendUnsubscription(symbol: string, tf: string): void {
    const channel = createCandleChannel(symbol, tf);
    if (this.usesChannelProtocol() && channel) {
      this.send({ action: 'unsubscribe', channel });
      return;
    }

    if (this.usesHistoryProtocol()) {
      this.send({ action: 'unsubscribe', symbol, tf });
      return;
    }

    this.send({ type: 'unsubscribe', symbols: [symbol] });
  }

  private usesChannelProtocol(): boolean {
    return /\/ws\/v2(?:$|\?)/.test(this.url);
  }

  private usesHistoryProtocol(): boolean {
    return /\/ws\/history(?:$|\?)/.test(this.url);
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

  private resolveConnectionBrokerId(): string {
    const state = useUserPreferences.getState();
    return state.isLoggedIn ? String(state.brokerId || '').trim() : '';
  }

  private teardownSocket(): void {
    if (!this.ws) {
      this.isConnected = false;
      return;
    }
    const socket = this.ws;
    this.ws = null;
    this.isConnected = false;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch (_error) {}
  }

  // Watch broker identity and URL so account/broker switches resubscribe the
  // public candle stream to the correct backend service.
  private startTokenWatcher(): void {
    if (this.tokenWatcherUnsubscribe) {
      return;
    }
    try {
      this.tokenWatcherUnsubscribe = useUserPreferences.subscribe((state, prevState) => {
        const nextBrokerId = state.brokerId;
        const prevBrokerId = prevState.brokerId;
        const nextServerUrl = state.brokerServerUrl;
        const prevServerUrl = prevState.brokerServerUrl;
        if (nextBrokerId === prevBrokerId && nextServerUrl === prevServerUrl) {
          return;
        }
        if (this.subscriptions.size === 0) {
          return;
        }
        // Tear down and reconnect under the new broker. `connect()` will
        // re-establish the socket, then `sendSubscriptions()` will re-subscribe
        // every active (symbol, timeframe) channel.
        this.tearDownSocketSafe();
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
        this.connect();
      });
    } catch (_error) {
      this.tokenWatcherUnsubscribe = null;
    }
  }

  private stopTokenWatcher(): void {
    if (this.tokenWatcherUnsubscribe) {
      try {
        this.tokenWatcherUnsubscribe();
      } catch (_error) {}
      this.tokenWatcherUnsubscribe = null;
    }
  }
}
