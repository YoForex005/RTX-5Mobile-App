/**
 * Settings Feature UI: NewsScreen
 * 
 * Renders categorized real-time market news headlines, sourced from external
 * financial feeds (e.g. FXStreet) directly into the application.
 */

import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { newsItems } from '../../mock/tradingData';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo } from 'react';

export function NewsScreen() {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
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

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: T.accent,
    fontSize: 20,
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
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: T.down,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: T.text,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  headline: {
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
