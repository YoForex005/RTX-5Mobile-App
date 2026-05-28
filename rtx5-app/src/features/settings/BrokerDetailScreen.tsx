import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: BrokerDetailScreen
 *
 * Shown after a user selects a broker on the BrokersScreen. Mirrors the MT5
 * broker detail layout: lets the user open a demo account, open a real account
 * (disabled when the active session is already a real account), or sign into
 * an existing account on the selected broker. The "Server" field is
 * pre-populated from the broker the user just picked.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/theme/useTheme';
import type { ThemeColors } from '../../ui/theme/glass';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useTranslation } from '../../i18n/useTranslation';
import { useSavedAccounts, setSavedAccountPassword } from '../../state/savedAccounts';
import { loginAPI } from '../../api/auth';
import { getBrokerConfig } from '../../api/broker';
import { normalizeBrokerServerUrl } from '../../api/brokerRouting';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../../query/accounts';
import { BROKER_CONFIG_KEY } from '../../query/broker';
import { getTradingAccountTypeFromBackend } from '../../domain/accountType';
import { safeRouterBack } from '../../utils/navigation';
import {
  setSecureItemAsync,
  removeSecureItemAsync,
  getSecureItemAsync,
} from '../../utils/secureStorage';
import {
  persistAuthSessionTokens,
  persistSelectedBrokerSession,
} from '../../state/brokerSessionStorage';
import { runImmediateAction } from '../../utils/actionLatency';
import { BROKER_OVERRIDES, formatServerFromName } from './BrokersScreen/brokerData';

const SAVED_LOGIN_KEY = 'rtx5_saved_login';

const scheduleBrokerDetailPostLoginWork = (task: () => void) => {
  const runAfterFrame = () => {
    setTimeout(task, 0);
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }

  setTimeout(task, 0);
};

const scheduleBrokerDetailKeyboardDismiss = () => {
  const dismissKeyboard = () => Keyboard.dismiss();

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(dismissKeyboard);
    return;
  }

  setTimeout(dismissKeyboard, 0);
};

type ServerOption = {
  label: string;
  brokerId: string;
  serverUrl: string;
  logoUrl: string;
};

export function BrokerDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    brokerId?: string;
    brokerName?: string;
    brokerServer?: string;
    brokerServerUrl?: string;
    brokerLogoUrl?: string;
    brokerDomain?: string;
  }>();
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);

  const persistedLogin = useUserPreferences((s) => s.login);
  const setBrokerConnection = useUserPreferences((s) => s.setBrokerConnection);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const isDemoAccount = useUserPreferences((s) => s.isDemoAccount);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  const queryClient = useQueryClient();
  const showActionSheet = useUIState((s) => s.showActionSheet);

  // Real-account option is disabled while the active session is a real
  // account, matching MT5: it shows as muted so the user knows they already
  // have a live connection.
  const hasActiveRealAccount = isLoggedIn && !isDemoAccount;

  const brokerName = params.brokerName ? String(params.brokerName) : t('Broker');
  const brokerIdSlug = params.brokerId ? String(params.brokerId) : '';
  const initialServer = params.brokerServer
    ? String(params.brokerServer)
    : formatServerFromName(brokerName);
  const initialServerUrl = normalizeBrokerServerUrl(
    params.brokerServerUrl ? String(params.brokerServerUrl) : '',
  );
  const initialLogoUrl = params.brokerLogoUrl ? String(params.brokerLogoUrl) : '';

  // The broker_id we send to the API. Default to the broker slug from the
  // BrokersScreen list; fall back to the server name when no slug is given.
  const apiBrokerId = brokerIdSlug && brokerIdSlug !== 'qr' && brokerIdSlug !== 'custom'
    ? brokerIdSlug
    : initialServer;

  const serverOptions = useMemo<ServerOption[]>(() => {
    const seen = new Set<string>();
    const out: ServerOption[] = [];
    // Always offer the server we navigated in with first.
    if (initialServer) {
      seen.add(initialServer);
      out.push({
        label: initialServer,
        brokerId: apiBrokerId,
        serverUrl: initialServerUrl,
        logoUrl: initialLogoUrl,
      });
    }
    const override = BROKER_OVERRIDES[brokerName];
    if (override?.server && !seen.has(override.server)) {
      seen.add(override.server);
      out.push({
        label: override.server,
        brokerId: apiBrokerId,
        serverUrl: initialServerUrl,
        logoUrl: initialLogoUrl,
      });
    }
    // MT5 commonly exposes a parallel Demo + Live server. Surface them as
    // alternatives so the user can flip between them inside the same broker.
    const baseLive = (override?.server ?? formatServerFromName(brokerName)).replace(
      /-(Demo|Live)\d*$/i,
      '',
    );
    const alternates = [`${baseLive}-Demo`, `${baseLive}-Live`];
    for (const alt of alternates) {
      if (!seen.has(alt)) {
        seen.add(alt);
        out.push({
          label: alt,
          brokerId: apiBrokerId,
          serverUrl: initialServerUrl,
          logoUrl: initialLogoUrl,
        });
      }
    }
    return out;
  }, [apiBrokerId, brokerName, initialLogoUrl, initialServer, initialServerUrl]);

  const [loginValue, setLoginValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [selectedServer, setSelectedServer] = useState<ServerOption>(
    serverOptions[0] ?? {
      label: initialServer,
      brokerId: apiBrokerId,
      serverUrl: initialServerUrl,
      logoUrl: initialLogoUrl,
    },
  );
  const [isLoading, setIsLoading] = useState(false);
  const [modalState, setModalState] = useState<{
    visible: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const requestInFlightRef = useRef(false);

  // Lazy-load any previously saved login on first focus so returning users
  // see their credentials pre-filled (mirrors the standalone /login screen).
  useEffect(() => {
    if (!apiBrokerId || !initialServerUrl) return;
    setBrokerConnection(apiBrokerId, initialServerUrl, initialLogoUrl);
    void persistSelectedBrokerSession({
      brokerId: apiBrokerId,
      serverUrl: initialServerUrl,
      logoUrl: initialLogoUrl,
    });
  }, [apiBrokerId, initialLogoUrl, initialServerUrl, setBrokerConnection]);

  useEffect(() => {
    let cancelled = false;
    getSecureItemAsync(SAVED_LOGIN_KEY).then((val) => {
      if (cancelled || !val) return;
      try {
        const parsed = JSON.parse(val);
        if (parsed.login) setLoginValue(String(parsed.login));
        if (parsed.pass) setPasswordValue(String(parsed.pass));
        setSavePassword(true);
      } catch {
        // ignore corrupt cache
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBack = () => safeRouterBack(router, '/settings/brokers');

  const navigateToRegister = (type: 'demo' | 'real') => {
    if (type === 'real') {
      // The real-account onboarding requires KYC/identity flows that are not
      // yet wired up in the app — keep the option present but route users to
      // support guidance instead of an unfinished form.
      Alert.alert(
        t('Open a real account'),
        t('For live trading, additional identification is required. Please contact your broker to begin onboarding.'),
      );
      return;
    }
    router.push({
      pathname: '/register',
      params: {
        brokerId: apiBrokerId,
        brokerName,
        server: selectedServer.label,
        serverUrl: selectedServer.serverUrl,
        logoUrl: selectedServer.logoUrl,
      },
    });
  };

  const openServerSelector = () => {
    if (serverOptions.length <= 1) return;
    runImmediateAction('brokerDetail.serverSheet.open', () =>
      showActionSheet({
        title: t('Choose server'),
        detent: 'adaptive',
        instantOpen: true,
        actions: serverOptions.map((opt) => ({
          label: opt.label,
          onPress: () => setSelectedServer(opt),
        })),
      }),
    );
  };

  const submitLogin = async () => {
    if (requestInFlightRef.current) return;
    scheduleBrokerDetailKeyboardDismiss();

    const trimmedLogin = loginValue.trim();
    const trimmedPassword = passwordValue;
    const effectiveBrokerId = selectedServer.brokerId || apiBrokerId;
    const effectiveServerUrl = selectedServer.serverUrl || initialServerUrl;
    const effectiveLogoUrl = selectedServer.logoUrl || initialLogoUrl;

    if (!effectiveBrokerId) {
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: t('Please choose a server'),
      });
      return;
    }
    if (!effectiveServerUrl) {
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: t('Please select a broker from the list.'),
      });
      return;
    }
    if (!trimmedLogin || !trimmedPassword) {
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: t('Please enter both Login ID and Password'),
      });
      return;
    }

    requestInFlightRef.current = true;
    setIsLoading(true);
    let didStartSuccessNavigation = false;
    try {
      const response: any = await loginAPI({
        username: trimmedLogin,
        password: trimmedPassword,
        broker_id: effectiveBrokerId,
      }, { serverUrl: effectiveServerUrl });

      const accessToken = response.access_token ?? response.token;
      const refreshToken = response.refresh_token ?? response.refreshToken ?? '';
      const accountLogin =
        response.account_login ??
        response.accountLogin ??
        response.user?.account_login ??
        response.user?.id ??
        response.username ??
        response.user?.username ??
        trimmedLogin;
      const accountName =
        response.account_name ??
        response.accountName ??
        response.name ??
        response.user?.account_name ??
        response.user?.accountName ??
        response.user?.name ??
        response.username ??
        response.user?.username ??
        'Trader';
      const serverNameFromApi =
        response.server ?? response.broker_server ?? response.brokerServer;

      if (!accessToken || !accountLogin) {
        throw new Error(
          !accessToken
            ? t('Login server did not return an access token.')
            : t('Login server did not return an account login.'),
        );
      }

      const expiresAtIso = (() => {
        if (typeof response.expires_at === 'number' && response.expires_at > 0) {
          const ms = response.expires_at > 1e12 ? response.expires_at : response.expires_at * 1000;
          return new Date(ms).toISOString();
        }
        const expiresInSec =
          typeof response.expires_in === 'number' ? response.expires_in : 86400;
        return new Date(Date.now() + expiresInSec * 1000).toISOString();
      })();

      const canonicalBrokerId =
        response.broker_id || response.brokerId || effectiveBrokerId;
      const accountType = getTradingAccountTypeFromBackend(response);
      const effectiveServerName = serverNameFromApi || selectedServer.label || canonicalBrokerId;
      const savedLogin = String(accountLogin);

      persistedLogin(
        savedLogin,
        accountName,
        effectiveServerName,
        {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAtIso,
        },
        canonicalBrokerId,
        {
          serverUrl: effectiveServerUrl,
          logoUrl: effectiveLogoUrl,
          isDemoAccount: accountType === 'demo',
        },
      );
      router.replace('/(tabs)/quotes');
      didStartSuccessNavigation = true;
      scheduleBrokerDetailPostLoginWork(() => {
        void Promise.all([
          persistSelectedBrokerSession({
            brokerId: canonicalBrokerId,
            serverUrl: effectiveServerUrl,
            logoUrl: effectiveLogoUrl,
          }),
          persistAuthSessionTokens({
            accessToken,
            refreshToken,
            expiresAt: expiresAtIso,
          }),
        ]).catch(() => undefined);

        upsertSavedAccount({
          login: savedLogin,
          name: accountName,
          brokerId: canonicalBrokerId,
          server: effectiveServerName,
          serverUrl: effectiveServerUrl,
          logoUrl: effectiveLogoUrl,
          accountType,
          lastUsedAt: Date.now(),
          hasCredentials: true,
        });
        setSavedAccountPassword(canonicalBrokerId, savedLogin, trimmedPassword).catch(() => undefined);

        queryClient.invalidateQueries({ queryKey: [ACCOUNTS_LIST_KEY] });
        queryClient.invalidateQueries({ queryKey: [ACCOUNT_DETAIL_KEY] });
        queryClient.invalidateQueries({ queryKey: [BROKER_CONFIG_KEY] });

        if (savePassword) {
          void setSecureItemAsync(
            SAVED_LOGIN_KEY,
            JSON.stringify({
              broker: canonicalBrokerId,
              server_url: effectiveServerUrl,
              logo_url: effectiveLogoUrl,
              login: trimmedLogin,
              pass: trimmedPassword,
            }),
          );
        } else {
          void removeSecureItemAsync(SAVED_LOGIN_KEY);
        }

        // Best-effort: refresh broker config so AccountsScreen shows the
        // correct broker name/server immediately after login.
        void getBrokerConfig(canonicalBrokerId)
          .then((cfg) => {
            queryClient.setQueryData([BROKER_CONFIG_KEY, canonicalBrokerId], cfg);
          })
          .catch(() => undefined);
      });
    } catch (error: any) {
      setModalState({
        visible: true,
        type: 'error',
        title: t('Login Failed'),
        message: error?.message || t('Invalid credentials'),
      });
      setTimeout(() => setModalState((p) => ({ ...p, visible: false })), 2200);
    } finally {
      requestInFlightRef.current = false;
      if (!didStartSuccessNavigation) {
        setIsLoading(false);
      }
    }
  };

  const handleForgotPassword = () => {
    setForgotPasswordVisible(true);
  };

  const hasServerChoices = serverOptions.length > 1;

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            hitSlop={15}
            onPress={handleBack}
            activateOnPressIn
            latencyLabel="brokerDetail.back"
            unstable_pressDelay={0}
          >
            <Ionicons name="arrow-back" size={26} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{brokerName}</Text>
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            canCancelContentTouches={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.scrollContent}
          >
            {/* ── Open a demo account ── */}
            <Pressable
              style={styles.optionRow}
              onPress={() => navigateToRegister('demo')}
              activateOnPressIn
              latencyLabel="brokerDetail.openDemo"
              unstable_pressDelay={0}
            >
              <View style={[styles.optionIcon, styles.optionIconDemo]}>
                <Ionicons name="school" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>{t('Open a demo account')}</Text>
                <Text style={styles.optionSub}>
                  {t('To learn trading and to test your strategies')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={T.textMuted} />
            </Pressable>
            <View style={styles.divider} />

            {/* ── Open a real account (disabled when already on a real account) ── */}
            <Pressable
              style={[styles.optionRow, hasActiveRealAccount && styles.optionRowDisabled]}
              onPress={() => {
                if (hasActiveRealAccount) return;
                navigateToRegister('real');
              }}
              disabled={hasActiveRealAccount}
              activateOnPressIn
              latencyLabel="brokerDetail.openReal"
              unstable_pressDelay={0}
            >
              <View style={[styles.optionIcon, styles.optionIconReal]}>
                <Ionicons name="trending-up" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.optionTextWrap}>
                <Text
                  style={[
                    styles.optionTitle,
                    hasActiveRealAccount && styles.optionTitleDisabled,
                  ]}
                >
                  {t('Open a real account')}
                </Text>
                <Text
                  style={[
                    styles.optionSub,
                    hasActiveRealAccount && styles.optionSubDisabled,
                  ]}
                >
                  {t('For live trading, additional identification is required')}
                </Text>
              </View>
              {!hasActiveRealAccount && (
                <Ionicons name="chevron-forward" size={20} color={T.textMuted} />
              )}
            </Pressable>
            <View style={styles.divider} />

            {/* ── Existing-account login form ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('Login to an existing account')}</Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>{t('Login')}</Text>
              <TextInput
                style={styles.input}
                value={loginValue}
                onChangeText={setLoginValue}
                autoCapitalize="none"
                keyboardType="numeric"
                selectionColor={T.accent}
                cursorColor={T.accent}
                underlineColorAndroid="transparent"
                placeholder={t('Login')}
                placeholderTextColor={T.textMuted}
              />
            </View>
            <View style={styles.divider} />

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>{t('Password')}</Text>
              <TextInput
                style={styles.input}
                value={passwordValue}
                onChangeText={setPasswordValue}
                autoCapitalize="none"
                secureTextEntry={!showPassword}
                selectionColor={T.accent}
                cursorColor={T.accent}
                underlineColorAndroid="transparent"
                placeholder={t('Password')}
                placeholderTextColor={T.textMuted}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={12}
                activateOnPressIn
                latencyLabel="brokerDetail.password.toggle"
                unstable_pressDelay={0}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={T.textSub}
                />
              </Pressable>
            </View>
            <View style={styles.divider} />

            <Pressable
              style={styles.inputRow}
              onPress={openServerSelector}
              disabled={!hasServerChoices}
              activateOnPressIn
              latencyLabel="brokerDetail.server.open"
              unstable_pressDelay={0}
            >
              <Text style={styles.inputLabel}>{t('Server')}</Text>
              <Text style={styles.serverValue}>{selectedServer.label || '—'}</Text>
              {hasServerChoices && (
                <Ionicons name="chevron-down" size={18} color={T.textSub} />
              )}
            </Pressable>
            <View style={styles.divider} />

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setSavePassword((v) => !v)}
              hitSlop={10}
              activateOnPressIn
              latencyLabel="brokerDetail.savePassword.toggle"
              unstable_pressDelay={0}
            >
              <Text style={styles.inputLabel}>{t('Save password')}</Text>
              <View style={{ flex: 1 }} />
              <Ionicons
                name={savePassword ? 'checkbox' : 'square-outline'}
                size={22}
                color={savePassword ? T.accent : T.textSub}
              />
            </Pressable>
            <View style={styles.divider} />

            <Pressable
              style={styles.forgotBtn}
              onPress={handleForgotPassword}
              hitSlop={10}
              activateOnPressIn
              latencyLabel="brokerDetail.forgotPassword.open"
              unstable_pressDelay={0}
            >
              <Text style={styles.forgotText}>{t('Forgot password?')}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.loginBtn,
                (pressed || isLoading) && styles.loginBtnPressed,
              ]}
              onPress={submitLogin}
              disabled={isLoading}
              activateOnPressIn
              latencyLabel="brokerDetail.login.submit"
              unstable_pressDelay={0}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginBtnText}>{t('LOGIN')}</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>

        {modalState.visible && (
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setModalState((p) => ({ ...p, visible: false }))}
              activateOnPressIn
              latencyLabel="brokerDetail.modal.dismiss"
              unstable_pressDelay={0}
            />
            <View style={styles.modalCard}>
              <View
                style={[
                  styles.modalIcon,
                  modalState.type === 'error' && { backgroundColor: T.trading.sell.primary },
                ]}
              >
                <Ionicons
                  name={modalState.type === 'success' ? 'checkmark' : 'close'}
                  size={28}
                  color="#FFFFFF"
                />
              </View>
              <Text style={styles.modalTitle}>{modalState.title}</Text>
              <Text style={styles.modalMessage}>{modalState.message}</Text>
            </View>
          </View>
        )}

        {/* ── Forgot password popup ── MT5 parity: no icon, left-aligned text,
            single right-aligned "Skip" action. */}
        {forgotPasswordVisible && (
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setForgotPasswordVisible(false)}
              activateOnPressIn
              latencyLabel="brokerDetail.forgot.dismiss"
              unstable_pressDelay={0}
            />
            <View style={styles.forgotCard}>
              <Text style={styles.forgotTitle}>{t('Forgot password?')}</Text>
              <Text style={styles.forgotBody}>
                {t('Unfortunately, the password cannot be recovered. Please open a new demo account.')}
              </Text>
              <View style={styles.forgotActions}>
                <Pressable
                  hitSlop={10}
                  onPress={() => setForgotPasswordVisible(false)}
                  activateOnPressIn
                  latencyLabel="brokerDetail.forgot.skip"
                  unstable_pressDelay={0}
                >
                  <Text style={styles.forgotSkip}>{t('Skip')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

const MT5_BLUE = '#0a84ff';

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => {
  // Pure white card surface in light mode; subtle elevated slate in dark mode.
  // Keeps the form area visually distinct from the device chrome on both themes.
  const pageBg = isDark ? T.bgRoot : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: pageBg },
    container: { flex: 1, backgroundColor: pageBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: safeTop + 8,
      paddingBottom: 12,
      gap: 8,
      backgroundColor: pageBg,
    },
    iconBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: T.text,
      fontSize: 20,
      fontWeight: '600',
    },
    scrollContent: {
      paddingBottom: 32,
      backgroundColor: pageBg,
    },
    divider: {
      height: 1,
      backgroundColor: dividerColor,
      marginHorizontal: 20,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 14,
    },
    optionRowDisabled: {
      opacity: 0.55,
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionIconDemo: {
      backgroundColor: '#2563EB',
    },
    // Disabled real account still shows a pale-blue circle in MT5 — only the
    // surrounding row opacity is dropped, not the brand color.
    optionIconReal: {
      backgroundColor: '#2563EB',
    },
    optionTextWrap: { flex: 1 },
    optionTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '600',
    },
    optionTitleDisabled: {
      color: T.textMuted,
    },
    optionSub: {
      color: T.textSub,
      fontSize: 12,
      marginTop: 2,
    },
    optionSubDisabled: {
      color: T.textDimmed,
    },
    sectionHeader: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    sectionTitle: {
      color: T.text,
      fontSize: 15,
      fontWeight: '700',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      minHeight: 52,
      gap: 12,
    },
    inputLabel: {
      color: T.textSub,
      fontSize: 14,
      width: 110,
    },
    input: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      padding: 0,
      paddingVertical: 12,
      backgroundColor: 'transparent',
    },
    serverValue: {
      flex: 1,
      color: T.text,
      fontSize: 15,
      fontWeight: '500',
      textAlign: 'right',
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      minHeight: 52,
    },
    forgotBtn: {
      alignSelf: 'center',
      paddingVertical: 18,
    },
    forgotText: {
      color: MT5_BLUE,
      fontSize: 14,
      fontWeight: '500',
    },
    loginBtn: {
      marginHorizontal: 20,
      marginTop: 4,
      backgroundColor: '#2563EB',
      minHeight: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#2563EB',
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    loginBtnPressed: { opacity: 0.85 },
    loginBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      zIndex: 999,
      elevation: 999,
    },
    modalCard: {
      width: '85%',
      maxWidth: 340,
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? T.borderMedium : 'rgba(0,0,0,0.08)',
    },
    modalIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#34C759',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      color: T.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
    },
    modalMessage: {
      color: T.textSub,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
    // MT5-style "Forgot password?" card — square corners, no icon, left-aligned
    // body copy, single bottom-right Skip link.
    forgotCard: {
      width: '85%',
      maxWidth: 360,
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      borderRadius: 6,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 12,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? T.borderMedium : 'transparent',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    forgotTitle: {
      color: T.text,
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 14,
    },
    forgotBody: {
      color: T.textSub,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 22,
    },
    forgotActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingVertical: 6,
    },
    forgotSkip: {
      color: MT5_BLUE,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.6,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
  });
};

export default BrokerDetailScreen;
