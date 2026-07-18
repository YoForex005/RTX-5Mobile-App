import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readQueryModule = (name: string) =>
  readFileSync(resolve(process.cwd(), 'src', 'query', `${name}.ts`), 'utf8');

const assertUsesActiveSessionScope = (source: string) => {
  assert.match(source, /useActiveBrokerQuerySession\(\)/);
  assert.match(source, /getSessionQueryCacheNamespace\(session\)/);
  assert.match(source, /Boolean\(session\)/);
  assert.match(source, /runSessionBoundQuery\(/);
};

test('authenticated polling queries key every request by the active cache namespace', () => {
  const cases = [
    {
      name: 'alerts',
      key: /\[ALERTS_KEY, cacheNamespace\] as const/,
    },
    {
      name: 'watchlist',
      key: /\[WATCHLIST_KEY, cacheNamespace\] as const/,
    },
    {
      name: 'equityHistory',
      key: /\[EQUITY_HISTORY_KEY, cacheNamespace, period, interval\] as const/,
    },
    {
      name: 'transactions',
      key: /\[TRANSACTIONS_KEY, cacheNamespace, type, limit\] as const/,
    },
    {
      name: 'exposure',
      key: /\[EXPOSURE_KEY, cacheNamespace\] as const/,
    },
  ] as const;

  for (const { name, key } of cases) {
    const source = readQueryModule(name);
    assertUsesActiveSessionScope(source);
    assert.match(source, key);
    assert.doesNotMatch(source, /queryKey:\s*\[[A-Z_]+_KEY(?:,|\])/);
  }
});

test('alerts and watchlist mutations remain bound to their captured session namespace', () => {
  for (const name of ['alerts', 'watchlist']) {
    const source = readQueryModule(name);
    assert.match(source, /mutationFn:[\s\S]*runSessionBoundQuery\(/);
    assert.match(source, /invalidateSessionQueryRoots\(queryClient, cacheNamespace,/);
    assert.doesNotMatch(source, /queryClient\.invalidateQueries\(/);
  }
});
