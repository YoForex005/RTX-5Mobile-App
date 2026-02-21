import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { G } from '../../src/theme/glass';

const icons = {
  quotes: 'swap-vertical-outline',
  chart: 'bar-chart-outline',
  trade: 'pulse-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: G.bg,
          borderTopColor: G.border,
          height: 74,
          paddingTop: 8,
        },
        tabBarActiveTintColor: G.text,
        tabBarInactiveTintColor: G.textMuted,
        tabBarIcon: ({ color, size }) => {
          const name = icons[route.name as keyof typeof icons] ?? 'ellipse-outline';
          return <Ionicons name={name} size={size} color={color} />;
        },
        tabBarLabelStyle: {
          fontSize: 12,
          marginBottom: 8,
        },
      })}
    >
      <Tabs.Screen name='quotes' options={{ title: 'Quotes' }} />
      <Tabs.Screen name='chart' options={{ title: 'Chart' }} />
      <Tabs.Screen name='trade' options={{ title: 'Trade' }} />
      <Tabs.Screen name='history' options={{ title: 'History' }} />
      <Tabs.Screen name='settings' options={{ title: 'Settings' }} />
    </Tabs>
  );
}
