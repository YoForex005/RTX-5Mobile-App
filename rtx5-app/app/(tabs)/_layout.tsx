import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/components/ActionSheet';
import { SidebarDrawer } from '../../src/components/SidebarDrawer';
import { useUserPreferences } from '../../src/state/userPreferences';
import { useTheme } from '../../src/theme/useTheme';

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
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();

  const TAB_BAR_STYLE = {
    backgroundColor: isDark ? '#040609' : '#ffffff',
    borderTopColor: isDark ? '#131722' : 'rgba(0,0,0,0.05)',
    borderTopWidth: 1,
    height: 74,
    paddingTop: 8,
    paddingBottom: 8,
  };

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: TAB_BAR_STYLE,
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
        })}
      >
        <Tabs.Screen name='quotes' options={{ title: 'Quotes' }} />
        <Tabs.Screen name='chart' options={{ title: 'Chart' }} />
        <Tabs.Screen name='trade' options={{ title: 'Trade' }} />
        <Tabs.Screen name='history' options={{ title: 'History' }} />
        <Tabs.Screen name='settings' options={{ title: 'Settings' }} />
      </Tabs>

      {/* Sidebar overlay – shared across all tabs */}
      <SidebarDrawer />

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
});
