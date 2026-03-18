import { useQuery } from '@tanstack/react-query';
import { getBrokerConfig, BrokerConfigResponse, BrokerConfigError } from '../api/broker';

// ═══════════════════════════════════════════════════════════════════════════════
// TanStack Query hook for GET /broker/config
//
// Fetches and caches broker configuration (branding, feature flags, leverage
// limits, supported currencies, etc.). The hook is enabled when a brokerId
// is provided OR the user is authenticated (Bearer token present).
//
// Caching strategy:
//   staleTime: 5 minutes — broker config rarely changes during a session
//   retry: smart — retries transient errors (500/503/network), skips client
//          errors (422/404) since those won't resolve on retry
// ═══════════════════════════════════════════════════════════════════════════════

export const BROKER_CONFIG_KEY = 'brokerConfig';

/**
 * Determines whether a failed broker config request should be retried.
 *
 * Retries on:
 *   - Network errors (statusCode === 0)
 *   - Server errors (500, 502, 503, 504)
 *   - Rate limiting (429) — may succeed after backoff
 *
 * Does NOT retry on:
 *   - Client errors (401, 403, 404, 422) — won't resolve without user action
 */
function shouldRetryBrokerConfig(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false; // Max 2 retries

  if (error instanceof BrokerConfigError) {
    const { statusCode } = error;
    // Don't retry client errors — they won't resolve on retry
    if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 422) {
      return false;
    }
    // Retry transient server/network errors
    return true;
  }

  // Retry unknown errors (could be transient)
  return true;
}

/**
 * TanStack Query hook for broker configuration.
 *
 * @param brokerId - Optional broker ID. If provided, fetches config for that
 *                   specific broker. If omitted, relies on Bearer token to
 *                   resolve the broker automatically.
 * @param enabled  - Optional override to control when the query fires.
 *                   Defaults to true when brokerId is truthy.
 */
export function useBrokerConfig(brokerId?: string, enabled?: boolean) {
  return useQuery<BrokerConfigResponse, Error>({
    queryKey: [BROKER_CONFIG_KEY, brokerId],
    queryFn: () => getBrokerConfig(brokerId),
    enabled: enabled ?? !!brokerId,
    staleTime: 5 * 60 * 1000,  // 5 minutes — broker config changes rarely
    retry: shouldRetryBrokerConfig,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff: 1s, 2s, 4s... capped at 10s
  });
}

