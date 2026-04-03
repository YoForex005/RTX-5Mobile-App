import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text } from 'react-native';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, BarSeries, LineSeries } from 'lightweight-charts';
import { useLiveCandles } from '../../../hooks/useLiveCandles';
import { ChartColorsConfig, ChartDisplaySettings } from '../../../state/userPreferences';
import { isStructurallyValidCandle, normalizeTimeframe } from '../../../domain/candles';

const getSafePreviewDimensions = (width: number, height: number) => ({
  width: Math.max(1, Math.floor(width)),
  height: Math.max(1, Math.floor(height)),
});

export default function LiveChartPreviewWeb({
  symbol, timeframe, colors, display, isDark, chartType = 'candles'
}: {
  symbol: string; timeframe: string; colors: ChartColorsConfig; display: ChartDisplaySettings; isDark: boolean; chartType?: 'candles' | 'bars' | 'line' | 'hollow';
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const { candles } = useLiveCandles(symbol, timeframe);

  const baseSymbol = symbol.replace(/[a-z_.-].*$/, '');
  const displayDecimals = baseSymbol.includes('JPY') ? 3 : baseSymbol.includes('XAU') ? 2 : baseSymbol.includes('BTC') ? 2 : 5;

  const chartOptions = useMemo(() => ({
    layout: { background: { type: 'solid', color: colors.background }, textColor: colors.foreground, attributionLogo: false, fontSize: 11 },
    grid: { vertLines: { color: display.showGrid ? colors.grid : 'transparent' }, horzLines: { color: display.showGrid ? colors.grid : 'transparent' } },
    crosshair: { mode: 0, vertLine: { color: isDark ? '#475569' : '#94A3B8', style: 2 }, horzLine: { color: isDark ? '#475569' : '#94A3B8', style: 2 } },
    timeScale: { borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', timeVisible: true },
    rightPriceScale: { borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
  }), [colors, display, isDark]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const chart = createChart(chartContainerRef.current, {
      ...chartOptions,
      ...getSafePreviewDimensions(rect.width, rect.height),
    } as any);
    chartRef.current = chart;

    let series: ISeriesApi<any>;
    const priceFormatInfo = { type: 'price' as const, precision: displayDecimals, minMove: 1 / Math.pow(10, displayDecimals) };
    const showLastPriceLine = !!display.showLastPriceLine;

    if (chartType === 'candles' || chartType === 'hollow') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: chartType === 'hollow' ? (colors as any).hollowBody || 'transparent' : colors.candlesUptrend,
        downColor: colors.candlesDowntrend,
        wickUpColor: colors.candlesUptrend,
        wickDownColor: colors.candlesDowntrend,
        borderUpColor: colors.candlesUptrend,
        borderDownColor: colors.candlesDowntrend,
        borderVisible: true,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    } else if (chartType === 'bars') {
      series = chart.addSeries(BarSeries, {
        upColor: colors.barsUptrend,
        downColor: colors.barsDowntrend,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: colors.lineBody,
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    }

    seriesRef.current = series;

    try {
      const sanitized = candles.filter((c) => isStructurallyValidCandle(c));
      const uniqueData = Array.from(new Map(sanitized.map((item) => [item.time, item])).values()).sort((a, b) => a.time - b.time).slice(-50);
      if (chartType === 'line') {
        series.setData(uniqueData.map(d => ({ time: d.time, value: d.close })));
      } else {
        series.setData(uniqueData);
      }
      chart.timeScale().fitContent();
    } catch (e) {}

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartType, colors, display, displayDecimals]);

  useEffect(() => {
    let rAF: number | null = null;
    const pendingEvents: any[] = [];
    const flushEvents = () => {
      rAF = null;
      if (!seriesRef.current || pendingEvents.length === 0) return;
      const events = [...pendingEvents];
      pendingEvents.length = 0;
      for (const event of events) {
        if (event.type === 'resync_required' || event.type === 'full_sync') continue;
        const candle = event.candle;
        if (!isStructurallyValidCandle(candle)) continue;
        try {
          if (chartType === 'line') {
            seriesRef.current.update({ time: candle.time, value: candle.close } as any);
          } else {
            seriesRef.current.update(candle as any);
          }
        } catch(e) {}
      }
    };

    const handleStreamEvent = (event: any) => {
      if (event.symbol.toUpperCase() !== symbol.toUpperCase()) return;
      if (normalizeTimeframe(event.tf) !== normalizeTimeframe(timeframe)) return;
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
  }, [symbol, timeframe, chartType]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      {display.showTicker && (
        <Text style={{ position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: '600', opacity: 0.9, color: colors.foreground, pointerEvents: 'none' }}>
          {symbol.replace(/\//g, '')},{timeframe}: Live Asset
        </Text>
      )}
    </View>
  );
}
