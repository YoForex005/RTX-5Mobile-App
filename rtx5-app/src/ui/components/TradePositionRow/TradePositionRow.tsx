/**
 * Optimized list item rendering an individual Open Position.
 *
 * Architectural Note:
 * This component intentionally hooks its own single-symbol quote listener.
 * That keeps updates scoped to the affected row instead of forcing the whole
 * trade list to re-render on every market tick.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useTheme } from '../../theme/useTheme';
import { fmt } from '../../../utils/format';
import { formatBrokerTime } from '../../../utils/brokerTime';
import { useUserPreferences } from '../../../state/userPreferences';
import { useLiveSymbolQuote } from '../../../query/websocket';
import { resolveTradingLoginString } from '../../../state/tradingLogin';
import { usePositionsState } from '../../../state/positionsState';
import { prefetchOrderTicketData } from '../../../utils/navigationPrefetch';
import {
  resolveLivePositionPnl,
  resolveLivePositionPrice,
} from '../../../features/trade/livePositionMetrics';
import { OverlayActions } from './OverlayActions';
import { tradePositionRowStyles as styles } from './styles';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function TradePositionRowComponent({
  item,
  onPress,
  onLongPress,
  onBulkPress,
  pnlCurrency = 'USD',
  selected = false,
}: {
  item: PositionItem;
  onPress: (item: PositionItem) => void;
  onLongPress: (item: PositionItem) => void;
  onBulkPress?: () => void;
  pnlCurrency?: string;
  selected?: boolean;
}) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const primePositionSnapshot = usePositionsState((state) => state.primePositionSnapshot);
  const isBuy = item.side === 'buy';
  const [expanded, setExpanded] = useState(false);
  const [overlayActionLocked, setOverlayActionLocked] = useState(false);
  const overlayActionLockRef = useRef(false);
  const overlayActionReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ACTIONS_WIDTH = 270;
  const translateX = useSharedValue(ACTIONS_WIDTH); // Start deeply closed (pushed right)
  const startX = useSharedValue(0);

  const closeOverlay = () => {
    translateX.value = withSpring(ACTIONS_WIDTH, { damping: 20, stiffness: 200, overshootClamping: true });
  };

  useEffect(() => () => {
    if (overlayActionReleaseTimeoutRef.current) {
      clearTimeout(overlayActionReleaseTimeoutRef.current);
      overlayActionReleaseTimeoutRef.current = null;
    }
  }, []);

  const releaseOverlayActionLock = (delay = 0) => {
    if (overlayActionReleaseTimeoutRef.current) {
      clearTimeout(overlayActionReleaseTimeoutRef.current);
      overlayActionReleaseTimeoutRef.current = null;
    }
    const finalize = () => {
      overlayActionLockRef.current = false;
      setOverlayActionLocked(false);
      overlayActionReleaseTimeoutRef.current = null;
    };
    if (delay > 0) {
      overlayActionReleaseTimeoutRef.current = setTimeout(finalize, delay);
      return;
    }
    finalize();
  };

  const runOverlayAction = (action: () => void) => {
    if (overlayActionLockRef.current) {
      return;
    }
    overlayActionLockRef.current = true;
    setOverlayActionLocked(true);
    closeOverlay();
    action();
    releaseOverlayActionLock(320);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-10, 10])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const nextX = startX.value + event.translationX;
      translateX.value = Math.max(0, Math.min(ACTIONS_WIDTH, nextX));
    })
    .onEnd((event) => {
      if (event.velocityX < -500 || translateX.value < ACTIONS_WIDTH / 2) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200, overshootClamping: true });
      } else {
        translateX.value = withSpring(ACTIONS_WIDTH, { damping: 20, stiffness: 200, overshootClamping: true });
      }
    });

  const overlayStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  // Subscribe to only this row's symbol through the shared quote store.
  const liveQuote = useLiveSymbolQuote(item.symbol);

  const livePrice = resolveLivePositionPrice(item, liveQuote);

  const isJpy = item.symbol.includes('JPY');
  const decimals = isJpy ? 3 : 5; // Standard FX: 5 decimals, JPY pairs: 3 decimals
  const displayPnl = resolveLivePositionPnl(item, liveQuote);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const detailColor = T.textSub;
  const detailLabelColor = T.textMuted;
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : T.border;
  const tradingLogin = resolveTradingLoginString();

  const navigateWithSnapshot = (pathname: '/trade/close-position' | '/trade/close-by' | '/trade/modify-position') => {
    primePositionSnapshot(item);
    router.push({ pathname, params: { positionId: item.id } });
  };

  const navigateToModifyPosition = () => {
    navigateWithSnapshot('/trade/modify-position');
  };

  const navigateToOrderTicket = () => {
    prefetchOrderTicketData(tradingLogin, item.symbol);
    router.push({ pathname: '/trade/order-ticket', params: { symbol: item.symbol } });
  };

  // Reference unused props for parameter destructuring without lint warnings.
  void onPress;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        collapsable={false}
        style={[
          styles.row,
          {
            backgroundColor: isDark ? '#0E141F' : T.glass2,
            borderColor: T.border,
            borderLeftColor: isBuy ? T.trading.buy.primary : T.trading.sell.primary,
          },
          !isDark && styles.shadowLight,
          isDark && styles.shadowDark,
          selected && { backgroundColor: T.glass1, borderColor: T.trading.buy.primary },
        ]}
      >
        <Text style={[styles.cornerId, { color: T.textMuted }]}>#{item.id}</Text>

        <Pressable
          onPress={toggleExpand}
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={({ pressed }) => [styles.body, pressed && !expanded && styles.rowPressed]}
        >
          <View style={styles.headerRow}>
            <View style={styles.symbolLine}>
              <Text style={[styles.symbol, { color: T.text }]}>{fmt.symbol(item.symbol)}</Text>
              <View style={[
                styles.sideBadge,
                isBuy
                  ? { backgroundColor: 'rgba(37,99,235,0.15)' }
                  : { backgroundColor: 'rgba(220,38,38,0.12)' },
              ]}>
                <Text style={[styles.sideText, { color: isBuy ? T.trading.buy.hover : T.trading.sell.hover }]}>
                  {item.side}
                </Text>
              </View>
              <Text style={[styles.volume, { color: T.textMuted }]}>{(item.volume || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={[styles.pnl, { color: displayPnl >= 0 ? T.trading.profit : T.trading.loss }]}>
                {fmt.pnlPrecise(displayPnl)} {pnlCurrency}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <View style={styles.priceLeft}>
              <Text style={[styles.price, { color: T.textSub }]}>
                {Number.isFinite(item.openPrice) ? item.openPrice.toFixed(decimals) : '---'}
              </Text>
              <Ionicons name="arrow-forward" size={12} color={T.textDimmed} style={styles.arrow} />
              <Text style={[styles.price, { color: T.textSub }]}>
                {Number.isFinite(livePrice) ? livePrice.toFixed(decimals) : '---'}
              </Text>
            </View>
            <Text style={[styles.dateRight, { color: T.textSub }]}>
              {formatBrokerTime(item.openTime).replace(' ', '   ')}
            </Text>
          </View>

          {(!!item.sl || !!item.tp) && (
            <View style={styles.slTpRow}>
              {!!item.sl && (
                <View style={styles.slTpBadge}>
                  <Text style={[styles.slTpText, { color: '#F57C00' }]}>SL {fmt.price(item.sl as number)}</Text>
                </View>
              )}
              {!!item.tp && (
                <View style={styles.slTpBadge}>
                  <Text style={[styles.slTpText, { color: '#388E3C' }]}>TP {fmt.price(item.tp as number)}</Text>
                </View>
              )}
            </View>
          )}
        </Pressable>

        {/* ── Expanded Details ── */}
        {expanded && (
          <View style={[styles.expandedSection, { borderTopColor: dividerColor }]}>
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Limits</Text>
                <Pressable onPressIn={navigateToModifyPosition} hitSlop={12} unstable_pressDelay={0}>
                  <Text style={[styles.detailValue, { color: T.accent }]}>
                    SL / TP
                  </Text>
                </Pressable>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>OPEN</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  {fmt.price(item.openPrice)}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Swap</Text>
                <Text style={[styles.detailValue, { color: item.swap !== 0 ? T.trading.loss : detailColor }]}>
                  {item.swap.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Ticket</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  #{item.id}
                </Text>
              </View>
              <View style={styles.detailCell} />
              <View style={styles.detailCell} />
            </View>
          </View>
        )}

        {/* Render overlay on top within a clipping wrapper so shadows stay intact */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 16 }]} pointerEvents="box-none">
          <OverlayActions
            T={T}
            isDark={isDark}
            dividerColor={dividerColor}
            overlayActionLocked={overlayActionLocked}
            overlayStyle={overlayStyle}
            onClose={() => runOverlayAction(() => navigateWithSnapshot('/trade/close-position'))}
            onCloseBy={() => runOverlayAction(() => navigateWithSnapshot('/trade/close-by'))}
            onModify={() => runOverlayAction(navigateToModifyPosition)}
            onOrderTicket={() => runOverlayAction(navigateToOrderTicket)}
            onOpenChart={() => runOverlayAction(() => {
              setChartSymbol(item.symbol);
              router.push('/(tabs)/chart');
            })}
            onBulk={onBulkPress ? () => runOverlayAction(onBulkPress) : undefined}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export const TradePositionRow = memo(TradePositionRowComponent, (prev, next) => (
  prev.item === next.item &&
  prev.pnlCurrency === next.pnlCurrency &&
  prev.selected === next.selected &&
  prev.onPress === next.onPress &&
  prev.onLongPress === next.onLongPress &&
  prev.onBulkPress === next.onBulkPress
));
