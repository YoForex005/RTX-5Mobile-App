/**
 * Settings Feature UI: MailboxScreen
 * 
 * In-app messaging center displaying system notifications, margin call warnings,
 * broker announcements, and administrative alerts.
 */

import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo } from 'react';

const messages = new Array(12).fill(0).map((_, i) => ({
  id: `${i}`,
  title: 'The List of Instruments Affected by High Importance News',
  source: 'Administration',
  time: i === 0 ? '12:06 AM' : i < 3 ? 'Yesterday' : '05/02/26',
}));

export function MailboxScreen() {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <Screen>
      <Text style={styles.title}>Mailbox</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
            <View style={styles.content}>
              <Text style={styles.msg}>{item.title}</Text>
              <Text style={styles.source}>{item.source}</Text>
            </View>
            <View>
              <Text style={styles.time}>{item.time}</Text>
              <Text style={styles.dot}>•</Text>
            </View>
          </View>
        )}
      />
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
  row: {
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomColor: T.border,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: T.glass2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: T.text,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  msg: {
    color: T.text,
    fontSize: 15,
  },
  source: {
    color: T.textSub,
    fontSize: 13,
    marginTop: 2,
  },
  time: {
    color: T.textMuted,
    fontSize: 13,
  },
  dot: {
    color: T.accent,
    textAlign: 'right',
  },
});
