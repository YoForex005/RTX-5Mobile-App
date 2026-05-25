import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('chart symbol dropdown prefers canonical uppercase broker symbols', () => {
  for (const sourcePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
  ]) {
    const source = readSource(sourcePath);

    assert.match(source, /const indexByKey = new Map<string, number>\(\)/, sourcePath);
    assert.match(
      source,
      /if \(trimmed === key && ordered\[existingIndex\] !== key\) \{[\s\S]*ordered\[existingIndex\] = trimmed;/,
      sourcePath,
    );
    assert.match(source, /apiSymbols\.forEach\(push\);[\s\S]*DEFAULT_CHART_SYMBOLS\.forEach\(push\);/, sourcePath);
  }
});
