import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/api/account.ts'), 'utf8');

test('account summary mapper derives account-value metrics when backend omits derived fields', () => {
  const accountSource = source();

  assert.match(accountSource, /export function mapAccountSummaryApiResponse/);
  assert.match(accountSource, /const credit = toFiniteNumber\(raw\.credit\)/);
  assert.match(accountSource, /const profit = toFiniteNumber\(raw\.unrealized_pl \?\? raw\.floating_pnl \?\? raw\.floating\)/);
  assert.match(accountSource, /balance \+ credit \+ profit/);
  assert.match(accountSource, /const freeMargin = raw\.margin_available !== undefined \|\| raw\.free_margin !== undefined \|\| raw\.margin_free !== undefined[\s\S]*: equity - margin/);
  assert.match(accountSource, /margin > 0[\s\S]*\? \(equity \/ margin\) \* 100[\s\S]*: 0/);
});
