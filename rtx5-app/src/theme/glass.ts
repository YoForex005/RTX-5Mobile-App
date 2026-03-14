// ─── Dark Professional Trading Terminal Theme ─────────────────────────────────
// Design System v2 — full token set for global app theming.

// ── Trading sub-tokens ────────────────────────────────────────────────────────
export type TradingTokens = {
  buy: {
    primary: string;
    hover: string;
    active: string;
    dark: string;
    gradient: string;
    glow: string;
  };
  sell: {
    primary: string;
    hover: string;
    active: string;
    dark: string;
    gradient: string;
  };
  profit: string;
  loss: string;
  bidUp: string;
  bidDown: string;
  priceDefault: string;
};

export type ChartTokens = {
  background: string;
  grid: string;
  bullCandle: string;
  bearCandle: string;
  volumeUp: string;
  volumeDown: string;
  crosshair: string;
};

export type CategoryTokens = {
  forex: string;
  crypto: string;
  metal: string;
  index: string;
  commodity: string;
};

// ── Full GDark shape ──────────────────────────────────────────────────────────
export const GDark = {
  // ── Backgrounds (flat + namespaced) ────────────────────────────────────────
  bg: '#000000',                          // primary surface
  bgRoot: '#0d0d11',                      // root / screen base
  bgSecondary: '#0e0e12',                 // secondary panels
  glass1: '#0c1018',                      // elevated items (buttons, inputs on cards)
  glass2: '#141a28',                      // cards, panels
  glass3: 'rgba(255,255,255,0.07)',       // hover / selected
  inputBg: 'rgba(255,255,255,0.05)',      // input fields

  // ── Borders ────────────────────────────────────────────────────────────────
  border: 'rgba(255,255,255,0.08)',       // default
  borderSubtle: 'rgba(255,255,255,0.05)',
  borderMedium: '#1e2640',
  borderHi: 'rgba(255,255,255,0.13)',     // strong / active
  borderHover: '#3a4a6a',
  borderZinc: '#1e2a44',

  // ── Text ───────────────────────────────────────────────────────────────────
  text: '#e2e2e8',          // primary
  textSub: '#b8b8c0',       // secondary
  textMuted: '#808088',     // muted
  textDimmed: '#606068',
  textFaint: '#50505a',
  textGhost: '#36363e',
  textDark: '#222226',

  // ── Up / Down (legacy alias → trading.bidUp/Down) ──────────────────────────
  up: '#4ade80',
  upGlow: 'rgba(74,222,128,0.12)',
  down: '#f87171',
  downGlow: 'rgba(248,113,113,0.10)',
  flat: '#b8b8c0',

  // ── Accent ─────────────────────────────────────────────────────────────────
  accent: '#3b82f6',
  accentGlow: 'rgba(59,130,246,0.2)',
  dotGradient: 'linear-gradient(135deg, #8a8a8f, #3f3f46)',

  // ── Trading ────────────────────────────────────────────────────────────────
  trading: {
    buy: {
      primary: '#2563eb',
      hover: '#3b82f6',
      active: '#1d4ed8',
      dark: '#1e40af',
      gradient: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
      glow: '0 0 6px #3b82f6',
    },
    sell: {
      primary: '#dc2626',
      hover: '#ef4444',
      active: '#b91c1c',
      dark: '#991b1b',
      gradient: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 50%, #991b1b 100%)',
    },
    profit: '#4ade80',
    loss: '#f87171',
    bidUp: '#4ade80',
    bidDown: '#f87171',
    priceDefault: '#d0d0d8',
  } as TradingTokens,

  // ── Chart ──────────────────────────────────────────────────────────────────
  chart: {
    background: '#0e0e12',
    grid: 'rgba(255,255,255,0.04)',
    bullCandle: '#22c55e',
    bearCandle: '#dc2626',
    volumeUp: 'rgba(0,200,150,0.25)',
    volumeDown: 'rgba(255,77,79,0.25)',
    crosshair: '#8a8a8f',
  } as ChartTokens,

  // ── Category colors ────────────────────────────────────────────────────────
  categories: {
    forex: '#7aacca',
    crypto: '#f59e0b',
    metal: '#eab308',
    index: '#9fa0b0',
    commodity: '#34d399',
  } as CategoryTokens,

  // ── Shadows ────────────────────────────────────────────────────────────────
  shadows: {
    dropdown: '0 8px 32px rgba(0,0,0,0.6)',
    panel: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.08)',
    selectedRow: 'inset 2px 0 0 rgba(200,200,210,0.5)',
  },

  // ── Font sizes (numeric px values for React Native) ────────────────────────
  fontSize: {
    xs: 9,
    sm: 10,
    base: 11,
    md: 12,
    lg: 13,
    priceBig: 28,
    priceMid: 14,
    priceSmall: 12,
  },

  // ── Border radius ──────────────────────────────────────────────────────────
  radius: {
    none: 0,
    small: 3,
    medium: 6,
    large: 7,
    pill: 10,
  },
};

// ── Light theme (compatible mapping) ─────────────────────────────────────────
export const GLight = {
  bg: '#f5f6fa',
  bgRoot: '#eef0f5',
  bgSecondary: '#f0f2f7',
  glass1: 'rgba(255,255,255,0.92)',
  glass2: 'rgba(240,242,248,0.95)',
  glass3: 'rgba(230,233,240,0.98)',
  inputBg: 'rgba(0,0,0,0.04)',

  border: 'rgba(0,0,0,0.08)',
  borderSubtle: 'rgba(0,0,0,0.05)',
  borderMedium: '#d1d5db',
  borderHi: 'rgba(0,0,0,0.12)',
  borderHover: '#9ca3af',
  borderZinc: '#d1d5db',

  text: '#1a1d26',
  textSub: '#4a5068',
  textMuted: '#8f96a8',
  textDimmed: '#6b7280',
  textFaint: '#9ca3af',
  textGhost: '#d1d5db',
  textDark: '#374151',

  up: '#16a34a',
  upGlow: 'rgba(22,163,74,0.10)',
  down: '#dc2626',
  downGlow: 'rgba(220,38,38,0.08)',
  flat: '#6b7280',

  accent: '#2563eb',
  accentGlow: 'rgba(37,99,235,0.15)',
  dotGradient: 'linear-gradient(135deg, #9ca3af, #6b7280)',

  trading: {
    buy: {
      primary: '#2563eb',
      hover: '#3b82f6',
      active: '#1d4ed8',
      dark: '#1e40af',
      gradient: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
      glow: '0 0 6px rgba(59,130,246,0.5)',
    },
    sell: {
      primary: '#dc2626',
      hover: '#ef4444',
      active: '#b91c1c',
      dark: '#991b1b',
      gradient: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 50%, #991b1b 100%)',
    },
    profit: '#16a34a',
    loss: '#dc2626',
    bidUp: '#16a34a',
    bidDown: '#dc2626',
    priceDefault: '#374151',
  } as TradingTokens,

  chart: {
    background: '#f0f2f7',
    grid: 'rgba(0,0,0,0.06)',
    bullCandle: '#16a34a',
    bearCandle: '#dc2626',
    volumeUp: 'rgba(22,163,74,0.20)',
    volumeDown: 'rgba(220,38,38,0.18)',
    crosshair: '#6b7280',
  } as ChartTokens,

  categories: {
    forex: '#2563eb',
    crypto: '#d97706',
    metal: '#ca8a04',
    index: '#6b7280',
    commodity: '#059669',
  } as CategoryTokens,

  shadows: {
    dropdown: '0 8px 32px rgba(0,0,0,0.15)',
    panel: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(37,99,235,0.08)',
    selectedRow: 'inset 2px 0 0 rgba(0,0,0,0.2)',
  },

  fontSize: {
    xs: 9,
    sm: 10,
    base: 11,
    md: 12,
    lg: 13,
    priceBig: 28,
    priceMid: 14,
    priceSmall: 12,
  },

  radius: {
    none: 0,
    small: 3,
    medium: 6,
    large: 7,
    pill: 10,
  },
};

// ── Type export ───────────────────────────────────────────────────────────────
export type ThemeColors = typeof GDark;

// ── Default static export (dark) ──────────────────────────────────────────────
export const G = GDark;
