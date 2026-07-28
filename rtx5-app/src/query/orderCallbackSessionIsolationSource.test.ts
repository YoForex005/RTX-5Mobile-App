import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/query/orders.ts'), 'utf8');

test('order executor never delivers a completion callback to a later broker epoch', () => {
  const start = source.indexOf('export const usePlaceOrderExecutor');
  const executor = source.slice(start);

  assert.match(
    executor,
    /\.then\(\(data\) => \{\s*if \(!isActiveBrokerSessionOwnerStampCurrent\(owner\)\) return;\s*options\.onSuccess\?\.\(data\);/,
  );
  assert.match(
    executor,
    /\.catch\(\(error\) => \{\s*if \(!isActiveBrokerSessionOwnerStampCurrent\(owner\)\) return;\s*options\.onError\?\.\(error\);/,
  );
});
