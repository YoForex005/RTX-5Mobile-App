import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  mapAccountSummaryApiResponse,
  type AccountSummaryApiResponse,
} from './account.ts';

const source = () => readFileSync(resolve(process.cwd(), 'src/api/account.ts'), 'utf8');

test('account summary mapper derives account-value metrics when backend omits derived fields', () => {
  const accountSource = source();

  assert.match(accountSource, /export function mapAccountSummaryApiResponse/);
  assert.match(accountSource, /const credit = toFiniteNumber\(raw\.credit\)/);
  assert.match(accountSource, /pickFiniteNumber\(raw\.unrealized_pl, raw\.floating_pnl, raw\.floating\)/);
  assert.match(accountSource, /balance \+ credit \+ profit/);
  assert.match(accountSource, /raw\.margin_used,[\s\S]*raw\.used_margin,[\s\S]*raw\.margin/);
  assert.match(accountSource, /raw\.free_margin,[\s\S]*raw\.margin_free,[\s\S]*raw\.freeMargin/);
  assert.match(accountSource, /\?\? equity - margin/);
  assert.match(accountSource, /margin > 0[\s\S]*\? \(equity \/ margin\) \* 100[\s\S]*: 0/);
});

test('account summary mapper normalizes margin aliases without blank-value masking', () => {
  const summary = mapAccountSummaryApiResponse({
    id: '200082',
    balance: '10000',
    credit: '25',
    equity: '10050',
    margin_used: ' ',
    used_margin: '125.5',
    free_margin: '',
    freeMargin: '9924.5',
    margin_level: null,
    marginLevel: '8007.97',
    currency: 'USD',
    leverage: '500',
  } satisfies AccountSummaryApiResponse);

  assert.equal(summary.margin, 125.5);
  assert.equal(summary.freeMargin, 9924.5);
  assert.equal(summary.marginLevel, 8007.97);
});

test('account summary mapper derives missing account metrics and preserves explicit zero', () => {
  const derived = mapAccountSummaryApiResponse({
    id: '200082',
    balance: 10000,
    credit: 25,
    equity: null,
    floating_pnl: 75,
    margin_used: 100,
    currency: null,
    account_currency: 'EUR',
    leverage: 500,
  } satisfies AccountSummaryApiResponse);
  const zero = mapAccountSummaryApiResponse({
    id: '200082',
    balance: 10000,
    equity: 10000,
    margin_used: 0,
    free_margin: 10000,
    margin_level: 0,
    currency: 'USD',
    leverage: 500,
  } satisfies AccountSummaryApiResponse);

  assert.equal(derived.equity, 10100);
  assert.equal(derived.freeMargin, 10000);
  assert.equal(derived.marginLevel, 10100);
  assert.equal(derived.currency, 'EUR');
  assert.equal(zero.margin, 0);
  assert.equal(zero.marginLevel, 0);
});
