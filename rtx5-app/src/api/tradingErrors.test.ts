import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyTradingError,
  createFrontendTradingError,
  createTradingApiError,
  formatTradingErrorFeedback,
} from './tradingErrors';

test('classifyTradingError marks fetch failures as backend availability problems', () => {
  const feedback = classifyTradingError(new Error('Failed to fetch'), {
    action: 'place-order',
  });

  assert.equal(feedback.origin, 'backend');
  assert.equal(feedback.kind, 'backend-unavailable');
  assert.equal(feedback.title, 'Trading Server Unavailable');
});

test('classifyTradingError marks instrument routing failures as API integration issues', () => {
  const feedback = classifyTradingError(
    createTradingApiError(404, { message: 'Instrument not found' }),
    { action: 'place-order' },
  );

  assert.equal(feedback.origin, 'api');
  assert.equal(feedback.kind, 'integration');
  assert.match(feedback.message, /API rejected the symbol, account, or broker routing/i);
});

test('classifyTradingError marks 401 responses as session expiry', () => {
  const feedback = classifyTradingError(
    createTradingApiError(401, { message: 'Unauthorized' }),
    { action: 'place-order' },
  );

  assert.equal(feedback.origin, 'session');
  assert.equal(feedback.kind, 'session-expired');
  assert.equal(feedback.title, 'Session Expired');
});

test('classifyTradingError reads the canonical gateway response.error code', () => {
  const feedback = classifyTradingError(
    createTradingApiError(503, {
      error: 'NO_FRESH_QUOTE',
      message: 'No fresh quote available',
    }),
    { action: 'place-order' },
  );

  assert.equal(feedback.kind, 'backend-rejection');
  assert.equal(feedback.title, 'Order Rejected');
  assert.match(feedback.message, /fresh market price/i);
});

test('classifyTradingError maps required market-order policy codes', () => {
  const cases = [
    ['INVALID_SIDE', 400, /Buy or Sell/i],
    ['INSUFFICIENT_MARGIN', 400, /margin/i],
    ['STALE_QUOTE', 409, /stale/i],
    ['SYMBOL_NOT_ALLOWED', 403, /not available/i],
    ['TRADE_ROUTE_NOT_CONFIGURED', 403, /not configured/i],
    ['INCOMPLETE_CONVERSION_DATA', 503, /calculation data/i],
  ] as const;

  for (const [error, status, expected] of cases) {
    const feedback = classifyTradingError(
      createTradingApiError(status, { error, message: 'backend detail' }),
      { action: 'place-order' },
    );
    assert.equal(feedback.kind, 'backend-rejection');
    assert.match(feedback.message, expected);
  }
});

test('classifyTradingError keeps retry-after information for rate limiting', () => {
  const feedback = classifyTradingError(
    createTradingApiError(429, { message: 'Too many requests' }, { 'retry-after': '17' }),
    { action: 'close-position' },
  );

  assert.equal(feedback.kind, 'rate-limit');
  assert.equal(feedback.retryAfterSeconds, 17);
  assert.match(feedback.message, /17 seconds/);
});

test('classifyTradingError redacts secrets before returning UI-safe detail', () => {
  const feedback = classifyTradingError(
    createTradingApiError(500, {
      message: 'upstream https://broker.example/failed?token=secret Authorization: Bearer abc123',
    }),
    { action: 'place-order' },
  );

  assert.doesNotMatch(feedback.message, /secret|abc123/);
  assert.doesNotMatch(feedback.detail ?? '', /secret|abc123/);
  assert.match(feedback.message, /\[redacted\]/);
});

test('frontend trading errors format cleanly for inline banners', () => {
  const feedback = createFrontendTradingError(
    'Account Error',
    'The app could not resolve the active trading account from local state.',
  );

  assert.equal(
    formatTradingErrorFeedback(feedback),
    'Account Error: The app could not resolve the active trading account from local state.',
  );
});
