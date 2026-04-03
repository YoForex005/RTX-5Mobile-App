import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLiveCandles } from '../../../hooks/useLiveCandles';
import { ChartColorsConfig, ChartDisplaySettings } from '../../../state/userPreferences';
import { DRAWING_TOOLS_JS } from '../plugins/drawingToolsBundleString';
import { isStructurallyValidCandle, normalizeTimeframe } from '../../../domain/candles';
import { useTheme } from '../../../theme/useTheme';

const CH_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <script src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #chart { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script>${DRAWING_TOOLS_JS}</script>
    <script>
      var chart = null;
      var series = null;
      var volumeSeries = null;
      var drawingTools = null;
      var UP_COLOR = '#26A69A';
      var DOWN_COLOR = '#EF5350';

      function initChart(opts, chartType, data, displayDecimals, customColors, displaySettings) {
        try {
          if (chart) { chart.remove(); chart = null; series = null; volumeSeries = null; }
          opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          window._displaySettings = displaySettings || {};
          window._customColors = customColors || {};
          
          var cUp = customColors && customColors.candlesUptrend ? customColors.candlesUptrend : UP_COLOR;
          var cDown = customColors && customColors.candlesDowntrend ? customColors.candlesDowntrend : DOWN_COLOR;
          var hollowB = customColors && customColors.hollowBody ? customColors.hollowBody : 'transparent';
          var bUp = customColors && customColors.barsUptrend ? customColors.barsUptrend : UP_COLOR;
          var bDown = customColors && customColors.barsDowntrend ? customColors.barsDowntrend : DOWN_COLOR;
          var lBody = customColors && customColors.lineBody ? customColors.lineBody : UP_COLOR;
          var showLastPriceLine = !!(window._displaySettings && window._displaySettings.showLastPriceLine);
          
          opts.grid.vertLines.style = LightweightCharts.LineStyle.Solid;
          opts.grid.horzLines.style = LightweightCharts.LineStyle.Solid;
          opts.crosshair.vertLine.style = LightweightCharts.LineStyle.Dashed;
          opts.crosshair.horzLine.style = LightweightCharts.LineStyle.Dashed;

          var priceFormatInfo = { type: 'price', precision: displayDecimals, minMove: 1 / Math.pow(10, displayDecimals) };
          chart = LightweightCharts.createChart(document.getElementById('chart'), opts);

          if (chartType === 'candles' || chartType === 'hollow') {
            series = chart.addSeries(LightweightCharts.CandlestickSeries, {
              upColor: chartType === 'hollow' ? hollowB : cUp, downColor: cDown, borderVisible: true,
              wickUpColor: cUp, wickDownColor: cDown, borderUpColor: cUp, borderDownColor: cDown,
              lastValueVisible: true, priceLineVisible: showLastPriceLine, priceFormat: priceFormatInfo,
            });
          } else if (chartType === 'bars') {
            series = chart.addSeries(LightweightCharts.BarSeries, {
              upColor: bUp, downColor: bDown, lastValueVisible: true, priceLineVisible: showLastPriceLine, priceFormat: priceFormatInfo,
            });
          } else {
            series = chart.addSeries(LightweightCharts.LineSeries, {
              color: lBody, lineWidth: 2, crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: showLastPriceLine, priceFormat: priceFormatInfo,
            });
          }

          if (data && data.length > 0) { series.setData(data); }
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'CHART_READY'}));
        } catch(e) { window.ReactNativeWebView.postMessage(JSON.stringify({type:'ERROR',message:e.message})); }
      }

      function updateChartData(data) {
        try { if (series) series.setData(data); } catch(e) {}
      }
      
      function updateTick(tick) {
        try { if (series) series.update(tick); } catch(e) {}
      }

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

      window.ReactNativeWebView.postMessage(JSON.stringify({type:'READY'}));
    </script>
</body>
</html>
`;

export default function LiveChartPreviewNative({
  symbol, timeframe, colors, display, isDark, chartType = 'candles'
}: {
  symbol: string; timeframe: string; colors: ChartColorsConfig; display: ChartDisplaySettings; isDark: boolean; chartType?: 'candles' | 'bars' | 'line' | 'hollow';
}) {
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const { candles } = useLiveCandles(symbol, timeframe);
  
  const baseSymbol = symbol.replace(/[a-z_.-].*$/, '');
  const displayDecimals = baseSymbol.includes('JPY') ? 3 : baseSymbol.includes('XAU') ? 2 : baseSymbol.includes('BTC') ? 2 : 5;

  const chartOptions = useMemo(() => ({
    layout: { background: { color: colors.background }, textColor: colors.foreground, attributionLogo: false, fontSize: 11 },
    grid: { vertLines: { color: display.showGrid ? colors.grid : 'transparent' }, horzLines: { color: display.showGrid ? colors.grid : 'transparent' } },
    crosshair: { mode: 0, vertLine: { color: isDark ? '#475569' : '#94A3B8', width: 1 }, horzLine: { color: isDark ? '#475569' : '#94A3B8', width: 1 } },
    timeScale: { borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', timeVisible: true, format: 'HH:mm' },
    rightPriceScale: { borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
  }), [colors, display, isDark]);

  useEffect(() => {
    if (webViewRef.current && webViewReady && candles.length > 0) {
      const sanitized = candles.filter((c) => isStructurallyValidCandle(c));
      const uniqueData = Array.from(new Map(sanitized.map((item) => [item.time, item])).values()).sort((a, b) => a.time - b.time).slice(-50);
      let mappedData: any = uniqueData;
      if (chartType === 'line') {
        mappedData = uniqueData.map((item) => ({ time: item.time, value: item.close }));
      }
      const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, ${JSON.stringify(colors)}, ${JSON.stringify(display)}); true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [candles, webViewReady, colors, display, chartType, chartOptions]);

  // Tick updates
  useEffect(() => {
    let rAF: number | null = null;
    const pendingEvents: any[] = [];
    const flushEvents = () => {
      rAF = null;
      if (!webViewRef.current || !webViewReady || pendingEvents.length === 0) return;
      let js = '';
      const events = [...pendingEvents];
      pendingEvents.length = 0;
      for (const event of events) {
        if (event.type === 'resync_required' || event.type === 'full_sync') continue;
        const candle = event.candle;
        if (!isStructurallyValidCandle(candle)) continue;
        let tickToInject: any = candle;
        if (chartType === 'line') tickToInject = { time: candle.time, value: candle.close };
        js += `updateTick(${JSON.stringify(tickToInject)});`;
      }
      if (js.length > 0) {
        try { webViewRef.current.injectJavaScript(js + ' true;'); } catch (e) {}
      }
    };

    const handleStreamEvent = (event: any) => {
      if (event.symbol.toUpperCase() !== symbol.toUpperCase()) return;
      if (normalizeTimeframe(event.tf) !== normalizeTimeframe(timeframe)) return;
      if (!webViewReady) return;
      pendingEvents.push(event);
      if (rAF === null) rAF = requestAnimationFrame(flushEvents);
    };

    import('../../../api/ws/candlesSocket').then(({ candlesWsService }) => {
      candlesWsService.addStreamListener(handleStreamEvent);
    });

    return () => {
      if (rAF !== null) cancelAnimationFrame(rAF);
      import('../../../api/ws/candlesSocket').then(({ candlesWsService }) => {
        candlesWsService.removeStreamListener(handleStreamEvent);
      });
    };
  }, [symbol, timeframe, webViewReady, chartType]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WebView
        ref={webViewRef}
        source={{ html: CH_HTML }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={(event) => {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'READY') setWebViewReady(true);
        }}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        cacheEnabled={false}
        androidLayerType="hardware"
      />
      {display.showTicker && (
        <Text style={{ position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: '600', opacity: 0.9, color: colors.foreground, pointerEvents: 'none' }}>
          {symbol.replace(/\//g, '')},{timeframe}: Live Asset
        </Text>
      )}
    </View>
  );
}
