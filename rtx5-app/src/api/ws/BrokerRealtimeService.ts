import { brokerApi } from '../brokerApi';
import { useTradingState } from '../../state/tradingState';
import { useUserPreferences } from '../../state/userPreferences';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import { appQueryClient } from '../../state/providers/AppProviders';
import {
  buildContractSizeMap,
  calculateFloatingPnlFromTick,
  type InstrumentContractSpec,
} from '../../domain/account/equity';
import { normalizeSymbol } from '../../domain/symbols';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const AUTH_SESSION_UNAVAILABLE_PATTERN =
  /No authenticated broker session available|Refresh token invalid or expired|No refresh token available/i;
const ACCOUNT_LIFECYCLE_CHANNELS = ['positions', 'account', 'metrics', 'orders', 'deals', 'history'] as const;
const LIFECYCLE_CACHE_KEYS = ['orders', 'positionHistory', 'accountDeals', 'deals', 'accountSummary'] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getPayloadData = (payload: Record<string, unknown>): unknown =>
  payload.data ?? payload.payload ?? payload.result ?? payload;

const normalizeChannel = (value: unknown): string => String(value ?? '').trim();

const normalizeEventName = (value: unknown): string =>
  normalizeChannel(value)
    .toLowerCase()
    .replace(/[_-]+/g, '.');

const numberFrom = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    // Skip absent/blank fields BEFORE Number(): Number(null), Number(undefined →
    // NaN handled), and Number('') all coerce to 0, which would record a fake 0
    // (e.g. balance/margin) and mark the metric as "present". Only treat genuine
    // numeric values as found; otherwise fall through to the next candidate.
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return undefined;
};

const isAuthSessionUnavailable = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return AUTH_SESSION_UNAVAILABLE_PATTERN.test(message);
};

class BrokerRealtimeService {
  private static instance: BrokerRealtimeService | null = null;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private activeChannels: string[] = [];
  private contractSizes: Record<string, number> = {};
  // Last bid/ask we actually processed per symbol. Floating P/L only moves when a
  // price moves, so an unchanged tick lets us skip the O(positions) equity
  // recompute and the two store writes below.
  private lastTickPrice: Map<string, { bid: number; ask: number }> = new Map();

  static getInstance(): BrokerRealtimeService {
    if (!BrokerRealtimeService.instance) {
      BrokerRealtimeService.instance = new BrokerRealtimeService();
    }
    return BrokerRealtimeService.instance;
  }

  connect(): void {
    if (!this.hasAuthenticatedSession()) {
      this.pauseUntilNextLogin();
      return;
    }
    this.shouldReconnect = true;
    this.activeChannels = this.resolveChannels();
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      this.subscribe();
      return;
    }
    void this.open();
  }

  reconnect(): void {
    if (!this.hasAuthenticatedSession()) {
      this.pauseUntilNextLogin();
      return;
    }
    if (!this.shouldReconnect) {
      this.shouldReconnect = true;
    }
    this.clearReconnectTimer();
    this.teardownSocket();
    this.activeChannels = this.resolveChannels();
    void this.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeChannels = [];
    this.clearReconnectTimer();
    this.teardownSocket();
  }

  setInstrumentSpecs(instruments: InstrumentContractSpec[]): void {
    this.contractSizes = {
      ...this.contractSizes,
      ...buildContractSizeMap(instruments),
    };
  }

  private async open(): Promise<void> {
    if (!this.shouldReconnect) {
      return;
    }

    try {
      const wsUrl = await brokerApi.getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.activeChannels = this.resolveChannels();
        this.startHeartbeat();
        this.subscribe();
      };

      this.ws.onmessage = (event) => {
        try {
          this.handleMessage(JSON.parse(event.data as string));
        } catch (error) {
          console.warn('[BrokerRealtime] Failed to parse message', error);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose performs reconnect scheduling on React Native.
      };
    } catch (error) {
      if (isAuthSessionUnavailable(error)) {
        this.pauseUntilNextLogin();
        return;
      }
      console.warn('[BrokerRealtime] Connection failed', error);
      this.scheduleReconnect();
    }
  }

  private resolveChannels(): string[] {
    const login = resolveTradingLoginString();
    const channels: string[] = this.getOpenPositionSymbols().map((symbol) => `ticks.${symbol}`);

    if (login) {
      ACCOUNT_LIFECYCLE_CHANNELS.forEach((channel) => {
        channels.push(`${channel}.${login}`);
      });
    }

    return Array.from(new Set(channels));
  }

  private getOpenPositionSymbols(): string[] {
    const positions = usePositionsState.getState().positions;
    return Array.from(
      new Set(
        positions
          .map((position) => normalizeSymbol(position.symbol))
          .filter((symbol): symbol is string => Boolean(symbol)),
      ),
    );
  }

  private subscribe(): void {
    if (this.ws?.readyState !== WebSocket.OPEN || this.activeChannels.length === 0) {
      return;
    }

    this.send({
      action: 'subscribe',
      channels: this.activeChannels,
    });
  }

  private handleMessage(payload: unknown): void {
    const record = asRecord(payload);
    if (!record) {
      return;
    }

    const channel = normalizeChannel(record.channel ?? record.topic);
    const data = getPayloadData(record);
    const dataRecord = asRecord(data);
    const eventName =
      normalizeEventName(record.event ?? record.type ?? record.action) ||
      normalizeEventName(dataRecord?.event ?? dataRecord?.type ?? dataRecord?.action);

    if (channel.startsWith('ticks.') || eventName.includes('tick')) {
      this.handleTick(dataRecord ?? record, channel);
    }

    if (channel.startsWith('positions.') || eventName.includes('position')) {
      this.handlePositions(data, eventName);
      this.refreshSubscriptionsIfNeeded();
    }

    if (
      channel.startsWith('account.') ||
      channel.startsWith('metrics.') ||
      eventName.includes('account') ||
      eventName.includes('metrics')
    ) {
      this.handleAccount(dataRecord ?? record);
    }

    if (
      channel.startsWith('orders.') ||
      channel.startsWith('deals.') ||
      channel.startsWith('history.') ||
      eventName.startsWith('order.') ||
      eventName.startsWith('deal.') ||
      eventName.startsWith('history.')
    ) {
      this.handleLifecycleEvent(dataRecord ?? record, eventName);
    }
  }

  private handleTick(data: Record<string, unknown>, channel: string): void {
    const channelSymbol = channel.startsWith('ticks.') ? channel.slice('ticks.'.length) : '';
    const symbol = String(data.symbol ?? data.s ?? channelSymbol ?? '');
    const bid = numberFrom(data.bid, data.b, data.price);
    const ask = numberFrom(data.ask, data.a, data.price);
    if (!symbol || bid === undefined || ask === undefined) {
      return;
    }

    const tickTime = data.timestamp ?? data.time ?? data.t ?? Date.now();
    useTradingState.getState().setQuote(symbol, {
      bid,
      ask,
      lastTickAt: Number(tickTime) || Date.now(),
      lastReceivedAt: Date.now(),
    });

    // Skip the equity recompute when neither bid nor ask moved. The quote store
    // is already updated above (keeps freshness/staleness correct); only the
    // expensive floating-P/L recompute + store writes are gated.
    const previousTickPrice = this.lastTickPrice.get(symbol);
    this.lastTickPrice.set(symbol, { bid, ask });
    if (previousTickPrice && previousTickPrice.bid === bid && previousTickPrice.ask === ask) {
      return;
    }

    const liveAccount = useLiveAccountState.getState();
    const positions = usePositionsState.getState().positions;
    const currentPrice = numberFrom(data.price, bid, ask);
    if (currentPrice === undefined || positions.length === 0) {
      return;
    }

    const tradingAccount = useTradingState.getState().account;
    // Quote ticks can arrive before the account snapshot. Update floating P/L,
    // but wait for a settled balance before deriving equity/free margin.
    const hasSettledBalance = liveAccount.metricFlags.balance || Number.isFinite(tradingAccount?.balance);
    const settledBalance = liveAccount.metricFlags.balance
      ? liveAccount.balance
      : (tradingAccount?.balance ?? 0);
    const floating = calculateFloatingPnlFromTick({
      positions,
      tick: { symbol, price: currentPrice },
      contractSizes: this.contractSizes,
    });

    if (!hasSettledBalance) {
      useLiveAccountState.getState().updateMetrics({ floating });
      useTradingState.getState().setAccount({ floating });
      return;
    }

    const equity = settledBalance + floating;
    const margin = liveAccount.metricFlags.margin && Number.isFinite(liveAccount.margin)
      ? liveAccount.margin
      : (tradingAccount?.margin ?? 0);
    const marginFree = equity - margin;
    const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;

    useLiveAccountState.getState().updateMetrics({
      equity,
      floating,
      margin_free: marginFree,
      margin_level: marginLevel,
    });
    useTradingState.getState().setAccount({
      equity,
      floating,
      freeMargin: marginFree,
      marginLevel,
    });
  }

  private handlePositions(data: unknown, eventName = ''): void {
    if (Array.isArray(data)) {
      usePositionsState.getState().applyPositionsSnapshot(data, resolveTradingLoginString(), {
        preserveMissingExisting: false,
      });
      return;
    }

    const record = asRecord(data);
    if (!record) {
      return;
    }

    const positions = record.positions ?? record.items ?? record.data;
    if (Array.isArray(positions)) {
      usePositionsState.getState().applyPositionsSnapshot(positions, resolveTradingLoginString(), {
        preserveMissingExisting: false,
      });
      return;
    }

    const lifecycleHints = this.getLifecycleHints(record, eventName);
    const nestedPosition = asRecord(record.position) ?? asRecord(record.item);
    if (nestedPosition) {
      usePositionsState.getState().upsertPosition({
        ...lifecycleHints,
        ...nestedPosition,
        ticket: nestedPosition.ticket ?? lifecycleHints.ticket,
        position_ticket: nestedPosition.position_ticket ?? lifecycleHints.position_ticket ?? lifecycleHints.ticket,
      });
      this.invalidateLifecycleQueries(eventName);
      return;
    }

    usePositionsState.getState().upsertPosition({
      ...lifecycleHints,
      ...record,
    });
    this.invalidateLifecycleQueries(eventName);
  }

  private handleAccount(data: Record<string, unknown>): void {
    const metricsRecord = asRecord(data.metrics) ?? asRecord(data.account) ?? data;
    const login = numberFrom(metricsRecord.login, metricsRecord.account_login, resolveTradingLoginString());
    useLiveAccountState.getState().updateMetrics({
      ...(login !== undefined ? { login } : {}),
      ...(numberFrom(metricsRecord.balance) !== undefined ? { balance: numberFrom(metricsRecord.balance)! } : {}),
      ...(numberFrom(metricsRecord.equity) !== undefined ? { equity: numberFrom(metricsRecord.equity)! } : {}),
      ...(numberFrom(metricsRecord.margin, metricsRecord.usedMargin) !== undefined ? { margin: numberFrom(metricsRecord.margin, metricsRecord.usedMargin)! } : {}),
      ...(numberFrom(metricsRecord.margin_free, metricsRecord.freeMargin) !== undefined ? { margin_free: numberFrom(metricsRecord.margin_free, metricsRecord.freeMargin)! } : {}),
      ...(numberFrom(metricsRecord.margin_level, metricsRecord.marginLevel) !== undefined ? { margin_level: numberFrom(metricsRecord.margin_level, metricsRecord.marginLevel)! } : {}),
      ...(numberFrom(metricsRecord.floating, metricsRecord.pnl, metricsRecord.profit) !== undefined ? { floating: numberFrom(metricsRecord.floating, metricsRecord.pnl, metricsRecord.profit)! } : {}),
    });
  }

  private getLifecycleHints(record: Record<string, unknown>, eventName: string): Record<string, unknown> {
    const hints: Record<string, unknown> = {};
    for (const key of [
      'event',
      'type',
      'action',
      'status',
      'state',
      'position_state',
      'positionStatus',
      'ticket',
      'position_ticket',
      'order_ticket',
      'login',
      'correlation_id',
    ]) {
      if (record[key] !== undefined) {
        hints[key] = record[key];
      }
    }
    if (!hints.event && eventName) {
      hints.event = eventName;
    }
    return hints;
  }

  private handleLifecycleEvent(data: Record<string, unknown>, eventName: string): void {
    const position = asRecord(data.position);
    if (position) {
      this.handlePositions(data, eventName);
    }

    const metrics = asRecord(data.metrics) ?? asRecord(data.account);
    if (metrics) {
      this.handleAccount(metrics);
    }

    this.invalidateLifecycleQueries(eventName);
  }

  private invalidateLifecycleQueries(eventName: string): void {
    if (!eventName) {
      return;
    }

    const shouldInvalidate =
      eventName.startsWith('order.') ||
      eventName.startsWith('deal.') ||
      eventName.startsWith('history.') ||
      eventName.includes('partial.closed') ||
      eventName.includes('closed') ||
      eventName.includes('filled') ||
      eventName.includes('rejected');

    if (!shouldInvalidate) {
      return;
    }

    LIFECYCLE_CACHE_KEYS.forEach((key) => {
      appQueryClient.invalidateQueries({ queryKey: [key] });
    });
  }

  private refreshSubscriptionsIfNeeded(): void {
    const nextChannels = this.resolveChannels();
    const changed =
      nextChannels.length !== this.activeChannels.length ||
      nextChannels.some((channel, index) => channel !== this.activeChannels[index]);

    if (!changed) {
      return;
    }

    this.activeChannels = nextChannels;
    this.subscribe();
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) {
      return;
    }
    if (!this.hasAuthenticatedSession()) {
      this.pauseUntilNextLogin();
      return;
    }

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    const socket = this.ws;
    this.ws = null;
    this.stopHeartbeat();
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({ action: 'ping' });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private hasAuthenticatedSession(): boolean {
    const state = useUserPreferences.getState();
    return Boolean(state.isLoggedIn && state.accountDetails?.credentials?.accessToken);
  }

  private pauseUntilNextLogin(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeChannels = [];
    this.clearReconnectTimer();
    this.teardownSocket();
  }
}

export const brokerRealtimeService = BrokerRealtimeService.getInstance();
