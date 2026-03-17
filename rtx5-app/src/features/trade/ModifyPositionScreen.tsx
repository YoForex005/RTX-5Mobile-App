import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { positions } from '../../mock/tradingData';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { findPositionById } from './tradeFlow';

export function ModifyPositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const position = useMemo(
    () => findPositionById(positionId) ?? positions[0],
    [positionId]
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Modify Position</Text>
        <Text style={styles.subTitle}>#{position.id} {position.symbol} {position.side} {(position.volume || 0).toFixed(2)}</Text>
      </View>

      <View style={styles.formCard}>
        <Field label='Stop Loss' value={stopLoss} onChangeText={setStopLoss} placeholder='not set' />
        <Field label='Take Profit' value={takeProfit} onChangeText={setTakeProfit} placeholder='not set' />
      </View>

      {submitted ? (
        <View style={styles.success}>
          <Text style={styles.successText}>Modify request simulated. Changes queued for sync.</Text>
        </View>
      ) : null}

      <Pressable
        style={styles.submitButton}
        onPress={() => setSubmitted(true)}
      >
        <Text style={styles.submitText}>Apply Changes</Text>
      </Pressable>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.textMuted}
        keyboardType='numeric'
        style={styles.input}
      />
    </View>
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
  formCard: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass1,
    gap: spacing.md,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: T.textMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: T.glass2,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: T.text,
    fontSize: 15,
  },
  success: {
    marginHorizontal: spacing.md,
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
  submitText: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
