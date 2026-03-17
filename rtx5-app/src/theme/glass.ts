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

// ── Elite Enterprise Light Theme ─────────────────────────────────────────
export const GLight = {
  bg: '#F2F5F9',          // Elite cool slate canvas that scales with screen brightness
  bgRoot: '#F2F5F9',
  bgSecondary: '#FFFFFF', // Pure White cards
  glass1: '#F2F6FC',      // Ultra-soft recessed tone for pills and inputs
  glass2: '#FFFFFF',      // Pure White cards
  glass3: 'rgba(59, 130, 246, 0.06)', // Soft electric blue pressed state
  inputBg: '#F2F6FC',     // Recessed input background

  border: '#E5E7EB',       // Clean, modern structural border
  borderSubtle: '#F3F4F6', // Almost invisible dividers
  borderMedium: '#D1D5DB', // Mid-tone generic border
  borderHi: '#9CA3AF',
  borderHover: '#6B7280',
  borderZinc: '#E5E7EB',

  text: '#111827',         // Deep rich black, not pure #000
  textSub: '#4B5563',      // Legible secondary gray
  textMuted: '#6B7280',    // Muted semantic gray
  textDimmed: '#9CA3AF',   // Dimmed semantic gray
  textFaint: '#D1D5DB',    // Faint functional gray
  textGhost: '#E5E7EB',    // Barely visible ghost text
  textDark: '#030712',     // Absolute deepest slate

  up: '#10B981',           // Slightly more vibrant Emerald
  upGlow: 'rgba(16, 185, 129, 0.1)',
  down: '#EF4444',         // Crisp, modern Red
  downGlow: 'rgba(239, 68, 68, 0.1)',
  flat: '#64748B',

  accent: '#4338CA',       // Indigo 700: Deepened for maximum light contrast
  accentGlow: 'rgba(67, 56, 202, 0.15)',
  dotGradient: 'linear-gradient(135deg, #94A3B8, #CBD5E1)',

  trading: {
    buy: {
      primary: '#2563EB',  // Professional Blue 600 for primary Buy actions
      hover: '#1D4ED8',
      active: '#1E40AF',
      dark: '#1E3A8A',
      gradient: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
      glow: '0 4px 14px rgba(37, 99, 235, 0.3)',
    },
    sell: {
      primary: '#DC2626',
      hover: '#B91C1C',
      active: '#991B1B',
      dark: '#7F1D1D',
      gradient: 'linear-gradient(180deg, #EF4444 0%, #DC2626 50%, #B91C1C 100%)',
    },
    profit: '#059669',     // Emerald 600
    loss: '#DC2626',
    bidUp: '#059669',
    bidDown: '#DC2626',
    priceDefault: '#0F172A',
  } as TradingTokens,

  chart: {
    background: '#FFFFFF',
    grid: '#F1F5F9',       // Slate 100
    bullCandle: '#059669',
    bearCandle: '#DC2626',
    volumeUp: 'rgba(5, 150, 105, 0.1)',
    volumeDown: 'rgba(220, 38, 38, 0.1)',
    crosshair: '#94A3B8',
  } as ChartTokens,

  categories: {
    forex: '#4F46E5',      // Indigo
    crypto: '#F59E0B',
    metal: '#EAB308',
    index: '#64748B',
    commodity: '#059669',
  } as CategoryTokens,

  shadows: {
    dropdown: '0 10px 40px -10px rgba(15, 23, 42, 0.12)',
    panel: '0 4px 12px rgba(15, 23, 42, 0.05), 0 0 0 1px rgba(15, 23, 42, 0.03)',
    selectedRow: 'inset 2px 0 0 rgba(37, 99, 235, 1)',
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
