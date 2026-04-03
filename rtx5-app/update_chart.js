const fs = require('fs');
const path = require('path');

function updateChartScreen() {
    const file = path.join(__dirname, 'src/features/chart/ChartScreen.native.tsx');
    let content = fs.readFileSync(file, 'utf8');

    // Replace 1: initChart definition
    content = content.replace(
        'function initChart(opts, chartType, data, displayDecimals, isExpanded) {',
        'function initChart(opts, chartType, data, displayDecimals, isExpanded, customColors) {'
    );

    // Replace 2: Inject assignments into initChart body
    if (!content.includes('customColors.candlesUptrend')) {
        content = content.replace(
            'opts.layout.background = { type: \'solid\', color: opts.layout.background.color };',
            `opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          var cUp = customColors && customColors.candlesUptrend ? customColors.candlesUptrend : UP_COLOR;
          var cDown = customColors && customColors.candlesDowntrend ? customColors.candlesDowntrend : DOWN_COLOR;
          var hollowB = customColors && customColors.hollowBody ? customColors.hollowBody : 'transparent';
          var bUp = customColors && customColors.barsUptrend ? customColors.barsUptrend : UP_COLOR;
          var bDown = customColors && customColors.barsDowntrend ? customColors.barsDowntrend : DOWN_COLOR;
          var lBody = customColors && customColors.lineBody ? customColors.lineBody : UP_COLOR;`
        );
    }

    // Replace 3: Replace colors config map values
    content = content.replace(`upColor: chartType === 'hollow' ? 'transparent' : UP_COLOR,`, `upColor: chartType === 'hollow' ? hollowB : cUp,`);
    content = content.replace(`downColor: DOWN_COLOR,`, `downColor: cDown,`);
    content = content.replace(`wickUpColor: UP_COLOR,`, `wickUpColor: cUp,`);
    content = content.replace(`wickDownColor: DOWN_COLOR,`, `wickDownColor: cDown,`);
    content = content.replace(`borderUpColor: UP_COLOR,`, `borderUpColor: cUp,`);
    content = content.replace(`borderDownColor: DOWN_COLOR,`, `borderDownColor: cDown,`);
    content = content.replace(`upColor: UP_COLOR,`, `upColor: bUp,`); // this targets bars
    content = content.replace(`downColor: DOWN_COLOR,`, `downColor: bDown,`); // targets bars
    content = content.replace(`color: UP_COLOR,`, `color: lBody,`); // targets line

    // Update dependencies
    if (!content.includes('chartColors } = useUserPreferences()')) {
        content = content.replace(
            `showPotentialStopOut } = useUserPreferences();`,
            `showPotentialStopOut, chartColors } = useUserPreferences();`
        );
    }

    if (!content.includes('JSON.stringify(chartColors)}`')) {
        content = content.replace(
            'const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}`;',
            'const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}-${JSON.stringify(chartColors)}`;'
        );
    }

    if (!content.includes('customColors)')) {
        content = content.replace(
            'initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, true)',
            'initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, true, ${JSON.stringify(chartColors)})'
        );
    }

    if (!content.includes('chartColors]')) {
         content = content.replace(
             '}, [candles, isDark, chartType, webViewReady, chartSymbol, chartTimeframe, chartOptions, displayDecimals]);',
             '}, [candles, isDark, chartType, webViewReady, chartSymbol, chartTimeframe, chartOptions, displayDecimals, chartColors]);'
         );
    }
    
    fs.writeFileSync(file, content);
    console.log('ChartScreen updated.');
}

updateChartScreen();
