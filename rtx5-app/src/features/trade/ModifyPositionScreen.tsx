/**
 * Trade Feature UI: ModifyPositionScreen
 * 
 * Screen used to adjust the Stop Loss (SL) and Take Profit (TP) parameters
 * of an already active position or pending order.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path, Text as SvgText, Rect, G } from 'react-native-svg';

import { positionsApi } from '../../api/positions';
import { useLiveTick, useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { findPositionById } from './tradeFlow';
import { fmt } from '../../utils/format';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';

function formatModifyPrice(val: number) {
  const str = val.toFixed(2);
  // Splitting off the exact last two digits that the user circled
  return { 
    main: str.slice(0, -2), 
    huge: str.slice(-2) 
  };
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function ModifyPositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const insets = useSafeAreaInsets();
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const positions = usePositionsState((s) => s.positions);
  const primedPosition = usePositionsState((s) =>
    positionId ? s.positionSnapshots[Array.isArray(positionId) ? positionId[0] : positionId] : undefined
  );
  const position = useMemo(
    () => findPositionById(positions, positionId) ?? primedPosition,
    [positions, positionId, primedPosition]
  );

  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const resolvedLogin = resolveTradingLoginString();

  // Fetch position if not natively loaded in cache (e.g. direct deep link or cold start)
  useEffect(() => {
    if (!position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [position, resolvedLogin]);

  // Tick History State for Chart
  const latestTick = useLiveTick(position?.symbol || 'EURUSD');
  const latestClose = latestTick?.close || position?.currentPrice || 0;
  
  const isJpy = position?.symbol.includes('JPY') ?? false;
  // Fallbacks if bid/ask not provided directly
  const { candles } = useLiveCandles(position?.symbol || '', '1'); // Fetch REAL 1M histories!
  const syntheticAsk = latestClose + (isJpy ? 0.015 : 0.00015);
  const BID = (latestTick as any)?.bid || latestClose;
  const ASK = (latestTick as any)?.ask || syntheticAsk;

  const currentPriceOrZero = position?.currentPrice || 0;
  const pipSize = isJpy ? 0.01 : currentPriceOrZero > 100 ? 0.01 : 0.0001;
  const decimals = 2;

  const [ticks, setTicks] = useState<{ bid: number; ask: number }[]>([]);

  useEffect(() => {
    if (BID > 0 && ASK > 0) {
      // If we have actual historical candles from the live WebSocket, map them perfectly!
      if (candles && candles.length > 0) {
        const slice = candles.slice(-40);
        const spread = ASK - BID;
        const histPath = slice.map(c => ({ bid: c.close, ask: c.close + spread }));
        
        // Pad to ensure full chart width if we don't have exactly 40 minutes of history yet
        while (histPath.length < 40) {
          histPath.unshift({ bid: histPath[0].bid, ask: histPath[0].ask });
        }
        
        // Ensure the absolute final active tick is precisely the live, sub-minute WebSocket tick!
        histPath[histPath.length - 1] = { bid: BID, ask: ASK };
        
        setTicks(histPath);
      } else {
        // Fallback tick accumulator if history hasn't loaded yet
        setTicks((prev) => {
          if (prev.length === 0) return Array(40).fill({ bid: BID, ask: ASK });
          
          const next = [...prev, { bid: BID, ask: ASK }];
          if (next.length > 40) next.shift();
          return next;
        });
      }
    }
  }, [BID, ASK, candles]);

  // Init S/L and T/P from existing
  useEffect(() => {
    if (!position) return;
    setStopLoss(position.sl && position.sl > 0 ? position.sl : null);
    setTakeProfit(position.tp && position.tp > 0 ? position.tp : null);
  }, [position?.id, position?.sl, position?.tp]);

  // Chart Layout State (MUST be before any early returns!)
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const screenHeight = Dimensions.get('window').height;
  const sheetMaxHeight = Math.max(360, screenHeight - Math.max(insets.top, 16) - 12);
  const sheetMinHeight = Math.min(sheetMaxHeight, Math.max(280, screenHeight * 0.34));
  const sheetInitialHeight = Math.min(sheetMaxHeight, Math.max(sheetMinHeight, screenHeight * 0.46));
  const sheetMaxTranslateY = Math.max(0, sheetMaxHeight - sheetMinHeight);
  const sheetInitialTranslateY = clamp(sheetMaxHeight - sheetInitialHeight, 0, sheetMaxTranslateY);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(sheetMaxHeight);
  const dragStartTranslateY = useSharedValue(sheetInitialTranslateY);
  const isClosingRef = useRef(false);

  const handleSheetClosed = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/trade');
    }
  }, []);

  const dismissSheet = useCallback(() => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    backdropOpacity.value = withTiming(0, { duration: 140 });
    sheetTranslateY.value = withTiming(sheetMaxHeight, { duration: 180 }, (finished) => {
      if (finished) {
        runOnJS(handleSheetClosed)();
      }
    });
  }, [backdropOpacity, handleSheetClosed, sheetMaxHeight, sheetTranslateY]);

  useEffect(() => {
    isClosingRef.current = false;
    dragStartTranslateY.value = sheetInitialTranslateY;
    backdropOpacity.value = 0;
    sheetTranslateY.value = sheetMaxHeight;

    backdropOpacity.value = withTiming(1, { duration: 160 });
    sheetTranslateY.value = withSpring(sheetInitialTranslateY, {
      damping: 26,
      stiffness: 240,
      overshootClamping: true,
    });
  }, [backdropOpacity, dragStartTranslateY, sheetInitialTranslateY, sheetMaxHeight, sheetTranslateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-4, 4])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          dragStartTranslateY.value = sheetTranslateY.value;
        })
        .onUpdate((event) => {
          sheetTranslateY.value = clamp(
            dragStartTranslateY.value + event.translationY,
            0,
            sheetMaxTranslateY,
          );
        })
        .onEnd(() => {
          dragStartTranslateY.value = sheetTranslateY.value;
        })
        .onFinalize(() => {
          dragStartTranslateY.value = sheetTranslateY.value;
        }),
    [dragStartTranslateY, sheetMaxTranslateY, sheetTranslateY],
  );

  const handleStepSl = (delta: number) => {
    if (!position) return;
    setStopLoss((prev) => {
      // If setting for the first time, bias it directly against the live matching price for the position side
      const livePrice = position.side === 'buy' ? BID : ASK;
      let base = prev;
      if (!base) {
         // Auto offset properly based on side
         base = position.side === 'buy' ? livePrice - (pipSize * 100) : livePrice + (pipSize * 100);
      }
      const val = (base as number) + delta;
      return parseFloat(val.toFixed(decimals));
    });
  };

  const handleStepTp = (delta: number) => {
    if (!position) return;
    setTakeProfit((prev) => {
      const livePrice = position.side === 'buy' ? BID : ASK;
      let base = prev;
      if (!base) {
         // Auto offset properly based on side
         base = position.side === 'buy' ? livePrice + (pipSize * 100) : livePrice - (pipSize * 100);
      }
      const val = (base as number) + delta;
      return parseFloat(val.toFixed(decimals));
    });
  };

  const handleSlChange = (text: string) => {
    const val = parseFloat(text);
    if (!isNaN(val)) setStopLoss(val);
    if (text === '') setStopLoss(null);
  };

  const handleTpChange = (text: string) => {
    const val = parseFloat(text);
    if (!isNaN(val)) setTakeProfit(val);
    if (text === '') setTakeProfit(null);
  };

  const handleModify = async () => {
    if (!position) {
      return;
    }

    if (!accountDetails?.credentials?.accessToken) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            'Authentication Error',
            'The app does not have a valid local trading session. Log in again before modifying the position.',
          ),
        ),
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);
    try {
      await positionsApi.modifyPosition(position.id, {
        price_sl: stopLoss || 0,
        price_tp: takeProfit || 0,
        trailing_stop: 0,
        trailing_step: 0,
      });

      const newSl = stopLoss || 0;
      const newTp = takeProfit || 0;

      // Optimistic update
      usePositionsState.setState((state) => ({
        positions: state.positions.map((p) =>
          p.id === position.id
            ? { ...p, sl: newSl, tp: newTp, clientModifiedAt: Date.now() }
            : p
        ),
      }));

      dismissSheet();
    } catch (error: any) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          classifyTradingError(error, { action: 'modify-position' }),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!position) {
    return (
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={dismissSheet} />
        </Animated.View>
        <Animated.View style={[styles.sheetFrame, { height: sheetMaxHeight }, sheetAnimatedStyle]}>
          <View style={styles.sheetSurface}>
            <GestureDetector gesture={sheetDragGesture}>
              <View collapsable={false}>
                <View style={styles.dragZone}>
                  <View style={[styles.dragHandle, { backgroundColor: T.border }]} />
                </View>
                <View style={[styles.header, { paddingTop: 6 }]}>
                  <View style={styles.headerTopRow}>
                    <Pressable onPress={dismissSheet} hitSlop={20} style={styles.backBtn}>
                      <Ionicons name="chevron-down" size={24} color={T.text} />
                    </Pressable>
                    <View style={styles.headerTitleWrap} pointerEvents="none">
                      <Text style={styles.headerActionLabel} numberOfLines={1} adjustsFontSizeToFit>
                        MODIFY POSITION
                      </Text>
                    </View>
                    <View style={styles.backBtn} />
                  </View>
                </View>
              </View>
            </GestureDetector>
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={T.accent} />
              <Text style={[styles.loaderText, { color: T.textMuted }]}>Loading position...</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  const slDisplay = stopLoss ? stopLoss.toFixed(decimals) : 'SL';
  const tpDisplay = takeProfit ? takeProfit.toFixed(decimals) : 'TP';
  const isBuy = position.side === 'buy';
  const chartHeight = Math.max(220, Math.min(Dimensions.get('window').height * 0.32, 340));

  const bidFmt = formatModifyPrice(BID);
  const askFmt = formatModifyPrice(ASK);

  // Chart Rendering calculations
  const w = chartLayout.width;
  const h = chartLayout.height;
  
  // Find min and max values to dynamically scale tick chart
  let minPrice = Math.min(BID, ASK);
  let maxPrice = Math.max(BID, ASK);
  ticks.forEach(t => {
    minPrice = Math.min(minPrice, t.bid, t.ask);
    maxPrice = Math.max(maxPrice, t.bid, t.ask);
  });
  
  // Stretch bounds gently so active stop constraints visibly sit on the chart
  if (stopLoss) {
    minPrice = Math.min(minPrice, stopLoss);
    maxPrice = Math.max(maxPrice, stopLoss);
  }
  if (takeProfit) {
    minPrice = Math.min(minPrice, takeProfit);
    maxPrice = Math.max(maxPrice, takeProfit);
  }
  
  // padding
  const padding = (maxPrice - minPrice) * 0.2;
  const chartMin = minPrice - padding;
  const chartMax = maxPrice + padding;
  const priceRange = chartMax - chartMin || 0.001;

  const yPos = (val: number) => {
    if (h === 0) return 0;
    return h - ((val - chartMin) / priceRange) * h;
  };

  const xPos = (idx: number, total: number) => {
    if (w === 0 || total <= 1) return 0;
    // Map points across width minus 50 right padding for labels
    return (idx / (total - 1)) * (w - 70); 
  };

  let bidPath = '';
  let askPath = '';
  if (ticks.length > 0 && w > 0 && h > 0) {
    bidPath = ticks.map((t, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i, ticks.length)} ${yPos(t.bid)}`).join(' ');
    askPath = ticks.map((t, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i, ticks.length)} ${yPos(t.ask)}`).join(' ');
    
    // Mathematically anchor the end of the history path directly to the live nanosecond Bid/Ask box coordinates
    // This perfectly closes the frame gap and guarantees the stroke touches the bounding box!
    bidPath += ` L ${w - 60} ${yPos(BID)}`;
    askPath += ` L ${w - 60} ${yPos(ASK)}`;
  }

  return (
    <View style={styles.modalRoot}>
      <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismissSheet} />
      </Animated.View>
      <Animated.View style={[styles.sheetFrame, { height: sheetMaxHeight }, sheetAnimatedStyle]}>
        <View style={styles.sheetSurface}>
          <GestureDetector gesture={sheetDragGesture}>
            <View collapsable={false}>
              <View style={styles.dragZone}>
                <View style={[styles.dragHandle, { backgroundColor: T.border }]} />
              </View>

              {/* Header */}
              <View style={[styles.header, { paddingTop: 6 }]}>
                <View style={styles.headerTopRow}>
                  <Pressable
                    onPress={dismissSheet}
                    hitSlop={20}
                    style={styles.backBtn}
                  >
                    <Ionicons name="chevron-down" size={24} color={T.text} />
                  </Pressable>

                  <View style={styles.headerTitleWrap} pointerEvents="none">
                    <Text style={styles.headerActionLabel} numberOfLines={1} adjustsFontSizeToFit>
                      MODIFY POSITION
                    </Text>
                    <Text style={styles.headerTicketLabel} numberOfLines={1}>
                      #{position.id}
                    </Text>
                  </View>

                  <View style={styles.backBtn} />
                </View>

                <View style={styles.headerSubRow}>
                  <Text style={[styles.headerSide, { color: position.side === 'buy' ? T.trading.buy.primary : T.trading.sell.primary }]}>
                    {position.side.toUpperCase()}
                  </Text>
                  <Text style={styles.headerVol}>{position.volume.toFixed(2)}</Text>
                  <Text style={styles.headerSymbol}>{position.symbol.replace(/\//g, '')}</Text>
                  <Text style={styles.headerAt}>at</Text>
                  <Text style={styles.headerPrice}>{position.openPrice.toFixed(decimals)}</Text>
                </View>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 8 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            contentInsetAdjustmentBehavior="never"
          >

      {/* Big Prices */}
      <View style={styles.priceHero}>
        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>BID</Text>
          <Text style={[styles.priceNormal, { color: isBuy ? T.trading.sell.primary : T.trading.buy.primary }]}>
            {bidFmt.main}<Text style={styles.priceHuge}>{bidFmt.huge}</Text>
          </Text>
        </View>
        <View style={styles.priceCardDivider} />
        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>ASK</Text>
          <Text style={[styles.priceNormal, { color: isBuy ? T.trading.buy.primary : T.trading.sell.primary }]}>
            {askFmt.main}<Text style={styles.priceHuge}>{askFmt.huge}</Text>
          </Text>
        </View>
      </View>

      {/* SL / TP Adjusters — enterprise premium card design */}
      {(() => {
        const PRESET_PIPS = [10, 25, 50, 100];
        const SL_COLOR = isDark ? '#22D3EE' : '#06B6D4';
        const TP_COLOR = '#22C55E';
        const contractSize = isJpy ? 1000 : 100000;
        const lots = position.volume || 0;

        const computeImpact = (target: number | null, kind: 'sl' | 'tp') => {
          if (!target) return null;
          const distance = Math.abs(target - position.openPrice);
          const pips = Math.round(distance / pipSize);
          const usd = distance * contractSize * lots;
          const sign = kind === 'sl' ? '−' : '+';
          return { pips, usd, sign };
        };
        const slImpact = computeImpact(stopLoss, 'sl');
        const tpImpact = computeImpact(takeProfit, 'tp');

        const splitPrice = (val: number | null) => {
          if (val === null) return { main: '—', huge: '' };
          const str = val.toFixed(decimals);
          return { main: str.slice(0, -2), huge: str.slice(-2) };
        };
        const slParts = splitPrice(stopLoss);
        const tpParts = splitPrice(takeProfit);

        const renderCard = (
          kind: 'sl' | 'tp',
          color: string,
          title: string,
          parts: { main: string; huge: string },
          impact: { pips: number; usd: number; sign: string } | null,
          onStep: (delta: number) => void,
          onChangeText: (text: string) => void,
          onClear: () => void,
          rawValue: number | null,
        ) => (
          <View style={[styles.stepperCard, { borderColor: T.border }]}>
            <View style={[styles.stepperAccent, { backgroundColor: color }]} />

            {/* Header */}
            <View style={styles.stepperHead}>
              <View style={styles.stepperHeadLeft}>
                <View style={[styles.stepperBadge, { backgroundColor: color }]}>
                  <Text style={styles.stepperBadgeText}>{kind.toUpperCase()}</Text>
                </View>
                <Text style={styles.stepperLabel}>{title}</Text>
              </View>
              {rawValue !== null ? (
                <Pressable onPress={onClear} hitSlop={10} style={styles.stepperClear}>
                  <Ionicons name="close-circle" size={16} color={T.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* Hero Price Row */}
            <View style={styles.stepperPriceRow}>
              <Pressable onPress={() => onStep(-pipSize * 10)} hitSlop={12} style={[styles.stepperSquareBtn, { borderColor: T.border }]}>
                <Ionicons name="remove" size={18} color={color} />
              </Pressable>

              <View style={styles.stepperPriceWrap}>
                {rawValue !== null ? (
                  <Text style={styles.stepperPriceMain} numberOfLines={1} adjustsFontSizeToFit>
                    {parts.main}
                    <Text style={[styles.stepperPriceHuge, { color }]}>{parts.huge}</Text>
                  </Text>
                ) : (
                  <Text style={styles.stepperPriceEmpty}>Not set</Text>
                )}
                <TextInput
                  style={styles.stepperHiddenInput}
                  keyboardType="numeric"
                  value={rawValue !== null ? rawValue.toString() : ''}
                  onChangeText={onChangeText}
                  placeholder="0"
                  placeholderTextColor="transparent"
                />
              </View>

              <Pressable onPress={() => onStep(pipSize * 10)} hitSlop={12} style={[styles.stepperSquareBtn, { borderColor: T.border }]}>
                <Ionicons name="add" size={18} color={color} />
              </Pressable>
            </View>

            {/* Quick preset chips */}
            <View style={styles.stepperChipRow}>
              {PRESET_PIPS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => onStep(pipSize * p * (kind === 'sl' ? -1 : 1))}
                  style={[styles.stepperChip, { borderColor: T.border }]}
                  hitSlop={6}
                >
                  <Text style={[styles.stepperChipText, { color }]}>
                    {kind === 'sl' ? '−' : '+'}{p}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Footer: pip distance + $ impact */}
            <View style={styles.stepperFootRow}>
              <Text style={styles.stepperFootLabel}>Distance</Text>
              <Text style={[styles.stepperFootValue, impact && { color: T.text }]}>
                {impact ? `${impact.pips} pts` : '—'}
              </Text>
            </View>
            <View style={styles.stepperFootRow}>
              <Text style={styles.stepperFootLabel}>Est. {kind === 'sl' ? 'Loss' : 'Profit'}</Text>
              <Text style={[styles.stepperFootValue, impact && { color }]}>
                {impact ? `${impact.sign}$${impact.usd.toFixed(2)}` : '—'}
              </Text>
            </View>
          </View>
        );

        return (
          <View style={styles.stepperRow}>
            {renderCard('sl', SL_COLOR, 'Stop Loss', slParts, slImpact, handleStepSl, handleSlChange, () => setStopLoss(null), stopLoss)}
            {renderCard('tp', TP_COLOR, 'Take Profit', tpParts, tpImpact, handleStepTp, handleTpChange, () => setTakeProfit(null), takeProfit)}
          </View>
        );
      })()}

      {/* SVG Tick Chart Area */}
      <View 
        style={[styles.chartContainer, { height: chartHeight }]} 
        onLayout={(e) => setChartLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {w > 0 && h > 0 && (
          <Svg width={w} height={h}>
            {/* Horizontal Grid lines */}
            <Line x1="0" y1={yPos(maxPrice)} x2={w} y2={yPos(maxPrice)} stroke={T.border} strokeDasharray="4 4" strokeWidth="1" />
            <Line x1="0" y1={yPos((maxPrice + minPrice) / 2)} x2={w} y2={yPos((maxPrice + minPrice) / 2)} stroke={T.border} strokeDasharray="4 4" strokeWidth="1" />
            <Line x1="0" y1={yPos(minPrice)} x2={w} y2={yPos(minPrice)} stroke={T.border} strokeDasharray="4 4" strokeWidth="1" />

            {/* Historical Point Paths (The actual Signal) */}
            {bidPath ? <Path d={bidPath} stroke={T.trading.buy.primary} strokeWidth="1.5" fill="none" /> : null}
            {askPath ? <Path d={askPath} stroke={T.trading.sell.primary} strokeWidth="1.5" fill="none" /> : null}

            {/* Stop Loss & Take Profit Visual Overlays */}
            {stopLoss ? (
              <G>
                <Line x1="0" y1={yPos(stopLoss)} x2={w} y2={yPos(stopLoss)} stroke={isDark ? '#22D3EE' : '#06B6D4'} strokeDasharray="6 6" strokeWidth="1" />
                <G x={w - 60} y={yPos(stopLoss) - 10}>
                  <Rect width={60} height={20} fill={isDark ? '#22D3EE' : '#06B6D4'} />
                  <SvgText x={30} y={14} fill="#FFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                    SL
                  </SvgText>
                </G>
              </G>
            ) : null}

            {takeProfit ? (
              <G>
                <Line x1="0" y1={yPos(takeProfit)} x2={w} y2={yPos(takeProfit)} stroke="#388E3C" strokeDasharray="6 6" strokeWidth="1" />
                <G x={w - 60} y={yPos(takeProfit) - 10}>
                  <Rect width={60} height={20} fill="#388E3C" />
                  <SvgText x={30} y={14} fill="#FFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                    TP
                  </SvgText>
                </G>
              </G>
            ) : null}

            {/* Active Live Price Lines */}
            <Line x1="0" y1={yPos(ASK)} x2={w - 60} y2={yPos(ASK)} stroke={T.trading.sell.primary} strokeWidth="1" />
            <Line x1="0" y1={yPos(BID)} x2={w - 60} y2={yPos(BID)} stroke={T.trading.buy.primary} strokeWidth="1" />

            {/* Price Tags on Right Axis */}
            <G x={w - 60} y={yPos(ASK) - 10}>
              <Rect width={60} height={20} fill={T.trading.sell.primary} />
              <SvgText x={30} y={14} fill="#FFF" fontSize="11" fontWeight="bold" textAnchor="middle">
                {ASK.toFixed(decimals)}
              </SvgText>
            </G>
            
            <G x={w - 60} y={yPos(BID) - 10}>
              <Rect width={60} height={20} fill={T.trading.buy.primary} />
              <SvgText x={30} y={14} fill="#FFF" fontSize="11" fontWeight="bold" textAnchor="middle">
                {BID.toFixed(decimals)}
              </SvgText>
            </G>
          </Svg>
        )}
      </View>

      {/* Footer / Controls */}
      <View style={styles.footer}>
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={16} color={T.textMuted} style={styles.disclaimerIcon} />
          <Text style={styles.disclaimer}>
            SL/TP must be at least 10 points away from the market price. Orders are executed by the broker.
          </Text>
        </View>
        
        {submitMessage && (
          <Text style={styles.validationText}>{submitMessage}</Text>
        )}
        {!submitMessage && !positionsApi && (
          <Text style={styles.validationText}>No connection</Text>
        )}

        <Pressable 
          style={({ pressed }) => [
            styles.modifyBtn,
            { backgroundColor: T.accent },
            pressed && { opacity: 0.8 },
            isSubmitting && { opacity: 0.5 }
          ]}
          disabled={isSubmitting}
          onPress={handleModify}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.modifyText}>MODIFY POSITION</Text>
          )}
        </Pressable>
      </View>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) => StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDark ? 'rgba(2, 6, 23, 0.42)' : 'rgba(15, 23, 42, 0.2)',
  },
  sheetFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
  },
  sheetSurface: {
    flex: 1,
    backgroundColor: isDark ? '#06080D' : '#FFFFFF',
    borderColor: isDark ? '#1E293B' : 'rgba(0,0,0,0.05)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 18,
  },
  dragZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 10,
  },
  dragHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  loaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  headerTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerActionLabel: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  headerTicketLabel: {
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  headerSide: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerVol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headerSymbol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '800',
  },
  headerAt: {
    color: T.textMuted,
    fontSize: 14,
  },
  headerPrice: {
    color: T.text,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  priceHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.glass2,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  priceCard: {
    flex: 1,
    alignItems: 'center',
  },
  priceCardDivider: {
    width: 1,
    height: 40,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.06)',
  },
  priceLabel: {
    color: T.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: -8,
    includeFontPadding: false,
  },
  priceNormal: {
    fontSize: 24,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  priceHuge: {
    fontSize: 34,
    fontWeight: '800',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    gap: 10,
    marginBottom: 12,
  },
  stepperCard: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 8,
    paddingLeft: 11,
    paddingRight: 9,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: T.glass1,
    overflow: 'hidden',
    position: 'relative',
  },
  stepperAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  stepperHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepperHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  stepperBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  stepperBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepperClear: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  stepperPriceWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 26,
  },
  stepperPriceMain: {
    color: T.text,
    fontSize: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  stepperPriceHuge: {
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  stepperPriceEmpty: {
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  stepperHiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
    fontSize: 1,
  },
  stepperSquareBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.glass2,
  },
  stepperChipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 8,
  },
  stepperChip: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.glass2,
  },
  stepperChipText: {
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  stepperFootRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  stepperFootLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepperFootValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: T.textMuted,
  },
  chartContainer: {
    marginVertical: 10,
    overflow: 'hidden',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0,0,0,0.03)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.05)',
  },
  disclaimerIcon: {
    marginRight: 8,
  },
  disclaimer: {
    flexShrink: 1,
    color: T.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
  },
  validationText: {
    color: T.trading.sell.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  modifyBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    shadowColor: isDark ? '#22D3EE' : '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  modifyText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
