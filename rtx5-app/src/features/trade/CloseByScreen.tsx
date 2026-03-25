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

  if (!sourcePosition) return <Screen><View style={styles.header}><Text style={styles.title}>Loading...</Text></View></Screen>;

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
        <Text style={styles.title}>Close By</Text>
        <Text style={styles.subTitle}>Select a matching position to pair-close</Text>
      </View>

      <View style={styles.referenceCard}>
        <Text style={styles.referenceTitle}>Source Position</Text>
        <Text style={styles.referenceValue}>
          #{sourcePosition.id} {sourcePosition.symbol.replace(/\//g, '')} {sourcePosition.side} {(sourcePosition.volume || 0).toFixed(2)}
        </Text>
      </View>

      <View style={styles.listCard}>
        {candidates.map((candidate) => (
          <Pressable
            key={candidate.id}
            style={[
              styles.pairRow,
              activePairId === candidate.id && styles.pairRowSelected,
            ]}
            onPress={() => setSelectedPairId(candidate.id)}
          >
            <View>
              <Text style={styles.pairTitle}>#{candidate.id} {candidate.symbol.replace(/\//g, '')}</Text>
              <Text style={styles.pairMeta}>{candidate.side} {(candidate.volume || 0).toFixed(2)} • {fmt.price(candidate.currentPrice)}</Text>
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
        style={[styles.submitButton, (!activePairId || candidates.length === 0 || isClosing) && styles.submitDisabled]}
        disabled={!activePairId || candidates.length === 0 || isClosing}
        onPress={handleSubmit}
      >
        {isClosing ? (
          <ActivityIndicator color={T.text} />
        ) : (
          <Text style={styles.submitText}>Send Close By Request</Text>
        )}
      </Pressable>
    </Screen>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  header: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  title: {
    color: T.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subTitle: {
    marginTop: 2,
    color: T.textSub,
    fontSize: 12,
  },
  referenceCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.border,
  },
  referenceTitle: {
    color: T.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  referenceValue: {
    marginTop: 4,
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
  },
  listCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 10,
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  pairRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  pairRowSelected: {
    backgroundColor: T.glass2,
  },
  pairTitle: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pairMeta: {
    marginTop: 2,
    color: T.textSub,
    fontSize: 12,
  },
  pairPnl: {
    fontSize: 15,
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
    fontSize: 13,
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
    marginTop: spacing.lg,
    borderRadius: 8,
    backgroundColor: T.accent,
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
