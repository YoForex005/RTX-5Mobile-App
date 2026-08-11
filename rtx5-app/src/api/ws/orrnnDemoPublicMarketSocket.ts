import { AppState, type NativeEventSubscription } from 'react-native';
import {
  getOrrnnDemoPublicQuotePayloads,
  isOrrnnDemoPublicMarketSelection,
  ORRNN_DEMO_PUBLIC_FEED_WS_URL,
  resolveOrrnnDemoPublicCandleTimeframe,
} from '../orrnnDemoPublicMarket';
import { normalizeQuoteTickPayload, type QuoteTickEvent } from './quoteTickNormalizer';
import { normalizeSymbol } from '../../domain/symbols';
import { normalizeLiveCandle } from '../../domain/candles/normalization/candleNormalizer';
import {
  extractCandlePayloadContext,
  getCandlePayloadItems,
  hasBackendCandleShape,
} from '../../domain/candles/ws/candlesSocketProtocol';
import type { CandleParams } from '../../domain/candles/stream/liveCandleStream';
import { useTradingState, resetQuoteMarketData } from '../../state/tradingState';
import { useUserPreferences } from '../../state/userPreferences';
import { quoteLatencyMonotonicNow } from '../../market/quoteLatencyMetrics';

type QuoteListener = (tick: QuoteTickEvent) => void;
export type OrrnnDemoPublicCandleListener = (candle: CandleParams) => void;

const RECONNECT_DELAYS_MS = [750, 1_250, 2_000, 3_000, 5_000] as const;
const PUBLIC_FEED_SILENT_STALE_MS = 8_000;
const PUBLIC_FEED_WATCHDOG_INTERVAL_MS = 3_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getSocketData = (event: MessageEvent): unknown => {
  if (typeof event.data !== 'string') {
    return event.data;
  }
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
};

const toQuoteTick = (
  payload: unknown,
  receivedAt: number,
  receiptMonotonicAt: number,
): QuoteTickEvent | null => {
  const result = normalizeQuoteTickPayload(payload, receivedAt);
  if (!result.ok) {
    return null;
  }
  const { update } = result;
  const timestamp = update.timestamp ?? receivedAt;
  return {
    symbol: update.symbol,
    rawSymbol: update.rawSymbol,
    bid: update.bid,
    ask: update.ask,
    last: update.last,
    high: update.high,
    low: update.low,
    open: update.open,
    dailyOpen: update.dailyOpen,
    previousClose: update.previousClose,
    changePct: update.changePct,
    spread: update.spread,
    volume: update.volume,
    digits: update.digits,
    point: update.point,
    tickSize: update.tickSize,
    sequence: update.sequence,
    tickId: update.tickId,
    source: update.source,
    authority: update.authority,
    stale: update.stale,
    tradable: update.tradable,
    ageMs: update.ageMs,
    ageSec: update.ageSec,
    degraded: update.degraded,
    degradationReason: update.degradationReason,
    transport: 'websocket',
    feedTickAt: timestamp,
    receivedAt,
    receiptMonotonicAt,
    timestamp,
  };
};

const publishPublicQuote = (tick: QuoteTickEvent): void => {
  useTradingState.getState().setQuote(tick.rawSymbol || tick.symbol, {
    bid: tick.bid,
    ask: tick.ask,
    lastTickAt: tick.timestamp,
    lastReceivedAt: tick.receivedAt,
    feedTickAt: tick.feedTickAt ?? tick.timestamp,
    ...(tick.last !== undefined ? { close: tick.last } : {}),
    ...(tick.high !== undefined ? { high: tick.high } : {}),
    ...(tick.low !== undefined ? { low: tick.low } : {}),
    ...(tick.open !== undefined ? { open: tick.open } : {}),
    ...(tick.changePct !== undefined ? { changePct: tick.changePct } : {}),
    ...(tick.spread !== undefined ? { spread: tick.spread } : {}),
    ...(tick.volume !== undefined
      ? { volume: tick.volume, volumeSource: 'backend' as const }
      : {}),
    ...(tick.digits !== undefined
      ? { digits: tick.digits, digitsSource: 'backend' as const }
      : {}),
    ...(tick.point !== undefined ? { point: tick.point } : {}),
    ...(tick.tickSize !== undefined ? { tickSize: tick.tickSize } : {}),
    transport: 'websocket',
    stale: tick.stale,
    tradable: tick.tradable,
    degraded: tick.degraded,
    degradationReason: tick.degradationReason,
    sequence: tick.sequence,
    tickId: tick.tickId,
    source: tick.source,
    authority: tick.authority,
  });
};

const getCandleSubscriptionKey = (symbol: string, tf: string): string =>
  `${symbol}|${tf}`;

class OrrnnDemoPublicMarketSocketService {
  private socket: WebSocket | null = null;
  private quoteListeners = new Map<string, Set<QuoteListener>>();
  private candleListeners = new Map<string, Set<OrrnnDemoPublicCandleListener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = Date.now();
  private appStateSubscription: NativeEventSubscription | null = null;
  private preferencesSubscription: (() => void) | null = null;
  // React Native may report null briefly while the initial app state crosses
  // the bridge. Treat only known background/inactive states as suspended so a
  // cold launch can open the anonymous feed immediately.
  private isAppActive = AppState.currentState == null
    || AppState.currentState === 'active';
  private publicScopeActive = false;
  private shouldReconnect = false;

  private isSelectionActive(): boolean {
    const { brokerId, isLoggedIn } = useUserPreferences.getState();
    return isOrrnnDemoPublicMarketSelection({ brokerId, isLoggedIn });
  }

  private hasDemand(): boolean {
    return this.quoteListeners.size > 0 || this.candleListeners.size > 0;
  }

  private ensureLifecycleSubscriptions(): void {
    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
        this.isAppActive = nextState === 'active';
        if (!this.isAppActive) {
          this.clearReconnectTimer();
          this.teardownSocket(false);
          return;
        }
        if (this.shouldReconnect && this.hasDemand() && this.isSelectionActive()) {
          this.connect();
        }
      });
    }

    if (!this.preferencesSubscription) {
      this.preferencesSubscription = useUserPreferences.subscribe((state, previous) => {
        if (
          state.isLoggedIn === previous.isLoggedIn &&
          state.brokerId === previous.brokerId
        ) {
          return;
        }
        if (!this.isSelectionActive()) {
          this.deactivatePublicScope();
          return;
        }
        if (this.hasDemand()) {
          this.connect();
        }
      });
    }
  }

  private activatePublicScope(): void {
    if (this.publicScopeActive) {
      return;
    }
    this.publicScopeActive = true;
    // The shared quote store has symbol-only keys. Clear it at the public
    // broker boundary so an authenticated broker's last tick cannot flash in
    // the anonymous demo namespace.
    resetQuoteMarketData();
  }

  private deactivatePublicScope(): void {
    const shouldClearQuotes = this.publicScopeActive;
    this.publicScopeActive = false;
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.teardownSocket(false);
    if (shouldClearQuotes) {
      resetQuoteMarketData();
    }
  }

  connect(): void {
    this.ensureLifecycleSubscriptions();
    if (!this.hasDemand() || !this.isAppActive || !this.isSelectionActive()) {
      return;
    }
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.activatePublicScope();
    this.shouldReconnect = true;
    this.clearReconnectTimer();
    // Bootstrap the current quote demand in the URL. The deployed feed
    // documents both this mode and post-open subscribe messages; using both
    // avoids a React Native/OkHttp connection that acknowledges `subscribe`
    // but never receives quote frames. Later symbol changes still use the
    // dynamic subscribe/unsubscribe contract below.
    const bootstrapQuoteSymbols = Array.from(this.quoteListeners.keys());
    const socketUrl = bootstrapQuoteSymbols.length > 0
      ? `${ORRNN_DEMO_PUBLIC_FEED_WS_URL}?symbols=${encodeURIComponent(bootstrapQuoteSymbols.join(','))}`
      : ORRNN_DEMO_PUBLIC_FEED_WS_URL;
    const socket = new WebSocket(socketUrl);
    this.socket = socket;
    this.lastMessageAt = Date.now();

    socket.onopen = () => {
      if (this.socket !== socket || !this.isSelectionActive()) {
        socket.close();
        return;
      }
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      this.syncSubscriptions();
      this.startWatchdog();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || !this.isSelectionActive()) {
        return;
      }
      this.lastMessageAt = Date.now();
      this.handlePayload(getSocketData(event));
    };
    socket.onerror = () => {
      // React Native follows an error with close; reconnect is owned by onclose.
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
        this.stopWatchdog();
      }
      if (
        this.shouldReconnect &&
        this.hasDemand() &&
        this.isAppActive &&
        this.isSelectionActive()
      ) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const attempt = Math.min(
      this.reconnectAttempts,
      RECONNECT_DELAYS_MS.length - 1,
    );
    this.reconnectAttempts = Math.min(
      this.reconnectAttempts + 1,
      RECONNECT_DELAYS_MS.length,
    );
    const delay = RECONNECT_DELAYS_MS[
      attempt
    ];
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogInterval = setInterval(() => {
      if (
        this.socket?.readyState !== WebSocket.OPEN ||
        !this.shouldReconnect ||
        !this.hasDemand() ||
        !this.isAppActive ||
        !this.isSelectionActive()
      ) {
        return;
      }
      if (Date.now() - this.lastMessageAt <= PUBLIC_FEED_SILENT_STALE_MS) {
        return;
      }

      // Mobile TCP can remain OPEN after the underlying route has silently
      // died. Recycle that socket so public candles and their Bid marker do
      // not stay frozen until the user restarts Expo Go/the installed app.
      this.teardownSocket(false);
      this.scheduleReconnect();
    }, PUBLIC_FEED_WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (!this.watchdogInterval) {
      return;
    }
    clearInterval(this.watchdogInterval);
    this.watchdogInterval = null;
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }

  private syncSubscriptions(): void {
    const symbols = Array.from(this.quoteListeners.keys());
    if (symbols.length > 0) {
      this.send({ type: 'subscribe', symbols });
    }
    for (const key of this.candleListeners.keys()) {
      const [symbol, tf] = key.split('|');
      this.send({ type: 'subscribe_candles', symbol, tf });
    }
  }

  private handlePayload(payload: unknown): void {
    const receivedAt = Date.now();
    const receiptMonotonicAt = quoteLatencyMonotonicNow();
    const record = isRecord(payload) ? payload : null;
    if (
      record &&
      (String(record.type ?? '').toLowerCase() === 'candle' || hasBackendCandleShape(payload))
    ) {
      this.handleCandlePayload(payload);
    }

    for (const quotePayload of getOrrnnDemoPublicQuotePayloads(payload)) {
      const tick = toQuoteTick(quotePayload, receivedAt, receiptMonotonicAt);
      if (!tick) {
        continue;
      }
      const symbol = normalizeSymbol(tick.rawSymbol || tick.symbol);
      const listeners = this.quoteListeners.get(symbol);
      if (!listeners || listeners.size === 0) {
        continue;
      }
      publishPublicQuote(tick);
      listeners.forEach((listener) => listener(tick));
    }
  }

  private handleCandlePayload(payload: unknown): void {
    const context = extractCandlePayloadContext(payload);
    for (const item of getCandlePayloadItems(payload)) {
      const itemRecord = isRecord(item) ? item : {};
      const candidate = {
        ...itemRecord,
        ...(context.symbol && !itemRecord.symbol ? { symbol: context.symbol } : {}),
        ...(context.tf && !itemRecord.tf && !itemRecord.timeframe
          ? { tf: context.tf }
          : {}),
      };
      const candle = normalizeLiveCandle(candidate);
      const symbol = normalizeSymbol(candle?.symbol ?? context.symbol ?? '');
      const tf = resolveOrrnnDemoPublicCandleTimeframe(
        candle?.timeframe ?? context.tf,
      );
      if (!candle || !symbol || !tf) {
        continue;
      }
      const listeners = this.candleListeners.get(getCandleSubscriptionKey(symbol, tf));
      if (!listeners || listeners.size === 0) {
        continue;
      }
      const update: CandleParams = { ...candle, source: 'live_candle' };
      listeners.forEach((listener) => listener(update));
    }
  }

  subscribeToSymbols(symbols: readonly string[], listener: QuoteListener): () => void {
    const normalizedSymbols = Array.from(new Set(
      symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean),
    ));
    if (normalizedSymbols.length === 0) {
      return () => {};
    }
    this.ensureLifecycleSubscriptions();
    const newlyRequestedSymbols: string[] = [];
    for (const normalizedSymbol of normalizedSymbols) {
      let listeners = this.quoteListeners.get(normalizedSymbol);
      if (!listeners) {
        listeners = new Set();
        this.quoteListeners.set(normalizedSymbol, listeners);
        newlyRequestedSymbols.push(normalizedSymbol);
      }
      listeners.add(listener);
    }
    if (newlyRequestedSymbols.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe', symbols: newlyRequestedSymbols });
    }
    // Connect only after every requested symbol is registered. That puts the
    // complete cold-start watchlist in the query-string bootstrap instead of
    // opening for the first symbol and serially subscribing to the remainder.
    this.connect();

    return () => {
      const releasedSymbols: string[] = [];
      for (const normalizedSymbol of normalizedSymbols) {
        const current = this.quoteListeners.get(normalizedSymbol);
        if (!current) {
          continue;
        }
        current.delete(listener);
        if (current.size === 0) {
          this.quoteListeners.delete(normalizedSymbol);
          releasedSymbols.push(normalizedSymbol);
        }
      }
      if (releasedSymbols.length > 0) {
        this.send({ type: 'unsubscribe', symbols: releasedSymbols });
      }
      this.stopWhenIdle();
    };
  }

  subscribeToSymbol(symbol: string, listener: QuoteListener): () => void {
    return this.subscribeToSymbols([symbol], listener);
  }

  subscribeCandle(
    symbol: string,
    timeframe: string,
    listener: OrrnnDemoPublicCandleListener,
  ): () => void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const tf = resolveOrrnnDemoPublicCandleTimeframe(timeframe);
    if (!normalizedSymbol || !tf) {
      return () => {};
    }
    this.ensureLifecycleSubscriptions();
    const key = getCandleSubscriptionKey(normalizedSymbol, tf);
    let listeners = this.candleListeners.get(key);
    const isFirstConsumer = !listeners;
    if (!listeners) {
      listeners = new Set();
      this.candleListeners.set(key, listeners);
    }
    listeners.add(listener);
    if (isFirstConsumer && this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe_candles', symbol: normalizedSymbol, tf });
    }
    this.connect();

    return () => {
      const current = this.candleListeners.get(key);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.candleListeners.delete(key);
        this.send({ type: 'unsubscribe_candles', symbol: normalizedSymbol, tf });
      }
      this.stopWhenIdle();
    };
  }

  private stopWhenIdle(): void {
    if (this.hasDemand()) {
      return;
    }
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.teardownSocket(false);
  }

  private teardownSocket(sendUnsubscribe: boolean): void {
    this.stopWatchdog();
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }
    if (sendUnsubscribe && socket.readyState === WebSocket.OPEN) {
      const symbols = Array.from(this.quoteListeners.keys());
      if (symbols.length > 0) {
        socket.send(JSON.stringify({ type: 'unsubscribe', symbols }));
      }
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }
}

type OrrnnDemoPublicSocketRegistry = typeof globalThis & {
  __RTX5_ORRNN_DEMO_PUBLIC_MARKET_SOCKET__?: OrrnnDemoPublicMarketSocketService;
};

const registry = globalThis as OrrnnDemoPublicSocketRegistry;

export const orrnnDemoPublicMarketSocket =
  registry.__RTX5_ORRNN_DEMO_PUBLIC_MARKET_SOCKET__ ??
  (registry.__RTX5_ORRNN_DEMO_PUBLIC_MARKET_SOCKET__ =
    new OrrnnDemoPublicMarketSocketService());
