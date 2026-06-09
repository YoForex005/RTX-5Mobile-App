import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
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
import { useLiveCandles } from '../../../domain/candles/hooks/useLiveCandles';
import { ChartColorsConfig, ChartDisplaySettings } from '../../../state/userPreferences';
import { useInstrumentMeta } from '../../../query/instruments';
import { hasLiveQuoteFeedData, useMarketData } from '../../../query/websocket';
import {
  buildVolumeDatum,
  getLastPreviewCandleSignature,
  mapPreviewCandles,
  PreviewChartType,
  sanitizePreviewCandles,
} from './chartPreviewShared';
import {
  buildRTX5CustomCandlestickSeriesOptions,
  createRTX5CustomCandlestickPaneView,
} from '../../../domain/candles/rendering/customCandlestickSeries';
import { resolveChartDisplayDecimals } from '../chartPricePrecision';

const getSafePreviewDimensions = (width: number, height: number) => ({
  width: Math.max(1, Math.floor(width)),
  height: Math.max(1, Math.floor(height)),
});

export default function LiveChartPreviewWeb({
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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const lastVolumePointRef = useRef<{ time: number; value: number } | null>(null);
  const previewCandlesRef = useRef<ReturnType<typeof sanitizePreviewCandles>>([]);
  const lastCandleLengthRef = useRef(0);
  const lastRenderedCandleSignatureRef = useRef('');

  const { candles } = useLiveCandles(symbol, timeframe, active);
  const liveQuotes = useMarketData([symbol], active);
  const liveQuote = liveQuotes[symbol];
  const { data: instrumentMeta } = useInstrumentMeta(symbol, active);
  const liveQuoteDigitsSource = (liveQuote as { digitsSource?: string } | undefined)?.digitsSource;
  const hasLivePreviewQuote = hasLiveQuoteFeedData(liveQuote);

  const previewCandles = useMemo(
    () => sanitizePreviewCandles(candles).slice(-50),
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

  const chartOptions = useMemo(() => ({
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: display.showGrid ? colors.grid : 'transparent', style: LineStyle.SparseDotted },
      horzLines: { color: display.showGrid ? colors.grid : 'transparent', style: LineStyle.SparseDotted },
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

  useEffect(() => {
    previewCandlesRef.current = previewCandles;
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

    const shouldShowSelectedPriceLine = display.showBidPriceLine || display.showAskPriceLine;
    const selectedPrice = priceSource === 'bid' ? liveQuote?.bid : liveQuote?.ask;

    if (shouldShowSelectedPriceLine && typeof selectedPrice === 'number' && selectedPrice > 0) {
      try {
        const selectedLine = seriesRef.current.createPriceLine({
          price: selectedPrice,
          color: priceSource === 'bid' ? '#2962FF' : '#EF5350',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false,
          title: priceSource === 'bid' ? 'Bid' : 'Ask',
        });
        priceLinesRef.current.push(selectedLine);
      } catch (_error) {}
    }
  }, [display.showBidPriceLine, display.showAskPriceLine, liveQuote?.bid, liveQuote?.ask, priceSource]);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
