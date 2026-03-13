import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useUIState } from '../../src/state/uiState';
import { SidebarDrawer } from '../../src/components/SidebarDrawer';

const TAB_BAR_VISIBLE = {
  backgroundColor: '#040609',
  borderTopColor: '#131722',
  borderTopWidth: 1,
  height: 74,
  paddingTop: 8,
  paddingBottom: 8,
} as const;

const TAB_BAR_HIDDEN = { display: 'none' } as const;

const icons = {
  quotes: 'swap-vertical-outline',
  chart: 'stats-chart-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

export default function TabsLayout() {
  const sidebarOpen = useUIState((s) => s.sidebarOpen);
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: sidebarOpen ? TAB_BAR_HIDDEN : TAB_BAR_VISIBLE,
          tabBarActiveTintColor: '#2962FF',
          tabBarInactiveTintColor: '#5A6B87',
          tabBarIcon: ({ color, size }) => {
            const name = icons[route.name as keyof typeof icons] ?? 'ellipse-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
          tabBarLabelStyle: {
            fontSize: 12,
            marginBottom: 4,
            fontWeight: '500',
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
      <SidebarDrawer
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
