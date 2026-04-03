const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/chart/ChartScreen.native.tsx');
let content = fs.readFileSync(file, 'utf8');

// Inject the hexToRgba and applyColors functions right before <script> ends
const functionToInject = `
      function hexToRgba(hex, alpha) {
        if (!hex) return 'rgba(150,150,150,'+alpha+')';
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        var r = parseInt(hex.slice(0, 2), 16),
            g = parseInt(hex.slice(2, 4), 16),
            b = parseInt(hex.slice(4, 6), 16);
        if (isNaN(r)) return 'rgba(150,150,150,'+alpha+')';
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
      }

      function applyColors(chartType, customColors) {
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
          } catch(e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'ERROR',message:'applyColors: '+e.message}));
          }
      }
`;

if (!content.includes('function applyColors')) {
    content = content.replace(
        'function clearDrawings() {',
        functionToInject + '\n      function clearDrawings() {'
    );
}

// Ensure updateChartData and updateTick use memory colors for volume
content = content.replace(
  "color: isGreen ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)'",
  "color: isGreen ? hexToRgba((window._customColors && window._customColors.candlesUptrend) || UP_COLOR, 0.5) : hexToRgba((window._customColors && window._customColors.candlesDowntrend) || DOWN_COLOR, 0.5)"
);

content = content.replace(
  "color: isGreen ? 'rgba(8, 153, 129, 0.12)' : 'rgba(242, 54, 69, 0.12)'",
  "color: isGreen ? hexToRgba((window._customColors && window._customColors.candlesUptrend) || UP_COLOR, 0.12) : hexToRgba((window._customColors && window._customColors.candlesDowntrend) || DOWN_COLOR, 0.12)"
);
// replace it again in case it exists twice (updateChartData and updateTick and initChart)
content = content.replace( // for initChart inner map
    "color: isGreen ? 'rgba(8, 153, 129, 0.12)' : 'rgba(242, 54, 69, 0.12)'",
    "color: isGreen ? hexToRgba((window._customColors && window._customColors.candlesUptrend) || UP_COLOR, 0.12) : hexToRgba((window._customColors && window._customColors.candlesDowntrend) || DOWN_COLOR, 0.12)"
);


// In useEffect, rather than relying on sig change to do initChart, inject applyColors directly
// Remove chartColors from sig so it doesn't force re-mount
content = content.replace(
    'const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}-${JSON.stringify(chartColors)}`;',
    'const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}`;'
);

// We still want to react to chartColors. So add a separate effect just for colors!
const colorEffect = `
  // Hot-reload colors explicitly
  useEffect(() => {
    if (webViewRef.current && webViewReady) {
      if (!isEqualRef.current) isEqualRef.current = chartColors;
      if (JSON.stringify(isEqualRef.current) !== JSON.stringify(chartColors)) {
        isEqualRef.current = chartColors;
        webViewRef.current.injectJavaScript(\`applyColors(\${JSON.stringify(chartType)}, \${JSON.stringify(chartColors)}); true;\`);
      }
    }
  }, [chartColors, webViewReady, chartType]);
`;

// Insert the effect right above `useEffect(() => { candlesRef.current = candles;`
if (!content.includes('Hot-reload colors explicitly')) {
    content = content.replace(
        'useEffect(() => {\n    candlesRef.current = candles;\n  }, [candles]);',
        'const isEqualRef = useRef(chartColors);\n' + colorEffect + '\n  useEffect(() => {\n    candlesRef.current = candles;\n  }, [candles]);'
    );
}

fs.writeFileSync(file, content);
console.log('Successfully injected applyColors and fixed volume bindings!');
