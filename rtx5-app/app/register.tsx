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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../src/state/userPreferences';
// Integrated the Register API endpoint
import { registerAPI } from '../src/api/auth';
import { getBrokerConfig } from '../src/api/broker';
import { useTheme, type ThemeColors } from '../src/theme/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../src/query/accounts';
import { BROKER_CONFIG_KEY } from '../src/query/broker';

export default function RegisterScreen() {
  const login = useUserPreferences((s) => s.login);
  const persistBrokerId = useUserPreferences((s) => s.setBrokerId);
  const queryClient = useQueryClient();

  const [brokerId, setBrokerId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { themeMode } = useUserPreferences();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = makeStyles(T, isDark, insets.top);

  const handleRegister = async () => {
    if (!brokerId.trim() || !name.trim() || !email.trim() || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      let brokerConfig: any = null;
      try {
        brokerConfig = await getBrokerConfig(brokerId.trim());
      } catch (e) {
        // Ignore errors, fall back to brokerId
      }

      // Payload matching the POST /api/v2/auth/register endpoint requirements
      const response = await registerAPI({
        email: email.trim(),
        password,
        name: name.trim(),
        broker_id: brokerId.trim(),
        group: 'demo_standard',
        leverage: 100,
        currency: 'USD',
      });

      // Compute expiresAt from expires_in (seconds)
      const expiresAt = new Date(Date.now() + (response.expires_in ?? 86400) * 1000).toISOString();

      // Use the broker_id from the API response as canonical
      const canonicalBrokerId = response.broker_id || brokerId.trim();

      // Log the user in right away after successful registration
      // brokerId is persisted atomically inside login()
      login(
        String(response.account_login),
        response.username || name.trim(),
        response.server || brokerConfig?.server_name || canonicalBrokerId,
        {
          access_token: response.access_token,
          refresh_token: response.refresh_token,
          expires_at: expiresAt,
        },
        canonicalBrokerId
      );

      // Invalidate cached queries
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_LIST_KEY] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNT_DETAIL_KEY] });
      queryClient.invalidateQueries({ queryKey: [BROKER_CONFIG_KEY] });

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Unable to register account.');
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
                router.replace('/login');
              }
            }}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Demo Account</Text>
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* ── Section Title ── */}
            <View style={styles.sectionTitleContainer}>
              <Text style={styles.sectionTitle}>Register a new demo account</Text>
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

              {/* Name Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="name"
                  textContentType="name"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>
              <View style={styles.fieldDivider} />

              {/* Email Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="email"
                  textContentType="emailAddress"
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

              <Pressable
                style={({ pressed }) => [
                  styles.registerBtn,
                  (pressed || isLoading) && styles.registerBtnPressed
                ]}
                onPress={handleRegister}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.registerBtnText}>REGISTER</Text>
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
function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: T.bg, // Dynamic theme background
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

    /* Solid Register Button */
    registerBtn: {
      backgroundColor: T.accent,
      height: 54,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 36,
      shadowColor: T.accent,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    registerBtnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    registerBtnText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },

    /* Login Link */
    loginPromptContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 24,
    },
    loginPromptText: {
      color: T.textSub,
      fontSize: 14,
    },
    loginLinkText: {
      color: T.accent,
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
