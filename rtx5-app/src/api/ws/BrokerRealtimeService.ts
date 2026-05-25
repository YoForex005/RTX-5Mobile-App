import { brokerApi } from '../brokerApi';
import { useTradingState } from '../../state/tradingState';
import { useUserPreferences } from '../../state/userPreferences';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import {
  buildContractSizeMap,
  calculateEquityFromTick,
  type InstrumentContractSpec,
} from '../../domain/account/equity';

const DEFAULT_SYMBOL = 'EURUSD';
const DEFAULT_TIMEFRAME = 'M1';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const AUTH_SESSION_UNAVAILABLE_PATTERN =
  /No authenticated broker session available|Refresh token invalid or expired|No refresh token available/i;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getPayloadData = (payload: Record<string, unknown>): unknown =>
  payload.data ?? payload.payload ?? payload.result ?? payload;

const normalizeChannel = (value: unknown): string => String(value ?? '').trim();

const numberFrom = (...values: unknown[]): number | undefined => {
  for (const value of values) {
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
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private activeChannels: string[] = [];
  private contractSizes: Record<string, number> = {};

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
    const channels = [`ticks.${DEFAULT_SYMBOL}`];

    if (login) {
      channels.push(`positions.${login}`, `account.${login}`);
    }

    channels.push(`candles.${DEFAULT_SYMBOL}.${DEFAULT_TIMEFRAME}`);
    return channels;
  }

  private subscribe(): void {
    if (this.ws?.readyState !== WebSocket.OPEN || this.activeChannels.length === 0) {
      return;
    }

    this.ws.send(JSON.stringify({
      action: 'subscribe',
      channels: this.activeChannels,
    }));
  }

  private handleMessage(payload: unknown): void {
    const record = asRecord(payload);
    if (!record) {
      return;
    }

    const channel = normalizeChannel(record.channel ?? record.topic);
    const eventName = normalizeChannel(record.event ?? record.type).toLowerCase();
    const data = getPayloadData(record);
    const dataRecord = asRecord(data);

    if (channel.startsWith('ticks.') || eventName.includes('tick')) {
      this.handleTick(dataRecord ?? record, channel);
    }

    if (channel.startsWith('positions.') || eventName.includes('position')) {
      this.handlePositions(data);
    }

    if (channel.startsWith('account.') || eventName.includes('account')) {
      this.handleAccount(dataRecord ?? record);
    }
  }

  private handleTick(data: Record<string, unknown>, channel: string): void {
    const channelSymbol = channel.startsWith('ticks.') ? channel.slice('ticks.'.length) : '';
    const symbol = String(data.symbol ?? data.s ?? channelSymbol ?? DEFAULT_SYMBOL);
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

    const liveAccount = useLiveAccountState.getState();
    const positions = usePositionsState.getState().positions;
    const currentPrice = numberFrom(data.price, bid, ask);
    if (currentPrice === undefined || positions.length === 0) {
      return;
    }

    const { equity, floating } = calculateEquityFromTick({
      balance: liveAccount.balance,
      positions,
      tick: { symbol, price: currentPrice },
      contractSizes: this.contractSizes,
    });
    const marginFree = equity - (Number(liveAccount.margin) || 0);

    useLiveAccountState.getState().updateMetrics({
      equity,
      floating,
      margin_free: marginFree,
      margin_level: liveAccount.margin > 0 ? (equity / liveAccount.margin) * 100 : liveAccount.margin_level,
    });
    useTradingState.getState().setAccount({
      equity,
      floating,
      freeMargin: marginFree,
    });
  }

  private handlePositions(data: unknown): void {
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

    usePositionsState.getState().upsertPosition(record);
  }

  private handleAccount(data: Record<string, unknown>): void {
    const login = numberFrom(data.login, data.account_login, resolveTradingLoginString());
    useLiveAccountState.getState().updateMetrics({
      ...(login !== undefined ? { login } : {}),
      ...(numberFrom(data.balance) !== undefined ? { balance: numberFrom(data.balance)! } : {}),
      ...(numberFrom(data.equity) !== undefined ? { equity: numberFrom(data.equity)! } : {}),
      ...(numberFrom(data.margin, data.usedMargin) !== undefined ? { margin: numberFrom(data.margin, data.usedMargin)! } : {}),
      ...(numberFrom(data.margin_free, data.freeMargin) !== undefined ? { margin_free: numberFrom(data.margin_free, data.freeMargin)! } : {}),
      ...(numberFrom(data.margin_level, data.marginLevel) !== undefined ? { margin_level: numberFrom(data.margin_level, data.marginLevel)! } : {}),
      ...(numberFrom(data.floating, data.pnl, data.profit) !== undefined ? { floating: numberFrom(data.floating, data.pnl, data.profit)! } : {}),
    });
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
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
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
