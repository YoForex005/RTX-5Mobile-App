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
import { ErrorBoundary } from '../src/components/ErrorBoundary';

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
          <Stack.Screen name='quotes/details' options={{ headerShown: false }} />
          <Stack.Screen name='trade/order-ticket' options={{ title: 'Trade' }} />
          <Stack.Screen name='trade/one-click-terms' options={{ title: 'One Click Trading' }} />
          <Stack.Screen name='trade/close-position' options={{ title: 'Close Position' }} />
          <Stack.Screen name='trade/close-by' options={{ title: 'Close By' }} />
          <Stack.Screen name='trade/modify-position' options={{ title: 'Modify Position' }} />
          <Stack.Screen name='trade/bulk' options={{ title: 'Bulk Operations' }} />
          <Stack.Screen name='login' options={{ title: 'Login' }} />
          <Stack.Screen name='chart/objects' options={{ title: 'Objects' }} />
          <Stack.Screen name='chart/settings' options={{ title: 'Settings' }} />
          <Stack.Screen name='chart/colors' options={{ title: 'Colors' }} />
          <Stack.Screen name='chart/price-source' options={{ title: 'Price source' }} />
          <Stack.Screen name='chart/open-order-mode' options={{ title: 'Open order mode' }} />
          <Stack.Screen name='chart/calculator' options={{ title: 'Calculator' }} />
          <Stack.Screen name='chart/analytics' options={{ title: 'Analytics' }} />
          <Stack.Screen name='chart/specification' options={{ title: 'Specification' }} />
          <Stack.Screen name='chart/menu-order' options={{ title: 'Order of menu items' }} />
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

import { accountWsService } from '../src/api/ws/accountSocket';
import { getAccountById, getAccounts } from '../src/api/accounts';
import { useLiveAccountState } from '../src/state/liveAccountState';

export default function RootLayout() {
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);

  useEffect(() => {
    if (Platform.OS === 'web') return; // expo-web automatically mounts vector-icons via DOM style blocks
    
    // Preload Ionicons font for Native UI
    Font.loadAsync(Ionicons.font).catch(() => {
      console.warn('Ionicons font failed to load on native');
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      accountWsService.connect();
      
      const bootAccountData = async () => {
         if (!accountDetails?.id) return;
         
         let mt5LoginNumber = Number(accountDetails.id);

         // AUTO-MIGRATE LEGACY SESSIONS:
         // If id < 100000, it's a legacy database user_id (e.g. 92) instead of an MT5 login (e.g. 200074).
         // We fetch the user's accounts list to find their true MT5 login without forcing them to log out.
         if (mt5LoginNumber < 100000) {
            try {
               const accounts = await getAccounts();
               if (accounts.length > 0) {
                  mt5LoginNumber = accounts[0].login;
                  // Silently update the persisted Zustand session so it doesn't happen again
                  useUserPreferences.getState().login(
                     String(mt5LoginNumber),
                     accountDetails.name,
                     accountDetails.server,
                     {
                        access_token: accountDetails.credentials?.accessToken || '',
                        refresh_token: accountDetails.credentials?.refreshToken || '',
                        expires_at: accountDetails.credentials?.expiresAt || ''
                     }
                  );
               }
            } catch (e) {
               console.warn('[Session Migration] Failed to auto-migrate old session:', e);
            }
         }

         if (Number.isFinite(mt5LoginNumber) && mt5LoginNumber > 0) {
            useLiveAccountState.getState().updateMetrics({ login: mt5LoginNumber });
         }

         try {
            const acct = await getAccountById(mt5LoginNumber);
            useLiveAccountState.getState().updateMetrics({
               login: acct.login,
               balance: acct.balance,
               equity: acct.equity,
               margin: acct.usedMargin,
               margin_free: acct.freeMargin,
               margin_level: acct.marginLevel,
               floating: acct.floatingPnl
            });
            
            // Automatically determine if it's a demo or real account based on the backend group name
            const isDemo = acct.group.toLowerCase().includes('demo');
            useUserPreferences.getState().setIsDemoAccount(isDemo);
         } catch (e) {
            console.warn('[Hydration Error] Failed to fetch initial account metrics:', e);
         }
      };

      bootAccountData();
    } else {
      accountWsService.disconnect();
    }
  }, [isLoggedIn, accountDetails?.id]);

  return (
    <ErrorBoundary>
      <AppProviders>
        <InnerLayout />
      </AppProviders>
    </ErrorBoundary>
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
