// ─── 2025 Premium Glassmorphism & Neon Array ──────────────────────────────────
// Deep tech aesthetic: pure blacks, transparent glass layers, thin neon highlights.

export type ThemeColors = typeof GDark;

export const GDark = {
    bg: '#040609',           // Ultra-premium OLED Midnight base
    glass1: 'rgba(20, 24, 34, 0.45)', // Translucent card surface
    glass2: 'rgba(30, 36, 48, 0.65)', // Elevated items
    glass3: 'rgba(40, 48, 64, 0.85)', // Hover/pressed states
    border: 'rgba(255, 255, 255, 0.08)', // Barely visible glass edge
    borderHi: 'rgba(255, 255, 255, 0.15)', // Active glass edge

    text: '#ffffff',         // Sharp white primary
    textSub: '#a1a8b5',      // Cool silver secondary
    textMuted: '#5b6475',    // Deep slate muted

    up: '#00e676',           // Cyber neon green
    upGlow: 'rgba(0, 230, 118, 0.12)',
    down: '#ff1744',         // Neon hyper red
    downGlow: 'rgba(255, 23, 68, 0.1)',
    flat: '#a1a8b5',

    accent: '#2979ff',       // Vivid primary blue
    accentGlow: 'rgba(41, 121, 255, 0.2)',
};

export const GLight = {
    bg: '#f5f6fa',           // Soft light gray base
    glass1: 'rgba(255, 255, 255, 0.85)', // White card surface
    glass2: 'rgba(240, 242, 248, 0.9)',  // Elevated items
    glass3: 'rgba(230, 233, 240, 0.95)', // Hover/pressed states
    border: 'rgba(0, 0, 0, 0.08)',   // Subtle gray edge
    borderHi: 'rgba(0, 0, 0, 0.14)', // Active gray edge

    text: '#1a1d26',         // Dark primary text
    textSub: '#4a5068',      // Slate secondary
    textMuted: '#8f96a8',    // Muted gray

    up: '#00c853',           // Clean green
    upGlow: 'rgba(0, 200, 83, 0.1)',
    down: '#e53935',         // Clean red
    downGlow: 'rgba(229, 57, 53, 0.08)',
    flat: '#8f96a8',

    accent: '#1565c0',       // Deep blue
    accentGlow: 'rgba(21, 101, 192, 0.12)',
};

// Default export for backward compatibility (static dark)
export const G = GDark;
