/**
 * Trade Feature UI: CloseByScreen
 * 
 * Allows users to close an open position by merging it with a contrasting opposite
 * position (e.g. hedging) to save on spread costs.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePositionsState } from '../../state/positionsState';
import { useUserPreferences } from '../../state/userPreferences';
import { positionsApi } from '../../api/positions';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { useTradingState } from '../../state/tradingState';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { findPositionById, positionPairCandidates } from './tradeFlow';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';

export function CloseByScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const { accountDetails } = useUserPreferences();
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const positions = usePositionsState((s) => s.positions);
  const resolvedLogin = resolveTradingLoginString();
  const quotes = useTradingState((s) => s.quotes);

  const getLivePrice = (p: any) => {
    if (!p) return 0;
    const q = quotes[p.symbol];
    if (!q) return p.currentPrice || p.openPrice;
    return p.side === 'buy' ? q.bid : q.ask;
  };

  const sourcePosition = useMemo(
    () => findPositionById(positions, positionId),
    [positions, positionId]
  );
  const candidates = useMemo(
    () => positionPairCandidates(positions, sourcePosition),
    [positions, sourcePosition]
  );

  const [selectedPairId, setSelectedPairId] = useState<string>('');

  // Auto-select the first candidate if none is selected
  const activePairId = selectedPairId || candidates[0]?.id || '';
  const selectedPair = candidates.find((candidate) => candidate.id === activePairId);

  const insets = useSafeAreaInsets();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const screenBg = isDark ? T.bg : '#F1F5F9';

  if (!sourcePosition) return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={28} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitleText, { color: T.text }]}>Close By</Text>
        <View style={styles.headerBtn} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={T.accent} />
      </View>
    </View>
  );

  const handleSubmit = async () => {
    if (!sourcePosition || !selectedPair) return;
    
    if (!accountDetails?.credentials?.accessToken) {
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            'Authentication Error',
            'The app does not have a valid local trading session. Log in again before using Close By.',
          ),
        ),
      );
      return;
    }

    setIsClosing(true);
    setCloseError(null);
    try {
      await positionsApi.closePosition(sourcePosition.id, selectedPair.id);

      const state = usePositionsState.getState();
      state.setPositions(state.positions.filter(p => 
        String(p.id) !== String(sourcePosition.id) && String(p.id) !== String(selectedPair.id)
      ));
      
      setSubmitted(true);
      router.back();

      if (resolvedLogin) {
        state.refreshPositions(resolvedLogin);
      }
    } catch (error: any) {
      setCloseError(
        formatTradingErrorFeedback(
          classifyTradingError(error, { action: 'close-by' }),
        ),
      );
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={28} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitleText, { color: T.text }]}>Close By</Text>
        <View style={styles.headerBtn} />
      </View>
      <View style={styles.header}>
        <Text style={styles.subTitle}>Select a matching position to pair-close.</Text>
      </View>

      <View style={styles.referenceCard}>
        <Text style={styles.referenceTitle}>SOURCE POSITION</Text>
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
          <Text style={styles.emptyText}>No matching positions available for close-by.</Text>
        ) : null}
      </View>

      {closeError || submitted ? (
        <View style={closeError ? styles.error : styles.success}>
          <Text style={closeError ? styles.errorText : styles.successText}>
            {closeError ? closeError : 'Close-by request completed successfully.'}
          </Text>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.submitButton,
          { marginTop: 4, paddingBottom: Math.max(insets.bottom, 16) },
          (!activePairId || candidates.length === 0 || isClosing) && styles.submitDisabled,
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
        ]}
        disabled={!activePairId || candidates.length === 0 || isClosing}
        onPress={handleSubmit}
      >
        {isClosing ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.submitText}>Send Close By Request</Text>
        )}
      </Pressable>
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
  headerTitleText: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
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
    backgroundColor: T.glass2,
    borderWidth: 1,
    borderColor: T.borderMedium,
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
  sideText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
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
    backgroundColor: T.glass2,
    borderWidth: 1,
    borderColor: T.borderMedium,
  },
  pairCardSelected: {
    backgroundColor: T.accentGlow,
    borderColor: T.accent,
  },
  pairTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  pairTicket: { color: T.textSub, fontSize: 13, fontWeight: '600' },
  pairSymbol: { color: T.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
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
