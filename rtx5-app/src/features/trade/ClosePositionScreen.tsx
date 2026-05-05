/**
 * Trade Feature UI: ClosePositionScreen
 * 
 * Interface for partially or fully closing a single specific active position. 
 * Allows users to adjust the exact volume to close.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { usePositionsState } from '../../state/positionsState';
import { useTradingState } from '../../state/tradingState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { positionsApi } from '../../api/positions';
import type { PositionItem } from '../../dev/mock/tradingData';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { findPositionById, symbolDisplayName } from './tradeFlow';
import { resolveLivePositionPrice } from './livePositionMetrics';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';

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

export function ClosePositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [actionLocked, setActionLocked] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const actionLockRef = useRef(false);
  const actionReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

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
    try {
      await positionsApi.closePosition(ticketId);

      const state = usePositionsState.getState();
      state.setPositions(state.positions.filter(p => String(p.id) !== String(ticketId)));
      setSubmitted(true);
      router.back();

      if (resolvedLogin) {
        state.refreshPositions(resolvedLogin);
      }
    } catch (error: any) {
      setCloseError(
        formatTradingErrorFeedback(
          classifyTradingError(error, { action: 'close-position' }),
        ),
      );
    } finally {
      setIsClosing(false);
      releaseActionLock();
    }
  }, [isClosing, position, releaseActionLock, resolvedLogin]);

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
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const screenBg = isDark ? T.bg : '#F1F5F9';

  if (!position) return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={28} color={T.text} />
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
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={28} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]}>Close Position</Text>
        <View style={styles.headerBtn} />
      </View>
      <ScrollView
        style={styles.contentWrap}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          <View style={styles.success}>
            {closeError ? (
              <Text style={[styles.successText, { color: T.trading.sell.primary }]}>
                {closeError}
              </Text>
            ) : (
              <Text style={styles.successText}>Close order submitted. Position closed successfully.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.actionButton, styles.closeButton, (isClosing || actionLocked) && { opacity: 0.6 }]}
            disabled={isClosing || actionLocked}
            onPressIn={handleClosePosition}
            unstable_pressDelay={0}
          >
            {isClosing ? (
              <ActivityIndicator color={T.trading.sell.primary} />
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
  const styles = useMemo(() => makeStyles(T), [T]);
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

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
    borderColor: T.borderMedium,
    backgroundColor: T.glass2,
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
    letterSpacing: -0.5,
  },
  instrument: {
    marginTop: 2,
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  sideText: {
    fontSize: 14,
    fontWeight: '800',
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
    backgroundColor: T.glass1,
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
    fontWeight: '800',
  },
  negative: {
    color: T.trading.loss,
  },
  positive: {
    color: T.trading.profit,
  },
  success: {
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
    backgroundColor: 'rgba(74,222,128,0.08)',
    padding: spacing.md,
  },
  successText: {
    color: T.trading.profit,
    fontSize: 13,
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
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.borderMedium,
  },
  closeByButtonText: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
