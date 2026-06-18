import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/services/bootstrapApp.ts'), 'utf8');

test('bootstrap applies live data as each startup request resolves', () => {
  const bootstrapSource = source();

  const realtimeConnectIndex = bootstrapSource.indexOf('brokerRealtimeService.connect()');
  const mePromiseIndex = bootstrapSource.indexOf("const mePromise = requestJson('/auth/me')");
  const accountsPromiseIndex = bootstrapSource.indexOf("const accountsPromise = requestJson('/accounts').then");
  const positionsPromiseIndex = bootstrapSource.indexOf("const positionsPromise = requestJson('/positions').then");
  const ordersPromiseIndex = bootstrapSource.indexOf("const ordersPromise = requestJson('/orders').then");
  const instrumentsPromiseIndex = bootstrapSource.indexOf("const instrumentsPromise = requestJson('/instruments?favorites=true').then");
  const marketStatusPromiseIndex = bootstrapSource.indexOf("const marketStatusPromise = requestJson('/market/status').then");
  const promiseAllIndex = bootstrapSource.indexOf('] = await Promise.all([');

  assert.ok(realtimeConnectIndex > -1 && realtimeConnectIndex < mePromiseIndex);
  assert.notEqual(mePromiseIndex, -1);
  assert.notEqual(accountsPromiseIndex, -1);
  assert.notEqual(positionsPromiseIndex, -1);
  assert.notEqual(ordersPromiseIndex, -1);
  assert.notEqual(instrumentsPromiseIndex, -1);
  assert.notEqual(marketStatusPromiseIndex, -1);
  assert.ok(promiseAllIndex > marketStatusPromiseIndex);
  assert.match(bootstrapSource, /accountsPromise = requestJson\('\/accounts'\)\.then\(\(accounts\) => \{[\s\S]*updateAccountMetricsFromBootstrap\(accounts, accountLogin\)/);
  assert.match(bootstrapSource, /positionsPromise = requestJson\('\/positions'\)\.then\(async \(positions\) => \{[\s\S]*applyPositionsSnapshot\(resolvedRows, accountLogin/);
  assert.match(bootstrapSource, /const unscopedRows = unwrapArray\(positions\)/);
  assert.match(bootstrapSource, /const needsScopedPositions = Boolean\(accountLogin && unscopedRows\.length === 0\)/);
  assert.match(bootstrapSource, /needsScopedPositions[\s\S]*requestJson\(`\/positions\/\$\{encodeURIComponent\(accountLogin\)\}`\)/);
  assert.match(bootstrapSource, /if \(resolvedPositions && \(accountLogin \|\| resolvedRows\.length > 0\)\)/);
  assert.match(bootstrapSource, /instrumentsPromise = requestJson\('\/instruments\?favorites=true'\)\.then\(\(instruments\) => \{[\s\S]*brokerRealtimeService\.setInstrumentSpecs\(instrumentRows\)/);
  assert.match(bootstrapSource, /marketStatusPromise = requestJson\('\/market\/status'\)\.then\(\(marketStatus\) => \{[\s\S]*appQueryClient\.setQueryData\(\['marketStatus'\], marketStatus\)/);
});

test('bootstrap account metrics accepts common backend account aliases', () => {
  const bootstrapSource = source();

  assert.match(bootstrapSource, /const credit = Number\(record\.credit\)/);
  assert.match(bootstrapSource, /record\.margin \?\? record\.usedMargin \?\? record\.used_margin/);
  assert.match(bootstrapSource, /record\.margin_free \?\? record\.freeMargin \?\? record\.free_margin \?\? record\.margin_available/);
  assert.match(bootstrapSource, /record\.floating \?\? record\.floatingPnl \?\? record\.floating_pnl \?\? record\.unrealized_pl \?\? record\.pnl/);
  assert.match(bootstrapSource, /credit: Number\.isFinite\(credit\) \? credit : 0/);
});
