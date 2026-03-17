const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'src', 'features', 'settings', 'SettingsScreen.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

/* Fix #1: Navigation Icons failing in Light Mode */
content = content.replace(
  `color="#CBD5E1"`,
  `color={T.text}`
);
content = content.replace(
  `color="#94A3B8"`,
  `color={T.textMuted}`
);

/* Fix #2: Account card text hierarchy in Light Mode */
content = content.replace(
  `accCompany: { color: '#CBD5E1', fontSize: 16, fontWeight: '600', marginBottom: 4 },`,
  `accCompany: { color: themeMode === 'light' ? 'rgba(255,255,255,0.9)' : '#CBD5E1', fontSize: 16, fontWeight: '600', marginBottom: 4 },`
);
content = content.replace(
  `accServerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF', marginLeft: 14, marginRight: 2 },`,
  `accServerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: themeMode === 'light' ? 'rgba(255,255,255,0.8)' : '#FFFFFF', marginLeft: 14, marginRight: 2 },`
);
content = content.replace(
  `accName: { color: T.text, fontSize: 28, fontWeight: '800', letterSpacing: -1, marginBottom: 6 },`,
  `accName: { color: themeMode === 'light' ? '#FFF' : T.text, fontSize: 28, fontWeight: '800', letterSpacing: -1, marginBottom: 6 },`
);

fs.writeFileSync(targetPath, content, 'utf8');
console.log('SettingsScreen light theme UI patches applied.');
