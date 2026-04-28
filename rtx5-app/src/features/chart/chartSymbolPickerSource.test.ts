import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('chart symbol pickers use API symbols without hardcoded fallback symbols', () => {
  for (const sourcePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
  ]) {
    const source = readSource(sourcePath);

    assert.doesNotMatch(source, /const\s+CHART_SYMBOLS\s*=/, sourcePath);
    assert.doesNotMatch(source, /apiSymbols\.length\s*>\s*0\s*\?\s*apiSymbols\s*:/, sourcePath);
    assert.match(source, /const\s+availableSymbols\s*=\s*apiSymbols\s*;/, sourcePath);
  }
});
