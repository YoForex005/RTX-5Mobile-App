const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/chart/ChartScreen.native.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Remove the Hot-reload explicitly useEffect completely!
content = content.replace(/const isEqualRef = useRef\(chartColors\);\s*\/\/\s*Hot-reload colors explicitly\s*useEffect\(\(\) => \{[\s\S]*?\}\, \[chartColors\, webViewReady\, chartType\]\);\s*/g, '');

// 2. Add JSON.stringify(chartColors) back to the sig
// Look for `const sig = \`\${chartSymbol}-\${chartTimeframe}-\${isDark}-\${chartType}\`;`
// And replace it with the colors stringified so it ALWAYS triggers
content = content.replace(
    'const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}`;',
    'const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}-${JSON.stringify(chartColors)}`;'
);

// 3. Make sure initChart actually uses the custom colors!
// The previous code had: `var cUp = customColors && customColors.candlesUptrend ? customColors.candlesUptrend : UP_COLOR;`
// We need to make sure customColors is definitely passed.
content = content.replace(
    'const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, true, ${JSON.stringify(chartColors)}); true;`;',
    'const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, true, ${JSON.stringify(chartColors)}); true;`;' // Already correct but just to be sure...
);

fs.writeFileSync(file, content);
console.log('Fixed sig to auto-rebuild chart on color change');
