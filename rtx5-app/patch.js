const fs = require('fs');
const file = 'src/features/quotes/QuotesScreen.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const color = isUp ? POSITIVE : NEGATIVE;')) {
    const next = lines[i+1];
    if (next.includes('const pillBgColor = noData ? T.border : (isUp ? POSITIVE : NEGATIVE);')) {
      lines[i] = '  const POSITIVE_BG = T.upGlow;\n  const NEGATIVE_BG = T.downGlow;\n  const color = isUp ? POSITIVE : NEGATIVE;';
      lines[i+1] = next.replace('(isUp ? POSITIVE : NEGATIVE)', '(isUp ? POSITIVE_BG : NEGATIVE_BG)');
    }
  }
  
  if (lines[i].includes('<Text style={[sc.changePillText, { color: noData ? T.textMuted : \'#FFFFFF\' }]}>{noData ? \'--\' : pct}</Text>')) {
    lines[i] = lines[i].replace('\'#FFFFFF\'', 'color');
  }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Patch complete.');
