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

test('classifyTradingError keeps retry-after information for rate limiting', () => {
  const feedback = classifyTradingError(
    createTradingApiError(429, { message: 'Too many requests' }, { 'retry-after': '17' }),
    { action: 'close-position' },
  );

  assert.equal(feedback.kind, 'rate-limit');
  assert.equal(feedback.retryAfterSeconds, 17);
  assert.match(feedback.message, /17 seconds/);
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
