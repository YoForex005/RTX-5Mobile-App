import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';

type ConnectMode = 'live' | 'demo';

const DEFAULT_ACCOUNT = {
  broker: 'Exness Technologies Ltd',
  accountName: 'Standard',
  login: '415257556',
  server: 'Exness-MT5Trial14',
  balance: '119 701.53 USD',
  type: 'Hedge',
  accessPoint: 'Access Point #6',
};

export function AccountsScreen() {
  const params = useLocalSearchParams<{
    broker?: string;
    server?: string;
    mode?: string;
  }>();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const broker = typeof params.broker === 'string' ? params.broker : DEFAULT_ACCOUNT.broker;
  const server = typeof params.server === 'string' ? params.server : DEFAULT_ACCOUNT.server;
  const mode = (params.mode === 'demo' ? 'demo' : 'live') as ConnectMode;

  const accountName = useMemo(() => (mode === 'demo' ? 'Demo Account' : DEFAULT_ACCOUNT.accountName), [mode]);
  const balanceLabel = useMemo(() => (mode === 'demo' ? '0.00 USD' : DEFAULT_ACCOUNT.balance), [mode]);

  return (
    <Screen>
      <View style={styles.page}>
        <Text style={styles.title}>Accounts</Text>

        <View style={styles.banner}>
          <Ionicons name='link-outline' size={14} color='#96c7ff' />
          <Text style={styles.bannerText}>Connected via broker directory ({mode.toUpperCase()})</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View>
              <Text style={styles.name}>{accountName}</Text>
              <Text style={styles.info}>{broker}</Text>
            </View>

            <View style={[styles.modePill, mode === 'demo' ? styles.modeDemo : styles.modeLive]}>
              <Text style={styles.modeText}>{mode.toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.info}>#{DEFAULT_ACCOUNT.login} - {server}</Text>
          <Text style={styles.balance}>{balanceLabel}</Text>
          <Text style={styles.info}>{DEFAULT_ACCOUNT.type}</Text>
        </View>

        {[
          ['Company', broker],
          ['Name', accountName],
          ['Email', 'xxxx@exness.io'],
          ['Phone', ''],
          ['Login', DEFAULT_ACCOUNT.login],
          ['Server', server],
          ['Connected', DEFAULT_ACCOUNT.accessPoint],
        ].map(([k, v]) => (
          <View style={styles.row} key={k}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value}>{v}</Text>
          </View>
        ))}

        <View style={styles.row}>
          <Text style={styles.key}>Trade Notifications</Text>
          <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>

        <Pressable style={styles.row}>
          <Text style={styles.key}>Connect from another device</Text>
          <Ionicons name='chevron-forward' size={16} color='#667890' />
        </Pressable>

        <Pressable style={styles.row}>
          <Text style={styles.key}>Change Password</Text>
          <Ionicons name='chevron-forward' size={16} color='#667890' />
        </Pressable>

        <Pressable style={styles.row}>
          <Text style={[styles.key, styles.danger]}>Delete Account</Text>
          <Ionicons name='chevron-forward' size={16} color='#ff6a62' />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: G.text,
    fontSize: 30,
    fontWeight: '700',
  },
  banner: {
    marginTop: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass2,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  bannerText: {
    marginLeft: 6,
    color: G.text,
    fontSize: 12,
  },
  card: {
    marginTop: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass1,
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  name: {
    color: G.text,
    fontSize: 24,
    fontWeight: '700',
  },
  info: {
    marginTop: 3,
    color: G.textSub,
    fontSize: 14,
  },
  balance: {
    marginTop: 8,
    color: G.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  modePill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
  },
  modeLive: {
    backgroundColor: G.glass2,
    borderColor: G.borderHi,
  },
  modeDemo: {
    backgroundColor: G.glass3,
    borderColor: G.borderHi,
  },
  modeText: {
    color: G.text,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  row: {
    marginTop: -1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  key: {
    color: G.text,
    fontSize: 16,
  },
  value: {
    color: G.textSub,
    fontSize: 14,
    marginLeft: spacing.md,
    flexShrink: 1,
    textAlign: 'right',
  },
  danger: {
    color: G.down,
  },
});
