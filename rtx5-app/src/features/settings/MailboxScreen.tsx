import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme';

const messages = new Array(12).fill(0).map((_, i) => ({
  id: `${i}`,
  title: 'The List of Instruments Affected by High Importance News',
  source: 'Administration',
  time: i === 0 ? '12:06 AM' : i < 3 ? 'Yesterday' : '05/02/26',
}));

export function MailboxScreen() {
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

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  row: {
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomColor: '#111722',
    borderBottomWidth: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#98be4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  msg: {
    color: '#f5f7fa',
    fontSize: 15,
  },
  source: {
    color: '#53a2ff',
    fontSize: 13,
    marginTop: 2,
  },
  time: {
    color: '#72a9ff',
    fontSize: 13,
  },
  dot: {
    color: '#2f7dee',
    textAlign: 'right',
  },
});
