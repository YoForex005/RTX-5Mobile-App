import { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { G } from '../theme/glass';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
}>;

export function Screen({ children, scroll = false, style }: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView style={styles.base} contentContainerStyle={[styles.content, style]}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.base, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: G.bg,
  },
  base: {
    flex: 1,
    backgroundColor: G.bg,
  },
  content: {
    paddingBottom: 36,
  },
});
