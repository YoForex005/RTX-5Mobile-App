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
  bg: '#0F172A',                          // primary surface (slate-900)
  bgRoot: '#020617',                      // root / screen base (slate-950)
  bgSecondary: '#1E293B',                 // secondary panels (slate-800)
  glass1: '#1E293B',                      // elevated items (buttons, inputs on cards)
  glass2: '#334155',                      // cards, panels (slate-700)
  glass3: 'rgba(255,255,255,0.07)',       // hover / selected
  inputBg: 'rgba(255,255,255,0.05)',      // input fields

  // ── Borders ────────────────────────────────────────────────────────────────
  border: 'rgba(255,255,255,0.1)',        // default
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderMedium: '#334155',                // slate-700
  borderHi: 'rgba(255,255,255,0.15)',     // strong / active
  borderHover: '#475569',                 // slate-600
  borderZinc: '#334155',

  // ── Text ───────────────────────────────────────────────────────────────────
  text: '#F8FAFC',          // primary (slate-50)
  textSub: '#94A3B8',       // secondary (slate-400)
  textMuted: '#64748B',     // muted (slate-500)
  textDimmed: '#475569',    // dimmed (slate-600)
  textFaint: '#334155',     // faint (slate-700)
  textGhost: '#1E293B',     // ghost
  textDark: '#0F172A',      // slate-900

  // ── Up / Down (legacy alias → trading.bidUp/Down) ──────────────────────────
  up: '#10B981',            // Emerald 500
  upGlow: 'rgba(16,185,129,0.15)',
  down: '#EF4444',          // Red 500
  downGlow: 'rgba(239,68,68,0.15)',
  flat: '#94A3B8',          // slate-400

  // ── Accent ─────────────────────────────────────────────────────────────────
  accent: '#3B82F6',        // Blue 500
  accentGlow: 'rgba(59,130,246,0.2)',
  dotGradient: 'linear-gradient(135deg, #94A3B8, #334155)',

  // ── Trading ────────────────────────────────────────────────────────────────
  trading: {
    buy: {
      primary: '#2563EB',
      hover: '#3B82F6',
      active: '#1D4ED8',
      dark: '#1E40AF',
      gradient: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
      glow: '0 0 6px rgba(59,130,246,0.6)',
    },
    sell: {
      primary: '#DC2626',
      hover: '#EF4444',
      active: '#B91C1C',
      dark: '#991B1B',
      gradient: 'linear-gradient(180deg, #EF4444 0%, #DC2626 50%, #B91C1C 100%)',
    },
    profit: '#10B981',
    loss: '#EF4444',
    bidUp: '#10B981',
    bidDown: '#EF4444',
    priceDefault: '#F8FAFC',
  } as TradingTokens,

  // ── Chart ──────────────────────────────────────────────────────────────────
  chart: {
    background: '#0F172A',
    grid: 'rgba(255,255,255,0.06)',
    bullCandle: '#10B981',
    bearCandle: '#EF4444',
    volumeUp: 'rgba(16,185,129,0.25)',
    volumeDown: 'rgba(239,68,68,0.25)',
    crosshair: '#94A3B8',
  } as ChartTokens,

  // ── Category colors ────────────────────────────────────────────────────────
  categories: {
    forex: '#818CF8',       // Indigo-400
    crypto: '#F59E0B',
    metal: '#EAB308',
    index: '#94A3B8',
    commodity: '#34D399',
  } as CategoryTokens,

  // ── Shadows ────────────────────────────────────────────────────────────────
  shadows: {
    dropdown: '0 8px 32px rgba(0,0,0,0.6)',
    panel: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.08)',
    selectedRow: 'inset 2px 0 0 rgba(248,250,252,0.5)',
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
