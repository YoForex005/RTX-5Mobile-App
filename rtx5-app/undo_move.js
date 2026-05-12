const fs = require('fs');
let lines = fs.readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8').split(/\r?\n/);
const targetIdx = lines.findIndex((l) => l.includes('!isChartExpanded && showChartTradeSheet && ('));
let startIdx = -1;
for (let i = targetIdx - 1; i >= 0; i--) {
  if (lines[i].includes('<View') && lines[i+1] && lines[i+1].includes('styles.chartTopToolbar')) {
    startIdx = i;
    break;
  }
}
let endIdx = -1;
for (let i = targetIdx - 1; i >= startIdx; i--) {
  if (lines[i].includes(') : null}')) {
    endIdx = i;
    break;
  }
}
if(startIdx===-1||endIdx===-1){console.log('NOT FOUND'); process.exit(1);}
let chunk = lines.splice(startIdx, endIdx - startIdx + 1);

const insertIdx = lines.findIndex((l) => l.includes('<View style={[styles.chartContainer, isChartExpanded && { minHeight: fullscreenChartMinHeight }]}')) + 1;

chunk = chunk.map(l => l.replace('isChartExpanded && { paddingBottom: safeInsets.bottom + fullscreenToolbarTouchBuffer, marginTop: 0 }', 'isChartExpanded && { paddingTop: fullscreenToolbarTopPadding, marginTop: 0 }'));
chunk = chunk.map(l => l.replace('{ bottom: isChartExpanded ? 56 + safeInsets.bottom : 56 }', '{ top: isChartExpanded ? fullscreenChartTypeMenuTop : 56 }'));

lines.splice(insertIdx, 0, ...chunk);
fs.writeFileSync('src/features/chart/ChartScreen.native.tsx', lines.join('\\n'));
console.log('DONE');
