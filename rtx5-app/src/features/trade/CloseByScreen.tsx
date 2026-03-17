import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { positions } from '../../mock/tradingData';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { findPositionById, positionPairCandidates } from './tradeFlow';

export function CloseByScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const sourcePosition = useMemo(
    () => findPositionById(positionId) ?? positions[0],
    [positionId]
  );
  const candidates = useMemo(
    () => positionPairCandidates(sourcePosition),
    [sourcePosition]
  );
  const [selectedPairId, setSelectedPairId] = useState(candidates[0]?.id ?? '');

  const selectedPair = candidates.find((candidate) => candidate.id === selectedPairId);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Close By</Text>
        <Text style={styles.subTitle}>Select a matching position to pair-close</Text>
      </View>

      <View style={styles.referenceCard}>
        <Text style={styles.referenceTitle}>Source Position</Text>
        <Text style={styles.referenceValue}>
          #{sourcePosition.id} {sourcePosition.symbol} {sourcePosition.side} {(sourcePosition.volume || 0).toFixed(2)}
        </Text>
      </View>

      <View style={styles.listCard}>
        {candidates.map((candidate) => (
          <Pressable
            key={candidate.id}
            style={[
              styles.pairRow,
              selectedPairId === candidate.id && styles.pairRowSelected,
            ]}
            onPress={() => setSelectedPairId(candidate.id)}
          >
            <View>
              <Text style={styles.pairTitle}>#{candidate.id} {candidate.symbol}</Text>
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

      {submitted ? (
        <View style={styles.success}>
          <Text style={styles.successText}>
            Close-by request simulated for #{sourcePosition.id}
            {selectedPair ? ` and #${selectedPair.id}` : ''}.
          </Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.submitButton, (!selectedPairId || candidates.length === 0) && styles.submitDisabled]}
        disabled={!selectedPairId || candidates.length === 0}
        onPress={() => setSubmitted(true)}
      >
        <Text style={styles.submitText}>Send Close By Request</Text>
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
