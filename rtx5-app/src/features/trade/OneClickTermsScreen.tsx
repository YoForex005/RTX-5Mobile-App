import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo } from 'react';

export function OneClickTermsScreen() {
  const { oneClickAccepted, setOneClickAccepted } = useUserPreferences();
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  return (
    <Screen scroll>
      <Text style={styles.title}>One Click Trading</Text>
      <View style={styles.card}>
        <Text style={styles.text}>
          You are about to activate One Click Trading mode. By clicking Accept the terms below,
          you acknowledge and agree to bound order submission behavior.
        </Text>
        <Text style={styles.text}>
          There will be no subsequent confirmation prompt for one-click order actions once activated.
        </Text>
        <Text style={styles.text}>
          You agree to accept all risks associated with one-click trading mode, including errors or
          omissions in submitting orders.
        </Text>
      </View>
      <View style={styles.row}>
        <Switch
          value={oneClickAccepted}
          onValueChange={setOneClickAccepted}
          trackColor={{ false: '#1E293B', true: 'rgba(59, 130, 246, 0.5)' }}
          thumbColor={oneClickAccepted ? '#3b82f6' : '#f4f3f4'}
          {...({ activeThumbColor: '#3b82f6', activeTrackColor: 'rgba(59, 130, 246, 0.5)', thumbTintColor: oneClickAccepted ? '#3b82f6' : '#f4f3f4' } as any)}
        />
        <Text style={styles.accept}>I Accept these Terms and Conditions</Text>
      </View>
      <Pressable style={[styles.button, !oneClickAccepted && styles.buttonDisabled]} onPress={() => setOneClickAccepted(true)}>
        <Text style={styles.buttonText}>ACCEPT</Text>
      </Pressable>
    </Screen>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: T.text,
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    margin: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.borderMedium,
    backgroundColor: T.glass1,
    padding: spacing.md,
  },
  text: {
    color: T.textSub,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: spacing.md,
  },
  row: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accept: {
    color: T.textSub,
    fontSize: 16,
    flex: 1,
  },
  button: {
    margin: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: '#1D4ED8',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: T.text,
    fontWeight: '700',
    fontSize: 20,
  },
});
