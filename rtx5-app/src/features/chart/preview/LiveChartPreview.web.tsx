import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  BarSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import { useLiveCandles } from '../../../hooks/useLiveCandles';
import { isStructurallyValidCandle } from '../../../domain/candles';
import { ChartColorsConfig, ChartDisplaySettings } from '../../../state/userPreferences';
import { useMarketData } from '../../../query/websocket';
import {
  buildVolumeDatum,
  getLastPreviewCandleSignature,
  getPreviewDisplayDecimals,
  mapPreviewCandles,
  PreviewChartType,
  sanitizePreviewCandles,
} from './chartPreviewShared';
import {
  buildRTX5CustomCandlestickSeriesOptions,
  createRTX5CustomCandlestickPaneView,
} from '../rendering/customCandlestickSeries';

const getSafePreviewDimensions = (width: number, height: number) => ({
  width: Math.max(1, Math.floor(width)),
  height: Math.max(1, Math.floor(height)),
});

type OhlcData = { o: number; h: number; l: number; c: number } | null;

export default function LiveChartPreviewWeb({
  symbol,
  timeframe,
  colors,
  display,
  isDark,
  chartType = 'candles',
}: {
  symbol: string;
  timeframe: string;
  colors: ChartColorsConfig;
  display: ChartDisplaySettings;
  isDark: boolean;
  chartType?: PreviewChartType;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const lastVolumePointRef = useRef<{ time: number; value: number } | null>(null);
  const previewCandlesRef = useRef<ReturnType<typeof sanitizePreviewCandles>>([]);
  const lastCandleLengthRef = useRef(0);
  const lastRenderedCandleSignatureRef = useRef('');

  const { candles } = useLiveCandles(symbol, timeframe);
  const liveQuotes = useMarketData([symbol]);
  const liveQuote = liveQuotes[symbol];
  const [ohlcData, setOhlcData] = useState<OhlcData>(null);

  const displayDecimals = getPreviewDisplayDecimals(symbol);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: display.showGrid ? colors.grid : 'transparent', style: LineStyle.Solid },
      horzLines: { color: display.showGrid ? colors.grid : 'transparent', style: LineStyle.Solid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: colors.foreground,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: colors.foreground,
      },
      horzLine: {
        color: colors.foreground,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: colors.foreground,
      },
    },
    timeScale: {
      borderColor: display.showGrid ? colors.grid : 'transparent',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 16,
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

  const previewCandles = useMemo(
    () => sanitizePreviewCandles(candles).slice(-50),
    [candles],
  );

  useEffect(() => {
    previewCandlesRef.current = previewCandles;
    if (previewCandles.length > 0) {
      const last = previewCandles[previewCandles.length - 1];
      setOhlcData({ o: last.open, h: last.high, l: last.low, c: last.close });
    }
  }, [previewCandles]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const chart = createChart(chartContainerRef.current, {
      ...chartOptions,
      ...getSafePreviewDimensions(rect.width, rect.height),
    } as any);
    chartRef.current = chart;

    const showLastPriceLine = !!display.showLastPriceLine;
    const priceFormatInfo = {
      type: 'price' as const,
      precision: displayDecimals,
      minMove: 1 / Math.pow(10, displayDecimals),
    };

    if (chartType === 'candles' || chartType === 'hollow') {
      seriesRef.current = chart.addCustomSeries(
        createRTX5CustomCandlestickPaneView(),
        buildRTX5CustomCandlestickSeriesOptions({
          bodyUpColor: chartType === 'hollow' ? colors.hollowBody : colors.candlesUptrend,
          bodyDownColor: colors.candlesDowntrend,
          borderUpColor: colors.candlesUptrend,
          borderDownColor: colors.candlesDowntrend,
          wickUpColor: colors.candlesUptrend,
          wickDownColor: colors.candlesDowntrend,
          lastValueVisible: true,
          priceLineVisible: showLastPriceLine,
          priceFormat: priceFormatInfo,
        }) as any,
      );
    } else if (chartType === 'bars') {
      seriesRef.current = chart.addSeries(BarSeries, {
        upColor: colors.barsUptrend,
        downColor: colors.barsDowntrend,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    } else {
      seriesRef.current = chart.addSeries(LineSeries, {
        color: colors.lineBody,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    }

    if (display.showTickVolumes || display.showRealVolumes) {
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        color: buildVolumeDatum(
          { time: 0, open: 0, close: 1, volume: 0 },
          colors,
        ).color,
        priceFormat: { type: 'volume' as any },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
      } as any);
      chart.priceScale('volume' as any).applyOptions({
        scaleMargins: { top: 0.84, bottom: 0.02 },
        visible: false,
      } as any);
    } else {
      volumeSeriesRef.current = null;
    }

    const handleResize = () => {
      if (!chartRef.current || !chartContainerRef.current) return;
      const nextRect = chartContainerRef.current.getBoundingClientRect();
      chartRef.current.applyOptions(getSafePreviewDimensions(nextRect.width, nextRect.height));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      priceLinesRef.current = [];
      lastVolumePointRef.current = null;
      volumeSeriesRef.current = null;
      seriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [chartType, chartOptions, colors, display, displayDecimals]);

  useEffect(() => {
    if (!seriesRef.current) return;

    const lastSignature = getLastPreviewCandleSignature(previewCandles);
    const mappedData = mapPreviewCandles(previewCandles, chartType, colors);

    seriesRef.current.setData(mappedData as any);

    if (volumeSeriesRef.current) {
      const volumeData = previewCandles.map((candle, index) =>
        buildVolumeDatum(candle, colors, index === previewCandles.length - 1),
      );
      volumeSeriesRef.current.setData(volumeData as any);
      lastVolumePointRef.current =
        volumeData.length > 0
          ? { time: volumeData[volumeData.length - 1].time, value: volumeData[volumeData.length - 1].value }
          : null;
    } else {
      lastVolumePointRef.current = null;
    }

    lastCandleLengthRef.current = previewCandles.length;
    lastRenderedCandleSignatureRef.current = lastSignature;

    if (chartRef.current && previewCandles.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [previewCandles, chartType, colors]);

  useEffect(() => {
    if (!seriesRef.current) return;

    priceLinesRef.current.forEach((priceLine) => {
      try { seriesRef.current?.removePriceLine(priceLine); } catch (_error) {}
    });
    priceLinesRef.current = [];

    if (display.showBidPriceLine && liveQuote?.bid) {
      try {
        const bidLine = seriesRef.current.createPriceLine({
          price: liveQuote.bid,
          color: '#2962FF',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Bid',
        });
        priceLinesRef.current.push(bidLine);
      } catch (_error) {}
    }

    if (display.showAskPriceLine && liveQuote?.ask) {
      try {
        const askLine = seriesRef.current.createPriceLine({
          price: liveQuote.ask,
          color: '#EF5350',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Ask',
        });
        priceLinesRef.current.push(askLine);
      } catch (_error) {}
    }
  }, [display.showBidPriceLine, display.showAskPriceLine, liveQuote?.bid, liveQuote?.ask]);

  useEffect(() => {
    const syncSeriesFromCandles = (sourceCandles: ReturnType<typeof sanitizePreviewCandles>) => {
      if (!seriesRef.current) return;

      const mappedData = mapPreviewCandles(sourceCandles, chartType, colors);
      seriesRef.current.setData(mappedData as any);

      if (volumeSeriesRef.current) {
        const volumeData = sourceCandles.map((candle, index) =>
          buildVolumeDatum(candle, colors, index === sourceCandles.length - 1),
        );
        volumeSeriesRef.current.setData(volumeData as any);
        lastVolumePointRef.current =
          volumeData.length > 0
            ? { time: volumeData[volumeData.length - 1].time, value: volumeData[volumeData.length - 1].value }
            : null;
      }

      lastCandleLengthRef.current = sourceCandles.length;
      lastRenderedCandleSignatureRef.current = getLastPreviewCandleSignature(sourceCandles);
    };

    syncSeriesFromCandles(previewCandlesRef.current);
  }, [candles, symbol, timeframe, chartType, colors]);

  const formatPrice = (value: number) => value.toFixed(displayDecimals);
  const isUp = ohlcData ? ohlcData.c >= ohlcData.o : true;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />

      {display.showTicker && (
        <Text style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, fontWeight: '700', opacity: 0.85, color: colors.foreground, pointerEvents: 'none' }}>
          {symbol.replace(/\//g, '')},{timeframe}
        </Text>
      )}

      {display.showOHLC && ohlcData && (
        <View style={[ohlcStyles.ohlcRow, { top: display.showTicker ? 20 : 6, left: 8 }]} pointerEvents="none">
          <Text style={[ohlcStyles.ohlcLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>O </Text>
          <Text style={[ohlcStyles.ohlcValue, { color: isUp ? colors.candlesUptrend : colors.candlesDowntrend }]}>{formatPrice(ohlcData.o)} </Text>
          <Text style={[ohlcStyles.ohlcLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>H </Text>
          <Text style={[ohlcStyles.ohlcValue, { color: isUp ? colors.candlesUptrend : colors.candlesDowntrend }]}>{formatPrice(ohlcData.h)} </Text>
          <Text style={[ohlcStyles.ohlcLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>L </Text>
          <Text style={[ohlcStyles.ohlcValue, { color: isUp ? colors.candlesUptrend : colors.candlesDowntrend }]}>{formatPrice(ohlcData.l)} </Text>
          <Text style={[ohlcStyles.ohlcLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>C </Text>
          <Text style={[ohlcStyles.ohlcValue, { color: isUp ? colors.candlesUptrend : colors.candlesDowntrend }]}>{formatPrice(ohlcData.c)}</Text>
        </View>
      )}

      {(display.showTickVolumes || display.showRealVolumes) && (
        <View style={{ position: 'absolute', bottom: 22, left: 8 }} pointerEvents="none">
          <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)' }}>
            {display.showTickVolumes ? 'Tick Vol' : 'Real Vol'}
          </Text>
        </View>
      )}
    </View>
  );
}

const ohlcStyles = StyleSheet.create({
  ohlcRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  ohlcLabel: {
    fontSize: 9,
    fontWeight: '600',
  },
  ohlcValue: {
    fontSize: 9,
    fontWeight: '700',
    marginRight: 3,
  },
});
