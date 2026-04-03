const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/chart/ChartScreen.native.tsx');
let content = fs.readFileSync(file, 'utf8');

const applyColorsFunction = `
      function applyColors(chartType, customColors, data) {
          try {
            window._customColors = customColors || {};
            if (!series) return;
            var cUp = customColors && customColors.candlesUptrend ? customColors.candlesUptrend : UP_COLOR;
            var cDown = customColors && customColors.candlesDowntrend ? customColors.candlesDowntrend : DOWN_COLOR;
            var hollowB = customColors && customColors.hollowBody ? customColors.hollowBody : 'transparent';
            var bUp = customColors && customColors.barsUptrend ? customColors.barsUptrend : UP_COLOR;
            var bDown = customColors && customColors.barsDowntrend ? customColors.barsDowntrend : DOWN_COLOR;
            var lBody = customColors && customColors.lineBody ? customColors.lineBody : UP_COLOR;

            if (chartType === 'candles' || chartType === 'hollow') {
              series.applyOptions({
                upColor: chartType === 'hollow' ? hollowB : cUp,
                downColor: cDown,
                wickUpColor: cUp,
                wickDownColor: cDown,
                borderUpColor: cUp,
                borderDownColor: cDown,
              });
            } else if (chartType === 'bars') {
              series.applyOptions({ upColor: bUp, downColor: bDown });
            } else {
              series.applyOptions({ color: lBody });
            }

            if (volumeSeries && data) {
               var volData = data.map(function(d) {
                 var isGreen = d.close >= d.open;
                 return {
                   time: d.time,
                   value: d.volume || 0,
                   color: isGreen ? hexToRgba(cUp, 0.4) : hexToRgba(cDown, 0.4)
                 };
               });
               volumeSeries.setData(volData);
            }
          } catch(e) { }
      }
`;

// Insert the applyColors function
if (!content.includes('function applyColors')) {
    content = content.replace(
        'function clearDrawings() {',
        applyColorsFunction + '\n      function clearDrawings() {'
    );
}

// Ensure initChart has window._customColors saved
content = content.replace(
    /chart = LightweightCharts\.createChart\(document\.getElementById\('chart'\), opts\);/,
    'chart = LightweightCharts.createChart(document.getElementById(\'chart\'), opts);\n          window._customColors = customColors || {};'
);

// We want to HOT-RELOAD colors without fully rebuilding the chart.
// So we REMOVE chartColors from the signature.
const currentSigRegex = /const sig = \`\$\{chartSymbol\}-\$\{chartTimeframe\}-\$\{isDark\}-\$\{chartType\}-\$\{JSON\.stringify\(chartColors\)\}\`;/;
if (currentSigRegex.test(content)) {
    content = content.replace(
        currentSigRegex,
        'const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}`;'
    );
}

// Add the Hot-reload explicit React native code Effect! 
// This reads the newly selected colors and seamlessly updates the UI canvas 60fps!
const hotReloadEffect = `
  const isEqualRef = useRef(chartColors);
  useEffect(() => {
    if (webViewRef.current && webViewReady && candlesRef.current.length > 0) {
      if (!isEqualRef.current) isEqualRef.current = chartColors;
      if (JSON.stringify(isEqualRef.current) !== JSON.stringify(chartColors)) {
        isEqualRef.current = chartColors;
        
        // Pass the mappedData so we can recalculate volumes instantaneously!
        const sanitized = candlesRef.current.filter((c) => isStructurallyValidCandle(c));
        const uniqueData = Array.from(new Map(sanitized.map((item) => [item.time, item])).values());
        uniqueData.sort((a, b) => a.time - b.time);
        
        let mappedData: any = uniqueData;
        if (chartType === 'line') {
          mappedData = uniqueData.map((item) => ({
            time: item.time, value: item.close, open: item.open, close: item.close, volume: item.volume,
          }));
        }

        webViewRef.current.injectJavaScript(\`applyColors(\${JSON.stringify(chartType)}, \${JSON.stringify(chartColors)}, \${JSON.stringify(mappedData)}); true;\`);
      }
    }
  }, [chartColors, webViewReady, chartType]);
`;

// Inject into React Native
if (!content.includes('const isEqualRef = useRef(chartColors);')) {
    content = content.replace(
        'const candlesRef = useRef(candles);',
        'const candlesRef = useRef(candles);\n' + hotReloadEffect
    );
}

fs.writeFileSync(file, content);
console.log('Successfully injected instantaneous applyColors and sig separation!');
