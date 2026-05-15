import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('chart symbol pickers keep the saved chart symbol first and include fallback symbols', () => {
  for (const sourcePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
  ]) {
    const source = readSource(sourcePath);

    assert.doesNotMatch(source, /const\s+CHART_SYMBOLS\s*=/, sourcePath);
    assert.doesNotMatch(source, /apiSymbols\.length\s*>\s*0\s*\?\s*apiSymbols\s*:/, sourcePath);
    assert.match(source, /DEFAULT_CHART_SYMBOLS/, sourcePath);
    assert.match(source, /const\s+buildAvailableChartSymbols\s*=\s*\(chartSymbol: string, apiSymbols: readonly string\[\]\)/, sourcePath);
    assert.match(source, /push\(chartSymbol\);[\s\S]*apiSymbols\.forEach\(push\);[\s\S]*DEFAULT_CHART_SYMBOLS\.forEach\(push\);/, sourcePath);
    assert.match(source, /const\s+availableSymbols\s*=\s*useMemo\([\s\S]*buildAvailableChartSymbols\(chartSymbol, apiSymbols\)/, sourcePath);
    assert.match(source, /subtitle:\s*resolveChartSymbolFullName\(sym\)/, sourcePath);
    assert.match(source, /resolveChartSymbolCategory\(chartSymbol\)/, sourcePath);
    assert.doesNotMatch(source, /setChartSymbol\(apiSymbols\[0\]\)/, sourcePath);
    assert.doesNotMatch(source, /symbolCategory\s*=\s*SYMBOL_CATEGORY\[baseSymbol\]\s*\?\?\s*'FX'/, sourcePath);
  }
});

test('native compact symbol header opens immediately from the full header tap target', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(source, /const CHART_SYMBOL_HEADER_HIT_SLOP = \{ top: 10, bottom: 18, left: 16, right: 48 \}/);
  assert.match(source, /const symbolPickerActions = useMemo\([\s\S]*availableSymbols\.map/);
  assert.match(source, /actions: symbolPickerActions/);
  assert.match(source, /instantOpen:\s*true/);
  assert.match(
    source,
    /<Pressable[\s\S]*hitSlop=\{CHART_SYMBOL_HEADER_HIT_SLOP\}[\s\S]*style=\{\[styles\.symbolSection, styles\.symbolSectionTapTarget\]\}[\s\S]*onPressIn=\{handleOpenSymbolPicker\}/,
  );
  assert.match(styles, /symbolSectionTapTarget:/);
  assert.match(styles, /symbolSectionContent:/);
});
