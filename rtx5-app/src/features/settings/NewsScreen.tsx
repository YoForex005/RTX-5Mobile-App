import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { newsItems } from '../../mock/tradingData';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';

export function NewsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Categories ▾</Text>
      <FlatList
        data={newsItems}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.icon}><Text style={styles.iconText}>F</Text></View>
            <View style={styles.content}>
              <Text style={styles.headline}>{item}</Text>
              <Text style={styles.source}>FXStreet</Text>
            </View>
            <View>
              <Text style={styles.time}>Yesterday</Text>
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
    color: G.accent,
    fontSize: 20,
    fontWeight: '700',
  },
  row: {
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomColor: G.border,
    borderBottomWidth: 1,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: G.down,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: G.text,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  headline: {
    color: G.text,
    fontSize: 15,
  },
  source: {
    color: G.textSub,
    fontSize: 13,
    marginTop: 2,
  },
  time: {
    color: G.textMuted,
    fontSize: 13,
  },
  dot: {
    color: G.accent,
    textAlign: 'right',
  },
});
