import { FastPressable as Pressable } from '../src/ui/components/FastPressable';
import { Stack, router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { getSecureItemAsync, setSecureItemAsync, removeSecureItemAsync } from '../src/utils/secureStorage';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
  type NativeSyntheticEvent,
  type TextInputEndEditingEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../src/state/userPreferences';
import { useSavedAccounts, setSavedAccountPassword } from '../src/state/savedAccounts';
import { loginAPI } from '../src/api/auth';
// Broker config API — validates broker_id before login and provides server_name
import { getBrokerConfig } from '../src/api/broker';
import { useTheme, type ThemeColors } from '../src/ui/theme/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../src/query/accounts';
import { BROKER_CONFIG_KEY } from '../src/query/broker';
import { useTranslation } from '../src/i18n/useTranslation';
import { getTradingAccountTypeFromBackend } from '../src/domain/accountType';
import { safeRouterBack } from '../src/utils/navigation';
import { runImmediateAction } from '../src/utils/actionLatency';

const LOGIN_SCREEN_COPY = {
  headerTitle: 'Login Account',
  sectionTitle: 'Login to an existing account',
  savedLoginKey: 'rtx5_saved_login',
};
const LOGIN_TOUCH_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
const LOGIN_BUTTON_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const LOGIN_BUTTON_PRESS_RETENTION_OFFSET = { top: 24, bottom: 24, left: 24, right: 24 } as const;
const LOGIN_SUBMIT_PRESS_GUARD_MS = 350;

const schedulePostLoginWork = (task: () => void) => {
  const runAfterFrame = () => {
    setTimeout(task, 0);
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }

  setTimeout(task, 0);
};

const scheduleLoginSubmitAfterInputCommit = (task: () => void) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(task);
    return;
  }

  setTimeout(task, 0);
};

type LoginCredentialsSnapshot = {
  brokerId: string;
  accountId: string;
  password: string;
};

export function AccountLoginScreen() {
  const login = useUserPreferences((s) => s.login);
  const setIsDemoAccountFlag = useUserPreferences((s) => s.setIsDemoAccount);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  // Broker config integration: persist broker_id to Zustand so useBrokerConfig()
  // can fetch GET /broker/config with the correct broker context app-wide
  const persistBrokerId = useUserPreferences((s) => s.setBrokerId);
  const queryClient = useQueryClient();
  const screenCopy = LOGIN_SCREEN_COPY;
  const { t } = useTranslation();

  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [brokerId, setBrokerId] = useState('');
  const [modalState, setModalState] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string; }>({ visible: false, type: 'success', title: '', message: '' });
  const themeMode = useUserPreferences((s) => s.themeMode);
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = makeStyles(T, isDark, insets.top);
  const loginRequestInFlightRef = useRef(false);
  const loginSubmitPressGuardRef = useRef(false);
  const loginSubmitPressGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brokerIdValueRef = useRef<string | null>(null);
  const accountIdValueRef = useRef<string | null>(null);
  const passwordValueRef = useRef<string | null>(null);

  useEffect(() => {
    // Auto-populate saved credentials if they exist
    getSecureItemAsync(screenCopy.savedLoginKey).then((val) => {
      if (val) {
        try {
          const { broker, login: savedAccountId, pass } = JSON.parse(val);
          if (broker) {
            brokerIdValueRef.current = broker;
            setBrokerId(broker);
          }
          if (savedAccountId) {
            accountIdValueRef.current = savedAccountId;
            setAccountId(savedAccountId);
          }
          if (pass) {
            passwordValueRef.current = pass;
            setPassword(pass);
          }
          setSavePassword(true);
        } catch (e) {
          // ignore parsing error
        }
      }
    });
  }, [screenCopy.savedLoginKey]);

  useEffect(() => () => {
    if (loginSubmitPressGuardTimerRef.current) {
      clearTimeout(loginSubmitPressGuardTimerRef.current);
      loginSubmitPressGuardTimerRef.current = null;
    }
  }, []);

  const updateBrokerId = (value: string) => {
    brokerIdValueRef.current = value;
    setBrokerId(value);
  };

  const updateAccountId = (value: string) => {
    accountIdValueRef.current = value;
    setAccountId(value);
  };

  const updatePassword = (value: string) => {
    passwordValueRef.current = value;
    setPassword(value);
  };

  const updateBrokerIdFromEndEditing = (
    event: NativeSyntheticEvent<TextInputEndEditingEventData>,
  ) => {
    updateBrokerId(event.nativeEvent.text);
  };

  const updateAccountIdFromEndEditing = (
    event: NativeSyntheticEvent<TextInputEndEditingEventData>,
  ) => {
    updateAccountId(event.nativeEvent.text);
  };

  const updatePasswordFromEndEditing = (
    event: NativeSyntheticEvent<TextInputEndEditingEventData>,
  ) => {
    updatePassword(event.nativeEvent.text);
  };

  const getLoginCredentialsSnapshot = (): LoginCredentialsSnapshot => ({
    brokerId: (brokerIdValueRef.current ?? brokerId).trim(),
    accountId: (accountIdValueRef.current ?? accountId).trim(),
    password: passwordValueRef.current ?? password,
  });

  const handleModalClose = () => {
    if (modalState.type === 'success') {
      router.replace('/(tabs)/quotes');
    }
    setModalState(prev => ({ ...prev, visible: false }));
  };

  const handleLogin = async (snapshot: LoginCredentialsSnapshot = getLoginCredentialsSnapshot()) => {
    if (loginRequestInFlightRef.current) {
      return;
    }
    const normalizedBrokerId = snapshot.brokerId;
    const normalizedAccountId = snapshot.accountId;
    const currentPassword = snapshot.password;

    if (!normalizedBrokerId) {
      setModalState({ visible: true, type: 'error', title: t('Error'), message: t('Please enter your Broker ID') });
      return;
    }
    if (!normalizedAccountId || !currentPassword) {
      setModalState({ visible: true, type: 'error', title: t('Error'), message: t('Please enter both Login ID and Password') });
      return;
    }

    loginRequestInFlightRef.current = true;
    setIsLoading(true);
    try {
      const response: any = await loginAPI({
        username: normalizedAccountId,
        password: currentPassword,
        broker_id: normalizedBrokerId,
      });

      // ── Defensive response parsing ──
      // The V2 server's spec (AuthTokenResponse) returns `token` + nested
      // `user`, while older deployments returned the flat `access_token` +
      // `account_login` shape. Accept BOTH so a server-side field rename
      // can't silently break login and leave trades with an undefined JWT.
      const accessToken = response.access_token ?? response.token;
      const refreshToken = response.refresh_token ?? response.refreshToken;
      const accountLogin =
        response.account_login ??
        response.accountLogin ??
        response.user?.account_login ??
        response.user?.id;
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
      const serverName =
        response.server ?? response.broker_server ?? response.brokerServer;

      if (!accessToken || !accountLogin) {
        // Without a token or a resolvable account login every downstream
        // REST/WS call is broken. Fail the login here with a clear message
        // instead of allowing a half-authenticated session.
        console.warn('[Login] Unexpected auth response shape:', JSON.stringify(response));
        throw new Error(
          !accessToken
            ? t('Login server did not return an access token.')
            : t('Login server did not return an account login.'),
        );
      }

      // Compute expiresAt: spec uses `expires_at` (epoch seconds), older
      // shape uses `expires_in` (seconds from now). Accept both.
      const expiresAtIso = (() => {
        if (typeof response.expires_at === 'number' && response.expires_at > 0) {
          // If it's an epoch in seconds (< year 3000 in ms), treat as seconds.
          const ms = response.expires_at > 1e12 ? response.expires_at : response.expires_at * 1000;
          return new Date(ms).toISOString();
        }
        const expiresInSec = typeof response.expires_in === 'number' ? response.expires_in : 86400;
        return new Date(Date.now() + expiresInSec * 1000).toISOString();
      })();

      // Use the broker_id from the API response as canonical — the server
      // validates and returns it, so it's always correct. Falls back to
      // the user-typed value if the response doesn't include it.
      const canonicalBrokerId = response.broker_id || response.brokerId || normalizedBrokerId;
      const accountType = getTradingAccountTypeFromBackend(response);
      const immediateServerName = serverName || canonicalBrokerId;
      const savedLogin = String(accountLogin);

      // brokerId is persisted atomically inside login() to prevent race
      // conditions with the async Zustand persist middleware.
      login(
        savedLogin,
        accountName,
        immediateServerName,
        {
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
          expires_at: expiresAtIso,
        },
        canonicalBrokerId,
      );

      // The backend owns account classification. One login screen can connect
      // demo, contest, and real accounts without route-specific hardcoding.
      setIsDemoAccountFlag(accountType === 'demo');
      router.replace('/(tabs)/quotes');
      schedulePostLoginWork(() => {
        // Record this account in the persistent directory and stash the master
        // password securely so the user can one-tap switch back to it later
        // from the Accounts screen.
        upsertSavedAccount({
          login: savedLogin,
          name: accountName,
          brokerId: canonicalBrokerId,
          server: immediateServerName,
          accountType,
          lastUsedAt: Date.now(),
          hasCredentials: true,
        });
        setSavedAccountPassword(canonicalBrokerId, savedLogin, currentPassword).catch((err) => {
          console.warn('[Login] Failed to persist saved-account credential', err);
        });

        // Refresh session-scoped caches after navigation has started.
        queryClient.invalidateQueries({ queryKey: [ACCOUNTS_LIST_KEY] });
        queryClient.invalidateQueries({ queryKey: [ACCOUNT_DETAIL_KEY] });
        queryClient.invalidateQueries({ queryKey: [BROKER_CONFIG_KEY] });

        // Keep remembered-login storage off the critical route change.
        if (savePassword) {
          setSecureItemAsync(
            screenCopy.savedLoginKey,
            JSON.stringify({ broker: normalizedBrokerId, login: normalizedAccountId, pass: currentPassword })
          );
        } else {
          removeSecureItemAsync(screenCopy.savedLoginKey);
        }

        void getBrokerConfig(canonicalBrokerId)
          .then((brokerConfig) => {
            queryClient.setQueryData([BROKER_CONFIG_KEY, canonicalBrokerId], brokerConfig);
            if (canonicalBrokerId !== normalizedBrokerId) {
              queryClient.setQueryData([BROKER_CONFIG_KEY, normalizedBrokerId], brokerConfig);
            }
            if (brokerConfig.server_name && brokerConfig.server_name !== immediateServerName) {
              upsertSavedAccount({
                login: savedLogin,
                name: accountName,
                brokerId: canonicalBrokerId,
                server: brokerConfig.server_name,
                accountType,
                lastUsedAt: Date.now(),
                hasCredentials: true,
              });
            }
          })
          .catch((err) => {
            console.warn('[Login] Broker config refresh failed after login', err);
          });
      });
      
    } catch (error: any) {
      setModalState({ visible: true, type: 'error', title: t('Login Failed'), message: error.message || t('Invalid credentials') });
      setTimeout(() => {
        setModalState(prev => ({ ...prev, visible: false }));
      }, 2000);
    } finally {
      loginRequestInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const releaseLoginSubmitPressGuard = () => {
    if (loginSubmitPressGuardTimerRef.current) {
      clearTimeout(loginSubmitPressGuardTimerRef.current);
    }
    loginSubmitPressGuardTimerRef.current = setTimeout(() => {
      loginSubmitPressGuardRef.current = false;
      loginSubmitPressGuardTimerRef.current = null;
    }, LOGIN_SUBMIT_PRESS_GUARD_MS);
  };

  const handleLoginPress = () => {
    if (loginRequestInFlightRef.current || loginSubmitPressGuardRef.current) {
      return;
    }

    loginSubmitPressGuardRef.current = true;
    runImmediateAction('login.submit.touch', () => {
      Keyboard.dismiss();
      scheduleLoginSubmitAfterInputCommit(() => {
        const snapshot = getLoginCredentialsSnapshot();
        void handleLogin(snapshot);
      });
      releaseLoginSubmitPressGuard();
    });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {Platform.OS === 'web' && (
        // @ts-ignore - Web only CSS injection
        <style>{`
          input:-webkit-autofill,
          input:-webkit-autofill:hover, 
          input:-webkit-autofill:focus, 
          input:-webkit-autofill:active {
              -webkit-box-shadow: 0 0 0 1000px ${T.bg} inset !important;
              -webkit-text-fill-color: ${T.text} !important;
              transition: background-color 5000s ease-in-out 0s;
          }
        `}</style>
      )}
      <View style={styles.bg}>


        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <Pressable
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            onPress={() => safeRouterBack(router, '/')}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t(screenCopy.headerTitle)}</Text>
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={false}
          >

            {/* ── Section Title ── */}
            <View style={styles.sectionTitleContainer}>
              <Text style={styles.sectionTitle}>{t(screenCopy.sectionTitle)}</Text>
            </View>

            {/* ── Form Body ── */}
            <View style={styles.formContainer}>

              {/* Broker ID Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Broker ID')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={brokerId}
                  onChangeText={updateBrokerId}
                  onEndEditing={updateBrokerIdFromEndEditing}
                  autoCapitalize="none"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>
              <View style={styles.fieldDivider} />

              {/* Login ID Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Login ID')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={accountId}
                  onChangeText={updateAccountId}
                  onEndEditing={updateAccountIdFromEndEditing}
                  autoCapitalize="none"
                  keyboardType="numeric"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>
              <View style={styles.fieldDivider} />

              {/* Password Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Password')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={password}
                  onChangeText={updatePassword}
                  onEndEditing={updatePasswordFromEndEditing}
                  autoCapitalize="none"
                  secureTextEntry={!showPassword}
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={15} style={styles.eyeIconBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={T.textSub} />
                </Pressable>
              </View>
              <View style={styles.fieldDivider} />

              {/* Save Password Checkbox */}
              <Pressable
                style={styles.checkboxRow}
                onPress={() => setSavePassword(!savePassword)}
                hitSlop={LOGIN_TOUCH_HIT_SLOP}
                latencyLabel="login.savePassword.toggle"
              >
                <Ionicons
                  name={savePassword ? "checkbox" : "square-outline"}
                  size={22}
                  color={savePassword ? T.accent : T.textSub}
                />
                <Text style={styles.checkboxText}>{t('Save password')}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.loginBtn,
                  (pressed || isLoading) && styles.loginBtnPressed
                ]}
                onPress={handleLoginPress}
                activateOnPressIn
                disabled={isLoading}
                hitSlop={LOGIN_BUTTON_HIT_SLOP}
                pressRetentionOffset={LOGIN_BUTTON_PRESS_RETENTION_OFFSET}
                latencyLabel="login.submit"
                unstable_pressDelay={0}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                testID="login-submit-button"
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginBtnText}>{t('LOGIN')}</Text>
                )}
              </Pressable>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Success/Error Modal Overlay */}
        {modalState.visible && (
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={handleModalClose} />
            <View style={styles.successModal}>
              <View style={[styles.successIconBox, modalState.type === 'error' && { backgroundColor: T.trading.sell.primary }]}>
                <Ionicons name={modalState.type === 'success' ? 'checkmark' : 'close'} size={32} color="#fff" />
              </View>
              <Text style={styles.successTitle}>{modalState.title}</Text>
              <Text style={styles.successDesc}>{modalState.message}</Text>
            </View>
          </View>
        )}
      </View>
    </>
  );
}

// ─── RTX5 Dynamic Theme + Minimalist Layout ──────────────────────────────────
export default function LoginScreen() {
  return <AccountLoginScreen />;
}

function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: T.bg, // Dynamic theme background
      // Respect the device's actual safe-area inset (status bar / notch)
      // instead of a hardcoded 56/24, which clipped the back button on
      // tall-status-bar Android devices and floated the header awkwardly
      // on iPhones without notches.
      paddingTop: safeTop + 8,
    },
    container: {
      flex: 1,
    },
    /* Header */
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: T.glass1, // Subtle glass touch target
    },
    headerTitle: {
      color: T.text,
      fontSize: 18,
      fontWeight: '600',
      letterSpacing: 0.3,
    },

    scrollContent: {
      paddingBottom: 40,
    },

    /* Section Title Bar (Minimalist) */
    sectionTitleContainer: {
      paddingVertical: 8,
      marginTop: 4,
      marginBottom: 4,
    },
    sectionTitle: {
      color: T.textSub,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 0.2,
    },


    formContainer: {
      paddingHorizontal: 20,
      marginTop: 8,
    },

    /* Input Rows (Ultra-Minimalist) */
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingVertical: 12,
      backgroundColor: 'transparent',
    },
    inputLabel: {
      color: T.text,
      fontSize: 15,
      fontWeight: '500',
      width: 125,
      backgroundColor: 'transparent',
    },
    input: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      fontWeight: '600',
      padding: 0,
      paddingHorizontal: 0,
      margin: 0,
      height: '100%' as any,
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
    },

    /* Divider between fields */
    fieldDivider: {
      height: 1,
      backgroundColor: isDark ? T.border : T.borderMedium,
      marginLeft: 0,
    },

    /* Eye Icon */
    eyeIconBtn: {
      padding: 8,
      marginRight: -8,
      backgroundColor: 'transparent',
    },

    /* Checkbox */
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 24,
    },
    checkboxText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 10,
    },

    /* Solid Login Button */
    loginBtn: {
      backgroundColor: T.accent,
      minHeight: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
      shadowColor: T.accent,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    loginBtnPressed: {
      opacity: 0.85,
    },
    loginBtnText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },

    /* Register Link */
    registerPromptContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 24,
    },
    registerPromptText: {
      color: T.textSub,
      fontSize: 14,
    },
    registerLinkText: {
      color: '#007ACC',
      fontSize: 14,
      fontWeight: '600',
    },

    /* Success / Error Modal */
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      zIndex: 999,
      elevation: 999,
    },
    successModal: {
      width: '85%',
      maxWidth: 340,
      backgroundColor: T.glass2,
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: T.borderMedium,
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
    },
    successIconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#34C759',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    successTitle: {
      color: T.text,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 8,
    },
    successDesc: {
      color: T.textSub,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    successBtn: {
      backgroundColor: T.accent,
      width: '100%',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    successBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
