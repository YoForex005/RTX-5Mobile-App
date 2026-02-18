import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';

export function OneClickTermsScreen() {
  const { oneClickAccepted, setOneClickAccepted } = useUserPreferences();

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
        <Switch value={oneClickAccepted} onValueChange={setOneClickAccepted} />
        <Text style={styles.accept}>I Accept these Terms and Conditions</Text>
      </View>
      <Pressable style={[styles.button, !oneClickAccepted && styles.buttonDisabled]} onPress={() => setOneClickAccepted(true)}>
        <Text style={styles.buttonText}>ACCEPT</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    margin: spacing.md,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#0f131d',
    backgroundColor: '#11141b',
    padding: spacing.md,
  },
  text: {
    color: '#d2d8e2',
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
    color: '#c8cfda',
    fontSize: 16,
    flex: 1,
  },
  button: {
    margin: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 20,
  },
});
