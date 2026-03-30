/**
 * Reusable React Native UI component: Screen.
 */

import { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/useTheme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
}>;

export function Screen({ children, scroll = false, style }: ScreenProps) {
  const T = useTheme();

  if (scroll) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: T.bg }]}>
        <ScrollView style={[styles.base, { backgroundColor: T.bg }]} contentContainerStyle={[styles.content, style]}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: T.bg }]}>
      <View style={[styles.base, { backgroundColor: T.bg }, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  base: {
    flex: 1,
  },
  content: {
    paddingBottom: 36,
  },
});
