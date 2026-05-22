/**
 * Core module: accountSocket.ts
 *
 * Singleton WebSocket service for live account data.
 *
 * Protocol:
 *   1. Connect to wss://backend.orrnn.com/ws/v2?token=JWT_TOKEN
 *   2. Subscribe: { "action": "subscribe", "channel": "metrics.LOGIN" }
 *                  { "action": "subscribe", "channel": "positions.LOGIN" }
 *
 *   - metrics.LOGIN   -> balance, equity, margin, free margin, margin level, floating
 *   - positions.LOGIN -> live profit per open trade (position updates)
 */

import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { useUserPreferences } from '../../state/userPreferences';
import { buildBrokerWsUrl } from '../brokerRouting';
import {
  extractLiveAccountMetrics,
  resolveAccountWsSession,
  type AccountWsSession,
} from './accountSocket.helpers';

const DEFAULT_ACCOUNT_WS_URL = 'wss://backend.orrnn.com/ws/v2';
const getAccountWsBaseUrl = () =>
  process.env.EXPO_PUBLIC_ACCOUNT_WS_URL ||
  buildBrokerWsUrl(useUserPreferences.getState().brokerServerUrl, '/ws/v2', DEFAULT_ACCOUNT_WS_URL);
const DEBUG_ACCOUNT_WS =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_ACCOUNT_WS === 'true';

const logAccountWsDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_ACCOUNT_WS) {
    console.log(...args);
  }
};

const warnAccountWsDiagnostic = (...args: Parameters<typeof console.warn>) => {
  if (DEBUG_ACCOUNT_WS) {
    console.warn(...args);
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const normalizeEventName = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, '.');

const getPayloadData = (payload: Record<string, unknown>): unknown =>
  payload.data ?? payload.payload ?? payload.result ?? payload;

const isPositionLikeRecord = (record: Record<string, unknown>): boolean =>
  record.ticket !== undefined ||
  record.id !== undefined ||
  record.position_ticket !== undefined ||
  record.order_ticket !== undefined ||
  (
    record.symbol !== undefined &&
    (
      record.volume !== undefined ||
      record.side !== undefined ||
      record.type !== undefined ||
      record.price_open !== undefined ||
      record.openPrice !== undefined ||
      record.profit !== undefined ||
      record.pnl !== undefined
    )
  );

const getLifecycleHints = (record: Record<string, unknown>): Record<string, unknown> => {
  const hints: Record<string, unknown> = {};
  for (const key of ['event', 'type', 'action', 'status', 'state', 'position_state', 'positionStatus']) {
    if (record[key] !== undefined) {
      hints[key] = record[key];
    }
  }
  return hints;
};

const mergeLifecycleHints = (
  item: Record<string, unknown>,
  parentHints: Record<string, unknown>,
): Record<string, unknown> => ({
  ...parentHints,
  ...item,
});

const extractPositionItems = (
  value: unknown,
  parentHints: Record<string, unknown> = {},
  seen = new WeakSet<object>(),
): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractPositionItems(item, parentHints, seen));
  }

  const record = asRecord(value);
  if (!record || seen.has(record)) {
    return [];
  }
  seen.add(record);

  const hints = { ...parentHints, ...getLifecycleHints(record) };
  if (isPositionLikeRecord(record)) {
    return [mergeLifecycleHints(record, parentHints)];
  }

  for (const key of ['positions', 'items', 'data', 'payload', 'result', 'position', 'item']) {
    const nested = record[key];
    if (nested !== undefined) {
      const nestedItems = extractPositionItems(nested, hints, seen);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }
  }

  return [];
};

const extractPositionSnapshot = (value: unknown): Record<string, unknown>[] | null => {
  if (Array.isArray(value)) {
    return extractPositionItems(value);
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  for (const key of ['positions', 'items', 'data', 'result']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return extractPositionItems(nested, getLifecycleHints(record));
    }
  }

  return null;
};

const isTruthySnapshotFlag = (value: unknown): boolean => {
  if (value === true) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'full' || normalized === 'complete' || normalized === 'snapshot';
  }
  return false;
};

const isAuthoritativePositionSnapshot = (
  value: unknown,
  parentHints: Record<string, unknown> = {},
): boolean => {
  const record = asRecord(value);
  const eventHints = [
    parentHints.event,
    parentHints.type,
    parentHints.action,
    record?.event,
    record?.type,
    record?.action,
  ].map(normalizeEventName);

  if (eventHints.some((hint) => hint === 'position.update' || hint === 'positions.update')) {
    return false;
  }

  if (
    eventHints.some(
      (hint) =>
        hint === 'position.snapshot' ||
        hint === 'positions.snapshot' ||
        hint === 'positions.full' ||
        hint === 'account.snapshot',
    )
  ) {
    return true;
  }

  if (
    isTruthySnapshotFlag(record?.snapshot) ||
    isTruthySnapshotFlag(record?.is_snapshot) ||
    isTruthySnapshotFlag(record?.full) ||
    isTruthySnapshotFlag(record?.complete)
  ) {
    return true;
  }

  return false;
};

class AccountWebSocketService {
  private static instance: AccountWebSocketService;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private activeSession: AccountWsSession | null = null;

  private constructor() {}

  public static getInstance(): AccountWebSocketService {
    if (!AccountWebSocketService.instance) {
      AccountWebSocketService.instance = new AccountWebSocketService();
    }
    return AccountWebSocketService.instance;
  }

  public connect(): void {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();

    const desiredSession = this.resolveSession();
    if (
      desiredSession &&
      this.activeSession &&
      (desiredSession.login !== this.activeSession.login || desiredSession.token !== this.activeSession.token)
    ) {
      // Account changed: clear stale metrics/positions immediately so the UI
      // does not keep rendering the old account while the new socket boots.
      useLiveAccountState.getState().resetMetrics();
      usePositionsState.getState().clearPositions();
      this.teardownSocket(false);
    }

    this.doConnect();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeSession = null;
    this.clearReconnectTimer();
    usePositionsState.getState().clearPositions();
    this.teardownSocket(true);
  }

  private resolveSession(): AccountWsSession | null {
    return resolveAccountWsSession(
      useUserPreferences.getState().accountDetails,
      resolveTradingLogin(),
    );
  }

  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const session = this.resolveSession();
    if (!session) {
      warnAccountWsDiagnostic('[Account WS] No authenticated MT5 session available. Will retry in 5s.');
      this.scheduleRetry(5000);
      return;
    }

    this.activeSession = session;
    const wsUrl = `${getAccountWsBaseUrl()}?token=${encodeURIComponent(session.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logAccountWsDiagnostic('[Account WS] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        // Different backend deployments still expose either `metrics.LOGIN`
        // or `account.LOGIN` for the same live account-summary stream.
        ['metrics', 'account', 'positions'].forEach((channelPrefix) => {
          this.send({ action: 'subscribe', channel: `${channelPrefix}.${session.login}` });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);
          this.handlePayload(payload);
        } catch (error) {
          warnAccountWsDiagnostic('[Account WS] Parse error', error);
        }
      };

      this.ws.onclose = () => {
        logAccountWsDiagnostic('[Account WS] Closed');
        this.stopHeartbeat();
        this.isConnected = false;
        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        const state = this.ws?.readyState ?? -1;
        warnAccountWsDiagnostic(`[Account WS] Connection error - readyState: ${state}`);
      };
    } catch (error) {
      console.error('[Account WS] Connection initialization failed', error);
      this.attemptReconnect();
    }
  }

  private handlePayload(payload: any): void {
    const payloadRecord = asRecord(payload);
    const channel = typeof payloadRecord?.channel === 'string' ? payloadRecord.channel : '';
    const eventName = normalizeEventName(payloadRecord?.event ?? payloadRecord?.type);
    const data = payloadRecord ? getPayloadData(payloadRecord) : payload;

    if (
      data &&
      (channel.startsWith('metrics.') ||
        channel.startsWith('account.') ||
        eventName.startsWith('account') ||
        eventName.startsWith('metrics'))
    ) {
      const metrics = extractLiveAccountMetrics(data);
      if (metrics) {
        useLiveAccountState.getState().updateMetrics(metrics);
      }
    }

    if (data && (channel.startsWith('positions.') || eventName.startsWith('position'))) {
      this.handlePositionsPayload(data, getLifecycleHints(payloadRecord ?? {}));
    }

    if (eventName === 'order.status' && data) {
      const orderRecord = asRecord(data);
      const currentLogin = orderRecord?.login || resolveTradingLogin() || useUserPreferences.getState().accountDetails?.id;
      if (currentLogin) {
        void usePositionsState.getState().refreshPositions(String(currentLogin));
      }
    }

    if (eventName === 'account.snapshot' && data) {
      const metrics = extractLiveAccountMetrics(data);
      if (metrics) {
        useLiveAccountState.getState().updateMetrics(metrics);
      }
    }
  }

  private handlePositionsPayload(data: any, parentHints: Record<string, unknown> = {}): void {
    const accountLogin = this.activeSession ? String(this.activeSession.login) : undefined;
    const snapshot = extractPositionSnapshot(data);

    if (snapshot) {
      const isAuthoritativeSnapshot = isAuthoritativePositionSnapshot(data, parentHints);
      usePositionsState.getState().applyPositionsSnapshot(snapshot, accountLogin, {
        preserveMissingExisting: !isAuthoritativeSnapshot,
      });
      return;
    }

    const updates = extractPositionItems(data, parentHints);
    if (updates.length === 0) {
      return;
    }

    for (const update of updates) {
      usePositionsState.getState().upsertPosition(update);
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (!this.resolveSession()) {
      warnAccountWsDiagnostic('[Account WS] No valid auth session during reconnect. Retrying in 5s.');
      this.scheduleRetry(5000);
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      warnAccountWsDiagnostic('[Account WS] Max reconnect attempts reached. Giving up until next login.');
      this.shouldReconnect = false;
      return;
    }

    this.reconnectAttempts += 1;
    const timeout = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    logAccountWsDiagnostic(
      `[Account WS] Reconnecting in ${timeout}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );
    this.scheduleRetry(timeout);
  }

  private scheduleRetry(timeoutMs: number): void {
    if (!this.shouldReconnect || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, timeoutMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private teardownSocket(resetMetrics: boolean): void {
    const currentSocket = this.ws;
    this.stopHeartbeat();
    this.isConnected = false;
    this.ws = null;

    if (currentSocket) {
      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      currentSocket.close();
    }

    if (resetMetrics) {
      useLiveAccountState.getState().resetMetrics();
    }
  }
}

export const accountWsService = AccountWebSocketService.getInstance();
