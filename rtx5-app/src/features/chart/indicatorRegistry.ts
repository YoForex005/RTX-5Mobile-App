/**
 * Chart Feature: Indicator Registry
 *
 * MT5-aligned metadata for every indicator shown in the Indicators list.
 * Drives the configuration screen — parameters, default style lines, and levels.
 */

export type ApplyTo =
  | 'close'
  | 'open'
  | 'high'
  | 'low'
  | 'median'
  | 'typical'
  | 'weighted';

export type MaMethod = 'simple' | 'exponential' | 'smoothed' | 'linearWeighted';

export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'dashdotdot';

export const APPLY_TO_OPTIONS: Array<{ value: ApplyTo; label: string }> = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'median', label: 'Median Price (HL/2)' },
  { value: 'typical', label: 'Typical Price (HLC/3)' },
  { value: 'weighted', label: 'Weighted Close (HLCC/4)' },
];

export const MA_METHOD_OPTIONS: Array<{ value: MaMethod; label: string }> = [
  { value: 'simple', label: 'Simple' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'smoothed', label: 'Smoothed' },
  { value: 'linearWeighted', label: 'Linear Weighted' },
];

export const LINE_STYLE_OPTIONS: Array<{ value: LineStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashdot', label: 'Dash-dot' },
  { value: 'dashdotdot', label: 'Dash-dot-dot' },
];

export const COLOR_PALETTE: string[] = [
  '#FF0000', '#FF7F00', '#FFD700', '#32CD32', '#008000', '#1E90FF', '#0000FF',
  '#8B00FF', '#FF00FF', '#FF1493', '#00CED1', '#00FFFF', '#A52A2A', '#808080',
  '#000000', '#FFFFFF',
];

export type NumberParam = {
  kind: 'number';
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
};

export type ApplyToParam = {
  kind: 'applyTo';
  key: string;
  label: string;
  default: ApplyTo;
};

export type MaMethodParam = {
  kind: 'maMethod';
  key: string;
  label: string;
  default: MaMethod;
};

export type SelectParam = {
  kind: 'select';
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  default: string;
};

export type BooleanParam = {
  kind: 'boolean';
  key: string;
  label: string;
  default: boolean;
};

export type IndicatorParam =
  | NumberParam
  | ApplyToParam
  | MaMethodParam
  | SelectParam
  | BooleanParam;

export type IndicatorStyleLine = {
  key: string;
  name: string;
  color: string;
  width: number;
  style: LineStyle;
};

export type IndicatorMeta = {
  id: string;
  name: string;
  shortName: string;
  category: 'trend' | 'oscillator' | 'volume' | 'billWilliams';
  parameters: IndicatorParam[];
  styles: IndicatorStyleLine[];
  defaultLevels?: number[];
  levelsEnabled?: boolean;
};

// ── Helpers for common parameter shapes ────────────────────────────────
const periodParam = (def = 14): NumberParam => ({
  kind: 'number', key: 'period', label: 'Period', default: def, min: 1, max: 10000,
});
const shiftParam = (def = 0): NumberParam => ({
  kind: 'number', key: 'shift', label: 'Shift', default: def, min: -1000, max: 1000,
});
const applyToParam = (def: ApplyTo = 'close'): ApplyToParam => ({
  kind: 'applyTo', key: 'applyTo', label: 'Apply to', default: def,
});
const maMethodParam = (def: MaMethod = 'simple'): MaMethodParam => ({
  kind: 'maMethod', key: 'maMethod', label: 'MA method', default: def,
});

const line = (
  key: string,
  name: string,
  color: string,
  width = 1,
  style: LineStyle = 'solid',
): IndicatorStyleLine => ({ key, name, color, width, style });

// ── Registry ──────────────────────────────────────────────────────────
export const INDICATOR_REGISTRY: Record<string, IndicatorMeta> = {
  // ── TREND ────────────────────────────────────────────────────────────
  adx: {
    id: 'adx',
    name: 'Average Directional Movement Index',
    shortName: 'ADX',
    category: 'trend',
    parameters: [periodParam(14), applyToParam('close')],
    styles: [
      line('adx', 'ADX', '#32CD32'),
      line('plusDi', '+DI', '#1E90FF'),
      line('minusDi', '-DI', '#FF0000'),
    ],
    defaultLevels: [],
    levelsEnabled: true,
  },
  bollingerBands: {
    id: 'bollingerBands',
    name: 'Bollinger Bands',
    shortName: 'BB',
    category: 'trend',
    parameters: [
      periodParam(20),
      shiftParam(0),
      { kind: 'number', key: 'deviations', label: 'Deviations', default: 2, min: 0, max: 10, step: 0.1, decimals: 3 },
      applyToParam('close'),
    ],
    styles: [
      line('middle', 'Middle Band', '#FF00FF'),
      line('upper', 'Upper Band', '#1E90FF'),
      line('lower', 'Lower Band', '#1E90FF'),
    ],
  },
  envelopes: {
    id: 'envelopes',
    name: 'Envelopes',
    shortName: 'Env',
    category: 'trend',
    parameters: [
      periodParam(14),
      maMethodParam('simple'),
      applyToParam('close'),
      shiftParam(0),
      { kind: 'number', key: 'deviation', label: 'Deviation (%)', default: 0.1, min: 0, max: 100, step: 0.01, decimals: 3 },
    ],
    styles: [
      line('upper', 'Upper', '#1E90FF'),
      line('lower', 'Lower', '#1E90FF'),
    ],
  },
  ichimoku: {
    id: 'ichimoku',
    name: 'Ichimoku Kinko Hyo',
    shortName: 'Ichimoku',
    category: 'trend',
    parameters: [
      { kind: 'number', key: 'tenkan', label: 'Tenkan-sen', default: 9, min: 1, max: 10000 },
      { kind: 'number', key: 'kijun', label: 'Kijun-sen', default: 26, min: 1, max: 10000 },
      { kind: 'number', key: 'senkouB', label: 'Senkou Span B', default: 52, min: 1, max: 10000 },
    ],
    styles: [
      line('tenkan', 'Tenkan-sen', '#FF0000'),
      line('kijun', 'Kijun-sen', '#1E90FF'),
      line('senkouA', 'Senkou Span A', '#32CD32'),
      line('senkouB', 'Senkou Span B', '#FF7F00'),
      line('chikou', 'Chikou Span', '#808080'),
    ],
  },
  movingAverage: {
    id: 'movingAverage',
    name: 'Moving Average',
    shortName: 'MA',
    category: 'trend',
    parameters: [
      periodParam(13),
      shiftParam(0),
      maMethodParam('simple'),
      applyToParam('close'),
    ],
    styles: [line('ma', 'Moving Average', '#FF0000')],
  },
  parabolicSar: {
    id: 'parabolicSar',
    name: 'Parabolic SAR',
    shortName: 'SAR',
    category: 'trend',
    parameters: [
      { kind: 'number', key: 'step', label: 'Step', default: 0.02, min: 0, max: 10, step: 0.01, decimals: 3 },
      { kind: 'number', key: 'maximum', label: 'Maximum', default: 0.2, min: 0, max: 10, step: 0.01, decimals: 3 },
    ],
    styles: [line('sar', 'SAR', '#FFD700', 2, 'dotted')],
  },
  standardDeviation: {
    id: 'standardDeviation',
    name: 'Standard Deviation',
    shortName: 'StdDev',
    category: 'trend',
    parameters: [periodParam(20), shiftParam(0), maMethodParam('simple'), applyToParam('close')],
    styles: [line('stdDev', 'StdDev', '#1E90FF')],
  },
  zigZag: {
    id: 'zigZag',
    name: 'ZigZag',
    shortName: 'ZigZag',
    category: 'trend',
    parameters: [
      { kind: 'number', key: 'depth', label: 'Depth', default: 12, min: 1, max: 10000 },
      { kind: 'number', key: 'deviation', label: 'Deviation', default: 5, min: 0, max: 1000 },
      { kind: 'number', key: 'backstep', label: 'Backstep', default: 3, min: 1, max: 1000 },
    ],
    styles: [line('zigZag', 'ZigZag', '#FF0000')],
  },

  // ── OSCILLATORS ─────────────────────────────────────────────────────
  atr: {
    id: 'atr',
    name: 'Average True Range',
    shortName: 'ATR',
    category: 'oscillator',
    parameters: [periodParam(14)],
    styles: [line('atr', 'ATR', '#1E90FF')],
    levelsEnabled: true,
  },
  bearsPower: {
    id: 'bearsPower',
    name: 'Bears Power',
    shortName: 'Bears',
    category: 'oscillator',
    parameters: [periodParam(13), applyToParam('close')],
    styles: [line('bears', 'Bears Power', '#32CD32')],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  bullsPower: {
    id: 'bullsPower',
    name: 'Bulls Power',
    shortName: 'Bulls',
    category: 'oscillator',
    parameters: [periodParam(13), applyToParam('close')],
    styles: [line('bulls', 'Bulls Power', '#32CD32')],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  cci: {
    id: 'cci',
    name: 'Commodity Channel Index',
    shortName: 'CCI',
    category: 'oscillator',
    parameters: [periodParam(14), applyToParam('typical')],
    styles: [line('cci', 'CCI', '#1E90FF')],
    defaultLevels: [-100, 100],
    levelsEnabled: true,
  },
  deMarker: {
    id: 'deMarker',
    name: 'DeMarker',
    shortName: 'DeM',
    category: 'oscillator',
    parameters: [periodParam(14)],
    styles: [line('dem', 'DeMarker', '#1E90FF')],
    defaultLevels: [0.3, 0.7],
    levelsEnabled: true,
  },
  forceIndex: {
    id: 'forceIndex',
    name: 'Force Index',
    shortName: 'Force',
    category: 'oscillator',
    parameters: [periodParam(13), maMethodParam('simple'), applyToParam('close')],
    styles: [line('force', 'Force Index', '#1E90FF')],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  macd: {
    id: 'macd',
    name: 'MACD',
    shortName: 'MACD',
    category: 'oscillator',
    parameters: [
      { kind: 'number', key: 'fastEma', label: 'Fast EMA', default: 12, min: 1, max: 10000 },
      { kind: 'number', key: 'slowEma', label: 'Slow EMA', default: 26, min: 1, max: 10000 },
      { kind: 'number', key: 'macdSma', label: 'MACD SMA', default: 9, min: 1, max: 10000 },
      applyToParam('close'),
    ],
    styles: [
      line('macd', 'MACD', '#1E90FF', 2, 'solid'),
      line('signal', 'Signal', '#FF0000', 1, 'dotted'),
    ],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  momentum: {
    id: 'momentum',
    name: 'Momentum',
    shortName: 'Mom',
    category: 'oscillator',
    parameters: [periodParam(14), applyToParam('close')],
    styles: [line('momentum', 'Momentum', '#1E90FF')],
    defaultLevels: [100],
    levelsEnabled: true,
  },
  osma: {
    id: 'osma',
    name: 'Moving Average of Oscillator',
    shortName: 'OsMA',
    category: 'oscillator',
    parameters: [
      { kind: 'number', key: 'fastEma', label: 'Fast EMA', default: 12, min: 1, max: 10000 },
      { kind: 'number', key: 'slowEma', label: 'Slow EMA', default: 26, min: 1, max: 10000 },
      { kind: 'number', key: 'signalSma', label: 'Signal SMA', default: 9, min: 1, max: 10000 },
      applyToParam('close'),
    ],
    styles: [line('osma', 'OsMA', '#32CD32')],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  rsi: {
    id: 'rsi',
    name: 'Relative Strength Index',
    shortName: 'RSI',
    category: 'oscillator',
    parameters: [periodParam(14), applyToParam('close')],
    styles: [line('rsi', 'RSI', '#1E90FF')],
    defaultLevels: [30, 70],
    levelsEnabled: true,
  },
  rvi: {
    id: 'rvi',
    name: 'Relative Vigor Index',
    shortName: 'RVI',
    category: 'oscillator',
    parameters: [periodParam(10)],
    styles: [
      line('rvi', 'RVI', '#1E90FF'),
      line('signal', 'Signal', '#FF0000'),
    ],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  stochastic: {
    id: 'stochastic',
    name: 'Stochastic Oscillator',
    shortName: 'Stoch',
    category: 'oscillator',
    parameters: [
      { kind: 'number', key: 'kPeriod', label: '%K Period', default: 5, min: 1, max: 10000 },
      { kind: 'number', key: 'dPeriod', label: '%D Period', default: 3, min: 1, max: 10000 },
      { kind: 'number', key: 'slowing', label: 'Slowing', default: 3, min: 1, max: 10000 },
      maMethodParam('simple'),
      {
        kind: 'select', key: 'priceField', label: 'Price field',
        options: [
          { value: 'lowHigh', label: 'Low/High' },
          { value: 'closeClose', label: 'Close/Close' },
        ],
        default: 'lowHigh',
      },
    ],
    styles: [
      line('k', '%K', '#1E90FF'),
      line('d', '%D', '#FF0000', 1, 'dotted'),
    ],
    defaultLevels: [20, 80],
    levelsEnabled: true,
  },
  williamsR: {
    id: 'williamsR',
    name: "Williams' Percent Range",
    shortName: '%R',
    category: 'oscillator',
    parameters: [periodParam(14)],
    styles: [line('wpr', '%R', '#1E90FF')],
    defaultLevels: [-80, -20],
    levelsEnabled: true,
  },

  // ── VOLUMES ─────────────────────────────────────────────────────────
  accumulationDistribution: {
    id: 'accumulationDistribution',
    name: 'Accumulation/Distribution',
    shortName: 'A/D',
    category: 'volume',
    parameters: [],
    styles: [line('ad', 'A/D', '#32CD32')],
    levelsEnabled: true,
  },
  marketProfile: {
    id: 'marketProfile',
    name: 'Market Profile',
    shortName: 'MP',
    category: 'volume',
    parameters: [
      {
        kind: 'select', key: 'session', label: 'Session',
        options: [
          { value: 'day', label: 'Daily' },
          { value: 'week', label: 'Weekly' },
          { value: 'month', label: 'Monthly' },
        ],
        default: 'day',
      },
      { kind: 'number', key: 'valueArea', label: 'Value Area (%)', default: 70, min: 1, max: 100 },
      { kind: 'number', key: 'rowSize', label: 'Row size', default: 24, min: 1, max: 1000 },
    ],
    styles: [
      line('profile', 'Profile', '#1E90FF'),
      line('poc', 'Point of Control', '#FF0000', 2),
      line('valueArea', 'Value Area', '#32CD32'),
    ],
  },
  moneyFlowIndex: {
    id: 'moneyFlowIndex',
    name: 'Money Flow Index',
    shortName: 'MFI',
    category: 'volume',
    parameters: [periodParam(14)],
    styles: [line('mfi', 'MFI', '#1E90FF')],
    defaultLevels: [20, 80],
    levelsEnabled: true,
  },
  onBalanceVolume: {
    id: 'onBalanceVolume',
    name: 'On Balance Volume',
    shortName: 'OBV',
    category: 'volume',
    parameters: [applyToParam('close')],
    styles: [line('obv', 'OBV', '#1E90FF')],
    levelsEnabled: true,
  },
  volumes: {
    id: 'volumes',
    name: 'Volumes',
    shortName: 'Vol',
    category: 'volume',
    parameters: [],
    styles: [
      line('up', 'Up Volume', '#32CD32'),
      line('down', 'Down Volume', '#FF0000'),
    ],
    levelsEnabled: true,
  },

  // ── BILL WILLIAMS ───────────────────────────────────────────────────
  acceleratorOscillator: {
    id: 'acceleratorOscillator',
    name: 'Accelerator Oscillator',
    shortName: 'AC',
    category: 'billWilliams',
    parameters: [],
    styles: [
      line('up', 'Up Bar', '#32CD32'),
      line('down', 'Down Bar', '#FF0000'),
    ],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  alligator: {
    id: 'alligator',
    name: 'Alligator',
    shortName: 'Alligator',
    category: 'billWilliams',
    parameters: [
      { kind: 'number', key: 'jawsPeriod', label: 'Jaws period', default: 13, min: 1, max: 10000 },
      { kind: 'number', key: 'jawsShift', label: 'Jaws shift', default: 8, min: 0, max: 1000 },
      { kind: 'number', key: 'teethPeriod', label: 'Teeth period', default: 8, min: 1, max: 10000 },
      { kind: 'number', key: 'teethShift', label: 'Teeth shift', default: 5, min: 0, max: 1000 },
      { kind: 'number', key: 'lipsPeriod', label: 'Lips period', default: 5, min: 1, max: 10000 },
      { kind: 'number', key: 'lipsShift', label: 'Lips shift', default: 3, min: 0, max: 1000 },
      maMethodParam('smoothed'),
      applyToParam('median'),
    ],
    styles: [
      line('jaws', 'Jaws', '#1E90FF'),
      line('teeth', 'Teeth', '#FF0000'),
      line('lips', 'Lips', '#32CD32'),
    ],
  },
  awesomeOscillator: {
    id: 'awesomeOscillator',
    name: 'Awesome Oscillator',
    shortName: 'AO',
    category: 'billWilliams',
    parameters: [],
    styles: [
      line('up', 'Up Bar', '#32CD32'),
      line('down', 'Down Bar', '#FF0000'),
    ],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  fractals: {
    id: 'fractals',
    name: 'Fractals',
    shortName: 'Fractals',
    category: 'billWilliams',
    parameters: [],
    styles: [
      line('up', 'Up Fractal', '#1E90FF'),
      line('down', 'Down Fractal', '#1E90FF'),
    ],
  },
  gatorOscillator: {
    id: 'gatorOscillator',
    name: 'Gator Oscillator',
    shortName: 'Gator',
    category: 'billWilliams',
    parameters: [
      { kind: 'number', key: 'jawsPeriod', label: 'Jaws period', default: 13, min: 1, max: 10000 },
      { kind: 'number', key: 'jawsShift', label: 'Jaws shift', default: 8, min: 0, max: 1000 },
      { kind: 'number', key: 'teethPeriod', label: 'Teeth period', default: 8, min: 1, max: 10000 },
      { kind: 'number', key: 'teethShift', label: 'Teeth shift', default: 5, min: 0, max: 1000 },
      { kind: 'number', key: 'lipsPeriod', label: 'Lips period', default: 5, min: 1, max: 10000 },
      { kind: 'number', key: 'lipsShift', label: 'Lips shift', default: 3, min: 0, max: 1000 },
      maMethodParam('smoothed'),
      applyToParam('median'),
    ],
    styles: [
      line('up', 'Up Bar', '#32CD32'),
      line('down', 'Down Bar', '#FF0000'),
    ],
    defaultLevels: [0],
    levelsEnabled: true,
  },
  marketFacilitationIndex: {
    id: 'marketFacilitationIndex',
    name: 'Market Facilitation Index',
    shortName: 'BW MFI',
    category: 'billWilliams',
    parameters: [],
    styles: [
      line('green', 'Green', '#32CD32'),
      line('fade', 'Fade', '#8B4513'),
      line('fake', 'Fake', '#1E90FF'),
      line('squat', 'Squat', '#FF00FF'),
    ],
  },
};

// Fast lookup: canonical display-name → indicator id
export const INDICATOR_ID_BY_NAME: Record<string, string> = Object.values(
  INDICATOR_REGISTRY,
).reduce<Record<string, string>>((acc, meta) => {
  acc[meta.name] = meta.id;
  return acc;
}, {});

export function getIndicatorMeta(id: string | undefined): IndicatorMeta | null {
  if (!id) return null;
  return INDICATOR_REGISTRY[id] ?? null;
}

export function buildDefaultValues(meta: IndicatorMeta): Record<string, number | string | boolean> {
  const values: Record<string, number | string | boolean> = {};
  for (const p of meta.parameters) {
    values[p.key] = p.default;
  }
  return values;
}
