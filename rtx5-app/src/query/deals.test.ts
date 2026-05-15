import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Deal } from '../api/deals';
import { buildAccountDealsQueryKey, filterDealsByTimeRange, mergeDealHistorySources } from './dealsHistory';

function makeDeal(overrides: Partial<Deal>): Deal {
  return {
    ticket: 1,
    order_ticket: 1,
    position_ticket: 1,
    account_login: 200074,
    symbol: 'BTCUSD',
    action: 'deal_buy',
    entry: 'entry_in',
    volume: 0.1,
    price: 30000,
    profit: 0,
    swap: 0,
    commission: 0,
    fee: 0,
    magic: 0,
    comment: '',
    time: 1_700_000_000,
    ...overrides,
  };
}

test('account deals query key is scoped by active login', () => {
  assert.deepEqual(buildAccountDealsQueryKey(200082, 1_700_000_000, 1_700_086_400), [
    'accountDeals',
    200082,
    1_700_000_000,
    1_700_086_400,
  ]);

  assert.notDeepEqual(
    buildAccountDealsQueryKey(200082, 1_700_000_000, 1_700_086_400),
    buildAccountDealsQueryKey(300082, 1_700_000_000, 1_700_086_400),
  );
});

test('mergeDealHistorySources preserves account deals and appends demo login fallback deals', () => {
  const accountDeal = makeDeal({ ticket: 10, position_ticket: 100, price: 30000 });
  const duplicateLoginDeal = makeDeal({ ticket: 10, position_ticket: 100, price: 29999 });
  const demoFallbackDeal = makeDeal({ ticket: 11, position_ticket: 100, entry: 'entry_out', price: 30500, profit: 50 });

  const merged = mergeDealHistorySources([accountDeal], [duplicateLoginDeal, demoFallbackDeal]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].price, 30000, 'account endpoint remains authoritative for duplicate deals');
  assert.equal(merged[1].ticket, 11, 'login-scoped demo fallback deal is preserved');
});

test('filterDealsByTimeRange applies the selected history window to fallback deals', () => {
  const outside = makeDeal({ ticket: 20, time: 1_699_999_999 });
  const insideSeconds = makeDeal({ ticket: 21, time: 1_700_000_100 });
  const insideMs = makeDeal({ ticket: 22, time: 1_700_000_200_000 });

  const filtered = filterDealsByTimeRange(
    [outside, insideSeconds, insideMs],
    1_700_000_000,
    1_700_000_300,
  );

  assert.deepEqual(filtered.map((deal) => deal.ticket), [21, 22]);
});
