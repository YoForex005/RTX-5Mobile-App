import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLiveCandles } from '../../../domain/candles/hooks/useLiveCandles';
import { ChartColorsConfig, ChartDisplaySettings } from '../../../state/userPreferences';
import { useInstrumentMeta } from '../../../query/instruments';
import { hasLiveQuoteFeedData, useMarketData } from '../../../query/websocket';
import { getDevRefreshKey, hashDevRefreshSource } from '../../../dev/devRefreshKey';
import {
  buildVolumeDatum,
  getLastPreviewCandleSignature,
  mapPreviewCandles,
  PreviewChartType,
  sanitizePreviewCandles,
} from './chartPreviewShared';
import { resolveChartDisplayDecimals } from '../chartPricePrecision';


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
    <script>window.__RTX5_CUSTOM_CANDLE_GEOMETRY_DEBUG = ${__DEV__ ? 'true' : 'false'};</script>

    <script>
      var chart = null;
      var series = null;
      var volumeSeries = null;
      var priceLinesArr = [];
      window._displaySettings = {};
      window._customColors = {};
      window._lastChartData = [];
      window._lastVolumePoint = null;
      window._chartType = 'candles';

      function hexToRgba(color, alpha) {
        if (!color) return 'rgba(148, 163, 184, ' + alpha + ')';
        var trimmed = String(color).trim();

        if (trimmed.indexOf('rgba(') === 0) {
          var rgbaParts = trimmed.slice(5, -1).split(',').map(function(part) { return part.trim(); });
          if (rgbaParts.length >= 3) {
            return 'rgba(' + rgbaParts[0] + ', ' + rgbaParts[1] + ', ' + rgbaParts[2] + ', ' + alpha + ')';
          }
        }

        if (trimmed.indexOf('rgb(') === 0) {
          var rgbParts = trimmed.slice(4, -1).split(',').map(function(part) { return part.trim(); });
          if (rgbParts.length >= 3) {
            return 'rgba(' + rgbParts[0] + ', ' + rgbParts[1] + ', ' + rgbParts[2] + ', ' + alpha + ')';
          }
        }

        var hex = trimmed.replace('#', '');
        if (hex.length === 3) {
          hex = hex.split('').map(function(char) { return char + char; }).join('');
        }

        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          var r = parseInt(hex.slice(0, 2), 16);
          var g = parseInt(hex.slice(2, 4), 16);
          var b = parseInt(hex.slice(4, 6), 16);
          return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
        }

        return trimmed;
      }

      function getVolumeBarColor(item, isActive) {
        var customCols = window._customColors || {};
        var up = customCols.candlesUptrend || '#2962FF';
        var down = customCols.candlesDowntrend || '#EF5350';
        return hexToRgba(item.close >= item.open ? up : down, isActive ? 0.78 : 0.32);
      }

      function buildVolumeDatum(item, isActive, minValue) {
        var rawValue = Math.max(Number(item && item.volume ? item.volume : 0), 0);
        var safeValue = typeof minValue === 'number' ? Math.max(minValue, rawValue) : rawValue;
        return {
          time: item.time,
          value: safeValue,
          color: getVolumeBarColor(item, isActive)
        };
      }

      function syncLastVolumePoint(point) {
        window._lastVolumePoint = point ? { time: point.time, value: point.value } : null;
      }

      function upsertLastChartDataPoint(tick) {
        if (!tick || typeof tick.time !== 'number') return;
        if (!Array.isArray(window._lastChartData)) {
          window._lastChartData = [];
        }
        var data = window._lastChartData;
        if (data.length > 0 && data[data.length - 1].time === tick.time) {
          data[data.length - 1] = tick;
          return;
        }
        data.push(tick);
      }

      function setVolumeSeriesData(data) {
        if (!volumeSeries) return;
        var source = Array.isArray(data) ? data : [];
        var volData = source.map(function(item, index) {
          return buildVolumeDatum(item, index === source.length - 1);
        });
        volumeSeries.setData(volData);
        syncLastVolumePoint(volData.length > 0 ? volData[volData.length - 1] : null);
      }

      function updateVolumeSeriesTick(tick) {
        if (!volumeSeries || !tick) return;
        var minValue = window._lastVolumePoint && window._lastVolumePoint.time === tick.time
          ? window._lastVolumePoint.value
          : undefined;
        var point = buildVolumeDatum(tick, true, minValue);
        volumeSeries.update(point);
        syncLastVolumePoint(point);
      }

      function resetPriceLines() {
        priceLinesArr.forEach(function(priceLine) {
          try { series.removePriceLine(priceLine); } catch (_error) {}
        });
        priceLinesArr = [];
      }

      function initChart(opts, chartType, data, displayDecimals, customColors, displaySettings) {
        try {
          if (chart) {
            chart.remove();
          }

          chart = null;
          series = null;
          volumeSeries = null;
          priceLinesArr = [];
          window._lastChartData = [];
          window._lastVolumePoint = null;
          window._chartType = chartType;
          window._customColors = customColors || {};
          window._displaySettings = displaySettings || {};

          var showLastPriceLine = !!(window._displaySettings && window._displaySettings.showLastPriceLine);
          var showVolumes = !!(window._displaySettings && (window._displaySettings.showTickVolumes || window._displaySettings.showRealVolumes));
          var hasCustomQuoteLine = !!(window._displaySettings && (window._displaySettings.showBidPriceLine || window._displaySettings.showAskPriceLine));
          var showLastValueLabel = !hasCustomQuoteLine;
          var cUp = window._customColors.candlesUptrend || '#2962FF';
          var cDown = window._customColors.candlesDowntrend || '#EF5350';
          var hollowBody = window._customColors.hollowBody || 'transparent';
          var bUp = window._customColors.barsUptrend || '#2962FF';
          var bDown = window._customColors.barsDowntrend || '#EF5350';
          var lineColor = window._customColors.lineBody || '#2962FF';

          opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          opts.grid.vertLines.style = LightweightCharts.LineStyle.SparseDotted;
          opts.grid.horzLines.style = LightweightCharts.LineStyle.SparseDotted;
          opts.crosshair.vertLine.style = LightweightCharts.LineStyle.Dashed;
          opts.crosshair.horzLine.style = LightweightCharts.LineStyle.Dashed;

          chart = LightweightCharts.createChart(document.getElementById('chart'), opts);

          var priceFormatInfo = {
            type: 'price',
            precision: displayDecimals,
            minMove: 1 / Math.pow(10, displayDecimals)
          };

          if (chartType === 'candles' || chartType === 'hollow') {
            series = chart.addSeries(LightweightCharts.CandlestickSeries, {
              upColor: chartType === 'hollow' ? hollowBody : cUp,
              downColor: chartType === 'hollow' ? hollowBody : cDown,
              borderUpColor: cUp,
              borderDownColor: cDown,
              wickUpColor: cUp,
              wickDownColor: cDown,
              borderVisible: true,
              wickVisible: true,
              color: cUp,
              lastValueVisible: showLastValueLabel,
              priceLineVisible: showLastPriceLine,
              priceFormat: priceFormatInfo,
            });
          } else if (chartType === 'bars') {
            series = chart.addSeries(LightweightCharts.BarSeries, {
              upColor: bUp,
              downColor: bDown,
              lastValueVisible: showLastValueLabel,
              priceLineVisible: showLastPriceLine,
              priceFormat: priceFormatInfo,
            });
          } else {
            series = chart.addSeries(LightweightCharts.LineSeries, {
              color: lineColor,
              lineWidth: 2,
              crosshairMarkerVisible: true,
              lastValueVisible: showLastValueLabel,
              priceLineVisible: showLastPriceLine,
              priceFormat: priceFormatInfo,
            });
          }

          if (showVolumes) {
            volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
              color: hexToRgba(cUp, 0.32),
              priceFormat: { type: 'volume' },
              priceScaleId: 'volume',
              priceLineVisible: false,
              lastValueVisible: false,
            });
            chart.priceScale('volume').applyOptions({
              scaleMargins: { top: 0.84, bottom: 0.02 },
              visible: false,
            });
          }

          if (data && data.length > 0) {
            window._lastChartData = data.slice();
            series.setData(data);
            setVolumeSeriesData(window._lastChartData);
          }

          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHART_READY' }));
        } catch (error) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: error.message }));
        }
      }

      function updateChartData(data) {
        try {
          if (!series) return;
          window._lastChartData = Array.isArray(data) ? data.slice() : [];
          series.setData(window._lastChartData);
          setVolumeSeriesData(window._lastChartData);
        } catch (_error) {}
      }

      // Colors-only fast path: recolor the existing chart in place instead of
      // re-injecting the full candle history from the host (which took seconds).
      function applyPreviewColors(opts, customColors) {
        try {
          if (!chart || !series) return;
          window._customColors = customColors || {};
          var chartType = window._chartType;
          var cUp = window._customColors.candlesUptrend || '#2962FF';
          var cDown = window._customColors.candlesDowntrend || '#EF5350';
          var hollowBody = window._customColors.hollowBody || 'transparent';
          var bUp = window._customColors.barsUptrend || '#2962FF';
          var bDown = window._customColors.barsDowntrend || '#EF5350';
          var lineColor = window._customColors.lineBody || '#2962FF';

          if (opts && opts.layout && opts.layout.background) {
            opts.layout.background = { type: 'solid', color: opts.layout.background.color };
            if (opts.grid) {
              opts.grid.vertLines.style = LightweightCharts.LineStyle.SparseDotted;
              opts.grid.horzLines.style = LightweightCharts.LineStyle.SparseDotted;
            }
            chart.applyOptions(opts);
          }

          if (chartType === 'candles' || chartType === 'hollow') {
            series.applyOptions({
              upColor: chartType === 'hollow' ? hollowBody : cUp,
              downColor: chartType === 'hollow' ? hollowBody : cDown,
              borderUpColor: cUp,
              borderDownColor: cDown,
              wickUpColor: cUp,
              wickDownColor: cDown,
              color: cUp
            });
            // Data items carry baked per-candle colors that override the series
            // options — recolor them from the copy already inside the WebView.
            if (Array.isArray(window._lastChartData) && window._lastChartData.length > 0) {
              var recolored = window._lastChartData.map(function(item) {
                if (!item || typeof item.open !== 'number' || typeof item.close !== 'number') return item;
                var nextColor = chartType === 'hollow'
                  ? hollowBody
                  : (item.close >= item.open ? cUp : cDown);
                return Object.assign({}, item, { color: nextColor });
              });
              window._lastChartData = recolored;
              series.setData(recolored);
            }
          } else if (chartType === 'bars') {
            series.applyOptions({ upColor: bUp, downColor: bDown });
          } else {
            series.applyOptions({ color: lineColor });
          }

          setVolumeSeriesData(window._lastChartData);
        } catch (_error) {}
      }

      function updateTick(tick) {
        try {
          if (!series || !tick) return;
          upsertLastChartDataPoint(tick);
          series.update(tick);
          updateVolumeSeriesTick(tick);
        } catch (_error) {}
      }

      function setPriceLines(lines) {
        try {
          if (!series) return;
          resetPriceLines();
          (lines || []).forEach(function(line) {
            try {
              var priceLine = series.createPriceLine({
                price: line.price,
                color: line.color,
                lineWidth: line.lineWidth || 1,
                lineStyle: line.lineStyle !== undefined ? line.lineStyle : LightweightCharts.LineStyle.Solid,
                axisLabelVisible: line.axisLabelVisible !== false,
                title: line.title || '',
              });
              priceLinesArr.push(priceLine);
            } catch (_error) {}
          });
          try {
            series.applyOptions({ lastValueVisible: (lines || []).length === 0 });
          } catch (_error) {}
        } catch (_error) {}
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
    </script>
</body>
</html>
`;

const PREVIEW_DEV_SOURCE_KEY = getDevRefreshKey(
  'chart-preview-webview',
  hashDevRefreshSource(CH_HTML),
);

export default function LiveChartPreviewNative({
  symbol,
  timeframe,
  colors,
  display,
  priceSource,
  isDark,
  chartType = 'candles',
  active = true,
}: {
  symbol: string;
  timeframe: string;
  colors: ChartColorsConfig;
  display: ChartDisplaySettings;
  priceSource: 'bid' | 'ask';
  isDark: boolean;
  chartType?: PreviewChartType;
  active?: boolean;
}) {
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const { candles } = useLiveCandles(symbol, timeframe, active);
  const liveQuotes = useMarketData([symbol], active);
  const liveQuote = liveQuotes[symbol];
  const { data: instrumentMeta } = useInstrumentMeta(symbol, active);
  const liveQuoteDigitsSource = (liveQuote as { digitsSource?: string } | undefined)?.digitsSource;
  const hasLivePreviewQuote = hasLiveQuoteFeedData(liveQuote);

  const chartSignatureRef = useRef('');
  const lastCandleLengthRef = useRef(0);
  const lastRenderedCandleSignatureRef = useRef('');
  const previewCandlesRef = useRef<ReturnType<typeof sanitizePreviewCandles>>([]);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: colors.background },
      textColor: colors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: display.showGrid ? colors.grid : 'transparent' },
      horzLines: { color: display.showGrid ? colors.grid : 'transparent' },
    },
    crosshair: {
      mode: 0,
      vertLine: {
        color: colors.foreground,
        width: 1,
        labelBackgroundColor: colors.foreground,
      },
      horzLine: {
        color: colors.foreground,
        width: 1,
        labelBackgroundColor: colors.foreground,
      },
    },
    timeScale: {
      borderColor: display.showGrid ? colors.grid : 'transparent',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 0,
      barSpacing: 13,
      minBarSpacing: 3,
    },
    rightPriceScale: {
      borderColor: display.showGrid ? colors.grid : 'transparent',
      autoScale: true,
      scaleMargins: {
        top: 0.08,
        bottom: display.showTickVolumes || display.showRealVolumes ? 0.25 : 0.08,
      },
    },
  }), [colors, display]);

  // Render the FULL candle history so the preview is byte-identical to the
  // main ChartScreen. Previously this was sliced to the last 50 candles to save
  // memory, but the user expects the preview and the main chart to look the
  // same — so we feed the same dataset.
  const previewCandles = useMemo(
    () => sanitizePreviewCandles(candles),
    [candles],
  );
  const latestPreviewPrecisionPrices = useMemo(() => {
    const latest = previewCandles[previewCandles.length - 1];
    return latest ? [latest.open, latest.high, latest.low, latest.close] : [];
  }, [previewCandles]);
  const displayDecimals = useMemo(() => {
    return resolveChartDisplayDecimals({
      instrumentDigits: instrumentMeta?.digits,
      instrumentPoint: instrumentMeta?.point,
      instrumentTickSize: instrumentMeta?.tickSize,
      liveQuoteDigits: liveQuote?.digits,
      liveQuoteDigitsFromBackend: hasLivePreviewQuote && liveQuoteDigitsSource === 'backend',
      liveQuotePoint: liveQuote?.point,
      liveQuoteTickSize: liveQuote?.tickSize,
      liveQuoteBid: liveQuote?.bid,
      liveQuoteAsk: liveQuote?.ask,
      liveQuoteLast: liveQuote?.close,
      candlePrices: latestPreviewPrecisionPrices,
    });
  }, [
    hasLivePreviewQuote,
    instrumentMeta?.digits,
    instrumentMeta?.point,
    instrumentMeta?.tickSize,
    liveQuote?.ask,
    liveQuote?.bid,
    liveQuote?.close,
    liveQuote?.digits,
    liveQuote?.point,
    liveQuote?.tickSize,
    liveQuoteDigitsSource,
    latestPreviewPrecisionPrices,
  ]);
  const mappedPreviewData = useMemo(
    () => mapPreviewCandles(previewCandles, chartType, colors),
    [previewCandles, chartType, colors],
  );
  const chartSignature = useMemo(
    () => JSON.stringify({ chartOptions, colors, display, chartType, displayDecimals }),
    [chartOptions, colors, display, chartType, displayDecimals],
  );
  // Colors are excluded here on purpose: a color-only change recolors the
  // existing chart in place (applyPreviewColors) instead of paying the full
  // candle-history re-injection that made Done feel seconds late.
  const structuralSignature = useMemo(
    () => JSON.stringify({ chartType, display, displayDecimals }),
    [chartType, display, displayDecimals],
  );
  const structuralSignatureRef = useRef('');

  useEffect(() => {
    previewCandlesRef.current = previewCandles;
  }, [previewCandles]);

  useEffect(() => {
    if (!webViewReady || !webViewRef.current) return;

    const lastSignature = getLastPreviewCandleSignature(previewCandles);
    const shouldInit = structuralSignatureRef.current !== structuralSignature;
    const anythingChanged = chartSignatureRef.current !== chartSignature;

    if (shouldInit) {
      webViewRef.current.injectJavaScript(
        `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedPreviewData)}, ${displayDecimals}, ${JSON.stringify(colors)}, ${JSON.stringify(display)}); true;`,
      );
      structuralSignatureRef.current = structuralSignature;
      chartSignatureRef.current = chartSignature;
      lastCandleLengthRef.current = previewCandles.length;
      lastRenderedCandleSignatureRef.current = lastSignature;
      return;
    }

    if (anythingChanged) {
      // Colors-only change — instant in-place recolor, no data payload.
      webViewRef.current.injectJavaScript(
        `if (typeof applyPreviewColors === 'function') applyPreviewColors(${JSON.stringify(chartOptions)}, ${JSON.stringify(colors)}); true;`,
      );
      chartSignatureRef.current = chartSignature;
    }

    if (
      lastCandleLengthRef.current !== previewCandles.length ||
      lastRenderedCandleSignatureRef.current !== lastSignature
    ) {
      webViewRef.current.injectJavaScript(
        `updateChartData(${JSON.stringify(mappedPreviewData)}); true;`,
      );
      lastCandleLengthRef.current = previewCandles.length;
      lastRenderedCandleSignatureRef.current = lastSignature;
    }
  }, [
    webViewReady,
    previewCandles,
    mappedPreviewData,
    chartOptions,
    chartSignature,
    structuralSignature,
    colors,
    display,
    chartType,
    displayDecimals,
  ]);

  // Main-chart parity: the live price line carries the direction-colored axis
  // label ("price highlight"), coloured up/down by the latest tick move.
  const lastPreviewLinePriceRef = useRef<number | null>(null);
  const lastPreviewLineDirectionRef = useRef<'up' | 'down'>('up');

  useEffect(() => {
    if (!webViewReady || !webViewRef.current) return;
    const lines: Array<{ price: number; color: string; lineWidth: number; lineStyle: number; axisLabelVisible: boolean; title: string }> = [];
    const shouldShowSelectedPriceLine =
      display.showLivePriceLine || display.showBidPriceLine || display.showAskPriceLine;
    const selectedPrice = priceSource === 'bid' ? liveQuote?.bid : liveQuote?.ask;

    if (shouldShowSelectedPriceLine && typeof selectedPrice === 'number' && selectedPrice > 0) {
      const previousPrice = lastPreviewLinePriceRef.current;
      if (previousPrice !== null && selectedPrice !== previousPrice) {
        lastPreviewLineDirectionRef.current = selectedPrice > previousPrice ? 'up' : 'down';
      }
      lastPreviewLinePriceRef.current = selectedPrice;
      const liveColor = lastPreviewLineDirectionRef.current === 'up'
        ? (colors.candlesUptrend || '#2962FF')
        : (colors.candlesDowntrend || '#EF5350');
      lines.push({
        price: selectedPrice,
        color: liveColor,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: '',
      });
    }

    webViewRef.current.injectJavaScript(
      `if (typeof setPriceLines === 'function') setPriceLines(${JSON.stringify(lines)}); true;`,
    );
  }, [
    colors.candlesDowntrend,
    colors.candlesUptrend,
    display.showAskPriceLine,
    display.showBidPriceLine,
    display.showLivePriceLine,
    liveQuote?.ask,
    liveQuote?.bid,
    priceSource,
    webViewReady,
  ]);

  const colorsRef = useRef(colors);
  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  // Deliberately NOT keyed on colors: color edits recolor in place via
  // applyPreviewColors; this resync only replays data for candle/symbol moves.
  useEffect(() => {
    const resyncPreview = () => {
      if (!webViewRef.current || !webViewReady) return;
      const currentCandles = previewCandlesRef.current;
      webViewRef.current.injectJavaScript(
        `updateChartData(${JSON.stringify(mapPreviewCandles(currentCandles, chartType, colorsRef.current))}); true;`,
      );
      lastCandleLengthRef.current = currentCandles.length;
      lastRenderedCandleSignatureRef.current = getLastPreviewCandleSignature(currentCandles);
    };
    resyncPreview();
  }, [candles, symbol, timeframe, webViewReady, chartType]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WebView
        key={PREVIEW_DEV_SOURCE_KEY}
        ref={webViewRef}
        source={{ html: CH_HTML }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'READY' || data.type === 'CHART_READY') {
              setWebViewReady(true);
            }
          } catch (_error) {}
        }}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        cacheEnabled={!__DEV__}
        androidLayerType="hardware"
      />
    </View>
  );
}
