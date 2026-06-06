import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHART_COLOR_SCHEME_PRESETS,
  DEFAULT_CHART_COLORS,
  resolveChartColorsForTheme,
} from './chartColors';

test('chart color resolver keeps light grid behavior and resolves built-in dark grid to a visible value', () => {
  const lightColors = resolveChartColorsForTheme(DEFAULT_CHART_COLORS, 'custom', false);
  assert.equal(
    lightColors.grid,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
    'light theme must keep the existing MT5 light grid composite',
  );

  [
    'rgba(255,255,255,0.04)',
    'rgba(255, 255, 255, 0.04)',
    'rgba(255,255,255,0.06)',
    'rgba(255,255,255,0.18)',
    'rgba(0, 0, 0, 0.09)',
    'rgba(0,0,0,0.09)',
    '#000000',
    'black',
  ].forEach((legacyGrid) => {
    const darkColors = resolveChartColorsForTheme(
      { ...DEFAULT_CHART_COLORS, grid: legacyGrid },
      'custom',
      true,
    );
    assert.equal(
      darkColors.grid,
      DEFAULT_CHART_COLORS.grid,
      `${legacyGrid} must resolve to the current visible dark grid`,
    );
    assert.equal(darkColors.grid, 'rgba(255,255,255,0.26)');
  });
});

test('chart color resolver preserves explicit custom grid choices in dark theme', () => {
  const customGrid = '#1F2937';
  const darkColors = resolveChartColorsForTheme(
    { ...DEFAULT_CHART_COLORS, grid: customGrid },
    'custom',
    true,
  );

  assert.equal(darkColors.grid, customGrid);
});
