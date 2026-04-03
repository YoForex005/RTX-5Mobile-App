const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/chart/ChartScreen.native.tsx');
let content = fs.readFileSync(file, 'utf8');

const updatedJs = `
      function applyChartColors(chartType, customColors) {
          try {
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
              series.applyOptions({
                upColor: bUp,
                downColor: bDown,
              });
            } else {
              series.applyOptions({
                color: lBody,
              });
            }
          } catch(e) {}
      }

      function initChart(opts, chartType, data, displayDecimals, isExpanded, customColors) {
        try {
          if (chart) { chart.remove(); chart = null; series = null; volumeSeries = null; }

          opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          var cUp = customColors && customColors.candlesUptrend ? customColors.candlesUptrend : UP_COLOR;
          var cDown = customColors && customColors.candlesDowntrend ? customColors.candlesDowntrend : DOWN_COLOR;
          var hollowB = customColors && customColors.hollowBody ? customColors.hollowBody : 'transparent';
          var bUp = customColors && customColors.barsUptrend ? customColors.barsUptrend : UP_COLOR;
          var bDown = customColors && customColors.barsDowntrend ? customColors.barsDowntrend : DOWN_COLOR;
          var lBody = customColors && customColors.lineBody ? customColors.lineBody : UP_COLOR;

          opts.grid.vertLines.style = LightweightCharts.LineStyle.Solid;
          opts.grid.horzLines.style = LightweightCharts.LineStyle.Solid;
          opts.crosshair.vertLine.style = LightweightCharts.LineStyle.Dashed;
          opts.crosshair.horzLine.style = LightweightCharts.LineStyle.Dashed;

          var priceFormatInfo = {
             type: 'price',
             precision: displayDecimals,
             minMove: 1 / Math.pow(10, displayDecimals)
          };

          chart = LightweightCharts.createChart(document.getElementById('chart'), opts);

          if (chartType === 'candles' || chartType === 'hollow') {
            series = chart.addSeries(LightweightCharts.CandlestickSeries, {
              upColor: chartType === 'hollow' ? hollowB : cUp,
              downColor: cDown,
              borderVisible: true,
              wickUpColor: cUp,
              wickDownColor: cDown,
              borderUpColor: cUp,
              borderDownColor: cDown,
              lastValueVisible: true,
              priceLineVisible: true,
              priceFormat: priceFormatInfo,
            });
          } else if (chartType === 'bars') {
            series = chart.addSeries(LightweightCharts.BarSeries, {
              upColor: bUp,
              downColor: bDown,
              lastValueVisible: true,
              priceLineVisible: true,
              priceFormat: priceFormatInfo,
            });
          } else {
            series = chart.addSeries(LightweightCharts.LineSeries, {
              color: lBody,
              lineWidth: 2,
              crosshairMarkerVisible: true,
              lastValueVisible: true,
              priceLineVisible: true,
              priceFormat: priceFormatInfo,
            });
          }

          volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            priceLineVisible: false,
            lastValueVisible: false,
          });
          chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.9, bottom: 0 },
            visible: false,
          });

          if (window._customColors !== customColors) {
              window._customColors = customColors || {};
          }

          if (data && data.length > 0) {
            updateChartData(data); // Re-use the update function to set data and colormap volumes
          }
        } catch(e) { window.ReactNativeWebView.postMessage(JSON.stringify({type: 'error', error: e.message})); }
      }

      function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16),
            g = parseInt(hex.slice(3, 5), 16),
            b = parseInt(hex.slice(5, 7), 16);
        if (isNaN(r)) return 'rgba(150,150,150,0.4)';
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
      }

      function updateChartData(data) {
        try {
          if (!series) return;
          series.setData(data);
          if (volumeSeries) {
            var cUp = (window._customColors && window._customColors.candlesUptrend) ? window._customColors.candlesUptrend : UP_COLOR;
            var cDown = (window._customColors && window._customColors.candlesDowntrend) ? window._customColors.candlesDowntrend : DOWN_COLOR;
            var volUp = hexToRgba(cUp, 0.4);
            var volDown = hexToRgba(cDown, 0.4);

            var volData = data.map(function(d) {
              var isGreen = d.close >= d.open;
              return {
                time: d.time,
                value: d.volume || 0,
                color: isGreen ? volUp : volDown
              };
            });
            volumeSeries.setData(volData);
          }
        } catch(e) {}
      }
`;

const blockStart = "function initChart(opts, chartType, data, displayDecimals, isExpanded, customColors) {";
const blockEnd = "function updateChartData(data) {";

// Split out the old scripts functions up until setPriceLines returns
let parts = content.split('function setPriceLines(lines) {');
let preamble = parts[0];
let rest = 'function setPriceLines(lines) {' + parts[1];

let scriptEndPartIndex = rest.indexOf('function parseTime');
if (scriptEndPartIndex !== -1) {
    let scriptBeforeParseTime = rest.substring(0, scriptEndPartIndex);
    let afterParseTime = rest.substring(scriptEndPartIndex);

    // Keep setPriceLines
    let spIndexEnd = scriptBeforeParseTime.indexOf('function initChart(');
    let setPriceLinesFn = scriptBeforeParseTime.substring(0, spIndexEnd);

    let newCH = preamble + setPriceLinesFn + updatedJs + "\\n      " + afterParseTime;

    // React Native update effect check
    if (!newCH.includes('window._customColors = ${JSON.stringify(chartColors)}; applyChartColors')) {
         newCH = newCH.replace(
           '} else if (chunkJumped) {',
           '} else if (chartColors !== window._lastChartColorsRendered) {\\n        window._lastChartColorsRendered = chartColors;\\n        webViewRef.current.injectJavaScript(`window._customColors = ${JSON.stringify(chartColors)}; applyChartColors(${JSON.stringify(chartType)}, ${JSON.stringify(chartColors)}); true;`);\\n        dataSignatureRef.current = sig;\\n      } else if (chunkJumped) {'
         );
    }
    
    fs.writeFileSync(file, newCH);
    console.log('Successfully injected hot-reload and volume color bindings');
} else {
    console.log('Failed to parse blocks');
}
