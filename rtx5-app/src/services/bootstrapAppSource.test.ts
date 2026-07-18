import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/services/bootstrapApp.ts'), 'utf8');

test('bootstrap applies live data as each startup request resolves', () => {
  const bootstrapSource = source();

  const realtimeConnectIndex = bootstrapSource.indexOf('brokerRealtimeService.connect()');
  const mePromiseIndex = bootstrapSource.indexOf("const mePromise = requestJson('/auth/me')");
  const accountsPromiseIndex = bootstrapSource.indexOf('const accountsPromise = accountLogin');
  const positionsPromiseIndex = bootstrapSource.indexOf('const positionsPromise = accountLogin');
  const ordersPromiseIndex = bootstrapSource.indexOf('const ordersPromise = accountLogin');
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
  assert.match(bootstrapSource, /accountsPromise = accountLogin[\s\S]*requestJson\(buildAccountDetailPath\(accountLogin\)\)[\s\S]*updateAccountMetricsFromBootstrap\(accounts, accountLogin\)/);
  assert.match(bootstrapSource, /positionsPromise = accountLogin[\s\S]*requestJson\(`\/positions\/\$\{encodedAccountLogin\}`\)[\s\S]*applyPositionsSnapshot\(resolvedRows, accountLogin/);
  assert.match(bootstrapSource, /ordersPromise = accountLogin[\s\S]*requestJson\(`\/orders\/\$\{encodedAccountLogin\}`\)[\s\S]*getOrdersByLoginQueryKey\(cacheNamespace, Number\(accountLogin\)\)/);
  assert.doesNotMatch(bootstrapSource, /requestJson\('\/accounts'\)/);
  assert.doesNotMatch(bootstrapSource, /requestJson\('\/positions'\)/);
  assert.doesNotMatch(bootstrapSource, /requestJson\('\/orders'\)/);
  assert.match(bootstrapSource, /instrumentsPromise = requestJson\('\/instruments\?favorites=true'\)\.then\(\(result\) =>[\s\S]*appQueryClient\.setQueryData\([\s\S]*\['instruments', cacheNamespace, 'favorites'\]/);
  assert.doesNotMatch(bootstrapSource, /setInstrumentSpecs/);
  assert.match(bootstrapSource, /marketStatusPromise = requestJson\('\/market\/status'\)\.then\(\(result\) =>[\s\S]*appQueryClient\.setQueryData\(\['marketStatus', cacheNamespace\], marketStatus\)/);
});

test('bootstrap binds every parsed response and cache write to one session namespace', () => {
  const bootstrapSource = source();

  assert.match(bootstrapSource, /const sessionCapture = captureActiveBrokerSession\(\)/);
  assert.match(bootstrapSource, /const activeProvenance = getActiveBrokerSessionProvenance\(sessionCapture\.session\)/);
  assert.match(bootstrapSource, /options\.expectedProvenance\.cacheNamespace !== activeProvenance\.cacheNamespace/);
  assert.match(bootstrapSource, /!isActiveBrokerSessionProvenanceCurrent\(options\.expectedProvenance\)/);
  assert.match(bootstrapSource, /requestedAccountLogin !== sessionCapture\.session\.accountLogin/);
  assert.match(bootstrapSource, /const cacheNamespace = sessionCapture\.session\.cacheNamespace/);
  assert.match(bootstrapSource, /brokerApi\.getJsonResponse<T>\(endpoint\)/);
  assert.match(bootstrapSource, /brokerApi\.commitJsonResponse\(result, cacheNamespace, commit\)/);
  assert.match(bootstrapSource, /error instanceof StaleBrokerSessionError/);
});

test('bootstrap account metrics accepts common backend account aliases', () => {
  const bootstrapSource = source();

  assert.match(bootstrapSource, /const unwrapAccountRows = \(value: unknown\): unknown\[\] => \{/);
  assert.match(bootstrapSource, /const credit = Number\(record\.credit\)/);
  assert.match(bootstrapSource, /record\.margin \?\? record\.usedMargin \?\? record\.used_margin/);
  assert.match(bootstrapSource, /record\.margin_free \?\? record\.freeMargin \?\? record\.free_margin \?\? record\.margin_available/);
  assert.match(bootstrapSource, /record\.floating \?\? record\.floatingPnl \?\? record\.floating_pnl \?\? record\.unrealized_pl \?\? record\.pnl/);
  assert.match(bootstrapSource, /credit: Number\.isFinite\(credit\) \? credit : 0/);
});
