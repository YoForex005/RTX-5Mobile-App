import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { newsItems } from '../../mock/tradingData';
import { colors, spacing } from '../../theme';

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
    color: colors.accent,
    fontSize: 20,
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
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e06a6a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  headline: {
    color: '#f4f6f9',
    fontSize: 15,
  },
  source: {
    color: '#4e9ef9',
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
