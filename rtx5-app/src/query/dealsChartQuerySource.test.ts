import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/query/deals.ts'), 'utf8');

const sliceBetween = (start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
};

test('chart deals use an unfiltered, broker-session-scoped accountDeals cache entry', () => {
  assert.match(
    source,
    /getChartDealsQueryKey[\s\S]*\[ACCOUNT_DEALS_KEY, cacheNamespace, login \?\? 'session', 'chart-unfiltered'\] as const/,
  );

  const hook = sliceBetween('export function useChartDealsQuery', 'export function useDealsQuery');
  assert.match(hook, /useActiveBrokerQuerySession\(\)/);
  assert.match(hook, /getSessionQueryCacheNamespace\(session\)/);
  assert.match(hook, /runSessionBoundQuery\(\s*cacheNamespace,/);
  assert.match(hook, /fetchAccountDealsWithLoginFallback\(login\)/);
  assert.match(hook, /resolvePollingRefetchInterval\(enabled, 5_000, options\.refetchInterval\)/);
  assert.doesNotMatch(hook, /useUserPreferences|resolveEffectiveHistoryDateRange|options\.(?:from|to)/);
});

test('chart deals reuse the account and login endpoint merge path', () => {
  const fetcher = sliceBetween(
    'const fetchAccountDealsWithLoginFallback',
    'export function useAccountDealsQuery',
  );

  assert.match(fetcher, /Promise\.all\(/);
  assert.match(fetcher, /dealsApi\.getAccountDeals\(/);
  assert.match(fetcher, /getLoginDealsWithRangeFallback\(login, from, to\)/);
  assert.match(fetcher, /mergeDealHistorySources\(/);
});
