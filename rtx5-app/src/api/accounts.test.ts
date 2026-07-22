import assert from 'node:assert/strict';
import test from 'node:test';

import { mapRawAccount, type TradingAccountRaw } from './accountsMapper.ts';
import { buildAccountDetailPath } from './accountsRoutes.ts';

test('buildAccountDetailPath uses the singular account detail contract route', () => {
  assert.equal(buildAccountDetailPath(200082), '/account/200082');
});

test('mapRawAccount coerces numeric string fields to numbers', () => {
  const account = mapRawAccount({
    login: '200082',
    name: 'Arijit',
    group: 'real_standard',
    currency: 'USD',
    leverage: '500',
    balance: '119701.53',
    credit: '0',
    equity: '119705.25',
    used_margin: '25.5',
    free_margin: '119679.75',
    margin_level: '469432.35',
    floating_pnl: '3.72',
    total_swap: '-0.15',
    open_positions: '2',
    status: 'active',
    created_at: '1773500000',
    updated_at: '1773500300',
  } satisfies TradingAccountRaw);

  assert.equal(account.login, 200082);
  assert.equal(account.balance, 119701.53);
  assert.equal(account.equity, 119705.25);
  assert.equal(account.usedMargin, 25.5);
  assert.equal(account.freeMargin, 119679.75);
  assert.equal(account.floatingPnl, 3.72);
  assert.equal(account.openPositions, 2);
  assert.equal(typeof account.balance, 'number');
});

test('mapRawAccount accepts singular account detail metric aliases', () => {
  const account = mapRawAccount({
    login: 200082,
    name: 'Arijit',
    group: 'real_standard',
    currency: 'USD',
    leverage: 500,
    balance: 119701.53,
    credit: 0,
    equity: 119705.25,
    margin: 25.5,
    margin_free: 119679.75,
    margin_level: 469432.35,
    floating: 3.72,
    status: 'active',
  } satisfies TradingAccountRaw);

  assert.equal(account.usedMargin, 25.5);
  assert.equal(account.freeMargin, 119679.75);
  assert.equal(account.floatingPnl, 3.72);
});

test('mapRawAccount accepts margin_used and skips blank aliases', () => {
  const account = mapRawAccount({
    login: 200082,
    currency: 'USD',
    leverage: 500,
    balance: 10000,
    credit: 0,
    equity: 10050,
    margin_used: ' ',
    used_margin: '125.5',
    free_margin: '',
    freeMargin: '9924.5',
    margin_level: null,
    marginLevel: '8007.97',
  } satisfies TradingAccountRaw);

  assert.equal(account.usedMargin, 125.5);
  assert.equal(account.freeMargin, 9924.5);
  assert.equal(account.marginLevel, 8007.97);
});

test('mapRawAccount derives omitted free margin and margin level from account values', () => {
  const account = mapRawAccount({
    login: 200082,
    currency: 'USD',
    leverage: 500,
    balance: 10000,
    credit: 0,
    equity: 10100,
    margin_used: 100,
  } satisfies TradingAccountRaw);

  assert.equal(account.freeMargin, 10000);
  assert.equal(account.marginLevel, 10100);
});

test('mapRawAccount falls back to zero for missing numeric fields', () => {
  const account = mapRawAccount({
    login: undefined,
    name: '',
    group: '',
    currency: '',
    leverage: undefined,
    balance: undefined,
    credit: undefined,
    equity: undefined,
    used_margin: undefined,
    free_margin: undefined,
    margin_level: undefined,
    floating_pnl: undefined,
    total_swap: undefined,
    status: '',
    created_at: undefined,
    updated_at: undefined,
  } satisfies TradingAccountRaw);

  assert.equal(account.login, 0);
  assert.equal(account.name, 'Account 0');
  assert.equal(account.balance, 0);
  assert.equal(account.currency, 'USD');
  assert.equal(account.status, 'active');
});
