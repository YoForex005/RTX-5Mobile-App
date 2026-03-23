import { Stack, router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUserPreferences } from '../src/state/userPreferences';
import { loginAPI } from '../src/api/auth';
// Broker config API — validates broker_id before login and provides server_name
import { getBrokerConfig } from '../src/api/broker';
import { useTheme, type ThemeColors } from '../src/theme/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../src/query/accounts';
import { BROKER_CONFIG_KEY } from '../src/query/broker';

export default function LoginScreen() {
  const login = useUserPreferences((s) => s.login);
  // Broker config integration: persist broker_id to Zustand so useBrokerConfig()
  // can fetch GET /broker/config with the correct broker context app-wide
  const persistBrokerId = useUserPreferences((s) => s.setBrokerId);
  const queryClient = useQueryClient();

  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [brokerId, setBrokerId] = useState('');
  const [modalState, setModalState] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string; }>({ visible: false, type: 'success', title: '', message: '' });
  const { themeMode } = useUserPreferences();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const styles = makeStyles(T, isDark);

  useEffect(() => {
    // Auto-populate saved credentials if they exist
    AsyncStorage.getItem('rtx5_saved_login').then((val) => {
      if (val) {
        try {
          const { broker, login: savedAccountId, pass } = JSON.parse(val);
          if (broker) setBrokerId(broker);
          if (savedAccountId) setAccountId(savedAccountId);
          if (pass) setPassword(pass);
          setSavePassword(true);
        } catch (e) {
          // ignore parsing error
        }
      }
    });
  }, []);

  const handleModalClose = () => {
    if (modalState.type === 'success') {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    }
    setModalState(prev => ({ ...prev, visible: false }));
  };

  const handleLogin = async () => {
    if (!brokerId.trim()) {
      setModalState({ visible: true, type: 'error', title: 'Error', message: 'Please enter your Broker ID' });
      return;
    }
    if (!accountId || !password) {
      setModalState({ visible: true, type: 'error', title: 'Error', message: 'Please enter both Login ID and Password' });
      return;
    }

    setIsLoading(true);
    try {
      // We fetch brokerConfig strictly to get the server_name for the UI.
      // We do NOT block login if it returns the fallback shape (without broker_id),
      // because the backend /auth/login will ultimately validate the broker_id.
      let brokerConfig: any = null;
      try {
        brokerConfig = await getBrokerConfig(brokerId.trim());
      } catch (e) {
        // Ignore errors, we'll fall back to brokerId if it fails
      }

      const response = await loginAPI({
        login: Number(accountId.trim()),
        password,
        broker_id: brokerId.trim(),
      });

      // Compute expiresAt from expires_in (seconds)
      const expiresAt = new Date(Date.now() + (response.expires_in ?? 86400) * 1000).toISOString();

      login(
        String(response.account_login),
        response.username || 'Trader',
        response.server || brokerConfig?.server_name || brokerId,
        {
          access_token: response.access_token,
          refresh_token: response.refresh_token,
          expires_at: expiresAt,
        }
      );

      // Persist broker_id to Zustand — enables GET /broker/config to resolve
      // broker-specific settings (branding, currencies, leverage limits, etc.)
      persistBrokerId(brokerId.trim());

      // ── Invalidate cached queries so fresh data loads for the new session ──
      // Without this, stale accounts/broker data from a previous login persists
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_LIST_KEY] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNT_DETAIL_KEY] });
      queryClient.invalidateQueries({ queryKey: [BROKER_CONFIG_KEY] });

      // ── Handle Save Password Option ──────────────────────────────────────
      if (savePassword) {
        AsyncStorage.setItem(
          'rtx5_saved_login',
          JSON.stringify({ broker: brokerId.trim(), login: accountId.trim(), pass: password })
        );
      } else {
        AsyncStorage.removeItem('rtx5_saved_login');
      }

      setModalState({ visible: true, type: 'success', title: 'Success', message: 'Login successful' });
      
    } catch (error: any) {
      setModalState({ visible: true, type: 'error', title: 'Login Failed', message: error.message || 'Invalid credentials' });
    } finally {
      setIsLoading(false);
    }
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
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Broker Login</Text>
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* ── Section Title ── */}
            <View style={styles.sectionTitleContainer}>
              <Text style={styles.sectionTitle}>Login to an existing account</Text>
            </View>

            {/* ── Form Body ── */}
            <View style={styles.formContainer}>

              {/* Broker ID Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Broker ID</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={brokerId}
                  onChangeText={setBrokerId}
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
                <Text style={styles.inputLabel}>Login ID</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={accountId}
                  onChangeText={setAccountId}
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
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={password}
                  onChangeText={setPassword}
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
              >
                <Ionicons
                  name={savePassword ? "checkbox" : "square-outline"}
                  size={22}
                  color={savePassword ? T.accent : T.textSub}
                />
                <Text style={styles.checkboxText}>Save password</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.loginBtn,
                  (pressed || isLoading) && styles.loginBtnPressed
                ]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginBtnText}>LOGIN</Text>
                )}
              </Pressable>

              <View style={styles.registerPromptContainer}>
                <Text style={styles.registerPromptText}>Don't have an account? </Text>
                <Pressable onPress={() => router.push('/register')} disabled={isLoading} hitSlop={10}>
                  <Text style={styles.registerLinkText}>Register</Text>
                </Pressable>
              </View>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Success/Error Modal Overlay */}
        {modalState.visible && (
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} pointerEvents="box-none">
            <Pressable style={StyleSheet.absoluteFillObject} onPress={handleModalClose} />
            <View style={styles.successModal}>
              <View style={[styles.successIconBox, modalState.type === 'error' && { backgroundColor: T.trading.sell.primary }]}>
                <Ionicons name={modalState.type === 'success' ? 'checkmark' : 'close'} size={32} color="#fff" />
              </View>
              <Text style={styles.successTitle}>{modalState.title}</Text>
              <Text style={styles.successDesc}>{modalState.message}</Text>
              <Pressable style={[styles.successBtn, modalState.type === 'error' && { backgroundColor: T.trading.sell.primary }]} onPress={handleModalClose}>
                <Text style={styles.successBtnText}>OK</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </>
  );
}

// ─── RTX5 Dynamic Theme + Minimalist Layout ──────────────────────────────────
function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: T.bg, // Dynamic theme background
      paddingTop: Platform.OS === 'ios' ? 56 : 24,
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
      paddingVertical: 16,
      marginTop: 12,
      marginBottom: 20,
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
      marginTop: 40,
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
      height: 54,
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
      transform: [{ scale: 0.98 }],
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
      color: T.accent,
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
