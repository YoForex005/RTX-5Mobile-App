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
import {
  extractLiveAccountMetrics,
  resolveAccountWsSession,
  type AccountWsSession,
} from './accountSocket.helpers';

const BASE_WS_URL = process.env.EXPO_PUBLIC_ACCOUNT_WS_URL || 'wss://backend.orrnn.com/ws/v2';

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
      this.teardownSocket(false);
    }

    this.doConnect();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeSession = null;
    this.clearReconnectTimer();
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
      console.warn('[Account WS] No authenticated MT5 session available. Will retry in 5s.');
      this.scheduleRetry(5000);
      return;
    }

    this.activeSession = session;
    const wsUrl = `${BASE_WS_URL}?token=${encodeURIComponent(session.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Account WS] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.send({ action: 'subscribe', channel: `metrics.${session.login}` });
        this.send({ action: 'subscribe', channel: `positions.${session.login}` });
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);
          this.handlePayload(payload);
        } catch (error) {
          console.warn('[Account WS] Parse error', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[Account WS] Closed');
        this.stopHeartbeat();
        this.isConnected = false;
        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        const state = this.ws?.readyState ?? -1;
        console.warn(`[Account WS] Connection error - readyState: ${state}`);
      };
    } catch (error) {
      console.error('[Account WS] Connection initialization failed', error);
      this.attemptReconnect();
    }
  }

  private handlePayload(payload: any): void {
    const channel = typeof payload?.channel === 'string' ? payload.channel : '';
    const data = payload?.data ?? payload;

    if ((channel.startsWith('metrics.') || channel.startsWith('account.')) && data) {
      const metrics = extractLiveAccountMetrics(data);
      if (metrics) {
        useLiveAccountState.getState().updateMetrics(metrics);
      }
    }

    if (channel.startsWith('positions.') && data) {
      this.handlePositionsPayload(data);
    }

    if (payload?.event === 'position.update' && payload.data) {
      usePositionsState.getState().upsertPosition(payload.data);
    }

    if (payload?.event === 'order.status' && payload.data) {
      const currentLogin = payload.data.login || resolveTradingLogin() || useUserPreferences.getState().accountDetails?.id;
      if (currentLogin) {
        void usePositionsState.getState().refreshPositions(String(currentLogin));
      }
    }

    if (payload?.event === 'account.snapshot' && payload.data) {
      const metrics = extractLiveAccountMetrics(payload.data);
      if (metrics) {
        useLiveAccountState.getState().updateMetrics(metrics);
      }
    }
  }

  private handlePositionsPayload(data: any): void {
    if (Array.isArray(data)) {
      for (const position of data) {
        usePositionsState.getState().upsertPosition(position);
      }
      return;
    }

    if (Array.isArray(data?.positions)) {
      for (const position of data.positions) {
        usePositionsState.getState().upsertPosition(position);
      }
      return;
    }

    if (data && typeof data === 'object' && (data.ticket || data.id || data.symbol)) {
      usePositionsState.getState().upsertPosition(data);
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
      console.warn('[Account WS] No valid auth session during reconnect. Retrying in 5s.');
      this.scheduleRetry(5000);
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[Account WS] Max reconnect attempts reached. Giving up until next login.');
      this.shouldReconnect = false;
      return;
    }

    this.reconnectAttempts += 1;
    const timeout = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    console.log(
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
