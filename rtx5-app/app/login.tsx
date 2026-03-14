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
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
  const login = useUserPreferences((s) => s.login);

  const [accountId, setAccountId] = useState('900767');
  const [password, setPassword] = useState('47Y$Gj&0YS@T');
  const [savePassword, setSavePassword] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [server, setServer] = useState('flexy market');

  const handleLogin = async () => {
    if (!accountId || !password) {
      Alert.alert('Error', 'Please enter both Login and Password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await loginAPI({ username: accountId, password });
      
      login(
        response.user?.id || accountId,
        response.user?.username || 'Trader',
        server, 
        {
          access_token: response.access_token,
          refresh_token: response.refresh_token,
          expires_at: response.expires_at,
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
      <View style={s.bg}>
        
        {/* Navy Theme Gradient Background Hint */}
        <LinearGradient
          colors={['rgba(25, 60, 140, 0.08)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0.5 }}
        />

        {/* ── Header ── */}
        <View style={s.headerRow}>
          <Pressable 
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            style={s.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#e8ecf0" />
          </Pressable>
          <Text style={s.headerTitle}>Broker Login</Text>
        </View>

        <KeyboardAvoidingView
          style={s.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
            
            {/* ── Section Title ── */}
            <View style={s.sectionTitleContainer}>
              <Text style={s.sectionTitle}>Login to an existing account</Text>
            </View>

            {/* ── Form Body ── */}
            <View style={s.formContainer}>
              
              {/* Login Field */}
              <View style={s.inputRow}>
                <Text style={s.inputLabel}>Login</Text>
                <TextInput
                  style={s.input}
                  value={accountId}
                  onChangeText={setAccountId}
                  placeholder=""
                  placeholderTextColor="#4a5568"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                  keyboardType="numeric"
                  selectionColor="#3b8eed"
                />
              </View>
              <View style={s.rowDivider} />

              {/* Password Field */}
              <View style={s.inputRow}>
                <Text style={s.inputLabel}>Password</Text>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder=""
                  placeholderTextColor="#4a5568"
                  secureTextEntry
                  selectionColor="#3b8eed"
                />
              </View>
              <View style={s.rowDivider} />

              {/* Server Select */}
              <Pressable style={s.inputRow}>
                <Text style={s.inputLabel}>Server</Text>
                <View style={s.serverSelectWrap}>
                  <Text style={s.serverText}>{server}</Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7a90" style={s.serverChevron} />
                </View>
              </Pressable>
              <View style={s.rowDivider} />

              {/* Save Password */}
              <Pressable style={s.inputRow} onPress={() => setSavePassword(!savePassword)}>
                <Text style={s.inputLabel}>Save password</Text>
                <View style={[s.checkbox, savePassword && s.checkboxChecked]}>
                  {savePassword && <Ionicons name="checkmark-sharp" size={14} color="#fff" />}
                </View>
              </Pressable>
              <View style={s.rowDivider} />

            </View>

            {/* ── Footer ── */}
            <View style={s.footerContainer}>
              <Pressable style={s.forgotBtn}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  s.loginBtn, 
                  (pressed || isLoading) && s.loginBtnPressed
                ]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.loginBtnText}>LOGIN</Text>
                )}
              </Pressable>
            </View>
            
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

// ─── RTX5 Navy Theme + Modern MT5 Flat Layout ──────────────────────────────────
const C = {
  bgDeep: '#060910',       // Outer background Navy
  sectionBg: '#0e121a',    // Slightly elevated title bar
  label: '#6b7a90',        // Premium grey for labels
  value: '#ffffff',        // Crisp white values
  accent: '#3b8eed',       // RTX5 Primary Blue
  border: 'rgba(255,255,255,0.06)', // Glassmorphism lines
};

const s = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: C.bgDeep,
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
    backgroundColor: 'rgba(255,255,255,0.03)', // Subtle touch target
  },
  headerTitle: {
    color: C.value,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  scrollContent: {
    paddingBottom: 40,
  },

  /* Section Title Bar */
  sectionTitleContainer: {
    backgroundColor: C.sectionBg,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    marginTop: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  sectionTitle: {
    color: C.value,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  formContainer: {
    paddingHorizontal: 20,
  },

  /* Input Rows */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56, // Generous modern touch target height
    paddingVertical: 12,
  },
  inputLabel: {
    color: C.label,
    fontSize: 15,
    fontWeight: '500',
    width: 125, // Fixed width for clean vertical alignment
  },
  input: {
    flex: 1,
    color: C.value,
    fontSize: 16,
    fontWeight: '600',
    padding: 0,
    margin: 0,
    height: '100%',
  },
  
  /* Server Row */
  serverSelectWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  serverText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  serverChevron: {
    marginLeft: 8,
  },

  /* Checkbox */
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#2d3340',
    borderRadius: 6, // Modern rounded corners
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto', 
  },
  checkboxChecked: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },

  /* Dividers */
  rowDivider: {
    height: 1,
    backgroundColor: C.border,
  },

  /* Footer Section */
  footerContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  forgotBtn: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 12, // Easier to tap
  },
  forgotText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  /* Solid Login Button */
  loginBtn: {
    backgroundColor: C.accent,
    height: 54,
    borderRadius: 16, // Modern rounded rect, not pure pill
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
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
