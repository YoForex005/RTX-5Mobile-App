import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readOrderTicketSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/OrderTicketScreen.tsx'), 'utf8');

test('order ticket pending submit uses the pending-order API contract', () => {
  const source = readOrderTicketSource();
  const pendingStart = source.indexOf('const handlePlacePendingOrder = async () =>');
  const pendingEnd = source.indexOf('const spread = Math.round', pendingStart);
  assert.notEqual(pendingStart, -1, 'pending submit handler must exist');
  assert.notEqual(pendingEnd, -1, 'pending submit handler boundary must exist');

  const pendingHandler = source.slice(pendingStart, pendingEnd);
  assert.match(pendingHandler, /price:\s*pendingEntryPrice/);
  assert.match(pendingHandler, /ordersApi\.placePendingOrder\(payload\)/);
  assert.doesNotMatch(pendingHandler, /ordersApi\.placeMarketOrder\(payload as any\)/);
});
