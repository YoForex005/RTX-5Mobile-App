import { brokerApi } from '../brokerApi';
import { AppState } from 'react-native';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import { appQueryClient } from '../../state/providers/AppProviders';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  type ActiveBrokerSessionIdentity,
} from '../../state/activeBrokerSession';
import { isSocketAuthenticationFailure } from './socketClosePolicy';
import { payloadMatchesSocketIdentity } from './socketPayloadIdentity';
import {
  hasStableConnectionSucceeded,
  resolveFullJitterBackoffMs,
} from './reconnectBackoff';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import { invalidateSessionQueryRoots } from '../../query/authenticatedQueryScope';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const STABLE_CONNECTION_MS = 10_000;
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

const sameIdentity = (
  left: ActiveBrokerSessionIdentity | null,
  right: ActiveBrokerSessionIdentity,
): boolean => Boolean(
  left &&
  left.brokerId === right.brokerId &&
  left.accountLogin === right.accountLogin &&
  left.sessionEpoch === right.sessionEpoch,
);

class BrokerRealtimeService {
  private static instance: BrokerRealtimeService | null = null;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private isSuspended = AppState.currentState !== 'active';
  private isOpening = false;
  private activeIdentity: ActiveBrokerSessionIdentity | null = null;
  private activeChannels: string[] = [];
  private connectedAt = 0;
  private acceptedPayloadCount = 0;

  static getInstance(): BrokerRealtimeService {
    if (!BrokerRealtimeService.instance) {
      BrokerRealtimeService.instance = new BrokerRealtimeService();
    }
    return BrokerRealtimeService.instance;
  }

  connect(): void {
    const identity = this.resolveIdentity();
    if (!identity) {
      this.pauseUntilNextLogin();
      return;
    }
    this.shouldReconnect = true;
    this.activeChannels = this.resolveChannels(identity);
    if (this.isSuspended) {
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      if (sameIdentity(this.activeIdentity, identity)) {
        this.subscribe(identity);
        return;
      }
      this.teardownSocket();
    }
    void this.open(identity);
  }

  reconnect(): void {
    const identity = this.resolveIdentity();
    if (!identity) {
      this.pauseUntilNextLogin();
      return;
    }
    if (!this.shouldReconnect) {
      this.shouldReconnect = true;
    }
    if (this.isSuspended) {
      return;
    }
    this.clearReconnectTimer();
    this.teardownSocket();
    this.activeChannels = this.resolveChannels(identity);
    void this.open(identity);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeChannels = [];
    this.clearReconnectTimer();
    this.teardownSocket();
  }

  /** Pause transport work without dropping lifecycle demand or cached state. */
  suspend(): void {
    if (this.isSuspended) return;
    this.isSuspended = true;
    this.clearReconnectTimer();
    this.teardownSocket();
  }

  /** Resume only the demand that existed before the app left the foreground. */
  resume(): void {
    if (!this.isSuspended) return;
    this.isSuspended = false;
    if (!this.shouldReconnect) return;
    const identity = this.resolveIdentity();
    if (!identity) {
      this.pauseUntilNextLogin();
      return;
    }
    this.activeChannels = this.resolveChannels(identity);
    void this.open(identity);
  }

  private async open(identity: ActiveBrokerSessionIdentity): Promise<void> {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      !isActiveBrokerSessionCurrent(identity) ||
      this.isOpening
    ) {
      return;
    }

    this.isOpening = true;
    try {
      const wsUrl = await brokerApi.getWebSocketUrl();
      this.isOpening = false;
      if (this.isSuspended || !this.shouldReconnect || !isActiveBrokerSessionCurrent(identity)) {
        const current = this.resolveIdentity();
        if (this.shouldReconnect && current) void this.open(current);
        return;
      }
      const socket = new WebSocket(wsUrl);
      this.ws = socket;
      this.activeIdentity = identity;

      socket.onopen = () => {
        if (this.ws !== socket || !isActiveBrokerSessionCurrent(identity)) {
          socket.close();
          return;
        }
        this.activeChannels = this.resolveChannels(identity);
        this.connectedAt = Date.now();
        this.acceptedPayloadCount = 0;
        this.startHeartbeat(identity);
        this.startStableConnectionTimer(socket, identity);
        this.subscribe(identity);
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket || !isActiveBrokerSessionCurrent(identity)) return;
        try {
          const accepted = this.handleMessage(JSON.parse(event.data as string), identity);
          if (accepted) {
            this.acceptedPayloadCount += 1;
            if (hasStableConnectionSucceeded({
              connectedAt: this.connectedAt,
              now: Date.now(),
              acceptedPayloadCount: this.acceptedPayloadCount,
              stableAfterMs: STABLE_CONNECTION_MS,
            })) {
              this.markConnectionHealthy();
            }
          }
        } catch (error) {
          console.warn(
            '[BrokerRealtime] Failed to parse message',
            redactDiagnosticValue(error),
          );
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.stopHeartbeat();
        this.clearStableConnectionTimer();
        this.ws = null;
        this.activeIdentity = null;
        this.connectedAt = 0;
        this.acceptedPayloadCount = 0;
        if (isSocketAuthenticationFailure(event?.code)) {
          this.pauseUntilNextLogin();
          return;
        }
        if (isActiveBrokerSessionCurrent(identity)) this.scheduleReconnect(identity);
      };

      socket.onerror = () => {
        // onclose performs reconnect scheduling on React Native.
      };
    } catch (error) {
      this.isOpening = false;
      if (isAuthSessionUnavailable(error)) {
        this.pauseUntilNextLogin();
        return;
      }
      console.warn('[BrokerRealtime] Connection failed', redactDiagnosticValue(error));
      if (isActiveBrokerSessionCurrent(identity)) this.scheduleReconnect(identity);
    }
  }

  private resolveChannels(identity: ActiveBrokerSessionIdentity): string[] {
    const login = identity.accountLogin;
    return ACCOUNT_LIFECYCLE_CHANNELS.map((channel) => `${channel}.${login}`);
  }

  private subscribe(identity: ActiveBrokerSessionIdentity): void {
    if (
      this.ws?.readyState !== WebSocket.OPEN ||
      this.activeChannels.length === 0 ||
      !sameIdentity(this.activeIdentity, identity) ||
      !isActiveBrokerSessionCurrent(identity)
    ) {
      return;
    }

    this.send({
      action: 'subscribe',
      channels: this.activeChannels,
    });
  }

  private handleMessage(payload: unknown, identity: ActiveBrokerSessionIdentity): boolean {
    if (
      !sameIdentity(this.activeIdentity, identity) ||
      !isActiveBrokerSessionCurrent(identity) ||
      !payloadMatchesSocketIdentity(payload, identity)
    ) {
      return false;
    }
    const record = asRecord(payload);
    if (!record) {
      return false;
    }

    const channel = normalizeChannel(record.channel ?? record.topic);
    const data = getPayloadData(record);
    const dataRecord = asRecord(data);
    const eventName =
      normalizeEventName(record.event ?? record.type ?? record.action) ||
      normalizeEventName(dataRecord?.event ?? dataRecord?.type ?? dataRecord?.action);

    let accepted = false;
    if (channel.startsWith('positions.') || eventName.includes('position')) {
      accepted = this.handlePositions(data, eventName, identity) || accepted;
    }

    if (
      channel.startsWith('account.') ||
      channel.startsWith('metrics.') ||
      eventName.includes('account') ||
      eventName.includes('metrics')
    ) {
      accepted = this.handleAccount(dataRecord ?? record, identity) || accepted;
    }

    if (
      channel.startsWith('orders.') ||
      channel.startsWith('deals.') ||
      channel.startsWith('history.') ||
      eventName.startsWith('order.') ||
      eventName.startsWith('deal.') ||
      eventName.startsWith('history.')
    ) {
      accepted = this.handleLifecycleEvent(dataRecord ?? record, eventName, identity) || accepted;
    }
    return accepted;
  }

  private handlePositions(
    data: unknown,
    eventName: string,
    identity: ActiveBrokerSessionIdentity,
  ): boolean {
    if (Array.isArray(data)) {
      usePositionsState.getState().applyPositionsSnapshot(data, identity.accountLogin, {
        preserveMissingExisting: false,
      });
      return true;
    }

    const record = asRecord(data);
    if (!record) {
      return false;
    }

    const positions = record.positions ?? record.items ?? record.data;
    if (Array.isArray(positions)) {
      usePositionsState.getState().applyPositionsSnapshot(positions, identity.accountLogin, {
        preserveMissingExisting: false,
      });
      return true;
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
      this.invalidateLifecycleQueries(eventName, identity);
      return true;
    }

    usePositionsState.getState().upsertPosition({
      ...lifecycleHints,
      ...record,
    });
    this.invalidateLifecycleQueries(eventName, identity);
    return true;
  }

  private handleAccount(
    data: Record<string, unknown>,
    identity: ActiveBrokerSessionIdentity,
  ): boolean {
    const metricsRecord = asRecord(data.metrics) ?? asRecord(data.account) ?? data;
    const login = numberFrom(metricsRecord.login, metricsRecord.account_login, identity.accountLogin);
    const metrics = {
      ...(login !== undefined ? { login } : {}),
      ...(numberFrom(metricsRecord.balance) !== undefined ? { balance: numberFrom(metricsRecord.balance)! } : {}),
      ...(numberFrom(metricsRecord.equity) !== undefined ? { equity: numberFrom(metricsRecord.equity)! } : {}),
      ...(numberFrom(metricsRecord.margin, metricsRecord.usedMargin) !== undefined ? { margin: numberFrom(metricsRecord.margin, metricsRecord.usedMargin)! } : {}),
      ...(numberFrom(metricsRecord.margin_free, metricsRecord.freeMargin) !== undefined ? { margin_free: numberFrom(metricsRecord.margin_free, metricsRecord.freeMargin)! } : {}),
      ...(numberFrom(metricsRecord.margin_level, metricsRecord.marginLevel) !== undefined ? { margin_level: numberFrom(metricsRecord.margin_level, metricsRecord.marginLevel)! } : {}),
      ...(numberFrom(metricsRecord.floating, metricsRecord.pnl, metricsRecord.profit) !== undefined ? { floating: numberFrom(metricsRecord.floating, metricsRecord.pnl, metricsRecord.profit)! } : {}),
    };
    if (Object.keys(metrics).length === 0) return false;
    useLiveAccountState.getState().updateMetrics(metrics);
    return true;
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

  private handleLifecycleEvent(
    data: Record<string, unknown>,
    eventName: string,
    identity: ActiveBrokerSessionIdentity,
  ): boolean {
    let accepted = false;
    const position = asRecord(data.position);
    if (position) {
      accepted = this.handlePositions(data, eventName, identity) || accepted;
    }

    const metrics = asRecord(data.metrics) ?? asRecord(data.account);
    if (metrics) {
      accepted = this.handleAccount(metrics, identity) || accepted;
    }

    this.invalidateLifecycleQueries(eventName, identity);
    return accepted || Boolean(eventName);
  }

  private invalidateLifecycleQueries(
    eventName: string,
    identity: ActiveBrokerSessionIdentity,
  ): void {
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

    const capture = captureActiveBrokerSession();
    if (!capture || !isActiveBrokerSessionCurrent(identity)) return;
    void invalidateSessionQueryRoots(
      appQueryClient,
      capture.session.cacheNamespace,
      LIFECYCLE_CACHE_KEYS,
    );
  }

  private scheduleReconnect(identity: ActiveBrokerSessionIdentity): void {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      this.reconnectTimer ||
      !isActiveBrokerSessionCurrent(identity)
    ) {
      return;
    }
    const currentIdentity = this.resolveIdentity();
    if (!currentIdentity || !sameIdentity(currentIdentity, identity)) {
      this.pauseUntilNextLogin();
      return;
    }

    const delay = resolveFullJitterBackoffMs({
      attempt: this.reconnectAttempts,
      baseMs: RECONNECT_BASE_MS,
      capMs: RECONNECT_MAX_MS,
    });
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isSuspended && isActiveBrokerSessionCurrent(identity)) void this.open(identity);
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
    this.activeIdentity = null;
    this.connectedAt = 0;
    this.acceptedPayloadCount = 0;
    this.stopHeartbeat();
    this.clearStableConnectionTimer();
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  }

  private startHeartbeat(identity: ActiveBrokerSessionIdentity): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!isActiveBrokerSessionCurrent(identity)) {
        this.teardownSocket();
        return;
      }
      this.send({ action: 'ping' });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startStableConnectionTimer(
    socket: WebSocket,
    identity: ActiveBrokerSessionIdentity,
  ): void {
    this.clearStableConnectionTimer();
    this.stableConnectionTimer = setTimeout(() => {
      this.stableConnectionTimer = null;
      if (
        this.ws === socket &&
        socket.readyState === WebSocket.OPEN &&
        !this.isSuspended &&
        isActiveBrokerSessionCurrent(identity) &&
        hasStableConnectionSucceeded({
          connectedAt: this.connectedAt,
          now: Date.now(),
          acceptedPayloadCount: this.acceptedPayloadCount,
          stableAfterMs: STABLE_CONNECTION_MS,
        })
      ) {
        this.markConnectionHealthy();
      }
    }, STABLE_CONNECTION_MS);
  }

  private clearStableConnectionTimer(): void {
    if (this.stableConnectionTimer) {
      clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
    }
  }

  private markConnectionHealthy(): void {
    this.reconnectAttempts = 0;
    this.connectedAt = 0;
    this.acceptedPayloadCount = 0;
    this.clearStableConnectionTimer();
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private resolveIdentity(): ActiveBrokerSessionIdentity | null {
    const capture = captureActiveBrokerSession();
    if (!capture?.session.tradeWsBase || !capture.credentials.accessToken) return null;
    return getActiveBrokerSessionIdentity(capture.session);
  }

  private pauseUntilNextLogin(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeChannels = [];
    this.activeIdentity = null;
    this.clearReconnectTimer();
    this.clearStableConnectionTimer();
    this.teardownSocket();
  }
}

export const brokerRealtimeService = BrokerRealtimeService.getInstance();
