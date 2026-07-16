import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { wrapWithSentry } from '../src/services/sentry';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, useEffect } from 'react';
import { AppState, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { enableFreeze } from 'react-native-screens';
import { AppProviders } from '../src/state/providers/AppProviders';
import { ErrorBoundary } from '../src/ui/components/ErrorBoundary';
import { AppLogo } from '../src/ui/components/AppLogo';
import { FastPressable } from '../src/ui/components/FastPressable';
import { SidebarDrawer } from '../src/ui/components/SidebarDrawer';
import { useUserPreferences } from '../src/state/userPreferences';
import { useIsDarkTheme, useThemeMode } from '../src/state/themeMode';
import { GDark, GLight } from '../src/ui/theme/glass';
import { useTranslation } from '../src/i18n/useTranslation';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { safeRouterBack } from '../src/utils/navigation';
import { SidebarDestinationHost } from '../src/ui/components/SidebarDestinationHost';
import { BrokersLaunchHost } from '../src/features/settings/BrokersLaunchHost';
import { BrokerDetailLaunchHost } from '../src/features/settings/BrokerDetailLaunchHost';
import { RegisterLaunchHost } from '../src/features/settings/RegisterLaunchHost';
import { ChartConfigDestinationHost } from '../src/features/chart/ChartConfigDestinationHost';
import { ChartSettingsHost } from '../src/features/chart/ChartSettingsHost';
import { AboutDetailDestinationHost } from '../src/features/settings/AboutDetailDestinationHost';
import { QuoteInfoLaunchHost } from '../src/features/quotes/QuoteInfoLaunchHost';
import { HistoryFilterHost } from '../src/features/history/HistoryFilterHost';
import { TradePositionActionHost } from '../src/features/trade/TradePositionActionHost';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

SplashScreen.preventAutoHideAsync();

enableFreeze(true);

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

function StartupLogoScreen() {
  return (
    <View style={styles.startupScreen}>
      <StatusBar style="light" />
      <AppLogo style={styles.startupLogo} />
    </View>
  );
}

function AppStatusBar() {
  const isDark = useIsDarkTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

/**
 * Theme-bound navigator shell only. Retained hosts stay as siblings of this
 * component so a theme tap does not reconcile every pre-mounted destination.
 */
function ThemedNavigatorShell() {
  // Keep the root navigator, screen surface, and bottom menu on one visual
  // clock. Persistence is already deferred by the preference storage adapter,
  // so delaying the visible navigation theme only creates a light/dark flash.
  const navigationThemeMode = useThemeMode();
  const isDark = navigationThemeMode === 'dark';
  const T = navigationThemeMode === 'light' ? GLight : GDark;
  const { t } = useTranslation();
  const router = useRouter();
  const chartPageScreenOptions = {
    headerShown: false,
    animation: 'none',
    freezeOnBlur: false,
    contentStyle: { backgroundColor: T.bg },
  } as const;
  const historyFilterScreenOptions = {
    headerShown: false,
    animation: 'none',
    // Keep the History tab attached behind this opaque route. Without a
    // retained previous screen, an animation-free Android pop can expose the
    // Activity and navigator backgrounds before the tab is reattached.
    presentation: 'containedTransparentModal',
    gestureEnabled: false,
    contentStyle: { backgroundColor: T.bg },
  } as const;
  const sidebarDetailScreenOptions = {
    headerShown: false,
    animation: 'none',
  } as const;
  const sidebarHeaderScreenOptions = {
    animation: 'none',
  } as const;
  const brokerFlowBackground = T.bg;
  const brokerFlowScreenOptions = {
    headerShown: false,
    animation: 'none',
    freezeOnBlur: false,
    contentStyle: { backgroundColor: brokerFlowBackground },
  } as const;
  const registerScreenOptions = {
    headerShown: false,
    animation: 'none',
    presentation: 'card',
    gestureEnabled: false,
    freezeOnBlur: false,
    contentStyle: { backgroundColor: brokerFlowBackground },
  } as const;

  return (
    <WebIPhoneFrame bgColor={T.bg}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: T.bg },
            headerTintColor: T.text,
            contentStyle: { backgroundColor: T.bg },
            headerTitleStyle: { fontSize: 17, fontWeight: '600' },
            headerTitleAlign: 'center',
            headerLeft: () => {
              const action = () => safeRouterBack(router, '/');
              return (
                <View style={{ width: 58, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
                  <FastPressable
                    onPress={action}
                    activateOnPressIn
                    latencyLabel="stack.back"
                    hitSlop={15}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="arrow-back" size={24} color={T.text} />
                  </FastPressable>
                </View>
              );
            },
          }}
        >
          <Stack.Screen name='index' options={{ headerShown: false }} />
          <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
          <Stack.Screen name='quotes/details' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='quotes/market-statistics' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/order-ticket' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/one-click-terms' options={{ title: t('One Click Trading') }} />
          <Stack.Screen name='trade/close-position' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/close-by' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/modify-position' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/bulk' options={{ headerShown: false }} />
          <Stack.Screen name='login' options={{ title: t('Login'), headerLeft: () => null }} />
          <Stack.Screen name='register-entry' options={registerScreenOptions} />
          <Stack.Screen name='register' options={registerScreenOptions} />
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
          <Stack.Screen name='history/filter' options={historyFilterScreenOptions} />
          <Stack.Screen name='settings/accounts' options={{ title: t('Accounts'), ...sidebarHeaderScreenOptions }} />
          <Stack.Screen name='settings/brokers' options={brokerFlowScreenOptions} />
          <Stack.Screen name='settings/broker-detail' options={brokerFlowScreenOptions} />
          <Stack.Screen name='settings/charts' options={{ title: t('Chart Schema & Colors') }} />
          <Stack.Screen name='settings/economic-calendar' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/interface' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/journal' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/user-guide' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/help' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/legal' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/account-deletion' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/contact-developer' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/about' options={sidebarDetailScreenOptions} />
        </Stack>
      </ThemeProvider>
    </WebIPhoneFrame>
  );
}

function InnerLayout() {
  // No theme subscription here — retained hosts must not re-render on every
  // light/dark press just because the navigator shell did.
  return (
    <>
      <AppStatusBar />
      <ThemedNavigatorShell />
      {/* Root-level retained handoffs cover every native broker-flow route. */}
      <SidebarDestinationHost />
      {/* About row details (Privacy / Contact / Deletion) — above About host. */}
      <AboutDetailDestinationHost />
      <BrokersLaunchHost />
      <BrokerDetailLaunchHost />
      <RegisterLaunchHost />
      {/* Properties / Market Statistics — root-level so open/back covers the stack. */}
      <QuoteInfoLaunchHost />
      {/* History clock filter — retained host like Chart options. */}
      <HistoryFilterHost />
      {/* Close / Close By / Modify — retained host (no stack push on open/back). */}
      <TradePositionActionHost />
      {/* Chart Preferences + nested config rows (sidebar-style instant open/back). */}
      <ChartSettingsHost />
      <ChartConfigDestinationHost />
      <SidebarDrawer />
    </>
  );
}

import { brokerRealtimeService } from '../src/api/ws/BrokerRealtimeService';
import { brokerApi } from '../src/api/brokerApi';
import { getAccountById, getAccounts } from '../src/api/accounts';
import { useLiveAccountState } from '../src/state/liveAccountState';
import { usePositionsState } from '../src/state/positionsState';
import { prefetchAccountSummary } from '../src/utils/navigationPrefetch';
import { useOtaUpdateOnLaunch } from '../src/utils/otaUpdates';
import { isDemoTradingAccount } from '../src/domain/accountType';
import { hydratePersistedCandleCache } from '../src/domain/candles/state/persistedCandleCache';
import { useDataAnalyzer } from '../src/features/chart/DataAnalyzer';
import { OtaUpdateModal } from '../src/ui/components/OtaUpdateModal';
import { scheduleAfterFirstFrame, scheduleIdleWork } from '../src/utils/startupScheduler';
import { bootstrapApp } from '../src/services/bootstrapApp';
import { installGlobalStartupErrorHandlers, logStartupDiagnostic } from '../src/utils/startupDiagnostics';

installGlobalStartupErrorHandlers();

function RootLayout() {
  const otaUpdatePrompt = useOtaUpdateOnLaunch();
  useDataAnalyzer();

  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialIcons.font,
  });
  // Treat a font-load *failure* as "ready" so we proceed with system-fallback
  // glyphs instead of hanging on the splash forever. useFonts leaves
  // fontsLoaded=false permanently if loadAsync rejects, and SplashScreen.hideAsync
  // is gated on it below — without this the native splash would never hide.
  const fontsReady = fontsLoaded || !!fontError;

  const hasHydrated = useUserPreferences((s) => s.hasHydrated);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const chartSymbol = useUserPreferences((s) => s.chartSymbol);
  const chartTimeframe = useUserPreferences((s) => s.chartTimeframe);

  useEffect(() => {
    logStartupDiagnostic('root.mounted', {
      hasHydrated,
      fontsReady,
      isLoggedIn,
      hasAccountDetails: Boolean(accountDetails),
      route: 'RootLayout',
    });
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      logStartupDiagnostic('storage.restore.waiting', { store: 'userPreferences' });
      return;
    }
    logStartupDiagnostic('storage.restore.completed', {
      store: 'userPreferences',
      isLoggedIn,
      hasAccountDetails: Boolean(accountDetails),
      chartSymbol,
      chartTimeframe,
    });
    let cancelled = false;

    const cancelCacheHydration = scheduleIdleWork(() => {
      if (!cancelled) {
        logStartupDiagnostic('trading.candleCache.restore.started', {
          chartSymbol,
          chartTimeframe,
        });
        void hydratePersistedCandleCache(chartSymbol, chartTimeframe);
      }
    }, { delayMs: 1500, timeoutMs: 3000 });
    return () => {
      cancelled = true;
      cancelCacheHydration();
    };
  }, [hasHydrated, chartSymbol, chartTimeframe]);

  useEffect(() => {
    if (isLoggedIn) {
      logStartupDiagnostic('auth.restore.started', {
        hasAccountDetails: Boolean(accountDetails),
        accountLoginPresent: Boolean(accountDetails?.id),
      });
      let cancelled = false;
      const cancelScheduledBootWork: Array<() => void> = [];
      const scheduleBootWork = (cancel: () => void) => {
        cancelScheduledBootWork.push(cancel);
      };

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
              if (cancelled) return;
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
            if (cancelled) return;
            console.warn('[Session Migration] Failed to auto-migrate old session:', e);
          }
        }

        if (cancelled) return;
        if (Number.isFinite(mt5LoginNumber) && mt5LoginNumber > 0) {
          const mt5Login = String(mt5LoginNumber);
          logStartupDiagnostic('trading.bootstrap.started', {
            accountLoginPresent: true,
          });
          useLiveAccountState.getState().updateMetrics({ login: mt5LoginNumber });
          brokerRealtimeService.connect();
          void bootstrapApp({ accountLogin: mt5Login }).catch((error) => {
            if (!cancelled) {
              console.warn('[Bootstrap] Initial dashboard load failed:', error);
            }
          });

          scheduleBootWork(scheduleIdleWork(() => {
            if (!cancelled) {
              void usePositionsState.getState().refreshPositions(mt5Login);
            }
          }, { delayMs: 3500, timeoutMs: 5000 }));
          scheduleBootWork(scheduleIdleWork(() => {
            if (!cancelled) {
              prefetchAccountSummary(mt5Login);
            }
          }, { delayMs: 4000, timeoutMs: 5000 }));

          scheduleBootWork(scheduleIdleWork(async () => {
            if (cancelled) return;
            try {
              const acct = await getAccountById(mt5LoginNumber);
              if (cancelled) return;
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
              if (cancelled) return;
              console.warn('[Hydration Error] Failed to fetch initial account metrics:', e);
            }
          }, { delayMs: 5000, timeoutMs: 6000 }));
        }
      };

      void bootAccountData();
      return () => {
        cancelled = true;
        cancelScheduledBootWork.forEach((cancel) => cancel());
      };
    } else {
      brokerRealtimeService.disconnect();
    }
  }, [isLoggedIn, accountDetails?.id]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      void brokerApi.getValidAccessToken(false)
        .then(() => {
          brokerRealtimeService.reconnect();
          return bootstrapApp();
        })
        .catch((error) => {
          console.warn('[Lifecycle] Failed to refresh broker session on foreground:', error);
        });
    });

    return () => subscription.remove();
  }, [isLoggedIn]);

  useEffect(() => {
    if (hasHydrated && fontsReady) {
      // Small timeout allows SafeAreaProvider to measure insets on Android
      setTimeout(() => {
        void SplashScreen.hideAsync();
      }, 100);
    }
  }, [hasHydrated, fontsReady]);

  // Hard safety net: never let the native splash stay up indefinitely, even if
  // hydration or font loading wedges on some unexpected path. Reveals the
  // branded StartupLogoScreen rather than a frozen splash that looks like a crash.
  useEffect(() => {
    const fallback = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 8000);
    return () => clearTimeout(fallback);
  }, []);

  return (
    <ErrorBoundary>
      <AppProviders>
        {hasHydrated && fontsReady ? <InnerLayout /> : <StartupLogoScreen />}
        <OtaUpdateModal {...otaUpdatePrompt} />
      </AppProviders>
    </ErrorBoundary>
  );
}

export default wrapWithSentry(RootLayout);

const styles = StyleSheet.create({
  webCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  deviceShell: {
    borderRadius: 44,
    padding: 10,
    backgroundColor: '#1E1E1E',
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
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#242b3a',
  },
  startupScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
  startupLogo: {
    width: 160,
    height: 160,
  },
});
