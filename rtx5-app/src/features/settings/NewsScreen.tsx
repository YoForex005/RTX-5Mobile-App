/**
 * Settings Feature UI: NewsScreen
 * 
 * Renders categorized real-time market news headlines, sourced from external
 * financial feeds (e.g. FXStreet) directly into the application.
 */

import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { newsItems } from '../../dev/mock/tradingData';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useCallback, useMemo, useState } from 'react';
import { useUserPreferences } from '../../state/userPreferences';

export function NewsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T), [T]);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);
  return (
    <Screen>
      <Text style={styles.title}>Categories ▾</Text>
      <FlatList
        data={newsItems}
        keyExtractor={(item) => item}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#D1D4DC' : '#131722'}
            colors={[isDark ? '#D1D4DC' : '#131722']}
            progressBackgroundColor={isDark ? '#0E141F' : '#FFFFFF'}
          />
        }
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
