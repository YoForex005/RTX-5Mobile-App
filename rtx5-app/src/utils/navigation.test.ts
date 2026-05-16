import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { safeRouterBack } from './navigation';

const collectSourceFiles = (dir: string): string[] => {
  const absoluteDir = resolve(process.cwd(), dir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const absoluteEntry = resolve(absoluteDir, entry);
    const relativeEntry = `${dir}/${entry}`.replace(/\\/g, '/');
    if (statSync(absoluteEntry).isDirectory()) {
      return collectSourceFiles(relativeEntry);
    }
    return /\.(ts|tsx)$/.test(entry) ? [relativeEntry] : [];
  });
};

test('safeRouterBack dispatches back only when a previous route exists', () => {
  const calls: string[] = [];
  safeRouterBack(
    {
      canGoBack: () => true,
      back: () => calls.push('back'),
      replace: (href) => calls.push(`replace:${href}`),
    },
    '/(tabs)/chart',
  );

  assert.deepEqual(calls, ['back']);
});

test('safeRouterBack replaces with fallback when no navigator can handle go back', () => {
  const calls: string[] = [];
  safeRouterBack(
    {
      canGoBack: () => false,
      back: () => calls.push('back'),
      replace: (href) => calls.push(`replace:${href}`),
    },
    '/(tabs)/chart',
  );

  assert.deepEqual(calls, ['replace:/(tabs)/chart']);
});

test('feature screens do not dispatch router.back directly', () => {
  const offenders = ['app', 'src/features']
    .flatMap(collectSourceFiles)
    .filter((file) => readFileSync(resolve(process.cwd(), file), 'utf8').includes('router.back()'));

  assert.deepEqual(offenders, []);
});
