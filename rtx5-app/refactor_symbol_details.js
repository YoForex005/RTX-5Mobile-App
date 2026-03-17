const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'src', 'features', 'quotes', 'SymbolDetailsScreen.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// The goal is to deeply upgrade the light theme tokens inside makeStyles.
// SymbolDetailsScreen exports an object from makeStyles containing multiple StyleSheet.creates.

content = content.replace(
  `backgroundColor: isDark ? '#141a2e' : T.bg`,
  `backgroundColor: isDark ? '#141a2e' : T.glass2, shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 12, elevation: 0`
);

content = content.replace(
  `borderColor: isDark ? 'rgba(59,130,246,0.15)' : T.border`,
  `borderColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.04)'`
);

content = content.replace(
  `colors={isDark ? ['rgba(59,130,246,0.06)', 'rgba(59,130,246,0)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0)']}`,
  `colors={isDark ? ['rgba(59,130,246,0.06)', 'rgba(59,130,246,0)'] : ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0)']}`
);

content = content.replace(
  `backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : T.glass1`,
  `backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : T.glass2, shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0 : 0.03, shadowRadius: 8, elevation: 0, borderWidth: 1, borderColor: isDark ? 'transparent' : 'rgba(0,0,0,0.03)'`
);

content = content.replace(
  `track: { height: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.border, borderRadius: 2, position: 'relative' }`,
  `track: { height: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)', borderRadius: 2, position: 'relative' }`
);

content = content.replace(
  `barTrack: { flex: 1, height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.border, borderRadius: 2, flexDirection: 'row', overflow: 'hidden' }`,
  `barTrack: { flex: 1, height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)', borderRadius: 2, flexDirection: 'row', overflow: 'hidden' }`
);

content = content.replace(
  `card: { backgroundColor: isDark ? '#0c101a' : T.glass2, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : T.border }`,
  `card: { backgroundColor: isDark ? '#0c101a' : T.glass2, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.03, shadowRadius: 16, elevation: 0 }`
);

content = content.replace(
  `chip: { flex: 1, backgroundColor: isDark ? '#0c101a' : T.glass2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : T.border }`,
  `chip: { flex: 1, backgroundColor: isDark ? '#0c101a' : T.glass2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0 : 0.02, shadowRadius: 8, elevation: 0 }`
);

content = content.replace(
  `backgroundColor: q.tradeAllowed ? (isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)') : (isDark ? 'rgba(248,113,113,0.1)' : 'rgba(248,113,113,0.15)'),`,
  `backgroundColor: q.tradeAllowed ? (isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.12)') : (isDark ? 'rgba(248,113,113,0.1)' : 'rgba(248,113,113,0.12)'),`
);

content = content.replace(
  `bottomPad: { height: 100 }`,
  `bottomPad: { height: 100 }, overlayLight: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.6)', zIndex: -1 }`
);

// Add a slight gradient/mesh effect for the primary background in Light Mode
content = content.replace(
  `<BlurView intensity={isDark ? 50 : 80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject}>`,
  `{!isDark && <View style={s.sec.overlayLight} />}\n        <BlurView intensity={isDark ? 50 : 80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject}>`
);

fs.writeFileSync(targetPath, content, 'utf8');
console.log('SymbolDetailsScreen light theme enhanced.');
