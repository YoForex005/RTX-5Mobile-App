import { useUserPreferences } from '../../state/userPreferences';
import { useLiveAccountState } from '../../state/liveAccountState';

/**
 * Singleton service for managing the Live Account WebSocket connection.
 * Communicates strict auth -> subscribe sequences over port 8090.
 */
class AccountWebSocketService {
  private static instance: AccountWebSocketService;
  private ws: WebSocket | null = null;
  private url = 'ws://69.197.178.27:8090/ws/v2';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private constructor() {}

  public static getInstance(): AccountWebSocketService {
    if (!AccountWebSocketService.instance) {
      AccountWebSocketService.instance = new AccountWebSocketService();
    }
    return AccountWebSocketService.instance;
  }

  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const accountDetails = useUserPreferences.getState().accountDetails;
    if (!accountDetails || !accountDetails.credentials?.accessToken) {
      console.warn('[Account WS] No auth credentials available. Refusing to connect.');
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
          token: accountDetails.credentials!.accessToken
        }));

        // 2. Send Subscription Channel
        this.ws?.send(JSON.stringify({
          action: 'subscribe',
          channel: `account.${accountDetails.id}`
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);
          if (payload.channel?.startsWith('account.') && payload.data) {
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

      this.ws.onerror = (error) => {
        console.error('[Account WS] Error', error);
      };

    } catch (e) {
      console.error('[Account WS] Connection initialization failed', e);
      this.attemptReconnect();
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.stopHeartbeat();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
    useLiveAccountState.getState().resetMetrics();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const timeout = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Expon backoff
      console.log(`[Account WS] Reconnecting in ${timeout}ms... (Attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), timeout);
    } else {
      console.error('[Account WS] Max reconnect attempts reached. Connection failed permanently.');
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
