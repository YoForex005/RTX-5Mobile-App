import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: CloseByScreen
 * 
 * Allows users to close an open position by merging it with a contrasting opposite
 * position (e.g. hedging) to save on spread costs.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePositionsState } from '../../state/positionsState';
import { useUserPreferences } from '../../state/userPreferences';
import { positionsApi } from '../../api/positions';
import { appQueryClient } from '../../state/providers/AppProviders';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { useTradingState } from '../../state/tradingState';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { useTranslation } from '../../i18n/useTranslation';
import { findPositionById, positionPairCandidates } from './tradeFlow';
import { resolveLivePositionPrice } from './livePositionMetrics';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';

// Match the app dark-theme palette: #121212 canvas + #1E1E1E cards.
const SETTINGS_DARK_BACKGROUND = '#121212';
const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E';

/**
 * Screen used for 'Close By' operations, which allows closing two opposite positions of the same symbol against each other.
 */
export function CloseByScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [actionLocked, setActionLocked] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const actionLockRef = useRef(false);
  const actionReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const positions = usePositionsState((s) => s.positions);
  const primedPosition = usePositionsState((s) =>
    positionId ? s.positionSnapshots[Array.isArray(positionId) ? positionId[0] : positionId] : undefined
  );
  const resolvedLogin = resolveTradingLoginString();
  const quotes = useTradingState((s) => s.quotes);

  const getLivePrice = (p: any) => {
    if (!p) return 0;
    const q = quotes[p.symbol];
    return resolveLivePositionPrice(p, q);
  };

  const sourcePosition = useMemo(
    () => findPositionById(positions, positionId) ?? primedPosition,
    [positions, positionId, primedPosition]
  );
  const candidates = useMemo(
    () => positionPairCandidates(positions, sourcePosition),
    [positions, sourcePosition]
  );

  const [selectedPairId, setSelectedPairId] = useState<string>('');

  useEffect(() => {
    if (!sourcePosition && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [resolvedLogin, sourcePosition]);

  useEffect(() => () => {
    if (actionReleaseTimeoutRef.current) {
      clearTimeout(actionReleaseTimeoutRef.current);
      actionReleaseTimeoutRef.current = null;
    }
  }, []);

  // Auto-select the first candidate if none is selected
  const activePairId = selectedPairId || candidates[0]?.id || '';
  const selectedPair = candidates.find((candidate) => candidate.id === activePairId);

  const insets = useSafeAreaInsets();
  const screenBg = isDark ? SETTINGS_DARK_BACKGROUND : T.bg;

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
   * Executes the 'Close By' operation with the selected opposite position.
   */
  const handleSubmit = useCallback(async () => {
    if (!sourcePosition || !selectedPair || actionLockRef.current || isClosing) return;

    actionLockRef.current = true;
    setActionLocked(true);

    if (!accountDetails?.credentials?.accessToken) {
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Authentication Error'),
            t('The app does not have a valid local trading session. Log in again before using Close By.'),
          ),
        ),
      );
      releaseActionLock();
      return;
    }

    setIsClosing(true);
    setCloseError(null);
    const sourceSnapshot = { ...sourcePosition };
    const pairSnapshot = { ...selectedPair };
    const state = usePositionsState.getState();
    state.beginOptimisticClose(sourcePosition.id);
    state.beginOptimisticClose(selectedPair.id);
    setSubmitted(true);
    safeRouterBack(router, '/(tabs)/trade');

    void positionsApi.closePosition(sourcePosition.id, selectedPair.id)
      .then(() => {
        const latestState = usePositionsState.getState();
        latestState.finishOptimisticClose(sourcePosition.id);
        latestState.finishOptimisticClose(selectedPair.id);

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
          void latestState.refreshPositions(resolvedLogin);
        }
      })
      .catch((error: any) => {
        const feedback = classifyTradingError(error, { action: 'close-by' });
        const message = formatTradingErrorFeedback(feedback);
        const latestState = usePositionsState.getState();
        latestState.rollbackOptimisticClose(sourceSnapshot);
        latestState.rollbackOptimisticClose(pairSnapshot);
        setCloseError(message);
        Alert.alert(feedback.title, feedback.message);
      })
      .finally(() => {
        setIsClosing(false);
        releaseActionLock();
      });
  }, [accountDetails?.credentials?.accessToken, isClosing, releaseActionLock, resolvedLogin, selectedPair, sourcePosition, t]);

  if (!sourcePosition) return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable onPress={() => safeRouterBack(router, '/(tabs)/trade')} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={26} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitleText, { color: T.text }]}>{t('Close By')}</Text>
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
        <Text style={[styles.headerTitleText, { color: T.text }]}>{t('Close By')}</Text>
        <View style={styles.headerBtn} />
      </View>
      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <View style={styles.header}>
          <Text style={styles.subTitle}>{t('Select a matching position to pair-close.')}</Text>
        </View>

        <View style={styles.referenceCard}>
          <Text style={styles.referenceTitle}>{t('Source Position').toUpperCase()}</Text>
          <View style={styles.separator} />
          <View style={styles.pairTopRow}>
            <Text style={styles.pairSymbol}>{sourcePosition.symbol.replace(/\//g, '')}</Text>
            <Text style={styles.pairTicket}>#{sourcePosition.id}</Text>
          </View>
          <View style={styles.pairBottomRow}>
            <Text style={[styles.sideText, sourcePosition.side === 'buy' ? styles.sideTextBuy : styles.sideTextSell]}>
              {sourcePosition.side.toUpperCase()} {(sourcePosition.volume || 0).toFixed(2)}
            </Text>
            <View style={styles.priceContainer}>
              <Text style={styles.pairDivider}>•</Text>
              <Text style={styles.pairPrice}>{fmt.price(getLivePrice(sourcePosition))}</Text>
            </View>
          </View>
        </View>

        <View style={styles.candidateContainer}>
          {candidates.map((candidate) => (
            <Pressable
              key={candidate.id}
              style={[
                styles.pairCard,
                activePairId === candidate.id && styles.pairCardSelected,
              ]}
              onPress={() => setSelectedPairId(candidate.id)}
            >
              <View>
                <View style={styles.pairTopRow}>
                  <Text style={styles.pairSymbol}>{candidate.symbol.replace(/\//g, '')}</Text>
                  <Text style={styles.pairTicket}>#{candidate.id}</Text>
                </View>
                <View style={styles.pairBottomRow}>
                  <Text style={[styles.sideText, candidate.side === 'buy' ? styles.sideTextBuy : styles.sideTextSell]}>
                    {candidate.side.toUpperCase()} {(candidate.volume || 0).toFixed(2)}
                  </Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.pairDivider}>•</Text>
                    <Text style={styles.pairPrice}>{fmt.price(getLivePrice(candidate))}</Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.pairPnl, candidate.pnl >= 0 ? styles.positive : styles.negative]}>
                {fmt.pnl(candidate.pnl)}
              </Text>
            </Pressable>
          ))}
          {candidates.length === 0 ? (
            <Text style={styles.emptyText}>{t('No matching positions available for close-by.')}</Text>
          ) : null}
        </View>

        {closeError || submitted ? (
          <View style={closeError ? styles.error : styles.success}>
            <Text style={closeError ? styles.errorText : styles.successText}>
              {closeError ? closeError : t('Close-by request completed successfully.')}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            (!activePairId || candidates.length === 0 || isClosing || actionLocked) && styles.submitDisabled,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
          ]}
          disabled={!activePairId || candidates.length === 0 || isClosing || actionLocked}
          onPressIn={handleSubmit}
          unstable_pressDelay={0}
        >
          {isClosing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitText}>{t('Send Close By Request')}</Text>
          )}
        </Pressable>
      </ScrollView>
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
  headerTitleText: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  subTitle: {
    color: T.textSub,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  referenceCard: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass2,
    borderWidth: 1,
    borderColor: isDark ? T.border : T.borderMedium,
  },
  referenceTitle: {
    color: T.textSub,
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '700',
    marginBottom: 8,
  },
  separator: {
    height: 1,
    backgroundColor: T.borderSubtle,
    marginBottom: 12,
  },
  sourceDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceTicket: {
    color: T.textSub,
    fontSize: 13,
    fontWeight: '600',
  },
  sourceSymbol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sourceVolume: {
    color: T.text,
    fontSize: 15,
    fontWeight: '500',
  },
  sideText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
  sideTextBuy: { color: T.trading.buy.primary },
  sideTextSell: { color: T.trading.sell.primary },

  candidateContainer: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  pairCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass2,
    borderWidth: 1,
    borderColor: isDark ? T.border : T.borderMedium,
  },
  pairCardSelected: {
    backgroundColor: T.accentGlow,
    borderColor: T.accent,
  },
  pairTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  pairTicket: { color: T.textSub, fontSize: 13, fontWeight: '600' },
  pairSymbol: { color: T.text, fontSize: 16, fontWeight: '700', letterSpacing: 0 },
  pairBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceContainer: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  pairMeta: { color: T.textSub, fontSize: 13, fontWeight: '500' },
  pairDivider: { color: T.textMuted, fontSize: 13, fontWeight: '600', marginRight: 2 },
  pairPrice: { color: T.text, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600' },

  pairPnl: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positive: {
    color: T.trading.profit,
  },
  negative: {
    color: T.trading.loss,
  },
  emptyText: {
    padding: spacing.md,
    color: T.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  success: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
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
  error: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    padding: spacing.md,
  },
  errorText: {
    color: T.trading.loss,
    fontSize: 13,
  },
  submitButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
