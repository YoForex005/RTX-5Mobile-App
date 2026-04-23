import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/components/ActionSheet';
import { SidebarDrawer } from '../../src/components/SidebarDrawer';
import { traceUiInteraction } from '../../src/dev/uiInteractionDiagnostics';
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
  const isChartFullscreen = useUIState((s) => s.isChartFullscreen);
  const isSearchActive = useUIState((s) => s.isSearchActive);
  const isChartInlineInputActive = useUIState((s) => s.isChartInlineInputActive);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const isChartTab = pathname === '/chart' || pathname.startsWith('/chart');
  const shouldHideMenu =
    (isChartFullscreen && isChartTab) ||
    (isChartTab && isChartInlineInputActive) ||
    isSearchActive;

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
        // Heavy live tabs should release their native views when hidden.
        // The screen routes themselves stay mounted, but their route wrappers
        // now swap out the expensive Chart/Quotes/Trade subtrees on blur.
        detachInactiveScreens
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
          tabBarActiveBackgroundColor: 'transparent',
          tabBarItemStyle: { backgroundColor: 'transparent' },
          tabBarHideOnKeyboard: true,
          // Blur-freezing prevents inactive routes from reacting to focus
          // changes. Leave it off so the route wrappers can actually unmount
          // the heavy live subtrees when the tab loses focus.
          freezeOnBlur: false,
          lazy: true,
        })}
        screenListeners={({ route }) => ({
          tabPress: () => {
            traceUiInteraction(`tabs.${route.name}.press`, () => {}, {
              kind: 'navigation',
              context: route.name,
            });
          },
        })}
      >
        <Tabs.Screen name='quotes' options={{ title: t('Quotes') }} />
        <Tabs.Screen
          name='chart'
          options={{
            title: t('Chart'),
            lazy: true,
          }}
        />
        <Tabs.Screen name='trade' options={{ title: t('Trade') }} />
        <Tabs.Screen name='history' options={{ title: t('History') }} />
        <Tabs.Screen name='settings' options={{ title: t('Settings') }} />
      </Tabs>

      <SidebarDrawer />

      {/* Hamburger menu button is now inside AppHeader for consistent alignment */}

      {/* Action sheet – shared across all tabs, renders inside device frame */}
      <ActionSheet
        visible={actionSheet !== null}
        title={actionSheet?.title}
        actions={actionSheet?.actions ?? []}
        onClose={hideActionSheet}
        searchable={actionSheet?.searchable}
        detent={actionSheet?.detent}
        minimumTopInset={actionSheet?.minimumTopInset}
        runActionAfterClose={actionSheet?.runActionAfterClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
