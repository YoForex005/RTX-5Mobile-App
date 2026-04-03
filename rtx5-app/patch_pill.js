const fs = require('fs');
const file = 'src/features/quotes/QuotesScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove background colors entirely, keep text colors
content = content.replace(
  /const POSITIVE_BG = T\.upGlow;\s*const NEGATIVE_BG = T\.downGlow;\s*const color = isUp \? POSITIVE : NEGATIVE;\s*const pillBgColor = noData \? T\.border : \(isUp \? POSITIVE_BG : NEGATIVE_BG\);/,
  `const color = isUp ? POSITIVE : NEGATIVE;
  const pillBgColor = 'transparent';`
);

// 2. Remove padding and border radius from changePill style
// Original: changePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
content = content.replace(
  /changePill: \{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 \},/,
  `changePill: { paddingVertical: 2, marginLeft: -2 },`
);

fs.writeFileSync(file, content);
console.log('Done padding removal');
