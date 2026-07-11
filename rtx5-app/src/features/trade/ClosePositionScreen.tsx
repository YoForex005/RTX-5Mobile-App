import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: ClosePositionScreen
 * 
 * Interface for partially or fully closing a single specific active position. 
 * Allows users to adjust the exact volume to close.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { usePositionsState } from '../../state/positionsState';
import { useTradingState } from '../../state/tradingState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { positionsApi } from '../../api/positions';
import { appQueryClient } from '../../state/providers/AppProviders';
import type { PositionItem } from '../../dev/mock/tradingData';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS } from '../../utils/actionLatency';
import { findPositionById, symbolDisplayName } from './tradeFlow';
import { resolveLivePositionPrice } from './livePositionMetrics';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';

// Match the app dark-theme palette: #121212 canvas + #1E1E1E cards.
const SETTINGS_DARK_BACKGROUND = '#121212';
const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E';

function isValidCloseTicket(value: unknown): value is string | number {
  return typeof value === 'number'
    ? Number.isInteger(value) && value > 0
    : typeof value === 'string' && /^\d+$/.test(value.trim());
}

function isRenderableClosePosition(position: PositionItem | undefined): position is PositionItem {
  const symbol = position?.symbol?.trim();
  return Boolean(
    position &&
    symbol &&
    symbol.toUpperCase() !== 'UNKNOWN' &&
    symbol.toUpperCase() !== 'UNDEFINED' &&
    isValidCloseTicket(position.id),
  );
}

/**
 * Screen dedicated to partially or fully closing an open position at the current market price.
 */
export function ClosePositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [actionLocked, setActionLocked] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const actionLockRef = useRef(false);
  const actionReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const positions = usePositionsState((s) => s.positions);
  const primedPosition = usePositionsState((s) =>
    positionId ? s.positionSnapshots[Array.isArray(positionId) ? positionId[0] : positionId] : undefined
  );
  const primePositionSnapshot = usePositionsState((s) => s.primePositionSnapshot);
  const resolvedPosition = useMemo(
    () => findPositionById(positions, positionId) ?? primedPosition,
    [positions, positionId, primedPosition]
  );
  const [stablePosition, setStablePosition] = useState<PositionItem | null>(
    isRenderableClosePosition(resolvedPosition) ? resolvedPosition : null,
  );
  useEffect(() => {
    if (isRenderableClosePosition(resolvedPosition)) {
      setStablePosition(resolvedPosition);
    }
  }, [resolvedPosition]);
  const position = isRenderableClosePosition(resolvedPosition)
    ? resolvedPosition
    : stablePosition;
  const resolvedLogin = resolveTradingLoginString();

  const quotes = useTradingState((s) => s.quotes);
  const getLivePrice = (p: typeof position) => {
    if (!p) return 0;
    const q = quotes[p.symbol];
    return resolveLivePositionPrice(p, q);
  };

  useEffect(() => {
    if (!position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [position, resolvedLogin]);

  useEffect(() => () => {
    if (actionReleaseTimeoutRef.current) {
      clearTimeout(actionReleaseTimeoutRef.current);
      actionReleaseTimeoutRef.current = null;
    }
  }, []);

  const releaseActionLock = useCallback((delay = 0) => {
    if (actionReleaseTimeoutRef.current) {
      clearTimeout(actionReleaseTimeoutRef.current);
      actionReleaseTimeoutRef.current = null;
    }
    const finalize = () => {
      actionLockRef.current = false;
      setActionLocked(false);
      actionReleaseTimeoutRef.current = null;
    };
    if (delay > 0) {
      actionReleaseTimeoutRef.current = setTimeout(finalize, delay);
      return;
    }
    finalize();
  }, []);

  /**
   * Executes the market order to close the specified volume of the position.
   */
  const handleClosePosition = useCallback(async () => {
    if (!position || actionLockRef.current || isClosing) {
      return;
    }

    actionLockRef.current = true;
    setActionLocked(true);

    const ticketId = position.id;
    if (!isValidCloseTicket(ticketId)) {
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            'Position Error',
            'The position ticket is still loading. Return to Trade and select the position again.',
          ),
        ),
      );
      releaseActionLock();
      return;
    }

    const currentAccountDetails = useUserPreferences.getState().accountDetails;
    if (!currentAccountDetails?.credentials?.accessToken) {
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            'Authentication Error',
            'The app does not have a valid local trading session. Log in again before closing a position.',
          ),
        ),
      );
      releaseActionLock();
      return;
    }

    setIsClosing(true);
    setCloseError(null);
    const closeSnapshot = { ...position };
    // Close feels instant: remove the row and navigate back first, then finish
    // server confirmation in the background or restore the row on failure.
    usePositionsState.getState().beginOptimisticClose(ticketId);
    setSubmitted(true);
    safeRouterBack(router, '/(tabs)/trade');

    void positionsApi.closePosition(ticketId)
      .then(() => {
        const state = usePositionsState.getState();
        state.finishOptimisticClose(ticketId);

        // Invalidate all history / deals / account caches so the History tab
        // immediately shows the newly closed trade and its Net P/L.
        appQueryClient.invalidateQueries({ queryKey: ['positionHistory'] });
        appQueryClient.invalidateQueries({ queryKey: ['accountDeals'] });
        appQueryClient.invalidateQueries({ queryKey: ['deals'] });
        appQueryClient.invalidateQueries({ queryKey: ['positions'] });
        appQueryClient.invalidateQueries({ queryKey: ['ordersByLogin'] });
        appQueryClient.invalidateQueries({ queryKey: ['accountSummary'] });
        appQueryClient.invalidateQueries({ queryKey: ['exposure'] });
        appQueryClient.invalidateQueries({ queryKey: ['transactions'] });

        if (resolvedLogin) {
          void state.refreshPositions(resolvedLogin);
        }
      })
      .catch((error: any) => {
        const feedback = classifyTradingError(error, { action: 'close-position' });
        const message = formatTradingErrorFeedback(feedback);
        usePositionsState.getState().rollbackOptimisticClose(closeSnapshot);
        setCloseError(message);
        Alert.alert(feedback.title, feedback.message);
      })
      .finally(() => {
        setIsClosing(false);
        releaseActionLock();
      });
  }, [isClosing, position, releaseActionLock, resolvedLogin]);

  /**
   * Navigates the user to the 'Close By' screen, allowing them to close this position by merging it with an opposite open position.
   */
  const handleOpenCloseBy = useCallback(() => {
    if (!position || actionLockRef.current || isClosing) {
      return;
    }

    actionLockRef.current = true;
    setActionLocked(true);
    primePositionSnapshot(position);
    router.push({ pathname: '/trade/close-by', params: { positionId: position.id } });
    releaseActionLock(320);
  }, [isClosing, position, primePositionSnapshot, releaseActionLock]);

  const insets = useSafeAreaInsets();
  const screenBg = isDark ? SETTINGS_DARK_BACKGROUND : T.bg;

  if (!position) return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable onPress={() => safeRouterBack(router, '/(tabs)/trade')} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={26} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]}>Close Position</Text>
        <View style={styles.headerBtn} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={T.accent} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable onPress={() => safeRouterBack(router, '/(tabs)/trade')} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={26} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]}>Close Position</Text>
        <View style={styles.headerBtn} />
      </View>
      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.contentWrap}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <View style={styles.header}>
          <Text style={styles.subTitle}>Review and confirm closing order</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.symbol}>{position.symbol.replace(/\//g, '')}</Text>
              <Text style={styles.instrument}>{symbolDisplayName(position.symbol)}</Text>
            </View>
            <Text style={[styles.sideText, position.side === 'buy' ? styles.sideTextBuy : styles.sideTextSell]}>
              {position.side.toUpperCase()} {(position.volume || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.metrics}>
            <Metric label='Open Price' value={fmt.price(position.openPrice)} />
            <Metric label='Current Price' value={fmt.price(getLivePrice(position))} />
            <View style={styles.metricSpacer} />
            <Metric label='Real-time P/L' value={fmt.pnl(position.pnl)} negative={position.pnl < 0} positive={position.pnl > 0} isHighlighted />
            <Metric label='Order Ticket' value={`#${position.id}`} isSecondary />
          </View>
        </View>

        {closeError || submitted ? (
          <View style={[styles.statusBox, closeError ? styles.statusBoxError : styles.statusBoxSuccess]}>
            {closeError ? (
              <Text style={[styles.statusText, styles.statusTextError]}>
                {closeError}
              </Text>
            ) : (
              <Text style={[styles.statusText, styles.statusTextSuccess]}>Close order submitted. Position closed successfully.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.actionButton, styles.closeButton, (isClosing || actionLocked) && { opacity: 0.6 }]}
            disabled={isClosing || actionLocked}
            onPress={() => { void handleClosePosition(); }}
            activateOnPressIn
            latencyLabel="closePosition.submit"
            latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
            unstable_pressDelay={0}
          >
            {isClosing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.closeButtonText}>Close Position</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.closeByButton, actionLocked && { opacity: 0.6 }]}
            disabled={isClosing || actionLocked}
            onPressIn={handleOpenCloseBy}
            unstable_pressDelay={0}
          >
            <Text style={styles.closeByButtonText}>Close By</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * A reusable UI sub-component for rendering a small label/value statistic (e.g. commission, swap).
 */
function Metric({
  label,
  value,
  negative = false,
  positive = false,
  isHighlighted = false,
  isSecondary = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
  isHighlighted?: boolean;
  isSecondary?: boolean;
}) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  return (
    <View style={[styles.metricRow, isHighlighted && styles.highlightedRow]}>
      <Text style={[styles.metricLabel, isHighlighted && styles.highlightedLabel]}>{label}</Text>
      <Text style={[
        styles.metricValue, 
        negative && styles.negative, 
        positive && styles.positive,
        isSecondary && styles.secondaryValue,
        isHighlighted && styles.highlightedValue
      ]}>{value}</Text>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark = false) => StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
  },
  headerBtn: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
  contentWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    marginTop: 4,
    paddingHorizontal: spacing.md,
  },
  title: {
    color: T.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subTitle: {
    marginTop: 2,
    color: T.textMuted,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  card: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? T.border : T.borderMedium,
    backgroundColor: isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  symbol: {
    color: T.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0,
  },
  instrument: {
    marginTop: 2,
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  sideText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sideTextBuy: {
    color: T.trading.buy.primary,
  },
  sideTextSell: {
    color: T.trading.sell.primary,
  },
  separator: {
    height: 1,
    backgroundColor: T.borderSubtle,
    marginVertical: 12,
  },
  metrics: {
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  highlightedRow: {
    marginTop: 2,
    backgroundColor: isDark ? 'rgba(15,23,42,0.42)' : T.glass1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricSpacer: {
    height: 4,
  },
  metricLabel: {
    color: T.textSub,
    fontSize: 13,
    fontWeight: '500',
  },
  highlightedLabel: {
    color: T.text,
    fontWeight: '600',
  },
  metricValue: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  secondaryValue: {
    color: T.textSub,
    fontSize: 13,
    fontWeight: '600',
  },
  highlightedValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  negative: {
    color: T.trading.loss,
  },
  positive: {
    color: T.trading.profit,
  },
  statusBox: {
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
  },
  statusBoxSuccess: {
    borderColor: isDark ? 'rgba(16,185,129,0.34)' : 'rgba(5,150,105,0.24)',
    backgroundColor: T.upGlow,
  },
  statusBoxError: {
    borderColor: isDark ? 'rgba(239,68,68,0.34)' : 'rgba(220,38,38,0.24)',
    backgroundColor: T.downGlow,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  statusTextSuccess: {
    color: T.trading.profit,
  },
  statusTextError: {
    color: T.trading.loss,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  closeButton: {
    backgroundColor: T.trading.sell.primary,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeByButton: {
    backgroundColor: isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass1,
    borderWidth: 1,
    borderColor: isDark ? T.border : T.borderMedium,
  },
  closeByButtonText: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
