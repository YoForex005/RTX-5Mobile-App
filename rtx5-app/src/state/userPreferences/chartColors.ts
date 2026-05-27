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
      background: '#0E0E12',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.18)',
      candlesUptrend: '#10B981',
      candlesDowntrend: '#EF4444',
      hollowBody: '#0E0E12',
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
      background: '#0E0E12',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.18)',
      candlesUptrend: '#FACC15',
      candlesDowntrend: '#F59E0B',
      hollowBody: '#0E0E12',
      barsUptrend: '#FACC15',
      barsDowntrend: '#F59E0B',
      lineBody: '#FACC15',
    },
  },
};

export const DEFAULT_CHART_COLORS: ChartColorsConfig = {
  background: '#080B11',
  foreground: '#94A3B8',
  // 0.15 — matches MT5 desktop's default dark-theme grid opacity. The
  // Solid grid lines are drawn behind the WebView candle canvas, so this
  // opacity needs to stay visible without crossing over candle bodies.
  grid: 'rgba(255,255,255,0.18)',
  candlesUptrend: '#2962FF',
  candlesDowntrend: '#EF5350',
  hollowBody: '#1E293B',
  barsUptrend: '#2962FF',
  barsDowntrend: '#EF5350',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
};

type StructuralChartColors = Pick<ChartColorsConfig, 'background' | 'foreground' | 'grid' | 'hollowBody'>;

const LIGHT_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
  foreground: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
  grid: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
  hollowBody: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
};

const DARK_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: '#080B11',
  foreground: DEFAULT_CHART_COLORS.foreground,
  grid: DEFAULT_CHART_COLORS.grid,
  hollowBody: '#080B11',
};

const BUILTIN_STRUCTURAL_VALUES: Record<keyof StructuralChartColors, Set<string>> = {
  background: new Set([
    '#000000', // legacy default — ensures persisted values get migrated
    '#0E141F', // previous card default
    DEFAULT_CHART_COLORS.background,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.background,
  ]),
  foreground: new Set([
    DEFAULT_CHART_COLORS.foreground,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.foreground,
  ]),
  grid: new Set([
    'rgba(255,255,255,0.15)',
    'rgba(15,23,42,0.12)',
    'rgba(15,23,42,0.16)',
    DEFAULT_CHART_COLORS.grid,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.grid,
  ]),
  hollowBody: new Set([
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
  const themeStructuralColors = isDark ? DARK_THEME_CHART_FALLBACKS : LIGHT_THEME_CHART_FALLBACKS;
  const forceThemeStructure = Boolean(chartColorScheme && chartColorScheme !== 'custom');

  (Object.keys(themeStructuralColors) as Array<keyof StructuralChartColors>).forEach((key) => {
    if (forceThemeStructure || BUILTIN_STRUCTURAL_VALUES[key].has(mergedColors[key])) {
      resolvedColors[key] = themeStructuralColors[key];
    }
  });

  return resolvedColors;
}

export const DEFAULT_CHART_DISPLAY_SETTINGS: ChartDisplaySettings = {
  showTicker: true,
  showOHLC: false,
  showQuickTradingButtons: true,
  showBidPriceLine: true,
  showAskPriceLine: false,
  // true = show the colored axis label (box) for the last-close price on the
  // right price scale. This is standard in all professional trading apps
  // (MT5, TradingView, Dhan). Note: this no longer controls priceLineVisible
  // on the series — the BID price line is the only horizontal line on the
  // chart canvas.
  showLastPriceLine: true,
  showPeriodSeparators: false,
  showGrid: true,
  showTickVolumes: true,
  showRealVolumes: false,
  showObjectDescriptions: false,
  showTradeLevels: true,
  showTradeHistory: true,
};
