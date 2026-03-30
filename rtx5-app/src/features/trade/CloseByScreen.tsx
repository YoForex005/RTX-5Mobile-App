/**
 * Trade Feature UI: CloseByScreen
 * 
 * Allows users to close an open position by merging it with a contrasting opposite
 * position (e.g. hedging) to save on spread costs.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen';
import { usePositionsState } from '../../state/positionsState';
import { useUserPreferences } from '../../state/userPreferences';
import { positionsApi } from '../../api/positions';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { findPositionById, positionPairCandidates } from './tradeFlow';

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

  if (!sourcePosition) return <Screen><View style={styles.header}><Text style={styles.subTitle}>Loading...</Text></View></Screen>;

  const handleSubmit = async () => {
    if (!sourcePosition || !selectedPair) return;
    
    if (!accountDetails?.credentials?.accessToken) {
      setCloseError('Authentication Error: Session token missing.');
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
      const status = error?.response?.status;
      const data = error?.response?.data || {};
      if (status === 404) {
        setCloseError(data.message || 'Position not found.');
      } else if (status === 429) {
        const retryStr = error?.response?.headers?.['retry-after'];
        const seconds = parseInt(retryStr, 10);
        const waitMsg = !isNaN(seconds) ? ` Wait ${seconds} seconds.` : ' Wait before trying again.';
        setCloseError(`Rate limited!${waitMsg}`);
      } else {
        setCloseError(data.message || 'Failed to close positions.');
      }
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.subTitle}>Select a matching position to pair-close.</Text>
      </View>

      <View style={styles.referenceCard}>
        <Text style={styles.referenceTitle}>Source Position</Text>
        <View style={{ marginTop: 2 }}>
          <View style={styles.pairTopRow}>
            <Text style={styles.pairTicket}>#{sourcePosition.id}</Text>
            <Text style={styles.pairSymbol}>{sourcePosition.symbol.replace(/\//g, '')}</Text>
          </View>
          <View style={styles.pairBottomRow}>
            <View style={[styles.sideBadge, sourcePosition.side === 'buy' ? styles.sideBadgeBuy : styles.sideBadgeSell]}>
              <Text style={[styles.sideText, sourcePosition.side === 'buy' ? styles.sideTextBuy : styles.sideTextSell]}>
                {sourcePosition.side}
              </Text>
            </View>
            <Text style={styles.pairMeta}>{(sourcePosition.volume || 0).toFixed(2)}</Text>
            <Text style={styles.pairDivider}>•</Text>
            <Text style={styles.pairPrice}>{fmt.price(sourcePosition.openPrice)}</Text>
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
                <Text style={styles.pairTicket}>#{candidate.id}</Text>
                <Text style={styles.pairSymbol}>{candidate.symbol.replace(/\//g, '')}</Text>
              </View>
              <View style={styles.pairBottomRow}>
                <View style={[styles.sideBadge, candidate.side === 'buy' ? styles.sideBadgeBuy : styles.sideBadgeSell]}>
                  <Text style={[styles.sideText, candidate.side === 'buy' ? styles.sideTextBuy : styles.sideTextSell]}>
                    {candidate.side}
                  </Text>
                </View>
                <Text style={styles.pairMeta}>{(candidate.volume || 0).toFixed(2)}</Text>
                <Text style={styles.pairDivider}>•</Text>
                <Text style={styles.pairPrice}>{fmt.price(candidate.currentPrice)}</Text>
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
    </Screen>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  header: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  subTitle: {
    color: T.textSub,
    fontSize: 14,
    textAlign: 'center',
  },
  referenceCard: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: T.glass1, // Keeps it theme consistent while modern
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  referenceTitle: {
    color: T.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
    marginBottom: 8,
  },
  sourceDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceTicket: {
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  sourceSymbol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sourceVolume: {
    color: T.text,
    fontSize: 15,
    fontWeight: '500',
  },
  sideBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sideBadgeBuy: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
  sideBadgeSell: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  sideText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  sideTextBuy: { color: '#3B82F6' },
  sideTextSell: { color: '#EF4444' },

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
    borderRadius: 12,
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  pairCardSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.5)',
  },
  pairTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pairTicket: { color: T.textMuted, fontSize: 12 },
  pairSymbol: { color: T.text, fontSize: 14, fontWeight: '700' },
  pairBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pairMeta: { color: T.textSub, fontSize: 13, fontWeight: '500' },
  pairDivider: { color: T.textMuted, fontSize: 13 },
  pairPrice: { color: T.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  
  pairPnl: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positive: {
    color: T.up,
  },
  negative: {
    color: T.down,
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
    borderColor: T.upGlow,
    backgroundColor: T.upGlow,
    padding: spacing.md,
  },
  successText: {
    color: T.up,
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
    color: 'rgb(239, 68, 68)',
    fontSize: 13,
  },
  submitButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderRadius: 12, 
    backgroundColor: '#3B82F6', 
    alignItems: 'center',
    paddingVertical: 14,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  submitDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
