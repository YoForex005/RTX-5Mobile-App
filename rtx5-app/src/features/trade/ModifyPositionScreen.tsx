import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { positions } from '../../mock/tradingData';
import { colors, spacing } from '../../theme';
import { findPositionById } from './tradeFlow';

export function ModifyPositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const position = useMemo(
    () => findPositionById(positionId) ?? positions[0],
    [positionId]
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Modify Position</Text>
        <Text style={styles.subTitle}>#{position.id} {position.symbol} {position.side} {position.volume.toFixed(2)}</Text>
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
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor='#6d788c'
        keyboardType='numeric'
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subTitle: {
    marginTop: 2,
    color: '#7e8ba1',
    fontSize: 12,
  },
  formCard: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e283b',
    backgroundColor: '#0a111c',
    gap: spacing.md,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: '#9aa8bc',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#121c2b',
    borderWidth: 1,
    borderColor: '#2a3850',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#e7edf7',
    fontSize: 15,
  },
  success: {
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#254f42',
    backgroundColor: '#122f27',
    padding: spacing.md,
  },
  successText: {
    color: '#7be0b5',
    fontSize: 13,
  },
  submitButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderRadius: 8,
    backgroundColor: '#0f6bca',
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
