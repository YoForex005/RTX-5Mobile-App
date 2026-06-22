import { FastPressable as Pressable } from './FastPressable';
/**
 * AppHeader — Shared header component for all tab screens.
 *
 * Design goals:
 * - Auto-sizes for every phone: uses useSafeAreaInsets() so status bar height
 *   is handled correctly on both Android (no notch) and iOS (notch/dynamic island).
 * - Reserves a left gutter for the global hamburger menu button.
 *   This prevents the title ever overlapping the menu icon.
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
import { useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { openSidebarDrawerImmediately } from './sidebarDrawerController';

function scheduleAfterFirstVisualFrame(action: () => void) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(action);
    return;
  }

  setTimeout(action, 16);
}

// Keep the visible menu icon close to the app edge while preserving a large
// press target for reliable Android taps.
export const MENU_BTN_GUTTER = 56;
export const MENU_BUTTON_VISUAL_LEFT = 28;
const HEADER_HORIZONTAL_PADDING = 16;
const HEADER_SIDE_SLOT_WIDTH = 144;
const MENU_BUTTON_LEFT_INSET = MENU_BUTTON_VISUAL_LEFT - HEADER_HORIZONTAL_PADDING;
const MENU_BUTTON_HIT_SLOP = { top: 8, bottom: 8, left: 16, right: 8 } as const;

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
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const handleOpenSidebar = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterFirstVisualFrame(() => {
      hideActionSheet();
      setSidebarOpen(true);
    });
  }, [hideActionSheet, setSidebarOpen]);

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
        activateOnTouchStart
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
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    // No background — inherits from Screen/parent so theme transitions work
  },
  leftGutter: {
    width: HEADER_SIDE_SLOT_WIDTH,
    minHeight: 44,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: MENU_BUTTON_LEFT_INSET,
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
