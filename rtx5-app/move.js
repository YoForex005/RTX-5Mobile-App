const fs = require('fs');
let lines = fs.readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8').split(/\r?\n/);
const startIdx = lines.findIndex((l, i) => l.includes('<View') && lines[i+1] && lines[i+1].includes('styles.chartTopToolbar'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes(') : null}') && lines[i+1] && lines[i+1].includes("<View style={{ flex: 1, flexDirection: 'row' }}>"));
if(startIdx===-1||endIdx===-1){console.log('NOT FOUND', startIdx, endIdx); process.exit(1);}
let chunk = lines.splice(startIdx, endIdx - startIdx + 1);
let targetIdx = lines.findIndex((l, i) => l.includes('</View>') && lines[i+1] === '' && lines[i+2] && lines[i+2].includes('!isChartExpanded && showChartTradeSheet'));
if(targetIdx===-1){console.log('TARGET NOT FOUND'); process.exit(1);}
chunk = chunk.map(l => l.replace('isChartExpanded && { paddingTop: fullscreenToolbarTopPadding, marginTop: 0 }', 'isChartExpanded && { paddingBottom: safeInsets.bottom + fullscreenToolbarTouchBuffer, marginTop: 0 }'));
chunk = chunk.map(l => l.replace('{ top: isChartExpanded ? fullscreenChartTypeMenuTop : 56 }', '{ bottom: isChartExpanded ? 56 + safeInsets.bottom : 56 }'));
lines.splice(targetIdx, 0, ...chunk);
fs.writeFileSync('src/features/chart/ChartScreen.native.tsx', lines.join('\\n'));
console.log('DONE');
