import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { positions } from '../../mock/tradingData';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { findPositionById, positionPairCandidates } from './tradeFlow';

export function CloseByScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [submitted, setSubmitted] = useState(false);

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
          #{sourcePosition.id} {sourcePosition.symbol} {sourcePosition.side} {sourcePosition.volume.toFixed(2)}
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
              <Text style={styles.pairMeta}>{candidate.side} {candidate.volume.toFixed(2)} • {fmt.price(candidate.currentPrice)}</Text>
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

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  title: {
    color: G.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subTitle: {
    marginTop: 2,
    color: G.textSub,
    fontSize: 12,
  },
  referenceCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: G.glass1,
    borderWidth: 1,
    borderColor: G.border,
  },
  referenceTitle: {
    color: G.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  referenceValue: {
    marginTop: 4,
    color: G.text,
    fontSize: 15,
    fontWeight: '600',
  },
  listCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 10,
    backgroundColor: G.glass1,
    borderWidth: 1,
    borderColor: G.border,
    overflow: 'hidden',
  },
  pairRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: G.border,
  },
  pairRowSelected: {
    backgroundColor: G.glass2,
  },
  pairTitle: {
    color: G.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pairMeta: {
    marginTop: 2,
    color: G.textSub,
    fontSize: 12,
  },
  pairPnl: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positive: {
    color: G.up,
  },
  negative: {
    color: G.down,
  },
  emptyText: {
    padding: spacing.md,
    color: G.textMuted,
    fontSize: 13,
  },
  success: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: G.upGlow,
    backgroundColor: G.upGlow,
    padding: spacing.md,
  },
  successText: {
    color: G.up,
    fontSize: 13,
  },
  submitButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderRadius: 8,
    backgroundColor: G.accent,
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: G.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
