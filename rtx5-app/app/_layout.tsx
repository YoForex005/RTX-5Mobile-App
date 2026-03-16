import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, useEffect, useCallback } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppProviders } from '../src/providers/AppProviders';
import { useTheme } from '../src/theme/useTheme';
import { useUserPreferences } from '../src/state/userPreferences';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { useWebSocketConnection } from '../src/query/websocket';

const IPHONE_14_PRO_MAX = {
  width: 430,
  height: 932,
};

function WebIPhoneFrame({ children, bgColor }: PropsWithChildren<{ bgColor?: string }>) {
  const { width, height } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const safeWidth = Math.max(width - 24, 1);
  const safeHeight = Math.max(height - 24, 1);
  const scale = Math.min(
    safeWidth / IPHONE_14_PRO_MAX.width,
    safeHeight / IPHONE_14_PRO_MAX.height,
    1
  );

  return (
    <View style={styles.webCanvas}>
      <View style={[styles.deviceShell, { transform: [{ scale }] }]}>
        <View style={[styles.deviceFrame, bgColor ? { backgroundColor: bgColor } : null]}>{children}</View>
      </View>
    </View>
  );
}

function InnerLayout() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  useWebSocketConnection();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <WebIPhoneFrame bgColor={T.bg}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: T.bg },
            headerTintColor: T.text,
            contentStyle: { backgroundColor: T.bg },
          }}
        >
          <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
          <Stack.Screen name='quotes/details' options={{ title: 'Quote Details' }} />
          <Stack.Screen name='trade/order-ticket' options={{ title: 'Trade' }} />
          <Stack.Screen name='trade/one-click-terms' options={{ title: 'One Click Trading' }} />
          <Stack.Screen name='trade/close-position' options={{ title: 'Close Position' }} />
          <Stack.Screen name='trade/close-by' options={{ title: 'Close By' }} />
          <Stack.Screen name='trade/modify-position' options={{ title: 'Modify Position' }} />
          <Stack.Screen name='trade/bulk' options={{ title: 'Bulk Operations' }} />
          <Stack.Screen name='login' options={{ title: 'Login' }} />
          <Stack.Screen name='chart/objects' options={{ title: 'Objects' }} />
          <Stack.Screen name='history/filter' options={{ title: 'History Filter' }} />
          <Stack.Screen name='settings/accounts' options={{ title: 'Accounts' }} />
          <Stack.Screen name='settings/mailbox' options={{ title: 'Mailbox' }} />
          <Stack.Screen name='settings/news' options={{ title: 'News' }} />
          <Stack.Screen name='settings/brokers' options={{ title: 'Brokers' }} />
        </Stack>
      </WebIPhoneFrame>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Preload Ionicons font; silently catch timeout on web
    Font.loadAsync(Ionicons.font).catch(() => {
      // Font loading timed out on web — icons will use fallback glyphs
      console.warn('Ionicons font failed to load, continuing without custom icons');
    });
  }, []);

  return (
    <AppProviders>
      <InnerLayout />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  webCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#070a12',
  },
  deviceShell: {
    borderRadius: 44,
    padding: 10,
    backgroundColor: '#0d111a',
    borderWidth: 1,
    borderColor: '#1e2433',
    ...Platform.select({
      web: {
        boxShadow: '0px 12px 22px rgba(0, 0, 0, 0.45)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.45,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
      },
    }),
  },
  deviceFrame: {
    width: IPHONE_14_PRO_MAX.width,
    height: IPHONE_14_PRO_MAX.height,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#242b3a',
  },
});
