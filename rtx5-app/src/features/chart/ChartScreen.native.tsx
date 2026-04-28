/**
 * Core Charting Interface for iOS/Android
 * 
 * This component provides high-performance charting for mobile devices using a WebView bridge.
 * It strictly decouples heavy data crunching from the React Native JS thread.
 * 
 * Key Architecture:
 * - WebView Bridge: Injects tradingview lightweight-charts HTML/JS into an isolated web view context.
 * - Zero-Latency Streams: Pipes WebSocket ticks directly into the WebView using injectJavaScript() and requestAnimationFrame, 
 *   bypassing the React Native bridge's slow JSON serialization.
 * - Micro-Components: Extracts fast-updating UI (like the live price pill) into memoized blocks isolated from the main layout.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Dimensions, Image, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import {
  ChartTapRadialMenu,
  type ChartTapMenuAnchor,
  type ChartTapMenuBounds,
} from './components/ChartTapRadialMenu';
import {
  ChartDrawingToolbarButton,
  ChartDrawingToolsSidebar,
} from './components/ChartDrawingToolsFeature';
import { createDrawingToolsActionSheetActions } from './drawingTools';
import {
  ChartFixedHorizontalGridOverlay,
  type FixedHorizontalGridPlotArea,
} from './components/ChartFixedHorizontalGridOverlay';
import {
  ChartToolbarMoreButton,
  ChartToolbarObjectsButton,
} from './components/ChartToolbarMenuFeature';
import {
  ChartTradeInlineFooter,
  ChartTradeOverlayLayer,
} from './components/ChartTradeFeature';
import { ChartTradeButtons } from './components/ChartTradeButtonsFeature';
import { LiveOrderTickExecutionGraph } from '../trade/OrderTickExecutionGraph';
import { Screen } from '../../components/Screen';
import { AppHeader } from '../../components/AppHeader';
import { useTranslation } from '../../i18n/useTranslation';
import {
  type ChartTradeVolumeDisplayMode,
  resolveChartColorsForTheme,
  useUserPreferences,
} from '../../state/userPreferences';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useLiveCandles, useLiveTick } from '../../hooks/useLiveCandles';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useOrdersByLoginQuery, usePlaceOrderMutation } from '../../query/orders';
import { classifyTradingError } from '../../api/tradingErrors';
import { TradeFeedbackModal, TradeFeedbackState, TRADE_MODAL_INITIAL } from '../../ui/components/TradeFeedbackModal';

import { usePositionsState } from '../../state/positionsState';
import { usePositionHistoryQuery } from '../../query/positions';
import { useAlertsQuery } from '../../query/alerts';
import { resolveTradingLogin as resolveTradingLoginUtil } from '../../state/tradingLogin';
import { TradingSignalDetailsModal } from './TradingSignalDetailsModal';
import { useMarketSymbols } from '../../query/market';
import { useAccountSummary } from '../../query/account';
import { useInstrumentMeta } from '../../query/instruments';
import { WebView } from 'react-native-webview';
import { useMarketData } from '../../query/websocket';
import { ENHANCED_DRAWING_TOOLS_JS } from './plugins/enhancedDrawingToolsString';
import { normalizeTimeframe } from '../../domain/candles';
import { normalizeSymbol } from '../../domain/symbols';
import { RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS } from './rendering/customCandlestickSeriesWebView';
import { LIGHTWEIGHT_CHARTS_JS } from './rendering/lightweightChartsBundle';
import { buildChartOverlayPayload, CHART_LINE_STYLE, type ChartOverlayPriceLine } from './chartOverlays';
import {
  getChartDrawingBucketKey,
  sanitizePersistedChartDrawings,
} from './drawingPersistence';
import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  getChartSeriesUpdateMode,
} from './liveChartSync';
import { useShallow } from 'zustand/shallow';
import { recordUiFeedGap, traceUiInteraction } from '../../dev/uiInteractionDiagnostics';
import { getDevRefreshKey, hashDevRefreshSource } from '../../dev/devRefreshKey';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import {
  formatTradeVolume,
  incrementTradeVolume,
  normalizeTradeVolume,
  resolveTradeVolumeBounds,
  sanitizeTradeVolumeDraft,
  type TradeVolumeBounds,
} from '../../utils/tradeVolume';
import {
  filterCandlesForChartTimeRange,
  getChartTimeRangeLabel,
  resolveChartVisibleRange,
  type ChartTimeRange,
} from './timeRangePresets';
import {
  CHART_ORDER_TYPES,
  getChartOrderSide,
  isPendingChartOrderType,
  isPendingChartTradeValid,
  isStopLimitChartOrderType,
  resolveStablePendingChartTradeEnabled,
  resolveDefaultStopLimitPrice,
  type ChartOrderType,
} from './chartTradeOrderUtils';
import {
  buildFooterLotPickerQuickAdjustments,
  buildFooterLotPickerValues,
  type FooterLotPickerMode,
  resolveChartTradeSheetHeaderLift,
  resolveChartTradeSheetMaxHeight,
  resolveChartTradeSheetHostHeight,
  resolveFooterLotCommitDraft as resolveFooterLotCommitDraftValue,
  resolveKeyboardDockOffset,
  resolveKeyboardResizesHost,
  resolveFooterTradeRowState,
  shouldSuppressChartTapMenu,
  shouldHideChartTabBarForTradeInput,
  shouldShowChartTradePreviewOnChart,
  shouldShowChartTradeSheetHeader,
} from './chartTradeInteractionUtils';
import { prefetchInstrument } from '../../utils/navigationPrefetch';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];
type ChartTradeTypeTabLayout = { x: number; width: number };
type ChartTradePreviewDragKey = NonNullable<ChartOverlayPriceLine['dragKey']>;
type TextInputCommitEvent = { nativeEvent: { text: string } };
const CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET = 16;
const CHART_DEFAULT_TIME_SCALE_BAR_SPACING = 13;
const CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING = 3;
const CHART_DEFAULT_RESET_BAR_SPACING_MIN = 8;
const CHART_DEFAULT_RESET_BAR_SPACING_MAX = 14;
const CHART_DEFAULT_VISIBLE_BAR_TARGET_PX = 12;
const CHART_DEFAULT_VISIBLE_BAR_MIN = 26;
const CHART_DEFAULT_VISIBLE_BAR_MAX = 56;
const CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS = 450;

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clampOverlayOffset = (value: number, containerSize: number, overlaySize: number) => {
  'worklet';
  return clampValue(
    value,
    CHART_TAP_MENU_PADDING,
    Math.max(CHART_TAP_MENU_PADDING, containerSize - overlaySize - CHART_TAP_MENU_PADDING),
  );
};

const CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT = 58;
const CHART_TRADE_SHEET_TOP_GAP = 10;
const FOOTER_LOT_PICKER_VALUE_ITEM_WIDTH = 64;

const formatLooseTradeVolumeLabel = (value: number, bounds?: TradeVolumeBounds) => {
  const { decimals } = resolveTradeVolumeBounds(bounds);
  return Number(value.toFixed(decimals)).toString();
};

function resolveMaxTradeVolumeForMargin(
  freeMargin: number,
  marginPerLot: number,
  bounds?: TradeVolumeBounds,
) {
  const resolved = resolveTradeVolumeBounds(bounds);
  if (!Number.isFinite(freeMargin) || freeMargin <= 0 || !Number.isFinite(marginPerLot) || marginPerLot <= 0) {
    return 0;
  }

  const rawMaxVolume = Math.min(resolved.maxVolume, freeMargin / marginPerLot);
  if (rawMaxVolume < resolved.minVolume) {
    return 0;
  }

  const steppedMaxVolume =
    resolved.minVolume +
    Math.floor((rawMaxVolume - resolved.minVolume) / resolved.stepVolume + 1e-9) * resolved.stepVolume;

  return Math.max(
    0,
    Math.min(
      resolved.maxVolume,
      Number(steppedMaxVolume.toFixed(resolved.decimals)),
    ),
  );
}

const getChartTradeContractSize = (symbol: string) => {
  const normalized = normalizeSymbol(symbol);
  if (normalized.includes('XAU') || normalized.includes('XAG')) return 100;
  if (normalized.includes('BTC') || normalized.includes('ETH')) return 1;
  if (normalized.includes('US30') || normalized.includes('SPX') || normalized.includes('NAS') || normalized.includes('GER') || normalized.includes('UK')) return 10;
  return 100000;
};

const resolveTradeStopPreviewPrice = (
  kind: 'sl' | 'tp',
  entryPrice: number,
  side: 'buy' | 'sell',
  offset: number,
  roundPrice: (value: number) => number,
) => {
  const direction = side === 'buy' ? 1 : -1;
  const signedOffset = kind === 'tp' ? offset * direction : -offset * direction;
  return roundPrice(entryPrice + signedOffset);
};

// Micro-component: isolated 4fps render cycle, 0 DOM depth
// Uses quotes WS (bid/ask) as primary price source and falls back to candle close.
const LivePriceHeader = React.memo(({ symbol, styles, displayDecimals, priceSource }: any) => {
  const latestTick = useLiveTick(symbol);
  const liveQuotes = useMarketData([symbol]);
  const q = liveQuotes[symbol] || {};

  const selectedQuote =
    priceSource === 'ask'
      ? (typeof q.ask === 'number' && q.ask > 0 ? q.ask : null)
      : (typeof q.bid === 'number' && q.bid > 0 ? q.bid : null);
  const candleClose = latestTick && typeof latestTick.close === 'number' && latestTick.close > 0 ? latestTick.close : null;
  const currentPrice = selectedQuote ?? candleClose;

  if (currentPrice === null) {
    return (
      <View style={styles.priceSection}>
        <Text style={[styles.livePriceText, { fontWeight: '700', opacity: 0.9 }]}>---</Text>
      </View>
    );
  }

  const changePct = typeof q.changePct === 'number' ? q.changePct : 0;
  const change = currentPrice * (changePct / 100);
  const isUp = changePct >= 0;

  return (
    <View style={styles.priceSection}>
      <Text style={[styles.symbolText, { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: -1, opacity: 0.9 }]}>PRICE</Text>
      <Text style={styles.livePriceText} numberOfLines={1} adjustsFontSizeToFit>
        {currentPrice.toFixed(displayDecimals)}
      </Text>
      <Text
        style={[styles.priceChangeText, { color: isUp ? '#089981' : '#F23645' }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {change > 0 ? '+' : ''}
        {(change || 0).toFixed(displayDecimals)} ({changePct > 0 ? '+' : ''}
        {(changePct || 0).toFixed(2)}%)
      </Text>
    </View>
  );
});

const LiveQuotePairHeader = React.memo(({ bid, ask, changePct, styles, displayDecimals }: any) => {
  const tone = typeof changePct === 'number' && changePct >= 0 ? '#089981' : '#F23645';
  const hasBid = Number.isFinite(bid) && bid > 0;
  const hasAsk = Number.isFinite(ask) && ask > 0;

  return (
    <View style={styles.quoteSection}>
      <View style={styles.quoteRow}>
        <Text
          style={[styles.quoteValueText, !hasBid && styles.quoteValuePlaceholder, hasBid && { color: tone }]}
          numberOfLines={1}
        >
          {hasBid ? bid.toFixed(displayDecimals) : '---'}
        </Text>
        <Text
          style={[styles.quoteValueText, !hasAsk && styles.quoteValuePlaceholder, hasAsk && { color: tone }]}
          numberOfLines={1}
        >
          {hasAsk ? ask.toFixed(displayDecimals) : '---'}
        </Text>
      </View>
    </View>
  );
});

const CHART_TRADE_MINI_PREVIEW_HEIGHT = 316;
const CHART_TRADE_MINI_PREVIEW_AXIS_WIDTH = 72;
const CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT = 22;
const CHART_TRADE_MINI_PREVIEW_TAG_WIDTH = 68;
const CHART_TRADE_MINI_PREVIEW_LEFT_PAD = 0;
const CHART_TRADE_MINI_PREVIEW_TOP_PAD = 14;
const CHART_TRADE_MINI_PREVIEW_BOTTOM_PAD = 16;

const PendingOrderPreviewChart = React.memo(({
  styles,
  candles,
  bid,
  ask,
  entryPrice,
  entryLabel,
  stopLimitPriceEnabled,
  stopLimitPrice,
  stopLossEnabled,
  stopLossPrice,
  takeProfitEnabled,
  takeProfitPrice,
  displayDecimals,
  buyColor,
  sellColor,
}: any) => {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const pointSize = useMemo(() => Math.pow(10, -Math.max(displayDecimals, 0)), [displayDecimals]);

  const previewCandles = useMemo(
    () =>
      Array.isArray(candles)
        ? candles
            .filter(
              (candle: any) =>
                candle &&
                Number.isFinite(candle.open) &&
                Number.isFinite(candle.high) &&
                Number.isFinite(candle.low) &&
                Number.isFinite(candle.close),
            )
            .slice(-28)
        : [],
    [candles],
  );

  const range = useMemo(() => {
    const values: number[] = [];
    previewCandles.forEach((candle: any) => {
      values.push(candle.high, candle.low);
    });
    if (Number.isFinite(bid) && bid > 0) values.push(bid);
    if (Number.isFinite(ask) && ask > 0) values.push(ask);
    if (Number.isFinite(entryPrice) && entryPrice > 0) values.push(entryPrice);
    if (stopLimitPriceEnabled && Number.isFinite(stopLimitPrice) && stopLimitPrice > 0) values.push(stopLimitPrice);
    if (stopLossEnabled && Number.isFinite(stopLossPrice) && stopLossPrice > 0) values.push(stopLossPrice);
    if (takeProfitEnabled && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) values.push(takeProfitPrice);

    if (values.length === 0) {
      return { min: 0, max: pointSize * 16 };
    }

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawSpan = Math.max(rawMax - rawMin, pointSize * 12);
    const padding = Math.max(rawSpan * 0.18, pointSize * 10);

    return {
      min: rawMin - padding,
      max: rawMax + padding,
    };
  }, [
    ask,
    bid,
    entryPrice,
    pointSize,
    previewCandles,
    stopLimitPrice,
    stopLimitPriceEnabled,
    stopLossEnabled,
    stopLossPrice,
    takeProfitEnabled,
    takeProfitPrice,
  ]);

  const plotWidth = Math.max(100, layoutWidth - CHART_TRADE_MINI_PREVIEW_AXIS_WIDTH - CHART_TRADE_MINI_PREVIEW_LEFT_PAD - 6);
  const plotRight = CHART_TRADE_MINI_PREVIEW_LEFT_PAD + plotWidth;
  const plotHeight = CHART_TRADE_MINI_PREVIEW_HEIGHT - CHART_TRADE_MINI_PREVIEW_TOP_PAD - CHART_TRADE_MINI_PREVIEW_BOTTOM_PAD;
  const valueSpan = Math.max(range.max - range.min, pointSize * 12);
  const tagX = Math.max(
    CHART_TRADE_MINI_PREVIEW_LEFT_PAD + 8,
    layoutWidth - CHART_TRADE_MINI_PREVIEW_TAG_WIDTH - 2,
  );

  const yForPrice = useCallback(
    (price: number) => {
      if (!Number.isFinite(price)) {
        return CHART_TRADE_MINI_PREVIEW_TOP_PAD + plotHeight / 2;
      }
      return CHART_TRADE_MINI_PREVIEW_TOP_PAD + ((range.max - price) / valueSpan) * plotHeight;
    },
    [plotHeight, range.max, valueSpan],
  );

  const guideLines = useMemo(
    () => Array.from({ length: 8 }, (_, index) => range.max - (valueSpan * index) / 7),
    [range.max, valueSpan],
  );

  const effectiveSpread = useMemo(() => {
    if (Number.isFinite(ask) && Number.isFinite(bid) && ask > bid) {
      return ask - bid;
    }
    return Math.max(pointSize * 10, pointSize * 2);
  }, [ask, bid, pointSize]);

  const priceLines = useMemo(() => {
    const lines: Array<{
      key: string;
      price: number;
      stroke: string;
      tagFill: string;
      textColor: string;
      dashed?: boolean;
      lineWidth?: number;
      showMarker?: boolean;
      helperLabel?: string;
    }> = [];

    if (Number.isFinite(entryPrice) && entryPrice > 0) {
      lines.push({
        key: 'entry',
        price: entryPrice,
        stroke: '#8A8F98',
        tagFill: '#2B2F36',
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        showMarker: true,
        helperLabel: typeof entryLabel === 'string' && entryLabel.trim() ? entryLabel.trim() : 'Price',
      });
    }

    if (stopLimitPriceEnabled && Number.isFinite(stopLimitPrice) && stopLimitPrice > 0) {
      lines.push({
        key: 'stop-limit',
        price: stopLimitPrice,
        stroke: '#2563EB',
        tagFill: '#2563EB',
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        helperLabel: 'Stop Limit',
      });
    }

    if (stopLossEnabled && Number.isFinite(stopLossPrice) && stopLossPrice > 0) {
      lines.push({
        key: 'sl',
        price: stopLossPrice,
        stroke: '#F97316',
        tagFill: '#F97316',
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        helperLabel: 'SL',
      });
    }

    if (takeProfitEnabled && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) {
      lines.push({
        key: 'tp',
        price: takeProfitPrice,
        stroke: '#22C55E',
        tagFill: '#22C55E',
        textColor: '#FFFFFF',
        dashed: true,
        lineWidth: 1,
        helperLabel: 'TP',
      });
    }

    if (Number.isFinite(ask) && ask > 0) {
      lines.push({
        key: 'ask',
        price: ask,
        stroke: sellColor,
        tagFill: sellColor,
        textColor: '#FFFFFF',
        lineWidth: 1.5,
      });
    }

    if (Number.isFinite(bid) && bid > 0) {
      lines.push({
        key: 'bid',
        price: bid,
        stroke: buyColor,
        tagFill: buyColor,
        textColor: '#FFFFFF',
        lineWidth: 1.5,
      });
    }

    return lines;
  }, [
    ask,
    bid,
    buyColor,
    entryLabel,
    entryPrice,
    sellColor,
    stopLimitPrice,
    stopLimitPriceEnabled,
    stopLossEnabled,
    stopLossPrice,
    takeProfitEnabled,
    takeProfitPrice,
  ]);

  const tagTops = useMemo(() => {
    if (layoutWidth <= 0 || priceLines.length === 0) {
      return new Map<string, number>();
    }

    const topLimit = CHART_TRADE_MINI_PREVIEW_TOP_PAD;
    const bottomLimit = CHART_TRADE_MINI_PREVIEW_TOP_PAD + plotHeight - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT;
    const minGap = CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT + 3;
    const positions = priceLines
      .map((line) => ({
        key: line.key,
        top: clampValue(
          yForPrice(line.price) - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT / 2,
          topLimit,
          bottomLimit,
        ),
      }))
      .sort((left, right) => left.top - right.top);

    for (let index = 1; index < positions.length; index += 1) {
      positions[index].top = Math.max(positions[index].top, positions[index - 1].top + minGap);
    }

    if (positions.length > 0 && positions[positions.length - 1].top > bottomLimit) {
      positions[positions.length - 1].top = bottomLimit;
      for (let index = positions.length - 2; index >= 0; index -= 1) {
        positions[index].top = Math.min(positions[index].top, positions[index + 1].top - minGap);
      }
    }

    return new Map(
      positions.map((position) => [
        position.key,
        clampValue(position.top, topLimit, bottomLimit),
      ]),
    );
  }, [layoutWidth, plotHeight, priceLines, yForPrice]);

  const previewTracePoints = useMemo(() => {
    const history = previewCandles.slice(-10);
    if (layoutWidth <= 0 || history.length === 0) {
      return { ask: '', bid: '' };
    }

    const traceWidth = Math.max(56, plotWidth * 0.17);
    const denom = Math.max(1, history.length - 1);

    const askPoints = history
      .map((candle: any, index: number) => {
        const x = CHART_TRADE_MINI_PREVIEW_LEFT_PAD + (traceWidth * index) / denom;
        const derivedAsk =
          index === history.length - 1 && Number.isFinite(ask) && ask > 0
            ? ask
            : candle.close + effectiveSpread / 2;
        return `${x},${yForPrice(derivedAsk)}`;
      })
      .join(' ');

    const bidPoints = history
      .map((candle: any, index: number) => {
        const x = CHART_TRADE_MINI_PREVIEW_LEFT_PAD + (traceWidth * index) / denom;
        const derivedBid =
          index === history.length - 1 && Number.isFinite(bid) && bid > 0
            ? bid
            : candle.close - effectiveSpread / 2;
        return `${x},${yForPrice(derivedBid)}`;
      })
      .join(' ');

    return { ask: askPoints, bid: bidPoints };
  }, [ask, bid, effectiveSpread, layoutWidth, plotWidth, previewCandles, yForPrice]);

  const markerX = CHART_TRADE_MINI_PREVIEW_LEFT_PAD + plotWidth * 0.48;

  return (
    <View
      style={styles.chartTradeMiniPreview}
      onLayout={(event) => {
        const nextWidth = Math.max(0, Math.floor(event.nativeEvent.layout.width));
        if (nextWidth !== layoutWidth) {
          setLayoutWidth(nextWidth);
        }
      }}
    >
      {layoutWidth > 0 ? (
        <Svg width={layoutWidth} height={CHART_TRADE_MINI_PREVIEW_HEIGHT}>
          {guideLines.map((price, index) => {
            const y = yForPrice(price);
            return (
              <G key={`guide-${index}`}>
                <Line
                  x1={CHART_TRADE_MINI_PREVIEW_LEFT_PAD}
                  y1={y}
                  x2={layoutWidth - 2}
                  y2={y}
                  stroke="#E2E7EE"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />
                <SvgText
                  x={layoutWidth - 6}
                  y={Math.min(CHART_TRADE_MINI_PREVIEW_HEIGHT - 6, Math.max(12, y + 5))}
                  fill="#5E6673"
                  fontSize="11"
                  textAnchor="end"
                >
                  {price.toFixed(displayDecimals)}
                </SvgText>
              </G>
            );
          })}

          {previewTracePoints.ask ? (
            <Polyline
              points={previewTracePoints.ask}
              fill="none"
              stroke={sellColor}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {previewTracePoints.bid ? (
            <Polyline
              points={previewTracePoints.bid}
              fill="none"
              stroke={buyColor}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {priceLines.map((line) => {
            const y = yForPrice(line.price);
            const tagTop = tagTops.get(line.key) ?? clampValue(
              y - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT / 2,
              CHART_TRADE_MINI_PREVIEW_TOP_PAD,
              CHART_TRADE_MINI_PREVIEW_TOP_PAD + plotHeight - CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT,
            );

            return (
              <G key={line.key}>
                <Line
                  x1={CHART_TRADE_MINI_PREVIEW_LEFT_PAD}
                  y1={y}
                  x2={tagX + 4}
                  y2={y}
                  stroke={line.stroke}
                  strokeWidth={line.lineWidth ?? 1}
                  strokeDasharray={line.dashed ? '4 4' : undefined}
                />
                {line.helperLabel ? (
                  <SvgText
                    x={CHART_TRADE_MINI_PREVIEW_LEFT_PAD + 4}
                    y={Math.max(14, y - 8)}
                    fill="#4B5563"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {line.helperLabel}
                  </SvgText>
                ) : null}
                {line.showMarker ? (
                  <Circle
                    cx={markerX}
                    cy={y}
                    r={6}
                    fill="#4B5563"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                ) : null}
                <Rect
                  x={tagX}
                  y={tagTop}
                  width={CHART_TRADE_MINI_PREVIEW_TAG_WIDTH}
                  height={CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT}
                  rx={4}
                  fill={line.tagFill}
                />
                <SvgText
                  x={tagX + CHART_TRADE_MINI_PREVIEW_TAG_WIDTH / 2}
                  y={tagTop + 14.5}
                  fill={line.textColor}
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {line.price.toFixed(displayDecimals)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
});

// Micro-component: isolated 1fps render cycle for the clock
const LiveClock = React.memo(({ styles }: any) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      const offsetMinutes = now.getTimezoneOffset();
      const offsetHoursAbs = Math.floor(Math.abs(offsetMinutes) / 60);
      const offsetMinsAbs = Math.abs(offsetMinutes) % 60;
      const sign = offsetMinutes > 0 ? '-' : '+';
      // Edge case: exactly UTC is just UTC
      const offsetStr = offsetMinutes === 0 ? 'UTC' : `UTC${sign}${offsetHoursAbs}:${String(offsetMinsAbs).padStart(2, '0')}`;

      setTimeStr(`${hh}:${mm}:${ss} (${offsetStr})`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text style={[styles.tvRangeAutoText, { transform: [{ translateX: -20 }] }]} numberOfLines={1} adjustsFontSizeToFit>
      {timeStr}
    </Text>
  );
});

type ChartTapMenuViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CHART_TAP_MENU_PADDING = 10;
const CHART_META_DEFAULT_LEFT = 12;
const CHART_META_DEFAULT_TOP = 10;
const CHART_META_FALLBACK_WIDTH = 196;
const CHART_META_FALLBACK_HEIGHT = 34;
const CHART_TRADE_SLIDER_THUMB_SIZE = 20;

function ChartStepperModal({
  visible,
  title,
  initial,
  step,
  decimals,
  min,
  max,
  styles,
  onClose,
  onCommit,
}: {
  visible: boolean;
  title: string;
  initial: number;
  step: number;
  decimals: number;
  min?: number;
  max?: number;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onCommit: (next: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = React.useState(initial);
  React.useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  const clamp = React.useCallback(
    (v: number) => {
      let out = v;
      if (typeof min === 'number') out = Math.max(min, out);
      if (typeof max === 'number') out = Math.min(max, out);
      return Number(out.toFixed(Math.max(decimals, 0)));
    },
    [decimals, max, min],
  );

  const bump = React.useCallback(
    (dir: -1 | 1) => setValue((v) => clamp(v + dir * step)),
    [clamp, step],
  );

  if (!visible) return null;
  const prev = clamp(value - step);
  const next = clamp(value + step);

  return (
    <Modal
      transparent
      visible
      animationType='fade'
      {...OVERLAY_MODAL_PROPS}
      onRequestClose={onClose}
    >
      <View style={styles.stepperModalLayer}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.stepperModalCard}>
          {title ? <Text style={styles.stepperModalTitle}>{title}</Text> : null}
          <View style={styles.stepperModalBody}>
            <Pressable style={styles.stepperModalMinus} onPress={() => bump(-1)} hitSlop={10}>
              <Text style={styles.stepperModalMinusText}>−</Text>
            </Pressable>
            <View style={styles.stepperModalStack}>
              <Text style={styles.stepperModalGhost}>{prev.toFixed(decimals)}</Text>
              <View style={styles.stepperModalDivider} />
              <Text style={styles.stepperModalMain}>{value.toFixed(decimals)}</Text>
              <View style={styles.stepperModalDivider} />
              <Text style={styles.stepperModalGhost}>{next.toFixed(decimals)}</Text>
            </View>
            <Pressable style={styles.stepperModalPlus} onPress={() => bump(1)} hitSlop={10}>
              <Text style={styles.stepperModalPlusText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.stepperModalActions}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.stepperModalCancel}>{t('Cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onCommit(value);
                onClose();
              }}
              hitSlop={8}
            >
              <Text style={styles.stepperModalOk}>{t('OK')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChartFooterLotPicker({
  visible,
  mode,
  value,
  bounds,
  bottomOffset,
  styles,
  onClose,
  onSelect,
}: {
  visible: boolean;
  mode: FooterLotPickerMode;
  value: number;
  bounds?: TradeVolumeBounds;
  bottomOffset: number;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onSelect: (next: number) => void;
}) {
  const screenWidth = Dimensions.get('window').width;
  const valueScrollRef = React.useRef<ScrollView>(null);
  const [activeRangeMultiplier, setActiveRangeMultiplier] = React.useState<number | null>(null);
  const resolved = React.useMemo(() => resolveTradeVolumeBounds(bounds), [bounds]);
  const quickAdjustments = React.useMemo(
    () => buildFooterLotPickerQuickAdjustments(value, mode, bounds),
    [bounds, mode, value],
  );
  const defaultRangeMultiplier = quickAdjustments[0]?.multiplier ?? 1;
  const selectedRangeMultiplier = mode === 'absolute'
    ? undefined
    : activeRangeMultiplier ?? defaultRangeMultiplier;
  const valueOptions = React.useMemo(
    () => buildFooterLotPickerValues(value, mode, bounds, selectedRangeMultiplier),
    [bounds, mode, selectedRangeMultiplier, value],
  );
  const normalizedValue = normalizeTradeVolume(value, bounds);
  const selectionEpsilon = resolved.stepVolume / 1000;
  const activeValueStartIndex = mode === 'absolute'
    ? 0
    : Math.max(0, valueOptions.findIndex((option) => option.multiplier > (selectedRangeMultiplier ?? 0)));

  React.useEffect(() => {
    setActiveRangeMultiplier(null);
  }, [bounds, mode, value, visible]);

  React.useEffect(() => {
    if (!visible || mode === 'absolute' || activeValueStartIndex < 0) {
      return;
    }
    requestAnimationFrame(() => {
      valueScrollRef.current?.scrollTo({
        x: activeValueStartIndex * FOOTER_LOT_PICKER_VALUE_ITEM_WIDTH,
        animated: true,
      });
    });
  }, [activeValueStartIndex, mode, selectedRangeMultiplier, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.footerLotPickerLayer}>
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: Math.max(0, bottomOffset - 8),
        }}
        onPress={onClose}
      />
      <View
        style={[
          styles.footerLotPickerCard,
          {
            bottom: bottomOffset,
            width: Math.max(220, Math.min(screenWidth - 40, 320)),
          },
        ]}
      >
        <View style={styles.footerLotPickerQuickRow}>
          {quickAdjustments.map((option) => {
            const active = mode !== 'absolute' && option.multiplier === selectedRangeMultiplier;
            return (
              <Pressable
                key={option.key}
                style={[styles.footerLotPickerQuickButton, active && styles.footerLotPickerQuickButtonActive]}
                onPress={() => {
                  if (mode === 'absolute') {
                    onSelect(option.nextValue);
                    return;
                  }
                  setActiveRangeMultiplier(option.multiplier);
                }}
                hitSlop={6}
              >
                <Text style={[styles.footerLotPickerQuickText, active && styles.footerLotPickerQuickTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView
          ref={valueScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.footerLotPickerValuesScroll}
          contentContainerStyle={styles.footerLotPickerValuesContent}
          keyboardShouldPersistTaps="handled"
        >
          {valueOptions.map((option) => {
            const active = mode === 'absolute' && Math.abs(option.value - normalizedValue) <= selectionEpsilon;
            const isRangeBoundary = mode !== 'absolute' && typeof option.rangeMultiplier === 'number';
            return (
              <Pressable
                key={option.key}
                style={[
                  styles.footerLotPickerValueButton,
                  styles.footerLotPickerValueButtonHorizontal,
                  active && styles.footerLotPickerValueButtonActive,
                  isRangeBoundary && styles.footerLotPickerValueButtonRange,
                ]}
                onPress={() => {
                  if (isRangeBoundary && typeof option.rangeMultiplier === 'number') {
                    setActiveRangeMultiplier(option.rangeMultiplier);
                    return;
                  }
                  onSelect(option.value);
                }}
                hitSlop={6}
              >
                <Text
                  style={[
                    styles.footerLotPickerValueText,
                    active && styles.footerLotPickerValueTextActive,
                    isRangeBoundary && styles.footerLotPickerValueTextRange,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function ChartTradeVolumeSlider({
  styles,
  value,
  bounds,
  onChange,
}: {
  styles: ReturnType<typeof makeStyles>;
  value: number;
  bounds: { minVolume?: number | null; maxVolume?: number | null; stepVolume?: number | null };
  onChange: (next: number) => void;
}) {
  const resolved = React.useMemo(() => resolveTradeVolumeBounds(bounds), [bounds]);
  const { minVolume, maxVolume } = resolved;
  const resolvedRef = React.useRef(resolved);
  React.useEffect(() => {
    resolvedRef.current = resolved;
  }, [resolved]);

  const [trackWidth, setTrackWidth] = React.useState(0);
  const trackWidthRef = React.useRef(0);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const range = Math.max(maxVolume - minVolume, resolved.stepVolume);
  const clampedValue = Math.min(maxVolume, Math.max(minVolume, value));
  const progress = (clampedValue - minVolume) / range;
  const thumbRadius = CHART_TRADE_SLIDER_THUMB_SIZE / 2;
  const usableWidth = Math.max(0, trackWidth - CHART_TRADE_SLIDER_THUMB_SIZE);
  const thumbCenterX = thumbRadius + progress * usableWidth;

  const applyFromX = React.useCallback((x: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) return;
    const usable = Math.max(1, width - CHART_TRADE_SLIDER_THUMB_SIZE);
    const ratio = Math.min(1, Math.max(0, (x - CHART_TRADE_SLIDER_THUMB_SIZE / 2) / usable));
    const r = resolvedRef.current;
    const raw = r.minVolume + ratio * (r.maxVolume - r.minVolume);
    onChangeRef.current(normalizeTradeVolume(raw, {
      minVolume: r.minVolume,
      maxVolume: r.maxVolume,
      stepVolume: r.stepVolume,
    }));
  }, []);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => applyFromX(evt.nativeEvent.locationX),
        onPanResponderMove: (evt) => applyFromX(evt.nativeEvent.locationX),
        onPanResponderRelease: (evt) => applyFromX(evt.nativeEvent.locationX),
        onPanResponderTerminationRequest: () => false,
      }),
    [applyFromX],
  );

  return (
    <View
      style={styles.chartTradeSliderTouch}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        trackWidthRef.current = w;
        setTrackWidth(w);
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.chartTradeSliderTrack}>
        <View style={[styles.chartTradeSliderFill, { width: thumbCenterX }]} />
      </View>
      <View
        style={[
          styles.chartTradeSliderThumb,
          { left: thumbCenterX - thumbRadius },
        ]}
      />
    </View>
  );
}

function DraggableChartMetaOverlay({
  visible,
  bounds,
  viewport,
  items,
  isUp,
  upColor,
  downColor,
  styles,
}: {
  visible: boolean;
  bounds: ChartTapMenuBounds;
  viewport: ChartTapMenuViewport;
  items: Array<{ label: string; value: string }>;
  isUp: boolean;
  upColor: string;
  downColor: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [cardSize, setCardSize] = React.useState({
    width: CHART_META_FALLBACK_WIDTH,
    height: CHART_META_FALLBACK_HEIGHT,
  });
  const [position, setPosition] = React.useState({
    left: CHART_META_DEFAULT_LEFT,
    top: CHART_META_DEFAULT_TOP,
  });
  const dragOriginRef = React.useRef(position);
  const containerWidth = bounds.width > 0 ? bounds.width : viewport.width;
  const containerHeight = bounds.height > 0 ? bounds.height : viewport.height;

  const resolveCardPosition = React.useCallback(
    (left: number, top: number) => ({
      left: clampOverlayOffset(left, containerWidth, cardSize.width),
      top: clampOverlayOffset(top, containerHeight, cardSize.height),
    }),
    [cardSize.height, cardSize.width, containerHeight, containerWidth],
  );

  const applyCardPosition = React.useCallback(
    (left: number, top: number) => {
      const nextPosition = resolveCardPosition(left, top);
      setPosition(nextPosition);
      return nextPosition;
    },
    [resolveCardPosition],
  );

  React.useEffect(() => {
    setPosition((current) => resolveCardPosition(current.left, current.top));
  }, [resolveCardPosition]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          dragOriginRef.current = position;
        },
        onPanResponderMove: (_event, gestureState) => {
          applyCardPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
          );
        },
        onPanResponderRelease: (_event, gestureState) => {
          applyCardPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
          );
        },
        onPanResponderTerminate: (_event, gestureState) => {
          applyCardPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
          );
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [applyCardPosition, position],
  );

  if (!visible) {
    return null;
  }

  return (
    <View
      collapsable={false}
      pointerEvents="box-only"
      renderToHardwareTextureAndroid
      needsOffscreenAlphaCompositing
      style={[
        styles.chartMetaOverlay,
        {
          top: position.top,
          left: position.left,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View
        style={styles.chartMetaOhlc}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCardSize((current) =>
            current.width === width && current.height === height
              ? current
              : { width, height },
          );
        }}
      >
        {items.map((item) => (
          <View key={item.label} style={styles.chartMetaPair}>
            <Text style={styles.chartMetaLabel}>{item.label}</Text>
            <Text style={[styles.chartMetaValue, { color: isUp ? upColor : downColor }]}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const CHART_SYMBOLS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'NZDUSD', 'USDCAD', 'EURGBP', 'AUDCAD', 'AUDCHF', 'AUDJPY', 'XAUUSD', 'BTCUSD'];

const SYMBOL_FLAGS: Record<string, [string, string]> = {
  EURUSD: ['eu', 'us'], GBPUSD: ['gb', 'us'], AUDUSD: ['au', 'us'],
  USDJPY: ['us', 'jp'], NZDUSD: ['nz', 'us'], USDCAD: ['us', 'ca'],
  EURGBP: ['eu', 'gb'], AUDCAD: ['au', 'ca'], AUDCHF: ['au', 'ch'],
  AUDJPY: ['au', 'jp'],
};

const SYMBOL_LOGOS: Record<string, string> = {
  BTCUSD: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  XAUUSD: 'https://assets.coingecko.com/coins/images/10481/small/tether-gold.png',
};

const SYMBOL_NAMES: Record<string, string> = {
  EURUSD: 'Euro / US Dollar', GBPUSD: 'British Pound / USD',
  AUDUSD: 'Australian Dollar / USD', USDJPY: 'US Dollar / Japanese Yen',
  NZDUSD: 'New Zealand Dollar / USD', USDCAD: 'US Dollar / Canadian Dollar',
  EURGBP: 'Euro / British Pound', AUDCAD: 'Australian / Canadian Dollar',
  AUDCHF: 'Australian / Swiss Franc', AUDJPY: 'Australian / Japanese Yen',
  XAUUSD: 'Gold / US Dollar', BTCUSD: 'Bitcoin / US Dollar',
};

const SYMBOL_CATEGORY: Record<string, string> = {
  XAUUSD: 'METAL', BTCUSD: 'CRYPTO',
};

const CH_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <meta name="color-scheme" content="light dark">
    <script>${LIGHTWEIGHT_CHARTS_JS}</script>
    <script>${RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS}</script>
    <script>${ENHANCED_DRAWING_TOOLS_JS}</script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #chart { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script>
      // ─────────────────────────────────────────────────────────────────
      //   Minimal, fresh candle pipeline
      //
      //   Contract with the React Native host:
      //     • host calls initChart(opts, chartType, candles, displayDecimals)
      //         once per (symbol, timeframe, type) change
      //     • host calls updateChartData(candles) whenever the canonical
      //         history+live candle array changes
      //     • host may still call updateTick(candle) for narrow live patches,
      //         but the chart no longer depends on a second websocket delta
      //         bridge to stay in sync
      //     • host calls setBidPriceLine(price) for the live BID line
      //
      //   Native candlesticks use the RTX5 custom series so wick/body
      //   geometry stays centered and stable on mobile WebView pixel grids.
      //   Line and OHLC bars still use the standard lightweight-charts
      //   series implementations. Pre-existing gaps in the data stay visible.
      // ─────────────────────────────────────────────────────────────────
      // Diagnostic: verify library loaded
      if (typeof LightweightCharts === 'undefined') {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: 'FATAL: LightweightCharts library did not load. typeof=' + typeof LightweightCharts
          }));
        } catch(_) {}
      }

      var chart = null;
      var series = null;
      var bidPriceLine = null;
      var askPriceLine = null;
      var marketPriceLinesVisible = false;
      var marketBidColor = '#2962FF';
      var marketAskColor = '#F23645';
      // Dedicated horizontal line at the live close. We own this instance
      // so we can retint it blue (up candle) / red (down candle) and shift
      // its price on every tick WITHOUT calling applyOptions on the main
      // candle series (which internally forces a full data redraw and was
      // causing history to blank on bucket updates).
      var directionPriceLine = null;
      // Same idea on the move-bars pane — horizontal line at the live bar's
      // move magnitude, tinted blue / red in lockstep with the candle.
      var moveDirectionPriceLine = null;
      var lastBarTime = 0;
      var seriesType = 'candles';
      var pendingTick = null;
      var tickFlushHandle = 0;
      var currentSeriesLength = 0;
      var lastDisplayDecimals = 2;
      var lastRawSeriesData = [];
      var shouldShowLowerPane = true;
      var lastInitHostOptions = null;
      var lastInitChartType = 'candles';
      var lastInitShowLowerPane = true;
      var lastRequestedDisplayDecimals = 2;
      var lastBidPrice = null;
      var lastAskPrice = null;
      // Price-movement histogram shown below the candles. Bar height equals
      // |close − open| for that bar (the magnitude of the candle's move),
      // coloured green when the candle closed up, red when it closed down.
      // It IS NOT traded volume — it's a direct visual echo of the candle's
      // own size, so the bar grows and shrinks in sync with the candle.
      var moveBarsSeries = null;
      var moveUpColor = 'rgba(38,166,154,0.85)';
      var moveDownColor = 'rgba(239,83,80,0.85)';
      // Captured from the active candle series so the bid line + last-price
      // line can tint themselves to match the live candle's direction.
      var barUpColor = '#2962FF';
      var barDownColor = '#ef5350';
      var detachChartTapListeners = null;
      var lastPostedChartTap = { x: NaN, y: NaN, at: 0 };
      var pendingPointerTap = null;
      var lastPriceLineDirection = null; // 'up' | 'down' — last colour applied
      var overlayRefreshRaf = 0;
      var overlayPriceScaleLockRaf = 0;
      var chartTouchInteractionSuspendDepth = 0;
      var lastPostedChartTouchActive = false;
      var OVERLAY_LABEL_LINE_HEIGHT = 14;
      var OVERLAY_LABEL_HEIGHT = 18;
      var OVERLAY_LABEL_GAP = 4;
      var OVERLAY_LABEL_LINE_GAP = 1;
      var OVERLAY_LABEL_TOP_SAFE_PADDING = 42;
      var OVERLAY_LABEL_BOTTOM_SAFE_PADDING = 10;
      var MARKET_PRICE_BADGE_HEIGHT = 20;
      var MARKET_PRICE_BADGE_MIN_GAP = 4;
      var MARKET_PRICE_BADGE_RIGHT_INSET = 4;

      function getRightPriceScaleApi() {
        return chart && typeof chart.priceScale === 'function'
          ? chart.priceScale('right')
          : null;
      }

      function resolvePrimaryPaneMetrics() {
        var chartElement = document.getElementById('chart');
        var paneSize = chart && typeof chart.paneSize === 'function' ? chart.paneSize(0) : null;
        var timeScaleApi =
          chart && typeof chart.timeScale === 'function'
            ? chart.timeScale()
            : null;
        var rightPriceScaleApi = getRightPriceScaleApi();
        var leftPriceScaleApi =
          chart && typeof chart.priceScale === 'function'
            ? chart.priceScale('left')
            : null;
        var rightAxisWidth =
          rightPriceScaleApi && typeof rightPriceScaleApi.width === 'function'
            ? rightPriceScaleApi.width()
            : 0;
        var leftAxisWidth =
          leftPriceScaleApi && typeof leftPriceScaleApi.width === 'function'
            ? leftPriceScaleApi.width()
            : 0;
        var timeScaleHeight =
          timeScaleApi && typeof timeScaleApi.height === 'function'
            ? timeScaleApi.height()
            : 0;
        var paneWidth =
          paneSize && typeof paneSize.width === 'number' && isFinite(paneSize.width) && paneSize.width > 0
            ? paneSize.width
            : Math.max(
                0,
                (chartElement && chartElement.clientWidth ? chartElement.clientWidth : 0) - leftAxisWidth - rightAxisWidth
              );
        var paneHeight =
          paneSize && typeof paneSize.height === 'number' && isFinite(paneSize.height) && paneSize.height > 0
            ? paneSize.height
            : Math.max(
                0,
                (chartElement && chartElement.clientHeight ? chartElement.clientHeight : 0) - timeScaleHeight
              );
        var priceScaleOptions =
          rightPriceScaleApi && typeof rightPriceScaleApi.options === 'function'
            ? rightPriceScaleApi.options()
            : null;
        var scaleMargins = priceScaleOptions && priceScaleOptions.scaleMargins
          ? priceScaleOptions.scaleMargins
          : null;
        var topMargin = scaleMargins && typeof scaleMargins.top === 'number' && isFinite(scaleMargins.top)
          ? Math.max(0, Math.min(0.95, scaleMargins.top))
          : 0;
        var bottomMargin = scaleMargins && typeof scaleMargins.bottom === 'number' && isFinite(scaleMargins.bottom)
          ? Math.max(0, Math.min(0.95, scaleMargins.bottom))
          : 0;
        var plotTop = Math.max(0, Math.round(paneHeight * topMargin));
        var plotBottom = Math.max(plotTop + 1, Math.round(paneHeight * (1 - bottomMargin)));

        return {
          chartHeight: chartElement && chartElement.clientHeight ? chartElement.clientHeight : paneHeight + timeScaleHeight,
          leftAxisWidth: leftAxisWidth,
          paneWidth: paneWidth,
          paneHeight: paneHeight,
          plotTop: plotTop,
          plotHeight: Math.max(0, plotBottom - plotTop),
        };
      }

      function lockVisiblePriceScaleRange(forceAutoScale, attempt) {
        try {
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi) return;
          if (forceAutoScale !== false && typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(true);
          }
          var visibleRange =
            typeof priceScaleApi.getVisibleRange === 'function'
              ? priceScaleApi.getVisibleRange()
              : null;
          var hasValidRange =
            visibleRange &&
            typeof visibleRange.from === 'number' &&
            typeof visibleRange.to === 'number' &&
            isFinite(visibleRange.from) &&
            isFinite(visibleRange.to) &&
            visibleRange.from !== visibleRange.to;

          if (!hasValidRange) {
            if ((attempt || 0) < 3) {
              requestAnimationFrame(function() {
                lockVisiblePriceScaleRange(forceAutoScale, (attempt || 0) + 1);
              });
            }
            return;
          }

          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(false);
          }
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            priceScaleApi.setVisibleRange(visibleRange);
          }
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
      }

      function scheduleOverlayPriceScaleLock(forceAutoScale) {
        if (overlayPriceScaleLockRaf) {
          cancelAnimationFrame(overlayPriceScaleLockRaf);
        }
        overlayPriceScaleLockRaf = requestAnimationFrame(function() {
          overlayPriceScaleLockRaf = 0;
          lockVisiblePriceScaleRange(forceAutoScale, 0);
        });
      }

      function postReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
        } catch (_e) {}
      }

      function postChartReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHART_READY' }));
        } catch (_e) {}
      }

      function postChartGeometry() {
        if (!chart) {
          return;
        }
        try {
          var metrics = resolvePrimaryPaneMetrics();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_GEOMETRY',
            plotArea: {
              left: metrics.leftAxisWidth,
              top: metrics.plotTop,
              width: metrics.paneWidth,
              height: metrics.plotHeight,
            },
          }));
        } catch (_e) {}
      }

      function postChartTap(x, y, price) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TAP',
            x: x,
            y: y,
            price: typeof price === 'number' && isFinite(price) ? price : null,
          }));
        } catch (_e) {}
      }

      function postChartTouchState(active) {
        var nextActive = !!active;
        if (lastPostedChartTouchActive === nextActive) {
          return;
        }
        lastPostedChartTouchActive = nextActive;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TOUCH_STATE',
            active: nextActive,
          }));
        } catch (_e) {}
      }

      function resolveChartTouchInteractionOptions(enabled) {
        var handleScroll = cloneSerializableValue(
          (lastInitHostOptions && lastInitHostOptions.handleScroll) || {},
          {}
        );
        var handleScale = cloneSerializableValue(
          (lastInitHostOptions && lastInitHostOptions.handleScale) || {},
          {}
        );

        if (!enabled) {
          handleScroll.mouseWheel = false;
          handleScroll.pressedMouseMove = false;
          handleScroll.horzTouchDrag = false;
          handleScroll.vertTouchDrag = false;
          handleScale.mouseWheel = false;
          handleScale.pinch = false;
          handleScale.axisPressedMouseMove = false;
        }

        return {
          handleScroll: handleScroll,
          handleScale: handleScale,
        };
      }

      function applyChartTouchInteractionState(enabled) {
        if (!chart || typeof chart.applyOptions !== 'function') {
          return;
        }
        try {
          chart.applyOptions(resolveChartTouchInteractionOptions(enabled));
        } catch (_e) {}
      }

      function suspendChartTouchInteractions() {
        chartTouchInteractionSuspendDepth += 1;
        if (chartTouchInteractionSuspendDepth === 1) {
          applyChartTouchInteractionState(false);
        }
      }

      function restoreChartTouchInteractions() {
        if (chartTouchInteractionSuspendDepth <= 0) {
          chartTouchInteractionSuspendDepth = 0;
          applyChartTouchInteractionState(true);
          return;
        }
        chartTouchInteractionSuspendDepth -= 1;
        if (chartTouchInteractionSuspendDepth === 0) {
          applyChartTouchInteractionState(true);
        }
      }

      function postDistinctChartTap(x, y, price) {
        if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
          return;
        }
        var now = Date.now();
        if (
          isFinite(lastPostedChartTap.x) &&
          isFinite(lastPostedChartTap.y) &&
          Math.abs(lastPostedChartTap.x - x) <= 8 &&
          Math.abs(lastPostedChartTap.y - y) <= 8 &&
          now - lastPostedChartTap.at <= 250
        ) {
          return;
        }
        lastPostedChartTap = { x: x, y: y, at: now };
        postChartTap(x, y, price);
      }

      function emitChartTapAtPoint(x, y) {
        if (!series || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
          return;
        }
        var price = null;
        if (typeof series.coordinateToPrice === 'function') {
          var nextPrice = series.coordinateToPrice(y);
          if (typeof nextPrice === 'number' && isFinite(nextPrice)) {
            price = nextPrice;
          }
        }
        postDistinctChartTap(x, y, price);
      }

      function scheduleOverlayDomRefresh() {
        if (overlayRefreshRaf) {
          return;
        }
        overlayRefreshRaf = requestAnimationFrame(function() {
          overlayRefreshRaf = 0;
          refreshOverlayDomLabels(_overlayPayload);
        });
      }

      function bindChartTapListeners(el) {
        if (!el) return;
        if (typeof detachChartTapListeners === 'function') {
          try { detachChartTapListeners(); } catch (_e) {}
        }

        var getClientPoint = function(event) {
          if (!event) return null;
          if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            return { x: event.clientX, y: event.clientY };
          }
          var touch =
            (event.changedTouches && event.changedTouches[0]) ||
            (event.touches && event.touches[0]);
          if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
            return { x: touch.clientX, y: touch.clientY };
          }
          return null;
        };

        var getRelativePoint = function(clientX, clientY) {
          var rect = el.getBoundingClientRect();
          var x = clientX - rect.left;
          var y = clientY - rect.top;
          if (!isFinite(x) || !isFinite(y)) return null;
          if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
          return { x: x, y: y };
        };

        var stopChartEvent = function(event) {
          if (!event) return;
          if (typeof event.preventDefault === 'function') {
            event.preventDefault();
          }
          if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
        };

        // ── Vertical candle panning state ──
        // When the user drags vertically on the chart area, we disable
        // auto-scale and shift the visible price range. This makes the
        // candles move up/down while the chart container stays fixed.
        var vertPanState = null; // { startY, startRange: {from, to} }
        var VERT_PAN_THRESHOLD = 6; // px before we commit to a vertical pan
        var vertPanPending = null; // { startX, startY } — waiting for threshold
        var lastDoubleTapAt = 0;

        var beginVerticalPan = function(clientY) {
          if (!chart || !series) return false;
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi || typeof priceScaleApi.getVisibleRange !== 'function') return false;
          var range = priceScaleApi.getVisibleRange();
          if (!range || !isFinite(range.from) || !isFinite(range.to) || range.from === range.to) return false;
          vertPanState = {
            startY: clientY,
            startRange: { from: range.from, to: range.to },
          };
          // Disable auto-scale so our manual range adjustments stick.
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(false);
          }
          return true;
        };

        var continueVerticalPan = function(clientY) {
          if (!vertPanState || !chart || !series) return;
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi || typeof priceScaleApi.setVisibleRange !== 'function') return;
          // Calculate how much the finger moved in pixels.
          var deltaPixels = clientY - vertPanState.startY;
          // Convert pixel delta to price delta.
          // Dragging UP decreases the visible price range values, which moves
          // candles upward on screen. Dragging DOWN increases the visible
          // price range values, which moves candles downward on screen.
          var rangeSpan = vertPanState.startRange.to - vertPanState.startRange.from;
          var chartElement = document.getElementById('chart');
          var chartHeight = chartElement ? chartElement.clientHeight : window.innerHeight;
          if (chartHeight <= 0) return;
          var pricePerPixel = rangeSpan / chartHeight;
          var priceDelta = deltaPixels * pricePerPixel;
          priceScaleApi.setVisibleRange({
            from: vertPanState.startRange.from + priceDelta,
            to: vertPanState.startRange.to + priceDelta,
          });
          scheduleOverlayDomRefresh();
        };

        var endVerticalPan = function() {
          vertPanState = null;
          vertPanPending = null;
          scheduleOverlayDomRefresh();
        };

        var resetAutoScale = function() {
          var priceScaleApi = getRightPriceScaleApi();
          if (priceScaleApi && typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(true);
          }
          scheduleOverlayDomRefresh();
        };

        var beginTradeLineDrag = function(event) {
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) return false;
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) return false;
          var hit = pickDraggableOverlayLineAtY(point.y);
          if (!hit || !hit.dragKey) return false;
          var startPrice = roundOverlayDragPrice(hit.price);
          cancelChartTradeLineDragMove();
          activeTradeLineDrag = {
            dragKey: hit.dragKey,
            lastPrice: typeof startPrice === 'number' && isFinite(startPrice) ? startPrice : hit.price,
          };
          suspendChartTouchInteractions();
          pendingPointerTap = null;
          vertPanPending = null;
          suppressNextChartClickUntil = Date.now() + 350;
          updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, activeTradeLineDrag.lastPrice);
          postChartTradeLineDrag('start', activeTradeLineDrag.dragKey, activeTradeLineDrag.lastPrice);
          scheduleOverlayDomRefresh();
          stopChartEvent(event);
          return true;
        };

        var continueTradeLineDrag = function(event) {
          if (!activeTradeLineDrag) return false;
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) {
            stopChartEvent(event);
            return true;
          }
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point || !series || typeof series.coordinateToPrice !== 'function') {
            stopChartEvent(event);
            return true;
          }
          var nextPrice = roundOverlayDragPrice(series.coordinateToPrice(point.y));
          if (typeof nextPrice === 'number' && isFinite(nextPrice) && nextPrice > 0) {
            if (activeTradeLineDrag.lastPrice !== nextPrice) {
              activeTradeLineDrag.lastPrice = nextPrice;
              updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, nextPrice);
              scheduleChartTradeLineDragMove(activeTradeLineDrag.dragKey, nextPrice);
            } else {
              updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, nextPrice);
            }
          }
          scheduleOverlayDomRefresh();
          stopChartEvent(event);
          return true;
        };

        var finishTradeLineDrag = function(event, cancelled) {
          if (!activeTradeLineDrag) return false;
          var drag = activeTradeLineDrag;
          activeTradeLineDrag = null;
          restoreChartTouchInteractions();
          suppressNextChartClickUntil = Date.now() + 350;

          if (!cancelled) {
            var pointFromEvent = getClientPoint(event);
            var point = pointFromEvent ? getRelativePoint(pointFromEvent.x, pointFromEvent.y) : null;
            if (point && series && typeof series.coordinateToPrice === 'function') {
              var finalPrice = roundOverlayDragPrice(series.coordinateToPrice(point.y));
              if (typeof finalPrice === 'number' && isFinite(finalPrice) && finalPrice > 0) {
                drag.lastPrice = finalPrice;
                updateDraggedOverlayLinePreview(drag.dragKey, finalPrice);
              }
            }
          }

          cancelChartTradeLineDragMove();
          postChartTradeLineDrag('end', drag.dragKey, drag.lastPrice);
          pendingPointerTap = null;
          scheduleOverlayDomRefresh();
          stopChartEvent(event);
          return true;
        };

        var onPointerDown = function(event) {
          postChartTouchState(true);
          if (beginTradeLineDrag(event)) {
            return;
          }
          var point = getClientPoint(event);
          if (!point) return;
          // Check for double-tap to reset auto-scale
          var now = Date.now();
          if (now - lastDoubleTapAt < 350) {
            resetAutoScale();
            lastDoubleTapAt = 0;
            pendingPointerTap = null;
            vertPanPending = null;
            return;
          }
          lastDoubleTapAt = now;
          pendingPointerTap = {
            x: point.x,
            y: point.y,
            at: now,
          };
          // Start tracking for potential vertical pan
          vertPanPending = { startX: point.x, startY: point.y };
          scheduleOverlayDomRefresh();
        };

        var onPointerMove = function(event) {
          if (continueTradeLineDrag(event)) {
            return;
          }
          // Check if we should start or continue a vertical pan
          var point = getClientPoint(event);
          if (point && vertPanState) {
            // Already in a vertical pan — continue it
            continueVerticalPan(point.y);
            stopChartEvent(event);
            return;
          }
          if (point && vertPanPending && !vertPanState) {
            var dx = Math.abs(point.x - vertPanPending.startX);
            var dy = Math.abs(point.y - vertPanPending.startY);
            // If vertical movement exceeds threshold and is more than horizontal,
            // commit to a vertical pan (candle up/down movement).
            if (dy > VERT_PAN_THRESHOLD && dy > dx * 1.2) {
              pendingPointerTap = null;
              if (beginVerticalPan(vertPanPending.startY)) {
                continueVerticalPan(point.y);
                stopChartEvent(event);
                return;
              }
            }
          }
          scheduleOverlayDomRefresh();
        };

        var onPointerUp = function(event) {
          if (finishTradeLineDrag(event, false)) {
            postChartTouchState(false);
            return;
          }
          if (vertPanState) {
            endVerticalPan();
            postChartTouchState(false);
            return;
          }
          vertPanPending = null;
          if (!event || !pendingPointerTap) {
            postChartTouchState(false);
            return;
          }
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) {
            pendingPointerTap = null;
            postChartTouchState(false);
            return;
          }
          var elapsed = Date.now() - pendingPointerTap.at;
          var dx = pointFromEvent.x - pendingPointerTap.x;
          var dy = pointFromEvent.y - pendingPointerTap.y;
          pendingPointerTap = null;
          if (elapsed > 450 || Math.abs(dx) > 12 || Math.abs(dy) > 12) {
            postChartTouchState(false);
            return;
          }
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) {
            postChartTouchState(false);
            return;
          }
          scheduleOverlayDomRefresh();
          emitChartTapAtPoint(point.x, point.y);
          postChartTouchState(false);
        };

        var onPointerCancel = function(event) {
          if (finishTradeLineDrag(event, true)) {
            postChartTouchState(false);
            return;
          }
          if (vertPanState) {
            endVerticalPan();
            postChartTouchState(false);
            return;
          }
          vertPanPending = null;
          pendingPointerTap = null;
          scheduleOverlayDomRefresh();
          postChartTouchState(false);
        };

        var onClick = function(event) {
          if (Date.now() <= suppressNextChartClickUntil) {
            return;
          }
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) return;
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) return;
          scheduleOverlayDomRefresh();
          emitChartTapAtPoint(point.x, point.y);
        };

        var supportsPointerEvents = typeof window.PointerEvent === 'function';
        if (supportsPointerEvents) {
          el.addEventListener('pointerdown', onPointerDown, true);
          el.addEventListener('pointermove', onPointerMove, true);
          el.addEventListener('pointerup', onPointerUp, true);
          el.addEventListener('pointercancel', onPointerCancel, true);
        } else {
          el.addEventListener('touchstart', onPointerDown, true);
          el.addEventListener('touchmove', onPointerMove, true);
          el.addEventListener('touchend', onPointerUp, true);
          el.addEventListener('touchcancel', onPointerCancel, true);
        }
        el.addEventListener('click', onClick, true);
        detachChartTapListeners = function() {
          if (supportsPointerEvents) {
            el.removeEventListener('pointerdown', onPointerDown, true);
            el.removeEventListener('pointermove', onPointerMove, true);
            el.removeEventListener('pointerup', onPointerUp, true);
            el.removeEventListener('pointercancel', onPointerCancel, true);
          } else {
            el.removeEventListener('touchstart', onPointerDown, true);
            el.removeEventListener('touchmove', onPointerMove, true);
            el.removeEventListener('touchend', onPointerUp, true);
            el.removeEventListener('touchcancel', onPointerCancel, true);
          }
          el.removeEventListener('click', onClick, true);
          pendingPointerTap = null;
          activeTradeLineDrag = null;
          suppressNextChartClickUntil = 0;
          chartTouchInteractionSuspendDepth = 0;
          postChartTouchState(false);
        };
      }

      function postError(where, err) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: where + ': ' + (err && err.message ? err.message : String(err))
          }));
        } catch (_e) {}
      }

      function getChartViewportWidth() {
        try {
          var chartElement = document.getElementById('chart');
          if (chartElement && typeof chartElement.clientWidth === 'number' && chartElement.clientWidth > 0) {
            return chartElement.clientWidth;
          }
        } catch (_e) {}
        return typeof window.innerWidth === 'number' && isFinite(window.innerWidth) ? window.innerWidth : 0;
      }

      function getRecentVisibleBars(length) {
        if (typeof length !== 'number' || !isFinite(length) || length <= 0) return 0;
        var viewportWidth = getChartViewportWidth();
        if (!(viewportWidth > 0)) {
          return Math.min(
            Math.round(length),
            ${CHART_DEFAULT_VISIBLE_BAR_MAX},
          );
        }
        var usableWidth = Math.max(
          viewportWidth - 28,
          ${CHART_DEFAULT_VISIBLE_BAR_TARGET_PX},
        );
        var targetVisibleBars = Math.round(usableWidth / ${CHART_DEFAULT_VISIBLE_BAR_TARGET_PX});
        return Math.min(
          Math.round(length),
          Math.max(
            ${CHART_DEFAULT_VISIBLE_BAR_MIN},
            Math.min(${CHART_DEFAULT_VISIBLE_BAR_MAX}, targetVisibleBars),
          ),
        );
      }

      function resolveDefaultBarSpacing(lengthOverride) {
        var visibleBars = getRecentVisibleBars(lengthOverride);
        var viewportWidth = getChartViewportWidth();
        if (!(viewportWidth > 0) || !(visibleBars > 0)) {
          return ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
        }
        var usableWidth = Math.max(viewportWidth - 28, visibleBars);
        return Math.min(
          ${CHART_DEFAULT_RESET_BAR_SPACING_MAX},
          Math.max(
            ${CHART_DEFAULT_RESET_BAR_SPACING_MIN},
            usableWidth / visibleBars,
          ),
        );
      }

      function resetTimeScaleDefaults(lengthOverride) {
        try {
          if (!chart || !chart.timeScale || typeof chart.timeScale().applyOptions !== 'function') return;
          chart.timeScale().applyOptions({
            rightOffset: ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET},
            barSpacing: resolveDefaultBarSpacing(lengthOverride),
            minBarSpacing: ${CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING},
          });
        } catch (_e) {}
      }

      function applyRecentViewport(lengthOverride) {
        try {
          if (!chart || !chart.timeScale) return;
          var dataLength =
            (typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0)
              ? Math.round(lengthOverride)
              : currentSeriesLength;
          if (!(dataLength > 0)) return;
          resetTimeScaleDefaults(dataLength);
          if (typeof chart.timeScale().setVisibleLogicalRange === 'function') {
            var visibleBars = getRecentVisibleBars(dataLength);
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(-0.5, dataLength - visibleBars - 1),
              to: dataLength + 2,
            });
          } else {
            chart.timeScale().fitContent();
          }
          if (typeof chart.timeScale().scrollToRealTime === 'function') {
            chart.timeScale().scrollToRealTime();
          }
          scheduleOverlayPriceScaleLock(true);
          refreshOverlayDomLabels(_overlayPayload);
        } catch (_e) {}
      }

      window.__rtx5ApplyRecentViewport = applyRecentViewport;
      window.__rtx5ResetTimeScale = resetTimeScaleDefaults;
      window.__rtx5ResetPriceScale = function() {
        scheduleOverlayPriceScaleLock(true);
      };

      function makePriceFormat(displayDecimals) {
        var decimals = (typeof displayDecimals === 'number' && displayDecimals >= 0) ? displayDecimals : 2;
        return {
          type: 'price',
          precision: decimals,
          minMove: 1 / Math.pow(10, decimals)
        };
      }

      function resolveTickDateValue(value) {
        if (typeof value === 'string') {
          var trimmed = value.trim();
          if (!trimmed) {
            return null;
          }
          var numeric = Number(trimmed);
          if (isFinite(numeric)) {
            value = numeric;
          } else {
            var parsedStringDate = new Date(trimmed);
            return isFinite(parsedStringDate.getTime()) ? parsedStringDate : null;
          }
        }

        if (typeof value === 'number' && isFinite(value)) {
          var absValue = Math.abs(value);
          if (absValue > 4.2e16) {
            return new Date(Math.floor(value / 1000000));
          }
          if (absValue > 4.2e13) {
            return new Date(Math.floor(value / 1000));
          }
          if (absValue > 4.2e10) {
            return new Date(value);
          }
          return new Date(value * 1000);
        }

        return null;
      }

      function resolveTickDate(time) {
        var directDate = resolveTickDateValue(time);
        if (directDate) {
          return directDate;
        }

        if (time && typeof time === 'object') {
          var timestampDate = resolveTickDateValue(time.timestamp);
          if (timestampDate) {
            return timestampDate;
          }

          var timeDate = resolveTickDateValue(time.time);
          if (timeDate) {
            return timeDate;
          }

          if (
            typeof time.year === 'number' &&
            typeof time.month === 'number' &&
            typeof time.day === 'number'
          ) {
            return new Date(time.year, time.month - 1, time.day);
          }

          if (
            time.businessDay &&
            typeof time.businessDay === 'object' &&
            typeof time.businessDay.year === 'number' &&
            typeof time.businessDay.month === 'number' &&
            typeof time.businessDay.day === 'number'
          ) {
            return new Date(time.businessDay.year, time.businessDay.month - 1, time.businessDay.day);
          }
        }

        return null;
      }

      function formatChartTickMark(time, tickMarkType, _locale) {
        try {
          var date = resolveTickDate(time);
          if (!date || !isFinite(date.getTime())) {
            return null;
          }

          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var day = String(date.getDate()).padStart(2, '0');
          var month = months[date.getMonth()] || '';
          var hours = String(date.getHours()).padStart(2, '0');
          var minutes = String(date.getMinutes()).padStart(2, '0');

          if (tickMarkType === 3 || tickMarkType === 4) {
            return day + ' ' + month + ' ' + hours + ':' + minutes;
          }

          if (tickMarkType === 2) {
            return day + ' ' + month;
          }

          if (tickMarkType === 1) {
            return month + ' ' + String(date.getFullYear());
          }

          if (tickMarkType === 0) {
            return String(date.getFullYear());
          }

          return day + ' ' + month;
        } catch (_e) {
          return null;
        }
      }

      function applyChartLayout(opts) {
        // Flatten host-supplied opts (background may be { color }) into the
        // shape lightweight-charts expects.
        try {
          if (opts && opts.layout && opts.layout.background && typeof opts.layout.background.color === 'string') {
            opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          }
        } catch (_e) {}
        return opts || {};
      }

      function cloneSerializableValue(value, fallback) {
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (_e) {
          return fallback;
        }
      }

      function pickSeriesColors(opts, chartType) {
        var c = (opts && opts.customColors) || {};
        var up = c.candlesUptrend || '#2962FF';
        var down = c.candlesDowntrend || '#EF5350';
        var hollowBody = c.hollowBody || 'rgba(0,0,0,0)';
        if (chartType === 'hollow') {
          return { up: up, down: down, bodyUp: hollowBody, bodyDown: hollowBody };
        }
        return { up: up, down: down, bodyUp: up, bodyDown: down };
      }

      // Pending init args — stored so the ResizeObserver or rAF retry
      // can re-run chart creation if the container had zero dimensions
      // on the first attempt (common on Android light theme first load).
      var _pendingInit = null;

      function _doInitChart(opts, chartType, data, displayDecimals, showLowerPane) {
        var el = document.getElementById('chart');
        var w = el.clientWidth;
        var h = el.clientHeight;

        // If the container has zero dimensions, the browser hasn't laid out
        // the WebView yet. Defer to the next animation frame — the
        // ResizeObserver will also catch it as a fallback.
        if (w === 0 || h === 0) {
          _pendingInit = {
            opts: opts,
            chartType: chartType,
            data: data,
            displayDecimals: displayDecimals,
            showLowerPane: showLowerPane,
          };
          requestAnimationFrame(function() {
            if (_pendingInit) {
              _doInitChart(
                _pendingInit.opts,
                _pendingInit.chartType,
                _pendingInit.data,
                _pendingInit.displayDecimals,
                _pendingInit.showLowerPane
              );
            }
          });
          return;
        }
        _pendingInit = null;

        if (window._drawingManager) {
          try { window._drawingManager.remove(); } catch (_e) {}
          window._drawingManager = null;
        }
        chartTouchInteractionSuspendDepth = 0;
        lastPostedChartTouchActive = false;
        if (chart) {
          try { chart.remove(); } catch (_e) {}
          chart = null;
          series = null;
          moveBarsSeries = null;
          bidPriceLine = null;
          askPriceLine = null;
          marketPriceLinesVisible = false;
          directionPriceLine = null;
          moveDirectionPriceLine = null;
          _positionLinesArr = [];
        }
        if (_overlayLabelLayer && _overlayLabelLayer.parentNode) {
          try { _overlayLabelLayer.parentNode.removeChild(_overlayLabelLayer); } catch (_e) {}
          _overlayLabelLayer = null;
        }
        if (typeof detachChartTapListeners === 'function') {
          try { detachChartTapListeners(); } catch (_e) {}
          detachChartTapListeners = null;
        }
        if (tickFlushHandle) {
          try { cancelAnimationFrame(tickFlushHandle); } catch (_) {}
          tickFlushHandle = 0;
        }
        if (overlayPriceScaleLockRaf) {
          try { cancelAnimationFrame(overlayPriceScaleLockRaf); } catch (_) {}
          overlayPriceScaleLockRaf = 0;
        }
        pendingTick = null;
        lastBarTime = 0;
        _liveBar = null;
        _liveBarHasObservedRealtimeUpdate = false;
        seriesType = chartType || 'candles';
        shouldShowLowerPane = showLowerPane !== false;
        lastDisplayDecimals =
          typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
            ? displayDecimals
            : 2;
        lastRawSeriesData = Array.isArray(data) ? data.slice() : [];

        var safeOpts = applyChartLayout(opts);
        var customCols = safeOpts.customColors;
        if (safeOpts.customColors) { delete safeOpts.customColors; }
        if (!safeOpts.timeScale) {
          safeOpts.timeScale = {};
        }
        safeOpts.timeScale.tickMarkFormatter = formatChartTickMark;

        // Force explicit pixel dimensions so the chart never renders at 0x0
        safeOpts.width = w;
        safeOpts.height = h;

        chart = LightweightCharts.createChart(el, safeOpts);
        bindChartTapListeners(el);
        try {
          if (
            chart &&
            chart.timeScale &&
            typeof chart.timeScale === 'function' &&
            typeof chart.timeScale().subscribeVisibleLogicalRangeChange === 'function'
          ) {
            chart.timeScale().subscribeVisibleLogicalRangeChange(function() {
              refreshOverlayDomLabels(_overlayPayload);
            });
          }
        } catch (_overlayLabelSubErr) {}

        var priceFormat = makePriceFormat(displayDecimals);
        var colors = pickSeriesColors({ customColors: customCols }, seriesType);
        barUpColor = colors.up;
        barDownColor = colors.down;
        moveUpColor = hexToRgba(colors.up, 0.85);
        moveDownColor = hexToRgba(colors.down, 0.85);
        lastPriceLineDirection = null;
        setPrimaryPriceScaleMargins(shouldUseMoveBarsPane());

        // We render our own direction-coloured price line via
        // directionPriceLine (created post-data-load), so the series'
        // built-in last-price line is suppressed (priceLineVisible: false).
        // lastValueVisible: false removes its right-axis label too —
        // otherwise the axis showed two labels stacked at the same price.
        if (seriesType === 'line') {
          series = chart.addSeries(LightweightCharts.LineSeries, {
            color: (customCols && customCols.lineBody) || colors.up,
            lineWidth: 2,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          });
        } else if (seriesType === 'bars') {
          series = chart.addSeries(LightweightCharts.BarSeries, {
            upColor: (customCols && customCols.barsUptrend) || colors.up,
            downColor: (customCols && customCols.barsDowntrend) || colors.down,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          });
        } else {
          var customCandleOptions = {
            color: colors.up,
            bodyUpColor: colors.bodyUp,
            bodyDownColor: colors.bodyDown,
            borderUpColor: colors.up,
            borderDownColor: colors.down,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
            borderVisible: true,
            wickVisible: true,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          };
          if (
            typeof window.addRTX5CustomCandlestickSeries === 'function' &&
            typeof chart.addCustomSeries === 'function'
          ) {
            series = window.addRTX5CustomCandlestickSeries(chart, customCandleOptions);
          } else {
            series = chart.addSeries(LightweightCharts.CandlestickSeries, {
              upColor: colors.bodyUp,
              downColor: colors.bodyDown,
              borderUpColor: colors.up,
              borderDownColor: colors.down,
              wickUpColor: colors.up,
              wickDownColor: colors.down,
              borderVisible: true,
              wickVisible: true,
              priceFormat: priceFormat,
              lastValueVisible: false,
              priceLineVisible: false,
            });
          }
        }

        ensureMoveBarsSeries(lastDisplayDecimals);

        if (data && data.length > 0) {
          var mapped = mapForSeries(data);
          series.setData(mapped);
          currentSeriesLength = mapped.length;
          lastBarTime = mapped[mapped.length - 1].time;
          if (seriesType !== 'line') {
            var lastSeed = data[data.length - 1];
            _liveBar = {
              time: lastSeed.time,
              open: lastSeed.open,
              high: lastSeed.high,
              low: lastSeed.low,
              close: lastSeed.close,
            };
            _liveBarHasObservedRealtimeUpdate = false;
          }
          ensureMoveBarsSeries(lastDisplayDecimals);
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(data)); } catch (_mb) {}
          }
          applyRecentViewport(currentSeriesLength);
          scheduleOverlayPriceScaleLock(true);
          ensureDirectionPriceLine();
          ensureMoveDirectionPriceLine();
        }

        // Initialize the drawing tools manager — this wires up all
        // toolbar tools (trendline, fib, brush, text, pitchfork, etc.)
        // to real canvas-level drawing primitives via the enhanced bundle.
        try {
          if (typeof window.DrawingToolsManager === 'function') {
            window._drawingManager = new window.DrawingToolsManager(chart, series);
          }
        } catch (_dtErr) {}

        try {
          if (chart && typeof chart.subscribeClick === 'function') {
            chart.subscribeClick(function(param) {
              try {
                if (!param || !param.point) return;
                emitChartTapAtPoint(param.point.x, param.point.y);
              } catch (_tapErr) {}
            });
          }
        } catch (_chartTapErr) {}

        applyOverlayPayload(_overlayPayload);
        setMarketPriceLines(lastBidPrice, lastAskPrice);
        postChartGeometry();
        postChartReady();
      }

      function initChart(opts, chartType, data, displayDecimals, showLowerPane) {
        try {
          lastInitHostOptions = cloneSerializableValue(opts || {}, {});
          lastInitChartType = chartType || 'candles';
          lastInitShowLowerPane = showLowerPane !== false;
          if (typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0) {
            lastRequestedDisplayDecimals = displayDecimals;
          }

          // Set body/container background to match chart — prevents
          // white-on-white invisibility in light theme.
          try {
            var bg = (opts && opts.layout && opts.layout.background && opts.layout.background.color) || '#000';
            document.body.style.background = bg;
            document.getElementById('chart').style.background = bg;
          } catch(_) {}

          // Defer to requestAnimationFrame so the browser completes layout
          // before we measure the container. This is the core fix for the
          // "light theme first load" bug — on Android, the WebView container
          // has 0x0 dimensions until the first paint cycle completes.
          requestAnimationFrame(function() {
            try {
              _doInitChart(
                lastInitHostOptions,
                lastInitChartType,
                Array.isArray(data) ? data.slice() : [],
                lastRequestedDisplayDecimals,
                lastInitShowLowerPane
              );
            } catch(e) {
              postError('initChart', e);
            }
          });
        } catch (e) {
          postError('initChart', e);
        }
      }

      function resizeChartViewport(width, height) {
        try {
          var w = Math.round(Number(width));
          var h = Math.round(Number(height));
          if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;

          var chartElement = document.getElementById('chart');
          if (chartElement) {
            // Keep the host element container-fill based instead of pinning it
            // to one explicit pixel size. During fullscreen exit the native
            // viewport can report a transient intermediate layout; if the DOM
            // stays stuck on that width for even one frame, the right price
            // scale visibly shifts left before the final resize arrives.
            chartElement.style.width = '100%';
            chartElement.style.height = '100%';
          }

          if (_pendingInit) {
            _doInitChart(
              _pendingInit.opts,
              _pendingInit.chartType,
              _pendingInit.data,
              _pendingInit.displayDecimals,
              _pendingInit.showLowerPane
            );
            return;
          }

          if (chart) {
            chart.resize(w, h);
            ensureMoveBarsSeries(lastDisplayDecimals);
            refreshOverlayDomLabels(_overlayPayload);
            postChartGeometry();
          }
        } catch (e) {
          postError('resizeChartViewport', e);
        }
      }

      function recoverChartSurface(width, height) {
        try {
          var chartElement = document.getElementById('chart');
          if (!chartElement) return;

          chartElement.style.width = '100%';
          chartElement.style.height = '100%';

          var w = Math.round(Number(width));
          var h = Math.round(Number(height));

          if (!isFinite(w) || w <= 0) {
            w = chartElement.clientWidth;
          }
          if (!isFinite(h) || h <= 0) {
            h = chartElement.clientHeight;
          }
          if (w <= 0 || h <= 0) return;

          if (_pendingInit) {
            _doInitChart(
              _pendingInit.opts,
              _pendingInit.chartType,
              _pendingInit.data,
              _pendingInit.displayDecimals,
              _pendingInit.showLowerPane
            );
            return;
          }

          if (!chart || !series) {
            if (lastInitHostOptions && lastRawSeriesData && lastRawSeriesData.length > 0) {
              _doInitChart(
                cloneSerializableValue(lastInitHostOptions, {}),
                lastInitChartType,
                lastRawSeriesData.slice(),
                lastRequestedDisplayDecimals,
                lastInitShowLowerPane
              );
            }
            return;
          }

          chart.resize(w, h);
          ensureMoveBarsSeries(lastDisplayDecimals);

          if (lastRawSeriesData && lastRawSeriesData.length > 0) {
            var mapped = mapForSeries(lastRawSeriesData);
            if (mapped && mapped.length > 0) {
              series.setData(mapped);
              currentSeriesLength = mapped.length;
              lastBarTime = mapped[mapped.length - 1].time;

              if (seriesType !== 'line') {
                var lastSeed = lastRawSeriesData[lastRawSeriesData.length - 1];
                _liveBar = {
                  time: lastSeed.time,
                  open: lastSeed.open,
                  high: lastSeed.high,
                  low: lastSeed.low,
                  close: lastSeed.close,
                };
                _liveBarHasObservedRealtimeUpdate = false;
              }
            }

            if (moveBarsSeries) {
              try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_moveRecoverErr) {}
            }
          }

          _positionLinesArr = [];
          _overlayMarkers = null;
          applyOverlayPayload(_overlayPayload);
          setMarketPriceLines(lastBidPrice, lastAskPrice);
          ensureDirectionPriceLine();
          refreshDirectionPriceLine();
          ensureMoveDirectionPriceLine();
          refreshMoveDirectionPriceLine();
          scheduleOverlayPriceScaleLock(true);
          postChartGeometry();
        } catch (e) {
          postError('recoverChartSurface', e);
        }
      }

      // ResizeObserver — auto-resize the chart when the WebView container
      // dimensions change (orientation, tab switch, delayed layout).
      // Also catches the zero-dimension → real-dimension transition.
      try {
        var _resizeObserver = new ResizeObserver(function(entries) {
          var entry = entries[0];
          if (!entry) return;
          var w = entry.contentRect.width;
          var h = entry.contentRect.height;
          if (w > 0 && h > 0) {
            if (_pendingInit) {
              // Container just got real dimensions — run the deferred init.
              _doInitChart(
                _pendingInit.opts,
                _pendingInit.chartType,
                _pendingInit.data,
                _pendingInit.displayDecimals,
                _pendingInit.showLowerPane
              );
            } else if (chart) {
              // Chart exists — just resize it to match.
              try {
                chart.resize(w, h);
                ensureMoveBarsSeries(lastDisplayDecimals);
                refreshOverlayDomLabels(_overlayPayload);
                postChartGeometry();
              } catch(_) {}
            }
          }
        });
        _resizeObserver.observe(document.getElementById('chart'));
      } catch(_) {
        // ResizeObserver not available on very old WebViews — the rAF
        // fallback in _doInitChart handles it.
      }

      function hexToRgba(hex, alpha) {
        try {
          var h = hex.replace('#', '');
          if (h.length === 3) { h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
          var r = parseInt(h.substring(0, 2), 16);
          var g = parseInt(h.substring(2, 4), 16);
          var b = parseInt(h.substring(4, 6), 16);
          if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error('bad hex');
          return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        } catch (_e) {
          return alpha >= 0.9 ? hex : 'rgba(128,128,128,' + alpha + ')';
        }
      }

      function shouldUseMoveBarsPane() {
        return shouldShowLowerPane && seriesType !== 'line';
      }

      function setPrimaryPriceScaleMargins(hasLowerPane) {
        if (!chart || typeof chart.priceScale !== 'function') return;
        try {
          chart.priceScale('right').applyOptions({
            entireTextOnly: true,
            scaleMargins: {
              top: 0.08,
              bottom: hasLowerPane ? 0.32 : 0.08,
            },
          });
        } catch (_e) {}
      }

      function ensureMoveBarsSeries(displayDecimals) {
        if (!chart) return false;
        if (!shouldUseMoveBarsPane()) {
          setPrimaryPriceScaleMargins(false);
          return false;
        }
        if (moveBarsSeries) {
          setPrimaryPriceScaleMargins(true);
          return true;
        }
        try {
          var precision =
            typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
              ? displayDecimals
              : lastDisplayDecimals;
          moveBarsSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            priceFormat: {
              type: 'price',
              precision: precision,
              minMove: 1 / Math.pow(10, precision),
            },
            priceScaleId: 'move',
            lastValueVisible: false,
            priceLineVisible: false,
            color: moveUpColor,
          });
          chart.priceScale('move').applyOptions({
            entireTextOnly: true,
            scaleMargins: { top: 0.82, bottom: 0.02 },
          });
          if (lastRawSeriesData && lastRawSeriesData.length > 0) {
            try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_mbSet) {}
          }
          setPrimaryPriceScaleMargins(true);
          refreshMoveDirectionPriceLine();
          return true;
        } catch (_mb) {
          moveBarsSeries = null;
          moveDirectionPriceLine = null;
          setPrimaryPriceScaleMargins(false);
          return false;
        }
      }

      function mapForSeries(data) {
        if (!data || data.length === 0) return [];
        if (seriesType === 'line') {
          var out = new Array(data.length);
          for (var i = 0; i < data.length; i++) {
            var c = data[i];
            out[i] = { time: c.time, value: typeof c.value === 'number' ? c.value : c.close };
          }
          return out;
        }
        // candles / hollow / bars all share the same OHLC shape
        var arr = new Array(data.length);
        for (var j = 0; j < data.length; j++) {
          var d = data[j];
          arr[j] = {
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          };
        }
        return arr;
      }

      // One histogram point per bar: |close − open|, coloured by direction.
      function mapMoveBarsData(data) {
        if (!data || data.length === 0) return [];
        var out = new Array(data.length);
        for (var i = 0; i < data.length; i++) {
          var d = data[i];
          var open = typeof d.open === 'number' ? d.open : d.close;
          var close = typeof d.close === 'number' ? d.close : (typeof d.value === 'number' ? d.value : open);
          var up = close >= open;
          out[i] = {
            time: d.time,
            value: Math.abs(close - open),
            color: up ? moveUpColor : moveDownColor,
          };
        }
        return out;
      }

      // One histogram point derived from the current live bar state.
      function makeMoveBarPoint(bar) {
        var up = bar.close >= bar.open;
        return {
          time: bar.time,
          value: Math.abs(bar.close - bar.open),
          color: up ? moveUpColor : moveDownColor,
        };
      }

      function updateChartData(data) {
        try {
          if (!series) {
            postError('updateChartData', new Error('series not initialized'));
            return;
          }
          if (tickFlushHandle) {
            try { cancelAnimationFrame(tickFlushHandle); } catch (_) {}
            tickFlushHandle = 0;
          }
          pendingTick = null;
          lastRawSeriesData = Array.isArray(data) ? data.slice() : [];
          var mapped = mapForSeries(data);
          currentSeriesLength = mapped.length;
          series.setData(mapped);
          ensureMoveBarsSeries(lastDisplayDecimals);
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(data)); } catch (_mb) {}
          }

          // CRITICAL BUGFIX: setData natively obliterates all PriceLines previously bound to the series!
          // We must explicitly reconstruct the dynamic trade overlays immediately after setting chart data.
          _positionLinesArr = [];
          _overlayMarkers = null;
          if (_overlayPayload) {
            applyOverlayPayload(_overlayPayload);
          }
          setMarketPriceLines(lastBidPrice, lastAskPrice);

          if (mapped.length > 0) {
            lastBarTime = mapped[mapped.length - 1].time;
            if (seriesType !== 'line') {
              var lastSeed = data[data.length - 1];
              _liveBar = {
                time: lastSeed.time,
                open: lastSeed.open,
                high: lastSeed.high,
                low: lastSeed.low,
                close: lastSeed.close,
              };
              _liveBarHasObservedRealtimeUpdate = false;
            }
            // Symbol / timeframe switch: reposition both direction lines to
            // the new dataset's last close + move magnitude so they don't
            // linger at the previous symbol's price.
            refreshDirectionPriceLine();
            refreshMoveDirectionPriceLine();
          }
        } catch (e) {
          postError('updateChartData', e);
        }
      }

      // ── Live OHLC accumulator (runs inside WebView) ──
      var _liveBar = null; // { time, open, high, low, close }
      var _liveBarHasObservedRealtimeUpdate = false;

      function applyTickUpdate(tick) {
        if (!series || !tick || typeof tick.time !== 'number') return;
        if (tick.time < lastBarTime) return;
        var appendedNewBar = currentSeriesLength === 0 || tick.time > lastBarTime;
        var bar;
        if (seriesType === 'line') {
          bar = { time: tick.time, value: typeof tick.value === 'number' ? tick.value : tick.close };
        } else {
          bar = {
            time: tick.time,
            open: tick.open,
            high: tick.high,
            low: tick.low,
            close: tick.close,
          };
        }
        // Sync internal accumulator with full OHLC from host
        _liveBar = { time: tick.time, open: tick.open, high: tick.high, low: tick.low, close: tick.close };
        _liveBarHasObservedRealtimeUpdate = true;
        series.update(bar);
        currentSeriesLength = appendedNewBar ? Math.max(currentSeriesLength + 1, 1) : Math.max(currentSeriesLength, 1);
        if (tick.time >= lastBarTime) {
          lastBarTime = tick.time;
        }
        ensureMoveBarsSeries(lastDisplayDecimals);
        if (moveBarsSeries && seriesType !== 'line') {
          try { moveBarsSeries.update(makeMoveBarPoint(_liveBar)); } catch (_mb) {}
        }
        refreshBidPriceLineColor();
        refreshDirectionPriceLine();
        refreshMoveDirectionPriceLine();
        refreshOverlayDomLabels(_overlayPayload);
      }

      // Fast-path: host sends just a price + bucket time.
      // The WebView accumulates OHLC locally — no React state cycle needed.
      function pushPrice(bucketTime, price) {
        if (!series || typeof bucketTime !== 'number' || typeof price !== 'number') return;
        if (bucketTime < lastBarTime) return;
        var appendedNewBar = currentSeriesLength === 0 || bucketTime > lastBarTime;

        var bar;
        if (_liveBar && _liveBar.time === bucketTime) {
          // Same bucket — accumulate
          _liveBar.high = Math.max(_liveBar.high, price);
          _liveBar.low = Math.min(_liveBar.low, price);
          _liveBar.close = price;
        } else {
          // New bucket: if we've only seeded from history and have not yet
          // observed live updates locally, start from the first observed price
          // to avoid fabricating an oversized red/green opening body.
          var nextOpen =
            _liveBarHasObservedRealtimeUpdate && _liveBar && typeof _liveBar.close === 'number'
              ? _liveBar.close
              : price;
          _liveBar = {
            time: bucketTime,
            open: nextOpen,
            high: Math.max(nextOpen, price),
            low: Math.min(nextOpen, price),
            close: price,
          };
        }
        _liveBarHasObservedRealtimeUpdate = true;

        if (seriesType === 'line') {
          bar = { time: bucketTime, value: price };
        } else {
          bar = { time: _liveBar.time, open: _liveBar.open, high: _liveBar.high, low: _liveBar.low, close: _liveBar.close };
        }
        series.update(bar);
        currentSeriesLength = appendedNewBar ? Math.max(currentSeriesLength + 1, 1) : Math.max(currentSeriesLength, 1);
        if (bucketTime >= lastBarTime) {
          lastBarTime = bucketTime;
        }
        ensureMoveBarsSeries(lastDisplayDecimals);
        if (moveBarsSeries && seriesType !== 'line' && _liveBar) {
          try { moveBarsSeries.update(makeMoveBarPoint(_liveBar)); } catch (_mb) {}
        }
        refreshBidPriceLineColor();
        refreshDirectionPriceLine();
        refreshMoveDirectionPriceLine();
      }

      function flushPendingTick() {
        try {
          tickFlushHandle = 0;
          var tick = pendingTick;
          pendingTick = null;
          if (!tick) return;
          applyTickUpdate(tick);
        } catch (e) {
          if (typeof e.message === 'string' && e.message.indexOf('Cannot update oldest data') >= 0) {
            return; // benign race
          }
          postError('flushPendingTick', e);
        }
      }

      function updateTick(tick) {
        if (!tick || typeof tick.time !== 'number') return;
        pendingTick = tick;
        if (tickFlushHandle) return;
        tickFlushHandle = requestAnimationFrame(flushPendingTick);
      }

      // Pick the candle-direction colour for the live bid / last-price line.
      // Up candle (close ≥ open) → barUpColor. Down candle → barDownColor.
      function pickLivePriceColor() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return barUpColor;
        }
        return _liveBar.close >= _liveBar.open ? barUpColor : barDownColor;
      }

      // Create the dedicated direction-coloured price line at the live close
      // if it doesn't exist yet. Safe to call repeatedly — no-ops once the
      // instance is bound.
      function ensureDirectionPriceLine() {
        try {
          if (marketPriceLinesVisible) return;
          if (directionPriceLine || !series) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          directionPriceLine = series.createPriceLine({
            price: _liveBar.close,
            color: pickLivePriceColor(),
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: false,
          });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      // Re-price and re-tint the direction line on every tick. Only calls
      // applyOptions on the price-line instance we own — never on the main
      // series — so it can't trigger a history redraw. If applyOptions
      // fails (e.g. the series was torn down underneath) we null the ref
      // so the next tick recreates a fresh instance on the live series.
      function refreshDirectionPriceLine() {
        if (!_liveBar || typeof _liveBar.close !== 'number') return;
        if (marketPriceLinesVisible) {
          if (directionPriceLine && series) {
            try { series.removePriceLine(directionPriceLine); } catch (_e) {}
            directionPriceLine = null;
          }
          return;
        }
        if (!directionPriceLine) {
          ensureDirectionPriceLine();
          return;
        }
        var color = pickLivePriceColor();
        try {
          directionPriceLine.applyOptions({ price: _liveBar.close, color: color });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      // Current move magnitude for the active bar (|close − open|). This is
      // the y-value the move-bars pane plots, and where its direction line
      // should sit.
      function pickLiveMoveValue() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return 0;
        }
        return Math.abs(_liveBar.close - _liveBar.open);
      }

      // Create the move-bars pane's direction line the first time we have a
      // live bar. Scoped to the move-bars series so it renders on the move
      // price scale ('move'), not the main candle scale.
      function ensureMoveDirectionPriceLine() {
        try {
          if (moveDirectionPriceLine || !moveBarsSeries) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          moveDirectionPriceLine = moveBarsSeries.createPriceLine({
            price: pickLiveMoveValue(),
            color: pickLivePriceColor(),
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
          });
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      // Re-price + re-tint the move-bars direction line every tick. Again,
      // only touches the price-line instance — move-bars series itself stays
      // untouched. Same teardown-recovery trick: null the ref on failure so
      // the next call recreates rather than re-throwing forever.
      function refreshMoveDirectionPriceLine() {
        if (!moveBarsSeries || !_liveBar) return;
        if (!moveDirectionPriceLine) {
          ensureMoveDirectionPriceLine();
          return;
        }
        try {
          moveDirectionPriceLine.applyOptions({
            price: pickLiveMoveValue(),
            color: pickLivePriceColor(),
          });
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      function removeMarketPriceLine(line) {
        if (!series || !line) return null;
        try { series.removePriceLine(line); } catch (_e) {}
        return null;
      }

      function setBidPriceLine(price) {
        try {
          if (!series) return;
          if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
            bidPriceLine = removeMarketPriceLine(bidPriceLine);
            return;
          }
          if (bidPriceLine) {
            try {
              bidPriceLine.applyOptions({
                price: price,
                color: marketBidColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
                axisLabelVisible: true,
                title: '',
              });
              return;
            } catch (_e) {
              bidPriceLine = removeMarketPriceLine(bidPriceLine);
            }
          }
          bidPriceLine = series.createPriceLine({
            price: price,
            color: marketBidColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
            title: '',
          });
        } catch (e) {
          postError('setBidPriceLine', e);
        }
      }

      function setAskPriceLine(price) {
        try {
          if (!series) return;
          if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
            askPriceLine = removeMarketPriceLine(askPriceLine);
            return;
          }
          if (askPriceLine) {
            try {
              askPriceLine.applyOptions({
                price: price,
                color: marketAskColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
                axisLabelVisible: true,
                title: '',
              });
              return;
            } catch (_e) {
              askPriceLine = removeMarketPriceLine(askPriceLine);
            }
          }
          askPriceLine = series.createPriceLine({
            price: price,
            color: marketAskColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
            title: '',
          });
        } catch (e) {
          postError('setAskPriceLine', e);
        }
      }

      function setMarketPriceLines(bid, ask) {
        var hasBid = typeof bid === 'number' && isFinite(bid) && bid > 0;
        var hasAsk = typeof ask === 'number' && isFinite(ask) && ask > 0;
        lastBidPrice = hasBid ? bid : null;
        lastAskPrice = hasAsk ? ask : null;
        marketPriceLinesVisible = hasBid || hasAsk;
        if (marketPriceLinesVisible && directionPriceLine && series) {
          try { series.removePriceLine(directionPriceLine); } catch (_e) {}
          directionPriceLine = null;
        }
        if (hasBid) {
          setBidPriceLine(bid);
        } else {
          bidPriceLine = removeMarketPriceLine(bidPriceLine);
        }
        if (hasAsk) {
          setAskPriceLine(ask);
        } else {
          askPriceLine = removeMarketPriceLine(askPriceLine);
        }
        scheduleOverlayDomRefresh();
      }

      // Re-tint the custom BID price line in place when the active candle
      // flips direction mid-bucket (blue when bullish, red when bearish).
      // We intentionally don't touch the candle series' or move-bars' own
      // options — applyOptions on the main series can cause a full redraw
      // of the data, which was blanking history on some rebuilds.
      function refreshBidPriceLineColor() {
        if (!bidPriceLine) return;
        try { bidPriceLine.applyOptions({ color: marketBidColor }); } catch (_e) {}
      }

      // Backwards-compat no-ops so any stale call sites from earlier
      // builds (drawing tools / overlays) silently do nothing instead of
      // throwing and aborting the script.
      function setLiveCandleLine() {}
      function updateChartAppearance() {}
      // Legacy no-op kept so stale call-sites from earlier builds don't throw.
      function setVolumeSeriesData(_data) {}
      function setDrawingTool(tool) {
        if (window._drawingManager && typeof window._drawingManager.setActiveTool === 'function') {
          window._drawingManager.setActiveTool(tool);
        }
      }
      function clearDrawings() {
        if (window._drawingManager && typeof window._drawingManager.removeAllDrawings === 'function') {
          window._drawingManager.removeAllDrawings();
        }
      }
      function setSerializedDrawings(drawings) {
        if (window._drawingManager && typeof window._drawingManager.setSerializedDrawings === 'function') {
          window._drawingManager.setSerializedDrawings(drawings);
        }
      }
      function setDrawingsLocked(locked) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsLocked === 'function') {
          window._drawingManager.setDrawingsLocked(locked);
        }
      }
      function setDrawingsHidden(hidden) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsHidden === 'function') {
          window._drawingManager.setDrawingsHidden(hidden);
        }
      }
      function setStayInDrawingMode(sticky) {
        if (window._drawingManager && typeof window._drawingManager.setStayInDrawingMode === 'function') {
          window._drawingManager.setStayInDrawingMode(sticky);
        }
      }
      function setMagnetMode(enabled) {
        if (window._drawingManager && typeof window._drawingManager.setMagnetMode === 'function') {
          window._drawingManager.setMagnetMode(enabled);
        }
      }
      function zoomChart() {
        if (window._drawingManager && typeof window._drawingManager.zoomToFit === 'function') {
          window._drawingManager.zoomToFit();
        }
      }
      // ── Position / Trade Level Lines ──────────────────────────────
      // Manages entry price, TP, and SL horizontal lines on the chart.
      // Called from React Native whenever positions change or the user
      // toggles the "Show Trade Levels" setting.
      var _positionLinesArr = [];
      var _overlayPriceLinesByDragKey = Object.create(null);
      var _overlayMarkers = null;
      var _overlayPayload = { priceLines: [], markers: [] };
      var _overlayResyncTimer = null;
      var _overlayLabelLayer = null;
      var activeTradeLineDrag = null;
      var suppressNextChartClickUntil = 0;
      var TRADE_LINE_DRAG_HIT_SLOP = 30;

      function clearOverlayPriceLines() {
        if (series) {
          for (var i = 0; i < _positionLinesArr.length; i++) {
            try { series.removePriceLine(_positionLinesArr[i]); } catch (_e) {}
          }
        }
        _positionLinesArr = [];
        _overlayPriceLinesByDragKey = Object.create(null);
        activeTradeLineDrag = null;
        chartTouchInteractionSuspendDepth = 0;
      }

      function clearOverlayMarkers() {
        if (_overlayMarkers && typeof _overlayMarkers.detach === 'function') {
          try { _overlayMarkers.detach(); } catch (_e) {}
        }
        _overlayMarkers = null;
      }

      function ensureOverlayLabelLayer() {
        var el = document.getElementById('chart');
        if (!el) return null;
        if (_overlayLabelLayer && _overlayLabelLayer.parentNode === el) {
          return _overlayLabelLayer;
        }
        el.style.position = 'relative';
        _overlayLabelLayer = document.createElement('div');
        _overlayLabelLayer.style.position = 'absolute';
        _overlayLabelLayer.style.left = '0';
        _overlayLabelLayer.style.top = '0';
        _overlayLabelLayer.style.right = '0';
        _overlayLabelLayer.style.bottom = '0';
        _overlayLabelLayer.style.pointerEvents = 'none';
        _overlayLabelLayer.style.zIndex = '7';
        el.appendChild(_overlayLabelLayer);
        return _overlayLabelLayer;
      }

      function clearOverlayDomLabels() {
        if (!_overlayLabelLayer) return;
        while (_overlayLabelLayer.firstChild) {
          _overlayLabelLayer.removeChild(_overlayLabelLayer.firstChild);
        }
      }

      function roundOverlayDragPrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        var decimals =
          typeof lastRequestedDisplayDecimals === 'number' && isFinite(lastRequestedDisplayDecimals)
            ? Math.max(0, Math.min(10, Math.round(lastRequestedDisplayDecimals)))
            : 5;
        return Number(price.toFixed(decimals));
      }

      function postChartTradeLineDrag(phase, dragKey, price) {
        if (!dragKey) return;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TRADE_LINE_DRAG',
            phase: phase,
            dragKey: dragKey,
            price: typeof price === 'number' && isFinite(price) ? price : null,
          }));
        } catch (_e) {}
      }

      var pendingChartTradeLineDragMove = null;
      var chartTradeLineDragMoveFrame = null;

      function cancelChartTradeLineDragMove() {
        if (chartTradeLineDragMoveFrame !== null) {
          try {
            cancelAnimationFrame(chartTradeLineDragMoveFrame);
          } catch (_e) {}
          chartTradeLineDragMoveFrame = null;
        }
        pendingChartTradeLineDragMove = null;
      }

      function flushChartTradeLineDragMove() {
        chartTradeLineDragMoveFrame = null;
        var pending = pendingChartTradeLineDragMove;
        pendingChartTradeLineDragMove = null;
        if (!pending || !pending.dragKey) return;
        postChartTradeLineDrag('move', pending.dragKey, pending.price);
      }

      function scheduleChartTradeLineDragMove(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        pendingChartTradeLineDragMove = { dragKey: dragKey, price: price };
        if (chartTradeLineDragMoveFrame !== null) {
          return;
        }
        try {
          chartTradeLineDragMoveFrame = requestAnimationFrame(flushChartTradeLineDragMove);
        } catch (_e) {
          flushChartTradeLineDragMove();
        }
      }

      function resolveDraggableOverlayPriceLines() {
        var lines = Array.isArray(_overlayPayload && _overlayPayload.priceLines) ? _overlayPayload.priceLines : [];
        var draggable = [];
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (!ln || typeof ln.dragKey !== 'string' || !ln.dragKey) continue;
          if (typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0) continue;
          draggable.push(ln);
        }
        return draggable;
      }

      function pickDraggableOverlayLineAtY(y) {
        if (!series || typeof y !== 'number' || !isFinite(y)) {
          return null;
        }
        var draggableLines = resolveDraggableOverlayPriceLines();
        var closest = null;
        var closestDistance = Infinity;
        for (var i = 0; i < draggableLines.length; i++) {
          var line = draggableLines[i];
          if (typeof series.priceToCoordinate !== 'function') {
            continue;
          }
          var coordinate = series.priceToCoordinate(line.price);
          if (typeof coordinate !== 'number' || !isFinite(coordinate)) {
            continue;
          }
          var distance = Math.abs(coordinate - y);
          if (distance <= TRADE_LINE_DRAG_HIT_SLOP && distance < closestDistance) {
            closest = {
              dragKey: line.dragKey,
              price: line.price,
              y: coordinate,
            };
            closestDistance = distance;
          }
        }
        return closest;
      }

      function updateDraggedOverlayLinePreview(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        var entry = _overlayPriceLinesByDragKey[dragKey];
        if (!entry || !entry.api || !entry.line) {
          return;
        }
        entry.line.price = price;
        try {
          entry.api.applyOptions({
            price: price,
            color: entry.line.color || '#2962FF',
            lineWidth: entry.line.lineWidth || 1,
            lineStyle: typeof entry.line.lineStyle === 'number'
              ? entry.line.lineStyle
              : (LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0),
            axisLabelVisible: entry.line.axisLabelVisible !== false,
            title: '',
          });
        } catch (_e) {}
        scheduleOverlayDomRefresh();
      }

      function resolveOverlayLabelBounds(layer) {
        var metrics = resolvePrimaryPaneMetrics();
        var plotTop = metrics.plotTop || 0;
        var plotBottom = plotTop + (metrics.plotHeight || 0);
        var layerHeight = layer && layer.clientHeight ? layer.clientHeight : metrics.chartHeight || 0;
        var minTop = Math.max(OVERLAY_LABEL_TOP_SAFE_PADDING, plotTop + 6);
        var maxTop = Math.max(
          minTop,
          Math.min(layerHeight - OVERLAY_LABEL_HEIGHT - 2, plotBottom - OVERLAY_LABEL_HEIGHT - OVERLAY_LABEL_BOTTOM_SAFE_PADDING)
        );

        return {
          minTop: minTop,
          maxTop: maxTop,
        };
      }

      function resolveAnchoredOverlayLabelBounds(layer) {
        var metrics = resolvePrimaryPaneMetrics();
        var plotTop = metrics.plotTop || 0;
        var plotBottom = plotTop + (metrics.plotHeight || 0);
        var layerHeight = layer && layer.clientHeight ? layer.clientHeight : metrics.chartHeight || 0;
        var minTop = Math.max(0, plotTop + 1);
        var maxTop = Math.max(
          minTop,
          Math.min(layerHeight - OVERLAY_LABEL_LINE_HEIGHT - 1, plotBottom - OVERLAY_LABEL_LINE_HEIGHT - 1)
        );

        return {
          minTop: minTop,
          maxTop: maxTop,
        };
      }

      function formatMarketPriceLabel(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return '';
        }
        var decimals =
          typeof lastRequestedDisplayDecimals === 'number' && isFinite(lastRequestedDisplayDecimals)
            ? Math.max(0, Math.min(10, Math.round(lastRequestedDisplayDecimals)))
            : 5;
        return Number(price).toFixed(decimals);
      }

      function renderMarketPriceBadges(layer) {
        if (!layer || !series || typeof series.priceToCoordinate !== 'function') {
          return;
        }

        var metrics = resolvePrimaryPaneMetrics();
        var plotTop = metrics.plotTop || 0;
        var plotBottom = plotTop + (metrics.plotHeight || 0);
        var layerHeight = layer && layer.clientHeight ? layer.clientHeight : metrics.chartHeight || 0;
        var minTop = Math.max(0, plotTop + 1);
        var maxTop = Math.max(
          minTop,
          Math.min(layerHeight - MARKET_PRICE_BADGE_HEIGHT - 1, plotBottom - MARKET_PRICE_BADGE_HEIGHT - 1)
        );
        var badges = [];

        if (typeof lastAskPrice === 'number' && isFinite(lastAskPrice) && lastAskPrice > 0) {
          var askY = series.priceToCoordinate(lastAskPrice);
          if (typeof askY === 'number' && isFinite(askY)) {
            badges.push({
              color: marketAskColor,
              text: formatMarketPriceLabel(lastAskPrice),
              y: askY,
            });
          }
        }

        if (typeof lastBidPrice === 'number' && isFinite(lastBidPrice) && lastBidPrice > 0) {
          var bidY = series.priceToCoordinate(lastBidPrice);
          if (typeof bidY === 'number' && isFinite(bidY)) {
            badges.push({
              color: marketBidColor,
              text: formatMarketPriceLabel(lastBidPrice),
              y: bidY,
            });
          }
        }

        if (badges.length === 0) {
          return;
        }

        badges.sort(function(left, right) { return left.y - right.y; });
        var step = MARKET_PRICE_BADGE_HEIGHT + MARKET_PRICE_BADGE_MIN_GAP;
        var tops = [];

        for (var badgeIndex = 0; badgeIndex < badges.length; badgeIndex++) {
          var desiredTop = Math.round(badges[badgeIndex].y - MARKET_PRICE_BADGE_HEIGHT / 2);
          if (badgeIndex > 0) {
            desiredTop = Math.max(desiredTop, tops[badgeIndex - 1] + step);
          }
          tops[badgeIndex] = Math.max(minTop, Math.min(maxTop, desiredTop));
        }

        if (tops.length > 0 && tops[tops.length - 1] > maxTop) {
          tops[tops.length - 1] = maxTop;
          for (var backIndex = tops.length - 2; backIndex >= 0; backIndex--) {
            tops[backIndex] = Math.min(tops[backIndex], tops[backIndex + 1] - step);
          }
          if (tops[0] < minTop) {
            tops[0] = minTop;
            for (var forwardIndex = 1; forwardIndex < tops.length; forwardIndex++) {
              tops[forwardIndex] = Math.max(tops[forwardIndex], tops[forwardIndex - 1] + step);
            }
          }
        }

        for (var renderIndex = 0; renderIndex < badges.length; renderIndex++) {
          var badge = badges[renderIndex];
          var badgeNode = document.createElement('div');
          badgeNode.textContent = badge.text;
          badgeNode.style.position = 'absolute';
          badgeNode.style.right = MARKET_PRICE_BADGE_RIGHT_INSET + 'px';
          badgeNode.style.top = Math.max(minTop, Math.min(maxTop, tops[renderIndex])) + 'px';
          badgeNode.style.height = MARKET_PRICE_BADGE_HEIGHT + 'px';
          badgeNode.style.lineHeight = MARKET_PRICE_BADGE_HEIGHT + 'px';
          badgeNode.style.padding = '0 6px';
          badgeNode.style.borderRadius = '4px';
          badgeNode.style.background = badge.color;
          badgeNode.style.color = '#FFFFFF';
          badgeNode.style.fontSize = '11px';
          badgeNode.style.fontWeight = '700';
          badgeNode.style.whiteSpace = 'nowrap';
          badgeNode.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.18)';
          layer.appendChild(badgeNode);
        }
      }

      function refreshOverlayDomLabels(payload) {
        try {
          clearOverlayDomLabels();
          if (!series) return;
          var layer = ensureOverlayLabelLayer();
          if (!layer) return;
          var lines = Array.isArray(payload && payload.priceLines) ? payload.priceLines : [];
          var floatingLabels = [];
          var anchoredLabels = [];
          var bounds = resolveOverlayLabelBounds(layer);
          var anchoredBounds = resolveAnchoredOverlayLabelBounds(layer);
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!ln || !ln.title || typeof ln.price !== 'number' || !isFinite(ln.price)) continue;
            if (typeof series.priceToCoordinate !== 'function') continue;
            var y = series.priceToCoordinate(ln.price);
            if (typeof y !== 'number' || !isFinite(y)) continue;
            var labelRecord = {
              color: ln.color || '#2962FF',
              text: String(ln.title),
              y: y,
            };
            if (typeof ln.dragKey === 'string' && ln.dragKey) {
              anchoredLabels.push(labelRecord);
            } else {
              floatingLabels.push(labelRecord);
            }
          }
          floatingLabels.sort(function(left, right) { return left.y - right.y; });
          var step = OVERLAY_LABEL_HEIGHT + OVERLAY_LABEL_GAP;
          var tops = [];
          for (var j = 0; j < floatingLabels.length; j++) {
            var desiredTop = Math.round(floatingLabels[j].y - OVERLAY_LABEL_HEIGHT / 2);
            if (j > 0) {
              desiredTop = Math.max(desiredTop, tops[j - 1] + step);
            }
            tops[j] = Math.max(bounds.minTop, Math.min(bounds.maxTop, desiredTop));
          }
          if (tops.length > 0 && tops[tops.length - 1] > bounds.maxTop) {
            tops[tops.length - 1] = bounds.maxTop;
            for (var backIndex = tops.length - 2; backIndex >= 0; backIndex--) {
              tops[backIndex] = Math.min(tops[backIndex], tops[backIndex + 1] - step);
            }
            if (tops[0] < bounds.minTop) {
              tops[0] = bounds.minTop;
              for (var forwardIndex = 1; forwardIndex < tops.length; forwardIndex++) {
                tops[forwardIndex] = Math.max(tops[forwardIndex], tops[forwardIndex - 1] + step);
              }
              if (tops[tops.length - 1] > bounds.maxTop) {
                tops[tops.length - 1] = bounds.maxTop;
                for (var secondBackIndex = tops.length - 2; secondBackIndex >= 0; secondBackIndex--) {
                  tops[secondBackIndex] = Math.min(tops[secondBackIndex], tops[secondBackIndex + 1] - step);
                }
              }
            }
          }

          var renderLabel = function(item, top) {
            var label = document.createElement('div');
            label.textContent = item.text;
            label.style.position = 'absolute';
            label.style.left = '8px';
            label.style.top = top + 'px';
            label.style.color = item.color;
            label.style.fontSize = '12px';
            label.style.fontWeight = '700';
            label.style.height = OVERLAY_LABEL_LINE_HEIGHT + 'px';
            label.style.lineHeight = OVERLAY_LABEL_LINE_HEIGHT + 'px';
            label.style.whiteSpace = 'nowrap';
            label.style.maxWidth = Math.max(80, (layer.clientWidth || 0) - 24) + 'px';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.textShadow = '0 1px 1px rgba(255,255,255,0.55)';
            layer.appendChild(label);
          };

          for (var labelIndex = 0; labelIndex < floatingLabels.length; labelIndex++) {
            var floatingItem = floatingLabels[labelIndex];
            var floatingTop = Math.max(bounds.minTop, Math.min(bounds.maxTop, tops[labelIndex]));
            renderLabel(floatingItem, floatingTop);
          }

          for (var anchoredIndex = 0; anchoredIndex < anchoredLabels.length; anchoredIndex++) {
            var anchoredItem = anchoredLabels[anchoredIndex];
            var anchoredTop = Math.round(anchoredItem.y - OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP);
            anchoredTop = Math.max(anchoredBounds.minTop, Math.min(anchoredBounds.maxTop, anchoredTop));
            renderLabel(anchoredItem, anchoredTop);
          }
        } catch (labelErr) {
          postError('refreshOverlayDomLabels', labelErr);
        }
      }

      // ── Robust "nuke and recreate" overlay renderer ──────────────
      // Matches the proven web version approach: always remove every
      // existing price line, then create fresh ones from the payload.
      // The previous incremental approach (track by ID, update-or-create)
      // silently lost lines when createPriceLine threw inside a
      // try/catch, and stale _positionLinesMap entries after chart
      // re-init caused ghost references that blocked new line creation.
      function applyOverlayPayload(payload) {
        try {
          if (!payload || typeof payload !== 'object') {
            payload = { priceLines: [], markers: [] };
          }
          if (!series) return;

          // Step 1: Remove ALL existing price lines (clean slate)
          clearOverlayPriceLines();

          // Step 2: Create ALL price lines from scratch
          var lines = Array.isArray(payload.priceLines) ? payload.priceLines : [];
          var created = 0;
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!ln || typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0 || !ln.id) continue;
            try {
              var priceLine = series.createPriceLine({
                price: ln.price,
                color: ln.color || '#2962FF',
                lineWidth: ln.lineWidth || 1,
                lineStyle: typeof ln.lineStyle === 'number' ? ln.lineStyle : (LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0),
                axisLabelVisible: ln.axisLabelVisible !== false,
                title: '',
              });
              _positionLinesArr.push(priceLine);
              if (typeof ln.dragKey === 'string' && ln.dragKey) {
                _overlayPriceLinesByDragKey[ln.dragKey] = {
                  api: priceLine,
                  line: ln,
                };
              }
              created++;
            } catch (lineErr) {
              postError('createPriceLine[' + ln.id + ']', lineErr);
            }
          }

          // Step 3: Handle markers (also nuke and recreate)
          clearOverlayMarkers();
          var markers = Array.isArray(payload.markers) ? payload.markers : [];
          if (
            markers.length > 0 &&
            typeof LightweightCharts !== 'undefined' &&
            typeof LightweightCharts.createSeriesMarkers === 'function'
          ) {
            try {
              _overlayMarkers = LightweightCharts.createSeriesMarkers(series, markers);
            } catch (markerErr) {
              _overlayMarkers = null;
              postError('createSeriesMarkers', markerErr);
            }
          }
          refreshOverlayDomLabels(payload);
        } catch (e) {
          postError('applyOverlayPayload', e);
        }
      }

      function setChartOverlays(payload) {
        _overlayPayload = payload && typeof payload === 'object'
          ? payload
          : { priceLines: [], markers: [] };
        if (activeTradeLineDrag) {
          scheduleOverlayDomRefresh();
          return;
        }
        applyOverlayPayload(_overlayPayload);
      }

      function setPriceLines(lines) {
        try {
          setChartOverlays({
            priceLines: Array.isArray(lines) ? lines : [],
            markers: Array.isArray(_overlayPayload.markers) ? _overlayPayload.markers : [],
          });
        } catch (e) { postError('setPriceLines', e); }
      }

      function updatePositionLines() {
        if (activeTradeLineDrag) {
          return;
        }
        applyOverlayPayload(_overlayPayload);
      }

      // ── Self-healing overlay resync ──────────────────────────────
      // Every 4 seconds, re-apply the cached overlay payload. This
      // guarantees that even if a setChartOverlays call races with
      // initChart's requestAnimationFrame (series=null at call time),
      // the lines self-heal within a few seconds.
      function startOverlayResync() {
        if (_overlayResyncTimer) clearInterval(_overlayResyncTimer);
        _overlayResyncTimer = setInterval(function() {
          if (
            !activeTradeLineDrag &&
            series &&
            _overlayPayload &&
            _overlayPayload.priceLines &&
            _overlayPayload.priceLines.length > 0
          ) {
            // Only resync if the line count on canvas doesn't match the payload
            if (_positionLinesArr.length !== _overlayPayload.priceLines.length) {
              applyOverlayPayload(_overlayPayload);
            }
          }
        }, 4000);
      }
      startOverlayResync();

      window.initChart = initChart;
      window.updateChartData = updateChartData;
      window.updateTick = updateTick;
      window.pushPrice = pushPrice;
      window.setBidPriceLine = setBidPriceLine;
      window.setAskPriceLine = setAskPriceLine;
      window.setMarketPriceLines = setMarketPriceLines;
      window.setLiveCandleLine = setLiveCandleLine;
      window.updateChartAppearance = updateChartAppearance;
      window.setVolumeSeriesData = setVolumeSeriesData;
      window.setDrawingTool = setDrawingTool;
      window.clearDrawings = clearDrawings;
      window.setSerializedDrawings = setSerializedDrawings;
      window.setDrawingsLocked = setDrawingsLocked;
      window.setDrawingsHidden = setDrawingsHidden;
      window.setStayInDrawingMode = setStayInDrawingMode;
      window.setMagnetMode = setMagnetMode;
      window.zoomChart = zoomChart;
      window.setChartOverlays = setChartOverlays;
      window.setPriceLines = setPriceLines;
      window.updatePositionLines = updatePositionLines;
      window.resizeChartViewport = resizeChartViewport;
      window.recoverChartSurface = recoverChartSurface;

      postReady();
    </script>
</body>
</html>
`;

const getSentimentForSymbol = (symbol: string) => {
  const now = new Date();
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Rotate every hour using day + hour so sentiment feels live
  const seed = Math.abs(hash + now.getDate() * 24 + now.getHours());
  // Add minute-based micro-drift (±3%) so it shifts slightly within the hour
  const drift = (now.getMinutes() % 7) - 3;
  const buyPct = Math.max(10, Math.min(90, 15 + (seed % 71) + drift));
  return { buyPct, sellPct: 100 - buyPct };
};

const CHART_SOURCE = { html: CH_HTML };
const CHART_DEV_SOURCE_KEY = getDevRefreshKey(
  'chart-native-webview',
  hashDevRefreshSource(CH_HTML),
);

const buildChartTickPayload = (
  candle: { time: number; open: number; high: number; low: number; close: number; volume?: number },
  chartType: 'candles' | 'bars' | 'line' | 'hollow',
) => {
  if (chartType === 'line') {
    return { time: candle.time, value: candle.close };
  }

  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  };
};

export function ChartScreen() {
  const T = useTheme();
  const { t } = useTranslation();
  const isScreenFocused = useIsFocused();
  const token = useUserPreferences(s => s.accountDetails?.credentials?.accessToken);
  // Derive login reactively from Zustand so the positions fetch re-triggers
  // when auth completes (login goes from undefined → valid number).
  const liveLogin = useLiveAccountState((s) => s.login);
  const persistedLoginId = useUserPreferences((s) => s.accountDetails?.id);
  const accountLogin = useMemo(() => {
    if (Number.isFinite(liveLogin) && liveLogin > 0) return liveLogin;
    const parsed = Number(persistedLoginId);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return undefined;
  }, [liveLogin, persistedLoginId]);

  // Hydrate positions on page refresh
  const refreshPositions = usePositionsState((s) => s.refreshPositions);
  // Fetch positions on mount AND poll every 10s so new trades always appear
  // on the chart even if the account WebSocket misses an event.
  useEffect(() => {
    if (!isScreenFocused || !accountLogin) return;
    refreshPositions(String(accountLogin));
    const interval = setInterval(() => {
      refreshPositions(String(accountLogin));
    }, 10000);
    return () => clearInterval(interval);
  }, [accountLogin, isScreenFocused, refreshPositions]);

  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const {
    chartSymbol,
    chartTimeframe,
    chartVisualType,
    priceSource,
    chartColors,
    chartColorScheme,
    chartDisplay,
    chartViewportShowVolumePane,
    chartViewportShowDrawingToolbar,
    chartDrawingRecordsBySymbol,
    tradeVolume,
    chartTradeVolumeDisplayMode,
    setChartTimeframe,
    setChartVisualType,
    setChartSymbol,
    setChartViewportShowVolumePane,
    setChartViewportShowDrawingToolbar,
    setTradeVolume,
    setChartTradeVolumeDisplayMode,
    chartLockAll,
    chartHideAll,
    setChartLockAll,
    setChartHideAll,
    setChartDrawingRecordsForSymbol,
  } = useUserPreferences(
    useShallow((state) => ({
      chartSymbol: state.chartSymbol,
      chartTimeframe: state.chartTimeframe,
      chartVisualType: state.chartVisualType,
      priceSource: state.priceSource,
      chartColors: state.chartColors,
      chartColorScheme: state.chartColorScheme,
      chartDisplay: state.chartDisplay,
      chartViewportShowVolumePane: state.chartViewportShowVolumePane,
      chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar,
      chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
      tradeVolume: state.tradeVolume,
      chartTradeVolumeDisplayMode: state.chartTradeVolumeDisplayMode,
      setChartTimeframe: state.setChartTimeframe,
      setChartVisualType: state.setChartVisualType,
      setChartSymbol: state.setChartSymbol,
      setChartViewportShowVolumePane: state.setChartViewportShowVolumePane,
      setChartViewportShowDrawingToolbar: state.setChartViewportShowDrawingToolbar,
      setTradeVolume: state.setTradeVolume,
      setChartTradeVolumeDisplayMode: state.setChartTradeVolumeDisplayMode,
      chartLockAll: state.chartLockAll,
      chartHideAll: state.chartHideAll,
      setChartLockAll: state.setChartLockAll,
      setChartHideAll: state.setChartHideAll,
      setChartDrawingRecordsForSymbol: state.setChartDrawingRecordsForSymbol,
    })),
  );
  const BLUE = T.trading.buy.primary;
  const TEXT_MUTED = T.textMuted;
  const positions = usePositionsState((s) => s.positions);
  const preferencesHydrated = useUserPreferences((s) => s.hasHydrated);
  const chartShowOnChart = useUserPreferences((s) => s.chartShowOnChart);
  const showTradingSignals = chartShowOnChart.tradingSignals;
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  const chartColorsSignature = useMemo(() => JSON.stringify(resolvedChartColors), [resolvedChartColors]);
  const chartDrawingBucketKey = useMemo(() => getChartDrawingBucketKey(chartSymbol), [chartSymbol]);
  const chartDrawingRecords = useMemo(
    () => chartDrawingRecordsBySymbol[chartDrawingBucketKey] ?? [],
    [chartDrawingBucketKey, chartDrawingRecordsBySymbol],
  );
  const chartDrawingSignature = useMemo(() => JSON.stringify(chartDrawingRecords), [chartDrawingRecords]);

  const { data: apiSymbols = [] } = useMarketSymbols();
  const availableSymbols = apiSymbols.length > 0 ? apiSymbols : CHART_SYMBOLS;
  const { data: chartInstrumentMeta } = useInstrumentMeta(chartSymbol);
  const tradeVolumeBounds = useMemo(
    () => ({
      minVolume: chartInstrumentMeta?.minVolume,
      maxVolume: chartInstrumentMeta?.maxVolume,
      stepVolume: chartInstrumentMeta?.stepVolume,
    }),
    [chartInstrumentMeta?.maxVolume, chartInstrumentMeta?.minVolume, chartInstrumentMeta?.stepVolume],
  );
  const [lotInput, setLotInput] = useState(() => formatTradeVolume(tradeVolume, tradeVolumeBounds));
  const footerLotDraftRef = useRef(lotInput);
  const [footerLotEditorFocused, setFooterLotEditorFocused] = useState(false);
  const [footerLotEditorOpening, setFooterLotEditorOpening] = useState(false);
  const footerLotEditorInputRef = useRef<TextInput>(null);
  const [footerLotPickerMode, setFooterLotPickerMode] = useState<FooterLotPickerMode | null>(null);
  const showFooterLotPicker = footerLotPickerMode !== null;
  const setFooterLotDraft = useCallback((nextDraft: string) => {
    footerLotDraftRef.current = nextDraft;
    setLotInput(nextDraft);
  }, []);

  useEffect(() => {
    if (apiSymbols.length > 0 && !apiSymbols.includes(chartSymbol)) {
      setChartSymbol(apiSymbols[0]);
    }
  }, [apiSymbols, chartSymbol, setChartSymbol]);

  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => chartSymbol.replace(/[a-z_.-].*$/, ''), [chartSymbol]);
  const chartLiveQuotes = useMarketData(chartSymbol ? [chartSymbol] : []);
  const chartLiveQuote = chartLiveQuotes[chartSymbol];
  const displayDecimals = useMemo(() => {
    const liveDigits =
      typeof chartLiveQuote?.digits === 'number' && Number.isFinite(chartLiveQuote.digits)
        ? Math.floor(chartLiveQuote.digits)
        : null;
    if (liveDigits !== null) {
      return Math.min(Math.max(liveDigits, 0), 8);
    }
    return baseSymbol.includes('JPY') ? 3 : baseSymbol.includes('XAU') ? 2 : baseSymbol.includes('BTC') ? 2 : 5;
  }, [baseSymbol, chartLiveQuote?.digits]);
  const { data: closedPositions = [], refetch: refetchClosedPositions } = usePositionHistoryQuery(accountLogin, {
    enabled: isScreenFocused,
  });
  const { data: orders = [], refetch: refetchOrders } = useOrdersByLoginQuery(accountLogin, {
    enabled: isScreenFocused,
  });
  const { data: alerts = [], refetch: refetchAlerts } = useAlertsQuery({
    enabled: isScreenFocused,
  });
  const { data: accountSummary, refetch: refetchAccountSummary } = useAccountSummary(
    accountLogin ? String(accountLogin) : undefined,
    { enabled: isScreenFocused },
  );
  const liveAccountEquity = useLiveAccountState((s) => s.equity);
  const liveAccountMargin = useLiveAccountState((s) => s.margin);
  const liveAccountMarginLevel = useLiveAccountState((s) => s.margin_level);
  const overlayAccountMetrics = useMemo(() => {
    const hasLiveMetrics =
      (Number.isFinite(liveAccountEquity) && liveAccountEquity > 0) ||
      (Number.isFinite(liveAccountMargin) && liveAccountMargin > 0) ||
      (Number.isFinite(liveAccountMarginLevel) && liveAccountMarginLevel > 0);

    return {
      equity: hasLiveMetrics ? liveAccountEquity : accountSummary?.equity ?? 0,
      margin: hasLiveMetrics ? liveAccountMargin : accountSummary?.margin ?? 0,
      marginLevel: hasLiveMetrics ? liveAccountMarginLevel : accountSummary?.marginLevel ?? 0,
    };
  }, [
    liveAccountEquity,
    liveAccountMargin,
    liveAccountMarginLevel,
    accountSummary?.equity,
    accountSummary?.margin,
    accountSummary?.marginLevel,
  ]);


  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, tradeVolumeBounds);
    if (Math.abs(normalized - tradeVolume) > 0.000001) {
      setTradeVolume(normalized);
      return;
    }
    if (!footerLotEditorFocused) {
      setFooterLotDraft(formatTradeVolume(normalized, tradeVolumeBounds));
    }
  }, [footerLotEditorFocused, setFooterLotDraft, setTradeVolume, tradeVolume, tradeVolumeBounds]);

  const updateTradeVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeTradeVolume(nextVolume, tradeVolumeBounds);
      setTradeVolume(normalized);
      setFooterLotDraft(formatTradeVolume(normalized, tradeVolumeBounds));
    },
    [setFooterLotDraft, setTradeVolume, tradeVolumeBounds],
  );
  const resolveFooterLotCommitDraft = useCallback((draftOverride?: string) => resolveFooterLotCommitDraftValue({
    draftOverride,
    draftRef: footerLotDraftRef.current,
    currentDraft: lotInput,
  }), [lotInput]);
  const commitLotDraft = useCallback((draftOverride?: string) => {
    const nextDraft = resolveFooterLotCommitDraft(draftOverride);

    if (!nextDraft.trim()) {
      setFooterLotDraft(formatTradeVolume(tradeVolume, tradeVolumeBounds));
      return;
    }
    updateTradeVolume(nextDraft);
  }, [resolveFooterLotCommitDraft, setFooterLotDraft, tradeVolume, tradeVolumeBounds, updateTradeVolume]);
  const handleOpenFooterLotPicker = useCallback((mode: FooterLotPickerMode = 'absolute') => {
    commitLotDraft();
    setFooterLotEditorFocused(false);
    setFooterLotEditorOpening(false);
    Keyboard.dismiss();
    setFooterLotPickerMode((current) => (current === mode ? null : mode));
  }, [commitLotDraft]);
  const handleCloseFooterLotPicker = useCallback(() => {
    setFooterLotPickerMode(null);
  }, []);
  const handleSelectFooterLot = useCallback(
    (nextVolume: number) => {
      updateTradeVolume(nextVolume);
      setFooterLotPickerMode(null);
    },
    [updateTradeVolume],
  );

  const handleFooterLotDraftChange = useCallback((text: string) => {
    setFooterLotDraft(sanitizeTradeVolumeDraft(text));
  }, [setFooterLotDraft]);
  const handleFocusFooterLotEditor = useCallback(() => {
    setFooterLotPickerMode(null);
    setFooterLotDraft(formatTradeVolume(tradeVolume, tradeVolumeBounds));
    setFooterLotEditorOpening(Platform.OS === 'android');
    setFooterLotEditorFocused(true);
  }, [setFooterLotDraft, tradeVolume, tradeVolumeBounds]);
  const finishFooterLotEditor = useCallback((draftOverride?: string) => {
    // Always prefer the ref (latest typed value) when no explicit override given
    commitLotDraft(draftOverride ?? footerLotDraftRef.current);
    setFooterLotEditorOpening(false);
    setFooterLotEditorFocused(false);
  }, [commitLotDraft]);
  const handleBlurFooterLotEditor = useCallback(() => {
    finishFooterLotEditor();
  }, [finishFooterLotEditor]);
  const handleEndFooterLotEditor = useCallback((event: TextInputCommitEvent) => {
    finishFooterLotEditor(event.nativeEvent.text);
  }, [finishFooterLotEditor]);
  const handleSubmitFooterLotEditor = useCallback((event?: TextInputCommitEvent) => {
    finishFooterLotEditor(event?.nativeEvent.text);
    Keyboard.dismiss();
  }, [finishFooterLotEditor]);
  const handleStepFooterLotEditor = useCallback((direction: -1 | 1) => {
    const nextVolume = incrementTradeVolume(tradeVolume, direction, tradeVolumeBounds);
    updateTradeVolume(nextVolume);
  }, [tradeVolume, tradeVolumeBounds, updateTradeVolume]);
  const committedLotDisplay = useMemo(
    () => formatTradeVolume(tradeVolume, tradeVolumeBounds),
    [tradeVolume, tradeVolumeBounds],
  );
  const passiveLotDisplay = footerLotEditorFocused
    ? lotInput || committedLotDisplay
    : committedLotDisplay;

  const [tradeFeedback, setTradeFeedback] = useState<TradeFeedbackState>(TRADE_MODAL_INITIAL);
  const handleTradeFeedbackClose = useCallback(() => setTradeFeedback(TRADE_MODAL_INITIAL), []);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const [showChartTradeSheet, setShowChartTradeSheet] = useState(false);
  const [chartTradeOrderType, setChartTradeOrderType] = useState<ChartOrderType>('Market Execution');
  const [chartTradePrice, setChartTradePrice] = useState(0);
  const [chartTradeStopLimitPrice, setChartTradeStopLimitPrice] = useState(0);
  const [chartTradeSlEnabled, setChartTradeSlEnabled] = useState(false);
  const [chartTradeSlPrice, setChartTradeSlPrice] = useState(0);
  const [chartTradeTpEnabled, setChartTradeTpEnabled] = useState(false);
  const [chartTradeTpPrice, setChartTradeTpPrice] = useState(0);
  const [chartTradeComment, setChartTradeComment] = useState('');
  const [chartTradeCommentFocused, setChartTradeCommentFocused] = useState(false);
  const [chartTradeExpiration, setChartTradeExpiration] = useState<'GTC' | 'Today' | 'Date and Time' | 'Date'>('GTC');
  const [chartExpirationMenuOpen, setChartExpirationMenuOpen] = useState(false);
  const [chartStepperEditor, setChartStepperEditor] = useState<{ kind: 'price' | 'stopLimitPrice' | 'tp' | 'sl' | 'volume' } | null>(null);
  const [chartTradeStopUnit, setChartTradeStopUnit] = useState<'Price' | 'Pips' | 'Currency'>('Price');
  const [chartTradeSlLocked, setChartTradeSlLocked] = useState(false);
  const [chartTradeTpLocked, setChartTradeTpLocked] = useState(false);
  const [chartTradeSheetMode, setChartTradeSheetMode] = useState<'hidden' | 'collapsed' | 'expanded'>('hidden');
  const [keyboardVisibleHeight, setKeyboardVisibleHeight] = useState(0);
  const [keyboardDockOffset, setKeyboardDockOffset] = useState(0);
  const [chartTradeSheetHostHeight, setChartTradeSheetHostHeight] = useState(0);
  const [chartTradeKeyboardFreeHostHeight, setChartTradeKeyboardFreeHostHeight] = useState(0);
  const [chartTradeInlineFooterHeight, setChartTradeInlineFooterHeight] = useState(0);
  const [chartTradeTopToolbarBottomOffset, setChartTradeTopToolbarBottomOffset] = useState(0);
  const [chartTradeCompactHeaderHeight, setChartTradeCompactHeaderHeight] = useState(0);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const setChartInlineInputActive = useUIState((s) => s.setChartInlineInputActive);
  const showActionSheet = useUIState((s) => s.showActionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const safeInsets = useSafeAreaInsets();
  const windowFrameHeight = Dimensions.get('window').height;
  const keyboardInset = useMemo(
    () => (keyboardVisibleHeight > 0 ? Math.max(0, keyboardVisibleHeight - safeInsets.bottom + 12) : 0),
    [keyboardVisibleHeight, safeInsets.bottom],
  );
  const androidFooterHostResizedForKeyboard = useMemo(() => {
    return resolveKeyboardResizesHost({
      platform: Platform.OS,
      footerLotEditorFocused,
      showChartTradeSheet,
      keyboardVisibleHeight,
      keyboardFreeHostHeight: chartTradeKeyboardFreeHostHeight,
      currentHostHeight: chartTradeSheetHostHeight,
    });
  }, [
    chartTradeKeyboardFreeHostHeight,
    chartTradeSheetHostHeight,
    footerLotEditorFocused,
    keyboardVisibleHeight,
    showChartTradeSheet,
  ]);
  const resolveKeyboardDockOffsetForFrame = useCallback((coords?: { height?: number; screenY?: number | null }) => {
    const liveWindowHeight = Dimensions.get('window').height;
    return resolveKeyboardDockOffset({
      platform: Platform.OS,
      keyboardHeight: Math.max(0, coords?.height ?? 0),
      keyboardScreenY: typeof coords?.screenY === 'number' ? coords.screenY : null,
      containerBottom: footerTradeRowAnchorBottomRef.current ?? chartTradeHostBottomRef.current,
      screenHeight: liveWindowHeight,
      safeAreaBottom: safeInsets.bottom,
    });
  }, [safeInsets.bottom]);
  const measureChartTradeHostFrame = useCallback((onMeasured?: () => void) => {
    if (!chartTradeHostRef.current) {
      onMeasured?.();
      return;
    }

    chartTradeHostRef.current.measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        chartTradeHostBottomRef.current = y + height;
      }
      onMeasured?.();
    });
  }, []);
  const measureFooterTradeRowAnchorFrame = useCallback((onMeasured?: () => void) => {
    if (!footerTradeRowAnchorRef.current) {
      onMeasured?.();
      return;
    }

    footerTradeRowAnchorRef.current.measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        footerTradeRowAnchorBottomRef.current = y + height;
      }
      onMeasured?.();
    });
  }, []);
  const measureKeyboardDockAnchors = useCallback((onMeasured?: () => void) => {
    measureChartTradeHostFrame(() => {
      measureFooterTradeRowAnchorFrame(onMeasured);
    });
  }, [measureChartTradeHostFrame, measureFooterTradeRowAnchorFrame]);
  const recomputeKeyboardDockOffset = useCallback((frameOverride?: { height: number; screenY: number | null }) => {
    const nextDockOffset = resolveKeyboardDockOffsetForFrame(frameOverride ?? keyboardFrameRef.current);
    setKeyboardDockOffset(nextDockOffset);
    return nextDockOffset;
  }, [resolveKeyboardDockOffsetForFrame]);
  const readKeyboardMetricsFrame = useCallback(() => {
    const keyboardController = Keyboard as typeof Keyboard & {
      metrics?: () => { height?: number; screenY?: number } | undefined;
    };
    const metrics = keyboardController.metrics?.();
    return {
      height: Math.max(0, metrics?.height ?? 0),
      screenY: typeof metrics?.screenY === 'number' ? metrics.screenY : null,
    };
  }, []);
  const syncKeyboardHeightFromMetrics = useCallback(() => {
    const metrics = readKeyboardMetricsFrame();
    keyboardFrameRef.current = {
      height: metrics.height,
      screenY: metrics.screenY,
    };
    const nextDockOffset = recomputeKeyboardDockOffset(keyboardFrameRef.current);

    if (metrics.height > 0 || nextDockOffset > 0) {
      setKeyboardVisibleHeight(metrics.height);
    }

    return {
      ...metrics,
      dockOffset: nextDockOffset,
    };
  }, [readKeyboardMetricsFrame, recomputeKeyboardDockOffset]);
  const screenHeight = Dimensions.get('window').height;
  const fullscreenChartMinHeight = Math.max(320, screenHeight);
  const chartTradeSheetCollapsedHeight = 120;
  const fullscreenToolbarTouchBuffer = 18;
  const fullscreenToolbarTopPadding = safeInsets.top + fullscreenToolbarTouchBuffer;
  const chartTradeSheetFallbackTopInset = isChartExpanded ? fullscreenToolbarTopPadding + 36 : 48;
  const chartTradeSheetToolbarBottomInset =
    chartTradeTopToolbarBottomOffset > 0
      ? Math.max(chartTradeTopToolbarBottomOffset, chartTradeSheetFallbackTopInset)
      : chartTradeSheetFallbackTopInset;
  const chartTradeSheetTopInset = chartTradeSheetToolbarBottomInset + CHART_TRADE_SHEET_TOP_GAP;
  const chartTradeSheetFallbackHostHeight = Math.max(
    chartTradeSheetCollapsedHeight + 180,
    screenHeight - Math.max(safeInsets.top, 0),
  );
  const resolvedChartTradeSheetHostHeight =
    chartTradeSheetHostHeight > 0 ? chartTradeSheetHostHeight : chartTradeSheetFallbackHostHeight;
  const chartTradeSheetHeaderLift = resolveChartTradeSheetHeaderLift({
    topInset: chartTradeSheetTopInset,
    compactHeaderHeight: chartTradeCompactHeaderHeight,
    isFullscreen: isChartExpanded,
  });
  // The SL/TP sheet is opened from the chart toolbar and covers the footer
  // area while open, so the sell/lot/buy row never shows through a cutout.
  const showInlineFooterWhileChartTradeSheetOpen = false;
  const chartTradeSheetBottomInset = !isChartExpanded && showInlineFooterWhileChartTradeSheetOpen
    ? (chartTradeInlineFooterHeight > 0 ? chartTradeInlineFooterHeight : CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT)
    : 0;
  const chartTradeSheetMaxHeight = resolveChartTradeSheetMaxHeight({
    collapsedHeight: chartTradeSheetCollapsedHeight,
    hostHeight: resolvedChartTradeSheetHostHeight,
    topInset: chartTradeSheetTopInset,
    headerLift: chartTradeSheetHeaderLift,
    bottomInset: chartTradeSheetBottomInset,
  });
  const chartTradeSheetExpandedTranslateY = 0;
  const chartTradeSheetCollapsedTranslateY = Math.max(0, chartTradeSheetMaxHeight - chartTradeSheetCollapsedHeight);
  const chartTradeSheetHiddenTranslateY = chartTradeSheetMaxHeight + 18;
  const fullscreenChartTypeMenuTop = safeInsets.top + 52 + (fullscreenToolbarTouchBuffer - 8);
  const fullscreenDrawingToolsSheetTopInset = fullscreenToolbarTopPadding + 72;
  const drawingToolsSheetTopInset = isChartExpanded
    ? fullscreenDrawingToolsSheetTopInset + 24
    : safeInsets.top + 80;
  const chartScrollRef = useRef<ScrollView>(null);
  const chartTradeHostRef = useRef<View>(null);
  const footerTradeRowAnchorRef = useRef<View>(null);
  const chartTradeSheetScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsOverlayScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsInlineScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsOverlayLayoutsRef = useRef<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>({});
  const chartTradeTypeTabsInlineLayoutsRef = useRef<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>({});
  const chartTradeTypeTabsOverlayViewportWidthRef = useRef(0);
  const chartTradeTypeTabsInlineViewportWidthRef = useRef(0);
  const chartTradeCommentInputRef = useRef<TextInput>(null);
  const chartTradeCommentSubmitIntentRef = useRef(false);
  const chartTradeSheetScrollOffsetRef = useRef(0);
  const keyboardFrameRef = useRef<{ height: number; screenY: number | null }>({ height: 0, screenY: null });
  const chartTradeHostBottomRef = useRef<number | null>(null);
  const footerTradeRowAnchorBottomRef = useRef<number | null>(null);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [chartTapMenuAnchor, setChartTapMenuAnchor] = useState<ChartTapMenuAnchor | null>(null);
  const [chartTapMenuBounds, setChartTapMenuBounds] = useState<ChartTapMenuBounds>({ width: 0, height: 0 });
  const [chartTapMenuViewport, setChartTapMenuViewport] = useState<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const [chartPlotArea, setChartPlotArea] = useState<FixedHorizontalGridPlotArea | null>(null);
  const [showDrawingQuickActions, setShowDrawingQuickActions] = useState(false);
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [stickyDrawingMode, setStickyDrawingMode] = useState(false);
  const [chartViewportTouchActive, setChartViewportTouchActive] = useState(false);
  const pendingChartDrawingTool = useUIState((s) => s.pendingChartDrawingTool);
  const clearPendingChartDrawingTool = useUIState((s) => s.clearPendingChartDrawingTool);
  const shouldCaptureChartGestures =
    isChartExpanded || activeTool !== 'crosshair' || Boolean(pendingChartDrawingTool);

  const webViewRef = useRef<WebView>(null);
  const chartViewportRef = useRef<View>(null);
  const chartTapMenuBoundsRef = useRef<ChartTapMenuBounds>({ width: 0, height: 0 });
  const chartTapMenuViewportRef = useRef<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const chartTapMenuSuppressUntilRef = useRef(0);
  const lastChartViewportSizeRef = useRef({ width: 0, height: 0 });
  const pendingChartViewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const chartViewportResizeFrameRef = useRef<number | null>(null);
  const chartViewportResizeCommitFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryTokenRef = useRef(0);
  const chartViewportTouchReleaseFrameRef = useRef<number | null>(null);
  const chartTradeSheetTranslateY = useSharedValue(chartTradeSheetHiddenTranslateY);
  const chartTradeSheetDragStartY = useSharedValue(chartTradeSheetCollapsedTranslateY);
  const chartTradeSheetLastVisibleOffsetRef = useRef(chartTradeSheetCollapsedTranslateY);
  const flushChartViewportResize = useCallback((force: boolean = false) => {
    const pending = pendingChartViewportSizeRef.current;
    if (!pending) {
      return;
    }
    const current = lastChartViewportSizeRef.current;
    if (!force && current.width === pending.width && current.height === pending.height) {
      return;
    }
    lastChartViewportSizeRef.current = pending;
    webViewRef.current?.injectJavaScript(`
      if (typeof resizeChartViewport === 'function') {
        resizeChartViewport(${pending.width}, ${pending.height});
      }
      true;
    `);
  }, []);
  const recoverChartViewportSurface = useCallback((width: number, height: number) => {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (!webViewRef.current) {
      return;
    }
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    webViewRef.current.injectJavaScript(`
      try {
        if (typeof recoverChartSurface === 'function') {
          recoverChartSurface(${nextWidth}, ${nextHeight});
        }
      } catch (_) {}
      true;
    `);
  }, []);
  const scheduleChartViewportResize = useCallback((width: number, height: number, force: boolean = false) => {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    pendingChartViewportSizeRef.current = { width: nextWidth, height: nextHeight };
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
    }
    chartViewportResizeFrameRef.current = requestAnimationFrame(() => {
      chartViewportResizeFrameRef.current = null;
      chartViewportResizeCommitFrameRef.current = requestAnimationFrame(() => {
        chartViewportResizeCommitFrameRef.current = null;
        flushChartViewportResize(force);
      });
    });
  }, [flushChartViewportResize]);
  const handleChartViewportTouchStart = useCallback(() => {
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
      chartViewportTouchReleaseFrameRef.current = null;
    }
    if (footerLotEditorFocused || footerLotEditorOpening || footerLotPickerMode !== null) {
      chartTapMenuSuppressUntilRef.current = Date.now() + CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS;
      setChartTapMenuAnchor(null);
    }
    if (!showChartTradeSheet) {
      if (footerLotPickerMode !== null) {
        setFooterLotPickerMode(null);
      }
      if (footerLotEditorFocused) {
        finishFooterLotEditor();
        Keyboard.dismiss();
      }
    }
    setChartViewportTouchActive((current) => (current ? current : true));
  }, [finishFooterLotEditor, footerLotEditorFocused, footerLotEditorOpening, footerLotPickerMode, showChartTradeSheet]);
  const handleChartViewportTouchEnd = useCallback(() => {
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
    }
    chartViewportTouchReleaseFrameRef.current = requestAnimationFrame(() => {
      chartViewportTouchReleaseFrameRef.current = null;
      setChartViewportTouchActive(false);
    });
  }, []);
  useEffect(() => {
    chartTapMenuBoundsRef.current = chartTapMenuBounds;
  }, [chartTapMenuBounds]);
  useEffect(() => {
    chartTapMenuViewportRef.current = chartTapMenuViewport;
  }, [chartTapMenuViewport]);

  const syncChartViewportFrame = useCallback((onMeasured?: (viewport: ChartTapMenuViewport) => void) => {
    requestAnimationFrame(() => {
      if (!chartViewportRef.current) {
        onMeasured?.(chartTapMenuViewportRef.current);
        return;
      }
      chartViewportRef.current?.measureInWindow((x, y, width, height) => {
        const hasValidFrame =
          [x, y, width, height].every((value) => Number.isFinite(value)) &&
          width > 0 &&
          height > 0;
        const nextViewport = hasValidFrame
          ? { x, y, width, height }
          : chartTapMenuViewportRef.current;
        chartTapMenuViewportRef.current = nextViewport;
        setChartTapMenuViewport((current) =>
          current.x === nextViewport.x &&
          current.y === nextViewport.y &&
          current.width === nextViewport.width &&
          current.height === nextViewport.height
            ? current
            : nextViewport,
        );
        onMeasured?.(nextViewport);
      });
    });
  }, []);
  const cancelChartViewportRecovery = useCallback(() => {
    chartViewportRecoveryTokenRef.current += 1;
    if (chartViewportRecoveryFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportRecoveryFrameRef.current);
      chartViewportRecoveryFrameRef.current = null;
    }
  }, []);
  const requestChartViewportRecovery = useCallback((passes: number = 4) => {
    const initialBounds = chartTapMenuBoundsRef.current;
    if (initialBounds.width <= 0 || initialBounds.height <= 0) {
      return;
    }

    cancelChartViewportRecovery();
    const token = chartViewportRecoveryTokenRef.current;
    let passesRemaining = Math.max(0, Math.round(passes));

    const runRecoveryPass = () => {
      if (chartViewportRecoveryTokenRef.current !== token) {
        return;
      }

      const fallbackBounds = chartTapMenuBoundsRef.current;
      syncChartViewportFrame((viewport) => {
        if (chartViewportRecoveryTokenRef.current !== token) {
          return;
        }

        const resizeWidth = viewport.width > 0 ? viewport.width : fallbackBounds.width;
        const resizeHeight = viewport.height > 0 ? viewport.height : fallbackBounds.height;
        if (resizeWidth <= 0 || resizeHeight <= 0) {
          return;
        }

        scheduleChartViewportResize(resizeWidth, resizeHeight, true);
        if (passesRemaining <= 0) {
          recoverChartViewportSurface(resizeWidth, resizeHeight);
          chartViewportRecoveryFrameRef.current = null;
          return;
        }

        passesRemaining -= 1;
        chartViewportRecoveryFrameRef.current = requestAnimationFrame(runRecoveryPass);
      });
    };

    chartViewportRecoveryFrameRef.current = requestAnimationFrame(runRecoveryPass);
  }, [cancelChartViewportRecovery, recoverChartViewportSurface, scheduleChartViewportResize, syncChartViewportFrame]);
  useEffect(() => () => {
    cancelChartViewportRecovery();
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
      chartViewportResizeFrameRef.current = null;
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
      chartViewportResizeCommitFrameRef.current = null;
    }
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
      chartViewportTouchReleaseFrameRef.current = null;
    }
  }, [cancelChartViewportRecovery]);
  useEffect(() => {
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
      chartViewportResizeFrameRef.current = null;
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
      chartViewportResizeCommitFrameRef.current = null;
    }
    cancelChartViewportRecovery();
    pendingChartViewportSizeRef.current = null;
    setChartTradeSheetHostHeight(0);
  }, [cancelChartViewportRecovery, isChartExpanded]);
  useEffect(() => {
    const { width, height } = chartTapMenuBounds;
    if (width <= 0 || height <= 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      syncChartViewportFrame((viewport) => {
        const resizeWidth = viewport.width > 0 ? viewport.width : width;
        const resizeHeight = viewport.height > 0 ? viewport.height : height;
        scheduleChartViewportResize(resizeWidth, resizeHeight);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chartTapMenuBounds.height, chartTapMenuBounds.width, scheduleChartViewportResize, syncChartViewportFrame]);
  useEffect(() => {
    requestChartViewportRecovery(4);
    return cancelChartViewportRecovery;
  }, [
    isChartExpanded,
    chartTapMenuBounds.height,
    chartTapMenuBounds.width,
    cancelChartViewportRecovery,
    requestChartViewportRecovery,
  ]);
  const { candles } = useLiveCandles(chartSymbol, chartTimeframe);
  const latestChartClose = useMemo(() => candles[candles.length - 1]?.close ?? 0, [candles]);
  const quoteFallbackSpread =
    baseSymbol.includes('BTC') ? 25 : baseSymbol.includes('XAU') || baseSymbol.includes('XAG') ? 0.3 : 0.00015;
  const chartBid = useMemo(() => {
    const liveBid = typeof chartLiveQuote?.bid === 'number' && chartLiveQuote.bid > 0 ? chartLiveQuote.bid : null;
    return liveBid ?? latestChartClose;
  }, [chartLiveQuote?.bid, latestChartClose]);
  const chartAsk = useMemo(() => {
    const liveAsk = typeof chartLiveQuote?.ask === 'number' && chartLiveQuote.ask > 0 ? chartLiveQuote.ask : null;
    return liveAsk ?? (chartBid > 0 ? chartBid + quoteFallbackSpread : 0);
  }, [chartBid, chartLiveQuote?.ask, quoteFallbackSpread]);
  const chartTradeTickTimestamp = useMemo(() => {
    const candidates = [
      chartLiveQuote?.time,
      chartLiveQuote?.timestamp,
      chartLiveQuote?.t,
      chartLiveQuote?.lastTickAt,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }

    return null;
  }, [
    chartLiveQuote?.lastTickAt,
    chartLiveQuote?.t,
    chartLiveQuote?.time,
    chartLiveQuote?.timestamp,
  ]);
  const chartPointSize = useMemo(() => {
    if (displayDecimals <= 0) return 1;
    return Math.pow(10, -displayDecimals);
  }, [displayDecimals]);
  const chartPendingOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 250;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 1.5;
    return chartPointSize * 75;
  }, [baseSymbol, chartPointSize]);
  const chartStopOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 350;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 2;
    return chartPointSize * 90;
  }, [baseSymbol, chartPointSize]);
  const chartStopLimitOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 125;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 0.75;
    return Math.max(chartPointSize * 35, chartPendingOffset / 2);
  }, [baseSymbol, chartPendingOffset, chartPointSize]);
  const roundTradePrice = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return 0;
      return Number(value.toFixed(Math.max(displayDecimals, 0)));
    },
    [displayDecimals],
  );
  const resolveDefaultPendingPrice = useCallback(
    (orderType: ChartOrderType) => {
      const bid = chartBid > 0 ? chartBid : latestChartClose;
      const ask = chartAsk > 0 ? chartAsk : bid + quoteFallbackSpread;
      switch (orderType) {
        case 'Buy Limit':
          return roundTradePrice(ask - chartPendingOffset);
        case 'Sell Limit':
          return roundTradePrice(bid + chartPendingOffset);
        case 'Buy Stop':
        case 'Buy Stop Limit':
          return roundTradePrice(ask + chartPendingOffset);
        case 'Sell Stop':
        case 'Sell Stop Limit':
          return roundTradePrice(bid - chartPendingOffset);
        default:
          return roundTradePrice(ask);
      }
    },
    [chartAsk, chartBid, chartPendingOffset, latestChartClose, quoteFallbackSpread, roundTradePrice],
  );

  const injectChartScript = (script: string) => {
    webViewRef.current?.injectJavaScript(`${script} true;`);
  };

  const closeChartTapMenu = useCallback(() => {
    setChartTapMenuAnchor(null);
  }, []);

  useEffect(() => {
    if (activeTool !== 'crosshair') {
      closeChartTapMenu();
    }
  }, [activeTool, closeChartTapMenu]);

  useEffect(() => {
    closeChartTapMenu();
  }, [chartSymbol, chartTimeframe, chartVisualType, isChartExpanded, closeChartTapMenu]);

  const handleSetTool = (tool: string) => {
    closeChartTapMenu();
    setActiveTool(tool);
    injectChartScript(`setDrawingTool(${JSON.stringify(tool)});`);
  };

  const handleClearDrawings = () => {
    closeChartTapMenu();
    setActiveTool('crosshair');
    setChartDrawingRecordsForSymbol(chartSymbol, []);
    lastWebViewDrawingSignatureRef.current = '';
    lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
    injectChartScript('clearDrawings();');
  };

  const handleToggleMagnet = () => {
    closeChartTapMenu();
    const next = !magnetEnabled;
    setMagnetEnabled(next);
    injectChartScript(`setMagnetMode(${next});`);
  };

  const handleToggleStickyMode = () => {
    closeChartTapMenu();
    const next = !stickyDrawingMode;
    setStickyDrawingMode(next);
    injectChartScript(`setStayInDrawingMode(${next});`);
  };

  const handleToggleLock = () => {
    closeChartTapMenu();
    const next = !chartLockAll;
    setChartLockAll(next);
    if (next) {
      setActiveTool('crosshair');
    }
    injectChartScript(`setDrawingsLocked(${next});`);
  };

  const handleToggleHide = () => {
    closeChartTapMenu();
    const next = !chartHideAll;
    setChartHideAll(next);
    injectChartScript(`setDrawingsHidden(${next});`);
  };

  const handleZoomTool = () => {
    closeChartTapMenu();
    injectChartScript('zoomChart();');
  };

  const resolveChartTradeSheetTranslateY = useCallback(
    (mode: 'hidden' | 'collapsed' | 'expanded') => {
      if (mode === 'expanded') {
        return chartTradeSheetExpandedTranslateY;
      }
      if (mode === 'collapsed') {
        return chartTradeSheetCollapsedTranslateY;
      }
      return chartTradeSheetHiddenTranslateY;
    },
    [
      chartTradeSheetCollapsedTranslateY,
      chartTradeSheetExpandedTranslateY,
      chartTradeSheetHiddenTranslateY,
    ],
  );

  const finalizeChartTradeSheetHide = useCallback(() => {
    chartTradeSheetLastVisibleOffsetRef.current = chartTradeSheetCollapsedTranslateY;
    chartTradeSheetDragStartY.value = chartTradeSheetCollapsedTranslateY;
    chartTradeSheetTranslateY.value = chartTradeSheetHiddenTranslateY;
    setChartTradeSheetMode('hidden');
    setShowChartTradeSheet(false);
  }, [
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetDragStartY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetTranslateY,
  ]);

  const commitChartTradeSheetOffset = useCallback((offset: number) => {
    chartTradeSheetLastVisibleOffsetRef.current = offset;
    setChartTradeSheetMode(offset >= chartTradeSheetCollapsedTranslateY - 12 ? 'collapsed' : 'expanded');
  }, [chartTradeSheetCollapsedTranslateY]);

  const snapTradeSheet = useCallback((mode: 'hidden' | 'collapsed' | 'expanded') => {
    const target = resolveChartTradeSheetTranslateY(mode);
    chartTradeSheetDragStartY.value = target;

    if (mode === 'hidden') {
      if (!showChartTradeSheet) {
        finalizeChartTradeSheetHide();
        return;
      }

      chartTradeSheetTranslateY.value = withTiming(target, { duration: 180 }, (finished) => {
        if (finished) {
          runOnJS(finalizeChartTradeSheetHide)();
        }
      });
      return;
    }

    if (!showChartTradeSheet) {
      chartTradeSheetTranslateY.value = mode === 'expanded' ? target : chartTradeSheetHiddenTranslateY;
      setShowChartTradeSheet(true);
    }

    chartTradeSheetLastVisibleOffsetRef.current = target;
    setChartTradeSheetMode(mode);
    requestAnimationFrame(() => {
      chartTradeSheetTranslateY.value = withSpring(target, {
        damping: 26,
        stiffness: 240,
        overshootClamping: true,
      });
    });
  }, [
    chartTradeSheetDragStartY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetTranslateY,
    finalizeChartTradeSheetHide,
    resolveChartTradeSheetTranslateY,
    showChartTradeSheet,
  ]);

  const resolveChartTradeEntryPrice = useCallback((orderType: ChartOrderType) => {
    if (isPendingChartOrderType(orderType)) {
      return resolveDefaultPendingPrice(orderType);
    }
    const side = getChartOrderSide(orderType);
    return roundTradePrice(side === 'buy' ? chartAsk : chartBid);
  }, [chartAsk, chartBid, resolveDefaultPendingPrice, roundTradePrice]);

  const resetChartTradePanelLevels = useCallback((orderType: ChartOrderType = chartTradeOrderType) => {
    const side = getChartOrderSide(orderType);
    const entryPrice = resolveChartTradeEntryPrice(orderType);
    setChartTradePrice(entryPrice);
    setChartTradeStopLimitPrice(
      resolveDefaultStopLimitPrice(orderType, entryPrice, chartStopLimitOffset, roundTradePrice),
    );
    setChartTradeSlEnabled(false);
    setChartTradeTpEnabled(false);
    setChartTradeSlPrice(resolveTradeStopPreviewPrice('sl', entryPrice, side, chartStopOffset, roundTradePrice));
    setChartTradeTpPrice(resolveTradeStopPreviewPrice('tp', entryPrice, side, chartStopOffset, roundTradePrice));
    setChartTradeComment('');
    setChartTradeCommentFocused(false);
  }, [chartStopLimitOffset, chartStopOffset, chartTradeOrderType, resolveChartTradeEntryPrice, roundTradePrice]);

  const openChartTradeSheet = useCallback((orderType: ChartOrderType = chartTradeOrderType) => {
    closeChartTapMenu();
    setFooterLotPickerMode(null);
    if (footerLotEditorFocused) {
      finishFooterLotEditor();
    } else {
      setFooterLotEditorOpening(false);
    }
    Keyboard.dismiss();
    setChartTradeOrderType(orderType);
    resetChartTradePanelLevels(orderType);
    snapTradeSheet('collapsed');
  }, [
    chartTradeOrderType,
    closeChartTapMenu,
    finishFooterLotEditor,
    footerLotEditorFocused,
    resetChartTradePanelLevels,
    snapTradeSheet,
  ]);

  const handleOpenChartTradeSheet = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.open', openChartTradeSheet);
  }, [openChartTradeSheet]);


  const scrollChartTradeTypeTabsToOrderType = useCallback((orderType: ChartOrderType, animated: boolean = true) => {
    const scrollListToOrderType = (
      scrollRef: React.RefObject<ScrollView | null>,
      layoutsRef: React.MutableRefObject<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>,
      viewportWidthRef: React.MutableRefObject<number>,
    ) => {
      const layout = layoutsRef.current[orderType];
      if (!layout || viewportWidthRef.current <= 0) {
        return;
      }

      const targetX = Math.max(0, layout.x - Math.max(16, (viewportWidthRef.current - layout.width) / 2));
      scrollRef.current?.scrollTo({ x: targetX, animated });
    };

    requestAnimationFrame(() => {
      scrollListToOrderType(
        chartTradeTypeTabsOverlayScrollRef,
        chartTradeTypeTabsOverlayLayoutsRef,
        chartTradeTypeTabsOverlayViewportWidthRef,
      );
      scrollListToOrderType(
        chartTradeTypeTabsInlineScrollRef,
        chartTradeTypeTabsInlineLayoutsRef,
        chartTradeTypeTabsInlineViewportWidthRef,
      );
    });
  }, []);

  const handleChartTradeOrderTypeSelect = useCallback((orderType: ChartOrderType) => {
    traceUiInteraction(`chart.tradeSheet.orderType.${orderType}`, () => {
      setChartTradeOrderType(orderType);
      const side = getChartOrderSide(orderType);
      const nextEntry = resolveChartTradeEntryPrice(orderType);
      setChartTradePrice(nextEntry);
      setChartTradeStopLimitPrice(
        resolveDefaultStopLimitPrice(orderType, nextEntry, chartStopLimitOffset, roundTradePrice),
      );
      setChartTradeSlPrice(resolveTradeStopPreviewPrice('sl', nextEntry, side, chartStopOffset, roundTradePrice));
      setChartTradeTpPrice(resolveTradeStopPreviewPrice('tp', nextEntry, side, chartStopOffset, roundTradePrice));
      // Don't force-expand on tab switch — keep the sheet at its current
      // snap position so the tabs stay in place and only the content changes.
      // Reset the scroll position so the new tab's content starts at the top.
      chartTradeSheetScrollRef.current?.scrollTo?.({ y: 0, animated: false });
    });
  }, [chartStopLimitOffset, chartStopOffset, resolveChartTradeEntryPrice, roundTradePrice, chartTradeSheetScrollRef]);

  useEffect(() => {
    if (!showChartTradeSheet) {
      return;
    }

    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType, showChartTradeSheet]);

  const handleEnableChartTradeStops = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.enableStops', () => {
      const baseEntry = isPendingChartOrderType(chartTradeOrderType)
        ? chartTradePrice
        : resolveChartTradeEntryPrice(chartTradeOrderType);
      const side = getChartOrderSide(chartTradeOrderType);
      if (!chartTradeSlEnabled) {
        setChartTradeSlEnabled(true);
        setChartTradeSlPrice(resolveTradeStopPreviewPrice('sl', baseEntry, side, chartStopOffset, roundTradePrice));
      }
      if (!chartTradeTpEnabled) {
        setChartTradeTpEnabled(true);
        setChartTradeTpPrice(resolveTradeStopPreviewPrice('tp', baseEntry, side, chartStopOffset, roundTradePrice));
      }
      snapTradeSheet('expanded');
    });
  }, [
    chartStopOffset,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeTpEnabled,
    resolveChartTradeEntryPrice,
    roundTradePrice,
    snapTradeSheet,
  ]);

  const handleToggleChartTradeStopLevel = useCallback((kind: 'sl' | 'tp') => {
    const baseEntry = isPendingChartOrderType(chartTradeOrderType)
      ? chartTradePrice
      : resolveChartTradeEntryPrice(chartTradeOrderType);
    const side = getChartOrderSide(chartTradeOrderType);
    const nextPrice = resolveTradeStopPreviewPrice(kind, baseEntry, side, chartStopOffset, roundTradePrice);

    if (kind === 'sl') {
      if (chartTradeSlEnabled) {
        setChartTradeSlEnabled(false);
        return;
      }
      setChartTradeSlEnabled(true);
      setChartTradeSlPrice(nextPrice);
      return;
    }

    if (chartTradeTpEnabled) {
      setChartTradeTpEnabled(false);
      return;
    }
    setChartTradeTpEnabled(true);
    setChartTradeTpPrice(nextPrice);
  }, [
    chartStopOffset,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeTpEnabled,
    resolveChartTradeEntryPrice,
    roundTradePrice,
  ]);
  const handleSubmitPendingTradeFromSheet = useCallback(() => {
    const previewLines = [
      `${t('Type')}: ${t(chartTradeOrderType)}`,
      `${t('Price')}: ${chartTradePrice.toFixed(displayDecimals)}`,
    ];
    if (isStopLimitChartOrderType(chartTradeOrderType)) {
      previewLines.push(`${t('Stop Limit Price')}: ${chartTradeStopLimitPrice.toFixed(displayDecimals)}`);
    }
    if (chartTradeSlEnabled) {
      previewLines.push(`S/L: ${chartTradeSlPrice.toFixed(displayDecimals)}`);
    }
    if (chartTradeTpEnabled) {
      previewLines.push(`T/P: ${chartTradeTpPrice.toFixed(displayDecimals)}`);
    }
    previewLines.push(`${t('Expiration')}: ${t(chartTradeExpiration)}`);
    if (chartTradeComment.trim()) {
      previewLines.push(`${t('Comment')}: ${chartTradeComment.trim()}`);
    }
    Alert.alert(
      t('Pending Order Preview'),
      `${previewLines.join('\n')}\n\n${t('Chart-side pending submission is still preview-only in this build.')}`,
    );
  }, [
    chartTradeComment,
    chartTradeExpiration,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeStopLimitPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    displayDecimals,
    t,
  ]);
  const handleToggleChartTradeSheetMode = useCallback(() => {
    snapTradeSheet(chartTradeSheetMode === 'expanded' ? 'collapsed' : 'expanded');
  }, [chartTradeSheetMode, snapTradeSheet]);
  const handleOpenChartExpirationMenu = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.expiration.open', () => {
      setFooterLotPickerMode(null);
      setChartTradeCommentFocused(false);
      Keyboard.dismiss();
      showActionSheet({
        title: 'Expiration',
        actions: [
          { label: 'GTC', onPress: () => setChartTradeExpiration('GTC') },
          { label: 'Today', onPress: () => setChartTradeExpiration('Today') },
          { label: 'Date and Time', onPress: () => setChartTradeExpiration('Date and Time') },
          { label: 'Date', onPress: () => setChartTradeExpiration('Date') },
        ],
      });
    });
  }, [showActionSheet]);
  const handleFocusChartTradeComment = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.comment.focus', () => {
      if (chartTradeSheetMode !== 'expanded') {
        snapTradeSheet('expanded');
      }
      setChartTradeCommentFocused(true);
    });
  }, [chartTradeSheetMode, snapTradeSheet]);
  const handleBlurChartTradeComment = useCallback(() => {
    if (chartTradeCommentSubmitIntentRef.current) {
      chartTradeCommentSubmitIntentRef.current = false;
      return;
    }
    setChartTradeCommentFocused(false);
  }, []);
  const handleSubmitChartTradeComment = useCallback(() => {
    chartTradeCommentSubmitIntentRef.current = false;
    const nextComment = chartTradeComment.trim();
    if (nextComment !== chartTradeComment) {
      setChartTradeComment(nextComment);
    }
    setChartTradeCommentFocused(false);
    Keyboard.dismiss();
  }, [chartTradeComment]);
  const handlePrepareChartTradeCommentSubmit = useCallback(() => {
    chartTradeCommentSubmitIntentRef.current = true;
  }, []);
  const handleChangeChartTradeComment = useCallback((text: string) => {
    setChartTradeComment(text.slice(0, 50));
  }, []);
  const handleChartTradeSheetScroll = useCallback((offsetY: number) => {
    chartTradeSheetScrollOffsetRef.current = offsetY;
  }, []);
  const handleOverlayTradeTypeTabsViewportLayout = useCallback((width: number) => {
    chartTradeTypeTabsOverlayViewportWidthRef.current = width;
    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType]);
  const handleInlineTradeTypeTabsViewportLayout = useCallback((width: number) => {
    chartTradeTypeTabsInlineViewportWidthRef.current = width;
    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType]);
  const handleOverlayTradeTypeTabLayout = useCallback((orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => {
    chartTradeTypeTabsOverlayLayoutsRef.current[orderType] = layout;
  }, []);
  const handleInlineTradeTypeTabLayout = useCallback((orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => {
    chartTradeTypeTabsInlineLayoutsRef.current[orderType] = layout;
  }, []);
  const handleOpenChartTradeVolumeStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
  }, []);
  const handleOpenChartTradePriceStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
  }, []);
  const handleOpenChartTradeStopLimitPriceStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.stopLimitPrice', () => setChartStepperEditor({ kind: 'stopLimitPrice' }));
  }, []);
  const handleSelectChartTradeStopUnit = useCallback((unit: 'Price' | 'Pips' | 'Currency') => {
    traceUiInteraction(`chart.tradeSheet.stopUnit.${unit}`, () => setChartTradeStopUnit(unit));
  }, []);
  const handleOpenChartTradeSlStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.sl', () => setChartStepperEditor({ kind: 'sl' }));
  }, []);
  const handleOpenChartTradeTpStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.tp', () => setChartStepperEditor({ kind: 'tp' }));
  }, []);
  const handleToggleChartTradeSlLock = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((value) => !value));
  }, []);
  const handleToggleChartTradeTpLock = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((value) => !value));
  }, []);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const scheduleKeyboardLayoutAnimation =
      (Keyboard as typeof Keyboard & { scheduleLayoutAnimation?: (event: unknown) => void }).scheduleLayoutAnimation;

    const showSub = Keyboard.addListener(showEvent, (event) => {
      scheduleKeyboardLayoutAnimation?.(event);
      const nextHeight = Math.max(0, event.endCoordinates.height);
      keyboardFrameRef.current = {
        height: nextHeight,
        screenY: typeof event.endCoordinates.screenY === 'number' ? event.endCoordinates.screenY : null,
      };
      setKeyboardVisibleHeight(nextHeight);
      setFooterLotEditorOpening(false);
      measureKeyboardDockAnchors(() => {
        recomputeKeyboardDockOffset(keyboardFrameRef.current);
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (event) {
        scheduleKeyboardLayoutAnimation?.(event);
      }
      keyboardFrameRef.current = { height: 0, screenY: null };
      setKeyboardVisibleHeight(0);
      setKeyboardDockOffset(0);
      setFooterLotEditorOpening(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [measureKeyboardDockAnchors, recomputeKeyboardDockOffset]);
  useEffect(() => {
    if (!chartTradeCommentFocused || !showChartTradeSheet) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chartTradeCommentInputRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chartTradeCommentFocused, showChartTradeSheet]);

  useEffect(() => {
    if (!footerLotEditorFocused || showChartTradeSheet) {
      return;
    }
    let cancelled = false;
    let frame: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = Platform.OS === 'android' ? 8 : 2;

    const focusLotInput = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      footerLotEditorInputRef.current?.focus();
      syncKeyboardHeightFromMetrics();

      if (attempts < maxAttempts) {
        timeoutId = setTimeout(focusLotInput, 80);
      }
    };

    frame = requestAnimationFrame(() => {
      requestAnimationFrame(focusLotInput);
    });

    return () => {
      cancelled = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [footerLotEditorFocused, showChartTradeSheet, syncKeyboardHeightFromMetrics]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorOpening ||
      showChartTradeSheet
    ) {
      return;
    }

    if (keyboardVisibleHeight > 0 || keyboardDockOffset > 0) {
      setFooterLotEditorOpening(false);
    }
  }, [footerLotEditorOpening, keyboardDockOffset, keyboardVisibleHeight, showChartTradeSheet]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      keyboardDockOffset > 0
    ) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;

    const syncUntilKeyboardVisible = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      measureKeyboardDockAnchors(() => {
        const metrics = syncKeyboardHeightFromMetrics();
        if (metrics.dockOffset > 0 || metrics.height > 0 || attempts >= 24 || cancelled) {
          return;
        }

        rafId = requestAnimationFrame(syncUntilKeyboardVisible);
      });
    };

    rafId = requestAnimationFrame(syncUntilKeyboardVisible);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [footerLotEditorFocused, keyboardDockOffset, measureKeyboardDockAnchors, showChartTradeSheet, syncKeyboardHeightFromMetrics]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      keyboardVisibleHeight <= 0 ||
      keyboardDockOffset <= 0
    ) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;

    const syncUntilDockSettles = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      measureKeyboardDockAnchors(() => {
        const metrics = syncKeyboardHeightFromMetrics();
        if (cancelled || metrics.dockOffset <= 0 || attempts >= 16) {
          return;
        }

        rafId = requestAnimationFrame(syncUntilDockSettles);
      });
    };

    rafId = requestAnimationFrame(syncUntilDockSettles);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    footerLotEditorFocused,
    keyboardDockOffset,
    keyboardVisibleHeight,
    measureKeyboardDockAnchors,
    showChartTradeSheet,
    syncKeyboardHeightFromMetrics,
  ]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      footerLotEditorOpening ||
      showChartTradeSheet ||
      keyboardVisibleHeight > 0 ||
      keyboardDockOffset > 0
    ) {
      return;
    }

    finishFooterLotEditor();
  }, [
    finishFooterLotEditor,
    footerLotEditorFocused,
    footerLotEditorOpening,
    keyboardDockOffset,
    keyboardVisibleHeight,
    showChartTradeSheet,
  ]);

  useEffect(() => {
    if (showChartTradeSheet) {
      setFooterLotPickerMode(null);
      setFooterLotEditorFocused(false);
      setFooterLotEditorOpening(false);
      return;
    }
    setChartTradeCommentFocused(false);
    chartTradeCommentSubmitIntentRef.current = false;
  }, [showChartTradeSheet]);

  useEffect(() => {
    if (!showChartTradeSheet) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      chartTradeSheetScrollOffsetRef.current = 0;
      chartTradeSheetScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [showChartTradeSheet]);

  useEffect(() => {
    if (!showChartTradeSheet || chartTradeSheetMode === 'hidden') {
      chartTradeSheetLastVisibleOffsetRef.current = chartTradeSheetCollapsedTranslateY;
      chartTradeSheetTranslateY.value = chartTradeSheetHiddenTranslateY;
      chartTradeSheetDragStartY.value = chartTradeSheetCollapsedTranslateY;
      return;
    }

    const nextTranslateY = Math.min(
      chartTradeSheetCollapsedTranslateY,
      Math.max(chartTradeSheetExpandedTranslateY, chartTradeSheetLastVisibleOffsetRef.current),
    );
    chartTradeSheetTranslateY.value = nextTranslateY;
    chartTradeSheetDragStartY.value = nextTranslateY;
  }, [
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetDragStartY,
    chartTradeSheetExpandedTranslateY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetMode,
    chartTradeSheetTranslateY,
    showChartTradeSheet,
  ]);

  const chartTradeSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chartTradeSheetTranslateY.value }],
  }));

  const chartTradeSheetDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-4, 4])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          chartTradeSheetDragStartY.value = chartTradeSheetTranslateY.value;
        })
        .onUpdate((event) => {
          chartTradeSheetTranslateY.value = Math.min(
            chartTradeSheetHiddenTranslateY,
            Math.max(
              chartTradeSheetExpandedTranslateY,
              chartTradeSheetDragStartY.value + event.translationY,
            ),
          );
        })
        .onEnd((event) => {
          const current = chartTradeSheetTranslateY.value;
          const hideOffsetThreshold = chartTradeSheetCollapsedTranslateY + 24;

          if (
            current > hideOffsetThreshold ||
            (event.velocityY > 900 && current > chartTradeSheetCollapsedTranslateY - 6)
          ) {
            runOnJS(snapTradeSheet)('hidden');
            return;
          }

          const restingOffset = Math.min(
            chartTradeSheetCollapsedTranslateY,
            Math.max(chartTradeSheetExpandedTranslateY, current),
          );

          chartTradeSheetTranslateY.value = withSpring(restingOffset, {
            damping: 28,
            stiffness: 260,
            overshootClamping: true,
          });
          chartTradeSheetDragStartY.value = restingOffset;
          runOnJS(commitChartTradeSheetOffset)(restingOffset);
        })
        .onFinalize(() => {
          chartTradeSheetDragStartY.value = chartTradeSheetTranslateY.value;
        }),
    [
      chartTradeSheetCollapsedTranslateY,
      commitChartTradeSheetOffset,
      chartTradeSheetCollapsedTranslateY,
      chartTradeSheetDragStartY,
      chartTradeSheetExpandedTranslateY,
      chartTradeSheetHiddenTranslateY,
      chartTradeSheetTranslateY,
      snapTradeSheet,
    ],
  );

  const isPendingChartOrder = isPendingChartOrderType(chartTradeOrderType);
  // Keep one stable sheet shell across Market Execution and every pending tab.
  // Only the order-specific content should change when the user switches tabs.
  const useMtPendingTradeSheetLayout = false;
  const isStopLimitChartOrder = isStopLimitChartOrderType(chartTradeOrderType);
  // Keep auxiliary order metadata visible on every chart trade tab so
  // Market Execution and all pending-order variants share one consistent form.
  const showChartTradeExpiration = true;
  const showChartTradeComment = true;
  const chartTradeSheetSide = getChartOrderSide(chartTradeOrderType);
  const chartTradeEntryPrice = isPendingChartOrder
    ? chartTradePrice
    : chartTradeSheetSide === 'buy'
      ? chartAsk
      : chartBid;
  const [stablePendingTradePlaceButtonEnabled, setStablePendingTradePlaceButtonEnabled] = useState(true);
  const pendingTradeValidationConfigKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPendingChartOrder) {
      pendingTradeValidationConfigKeyRef.current = null;
      setStablePendingTradePlaceButtonEnabled(true);
      return;
    }

    const nextConfigKey = `${chartTradeOrderType}:${chartTradePrice}:${chartTradeStopLimitPrice}`;
    const shouldResetFromRawValidity = pendingTradeValidationConfigKeyRef.current !== nextConfigKey;
    const rawValidity = isPendingChartTradeValid({
      orderType: chartTradeOrderType,
      entryPrice: chartTradePrice,
      stopLimitPrice: chartTradeStopLimitPrice,
      bid: chartBid,
      ask: chartAsk,
      pointSize: chartPointSize,
    });

    setStablePendingTradePlaceButtonEnabled((previouslyEnabled) =>
      resolveStablePendingChartTradeEnabled({
        orderType: chartTradeOrderType,
        entryPrice: chartTradePrice,
        stopLimitPrice: chartTradeStopLimitPrice,
        bid: chartBid,
        ask: chartAsk,
        pointSize: chartPointSize,
        previouslyEnabled: shouldResetFromRawValidity ? rawValidity : previouslyEnabled,
      }),
    );

    pendingTradeValidationConfigKeyRef.current = nextConfigKey;
  }, [
    chartAsk,
    chartBid,
    chartPointSize,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeStopLimitPrice,
    isPendingChartOrder,
  ]);

  const disablePendingTradePlaceButton = isPendingChartOrder
    ? !stablePendingTradePlaceButtonEnabled
    : false;
  const chartTradeCtaColor = chartTradeSheetSide === 'buy' ? BLUE : T.trading.sell.primary;
  const chartTradeMarginPerLot = useMemo(() => {
    const leverage = accountSummary?.leverage || 100;
    const contractSize = getChartTradeContractSize(chartSymbol);
    const referencePrice = chartTradeEntryPrice > 0 ? chartTradeEntryPrice : chartAsk;
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      return 0;
    }
    return (contractSize * referencePrice) / leverage;
  }, [accountSummary?.leverage, chartAsk, chartSymbol, chartTradeEntryPrice]);
  const chartTradeMarginEstimate = useMemo(() => {
    if (!Number.isFinite(chartTradeMarginPerLot) || chartTradeMarginPerLot <= 0) {
      return 0;
    }
    return tradeVolume * chartTradeMarginPerLot;
  }, [chartTradeMarginPerLot, tradeVolume]);
  const applyChartTradePreviewDragPrice = useCallback(
    (dragKey: ChartTradePreviewDragKey, rawPrice: number) => {
      if (!showChartTradeSheet || !Number.isFinite(rawPrice) || rawPrice <= 0) {
        return;
      }

      const nextPrice = roundTradePrice(rawPrice);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return;
      }

      switch (dragKey) {
        case 'entry':
          if (!isPendingChartOrder) {
            return;
          }
          setChartTradePrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'stopLimit':
          if (!isStopLimitChartOrder) {
            return;
          }
          setChartTradeStopLimitPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'sl':
          if (!chartTradeSlEnabled) {
            return;
          }
          setChartTradeSlPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'tp':
          if (!chartTradeTpEnabled) {
            return;
          }
          setChartTradeTpPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
      }
    },
    [
      chartTradeSlEnabled,
      chartTradeTpEnabled,
      isPendingChartOrder,
      isStopLimitChartOrder,
      roundTradePrice,
      showChartTradeSheet,
    ],
  );
  const handleChartTradePreviewDragMessage = useCallback(
    (msg: any) => {
      const dragKey = msg?.dragKey;
      if (dragKey !== 'entry' && dragKey !== 'stopLimit' && dragKey !== 'sl' && dragKey !== 'tp') {
        return;
      }

      if (msg?.phase === 'start') {
        closeChartTapMenu();
      }

      const nextPrice = typeof msg?.price === 'number' ? msg.price : NaN;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return;
      }

      if (msg?.phase !== 'end') {
        return;
      }

      applyChartTradePreviewDragPrice(dragKey, nextPrice);
    },
    [applyChartTradePreviewDragPrice, closeChartTapMenu],
  );
  const accountFreeMargin = Number((accountSummary as any)?.freeMargin ?? (accountSummary as any)?.free_margin ?? 0);
  const chartTradeMaxVolume = useMemo(
    () => resolveMaxTradeVolumeForMargin(accountFreeMargin, chartTradeMarginPerLot, tradeVolumeBounds),
    [accountFreeMargin, chartTradeMarginPerLot, tradeVolumeBounds],
  );
  const chartTradeMaxVolumeDisplay = useMemo(
    () => (chartTradeMaxVolume > 0 ? formatLooseTradeVolumeLabel(chartTradeMaxVolume, tradeVolumeBounds) : '0'),
    [chartTradeMaxVolume, tradeVolumeBounds],
  );
  // The comment editor is always inline inside the trade sheet ScrollView.
  // No floating/detached comment editor – the ScrollView auto-scrolls to
  // keep the focused TextInput visible, and keyboard compensation keeps
  // the trade sheet at its full height on Android.
  const showFloatingChartTradeCommentEditor = false;
  const floatingChartTradeCommentOffset = 0;
  // On Android with adjustResize, the window shrinks when the keyboard opens.
  // The host-height freeze activates predictively (as soon as the user focuses
  // a TextInput) so the onLayout handler rejects the smaller height BEFORE the
  // window actually shrinks. This keeps chartTradeSheetHostHeight stable.
  const shouldFreezeChartTradeSheetHostHeight =
    Platform.OS === 'android' &&
    showChartTradeSheet &&
    (chartTradeCommentFocused || footerLotEditorFocused || keyboardVisibleHeight > 0);
  // When the keyboard is visible and the freeze is active, give the overlay
  // layer an explicit fixed height equal to the frozen host height. This
  // makes the layer independent of parent bounds (which shrink due to
  // adjustResize). When the keyboard is not visible, use 0 to signal
  // "use absoluteFillObject as normal".
  const chartTradeSheetFrozenLayerHeight =
    Platform.OS === 'android' && shouldFreezeChartTradeSheetHostHeight && resolvedChartTradeSheetHostHeight > 0
      ? resolvedChartTradeSheetHostHeight
      : 0;
  const chartTradeSheetFooterDockReserve = 0;
  const chartTradeSheetContentBottomPadding = (
    safeInsets.bottom +
    chartTradeSheetFooterDockReserve +
    (keyboardInset > 0 ? keyboardInset + 16 : 14)
  );
  const {
    shouldMountFloatingFooterTradeRow,
    isFloatingFooterTradeRowVisible,
    footerTradeRowKeyboardOffset,
  } = resolveFooterTradeRowState({
    platform: Platform.OS,
    footerLotEditorFocused,
    footerLotEditorOpening,
    showChartTradeSheet,
    keyboardVisibleHeight,
    keyboardDockOffset,
    keyboardResizesHost: androidFooterHostResizedForKeyboard,
  });
  const shouldHideChartTabBarForInlineInput = shouldHideChartTabBarForTradeInput({
    showChartTradeSheet,
    chartTradeCommentFocused,
  });
  const floatingFooterTradeReserveHeight = useSharedValue(0);
  const floatingFooterTradeReserveAnimatedStyle = useAnimatedStyle(() => ({
    minHeight: floatingFooterTradeReserveHeight.value,
  }));
  const accountCurrency = accountSummary?.currency || 'USD';
  const isChartTradeMarginMode = chartTradeVolumeDisplayMode === 'margin';
  const chartTradeVolumePrimaryDisplay = isChartTradeMarginMode
    ? `${fmt.price(chartTradeMarginEstimate)} ${accountCurrency}`
    : passiveLotDisplay;
  const chartTradeVolumeModeLabel = isChartTradeMarginMode ? 'Margin' : 'Lots';
  const handleToggleChartTradeVolumeDisplayMode = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.volumeDisplay.toggle', () => {
      const nextMode: ChartTradeVolumeDisplayMode =
        chartTradeVolumeDisplayMode === 'margin'
          ? 'lots'
          : 'margin';
      setChartTradeVolumeDisplayMode(nextMode);
    });
  }, [chartTradeVolumeDisplayMode, setChartTradeVolumeDisplayMode]);
  const chartTradeStopUnitOptions = useMemo(() => {
    if (!isPendingChartOrder) {
      return [
        { key: 'Price' as const, label: 'Price' },
        { key: 'Pips' as const, label: 'Pips' },
      ];
    }

    return [
      { key: 'Price' as const, label: 'Price' },
      { key: 'Pips' as const, label: 'Pips' },
      { key: 'Currency' as const, label: 'Currency' },
    ];
  }, [isPendingChartOrder]);
  useEffect(() => {
    if (!isPendingChartOrder && chartTradeStopUnit === 'Currency') {
      setChartTradeStopUnit('Price');
    }
  }, [chartTradeStopUnit, isPendingChartOrder]);
  useEffect(() => {
    if (!showChartTradeComment) {
      setChartTradeCommentFocused(false);
      chartTradeCommentSubmitIntentRef.current = false;
    }
  }, [showChartTradeComment]);
  // When expiration visibility toggles off (e.g. order type changed), no need
  // to call hideActionSheet() — the global sheet manages its own lifecycle.
  useEffect(() => {
    setChartInlineInputActive(shouldHideChartTabBarForInlineInput);
    return () => {
      setChartInlineInputActive(false);
    };
  }, [setChartInlineInputActive, shouldHideChartTabBarForInlineInput]);
  useEffect(() => {
    floatingFooterTradeReserveHeight.value = withTiming(shouldMountFloatingFooterTradeRow ? 58 : 0, {
      duration: 220,
    });
  }, [floatingFooterTradeReserveHeight, shouldMountFloatingFooterTradeRow]);
  const showChartTradePreviewLinesOnChart = shouldShowChartTradePreviewOnChart({
    showChartTradeSheet,
    chartTradeSheetMode,
  });
  const showChartTradeSheetHeader = shouldShowChartTradeSheetHeader({
    chartTradeSheetMode,
  });
  const showChartTradeStopLabelsOnChart = showChartTradePreviewLinesOnChart;
  const chartTradePreviewEntryLabel = useMemo(() => {
    if (!showChartTradePreviewLinesOnChart || !isPendingChartOrder) {
      return '';
    }

    return `${chartTradeOrderType.toUpperCase()} ${formatTradeVolume(tradeVolume, tradeVolumeBounds)}`.trim();
  }, [chartTradeOrderType, isPendingChartOrder, showChartTradePreviewLinesOnChart, tradeVolume, tradeVolumeBounds]);
  const chartTradePreviewLines = useMemo<ChartOverlayPriceLine[]>(() => {
    if (!showChartTradePreviewLinesOnChart) {
      return [];
    }

    const entryPrice = chartTradeEntryPrice;
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return [];
    }

    const previewLines: ChartOverlayPriceLine[] = [];
    const contractSize = getChartTradeContractSize(chartSymbol);
    const pendingEntryColor = isDark ? '#94A3B8' : '#475569';
    const pointsFor = (targetPrice: number) => Math.max(1, Math.round(Math.abs(targetPrice - entryPrice) / chartPointSize));
    const usdFor = (targetPrice: number) => Math.abs(targetPrice - entryPrice) * contractSize * tradeVolume;

    if (isPendingChartOrderType(chartTradeOrderType)) {
      previewLines.push({
        id: 'chart-trade-entry-preview',
        price: entryPrice,
        color: pendingEntryColor,
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: chartTradePreviewEntryLabel,
        dragKey: 'entry',
      });
    }

    if (isStopLimitChartOrder && Number.isFinite(chartTradeStopLimitPrice) && chartTradeStopLimitPrice > 0) {
      previewLines.push({
        id: 'chart-trade-stop-limit-preview',
        price: chartTradeStopLimitPrice,
        color: BLUE,
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: showChartTradeStopLabelsOnChart
          ? `STOP LIMIT ${formatTradeVolume(tradeVolume, tradeVolumeBounds)}`
          : '',
        dragKey: 'stopLimit',
      });
    }

    if (chartTradeTpEnabled && Number.isFinite(chartTradeTpPrice) && chartTradeTpPrice > 0) {
      previewLines.push({
        id: 'chart-trade-tp-preview',
        price: chartTradeTpPrice,
        color: resolvedChartColors.tradeTpSl || '#089981',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: showChartTradeStopLabelsOnChart
          ? `TP, + ${usdFor(chartTradeTpPrice).toFixed(2)} ${accountCurrency}, ${pointsFor(chartTradeTpPrice)} points`
          : '',
        dragKey: 'tp',
      });
    }

    if (chartTradeSlEnabled && Number.isFinite(chartTradeSlPrice) && chartTradeSlPrice > 0) {
      previewLines.push({
        id: 'chart-trade-sl-preview',
        price: chartTradeSlPrice,
        color: resolvedChartColors.tradeStopOut || '#F23645',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: showChartTradeStopLabelsOnChart
          ? `SL, - ${usdFor(chartTradeSlPrice).toFixed(2)} ${accountCurrency}, ${pointsFor(chartTradeSlPrice)} points`
          : '',
        dragKey: 'sl',
      });
    }

    return previewLines;
  }, [
    BLUE,
    T.trading.sell.primary,
    accountCurrency,
    chartPointSize,
    chartTradePreviewEntryLabel,
    chartSymbol,
    chartTradeEntryPrice,
    chartTradeOrderType,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeStopLimitPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    isPendingChartOrderType,
    isStopLimitChartOrder,
    isDark,
    resolvedChartColors.tradeStopOut,
    resolvedChartColors.tradeTpSl,
    showChartTradeStopLabelsOnChart,
    showChartTradePreviewLinesOnChart,
    tradeVolume,
    tradeVolumeBounds,
  ]);

  const chartType = chartVisualType;
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showChartViewportMenu, setShowChartViewportMenu] = useState(false);
  const [showTimeRangeMenu, setShowTimeRangeMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState<ChartTimeRange>('auto');
  const [customDateValue, setCustomDateValue] = useState<Date | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const [chartCanvasReady, setChartCanvasReady] = useState(false);

  const hasCandles = candles.length > 0;
  const timeRangeCandlesRef = useRef(candles);
  const chartCandles = useMemo(
    () => filterCandlesForChartTimeRange(activeDateRange, candles, customDateValue),
    [activeDateRange, candles, customDateValue],
  );
  useEffect(() => {
    timeRangeCandlesRef.current = candles;
  }, [candles]);
  const formatChartValue = useCallback(
    (value: number | null | undefined) => (Number.isFinite(value) ? Number(value).toFixed(displayDecimals) : '--'),
    [displayDecimals],
  );
  const chartMetaLastCandle = chartCandles.length > 0 ? chartCandles[chartCandles.length - 1] : null;
  const chartMetaIsUp = chartMetaLastCandle ? chartMetaLastCandle.close >= chartMetaLastCandle.open : true;
  const chartMetaItems = useMemo(
    () =>
      chartMetaLastCandle
        ? [
            { label: 'O', value: formatChartValue(chartMetaLastCandle.open) },
            { label: 'H', value: formatChartValue(chartMetaLastCandle.high) },
            { label: 'L', value: formatChartValue(chartMetaLastCandle.low) },
            { label: 'C', value: formatChartValue(chartMetaLastCandle.close) },
          ]
        : [],
    [chartMetaLastCandle, formatChartValue],
  );
  const showChartMetaRow = chartDisplay.showOHLC && chartMetaItems.length > 0;
  const showChartVolumePane = chartViewportShowVolumePane;
  const showChartDrawingToolbar = isChartExpanded && chartViewportShowDrawingToolbar;
  const applyNativeTimeRange = useCallback((range: ChartTimeRange, nextCustomDateValue?: Date | null) => {
    const visibleCandles = timeRangeCandlesRef.current;
    if (!webViewReady || !chartCanvasReady || visibleCandles.length === 0) {
      return;
    }

    if (range === 'auto') {
      injectChartScript(`
        try {
          if (typeof window.__rtx5ApplyRecentViewport === 'function') {
            window.__rtx5ApplyRecentViewport();
          } else if (chart && chart.timeScale) {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
            if (typeof window.__rtx5ResetPriceScale === 'function') {
              window.__rtx5ResetPriceScale();
            }
          }
        } catch (_) {}
      `);
      return;
    }

    if (range === 'all') {
      injectChartScript(`
        try {
          if (typeof window.__rtx5ResetTimeScale === 'function') {
            window.__rtx5ResetTimeScale();
          }
          if (chart && chart.timeScale) {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
          }
          if (typeof window.__rtx5ResetPriceScale === 'function') {
            window.__rtx5ResetPriceScale();
          }
        } catch (_) {}
      `);
      return;
    }

    const visibleRange = resolveChartVisibleRange(range, visibleCandles, nextCustomDateValue ?? customDateValue);
    if (!visibleRange) {
      return;
    }

    injectChartScript(`
        try {
          if (typeof window.__rtx5ResetTimeScale === 'function') {
            window.__rtx5ResetTimeScale();
          }
          if (chart && chart.timeScale && typeof chart.timeScale().setVisibleRange === 'function') {
            chart.timeScale().setVisibleRange({
              from: ${visibleRange.from},
              to: ${visibleRange.to},
            });
          }
          if (typeof window.__rtx5ResetPriceScale === 'function') {
            window.__rtx5ResetPriceScale();
          }
        } catch (_) {}
      `);
  }, [chartCanvasReady, customDateValue, webViewReady]);

  const handleRangePress = useCallback((range: ChartTimeRange) => {
    hideActionSheet();
    setActiveDateRange(range);
    setCustomDateValue(null);

    applyNativeTimeRange(range, null);
  }, [applyNativeTimeRange]);

  const handleCustomDateRange = useCallback((selectedDate: Date) => {
    setCustomDateValue(selectedDate);
    setActiveDateRange('custom');
    setShowDatePicker(false);
    applyNativeTimeRange('custom', selectedDate);
  }, [applyNativeTimeRange]);

  const handleResetChartViewport = useCallback(() => {
    traceUiInteraction('chart.viewport.reset', () => {
      hideActionSheet();
      closeChartTapMenu();
      applyNativeTimeRange(activeDateRange, customDateValue);
    });
  }, [activeDateRange, applyNativeTimeRange, closeChartTapMenu, customDateValue, hideActionSheet]);
  const resetChartActionSheetContext = useCallback(() => {
    closeChartTapMenu();
    setFooterLotPickerMode(null);
    setFooterLotEditorFocused(false);
    setChartTradeCommentFocused(false);
    Keyboard.dismiss();
  }, [closeChartTapMenu]);
  const handleOpenChartViewportMenu = useCallback(() => {
    traceUiInteraction('chart.viewport.menu.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: 'Chart',
        actions: [
          {
            label: showChartVolumePane ? 'Hide Volume Bar' : 'Show Volume Bar',
            icon: <Ionicons name={showChartVolumePane ? 'eye-off-outline' : 'bar-chart-outline'} size={20} color={TEXT_MUTED} />,
            onPress: () => setChartViewportShowVolumePane(!showChartVolumePane),
          },
          ...(isChartExpanded
            ? [{
                label: chartViewportShowDrawingToolbar ? 'Hide Drawing Tools' : 'Show Drawing Tools',
                icon: <Ionicons name={chartViewportShowDrawingToolbar ? 'eye-off-outline' : 'pencil-outline'} size={20} color={TEXT_MUTED} />,
                onPress: () => setChartViewportShowDrawingToolbar(!chartViewportShowDrawingToolbar),
              }]
            : []),
          {
            label: 'Reset',
            icon: <Ionicons name="refresh-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleResetChartViewport,
          },
        ],
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, showChartVolumePane, isChartExpanded, chartViewportShowDrawingToolbar, setChartViewportShowVolumePane, setChartViewportShowDrawingToolbar, handleResetChartViewport]);

  const handleToggleChartVolumePane = useCallback(() => {
    setChartViewportShowVolumePane(!showChartVolumePane);
  }, [setChartViewportShowVolumePane, showChartVolumePane]);
  const handleToggleChartDrawingToolbar = useCallback(() => {
    setChartViewportShowDrawingToolbar(!chartViewportShowDrawingToolbar);
  }, [chartViewportShowDrawingToolbar, setChartViewportShowDrawingToolbar]);

  const warmChartContextAndCommit = useCallback(
    (nextSymbol: string, nextTimeframe: string) => {
      if (nextSymbol !== chartSymbol) {
        setChartSymbol(nextSymbol);
        void prefetchInstrument(nextSymbol);
      }
      if (nextTimeframe !== chartTimeframe) {
        setChartTimeframe(nextTimeframe);
      }
    },
    [chartSymbol, chartTimeframe, setChartSymbol, setChartTimeframe],
  );

  const handleTimeframeSelect = useCallback((nextTimeframe: string) => {
    traceUiInteraction(`chart.timeframe.${nextTimeframe}`, () => {
      if (nextTimeframe === chartTimeframe) {
        closeChartTapMenu();
        hideActionSheet();
        return;
      }

      closeChartTapMenu();
      hideActionSheet();
      setActiveDateRange('auto');
      setCustomDateValue(null);
      warmChartContextAndCommit(chartSymbol, nextTimeframe);
    });
  }, [chartSymbol, chartTimeframe, closeChartTapMenu, hideActionSheet, warmChartContextAndCommit]);

  const handleSymbolSelect = useCallback((nextSymbol: string) => {
    traceUiInteraction(`chart.symbol.${nextSymbol}`, () => {
      if (nextSymbol === chartSymbol) {
        hideActionSheet();
        closeChartTapMenu();
        return;
      }

      hideActionSheet();
      closeChartTapMenu();
      setActiveDateRange('auto');
      setCustomDateValue(null);
      warmChartContextAndCommit(nextSymbol, chartTimeframe);
    });
  }, [chartSymbol, chartTimeframe, closeChartTapMenu, hideActionSheet, warmChartContextAndCommit]);

  const handleOpenSymbolPicker = useCallback(() => {
    traceUiInteraction('chart.symbolPicker.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: 'Select Symbol',
        searchable: true,
        detent: 'large',
        runActionAfterClose: false,
        actions: availableSymbols.map((sym) => ({
          label: sym,
          onPress: () => handleSymbolSelect(sym),
        })),
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, availableSymbols, handleSymbolSelect]);

  const handleOpenTimeframePicker = useCallback(() => {
    traceUiInteraction('chart.timeframePicker.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: 'Timeframes',
        runActionAfterClose: false,
        actions: timeframes.map((tf) => ({ label: tf, onPress: () => handleTimeframeSelect(tf) })),
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, timeframes, handleTimeframeSelect]);

  const handleOpenChartTypePicker = useCallback(() => {
    traceUiInteraction('chart.chartType.open', () => {
      closeChartTapMenu();
      setShowChartTypeMenu(true);
    });
  }, [closeChartTapMenu]);
  const handleCloseChartTypePicker = useCallback(() => {
    setShowChartTypeMenu(false);
  }, []);
  const handleSelectChartType = useCallback((nextType: 'candles' | 'hollow' | 'bars' | 'line') => {
    traceUiInteraction(`chart.chartType.select.${nextType}`, () => {
      setChartVisualType(nextType);
      setShowChartTypeMenu(false);
    });
  }, [setChartVisualType]);

  const handleOpenObjectsScreen = useCallback(() => {
    traceUiInteraction('chart.objects.open', () => {
      closeChartTapMenu();
      requestAnimationFrame(() => {
        router.push('/chart/objects');
      });
    });
  }, [closeChartTapMenu]);

  const handleOpenSignalDetails = useCallback(() => {
    traceUiInteraction('chart.signalDetails.open', () => {
      closeChartTapMenu();
      setShowSignalDetails(true);
    });
  }, [closeChartTapMenu]);

  const handleOpenDrawingTools = useCallback(() => {
    traceUiInteraction('chart.drawingTools.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: 'Drawing Tools',
        minimumTopInset: drawingToolsSheetTopInset,
        actions: createDrawingToolsActionSheetActions({
          chartHideAll,
          chartLockAll,
          magnetEnabled,
          onClearDrawings: handleClearDrawings,
          onSelectTool: handleSetTool,
          onToggleHide: handleToggleHide,
          onToggleLock: handleToggleLock,
          onToggleMagnet: handleToggleMagnet,
          onToggleStickyMode: handleToggleStickyMode,
          onZoomTool: handleZoomTool,
          stickyDrawingMode,
        }),
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, drawingToolsSheetTopInset, magnetEnabled, stickyDrawingMode, chartLockAll, chartHideAll, handleSetTool, handleZoomTool, handleToggleMagnet, handleToggleStickyMode, handleToggleLock, handleToggleHide, handleClearDrawings]);

  const handleOpenSettingsScreen = useCallback(() => {
    traceUiInteraction('chart.settings.open', () => {
      closeChartTapMenu();
      requestAnimationFrame(() => {
        router.push('/chart/settings');
      });
    });
  }, [closeChartTapMenu]);

  const handleToggleChartExpanded = useCallback(() => {
    traceUiInteraction('chart.expand.toggle', () => {
      closeChartTapMenu();
      setIsChartExpanded(!isChartExpanded);
    });
  }, [closeChartTapMenu, isChartExpanded, setIsChartExpanded]);

  const handleChartMoreRemoveFromFavorites = useCallback(() => {
    hideActionSheet();
  }, [hideActionSheet]);

  const handleOpenChartTradingCalculator = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/calculator', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  const handleOpenChartAnalytics = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/analytics', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  const handleOpenChartSpecification = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/specification', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  const handleOpenMoreMenu = useCallback(() => {
    traceUiInteraction('chart.moreMenu.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: 'Options',
        actions: [
          {
            label: 'Remove from favorites',
            icon: <Ionicons name="star" size={20} color={TEXT_MUTED} />,
            onPress: handleChartMoreRemoveFromFavorites,
          },
          {
            label: 'Trading calculator',
            icon: <Ionicons name="calculator-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleOpenChartTradingCalculator,
          },
          {
            label: 'Analytics',
            icon: <Ionicons name="analytics-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleOpenChartAnalytics,
          },
          {
            label: 'Specification',
            icon: <Ionicons name="clipboard-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleOpenChartSpecification,
          },
        ],
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, handleChartMoreRemoveFromFavorites, handleOpenChartTradingCalculator, handleOpenChartAnalytics, handleOpenChartSpecification]);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: resolvedChartColors.background },
      textColor: resolvedChartColors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent' },
      // Horizontal grid lines are rendered in a fixed overlay layer so they
      // stay locked to screen space during vertical price-range panning.
      horzLines: { color: 'transparent' },
    },
    crosshair: {
      mode: 0,
      vertLine: { color: resolvedChartColors.foreground, width: 1, labelBackgroundColor: resolvedChartColors.foreground },
      horzLine: { color: resolvedChartColors.foreground, width: 1, labelBackgroundColor: resolvedChartColors.foreground },
    },
    timeScale: {
      borderColor: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
      barSpacing: CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
      minBarSpacing: CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
      shiftVisibleRangeOnNewBar: true,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: true,
    },
    rightPriceScale: {
      borderColor: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
      autoScale: true,
      entireTextOnly: true,
      scaleMargins: {
        top: 0.08,
        bottom: showChartVolumePane && chartType !== 'line' ? 0.32 : 0.08,
      },
    },
    customColors: {
      candlesUptrend: resolvedChartColors.candlesUptrend,
      candlesDowntrend: resolvedChartColors.candlesDowntrend,
      hollowBody: resolvedChartColors.hollowBody,
      barsUptrend: resolvedChartColors.barsUptrend,
      barsDowntrend: resolvedChartColors.barsDowntrend,
      lineBody: resolvedChartColors.lineBody,
    }
  }), [chartDisplay.showGrid, chartType, resolvedChartColors, showChartVolumePane]);

  const [overlaySyncRevision, setOverlaySyncRevision] = useState(0);
  // Monotonic counter — incremented every time the WebView confirms
  // CHART_READY.  Used as a dependency in the overlay effect so it
  // always re-fires after a chart (re-)initialization, even when the
  // overlay payload itself hasn't changed.
  const [chartReadyEpoch, setChartReadyEpoch] = useState(0);
  // Keep the latest overlay payload in a ref so the onMessage handler
  // can push it immediately on CHART_READY without waiting for the
  // React effect cycle — this eliminates the "flash of missing lines"
  // race condition.
  const overlayPayloadRef = useRef<any>({ priceLines: [], markers: [] });
  const drawingSignatureRef = useRef(chartDrawingSignature);
  const lastWebViewDrawingSignatureRef = useRef('');
  const lastInjectedDrawingSyncRef = useRef({ signature: '', epoch: -1 });
  // Loading overlay: show until chart is confirmed rendered OR 3s fallback.
  // This prevents the user from seeing a blank WebView between data arrival
  // and chart render completion.
  const [loadingFallback, setLoadingFallback] = useState(false);
  useEffect(() => {
    setLoadingFallback(false);
    const tmr = setTimeout(() => setLoadingFallback(true), 3000);
    return () => clearTimeout(tmr);
  }, [chartSymbol, chartTimeframe, chartType]);
  useEffect(() => {
    drawingSignatureRef.current = chartDrawingSignature;
  }, [chartDrawingSignature]);
  const requestOverlaySync = useCallback(() => {
    setOverlaySyncRevision((revision) => revision + 1);
  }, []);
  const refreshShowOnChartSources = useCallback(() => {
    requestOverlaySync();
    if (accountLogin) {
      refreshPositions(String(accountLogin));
    }
    void refetchOrders();
    void refetchClosedPositions();
    void refetchAlerts();
    void refetchAccountSummary();
  }, [
    accountLogin,
    refreshPositions,
    refetchOrders,
    refetchClosedPositions,
    refetchAlerts,
    refetchAccountSummary,
    requestOverlaySync,
  ]);
  useFocusEffect(
    useCallback(() => {
      refreshShowOnChartSources();
      requestChartViewportRecovery(3);
      return cancelChartViewportRecovery;
    }, [cancelChartViewportRecovery, refreshShowOnChartSources, requestChartViewportRecovery]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isScreenFocused) {
        refreshShowOnChartSources();
        requestChartViewportRecovery(3);
      }
    });

    return () => subscription.remove();
  }, [isScreenFocused, refreshShowOnChartSources, requestChartViewportRecovery]);
  const isLoading = !chartCanvasReady && !loadingFallback;
  const isError = false;

  useEffect(() => {
    if (!webViewReady || !chartCanvasReady) return;
    const bridgedTool = chartLockAll ? 'crosshair' : activeTool;
    injectChartScript(`
      setDrawingsLocked(${chartLockAll});
      setDrawingsHidden(${chartHideAll});
      setStayInDrawingMode(${stickyDrawingMode});
      setMagnetMode(${magnetEnabled});
      setDrawingTool(${JSON.stringify(bridgedTool)});
    `);
  }, [activeTool, webViewReady, chartCanvasReady, chartLockAll, chartHideAll, stickyDrawingMode, magnetEnabled, chartSymbol, chartTimeframe, chartType]);

  useEffect(() => {
    if (!hasCandles || !webViewReady || !chartCanvasReady) {
      return;
    }
    applyNativeTimeRange(activeDateRange, customDateValue);
  }, [activeDateRange, applyNativeTimeRange, chartCanvasReady, chartReadyEpoch, chartTimeframe, customDateValue, hasCandles, webViewReady]);

  useEffect(() => {
    if (!pendingChartDrawingTool || !chartCanvasReady || !webViewReady) {
      return;
    }

    setActiveTool(pendingChartDrawingTool);
    injectChartScript(`setDrawingTool(${JSON.stringify(pendingChartDrawingTool)});`);
    clearPendingChartDrawingTool();
  }, [pendingChartDrawingTool, chartCanvasReady, webViewReady, clearPendingChartDrawingTool]);

  // ─────────────────────────────────────────────────────────────────
  //   Self-healing chart bridge
  //
  //   Professional-grade: the chart ALWAYS renders. Period.
  //
  //   • sendInit() is the single function that pushes chart data to
  //     the WebView. It can be called any number of times safely.
  //   • A watchdog timer re-sends initChart if CHART_READY hasn't
  //     arrived within 2 seconds. Repeats every 3s until success.
  //   • On data arrival: always sends initChart (WebView is idempotent).
  //   • On WebView reload: READY resets state, next data push re-inits.
  // ─────────────────────────────────────────────────────────────────
  const candlesRef = useRef(candles);
  const chartInitializedRef = useRef(false);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const lastInitSigRef = useRef('');
  const renderedSeriesSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);
  const lastInjectedLiveQuoteSignatureRef = useRef('');
  const chartCandleFrontendPaintRef = useRef<{
    availableAt: number;
    length: number;
    signature: string;
  } | null>(null);

  const resetChartBridgeState = () => {
    chartInitializedRef.current = false;
    lastInitSigRef.current = '';
    renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    lastInjectedLiveQuoteSignatureRef.current = '';
    setChartCanvasReady(false);
    setChartPlotArea(null);
  };

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const buildMappedData = useCallback((sourceCandles: typeof candles) => {
    if (chartType === 'line') {
      return sourceCandles.map((c) => ({ time: c.time, value: c.close }));
    }
    return sourceCandles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));
  }, [chartType]);

  // Track current config signature. When it changes, mark chart as
  // not-initialized so the watchdog knows to retry for the new config.
  const currentSig = useMemo(
    () => `${chartSymbol}-${normalizeTimeframe(chartTimeframe)}-${chartType}-${showChartVolumePane ? 'vol' : 'novol'}-${chartColorsSignature}`,
    [chartSymbol, chartTimeframe, chartType, chartColorsSignature, showChartVolumePane],
  );
  useEffect(() => {
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) {
      chartCandleFrontendPaintRef.current = null;
      return;
    }

    const signature = `${currentSig}:${candles.length}:${lastCandle.time}:${lastCandle.open}:${lastCandle.high}:${lastCandle.low}:${lastCandle.close}`;
    if (chartCandleFrontendPaintRef.current?.signature === signature) {
      return;
    }

    chartCandleFrontendPaintRef.current = {
      availableAt: Date.now(),
      length: candles.length,
      signature,
    };
  }, [candles, currentSig]);

  useEffect(() => {
    // Config changed — previous CHART_READY is stale.
    if (lastInitSigRef.current !== currentSig) {
      chartInitializedRef.current = false;
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      lastInjectedLiveQuoteSignatureRef.current = '';
    }
  }, [currentSig]);

  // Core init function — safe to call repeatedly.
  // The WebView's initChart tears down any existing chart and rebuilds.
  const sendInit = useCallback(() => {
    if (!webViewRef.current || !webViewReady) return;

    // Once the current chart config is already live, incremental candle sync
    // handles quote-driven updates. Avoid re-mapping the full merged series on
    // every tick just to discover init is already current.
    if (currentSig === lastInitSigRef.current && chartInitializedRef.current) return;

    const data = candlesRef.current;
    if (data.length === 0) return;

    const mapped = buildMappedData(data);
    if (mapped.length === 0) return;

    const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mapped)}, ${displayDecimals}, ${showChartVolumePane}); true;`;
    try {
      webViewRef.current.injectJavaScript(js);
    } catch (_e) { /* WebView may have been disposed */ }
  }, [webViewReady, currentSig, chartOptions, chartType, displayDecimals, buildMappedData, showChartVolumePane]);

  // Effect 1 — send initChart whenever data or config changes.
  useEffect(() => {
    sendInit();
  }, [candles, sendInit]);

  // Effect 2 — keep the WebView aligned with the canonical candle stream.

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    const renderableCandles = candles;
    if (renderableCandles.length === 0) {
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      return;
    }

    const nextSnapshot = buildChartSeriesSnapshot(renderableCandles);
    const updateMode = getChartSeriesUpdateMode(renderedSeriesSnapshotRef.current, nextSnapshot);

    if (updateMode === 'noop') {
      return;
    }

    let didInject = false;

    try {
      if (updateMode === 'full_reload') {
        const mapped = buildMappedData(renderableCandles);
        if (mapped.length > 0) {
          webViewRef.current.injectJavaScript(
            `updateChartData(${JSON.stringify(mapped)}); true;`,
          );
          didInject = true;
        }
      } else {
        const lastCandle = renderableCandles[renderableCandles.length - 1];
        if (lastCandle) {
          webViewRef.current.injectJavaScript(
            `updateTick(${JSON.stringify(buildChartTickPayload(lastCandle, chartType))}); true;`,
          );
          didInject = true;
        }
      }
    } catch (_e) { /* WebView may have been disposed */ }

    if (didInject) {
      renderedSeriesSnapshotRef.current = nextSnapshot;
    }
  }, [candles, chartCanvasReady, chartReadyEpoch, chartType, buildMappedData]);

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    const hasBid = Number.isFinite(chartBid) && chartBid > 0;
    const hasAsk = Number.isFinite(chartAsk) && chartAsk > 0;

    if (!hasBid && !hasAsk) {
      return;
    }

    const nextSignature = [
      hasBid ? chartBid.toFixed(displayDecimals) : 'na',
      hasAsk ? chartAsk.toFixed(displayDecimals) : 'na',
    ].join('|');

    if (lastInjectedLiveQuoteSignatureRef.current === nextSignature) {
      return;
    }

    // Candle geometry must come from the canonical live-candle engine only.
    // Mutating bars here from the quote snapshot creates a second local OHLC
    // path inside the WebView and can desync merge/split behavior from the
    // history-backed series.
    try {
      webViewRef.current.injectJavaScript(`
        try {
          if (typeof setMarketPriceLines === 'function') {
            setMarketPriceLines(${hasBid ? chartBid : 'null'}, ${hasAsk ? chartAsk : 'null'});
          }
        } catch (_) {}
        true;
      `);
      lastInjectedLiveQuoteSignatureRef.current = nextSignature;
    } catch (_e) { /* WebView may have been disposed */ }
  }, [
    chartAsk,
    chartBid,
    chartCanvasReady,
    chartReadyEpoch,
    displayDecimals,
  ]);

  // Watchdog — if CHART_READY hasn't arrived, keep retrying every 3s.
  // Also acts as a self-heal: if the WebView silently loses the chart
  // (process killed, JS error, etc.), this brings it back.
  useEffect(() => {
    if (!isScreenFocused) {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      return;
    }

    if (watchdogRef.current) clearInterval(watchdogRef.current);

    watchdogRef.current = setInterval(() => {
      if (!chartInitializedRef.current && webViewReady && candlesRef.current.length > 0) {
        console.log('[CHART WATCHDOG] chart not confirmed, re-sending initChart');
        sendInit();
      }
    }, 1000);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [isScreenFocused, webViewReady, sendInit]);

  const overlayPayload = useMemo(
    () => {
      if (!preferencesHydrated) {
        return { priceLines: chartTradePreviewLines, markers: [] };
      }

      const basePayload = buildChartOverlayPayload({
        chartSymbol,
        candles,
        positions,
        orders,
        closedPositions,
        alerts,
        colors: resolvedChartColors,
        sellColor: T.trading.sell.primary,
        liveAccount: overlayAccountMetrics,
        showOnChart: chartShowOnChart,
        activeTool,
      });

      if (chartTradePreviewLines.length === 0) {
        return basePayload;
      }

      return {
        ...basePayload,
        priceLines: [...basePayload.priceLines, ...chartTradePreviewLines].sort((left, right) => left.price - right.price),
      };
    },
    [
      preferencesHydrated,
      chartSymbol,
      candles,
      positions,
      orders,
      closedPositions,
      alerts,
      resolvedChartColors,
      T.trading.sell.primary,
      overlayAccountMetrics,
      chartShowOnChart,
      activeTool,
      chartTradePreviewLines,
    ],
  );
  const overlayPayloadSignature = useMemo(() => JSON.stringify(overlayPayload), [overlayPayload]);

  // ── DEBUG: Log overlay payload every time it changes ──
  // Keep the ref in sync so the onMessage CHART_READY handler can
  // immediately push the latest overlay without waiting for the effect.
  useEffect(() => {
    overlayPayloadRef.current = overlayPayload;
  }, [overlayPayloadSignature]);
  useEffect(() => {
    if (!webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    const alreadySyncedForCurrentChart =
      lastInjectedDrawingSyncRef.current.signature === chartDrawingSignature &&
      lastInjectedDrawingSyncRef.current.epoch === chartReadyEpoch;

    if (alreadySyncedForCurrentChart) {
      return;
    }

    const signatureCameFromWebView =
      lastWebViewDrawingSignatureRef.current === chartDrawingSignature &&
      lastInjectedDrawingSyncRef.current.epoch === chartReadyEpoch;

    if (signatureCameFromWebView) {
      lastInjectedDrawingSyncRef.current = { signature: chartDrawingSignature, epoch: chartReadyEpoch };
      return;
    }

    webViewRef.current.injectJavaScript(`
      if (typeof setSerializedDrawings === 'function') {
        setSerializedDrawings(${JSON.stringify(chartDrawingRecords)});
      }
      true;
    `);
    lastInjectedDrawingSyncRef.current = { signature: chartDrawingSignature, epoch: chartReadyEpoch };
  }, [chartCanvasReady, chartDrawingRecords, chartDrawingSignature, chartReadyEpoch, webViewReady]);

  // ── Chart Overlays Bridge ───────────────────────────────────────
  // Single effect that pushes ALL 7 "Show on Chart" features to the WebView:
  //   1. Open positions (BUY/SELL entry lines)
  //   2. TP / SL / Stop / Limit levels
  //   3. Closed position markers
  //   4. Trading signals
  //   5. HMR periods
  //   6. Price alerts
  //   7. Potential Stop Out line
  //
  // MUST wait for chartCanvasReady — the WebView's applyOverlayPayload
  // requires `series` to exist. Without this gate the effect fires when
  // the HTML loads (webViewReady=true) but before the chart is initialized
  // (series=null), so applyOverlayPayload silently returns and no lines
  // appear. This was the root cause of "sometimes shows, sometimes doesn't".
  // Push overlay to WebView whenever payload changes or chart (re-)initializes.
  useEffect(() => {
    if (!isScreenFocused || !webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    const js = `
      if (typeof setChartOverlays === 'function') {
        setChartOverlays(${JSON.stringify(overlayPayload)});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(js);

    const hasOverlayContent =
      overlayPayload.priceLines.length > 0 || overlayPayload.markers.length > 0;
    if (!hasOverlayContent) {
      return;
    }

    // Periodic resync: re-push the overlay every 5 seconds so that even
    // if a single injectJavaScript call races with initChart's
    // requestAnimationFrame (series=null at call time), the overlay
    // self-heals within one cycle.
    const resyncInterval = setInterval(() => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(js);
      }
    }, 5000);

    return () => clearInterval(resyncInterval);
  }, [
    isScreenFocused,
    overlayPayloadSignature,
    webViewReady,
    chartCanvasReady,
    chartReadyEpoch,
    overlaySyncRevision,
  ]);

  const displaySymbol = chartSymbol.replace(/\//g, '');
  const symbolFlags = SYMBOL_FLAGS[baseSymbol] ?? null;
  const symbolName = SYMBOL_NAMES[baseSymbol] ?? chartSymbol;
  const symbolCategory = SYMBOL_CATEGORY[baseSymbol] ?? 'FX';
  const symbolLogo = SYMBOL_LOGOS[baseSymbol] ?? null;
  const renderChartTradeSheetTopHeader = () => (
    <View
      style={[
        styles.chartTradeSheetHeader,
        useMtPendingTradeSheetLayout && styles.chartTradeSheetHeaderPending,
      ]}
    >
      <Pressable
        style={styles.chartTradeSheetSymbolBlock}
        onPress={handleOpenSymbolPicker}
        unstable_pressDelay={0}
      >
        <View style={styles.chartTradeSheetSymbolRow}>
          <Text style={styles.chartTradeSheetSymbolText} numberOfLines={1} adjustsFontSizeToFit>
            {displaySymbol}
          </Text>
          <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
        </View>
        <Text style={styles.chartTradeSheetSymbolMeta} numberOfLines={1} adjustsFontSizeToFit>
          {symbolName}
        </Text>
      </Pressable>
      <LiveQuotePairHeader
        bid={chartBid}
        ask={chartAsk}
        changePct={chartLiveQuote?.changePct}
        styles={styles}
        displayDecimals={displayDecimals}
      />
    </View>
  );
  const renderChartTradeSheetDragHeader = () => (
    <GestureDetector gesture={chartTradeSheetDragGesture}>
      <View
        collapsable={false}
        style={[
          styles.chartTradeSheetDragRegion,
          useMtPendingTradeSheetLayout && styles.chartTradeSheetDragRegionPending,
        ]}
      >
        <Pressable
          style={styles.chartTradeSheetHandleWrap}
          onPress={handleToggleChartTradeSheetMode}
          unstable_pressDelay={0}
        >
          <View style={styles.chartTradeSheetHandle} />
        </Pressable>
        <View style={[styles.chartTradeQuickBar, styles.chartTradeQuickBarActionsOnly]}>
          <View style={styles.chartTradeQuickActions}>
            <Pressable
              style={[
                styles.chartTradeQuickChip,
                styles.chartTradeQuickChipSl,
                chartTradeSlEnabled && styles.chartTradeQuickChipSlActive,
              ]}
              onPress={() => handleToggleChartTradeStopLevel('sl')}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeQuickChipText,
                  chartTradeSlEnabled && styles.chartTradeQuickChipTextActive,
                ]}
              >
                SL
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.chartTradeQuickChip,
                styles.chartTradeQuickChipTp,
                chartTradeTpEnabled && styles.chartTradeQuickChipTpActive,
              ]}
              onPress={() => handleToggleChartTradeStopLevel('tp')}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeQuickChipText,
                  chartTradeTpEnabled && styles.chartTradeQuickChipTextActive,
                ]}
              >
                TP
              </Text>
            </Pressable>
            <Pressable
              style={styles.chartTradeQuickExpandButton}
              onPress={handleToggleChartTradeSheetMode}
              unstable_pressDelay={0}
            >
              <Ionicons
                name={chartTradeSheetMode === 'expanded' ? 'chevron-down' : 'arrow-forward'}
                size={20}
                color={BLUE}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </GestureDetector>
  );

  const sentiment = useMemo(() => getSentimentForSymbol(chartSymbol), [chartSymbol]);
  const chartTradeOverlayLayer = (
    <ChartTradeOverlayLayer
      components={{
        LiveQuotePairHeader,
        LiveTradeButtons: ChartTradeButtons,
        PendingOrderPreviewChart,
        ChartTradeVolumeSlider,
        ChartFooterLotPicker,
      }}
      styles={styles}
      isDark={isDark}
      colors={{
        blue: BLUE,
        textMuted: TEXT_MUTED,
        sellPrimary: T.trading.sell.primary,
      }}
      symbolHeader={{
        displaySymbol,
        symbolName,
        chartBid,
        chartAsk,
        changePct: chartLiveQuote?.changePct,
        displayDecimals,
      }}
      sheet={{
        showChartTradeSheet,
        showHiddenInlineTradeSheet: !isChartExpanded && showChartTradeSheet,
        showInlineFooterWhileSheetOpen: showInlineFooterWhileChartTradeSheetOpen && !isChartExpanded && showChartTradeSheet,
        showInlineFooterDockWhileSheetOpen: false,
        chartTradeSheetFrozenLayerHeight,
        chartTradeSheetCollapsedHeight,
        chartTradeSheetMaxHeight,
        chartTradeSheetAnimatedStyle,
        chartTradeSheetContentBottomPadding,
        chartTradeSheetBottomInset,
        showChartTradeSheetHeader,
        chartTradeCommentFocused,
        chartTradeSheetDragGesture,
        useMtPendingTradeSheetLayout,
        chartTradeSheetMode,
        chartTradeSheetScrollRef,
        chartTradeTypeTabsOverlayScrollRef,
        chartTradeTypeTabsInlineScrollRef,
        chartTradeOrderType,
        passiveLotDisplay,
        tradeVolume,
        tradeVolumeBounds,
        chartTradeVolumeDisplayMode,
        chartTradeVolumePrimaryDisplay,
        chartTradeVolumeModeLabel,
        chartTradeMarginEstimate: fmt.price(chartTradeMarginEstimate),
        chartTradeMaxVolumeDisplay,
        accountFreeMargin: fmt.price(accountFreeMargin),
        accountCurrency,
        chartTradePrice,
        chartTradeStopLimitPrice,
        isStopLimitChartOrder,
        chartTradeSlEnabled,
        chartTradeSlPrice,
        chartTradeTpEnabled,
        chartTradeTpPrice,
        chartTradeStopUnitOptions,
        chartTradeStopUnit,
        chartTradeSlLocked,
        chartTradeTpLocked,
        showChartTradeExpiration,
        chartTradeExpiration,
        showChartTradeComment,
        showFloatingChartTradeCommentEditor,
        chartTradeComment,
        chartTradeCommentInputRef,
        chartTradeEntryPrice,
        disablePendingTradePlaceButton,
        chartTradeCtaColor,
        candles,
        chartSymbol,
        chartBid,
        chartAsk,
        chartTradeTickTimestamp,
        onTradeResult: setTradeFeedback,
      }}
      footer={{
        showFloatingFooterTradeRow: shouldMountFloatingFooterTradeRow,
        floatingFooterTradeRowVisible: isFloatingFooterTradeRowVisible,
        footerTradeRowKeyboardOffset,
        showFooterLotPicker,
        footerLotPickerMode,
        footerLotEditorFocused,
        lotInput,
        footerLotEditorInputRef,
        floatingChartTradeCommentOffset,
      }}
      handlers={{
        onOpenSymbolPicker: handleOpenSymbolPicker,
        onToggleSheetMode: handleToggleChartTradeSheetMode,
        onToggleStopLevel: handleToggleChartTradeStopLevel,
        onTradeSheetScroll: handleChartTradeSheetScroll,
        onOverlayTabsViewportLayout: handleOverlayTradeTypeTabsViewportLayout,
        onInlineTabsViewportLayout: handleInlineTradeTypeTabsViewportLayout,
        onOverlayTabLayout: handleOverlayTradeTypeTabLayout,
        onInlineTabLayout: handleInlineTradeTypeTabLayout,
        onSelectOrderType: handleChartTradeOrderTypeSelect,
        onOpenVolumeStepper: handleOpenChartTradeVolumeStepper,
        onToggleTradeVolumeDisplayMode: handleToggleChartTradeVolumeDisplayMode,
        onChangeTradeVolume: updateTradeVolume,
        onOpenPriceStepper: handleOpenChartTradePriceStepper,
        onOpenStopLimitPriceStepper: handleOpenChartTradeStopLimitPriceStepper,
        onEnableStops: handleEnableChartTradeStops,
        onSelectStopUnit: handleSelectChartTradeStopUnit,
        onOpenSlStepper: handleOpenChartTradeSlStepper,
        onToggleSlLock: handleToggleChartTradeSlLock,
        onOpenTpStepper: handleOpenChartTradeTpStepper,
        onToggleTpLock: handleToggleChartTradeTpLock,
        onOpenExpirationMenu: handleOpenChartExpirationMenu,
        onChangeComment: handleChangeChartTradeComment,
        onBlurComment: handleBlurChartTradeComment,
        onSubmitComment: handleSubmitChartTradeComment,
        onPrepareCommentSubmit: handlePrepareChartTradeCommentSubmit,
        onFocusComment: handleFocusChartTradeComment,
        onSubmitPendingTrade: handleSubmitPendingTradeFromSheet,
        onEditLot: handleFocusFooterLotEditor,
        onOpenLotEditor: handleOpenFooterLotPicker,
        onLotDraftChange: handleFooterLotDraftChange,
        onLotDraftBlur: handleBlurFooterLotEditor,
        onLotDraftEndEditing: handleEndFooterLotEditor,
        onLotDraftSubmit: handleSubmitFooterLotEditor,
        onDecreaseLot: () => handleStepFooterLotEditor(-1),
        onIncreaseLot: () => handleStepFooterLotEditor(1),
        onCloseFooterLotPicker: handleCloseFooterLotPicker,
        onSelectFooterLot: handleSelectFooterLot,
      }}
    />
  );

  return (
    <Screen style={styles.screen} noBottomInset>
      {!isChartExpanded && (
        <View style={styles.headerWrapper}>
          <AppHeader title={t('Chart')} noBorder />
          <View
            style={styles.compactHeader}
            onLayout={(event) => {
              const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
              if (nextHeight > 0) {
                setChartTradeCompactHeaderHeight((current) => (current === nextHeight ? current : nextHeight));
              }
            }}
          >
            {/* Left: Symbol Info */}
            <Pressable
              style={styles.symbolSection}
              onPress={handleOpenSymbolPicker}
              unstable_pressDelay={0}
            >
              <View>
                <View style={styles.symbolNameRow}>
                  <Text style={[styles.symbolText, { opacity: 0.9 }]} numberOfLines={1} adjustsFontSizeToFit>{displaySymbol}</Text>
                  <View style={styles.fxBadge}>
                    <Text style={styles.fxBadgeText}>{symbolCategory}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </View>
                <Text style={styles.symbolSubText} numberOfLines={1} adjustsFontSizeToFit>{symbolName}</Text>
              </View>
            </Pressable>

            {/* Right: Live Price */}
            <View style={styles.rightSection}>
              <LivePriceHeader symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} priceSource={priceSource} candles={candles} />
            </View>
          </View>
        </View>
      )}

      <View
        ref={chartTradeHostRef}
        style={styles.flex1}
        onLayout={(event) => {
          const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
          const shouldRecordKeyboardFreeHostHeight =
            Platform.OS !== 'android' ||
            (
              keyboardVisibleHeight <= 0 &&
              !footerLotEditorFocused &&
              !footerLotEditorOpening &&
              !chartTradeCommentFocused
            );

          if (nextHeight > 0 && shouldRecordKeyboardFreeHostHeight) {
            setChartTradeKeyboardFreeHostHeight((current) => (
              current === nextHeight ? current : nextHeight
            ));
          }

          setChartTradeSheetHostHeight((current) => {
            return resolveChartTradeSheetHostHeight({
              currentHostHeight: current,
              nextHostHeight: nextHeight,
              freezeHostHeight: shouldFreezeChartTradeSheetHostHeight,
            });
          });
          requestAnimationFrame(() => {
            measureKeyboardDockAnchors(() => {
              recomputeKeyboardDockOffset();
            });
          });
        }}
      >
        <ScrollView
          ref={chartScrollRef}
          style={styles.card}
          contentContainerStyle={[
            styles.chartScrollContent,
            isChartExpanded && { minHeight: fullscreenChartMinHeight },
          ]}
          nestedScrollEnabled
          scrollEnabled={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive}
          bounces={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive}
          alwaysBounceVertical={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={() => syncChartViewportFrame()}
        >
        <View style={[styles.chartContainer, isChartExpanded && { minHeight: fullscreenChartMinHeight }]}>
          <View
            style={[styles.chartTopToolbar, isChartExpanded && { paddingTop: fullscreenToolbarTopPadding, marginTop: 0 }]}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              const nextOffset = Math.max(0, Math.round(y + height));
              setChartTradeTopToolbarBottomOffset((current) => (current === nextOffset ? current : nextOffset));
            }}
          >
            <View style={styles.toolbarButtonRow}>
              <View style={styles.toolbarSlotFirst}>
                <Pressable
                  style={styles.toolbarTimeframeButton}
                  onPress={handleOpenTimeframePicker}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>{chartTimeframe}</Text>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarTradeButton}
                  onPress={handleOpenChartTradeSheet}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Text style={styles.toolbarTradeText}>SL/TP</Text>
                </Pressable>
              </View>
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarComboButton}
                  onPress={handleOpenChartTypePicker}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Ionicons name={chartType === 'candles' || chartType === 'hollow' ? 'stats-chart' : chartType === 'bars' ? 'bar-chart-outline' : 'trending-up-outline'} size={18} color={TEXT_MUTED} />
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <ChartToolbarObjectsButton
                isDark={isDark}
                textMutedColor={TEXT_MUTED}
                onPress={handleOpenObjectsScreen}
              />
              {showTradingSignals && (
                <View style={styles.toolbarSlot}>
                  <Pressable
                    style={styles.toolbarIconButton}
                    onPress={handleOpenSignalDetails}
                    hitSlop={8}
                    unstable_pressDelay={0}
                  >
                    <View style={styles.redBoxIcon}>
                      <Ionicons name="arrow-down" size={14} color="#FFF" />
                    </View>
                  </Pressable>
                </View>
              )}
              <ChartDrawingToolbarButton
                isDark={isDark}
                textMutedColor={TEXT_MUTED}
                onPress={handleOpenDrawingTools}
              />
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarIconButton}
                  onPress={handleOpenSettingsScreen}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Ionicons name="options-outline" size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarIconButton}
                  onPress={handleToggleChartExpanded}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <ChartToolbarMoreButton
                isDark={isDark}
                textMutedColor={TEXT_MUTED}
                onPress={handleOpenMoreMenu}
              />
            </View>
          </View>
          {showChartTypeMenu ? (
            <View pointerEvents="box-none" style={styles.chartTypeMenuLayer}>
              <Pressable
                style={StyleSheet.absoluteFillObject}
                onPress={handleCloseChartTypePicker}
                unstable_pressDelay={0}
              />
              <View
                style={[
                  styles.chartTypeMenuCard,
                  { top: isChartExpanded ? fullscreenChartTypeMenuTop : 56 },
                ]}
              >
                {[
                  { key: 'candles' as const, label: 'Candlestick', icon: 'stats-chart' as const },
                  { key: 'hollow' as const, label: 'Hollow Candles', icon: 'stats-chart-outline' as const },
                  { key: 'bars' as const, label: 'OHLC Bars', icon: 'bar-chart-outline' as const },
                  { key: 'line' as const, label: 'Line', icon: 'trending-up-outline' as const },
                ].map((option, index, arr) => {
                  const active = chartType === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      style={[
                        styles.chartTypeMenuOption,
                        index < arr.length - 1 && styles.chartTypeMenuOptionDivider,
                        active && styles.chartTypeMenuOptionActive,
                      ]}
                      onPress={() => handleSelectChartType(option.key)}
                      unstable_pressDelay={0}
                    >
                      <View style={styles.chartTypeMenuOptionLeft}>
                        <Ionicons
                          name={option.icon}
                          size={16}
                          color={active ? BLUE : TEXT_MUTED}
                        />
                        <Text
                          style={[
                            styles.chartTypeMenuOptionText,
                            active && styles.chartTypeMenuOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark" size={16} color={BLUE} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <ChartDrawingToolsSidebar
              activeTool={activeTool}
              chartHideAll={chartHideAll}
              chartLockAll={chartLockAll}
              colors={{ blue: BLUE, textMuted: TEXT_MUTED }}
              isChartExpanded={isChartExpanded}
              isDark={isDark}
              magnetEnabled={magnetEnabled}
              onClearDrawings={handleClearDrawings}
              onOpenDrawingTools={handleOpenDrawingTools}
              onSelectTool={handleSetTool}
              onToggleHide={handleToggleHide}
              onToggleLock={handleToggleLock}
              onToggleMagnet={handleToggleMagnet}
              onToggleStickyMode={handleToggleStickyMode}
              onZoomTool={handleZoomTool}
              showDrawingToolbar={showChartDrawingToolbar}
              stickyDrawingMode={stickyDrawingMode}
            />
            <View
              ref={chartViewportRef}
              style={styles.chartViewport}
              onTouchStart={handleChartViewportTouchStart}
              onTouchEnd={handleChartViewportTouchEnd}
              onTouchCancel={handleChartViewportTouchEnd}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                const freezeViewportResize =
                  shouldFreezeChartTradeSheetHostHeight &&
                  lastChartViewportSizeRef.current.height > 0 &&
                  height < lastChartViewportSizeRef.current.height;
                if (freezeViewportResize) {
                  return;
                }
                setChartTapMenuBounds({ width, height });
                scheduleChartViewportResize(width, height);
                syncChartViewportFrame();
              }}
            >
              {isLoading && (
                <View style={styles.chartOverlay}>
                  <ActivityIndicator size="large" color={BLUE} />
                  <Text style={styles.overlayText}>Loading chart data...</Text>
                </View>
              )}

              {isError && !isLoading && (
                <View style={styles.chartOverlay}>
                  <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.overlayText}>Unable to load chart</Text>
                  <Text style={styles.overlaySubText}>Waiting for market data connection...</Text>
                </View>
              )}

              <WebView
                key={CHART_DEV_SOURCE_KEY}
                ref={webViewRef}
                source={CHART_SOURCE}
                style={{ flex: 1, backgroundColor: resolvedChartColors.background }}
                androidLayerType="hardware"
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                cacheEnabled={!__DEV__}
                forceDarkOn={false}
                onContentProcessDidTerminate={() => {
                  console.warn('[CHART WEBVIEW] iOS background process terminated. Reloading chart strictly.');
                  resetChartBridgeState();
                  setWebViewReady(false);
                  webViewRef.current?.reload();
                }}
                onRenderProcessGone={() => {
                  console.warn('[CHART WEBVIEW] Android render process gone. Reloading chart strictly.');
                  resetChartBridgeState();
                  setWebViewReady(false);
                  webViewRef.current?.reload();
                }}
                onMessage={(event) => {
                  try {
                    const msg = JSON.parse(event.nativeEvent.data);
                    if (msg.type === 'READY') {
                      // WebView loaded — reset state and mark ready.
                      // The watchdog + Effect 1 will push initChart as soon as data exists.
                      resetChartBridgeState();
                      lastWebViewDrawingSignatureRef.current = '';
                      lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
                      setWebViewReady(true);
                    } else if (msg.type === 'CHART_READY') {
                      // Chart successfully rendered in WebView.
                      chartInitializedRef.current = true;
                      lastInitSigRef.current = currentSig;
                      setChartCanvasReady(true);
                      lastInjectedLiveQuoteSignatureRef.current = '';
                      const frontendPaint = chartCandleFrontendPaintRef.current;
                      if (frontendPaint) {
                        const frontendMs = Date.now() - frontendPaint.availableAt;
                        recordUiFeedGap(
                          'chart.candles.frontend.paint',
                          frontendMs,
                          `${chartSymbol} ${chartTimeframe} ${frontendPaint.length} candle(s)`,
                        );
                        if (typeof __DEV__ !== 'undefined' && __DEV__ && frontendMs > 3000) {
                          console.warn(
                            `[CHART] Frontend candle paint exceeded 3s after data was available: ${frontendMs}ms for ${chartSymbol} ${chartTimeframe}`,
                          );
                        }
                        chartCandleFrontendPaintRef.current = null;
                      }
                      // Bump epoch so the overlay effect always re-fires
                      // after every (re-)initialization, even when the
                      // payload itself hasn't changed.
                      setChartReadyEpoch((c) => c + 1);
                      // Immediately push the latest overlay so lines appear
                      // without waiting for the next React effect cycle.
                      try {
                        const latestOverlay = overlayPayloadRef.current ?? { priceLines: [], markers: [] };
                        const hasBid = Number.isFinite(chartBid) && chartBid > 0;
                        const hasAsk = Number.isFinite(chartAsk) && chartAsk > 0;
                        if (webViewRef.current) {
                          webViewRef.current.injectJavaScript(`
                            if (typeof setChartOverlays === 'function') {
                              setChartOverlays(${JSON.stringify(latestOverlay)});
                            }
                            if (typeof setMarketPriceLines === 'function') {
                              setMarketPriceLines(${hasBid ? chartBid : 'null'}, ${hasAsk ? chartAsk : 'null'});
                            }
                            true;
                          `);
                        }
                      } catch (_) { }
                    } else if (msg.type === 'DRAWINGS_CHANGED') {
                      const nextDrawings = sanitizePersistedChartDrawings(msg.drawings);
                      const nextSignature = JSON.stringify(nextDrawings);
                      lastWebViewDrawingSignatureRef.current = nextSignature;

                      if (nextSignature !== drawingSignatureRef.current) {
                        setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
                      }
                    } else if (msg.type === 'CHART_TOUCH_STATE') {
                      if (msg.active) {
                        handleChartViewportTouchStart();
                      } else {
                        handleChartViewportTouchEnd();
                      }
                    } else if (msg.type === 'TOOL_ACTIVE_CHANGED') {
                      setActiveTool(typeof msg.tool === 'string' ? msg.tool : 'crosshair');
                    } else if (msg.type === 'CHART_TRADE_LINE_DRAG') {
                      handleChartTradePreviewDragMessage(msg);
                    } else if (msg.type === 'CHART_TAP') {
                      if (shouldSuppressChartTapMenu({
                        activeTool,
                        footerLotEditorFocused,
                        footerLotEditorOpening,
                        footerLotPickerOpen: footerLotPickerMode !== null,
                        suppressUntil: chartTapMenuSuppressUntilRef.current,
                      })) {
                        setChartTapMenuAnchor(null);
                        return;
                      }
                      const x = typeof msg.x === 'number' ? msg.x : NaN;
                      const y = typeof msg.y === 'number' ? msg.y : NaN;
                      if (!Number.isFinite(x) || !Number.isFinite(y)) {
                        return;
                      }
                      const nextAnchor = {
                        x,
                        y,
                        price: typeof msg.price === 'number' && Number.isFinite(msg.price) ? msg.price : null,
                      };
                      syncChartViewportFrame(() => {
                        setChartTapMenuAnchor(nextAnchor);
                      });
                    } else if (msg.type === 'CHART_GEOMETRY') {
                      const nextPlotArea =
                        msg.plotArea
                        && typeof msg.plotArea.left === 'number'
                        && Number.isFinite(msg.plotArea.left)
                        && typeof msg.plotArea.top === 'number'
                        && Number.isFinite(msg.plotArea.top)
                        && typeof msg.plotArea.width === 'number'
                        && Number.isFinite(msg.plotArea.width)
                        && msg.plotArea.width > 0
                        && typeof msg.plotArea.height === 'number'
                        && Number.isFinite(msg.plotArea.height)
                        && msg.plotArea.height > 0
                          ? {
                              left: msg.plotArea.left,
                              top: msg.plotArea.top,
                              width: msg.plotArea.width,
                              height: msg.plotArea.height,
                            }
                          : null;

                      setChartPlotArea((current) => {
                        if (
                          current
                          && nextPlotArea
                          && current.left === nextPlotArea.left
                          && current.top === nextPlotArea.top
                          && current.width === nextPlotArea.width
                          && current.height === nextPlotArea.height
                        ) {
                          return current;
                        }
                        return nextPlotArea;
                      });
                    } else if (msg.type === 'ERROR') {
                      // Log but don't alert — the watchdog will auto-retry.
                      console.warn('[CHART WEBVIEW ERROR]', msg.message);
                    }
                  } catch (_e) { }
                }}
              />
              <ChartFixedHorizontalGridOverlay
                visible={chartDisplay.showGrid}
                plotArea={chartPlotArea}
                color={resolvedChartColors.grid}
              />
              <DraggableChartMetaOverlay
                visible={showChartMetaRow}
                bounds={chartTapMenuBounds}
                viewport={chartTapMenuViewport}
                items={chartMetaItems}
                isUp={chartMetaIsUp}
                upColor={resolvedChartColors.candlesUptrend}
                downColor={resolvedChartColors.candlesDowntrend}
                styles={styles}
              />
              {chartTapMenuAnchor ? (
              <ChartTapRadialMenu
                anchor={chartTapMenuAnchor}
                bounds={chartTapMenuBounds}
                activeTimeframe={chartTimeframe}
                accentColor={BLUE}
                mutedColor="#FFFFFF"
                isDark={isDark}
                onDismiss={closeChartTapMenu}
                onSelectTimeframe={handleTimeframeSelect}
                onOpenObjects={() => {
                  closeChartTapMenu();
                  router.push('/chart/objects');
                }}
                onOpenDrawingTools={() => {
                  handleOpenDrawingTools();
                }}
                onOpenIndicators={() => {
                  closeChartTapMenu();
                  router.push('/chart/indicators');
                }}

                onOpenSettings={() => {
                  closeChartTapMenu();
                  router.push('/chart/settings');
                }}
                onOpenSymbolPicker={() => {
                  closeChartTapMenu();
                  handleOpenSymbolPicker();
                }}
              />
              ) : null}
              {!showChartTradeSheet ? (
                <Pressable
                  style={styles.chartViewportMenuButton}
                  hitSlop={8}
                  onPress={handleOpenChartViewportMenu}
                >
                  <Ionicons name="ellipsis-horizontal" size={24} color={isDark ? '#E2E8F0' : '#111827'} />
                </Pressable>
              ) : null}

            </View>
          </View>
        </View>

        {!isChartExpanded && showChartTradeSheet && (
            <View
              style={[
                styles.bottomArea,
                { display: 'none', paddingBottom: 0 },
              ]}
            >
              <Animated.View
                style={[
                  { display: 'none' },
                  styles.chartTradeSheetFrame,
                  { height: chartTradeSheetMaxHeight },
                  chartTradeSheetAnimatedStyle,
                ]}
              >
                <View
                  style={[
                    styles.chartTradeSheet,
                    styles.chartTradeSheetInline,
                    styles.chartTradeSheetInlineFloating,
                    useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
                  ]}
                >
                  {renderChartTradeSheetDragHeader()}
                  {renderChartTradeSheetTopHeader()}
                  <ScrollView
                    ref={chartTradeTypeTabsInlineScrollRef}
                    horizontal
                    nestedScrollEnabled
                    directionalLockEnabled
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                    style={[
                      styles.chartTradeTypeTabsScroll,
                      useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsScrollPending,
                    ]}
                    onLayout={(event) => {
                      chartTradeTypeTabsInlineViewportWidthRef.current = event.nativeEvent.layout.width;
                      scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
                    }}
                    contentContainerStyle={[
                      styles.chartTradeTypeTabs,
                      useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsPending,
                    ]}
                  >
                    {CHART_ORDER_TYPES.map((option) => {
                      const active = option === chartTradeOrderType;
                      return (
                        <Pressable
                          key={option}
                          onLayout={(event) => {
                            chartTradeTypeTabsInlineLayoutsRef.current[option] = {
                              x: event.nativeEvent.layout.x,
                              width: event.nativeEvent.layout.width,
                            };
                          }}
                          style={[
                            styles.chartTradeTypeTab,
                            useMtPendingTradeSheetLayout && styles.chartTradeTypeTabPending,
                            active && styles.chartTradeTypeTabActive,
                            useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabPendingActive,
                          ]}
                          onPress={() => handleChartTradeOrderTypeSelect(option)}
                          unstable_pressDelay={0}
                        >
                          <Text
                            style={[
                              styles.chartTradeTypeTabText,
                              useMtPendingTradeSheetLayout && styles.chartTradeTypeTabTextPending,
                              active && styles.chartTradeTypeTabTextActive,
                              useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                            ]}
                            numberOfLines={1}
                          >
                            {option}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <ScrollView
                    ref={undefined}
                    style={styles.chartTradeSheetContentScroll}
                    contentContainerStyle={[
                      styles.chartTradeSheetContent,
                      { paddingBottom: chartTradeSheetContentBottomPadding },
                    ]}
                    nestedScrollEnabled
                    bounces={false}
                    keyboardShouldPersistTaps={chartTradeCommentFocused ? 'always' : 'handled'}
                    keyboardDismissMode={chartTradeCommentFocused ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    scrollEventThrottle={16}
                    onScroll={(event) => {
                      chartTradeSheetScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
                    }}
                  >
                    <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
                      <Pressable
                        style={[styles.chartTradeVolumeCard, useMtPendingTradeSheetLayout && styles.chartTradeVolumeCardPending]}
                        onPress={() => traceUiInteraction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }))}
                        unstable_pressDelay={0}
                      >
                        <View style={[styles.chartTradeVolumeSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeSidePending]}>
                          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Volume')}</Text>
                          <View style={styles.chartTradeVolumeValueGroup}>
                            <Text
                              style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                            >
                              {chartTradeVolumePrimaryDisplay}
                            </Text>
                            <Pressable
                              style={[
                                styles.chartTradeStepperLaunchButton,
                                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation?.();
                                traceUiInteraction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
                              }}
                              hitSlop={8}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStepperLaunchIconStack}>
                                <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                              </View>
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.chartTradeVolumeDivider} />
                        <Pressable
                          style={[styles.chartTradeVolumeUnitSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeUnitSidePending]}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            handleToggleChartTradeVolumeDisplayMode();
                          }}
                          hitSlop={8}
                          unstable_pressDelay={0}
                        >
                          <Text
                            style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {t(chartTradeVolumeModeLabel)}
                          </Text>
                          <View
                            style={[
                              styles.chartTradeStepperLaunchButton,
                              useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                            ]}
                          >
                            <View style={styles.chartTradeStepperLaunchIconStack}>
                              <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                              <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                            </View>
                          </View>
                        </Pressable>
                      </Pressable>

                      <ChartTradeVolumeSlider
                        styles={styles}
                        value={tradeVolume}
                        bounds={tradeVolumeBounds}
                        onChange={updateTradeVolume}
                      />

                      <View style={[styles.chartTradeMetaRow, useMtPendingTradeSheetLayout && styles.chartTradeMetaRowPending]}>
                        {isChartTradeMarginMode ? (
                          <Text
                            style={[styles.chartTradeMetaText, styles.chartTradeMetaSummary, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}
                            numberOfLines={1}
                          >
                            {t('Lots')}: <Text style={styles.chartTradeMetaSummaryValue}>{passiveLotDisplay}</Text>{'  '}
                            {t('Max')}: <Text style={styles.chartTradeMetaSummaryValue}>{chartTradeMaxVolumeDisplay}</Text>
                          </Text>
                        ) : (
                          <Text style={[styles.chartTradeMetaLink, useMtPendingTradeSheetLayout && styles.chartTradeMetaLinkPending]}>
                            {t('Margin')} <Text style={styles.chartTradeMetaText}>≈ {fmt.price(chartTradeMarginEstimate)} {accountCurrency}</Text>
                          </Text>
                        )}
                        <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
                          {t('Free')}: {fmt.price(accountFreeMargin)} {accountCurrency}
                        </Text>
                      </View>

                      {isPendingChartOrderType(chartTradeOrderType) && (
                        <Pressable
                          style={[
                            styles.chartTradePriceCard,
                            styles.chartTradePriceCardPending,
                            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
                          ]}
                          onPress={() => traceUiInteraction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }))}
                          unstable_pressDelay={0}
                        >
                          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Price')}</Text>
                          <View style={styles.chartTradeVolumeValueGroup}>
                            <Text
                              style={[
                                styles.chartTradePriceInput,
                                styles.chartTradePriceInputPending,
                                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                              ]}
                            >
                              {chartTradePrice > 0 ? chartTradePrice.toFixed(displayDecimals) : (chartBid > 0 ? chartBid.toFixed(displayDecimals) : '--')}
                            </Text>
                            <Pressable
                              style={[
                                styles.chartTradeStepperLaunchButton,
                                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation?.();
                                traceUiInteraction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
                              }}
                              hitSlop={8}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStepperLaunchIconStack}>
                                <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                              </View>
                            </Pressable>
                          </View>
                        </Pressable>
                      )}

                      {isStopLimitChartOrder && (
                        <Pressable
                          style={[
                            styles.chartTradePriceCard,
                            styles.chartTradePriceCardPending,
                            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
                          ]}
                          onPress={() =>
                            traceUiInteraction('chart.tradeSheet.stepper.stopLimitPrice', () =>
                              setChartStepperEditor({ kind: 'stopLimitPrice' }))
                          }
                          unstable_pressDelay={0}
                        >
                          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>
                            {t('Stop Limit Price')}
                          </Text>
                          <View style={styles.chartTradeVolumeValueGroup}>
                            <Text
                              style={[
                                styles.chartTradePriceInput,
                                styles.chartTradePriceInputPending,
                                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                              ]}
                            >
                              {chartTradeStopLimitPrice > 0 ? chartTradeStopLimitPrice.toFixed(displayDecimals) : '--'}
                            </Text>
                            <Pressable
                              style={[
                                styles.chartTradeStepperLaunchButton,
                                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation?.();
                                traceUiInteraction('chart.tradeSheet.stepper.stopLimitPrice', () =>
                                  setChartStepperEditor({ kind: 'stopLimitPrice' }));
                              }}
                              hitSlop={8}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStepperLaunchIconStack}>
                                <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                              </View>
                            </Pressable>
                          </View>
                        </Pressable>
                      )}

                      <Pressable
                        style={[styles.chartTradeStopButton, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonPending]}
                        onPress={handleEnableChartTradeStops}
                        unstable_pressDelay={0}
                      >
                        <Text style={[styles.chartTradeStopButtonText, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonTextPending]}>
                          {chartTradeSlEnabled || chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
                        </Text>
                      </Pressable>

                      {(chartTradeSlEnabled || chartTradeTpEnabled) && (
                        <View style={styles.chartTradeStopsBlock}>
                          <View style={styles.chartTradeStopUnitRow}>
                            {chartTradeStopUnitOptions.map((unit) => {
                              const active = chartTradeStopUnit === unit.key;
                              return (
                                <Pressable
                                  key={unit.key}
                                  style={[styles.chartTradeStopUnitTab, active && styles.chartTradeStopUnitTabActive]}
                                  onPress={() => traceUiInteraction(`chart.tradeSheet.stopUnit.${unit.key}`, () => setChartTradeStopUnit(unit.key))}
                                  unstable_pressDelay={0}
                                >
                                  <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{t(unit.label)}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <View style={styles.chartTradeStopPairRow}>
                            <Pressable
                              style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardSl]}
                              onPress={() => traceUiInteraction('chart.tradeSheet.stepper.sl', () => setChartStepperEditor({ kind: 'sl' }))}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStopPairSwatchSl} />
                              <Text style={styles.chartTradeStopPairLabel}>S/L</Text>
                              {chartTradeSlEnabled && (
                                <Text style={styles.chartTradeStopPairValue}>{chartTradeSlPrice.toFixed(displayDecimals)}</Text>
                              )}
                              {chartTradeStopUnit === 'Pips' && (
                                <Pressable
                                  hitSlop={8}
                                  onPress={(e) => {
                                    e.stopPropagation?.();
                                    traceUiInteraction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((v) => !v));
                                  }}
                                  style={styles.chartTradeStopPairLock}
                                >
                                  <Ionicons
                                    name={chartTradeSlLocked ? 'lock-closed' : 'lock-open-outline'}
                                    size={16}
                                    color={chartTradeSlLocked ? BLUE : TEXT_MUTED}
                                  />
                                </Pressable>
                              )}
                            </Pressable>
                            <View style={styles.chartTradeStopPairDivider} />
                            <Pressable
                              style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardTp]}
                              onPress={() => traceUiInteraction('chart.tradeSheet.stepper.tp', () => setChartStepperEditor({ kind: 'tp' }))}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStopPairSwatchTp} />
                              <Text style={styles.chartTradeStopPairLabel}>T/P</Text>
                              {chartTradeTpEnabled && (
                                <Text style={styles.chartTradeStopPairValue}>{chartTradeTpPrice.toFixed(displayDecimals)}</Text>
                              )}
                              {chartTradeStopUnit === 'Pips' && (
                                <Pressable
                                  hitSlop={8}
                                  onPress={(e) => {
                                    e.stopPropagation?.();
                                    traceUiInteraction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((v) => !v));
                                  }}
                                  style={styles.chartTradeStopPairLock}
                                >
                                  <Ionicons
                                    name={chartTradeTpLocked ? 'lock-closed' : 'lock-open-outline'}
                                    size={16}
                                    color={chartTradeTpLocked ? BLUE : TEXT_MUTED}
                                  />
                                </Pressable>
                              )}
                            </Pressable>
                          </View>
                        </View>
                      )}

                      {showChartTradeExpiration ? (
                        <Pressable
                          style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
                          onPress={handleOpenChartExpirationMenu}
                          unstable_pressDelay={0}
                        >
                          <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>{t('Expiration')}:</Text>
                          <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{t(chartTradeExpiration)}</Text>
                          <Ionicons name="swap-vertical" size={12} color={BLUE} />
                        </Pressable>
                      ) : null}
                      {showChartTradeComment ? (
                        <View style={[styles.chartTradeCommentBlock, useMtPendingTradeSheetLayout && styles.chartTradeCommentBlockPending]}>
                          {chartTradeCommentFocused && !showFloatingChartTradeCommentEditor ? (
                            <View style={styles.chartTradeCommentEditorInlineRow}>
                              <View style={styles.chartTradeCommentEditorInlineInputWrap}>
                                <TextInput
                                  ref={chartTradeCommentInputRef}
                                  style={styles.chartTradeCommentEditorInlineInput}
                                  value={chartTradeComment}
                                  onChangeText={(text) => setChartTradeComment(text.slice(0, 50))}
                                  onBlur={handleBlurChartTradeComment}
                                  placeholder={t('Comment')}
                                  placeholderTextColor='#94A3B8'
                                  maxLength={31}
                                  multiline={false}
                                  returnKeyType='done'
                                  onSubmitEditing={handleSubmitChartTradeComment}
                                />
                              </View>
                              <Pressable
                                onPressIn={() => {
                                  chartTradeCommentSubmitIntentRef.current = true;
                                }}
                                style={[
                                  styles.chartTradeCommentEditorInlineSubmit,
                                  !chartTradeComment.trim() && styles.chartTradeCommentEditorSubmitDisabled,
                                ]}
                                disabled={!chartTradeComment.trim()}
                                onPress={handleSubmitChartTradeComment}
                              >
                                <Ionicons
                                  name='checkmark'
                                  size={16}
                                  color={chartTradeComment.trim() ? BLUE : '#94A3B8'}
                                />
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              style={[
                                styles.chartTradeInfoRow,
                                useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending,
                                chartTradeCommentFocused && styles.chartTradeCommentInfoRowActive,
                              ]}
                              onPress={handleFocusChartTradeComment}
                            >
                              <Text
                                style={[
                                  styles.chartTradeInfoLabel,
                                  useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending,
                                  styles.chartTradeCommentInlineLabel,
                                ]}
                              >
                                {t('Comment')}:
                              </Text>
                              <Text
                                style={[
                                  styles.chartTradeCommentInlineValue,
                                  !chartTradeComment.trim() && styles.chartTradeCommentInlinePlaceholder,
                                  useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending,
                                  chartTradeCommentFocused && styles.chartTradeCommentInlineValueActive,
                                ]}
                                numberOfLines={1}
                              >
                                {chartTradeComment.trim() || t('Add comment')}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      ) : null}

                      {chartTradeOrderType === 'Market Execution' ? (
                        <ChartTradeButtons
                          symbol={chartSymbol}
                          displayDecimals={displayDecimals}
                          lotSize={tradeVolume}
                          volumeBounds={tradeVolumeBounds}
                          comment={chartTradeComment}
                          variant='mt5-market'
                          onTradeResult={setTradeFeedback}
                          isDark={isDark}
                          buyColor={BLUE}
                          sellColor={T.trading.sell.primary}
                        />
                      ) : (
                        <>
                          <Pressable
                            style={[
                              styles.chartTradePlaceButton,
                              disablePendingTradePlaceButton
                                ? styles.chartTradePlaceButtonDisabled
                                : { backgroundColor: chartTradeCtaColor },
                            ]}
                            onPress={disablePendingTradePlaceButton ? undefined : handleSubmitPendingTradeFromSheet}
                            disabled={disablePendingTradePlaceButton}
                          >
                            <Text
                              style={[
                                styles.chartTradePlaceButtonText,
                                disablePendingTradePlaceButton && styles.chartTradePlaceButtonTextDisabled,
                              ]}
                              numberOfLines={1}
                            >
                              {`${t('Place')} ${t(chartTradeOrderType)}`}
                            </Text>
                          </Pressable>
                        </>
                      )}
                      <LiveOrderTickExecutionGraph
                        symbol={chartSymbol}
                        bid={chartBid}
                        ask={chartAsk}
                        timestamp={chartTradeTickTimestamp}
                        enabled={showChartTradeSheet}
                        priceDecimals={displayDecimals}
                        bidColor="#2563EB"
                        askColor="#EF4444"
                        height={286}
                      />
                    </View>
                  </ScrollView>
                </View>
              </Animated.View>
            </View>
        )}
        {!isChartExpanded && (
            <ChartTradeInlineFooter
              LiveTradeButtons={ChartTradeButtons}
              styles={styles}
              animatedStyle={floatingFooterTradeReserveAnimatedStyle}
              containerRef={footerTradeRowAnchorRef}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
              hideInlineTradeRow={Platform.OS === 'android' && shouldMountFloatingFooterTradeRow}
              showFloatingFooterTradeRow={shouldMountFloatingFooterTradeRow}
              chartSymbol={chartSymbol}
              displayDecimals={displayDecimals}
              tradeVolume={tradeVolume}
              tradeVolumeBounds={tradeVolumeBounds}
              onTradeResult={setTradeFeedback}
              onEditLot={handleFocusFooterLotEditor}
              onOpenLotEditor={handleOpenFooterLotPicker}
              isLotEditing={footerLotEditorFocused}
              lotDraft={lotInput}
              lotInputRef={footerLotEditorInputRef}
              onLotDraftChange={handleFooterLotDraftChange}
              onLotDraftBlur={handleBlurFooterLotEditor}
              onLotDraftEndEditing={handleEndFooterLotEditor}
              onLotDraftSubmit={handleSubmitFooterLotEditor}
              onDecreaseLot={() => handleStepFooterLotEditor(-1)}
              onIncreaseLot={() => handleStepFooterLotEditor(1)}
              onLayout={(event) => {
                const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                if (nextHeight > 0) {
                  setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                }
                measureFooterTradeRowAnchorFrame();
              }}
            />
        )}
        {!isChartExpanded && showChartTradeSheet && showInlineFooterWhileChartTradeSheetOpen ? (
          <ChartTradeInlineFooter
            LiveTradeButtons={ChartTradeButtons}
            styles={styles}
            animatedStyle={undefined}
            containerRef={footerTradeRowAnchorRef}
            isDark={isDark}
            buyColor={BLUE}
            sellColor={T.trading.sell.primary}
            showFloatingFooterTradeRow={false}
            chartSymbol={chartSymbol}
            displayDecimals={displayDecimals}
            tradeVolume={tradeVolume}
            tradeVolumeBounds={tradeVolumeBounds}
            onTradeResult={setTradeFeedback}
            onEditLot={handleFocusFooterLotEditor}
            onOpenLotEditor={handleOpenFooterLotPicker}
            isLotEditing={footerLotEditorFocused}
            lotDraft={lotInput}
            lotInputRef={footerLotEditorInputRef}
            onLotDraftChange={handleFooterLotDraftChange}
            onLotDraftBlur={handleBlurFooterLotEditor}
            onLotDraftEndEditing={handleEndFooterLotEditor}
            onLotDraftSubmit={handleSubmitFooterLotEditor}
            onDecreaseLot={() => handleStepFooterLotEditor(-1)}
            onIncreaseLot={() => handleStepFooterLotEditor(1)}
            onLayout={(event) => {
              const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
              if (nextHeight > 0) {
                setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
              }
              measureFooterTradeRowAnchorFrame();
            }}
          />
        ) : null}
        </ScrollView>
        {chartTradeOverlayLayer}
      </View>





      <ChartStepperModal
        visible={chartStepperEditor !== null}
        title={
          chartStepperEditor?.kind === 'price'
            ? t('Price')
            : chartStepperEditor?.kind === 'stopLimitPrice'
              ? t('Stop Limit Price')
            : chartStepperEditor?.kind === 'tp'
              ? t('Take Profit')
              : chartStepperEditor?.kind === 'sl'
                ? t('Stop Loss')
                : chartStepperEditor?.kind === 'volume'
                  ? t('Volume')
                  : ''
        }
        initial={
          chartStepperEditor?.kind === 'price'
            ? chartTradePrice || chartBid
            : chartStepperEditor?.kind === 'stopLimitPrice'
              ? chartTradeStopLimitPrice
            : chartStepperEditor?.kind === 'tp'
              ? chartTradeTpPrice
              : chartStepperEditor?.kind === 'sl'
                ? chartTradeSlPrice
                : chartStepperEditor?.kind === 'volume'
                  ? tradeVolume
                  : 0
        }
        step={
          chartStepperEditor?.kind === 'volume'
            ? (resolveTradeVolumeBounds(tradeVolumeBounds).stepVolume ?? 0.01)
            : chartPointSize * 10
        }
        decimals={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).decimals
            : Math.max(displayDecimals, 0)
        }
        min={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).minVolume
            : undefined
        }
        max={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).maxVolume
            : undefined
        }
        styles={styles}
        onClose={() => setChartStepperEditor(null)}
        onCommit={(next) => {
          if (chartStepperEditor?.kind === 'price') setChartTradePrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'stopLimitPrice') setChartTradeStopLimitPrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'tp') setChartTradeTpPrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'sl') setChartTradeSlPrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'volume') updateTradeVolume(next);
        }}
      />









      {showDatePicker && (
        <Pressable
          style={styles.calendarOverlay}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={styles.calendarContainer}>
            <Calendar
              onDayPress={(day: any) => {
                handleCustomDateRange(new Date(day.timestamp));
              }}
              maxDate={new Date().toISOString().split('T')[0]}
              theme={{
                backgroundColor: isDark ? '#0E141F' : T.glass2,
                calendarBackground: isDark ? '#0E141F' : T.glass2,
                textSectionTitleColor: T.textSub,
                selectedDayBackgroundColor: BLUE,
                selectedDayTextColor: '#ffffff',
                todayTextColor: BLUE,
                dayTextColor: T.text,
                textDisabledColor: T.textMuted,
                monthTextColor: T.text,
                arrowColor: BLUE,
              }}
            />
          </View>
        </Pressable>
      )}

      <TradeFeedbackModal
        state={tradeFeedback}
        onClose={handleTradeFeedbackClose}
        isDark={isDark}
      />
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const APP_BG = isDark ? '#030508' : T.bg;
  const CHART_CANVAS_BG = isDark ? '#080B11' : '#FFFFFF';
  const BOTTOM_AREA_BG = isDark ? '#0A0C0F' : '#F8FAFC';
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const TEXT_MUTED = T.textMuted;

  return StyleSheet.create({
    flex1: {
      flex: 1,
    },
    chartScrollContent: {
      flexGrow: 1,
    },
    calendarOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
    },
    calendarContainer: {
      width: '90%',
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: isDark ? '#0E141F' : T.glass2,
      borderWidth: 1,
      borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 24,
      elevation: 8,
      padding: 4,
    },
    screen: { backgroundColor: APP_BG, paddingHorizontal: 0 },
    headerWrapper: {
      backgroundColor: isDark ? '#080B11' : T.glass2,
      zIndex: 10,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 56,
      paddingRight: 16,
      height: 40,
    },
    topBarSide: {
      width: 32,
    },

    /* â”€â”€ Compact Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    compactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 0,
      paddingBottom: 18,
      minHeight: 48,
      marginTop: -6,
      backgroundColor: isDark ? '#080B11' : T.glass2,
      borderBottomWidth: 0,
      borderBottomColor: 'transparent',
    },
    symbolSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minHeight: 36,
      marginTop: 4,
    },
    flagStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    flagCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      borderColor: isDark ? '#0B101E' : '#FFFFFF',
    },
    flagOverlap: {
      marginLeft: -10,
    },
    symbolNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    symbolText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    fxBadge: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 3,
    },
    fxBadgeText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    symbolSubText: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 10,
      fontWeight: '500',
      marginTop: 1,
    },

    /* â”€â”€ Center: Live Price â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    priceSection: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    quoteSection: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    quoteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
    },
    quoteValueText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.2,
    },
    quoteValuePlaceholder: {
      color: isDark ? '#94A3B8' : '#64748B',
    },
    livePriceText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 17,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    priceChangeText: {
      fontSize: 11,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },

    /* â”€â”€ Right: Balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    rightSection: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      flex: 1,
      transform: [{ translateY: 10 }],
    },
    balanceContainer: {
      alignItems: 'flex-end',
    },
    balanceLabel: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 1,
    },
    balanceText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    currencyText: {
      fontSize: 10,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '700',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 3,
    },
    headerTitleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 18,
      fontWeight: '600',
    },
    accountDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    dotDemo: {
      backgroundColor: '#00E676',
    },
    dotLive: {
      backgroundColor: isDark ? '#FACC15' : '#D97706',
    },
    accountTypeText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    textDemo: {
      color: '#00E676',
    },
    textLive: {
      color: isDark ? '#FACC15' : '#D97706',
    },

    /* â”€â”€ Card (main body) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    card: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    chartContainer: {
      flex: 1,
      backgroundColor: CHART_CANVAS_BG,
      position: 'relative',
    },
    chartViewport: {
      flex: 1,
      position: 'relative',
      overflow: 'hidden',
    },
    footerLotKeyboardProxyInput: {
      position: 'absolute',
      top: 1,
      left: 1,
      width: 2,
      height: 2,
      padding: 0,
      margin: 0,
      opacity: 0.01,
      color: 'transparent',
      backgroundColor: 'transparent',
      zIndex: 180,
      elevation: 180,
    },
    chartTypeMenuLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 48,
      elevation: 140,
    },
    chartTypeMenuCard: {
      position: 'absolute',
      alignSelf: 'center',
      width: 228,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#D7DEE7',
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.3 : 0.12,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 24,
      elevation: 18,
      overflow: 'hidden',
    },
    chartTypeMenuOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 46,
      paddingHorizontal: 14,
      backgroundColor: 'transparent',
    },
    chartTypeMenuOptionDivider: {
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
    },
    chartTypeMenuOptionActive: {
      backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.08)',
    },
    chartTypeMenuOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 1,
    },
    chartTypeMenuOptionText: {
      color: isDark ? '#E5E7EB' : '#0F172A',
      fontSize: 14,
      fontWeight: '600',
    },
    chartTypeMenuOptionTextActive: {
      color: BLUE,
    },
    chartTopToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: 4,
      paddingVertical: 3,
      marginTop: 10,
      backgroundColor: isDark ? '#080B11' : '#F8FAFC',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
    },
    chartMetaOverlay: {
      position: 'absolute' as any,
      top: 0,
      left: 0,
      zIndex: 30,
      elevation: 24,
    },
    chartMetaOhlc: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: isDark ? 'rgba(8,11,17,0.78)' : 'rgba(248,250,252,0.82)',
      borderRadius: 6,
    },
    chartMetaPair: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    chartMetaLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    chartMetaValue: {
      fontSize: 11,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    inlineActionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    toolbarButtonRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
      width: '100%',
    },
    toolbarSlotFirst: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbarSlot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: 1,
      borderLeftColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    },
    toolbarSymbolButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 28,
      paddingHorizontal: 6,
    },
    toolbarTimeframeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      height: 26,
      paddingHorizontal: 2,
      justifyContent: 'center',
    },
    toolbarComboButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      height: 26,
      paddingHorizontal: 2,
      justifyContent: 'center',
    },
    toolbarIconButton: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbarTradeButton: {
      minWidth: 40,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    toolbarTradeText: {
      color: BLUE,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.1,
    },
    toolbarTrailingGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    toolbarSeparator: {
      width: 1,
      height: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      marginHorizontal: 4,
    },
    toolbarFlexSpacer: {
      flex: 1,
    },
    redBoxIcon: {
      backgroundColor: RED,
      width: 24,
      height: 24,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeSheetLayer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      zIndex: 120,
      elevation: 120,
    },
    chartTradeSheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    chartTradeSheet: {
      backgroundColor: isDark ? '#F8FAFC' : '#FFFFFF',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 24,
    },
    chartTradeSheetPending: {
      backgroundColor: '#F5F6F8',
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderTopWidth: 0,
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    chartTradeSheetFrame: {
      position: 'absolute',
      left: -8,
      right: -8,
      bottom: 0,
      zIndex: 40,
      elevation: 40,
    },
    chartTradeSheetOverlayFrame: {
      left: 0,
      right: 0,
    },
    chartTradeSheetInline: {
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      marginTop: 10,
      marginBottom: 14,
      overflow: 'hidden',
    },
    chartTradeSheetInlineFloating: {
      flex: 1,
      marginTop: 0,
      marginBottom: 0,
    },
    chartTradeSheetDragRegion: {
      borderBottomWidth: 1,
      borderBottomColor: '#E2E8F0',
      backgroundColor: isDark ? '#F8FAFC' : '#FFFFFF',
      paddingTop: 2,
    },
    chartTradeSheetDragRegionPending: {
      backgroundColor: '#F5F6F8',
    },
    chartTradeSheetDragSpacer: {
      height: 4,
      backgroundColor: '#F5F6F8',
    },
    chartTradeSheetContent: {
      flexGrow: 1,
      paddingBottom: 14,
    },
    chartTradeSheetContentScroll: {
      flex: 1,
      minHeight: 0,
    },
    chartTradeSheetHandleWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 30,
      paddingTop: 8,
      paddingBottom: 6,
    },
    chartTradeSheetHandle: {
      width: 52,
      height: 5,
      borderRadius: 999,
      backgroundColor: '#CBD5E1',
    },
    chartTradeQuickBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 6,
      gap: 10,
    },
    chartTradeQuickBarActionsOnly: {
      justifyContent: 'flex-end',
    },
    chartTradeQuickActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    chartTradeQuickChip: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    chartTradeQuickChipSl: {
      borderColor: '#F97316',
      backgroundColor: 'rgba(249,115,22,0.12)',
    },
    chartTradeQuickChipSlActive: {
      backgroundColor: '#F97316',
    },
    chartTradeQuickChipTp: {
      borderColor: '#22C55E',
      backgroundColor: 'rgba(34,197,94,0.12)',
    },
    chartTradeQuickChipTpActive: {
      backgroundColor: '#22C55E',
    },
    chartTradeQuickChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#334155',
    },
    chartTradeQuickChipTextActive: {
      color: '#FFFFFF',
    },
    chartTradeQuickExpandButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 2,
      gap: 12,
    },
    chartTradeSheetHeaderPending: {
      paddingTop: 4,
      paddingBottom: 0,
    },
    chartTradeSheetSymbolBlock: {
      flex: 1,
      minWidth: 0,
      paddingRight: 10,
    },
    chartTradeSheetSymbolRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    chartTradeSheetSymbolText: {
      color: BLUE,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.2,
      flexShrink: 1,
    },
    chartTradeSheetSymbolMeta: {
      color: '#6B7280',
      fontSize: 11,
      fontWeight: '500',
      marginTop: 2,
    },
    chartTradeOrderTypeSummary: {
      color: '#334155',
      fontSize: 16,
      fontWeight: '700',
    },
    chartTradeInstrumentMeta: {
      color: '#94A3B8',
      fontSize: 13,
      fontWeight: '500',
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    chartTradeTypeTabsScroll: {
      flexGrow: 0,
      flexShrink: 0,
      minHeight: 34,
      maxHeight: 40,
    },
    chartTradeTypeTabsScrollPending: {
      minHeight: 40,
      maxHeight: 44,
      marginTop: 0,
    },
    chartTradeSheetBody: {
      paddingHorizontal: 16,
      gap: 10,
    },
    chartTradeSheetBodyPending: {
      paddingHorizontal: 28,
      gap: 10,
    },
    chartTradeVolumeCard: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderWidth: 1,
      borderColor: '#D7DEE7',
      borderRadius: 6,
      backgroundColor: '#FFFFFF',
      minHeight: 44,
      marginTop: 6,
    },
    chartTradeVolumeCardPending: {
      minHeight: 58,
      borderRadius: 10,
      borderColor: '#D9DEE5',
    },
    chartTradeVolumeSide: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
    },
    chartTradeVolumeSidePending: {
      paddingHorizontal: 16,
    },
    chartTradeVolumeUnitSide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      minWidth: 112,
      gap: 6,
    },
    chartTradeVolumeUnitSidePending: {
      paddingHorizontal: 14,
      minWidth: 128,
      gap: 6,
    },
    chartTradeVolumeDivider: {
      width: 1,
      backgroundColor: '#E2E8F0',
    },
    chartTradeVolumeValueGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chartTradeStepperStack: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
    },
    chartTradeCardLabel: {
      color: '#475569',
      fontSize: 15,
      fontWeight: '500',
    },
    chartTradeCardLabelPending: {
      color: '#111827',
      fontSize: 18,
      fontWeight: '500',
    },
    chartTradeCardValue: {
      color: '#0F172A',
      fontSize: 16,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    chartTradeCardValuePending: {
      fontSize: 17,
      fontWeight: '700',
    },
    chartTradePriceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: '#D7DEE7',
      borderRadius: 6,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 14,
      minHeight: 44,
    },
    chartTradePriceCardPending: {
      borderColor: '#F97373',
      backgroundColor: '#FFFDFD',
    },
    chartTradePriceCardPendingMt: {
      minHeight: 60,
      borderRadius: 10,
      borderColor: '#E85A4F',
      backgroundColor: '#FFFFFF',
    },
    chartTradeMetaLink: {
      color: '#2563EB',
      fontSize: 14,
      fontWeight: '500',
      textDecorationLine: 'underline',
    },
    chartTradeMetaLinkPending: {
      fontSize: 14,
      textDecorationLine: 'underline',
    },
    chartTradeTypeTabs: {
      paddingHorizontal: 14,
      paddingBottom: 4,
      gap: 8,
      alignItems: 'center',
      minHeight: 34,
    },
    chartTradeTypeTabsPending: {
      paddingHorizontal: 16,
      paddingBottom: 4,
      gap: 6,
      minHeight: 40,
    },
    chartTradeTypeTab: {
      flexShrink: 0,
      minHeight: 34,
      paddingHorizontal: 4,
      paddingVertical: 6,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeTypeTabPending: {
      height: 40,
      minWidth: 148,
      width: 148,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderRadius: 999,
      borderColor: '#D9DEE5',
      backgroundColor: '#F8FAFC',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeTypeTabPendingMarketExecution: {
      minWidth: 132,
      width: 132,
      paddingHorizontal: 10,
    },
    chartTradeTypeTabActive: {
      borderBottomColor: '#2563EB',
    },
    chartTradeTypeTabPendingActive: {
      borderBottomWidth: 1,
      borderColor: '#BFD3F7',
      backgroundColor: '#EEF4FF',
    },
    chartTradeTypeTabText: {
      color: '#64748B',
      fontSize: 15,
      fontWeight: '700',
    },
    chartTradeTypeTabTextPending: {
      color: '#787C84',
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
      width: '100%',
    },
    chartTradeTypeTabTextPendingMarketExecution: {
      fontSize: 13,
    },
    chartTradeTypeTabTextActive: {
      color: '#2563EB',
    },
    chartTradeTypeTabTextPendingActive: {
      color: '#1D6DE8',
    },
    chartTradeCard: {
      marginHorizontal: 12,
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 14,
      gap: 12,
    },
    chartTradeFieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    chartTradeFieldLabel: {
      color: '#475569',
      fontSize: 14,
      fontWeight: '500',
    },
    chartTradeFieldRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chartTradeStepperBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeStepperLaunchButton: {
      width: 26,
      height: 28,
      borderRadius: 6,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#D7DEE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeStepperLaunchButtonPending: {
      width: 22,
      height: 42,
      borderWidth: 0,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    },
    chartTradeStepperLaunchIconStack: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: -2,
    },
    chartTradeVolumeInput: {
      minWidth: 62,
      height: 32,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: '#F8FAFC',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      textAlign: 'center',
      color: '#0F172A',
      fontSize: 15,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    chartTradePriceInput: {
      minWidth: 100,
      height: 32,
      paddingVertical: 0,
      textAlign: 'right',
      color: '#0F172A',
      fontSize: 16,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    chartTradePriceInputPending: {
      color: '#F23645',
    },
    chartTradePriceInputPendingMt: {
      minWidth: 112,
      fontSize: 18,
      color: '#E4554B',
    },
    chartTradeFieldSuffix: {
      color: '#475569',
      fontSize: 14,
      fontWeight: '600',
    },
    chartTradeSliderTouch: {
      position: 'relative',
      height: 32,
      justifyContent: 'center',
      marginHorizontal: 10,
    },
    chartTradeSliderTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: '#DBEAFE',
      overflow: 'visible',
    },
    chartTradeSliderFill: {
      height: 3,
      borderRadius: 2,
      backgroundColor: '#3B82F6',
    },
    chartTradeSliderThumb: {
      position: 'absolute',
      top: 7,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#3B82F6',
      borderWidth: 3,
      borderColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    chartTradeMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginTop: 0,
    },
    chartTradeMetaText: {
      color: '#64748B',
      fontSize: 14,
      fontWeight: '500',
    },
    chartTradeMetaSummary: {
      flex: 1,
      textDecorationLine: 'none',
    },
    chartTradeMetaSummaryValue: {
      color: '#0F172A',
      fontWeight: '700',
    },
    chartTradeMetaRowPending: {
      marginTop: 0,
    },
    chartTradeMetaTextPending: {
      color: '#5C6470',
      fontSize: 14,
    },
    chartTradeStopButton: {
      borderRadius: 6,
      backgroundColor: '#E7F0FE',
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeStopButtonPending: {
      minHeight: 56,
      borderRadius: 8,
      backgroundColor: '#E8F0FE',
    },
    chartTradeStopButtonText: {
      color: '#2563EB',
      fontSize: 16,
      fontWeight: '700',
    },
    chartTradeStopButtonTextPending: {
      fontSize: 18,
    },
    chartTradeStopsBlock: {
      gap: 8,
    },
    chartTradeStopUnitRow: {
      flexDirection: 'row',
      gap: 6,
    },
    chartTradeStopUnitTab: {
      flex: 1,
      backgroundColor: '#EFF4FE',
      borderWidth: 1,
      borderColor: 'transparent',
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeStopUnitTabActive: {
      backgroundColor: '#FFFFFF',
      borderColor: '#2563EB',
    },
    chartTradeStopUnitTabText: {
      color: '#2563EB',
      fontSize: 14,
      fontWeight: '600',
    },
    chartTradeStopUnitTabTextActive: {
      color: '#2563EB',
      fontWeight: '700',
    },
    chartTradeStopPairRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      borderRadius: 10,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      minHeight: 58,
    },
    chartTradeStopPairDivider: {
      width: 1,
      backgroundColor: '#E2E8F0',
    },
    chartTradeStopPairCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 8,
    },
    chartTradeStopPairCardSl: {},
    chartTradeStopPairCardTp: {},
    chartTradeStopPairSwatchSl: {
      width: 34,
      height: 34,
      borderRadius: 6,
      backgroundColor: '#FEE2E2',
    },
    chartTradeStopPairSwatchTp: {
      width: 34,
      height: 34,
      borderRadius: 6,
      backgroundColor: '#DCFCE7',
    },
    chartTradeStopPairLabel: {
      color: '#475569',
      fontSize: 15,
      fontWeight: '600',
    },
    chartTradeStopPairValue: {
      marginLeft: 'auto',
      color: '#0F172A',
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    chartTradeStopPairLock: {
      marginLeft: 6,
      padding: 4,
    },
    chartTradeStopValue: {
      minWidth: 96,
      textAlign: 'center',
      color: '#0F172A',
      fontSize: 15,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    chartTradeInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    chartTradeInfoRowPending: {
      gap: 6,
      paddingVertical: 1,
    },
    chartTradeInfoLabel: {
      color: '#475569',
      fontSize: 15,
      fontWeight: '500',
      minWidth: 90,
    },
    chartTradeInfoLabelPending: {
      color: '#111827',
      fontSize: 17,
      minWidth: 118,
    },
    chartTradeInfoValue: {
      color: '#2563EB',
      fontSize: 15,
      fontWeight: '600',
    },
    chartTradeInfoValuePending: {
      fontSize: 17,
      color: '#1D6DE8',
    },
    chartTradeCommentInput: {
      flex: 1,
      minHeight: 32,
      color: '#2563EB',
      fontSize: 14,
      fontWeight: '500',
      paddingVertical: 0,
    },
    chartTradeCommentBlock: {
      gap: 4,
      paddingVertical: 1,
      marginTop: -3,
    },
    chartTradeCommentBlockPending: {
      gap: 0,
      paddingVertical: 0,
      marginTop: 0,
    },
    chartTradeCommentInfoRowActive: {
      borderRadius: 8,
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    chartTradeCommentInlineLabel: {
      minWidth: 74,
    },
    chartTradeCommentInlineValue: {
      flex: 1,
      color: '#0F172A',
      fontSize: 14,
      fontWeight: '500',
    },
    chartTradeCommentInlinePlaceholder: {
      color: '#2563EB',
      fontWeight: '600',
    },
    chartTradeCommentInlineValueActive: {
      color: '#2563EB',
      fontWeight: '600',
    },
    chartTradeCommentEditorInlineRow: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    chartTradeCommentEditorInlineInputWrap: {
      flex: 1,
      minHeight: 40,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    chartTradeCommentEditorInlineInput: {
      flex: 1,
      color: '#0F172A',
      fontSize: 13,
      fontWeight: '500',
      paddingVertical: 0,
    },
    chartTradeCommentEditorInlineSubmit: {
      width: 40,
      minHeight: 40,
      borderRadius: 7,
      backgroundColor: '#EFF6FF',
      borderWidth: 1,
      borderColor: '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeCommentDock: {
      paddingHorizontal: 4,
    },
    chartTradeCommentEditorRow: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chartTradeCommentEditorInputWrap: {
      flex: 1,
      minHeight: 46,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    chartTradeCommentEditorInput: {
      flex: 1,
      color: '#0F172A',
      fontSize: 14,
      fontWeight: '500',
      paddingVertical: 0,
    },
    chartTradeCommentEditorSubmit: {
      width: 46,
      minHeight: 46,
      borderRadius: 7,
      backgroundColor: '#EFF6FF',
      borderWidth: 1,
      borderColor: '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartTradeCommentEditorSubmitDisabled: {
      backgroundColor: '#F8FAFC',
      borderColor: '#E2E8F0',
    },
    stepperModalLayer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(15,23,42,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    stepperModalCard: {
      width: '88%',
      maxWidth: 360,
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 6,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 18,
    },
    stepperModalTitle: {
      textAlign: 'center',
      color: '#64748B',
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 8,
    },
    stepperModalBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    stepperModalStack: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 14,
    },
    stepperModalDivider: {
      width: '72%',
      height: 1,
      backgroundColor: '#0F172A',
      marginVertical: 6,
    },
    stepperModalMain: {
      color: '#0F172A',
      fontSize: 22,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    stepperModalGhost: {
      color: '#CBD5E1',
      fontSize: 17,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    stepperModalMinus: {
      width: 52,
      height: 44,
      borderRadius: 10,
      backgroundColor: '#FEE2E2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperModalMinusText: {
      color: '#EF4444',
      fontSize: 26,
      fontWeight: '700',
      lineHeight: 28,
    },
    stepperModalPlus: {
      width: 52,
      height: 44,
      borderRadius: 10,
      backgroundColor: '#DBEAFE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperModalPlusText: {
      color: '#2563EB',
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 26,
    },
    stepperModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 22,
      paddingTop: 8,
      paddingBottom: 6,
    },
    stepperModalCancel: {
      color: '#2563EB',
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
    stepperModalOk: {
      color: '#2563EB',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    chartTradePlaceButton: {
      minHeight: 50,
      borderRadius: 10,
      width: '100%',
      alignSelf: 'stretch',
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    chartTradePlaceButtonDisabled: {
      minHeight: 50,
      borderRadius: 10,
      backgroundColor: '#DEDEDF',
      marginTop: 4,
    },
    chartTradePlaceButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
      width: '100%',
      textAlign: 'center',
    },
    chartTradePlaceButtonTextDisabled: {
      color: '#A5A7AB',
      fontSize: 17,
    },
    chartTradeMiniPreview: {
      marginTop: 16,
      marginHorizontal: -28,
      paddingTop: 10,
      paddingBottom: 10,
      borderTopWidth: 0,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
    },
    chartOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(5,8,16,0.85)' : 'rgba(255,255,255,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 50,
    },
    overlayText: {
      color: isDark ? TEXT_MUTED : '#475569',
      marginTop: 12,
      fontSize: 14,
      fontWeight: '600',
    },
    overlaySubText: {
      color: isDark ? 'rgba(142,154,175,0.6)' : '#94A3B8',
      marginTop: 4,
      fontSize: 12,
    },
    floatingAutoBtn: {
      position: 'absolute',
      right: 56,
      bottom: 24,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      zIndex: 100,
    },
    floatingAutoText: {
      fontSize: 12,
      fontWeight: '800',
    },

    /* â”€â”€ Bottom Area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    chartViewportMenuButton: {
      position: 'absolute',
      right: 10,
      bottom: 16,
      minWidth: 34,
      minHeight: 26,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 45,
      elevation: 45,
    },
    bottomArea: {
      backgroundColor: isDark ? '#080B11' : T.glass2,
      paddingHorizontal: 8,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'visible',
      borderTopWidth: 0,
      borderTopColor: T.border,
    },
    tvBottomToolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 8,
      gap: 10,
    },
    tvRangesLeft: { flexDirection: 'row', alignItems: 'center' },
    tvRangesRight: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto' },
    tvRangeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      paddingRight: 2,
    },
    tvRangeText: { fontSize: 11, fontWeight: '500', color: '#787B86' },
    tvRangeAutoText: { fontSize: 11, fontWeight: '500', color: '#787B86' },
    sentimentLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 0,
    },
    sentimentLabelSell: {
      color: RED,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    sentimentLabelBuy: {
      color: BLUE,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    sentimentBarRow: {
      flexDirection: 'row',
      height: 2,
      marginBottom: 4,
      borderRadius: 3,
      overflow: 'hidden',
      gap: 2,
    },
    sentimentHalf: {
      height: '100%',
      borderRadius: 3,
    },
    sentimentSell: {
      backgroundColor: RED,
    },
    sentimentBuy: {
      backgroundColor: BLUE,
    },
    footerTradeDockLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 140,
      elevation: 140,
    },
    footerTradeDock: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: 8,
      paddingTop: 6,
      paddingBottom: 0,
      backgroundColor: isDark ? '#080B11' : T.glass2,
      borderTopWidth: 1,
      borderTopColor: T.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 10,
    },
    footerLotPickerLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 72,
      elevation: 72,
    },
    footerLotPickerCard: {
      position: 'absolute',
      alignSelf: 'center',
      backgroundColor: isDark ? '#101827' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148, 163, 184, 0.24)' : '#D7DEE7',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.28 : 0.14,
      shadowRadius: 16,
      elevation: 18,
      paddingTop: 14,
      paddingBottom: 12,
      paddingHorizontal: 18,
    },
    footerLotPickerQuickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },
    footerLotPickerQuickButton: {
      flex: 1,
      minHeight: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    footerLotPickerQuickButtonActive: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : '#E8F1FF',
    },
    footerLotPickerQuickText: {
      color: '#3B82F6',
      fontSize: 14,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },
    footerLotPickerQuickTextActive: {
      color: '#2563EB',
      fontWeight: '700',
    },
    footerLotPickerValuesScroll: {
      marginHorizontal: -4,
    },
    footerLotPickerValuesContent: {
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 4,
    },
    footerLotPickerValueButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      paddingHorizontal: 8,
    },
    footerLotPickerValueButtonHorizontal: {
      width: FOOTER_LOT_PICKER_VALUE_ITEM_WIDTH,
      minHeight: 46,
    },
    footerLotPickerValueButtonActive: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.18)' : '#E8F1FF',
    },
    footerLotPickerValueButtonRange: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#F3F7FF',
    },
    footerLotPickerValueText: {
      color: isDark ? '#F8FAFC' : '#111827',
      fontSize: 15,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },
    footerLotPickerValueTextActive: {
      color: '#2563EB',
      fontWeight: '700',
    },
    footerLotPickerValueTextRange: {
      color: '#2563EB',
      fontWeight: '700',
    },
    lotSelectorBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
      borderRadius: 10,
      padding: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    },
    lotStepperBtn: {
      width: 40,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    },
    lotLabelText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#64748B' : TEXT_MUTED,
    },
    lotInput: {
      flex: 1,
      color: isDark ? '#E2E8F0' : '#0F172A',
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      paddingVertical: 0,
    },
    floatingDrawBtn: {
      position: 'absolute',
      left: 12,
      bottom: 30,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      zIndex: 40,
    },
  });
}

