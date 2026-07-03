/**
 * Chart color presets, defaults, theme fallbacks, and the resolver that
 * applies theme-driven structural overrides on top of the user's saved colors.
 */
import type {
  ChartColorScheme,
  ChartColorsConfig,
  ChartDisplaySettings,
} from './types';

export const CHART_COLOR_SCHEME_PRESETS: Record<Exclude<ChartColorScheme, 'custom'>, { label: string; colors: ChartColorsConfig }> = {
  green_on_black: {
    label: 'Green on Black',
    colors: {
      background: '#121212',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.18)',
      candlesUptrend: '#10B981',
      candlesDowntrend: '#EF4444',
      hollowBody: '#121212',
      barsUptrend: '#10B981',
      barsDowntrend: '#EF4444',
      lineBody: '#10B981',
    },
  },
  black_on_white: {
    label: 'Black on White',
    colors: {
      background: '#FFFFFF',
      foreground: '#0F172A',
      grid: 'rgba(0,0,0,0.09)',
      candlesUptrend: '#2563EB',
      candlesDowntrend: '#EF4444',
      hollowBody: '#FFFFFF',
      barsUptrend: '#2563EB',
      barsDowntrend: '#EF4444',
      lineBody: '#2563EB',
    },
  },
  yellow_on_black: {
    label: 'Yellow on Black',
    colors: {
      background: '#121212',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.18)',
      candlesUptrend: '#FACC15',
      candlesDowntrend: '#F59E0B',
      hollowBody: '#121212',
      barsUptrend: '#FACC15',
      barsDowntrend: '#F59E0B',
      lineBody: '#FACC15',
    },
  },
};

export const DEFAULT_CHART_COLOR_SCHEME: Exclude<ChartColorScheme, 'custom'> = 'green_on_black';

export const DEFAULT_CHART_COLORS: ChartColorsConfig = {
  ...CHART_COLOR_SCHEME_PRESETS[DEFAULT_CHART_COLOR_SCHEME].colors,
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
};

type StructuralChartColors = Pick<ChartColorsConfig, 'background' | 'foreground' | 'grid' | 'hollowBody'>;

const normalizeStructuralChartColor = (color: string): string =>
  color.trim().toLowerCase().replace(/\s+/g, '');

const createStructuralColorSet = (values: readonly string[]): Set<string> =>
  new Set(values.map(normalizeStructuralChartColor));

const isNearBlackChartColor = (color: string): boolean => {
  const normalized = normalizeStructuralChartColor(color);
  if (normalized === '#000' || normalized === '#000000' || normalized === 'black') {
    return true;
  }

  const rgbMatch = normalized.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/);
  if (!rgbMatch) {
    return false;
  }

  const [, red, green, blue, alpha] = rgbMatch;
  if (alpha !== undefined && Number(alpha) <= 0) {
    return false;
  }

  return Number(red) <= 16 && Number(green) <= 16 && Number(blue) <= 16;
};

const LIGHT_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
  foreground: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
  grid: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
  hollowBody: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
};

const DARK_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background,
  foreground: DEFAULT_CHART_COLORS.foreground,
  grid: DEFAULT_CHART_COLORS.grid,
  hollowBody: CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody,
};

const BUILTIN_STRUCTURAL_VALUES: Record<keyof StructuralChartColors, Set<string>> = {
  background: createStructuralColorSet([
    '#000000', // legacy default — ensures persisted values get migrated
    '#080B11', // previous dark chart default
    '#0E141F', // previous card default
    DEFAULT_CHART_COLORS.background,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.background,
  ]),
  foreground: createStructuralColorSet([
    DEFAULT_CHART_COLORS.foreground,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.foreground,
  ]),
  grid: createStructuralColorSet([
    'rgba(255,255,255,0.04)',
    'rgba(255,255,255,0.06)',
    'rgba(255,255,255,0.15)',
    'rgba(255,255,255,0.18)',
    'rgba(15,23,42,0.12)',
    'rgba(15,23,42,0.16)',
    DEFAULT_CHART_COLORS.grid,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.grid,
  ]),
  hollowBody: createStructuralColorSet([
    '#080B11', // previous dark chart default
    '#1E293B', // previous hollow body default
    DEFAULT_CHART_COLORS.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.hollowBody,
  ]),
};

export function resolveChartColorsForTheme(
  chartColors: Partial<ChartColorsConfig> | undefined,
  chartColorScheme: ChartColorScheme | undefined,
  isDark: boolean,
): ChartColorsConfig {
  const mergedColors: ChartColorsConfig = {
    ...DEFAULT_CHART_COLORS,
    ...(chartColors ?? {}),
  };

  const resolvedColors = { ...mergedColors };
  const presetStructuralColors = chartColorScheme && chartColorScheme !== 'custom'
    ? {
        background: CHART_COLOR_SCHEME_PRESETS[chartColorScheme].colors.background,
        foreground: CHART_COLOR_SCHEME_PRESETS[chartColorScheme].colors.foreground,
        grid: CHART_COLOR_SCHEME_PRESETS[chartColorScheme].colors.grid,
        hollowBody: CHART_COLOR_SCHEME_PRESETS[chartColorScheme].colors.hollowBody,
      }
    : null;
  const schemeStructuralColors = presetStructuralColors
    ? (isDark ? presetStructuralColors : LIGHT_THEME_CHART_FALLBACKS)
    : null;
  const themeStructuralColors = schemeStructuralColors ?? (isDark ? DARK_THEME_CHART_FALLBACKS : LIGHT_THEME_CHART_FALLBACKS);
  const forceThemeStructure = schemeStructuralColors !== null;

  (Object.keys(themeStructuralColors) as Array<keyof StructuralChartColors>).forEach((key) => {
    const normalizedValue = normalizeStructuralChartColor(mergedColors[key]);
    const isInvisibleDarkGrid = key === 'grid' && isDark && isNearBlackChartColor(mergedColors[key]);
    if (
      forceThemeStructure ||
      (!chartColorScheme && (isInvisibleDarkGrid || BUILTIN_STRUCTURAL_VALUES[key].has(normalizedValue)))
    ) {
      resolvedColors[key] = themeStructuralColors[key];
    }
  });

  return resolvedColors;
}

export const DEFAULT_CHART_DISPLAY_SETTINGS: ChartDisplaySettings = {
  showTicker: true,
  showOHLC: false,
  showQuickTradingButtons: true,
  // Single visible guide line: live Bid only. Ask stays internal for trading.
  showLivePriceLine: true,
  // Legacy keys kept for persisted preference migration only.
  showBidPriceLine: true,
  showAskPriceLine: false,
  // true = show the colored axis label (box) for the last-close price on the
  // right price scale. This is standard in all professional trading apps
  // (MT5, TradingView, Dhan). Note: this no longer controls priceLineVisible
  // on the series - the live price line is the only horizontal line on the
  // chart canvas.
  showLastPriceLine: true,
  showGrid: true,
  periodSeparators: true,
  showTickVolumes: true,
  showRealVolumes: false,
  showObjectDescriptions: false,
  showTradeLevels: true,
  showTradeHistory: true,
};
