export type QuoteSocketFailureCategory = 'authentication' | 'transport';

export type QuoteSocketCloseDetails = Readonly<{
  code?: number;
  reason?: string | null;
  didOpen: boolean;
}>;

const EXPLICIT_AUTH_FAILURE_CLOSE_CODES = new Set([
  1008,
  4001,
  4401,
  4403,
]);
const AUTHENTICATION_HANDSHAKE_REASON =
  /\b(?:401|403)\b|unauthori[sz]ed|forbidden|authentication\s+(?:failed|rejected)/i;

/**
 * React Native reports a failed HTTP WebSocket upgrade as `error`, followed by
 * close code 1006 with OkHttp's HTTP status in `reason`. Keep classification
 * pure so the service can wait for that close event instead of hiding a 401 as
 * an endlessly retried transport error.
 */
export const classifyQuoteSocketClose = (
  details: QuoteSocketCloseDetails,
): QuoteSocketFailureCategory => {
  if (
    typeof details.code === 'number' &&
    EXPLICIT_AUTH_FAILURE_CLOSE_CODES.has(details.code)
  ) {
    return 'authentication';
  }

  if (
    !details.didOpen &&
    details.code === 1006 &&
    AUTHENTICATION_HANDSHAKE_REASON.test(String(details.reason ?? ''))
  ) {
    return 'authentication';
  }

  return 'transport';
};

export const isQuoteSocketAuthenticationFailure = (
  details: QuoteSocketCloseDetails,
): boolean => classifyQuoteSocketClose(details) === 'authentication';
