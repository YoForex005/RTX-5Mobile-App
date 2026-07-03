import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHART_COLOR_SCHEME_PRESETS,
  DEFAULT_CHART_COLOR_SCHEME,
  DEFAULT_CHART_COLORS,
  resolveChartColorsForTheme,
} from './chartColors';

test('chart color resolver uses app-theme structure with default green/red candles', () => {
  const lightColors = resolveChartColorsForTheme(DEFAULT_CHART_COLORS, DEFAULT_CHART_COLOR_SCHEME, false);
  const darkColors = resolveChartColorsForTheme(DEFAULT_CHART_COLORS, DEFAULT_CHART_COLOR_SCHEME, true);
  const greenPreset = CHART_COLOR_SCHEME_PRESETS.green_on_black.colors;
  const lightPreset = CHART_COLOR_SCHEME_PRESETS.black_on_white.colors;

  assert.equal(lightColors.background, lightPreset.background);
  assert.equal(lightColors.foreground, lightPreset.foreground);
  assert.equal(lightColors.grid, lightPreset.grid);
  assert.equal(lightColors.hollowBody, lightPreset.hollowBody);

  assert.equal(darkColors.background, greenPreset.background);
  assert.equal(darkColors.foreground, greenPreset.foreground);
  assert.equal(darkColors.grid, greenPreset.grid);
  assert.equal(darkColors.hollowBody, greenPreset.hollowBody);

  [lightColors, darkColors].forEach((colors) => {
    assert.equal(colors.candlesUptrend, greenPreset.candlesUptrend);
    assert.equal(colors.candlesDowntrend, greenPreset.candlesDowntrend);
    assert.equal(colors.barsUptrend, greenPreset.barsUptrend);
    assert.equal(colors.barsDowntrend, greenPreset.barsDowntrend);
    assert.equal(colors.lineBody, greenPreset.lineBody);
  });
});

test('chart color resolver keeps built-in light schemes explicit in dark theme and adapts dark schemes in light theme', () => {
  const darkAppWithWhiteScheme = resolveChartColorsForTheme(
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors,
    'black_on_white',
    true,
  );
  const lightAppWithGreenScheme = resolveChartColorsForTheme(
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors,
    'green_on_black',
    false,
  );

  assert.equal(darkAppWithWhiteScheme.background, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background);
  assert.equal(darkAppWithWhiteScheme.hollowBody, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody);
  assert.equal(lightAppWithGreenScheme.background, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background);
  assert.equal(lightAppWithGreenScheme.hollowBody, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody);
  assert.equal(lightAppWithGreenScheme.candlesUptrend, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.candlesUptrend);
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

test('chart color resolver preserves explicit custom light canvas colors in dark theme', () => {
  const darkColors = resolveChartColorsForTheme(
    {
      ...DEFAULT_CHART_COLORS,
      background: '#FAFAFA',
      foreground: '#111827',
      grid: 'rgba(0,0,0,0.09)',
      hollowBody: '#FFFFFF',
    },
    'custom',
    true,
  );

  assert.equal(darkColors.background, '#FAFAFA');
  assert.equal(darkColors.foreground, '#111827');
  assert.equal(darkColors.grid, 'rgba(0,0,0,0.09)');
  assert.equal(darkColors.hollowBody, '#FFFFFF');
});

test('chart color resolver preserves explicit custom dark canvas colors in dark theme', () => {
  const darkColors = resolveChartColorsForTheme(
    {
      ...DEFAULT_CHART_COLORS,
      background: '#101827',
      foreground: '#E5E7EB',
      hollowBody: '#101827',
    },
    'custom',
    true,
  );

  assert.equal(darkColors.background, '#101827');
  assert.equal(darkColors.foreground, '#E5E7EB');
  assert.equal(darkColors.hollowBody, '#101827');
});

test('chart color resolver preserves explicit custom dark canvas colors in light theme', () => {
  const lightColors = resolveChartColorsForTheme(
    {
      ...DEFAULT_CHART_COLORS,
      background: '#101827',
      foreground: '#E5E7EB',
      grid: 'rgba(255,255,255,0.18)',
      hollowBody: '#101827',
    },
    'custom',
    false,
  );

  assert.equal(lightColors.background, '#101827');
  assert.equal(lightColors.foreground, '#E5E7EB');
  assert.equal(lightColors.grid, 'rgba(255,255,255,0.18)');
  assert.equal(lightColors.hollowBody, '#101827');
});
