const fs = require('fs');
let code = fs.readFileSync('src/features/trade/OrderTicketScreen.tsx', 'utf8');

// 1. Hook injection & Imports
code = code.replace(/import \{ useUserPreferences \} from '\.\.\/\.\.\/state\/userPreferences';/, `import { useUserPreferences } from '../../state/userPreferences';\nimport { useTheme, ThemeColors } from '../../theme/useTheme';`);
code = code.replace(/\/\* ── Design tokens ──[\s\S]*?const DIM[^\n]*\n/, '');
code = code.replace(/const \{ accountDetails \} = useUserPreferences\(\);/, `const { accountDetails, themeMode } = useUserPreferences();\n  const T = useTheme();\n  const isDark = themeMode === 'dark';\n  const styles = makeStyles(T, isDark);`);

// 2. JSX Prop Replacements
code = code.replace(/color=\{WHITE\}/g, `color={T.text}`);
code = code.replace(/color=\{DIM\}/g, `color={T.textMuted}`);
code = code.replace(/color=\{SUB\}/g, `color={T.textSub}`);
code = code.replace(/color=\{SELL_C\}/g, `color={T.trading.sell.primary}`);
code = code.replace(/color=\{BUY_C\}/g, `color={T.trading.buy.primary}`);
code = code.replace(/color=\{ACCENT\}/g, `color={T.accent}`);
code = code.replace(/backgroundColor: SELL_C/g, `backgroundColor: T.trading.sell.primary`);
code = code.replace(/backgroundColor: BUY_C/g, `backgroundColor: T.trading.buy.primary`);

// Fix remaining static hexes in JSX
code = code.replace(/color="rgba\(255,255,255,0\.7\)"/g, `color={T.textSub}`);
code = code.replace(/color="rgba\(255,255,255,0\.65\)"/g, `color={T.textSub}`);
code = code.replace(/color="rgba\(255,255,255,0\.4\)"/g, `color={T.textMuted}`);
code = code.replace(/color="#C8C8CC"/g, `color={T.textMuted}`);

// Helper Components Signature
code = code.replace(/function ToggleRow\(\{ label, icon, enabled, onToggle \}: \{/g, `function ToggleRow({ label, icon, enabled, onToggle, T, isDark, styles }: {\n  T: ThemeColors;\n  isDark: boolean;\n  styles: any;`);
code = code.replace(/<ToggleRow label="Stop Loss".*?\/>/g, match => match.replace('/>', ' T={T} isDark={isDark} styles={styles} />'));
code = code.replace(/<ToggleRow label="Take Profit".*?\/>/g, match => match.replace('/>', ' T={T} isDark={isDark} styles={styles} />'));
code = code.replace(/<ToggleRow label="Trailing Stop".*?\/>/g, match => match.replace('/>', ' T={T} isDark={isDark} styles={styles} />'));

code = code.replace(/function InfoRow\(\{ label, value \}: \{/g, `function InfoRow({ label, value, styles }: {\n  label: string;\n  value: string;\n  styles: any;`);
code = code.replace(/<InfoRow label="Fill Policy".*?\/>/g, match => match.replace('/>', ' styles={styles} />'));
code = code.replace(/<InfoRow label="Spread".*?\/>/g, match => match.replace('/>', ' styles={styles} />'));
code = code.replace(/<InfoRow label="Margin".*?\/>/g, match => match.replace('/>', ' styles={styles} />'));
code = code.replace(/<InfoRow label="Acc\. Leverage".*?\/>/g, match => match.replace('/>', ' styles={styles} />'));

const newStyles = `/* ── Styles ─────────────────────────────────────────────────────────────── */
function makeStyles(T: ThemeColors, isDark: boolean) {
  const BG = T.bg;
  const SURFACE = T.glass2;
  const ELEVATED = T.glass1;
  const LINE = T.border;
  const WHITE = T.text;
  const SUB = T.textSub;
  const DIM = T.textMuted;
  const ACCENT = T.accent;
  
  const SELL_C = T.trading.sell.primary;
  const SELL_BG = isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)';
  const BUY_C = T.trading.buy.primary;
  const BUY_BG = isDark ? 'rgba(52,199,89,0.08)' : 'rgba(5,150,105,0.06)';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14 },
    backBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: ELEVATED, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
    hCenter: { flex: 1, alignItems: 'center' },
    hSymbol: { color: WHITE, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: BUY_BG },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BUY_C },
    liveLabel: { color: BUY_C, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

    pricePanel: {
      flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 12, borderRadius: 12, overflow: 'hidden',
      backgroundColor: SURFACE, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4
    },
    priceHalf: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    priceTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    priceMain: { color: WHITE, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1, letterSpacing: -0.5 },
    priceLabel: { color: T.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
    spreadCenter: { width: 40, alignItems: 'center', justifyContent: 'center' },
    spreadVal: { color: WHITE, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
    spreadUnit: { color: T.textSub, fontSize: 8, fontWeight: '700' },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
    sectionTitle: { color: T.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
    
    flatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowLabel: { color: SUB, fontSize: 14, fontWeight: '500' },
    rowValueWhite: { color: WHITE, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
    hairline: { height: 1, backgroundColor: LINE },

    dropdown: { backgroundColor: ELEVATED, borderRadius: 10, marginBottom: 4, borderWidth: 1, borderColor: T.border },
    dropOpt: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    dropOptActive: { backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : T.glass3 },
    dropDot: { width: 6, height: 6, borderRadius: 3 },
    dropText: { flex: 1, fontSize: 14, fontWeight: '500' },

    volSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    volStepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 8, backgroundColor: ELEVATED, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
    volBtn: { width: 40, height: '100%', alignItems: 'center', justifyContent: 'center' },
    volCenter: { paddingHorizontal: 16, height: '100%', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: LINE },
    volNum: { color: WHITE, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
    quickRow: { flexDirection: 'row', gap: 5, paddingBottom: 4 },
    quickPill: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: ELEVATED, alignItems: 'center', borderWidth: 1, borderColor: T.border },
    quickPillActive: { backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : T.glass3, borderColor: ACCENT },
    quickTxt: { color: SUB, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
    quickTxtActive: { color: ACCENT },

    track: { width: 40, height: 22, borderRadius: 11, backgroundColor: isDark ? '#252C3B' : T.border, justifyContent: 'center', paddingHorizontal: 2 },
    trackOn: { backgroundColor: ACCENT },
    thumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: isDark ? '#A0ABC0' : '#FFFFFF', shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
    thumbOn: { backgroundColor: '#FFFFFF', transform: [{ translateX: 18 }] },
    statusTxt: { color: SUB, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, minWidth: 22 },

    domTable: { marginTop: 4, marginBottom: 6, borderRadius: 8, backgroundColor: SURFACE, overflow: 'hidden', paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: T.border, shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 12, elevation: 2 },
    domHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    domColHead: { flex: 1, color: SUB, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
    domRow: { flexDirection: 'row', alignItems: 'center', height: 16, marginBottom: 2 },
    domBarCol: { flex: 1, height: 10, alignItems: 'flex-end', justifyContent: 'center' },
    domBarSell: { height: 12, borderRadius: 2, backgroundColor: SELL_BG },
    domBarBuy: { height: 12, borderRadius: 2, backgroundColor: BUY_BG },
    domPrice: { width: 80, textAlign: 'center', color: WHITE, fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },

    disclaimer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
    disclaimerTxt: { color: T.textMuted, fontSize: 10, lineHeight: 14, flex: 1 },
    disclaimerIcons: { flexDirection: 'row', gap: 10 },

    execRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
    execBtn: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    execSell: { backgroundColor: SELL_C, shadowColor: SELL_C },
    execBuy: { backgroundColor: BUY_C, shadowColor: BUY_C },
    execCta: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
    execLots: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
  });
}
`;

code = code.replace(/\/\* ── Styles ──[\s\S]*\}\);/m, newStyles);
fs.writeFileSync('src/features/trade/OrderTicketScreen.tsx', code);
