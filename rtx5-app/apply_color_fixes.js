const fs = require('fs');
const path = require('path');

function fixChartScreen() {
    const file = path.join(__dirname, 'src/features/chart/ChartScreen.native.tsx');
    let content = fs.readFileSync(file, 'utf8');

    // Make sure initChart string accepts chartColors
    const badInit = 'initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, true)';
    const goodInit = 'initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, true, ${JSON.stringify(chartColors)})';

    content = content.replace(badInit, goodInit);
    content = content.replace(badInit, goodInit);

    fs.writeFileSync(file, content);
    console.log('ChartScreen init function parameter injected.');
}

function fixModalStyles() {
    const file = path.join(__dirname, 'src/features/chart/ChartColorsScreen.tsx');
    let content = fs.readFileSync(file, 'utf8');

    // Decrease the size of color bubbles to fit tighter on small phones
    // Original: width: 48, height: 48, gap: 16
    // New: width: 40, height: 40, gap: 12
    content = content.replace(/width: 48, height: 48, borderRadius: 24/g, 'width: 42, height: 42, borderRadius: 21');
    content = content.replace(/gap: 16/g, 'gap: 12');
    content = content.replace(/padding: 24/g, 'padding: 20');
    content = content.replace(/paddingBottom: 40/g, 'paddingBottom: 48'); // Give extra padding for safe area bottom

    fs.writeFileSync(file, content);
    console.log('ChartColorsScreen modal styles optimized for mobile.');
}

fixChartScreen();
fixModalStyles();
