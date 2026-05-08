import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, useEffect } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, Pressable } from 'react-native';
import { AppProviders } from '../src/state/providers/AppProviders';
import { ErrorBoundary } from '../src/ui/components/ErrorBoundary';
import { traceUiInteraction } from '../src/dev/uiInteractionDiagnostics';
import { useTheme } from '../src/ui/theme/useTheme';
import { useUserPreferences } from '../src/state/userPreferences';
import { useTranslation } from '../src/i18n/useTranslation';
import { Ionicons } from '@expo/vector-icons';


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
  const { t } = useTranslation();
  const router = useRouter();
  const chartPageScreenOptions = {
    headerShown: false,
  };

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <WebIPhoneFrame bgColor={T.bg}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: T.bg },
            headerTintColor: T.text,
            contentStyle: { backgroundColor: T.bg },
            headerTitleStyle: { fontSize: 17, fontWeight: '600' },
            headerTitleAlign: 'center',
            headerLeft: (props) => {
              const action = props.canGoBack ? () => router.back() : () => router.replace('/');
              return (
                <View style={{ width: 46, height: 40, alignItems: 'flex-start', justifyContent: 'center' }}>
                  <Pressable
                    onPress={() => traceUiInteraction('stack.back', action)}
                    hitSlop={15}
                    style={{ marginLeft: Platform.OS === 'web' ? 12 : 4, padding: 4 }}
                    unstable_pressDelay={0}
                  >
                    <Ionicons name="arrow-back" size={24} color={T.text} />
                  </Pressable>
                </View>
              );
            }
          }}
        >
          <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
          <Stack.Screen name='quotes/details' options={{ headerShown: false }} />
          <Stack.Screen name='quotes/market-statistics' options={{ headerShown: false }} />
          <Stack.Screen name='trade/order-ticket' options={{ title: t('Trade') }} />
          <Stack.Screen name='trade/one-click-terms' options={{ title: t('One Click Trading') }} />
          <Stack.Screen name='trade/close-position' options={{ headerShown: false }} />
          <Stack.Screen name='trade/close-by' options={{ headerShown: false }} />
          <Stack.Screen
            name='trade/modify-position'
            options={{
              headerShown: false,
              presentation: 'transparentModal',
              animation: 'none',
              gestureEnabled: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name='trade/bulk' options={{ headerShown: false }} />
          <Stack.Screen name='login' options={{ title: t('Login'), headerLeft: () => null }} />
          <Stack.Screen name='contest-login' options={{ title: t('Contest Login'), headerLeft: () => null }} />
          <Stack.Screen name='chart/objects' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/settings' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/preferences' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/schema-colors' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/colors' options={{ title: t('Colors') }} />
          <Stack.Screen name='chart/price-source' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/open-order-mode' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/calculator' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/analytics' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/indicators' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/indicator-config' options={{ headerShown: false }} />
          <Stack.Screen name='chart/indicator-line-style' options={{ headerShown: false }} />
          <Stack.Screen name='chart/indicator-level' options={{ headerShown: false }} />
          <Stack.Screen name='chart/specification' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/alerts' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/menu-order' options={chartPageScreenOptions} />
          <Stack.Screen name='history/filter' options={{ title: t('History Filter') }} />
          <Stack.Screen name='settings/accounts' options={{ title: t('Accounts') }} />
          <Stack.Screen name='settings/mailbox' options={{ title: t('Mailbox') }} />
          <Stack.Screen name='settings/news' options={{ title: t('News') }} />
          <Stack.Screen name='settings/brokers' options={{ title: t('Brokers') }} />
          <Stack.Screen name='settings/charts' options={{ title: t('Chart Schema & Colors') }} />
          <Stack.Screen name='settings/economic-calendar' options={{ headerShown: false }} />
          <Stack.Screen name='settings/interface' options={{ headerShown: false }} />
          <Stack.Screen name='settings/journal' options={{ headerShown: false }} />
        </Stack>
      </WebIPhoneFrame>
    </>
  );
}

import { accountWsService } from '../src/api/ws/accountSocket';
import { getAccountById, getAccounts } from '../src/api/accounts';
import { useLiveAccountState } from '../src/state/liveAccountState';
import { usePositionsState } from '../src/state/positionsState';
import { prefetchAccountSummary, prefetchChartCandles } from '../src/utils/navigationPrefetch';
import { useOtaUpdateOnLaunch } from '../src/utils/otaUpdates';
import { isDemoTradingAccount } from '../src/domain/accountType';
import { hydratePersistedCandleCache } from '../src/domain/candles/state/persistedCandleCache';

export default function RootLayout() {
  useOtaUpdateOnLaunch();

  const hasHydrated = useUserPreferences((s) => s.hasHydrated);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const chartSymbol = useUserPreferences((s) => s.chartSymbol);
  const chartTimeframe = useUserPreferences((s) => s.chartTimeframe);

  useEffect(() => {
    if (!hasHydrated) return;
    void hydratePersistedCandleCache(chartSymbol, chartTimeframe);
    prefetchChartCandles(chartSymbol, chartTimeframe);
  }, [hasHydrated, chartSymbol, chartTimeframe]);

  useEffect(() => {
    if (isLoggedIn) {
      const bootAccountData = async () => {
        if (!accountDetails?.id) return;

        let mt5LoginNumber = Number(accountDetails.id);

        // AUTO-MIGRATE LEGACY SESSIONS:
        // If id < 100000, it's a legacy database user_id (e.g. 92) instead of an Orrnn login (e.g. 200074).
        // We fetch the user's accounts list to find their true Orrnn login without forcing them to log out.
        if (mt5LoginNumber < 100000) {
          try {
            const accounts = await getAccounts();
            if (accounts.length > 0) {
              mt5LoginNumber = accounts[0].login;
              // Silently update the persisted Zustand session so it doesn't happen again
              useUserPreferences.getState().login(
                String(mt5LoginNumber),
                accounts[0].name || accountDetails.name,
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
          void usePositionsState.getState().refreshPositions(String(mt5LoginNumber));
          prefetchAccountSummary(String(mt5LoginNumber));
          accountWsService.connect();
        }

        try {
          const acct = await getAccountById(mt5LoginNumber);
          useUserPreferences.getState().updateAccountDetails({
            id: String(acct.login),
            name: acct.name || `Account ${acct.login}`,
          });
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
          const isDemo = isDemoTradingAccount(acct.group);
          useUserPreferences.getState().setIsDemoAccount(isDemo);
        } catch (e) {
          console.warn('[Hydration Error] Failed to fetch initial account metrics:', e);
        }
      };

      void bootAccountData();
    } else {
      accountWsService.disconnect();
    }
  }, [isLoggedIn, accountDetails?.id]);

  return (
    <AppProviders>
      <ErrorBoundary>
        <InnerLayout />
      </ErrorBoundary>
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
