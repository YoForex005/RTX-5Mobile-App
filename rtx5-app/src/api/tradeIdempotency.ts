/**
 * Idempotency keys for server-side trade mutations.
 *
 * The key is injected by BrokerAPI so every active mobile trade route uses
 * the same contract without depending on individual screens to remember it.
 */

let fallbackSequence = 0;

const normalizedPath = (endpoint: string): string => {
  const withoutQuery = endpoint.split(/[?#]/, 1)[0] || '';
  const relativePath = /^https?:\/\//i.test(withoutQuery)
    ? new URL(withoutQuery).pathname
    : withoutQuery;
  const withLeadingSlash = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const withoutApiPrefix = withLeadingSlash.replace(/^\/api\/v2(?=\/|$)/, '');
  return (withoutApiPrefix.replace(/\/+$/, '') || '/');
};

/** Returns the key prefix for the five idempotent trade routes, if applicable. */
export const getTradeIdempotencyAction = (endpoint: string, method: string): string | null => {
  const path = normalizedPath(endpoint);
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === 'POST' && path === '/orders') return 'order';
  if (normalizedMethod === 'POST' && path === '/orders/pending') return 'pending';

  const closeMatch = normalizedMethod === 'POST'
    ? path.match(/^\/positions\/([^/]+)\/close$/)
    : null;
  if (closeMatch) return `close-${closeMatch[1]}`;

  const pendingTicketMatch = path.match(/^\/orders\/pending\/([^/]+)$/);
  if (pendingTicketMatch && normalizedMethod === 'PUT') return `pending-modify-${pendingTicketMatch[1]}`;
  if (pendingTicketMatch && normalizedMethod === 'DELETE') return `pending-cancel-${pendingTicketMatch[1]}`;

  return null;
};

const normalizeAction = (action: string): string => {
  const normalized = action
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'trade';
};

/**
 * Uses UUID v4 when the runtime provides it. The fallback remains dependency
 * free for React Native runtimes where Web Crypto is not available.
 */
export const createTradeIdempotencyKey = (action: string): string => {
  const runtimeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof runtimeCrypto?.randomUUID === 'function') {
    try {
      return `${normalizeAction(action)}-${runtimeCrypto.randomUUID()}`;
    } catch {
      // Fall through to the RN-safe fallback below.
    }
  }

  fallbackSequence += 1;
  return [
    normalizeAction(action),
    Date.now().toString(36),
    fallbackSequence.toString(36),
    Math.random().toString(36).slice(2, 14),
  ].join('-');
};
