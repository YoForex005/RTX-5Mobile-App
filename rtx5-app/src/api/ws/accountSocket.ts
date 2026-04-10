/**
 * Core module: accountSocket.ts
 */

import { useUserPreferences } from '../../state/userPreferences';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';

/**
 * Singleton service for managing the Live Account WebSocket connection.
 * Communicates strict auth -> subscribe sequences over port 8090.
 */
class AccountWebSocketService {
  private static instance: AccountWebSocketService;
  private ws: WebSocket | null = null;
  private url = process.env.EXPO_PUBLIC_ACCOUNT_WS_URL || 'ws://69.197.178.27:8090/ws/v2';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private shouldReconnect = false; // Set false on explicit disconnect() to stop ghost retries
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private constructor() {}

  public static getInstance(): AccountWebSocketService {
    if (!AccountWebSocketService.instance) {
      AccountWebSocketService.instance = new AccountWebSocketService();
    }
    return AccountWebSocketService.instance;
  }

  /**
   * Public entry point. Resets backoff state then opens the socket.
   * Call this on login or explicit reconnect from the layout.
   */
  public connect(): void {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this._doConnect();
  }

  /**
   * Internal: creates the WebSocket and wires all event handlers.
   * Called by connect() and by the reconnect timer (without resetting attempt count).
   */
  private _doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const accountDetails = useUserPreferences.getState().accountDetails;
    if (!accountDetails || !accountDetails.credentials?.accessToken) {
      console.warn('[Account WS] No auth credentials available. Will retry in 5s in case tokens are refreshing.');
      // Don't set shouldReconnect = false here — the token may be mid-refresh.
      // Schedule a delayed retry so we reconnect once the token lands.
      if (this.shouldReconnect && !this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this._doConnect();
        }, 5000);
      }
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Account WS] Connected to', this.url);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();

        // 1. Send Auth immediately
        this.ws?.send(JSON.stringify({
          action: 'auth',
          token: accountDetails.credentials!.accessToken,
        }));

        // 2. Send Subscription Channel
        this.ws?.send(JSON.stringify({
          action: 'subscribe',
          channel: `account.${accountDetails.id}`,
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);

          // Legacy: pure account data (no event field)
          if (payload.channel?.startsWith('account.') && payload.data && !payload.event) {
            useLiveAccountState.getState().updateMetrics(payload.data);
          }

          // Real-time Event Routing
          if (payload.event === 'position.update' && payload.data) {
            console.log('[Account WS] Received position.update');
            usePositionsState.getState().upsertPosition(payload.data);
          }

          if (payload.event === 'order.status' && payload.data) {
            console.log('[Account WS] Received order.status');
            const currentLogin =
              payload.data.login || useUserPreferences.getState().accountDetails?.id;
            if (currentLogin) {
              void usePositionsState.getState().refreshPositions(String(currentLogin));
            }
          }

          if (payload.event === 'account.snapshot' && payload.data) {
            useLiveAccountState.getState().updateMetrics(payload.data);
          }
        } catch (e) {
          console.warn('[Account WS] Parse error', e);
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
        // Log a clean one-liner instead of dumping the raw Event object
        const state = this.ws?.readyState ?? -1;
        console.warn(
          `[Account WS] Connection error — url: ${this.url} | readyState: ${state}`,
        );
      };
    } catch (e) {
      console.error('[Account WS] Connection initialization failed', e);
      this.attemptReconnect();
    }
  }

  /**
   * Forcefully closes the connection, clears active heartbeat intervals, 
   * and resets the live account state to zeros.
   */
  public disconnect(): void {
    // Signal that this is an intentional close — stop all pending reconnect timers
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.stopHeartbeat();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
    useLiveAccountState.getState().resetMetrics();
  }

  private attemptReconnect(): void {
    // Do NOT reconnect if disconnect() was called explicitly
    if (!this.shouldReconnect) return;
    const accountDetails = useUserPreferences.getState().accountDetails;
    if (!accountDetails?.credentials?.accessToken) {
      // Token may be mid-refresh — retry in 5s instead of giving up permanently.
      console.warn('[Account WS] No credentials during reconnect — retrying in 5s.');
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this._doConnect();
        }, 5000);
      }
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const timeout = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      console.log(`[Account WS] Reconnecting in ${timeout}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this._doConnect();
      }, timeout);
    } else {
      console.warn('[Account WS] Max reconnect attempts reached. Giving up until next login.');
      this.shouldReconnect = false;
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
}

export const accountWsService = AccountWebSocketService.getInstance();
