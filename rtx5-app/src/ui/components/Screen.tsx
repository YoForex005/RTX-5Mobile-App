/**
 * Reusable React Native UI component: Screen.
 *
 * Uses useSafeAreaInsets for precise inset control on every phone form factor.
 * Exports SCREEN_H_PAD so every screen uses the same horizontal padding constant.
 */

import { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewProps,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

/** Consistent horizontal padding used by every screen in the app */
export const SCREEN_H_PAD = 16;

type ScreenProps = PropsWithChildren<{
  /** Wrap content in a ScrollView */
  scroll?: boolean;
  /** Extra style on the inner container */
  style?: ViewStyle;
  /** Skip bottom safe-area padding (e.g. when FlatList handles its own padding) */
  noBottomInset?: boolean;
  /** Optional native layout acknowledgement for retained route handoffs. */
  onLayout?: ViewProps['onLayout'];
  /** Keep a native root when a caller needs a reliable onLayout signal. */
  collapsable?: boolean;
}>;

export function Screen({
  children,
  collapsable,
  noBottomInset = false,
  onLayout,
  scroll = false,
  style,
}: ScreenProps) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = noBottomInset ? 0 : Math.max(insets.bottom, 8);

  if (scroll) {
    return (
      <KeyboardAvoidingView
        collapsable={collapsable}
        onLayout={onLayout}
        style={[styles.safe, { backgroundColor: T.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={[styles.base, { backgroundColor: T.bg }]}
          contentContainerStyle={[{ paddingBottom: bottomPad + 24 }, style]}
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      collapsable={collapsable}
      onLayout={onLayout}
      style={[
        styles.safe,
        { backgroundColor: T.bg, paddingBottom: bottomPad },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  base: { flex: 1 },
});
