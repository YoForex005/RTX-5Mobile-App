export const ORRNN_DEMO_PUBLIC_BROKER_ID = 'orrnn-demo';
export const ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL =
  'https://demobackend.orrnn.com';
export const ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE =
  'public-market:orrnn-demo:v1';
export const ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL =
  `${ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL}/api/v1`;
export const ORRNN_DEMO_PUBLIC_FEED_WS_URL =
  'wss://demobackend.orrnn.com/ws/feed';
export const ORRNN_DEMO_PUBLIC_FEED_STATUS_URL =
  `${ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL}/ws/feed/status`;

export function resolveBrokerConnectionWithPublicDemoDefault(input: {
  brokerId: string;
  serverUrl: string;
  isLoggedIn: boolean;
}): { brokerId: string; serverUrl: string } {
  if (input.isLoggedIn) {
    return {
      brokerId: input.brokerId,
      serverUrl: input.serverUrl,
    };
  }

  if (input.brokerId && input.brokerId !== ORRNN_DEMO_PUBLIC_BROKER_ID) {
    return {
      brokerId: input.brokerId,
      serverUrl: input.serverUrl,
    };
  }

  return {
    brokerId: ORRNN_DEMO_PUBLIC_BROKER_ID,
    serverUrl: input.serverUrl || ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL,
  };
}
