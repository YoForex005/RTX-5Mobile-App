import { FastPressable as Pressable } from './FastPressable';
/**
 * AppHeader — Shared header component for all tab screens.
 *
 * Design goals:
 * - Auto-sizes for every phone: uses useSafeAreaInsets() so status bar height
 *   is handled correctly on both Android (no notch) and iOS (notch/dynamic island).
 * - Reserves a 52dp left gutter for the global hamburger menu button that lives
 *   in `(tabs)/_layout.tsx`. This prevents the title ever overlapping the ☰ icon.
 * - Title is always visually centered between the left gutter and the optional
 *   right actions zone.
 * - Right actions slot accepts any ReactNode (icon buttons, badges, etc).
 * - `noBorder` prop: use on screens where content scrolls under the header.
 */

import React, { ReactNode, useCallback } from 'react';
import { Platform, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';

// The global menu button is 40px wide + 16px left margin = 56dp reserved zone.
export const MENU_BTN_GUTTER = 56;
const HEADER_SIDE_SLOT_WIDTH = 144;
const MENU_BUTTON_HIT_SLOP = { top: 8, bottom: 8, left: 16, right: 8 } as const;
const ANDROID_EDGE_GESTURE_SAFE_PAD = 36;

interface AppHeaderProps {
  /** Main title string shown centered in the header */
  title: string;
  /** Optional right-side action buttons (icons, badges, etc.) */
  rightActions?: ReactNode;
  /** Extra bottom padding if content starts immediately below (default 12) */
  paddingBottom?: number;
  /** Style overrides for the outer container */
  style?: ViewStyle;
  /** Hide the bottom border hairline */
  noBorder?: boolean;
  /** Extra top padding on top of safe area (fine-tuning per screen) */
  extraTopPad?: number;
}

/**
 * Use this in every tab screen's `ListHeaderComponent` or at the top of the view
 * INSTEAD of an inline `<View style={{ height: 48 ... }}>`.
 */
export function AppHeader({
  title,
  rightActions,
  paddingBottom = 12,
  style,
  noBorder = false,
  extraTopPad = 0,
}: AppHeaderProps) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const handleOpenSidebar = useCallback(() => {
    hideActionSheet();
    setSidebarOpen(true);
  }, [hideActionSheet, setSidebarOpen]);

  // The global hamburger ☰ button in _layout.tsx is positioned at:
  //   top: insets.top + 16,  height: 40px  →  center = insets.top + 36px
  //
  // We match that exactly:
  //   paddingTop = insets.top + 16  (puts the row start at the same Y as the ☰ button)
  //   minHeight  = 40               (same height as the ☰ button's tap zone)
  //   paddingBottom = 8             (small breathing room below the row)
  //
  // This guarantees the title text and ☰ icon sit on the exact same horizontal
  // line on EVERY Android phone regardless of status bar / notch height.
  const safeTop = Platform.OS === 'web' ? 0 : Math.max(insets.top, 0);
  const topPad = safeTop + 6 + extraTopPad;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: topPad,
          paddingBottom,
          borderBottomColor: isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.06)',
          borderBottomWidth: noBorder ? 0 : StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      {/* Hamburger menu button — in the same flex row as title */}
      <Pressable
        style={styles.leftGutter}
        onPress={handleOpenSidebar}
        activateOnPressIn
        hitSlop={MENU_BUTTON_HIT_SLOP}
        latencyLabel="appHeader.menu"
        unstable_pressDelay={0}
      >
        <Ionicons name="menu" size={28} color={T.text} />
      </Pressable>

      {/* Centered title */}
      <Text
        style={[styles.title, { color: T.text }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {title}
      </Text>

      {/* Right slot — same width as left gutter for perfect centering */}
      <View style={styles.rightSlot}>
        {rightActions ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
    // No background — inherits from Screen/parent so theme transitions work
  },
  leftGutter: {
    width: HEADER_SIDE_SLOT_WIDTH,
    minHeight: 44,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: ANDROID_EDGE_GESTURE_SAFE_PAD,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
  },
  rightSlot: {
    width: HEADER_SIDE_SLOT_WIDTH,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 12,
  },
});
