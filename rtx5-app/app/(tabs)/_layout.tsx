import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname } from 'expo-router';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/components/ActionSheet';
import { SidebarDrawer } from '../../src/components/SidebarDrawer';
import { useUserPreferences } from '../../src/state/userPreferences';
import { useTheme } from '../../src/theme/useTheme';
import { useTranslation } from '../../src/i18n/useTranslation';

const icons = {
  quotes: 'swap-vertical-outline',
  chart: 'stats-chart-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

export default function TabsLayout() {
  const actionSheet = useUIState((s) => s.actionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const isChartFullscreen = useUIState((s) => s.isChartFullscreen);
  const isSearchActive = useUIState((s) => s.isSearchActive);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const isChartTab = pathname === '/chart' || pathname.startsWith('/chart');
  const shouldHideMenu = (isChartFullscreen && isChartTab) || isSearchActive;

  // Tab bar height adapts to the device's bottom inset (home indicator / pill)
  // Base: 56dp icon+label zone + real bottom inset + 2dp breathing room
  const tabBarHeight = 56 + insets.bottom + 2;

  const TAB_BAR_STYLE = {
    backgroundColor: isDark ? '#040609' : '#ffffff',
    borderTopColor: isDark ? '#131722' : 'rgba(0,0,0,0.05)',
    borderTopWidth: 1,
    height: tabBarHeight,
    paddingTop: 8,
    paddingBottom: Math.max(insets.bottom, 8),
  };

  return (
    <View style={styles.root}>
      <Tabs
        detachInactiveScreens={false}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: shouldHideMenu ? { display: 'none' } : TAB_BAR_STYLE,
          tabBarActiveTintColor: T.accent,
          tabBarInactiveTintColor: isDark ? '#5A6B87' : T.textDimmed,
          tabBarIcon: ({ color, size }) => {
            const name = icons[route.name as keyof typeof icons] ?? 'ellipse-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
          tabBarLabelStyle: {
            fontSize: 12,
            marginBottom: 4,
            fontWeight: '600',
          },
          // Keep every tab's React tree mounted across tab switches so the
          // WebView (especially the chart) is never paused or detached. The
          // user expects instant returns to the chart with no reload.
          freezeOnBlur: false,
          lazy: false,
        })}
      >
        <Tabs.Screen name='quotes' options={{ title: t('Quotes') }} />
        <Tabs.Screen
          name='chart'
          options={{
            title: t('Chart'),
            // Extra safety on the chart specifically: never freeze, never
            // unmount, never detach. Even on aggressive Android memory
            // pressure the WebView stays in the React tree.
            freezeOnBlur: false,
            lazy: false,
          }}
        />
        <Tabs.Screen name='trade' options={{ title: t('Trade') }} />
        <Tabs.Screen name='history' options={{ title: t('History') }} />
        <Tabs.Screen name='settings' options={{ title: t('Settings') }} />
      </Tabs>

      <SidebarDrawer />

      {!shouldHideMenu && (
        <Pressable
          style={[
            styles.globalMenuBtn,
            { top: insets.top + 16 },
          ]}
          onPress={() => setSidebarOpen(true)}
        >
          <Ionicons name="menu" size={28} color={T.text} />
        </Pressable>
      )}

      {/* Action sheet – shared across all tabs, renders inside device frame */}
      <ActionSheet
        visible={actionSheet !== null}
        title={actionSheet?.title}
        actions={actionSheet?.actions ?? []}
        onClose={hideActionSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /**
   * Global menu button — fixed 40×40 tap target, 16dp from left edge.
   * Total reserved left gutter = 16 (margin) + 40 (button) = 56dp.
   * AppHeader.tsx uses MENU_BTN_GUTTER = 56 to match this exactly.
   * `top` is set inline as `insets.top + 16` so it never overlaps the
   * status bar on any device.
   */
  globalMenuBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
