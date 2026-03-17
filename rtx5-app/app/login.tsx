import { Stack, router } from 'expo-router';
import React, { useState } from 'react';
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
import { useTheme, type ThemeColors } from '../src/theme/useTheme';

export default function LoginScreen() {
  const login = useUserPreferences((s) => s.login);

  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [brokerId, setBrokerId] = useState('');
  const { themeMode } = useUserPreferences();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const styles = makeStyles(T, isDark);

  const handleLogin = async () => {
    if (!accountId || !password) {
      Alert.alert('Error', 'Please enter both Login and Password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await loginAPI({
        username: accountId.trim(),
        password,
        broker_id: brokerId.trim(),
      });

      // Compute expiresAt from expires_in (seconds)
      const expiresAt = new Date(Date.now() + (response.expires_in ?? 86400) * 1000).toISOString();

      login(
        String(response.account_login),
        response.username || 'Trader',
        response.server || brokerId,
        {
          access_token: response.access_token,
          refresh_token: response.refresh_token,
          expires_at: expiresAt,
        }
      );

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
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
                  style={styles.input}
                  value={brokerId}
                  onChangeText={setBrokerId}
                  autoCapitalize="none"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill="no-hide-descendants"
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>

              {/* Login Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Login</Text>
                <TextInput
                  style={styles.input}
                  value={accountId}
                  onChangeText={setAccountId}
                  autoCapitalize="none"
                  keyboardType="numeric"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill="no-hide-descendants"
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>

              {/* Password Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  secureTextEntry={!showPassword}
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill="no-hide-descendants"
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
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
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
      backgroundColor: T.bg, // Aggressive fix for native highlight leaks
    },
    inputLabel: {
      color: T.text,
      fontSize: 15,
      fontWeight: '500',
      width: 125,
      backgroundColor: T.bg, // Matches row background
    },
    input: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      fontWeight: '600',
      padding: 0,
      paddingHorizontal: 0, // Absolute reset
      margin: 0,
      height: '100%',
      backgroundColor: T.bg, // Matches theme to hide highlights
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: 0,
      // @ts-ignore - web focus ring removal
      outlineStyle: 'none',
      // @ts-ignore - additional web focus ring removal
      outlineWidth: 0,
      shadowOpacity: 0,
      elevation: 0,
    },

    /* Eye Icon */
    eyeIconBtn: {
      padding: 8,
      marginRight: -8,
      backgroundColor: T.bg, // Matches row background
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
  });
}
