import { FastPressable as Pressable } from '../src/ui/components/FastPressable';
import { Stack, router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  resolveChartColorsForTheme,
  useUserPreferences,
  type ChartColorsConfig,
} from '../src/state/userPreferences';
import { useThemeMode } from '../src/state/themeMode';
import { useSavedAccounts, setSavedAccountPassword } from '../src/state/savedAccounts';
import { loginAPI } from '../src/api/auth';
import { getBrokerConfig } from '../src/api/broker';
import { useTheme, type ThemeColors } from '../src/ui/theme/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../src/query/accounts';
import { BROKER_CONFIG_KEY } from '../src/query/broker';
import { useTranslation } from '../src/i18n/useTranslation';
import {
  ORRNN_DEMO_BROKER_ID,
  ORRNN_DEMO_INITIAL_BALANCE,
  ORRNN_DEMO_ORIGIN_BROKER,
  isOrrnnDemoHealthy,
} from '../src/api/publicDemo';
import {
  useCreateOrrnnDemoAccount,
  useOrrnnDemoGroups,
  useOrrnnDemoStatus,
} from '../src/query/publicDemo';
import { safeRouterBack } from '../src/utils/navigation';

type RegisterFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'country'
  | 'password'
  | 'investorPassword'
  | 'initialBalance'
  | 'originBroker';

const REGISTER_FIELD_SCROLL_OFFSET_Y = Platform.OS === 'android' ? 232 : 176;
const REGISTER_FIELD_FOCUS_DELAY_MS = Platform.OS === 'android' ? 260 : 80;
const REGISTER_KEYBOARD_BOTTOM_PADDING = Platform.OS === 'android' ? 220 : 120;

const REGISTER_HERO_CANDLES = [
  { x: 4, wickTop: 134, wickHeight: 50, bodyTop: 152, bodyHeight: 18, volume: 26, up: true },
  { x: 30, wickTop: 126, wickHeight: 56, bodyTop: 146, bodyHeight: 22, volume: 34, up: true },
  { x: 56, wickTop: 118, wickHeight: 64, bodyTop: 138, bodyHeight: 28, volume: 42, up: false },
  { x: 82, wickTop: 102, wickHeight: 72, bodyTop: 124, bodyHeight: 34, volume: 52, up: true },
  { x: 108, wickTop: 88, wickHeight: 78, bodyTop: 108, bodyHeight: 44, volume: 64, up: true },
  { x: 134, wickTop: 72, wickHeight: 84, bodyTop: 94, bodyHeight: 50, volume: 72, up: true },
  { x: 160, wickTop: 44, wickHeight: 104, bodyTop: 70, bodyHeight: 64, volume: 94, up: true },
  { x: 186, wickTop: 28, wickHeight: 114, bodyTop: 54, bodyHeight: 72, volume: 108, up: false },
  { x: 212, wickTop: 12, wickHeight: 116, bodyTop: 34, bodyHeight: 58, volume: 86, up: true },
  { x: 238, wickTop: 22, wickHeight: 96, bodyTop: 42, bodyHeight: 46, volume: 74, up: false },
  { x: 264, wickTop: 36, wickHeight: 84, bodyTop: 56, bodyHeight: 40, volume: 62, up: true },
] as const;

export default function RegisterScreen() {
  const login = useUserPreferences((s) => s.login);
  const chartColors = useUserPreferences((s) => s.chartColors);
  const chartColorScheme = useUserPreferences((s) => s.chartColorScheme);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isScreenFocused = useIsFocused();
  const {
    data: demoStatus,
    isLoading: isDemoStatusLoading,
    isFetching: isDemoStatusFetching,
    error: demoStatusError,
    refetch: refetchDemoStatus,
  } = useOrrnnDemoStatus(isScreenFocused);
  const isDemoServiceReady = isOrrnnDemoHealthy(demoStatus);
  const {
    data: demoGroups,
    isLoading: isDemoGroupsLoading,
    isFetching: isDemoGroupsFetching,
    error: demoGroupsError,
    refetch: refetchDemoGroups,
  } = useOrrnnDemoGroups(isScreenFocused && isDemoServiceReady);
  const createDemoAccount = useCreateOrrnnDemoAccount();
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const demoGroupOptions = demoGroups?.groups ?? [];
  const selectedDemoGroup =
    demoGroupOptions.find((group) => group.name === selectedGroupName) ??
    demoGroupOptions[0];
  // Cold-start network checks should never hide the form. They only control
  // whether the final submit is enabled once the live demo contract is ready.
  const isPreparingDemoAccount =
    isDemoStatusLoading || (isDemoServiceReady && isDemoGroupsLoading);
  const isDemoServiceUnavailable = !isDemoStatusLoading && !isDemoServiceReady;
  const isDemoGroupUnavailable =
    isDemoServiceReady && !isDemoGroupsLoading && !selectedDemoGroup?.name;
  const isDemoSetupUnavailable = isDemoServiceUnavailable || isDemoGroupUnavailable;
  const isRetryingDemoSetup = isDemoServiceUnavailable
    ? isDemoStatusFetching
    : isDemoGroupUnavailable
      ? isDemoGroupsFetching
      : false;
  const canSubmitDemoAccount =
    isDemoServiceReady && !!selectedDemoGroup?.name && !isPreparingDemoAccount;
  const registerButtonLabel = t('Register a demo account');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('United States');
  const [password, setPassword] = useState('');
  const [investorPassword, setInvestorPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState(String(ORRNN_DEMO_INITIAL_BALANCE));
  const [originBroker, setOriginBroker] = useState(ORRNN_DEMO_ORIGIN_BROKER ?? '');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showInvestorPassword, setShowInvestorPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = React.useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const fieldYPositionsRef = React.useRef<Partial<Record<RegisterFieldKey, number>>>({});
  const fieldFocusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const themeMode = useThemeMode();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const resolvedChartColors = React.useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  const insets = useSafeAreaInsets();
  const styles = makeStyles(T, isDark, insets.top, resolvedChartColors);

  React.useEffect(() => () => {
    if (fieldFocusTimerRef.current) {
      clearTimeout(fieldFocusTimerRef.current);
    }
  }, []);

  const handleFieldLayout = React.useCallback((field: RegisterFieldKey) => (event: LayoutChangeEvent) => {
    fieldYPositionsRef.current[field] = event.nativeEvent.layout.y;
  }, []);

  const scrollFieldAboveKeyboard = React.useCallback((field: RegisterFieldKey) => {
    const fieldY = fieldYPositionsRef.current[field];
    if (typeof fieldY !== 'number') {
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(0, fieldY - REGISTER_FIELD_SCROLL_OFFSET_Y),
      animated: true,
    });
  }, []);

  const handleFieldFocus = React.useCallback((field: RegisterFieldKey) => {
    if (fieldFocusTimerRef.current) {
      clearTimeout(fieldFocusTimerRef.current);
    }
    fieldFocusTimerRef.current = setTimeout(() => {
      scrollFieldAboveKeyboard(field);
    }, REGISTER_FIELD_FOCUS_DELAY_MS);
  }, [scrollFieldAboveKeyboard]);

  const handleRegister = async () => {
    if (isPreparingDemoAccount) {
      Alert.alert(
        t('Demo account unavailable'),
        t('Demo account details are still loading. Please try again in a moment.'),
      );
      return;
    }

    if (!isDemoServiceReady) {
      Alert.alert(
        t('Demo account unavailable'),
        t('Demo account service is not available. Please try again shortly.'),
      );
      return;
    }

    if (!selectedDemoGroup?.name) {
      Alert.alert(
        t('Demo account unavailable'),
        t('No Orrnn demo group is available for account creation.'),
      );
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedCountryInput = country.trim();
    const trimmedCountry = trimmedCountryInput.toLowerCase() === 'united states'
      ? 'US'
      : trimmedCountryInput.toUpperCase();
    const trimmedOriginBroker = originBroker.trim();
    const parsedInitialBalance = Number(initialBalance);

    if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !password || !investorPassword || !trimmedCountry) {
      Alert.alert(t('Error'), t('Please fill in all required fields'));
      return;
    }

    if (!termsAccepted) {
      Alert.alert(t('Error'), t('Please accept the terms and conditions'));
      return;
    }

    if (!Number.isFinite(parsedInitialBalance) || parsedInitialBalance <= 0) {
      Alert.alert(t('Error'), t('Please enter a valid initial balance'));
      return;
    }

    setIsLoading(true);
    try {
      let brokerConfig: any = null;
      try {
        brokerConfig = await getBrokerConfig(ORRNN_DEMO_BROKER_ID);
      } catch (e) {
        // Ignore errors, fall back to the demo broker contract.
      }

      // INTEGRATED: Public demo registration uses
      // POST /api/v1/public/demo-account. This endpoint is intentionally
      // unauthenticated; the backend enforces broker_id=orrnn and rejects
      // non-demo groups, while the app supplies the API-selected demo group
      // and user-entered account details.
      const response = await createDemoAccount.mutateAsync({
        group: selectedDemoGroup.name,
        email: trimmedEmail,
        master_pass: password,
        investor_pass: investorPassword,
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        phone: trimmedPhone || undefined,
        country: trimmedCountry,
        currency: selectedDemoGroup.currency,
        leverage: selectedDemoGroup.leverage,
        initial_balance: parsedInitialBalance,
        origin_broker: trimmedOriginBroker || undefined,
      });

      // Use the broker_id from the API response as canonical
      const canonicalBrokerId = response.broker_id || ORRNN_DEMO_BROKER_ID;
      const accountName = `${trimmedFirstName} ${trimmedLastName}`.trim();
      let sessionLogin = response.login;
      let sessionToken = response.api_key ?? '';
      let sessionRefreshToken = '';
      let sessionExpiresAt = '';

      if (!sessionToken) {
        // The documented public endpoint returns `api_key`, but current live
        // deployments can return only the created login/account fields. In
        // that case the created demo account is still valid, so immediately
        // authenticate it through the existing V2 login endpoint using the
        // master password the user just supplied.
        const authResponse: any = await loginAPI({
          username: String(response.login),
          password,
          broker_id: canonicalBrokerId,
        });
        sessionToken = authResponse.access_token ?? authResponse.token ?? '';
        sessionRefreshToken = authResponse.refresh_token ?? authResponse.refreshToken ?? '';
        sessionLogin =
          authResponse.account_login ??
          authResponse.accountLogin ??
          authResponse.user?.account_login ??
          response.login;
        if (typeof authResponse.expires_at === 'number' && authResponse.expires_at > 0) {
          const ms = authResponse.expires_at > 1e12 ? authResponse.expires_at : authResponse.expires_at * 1000;
          sessionExpiresAt = new Date(ms).toISOString();
        } else {
          const expiresInSec = typeof authResponse.expires_in === 'number' ? authResponse.expires_in : 86400;
          sessionExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
        }
      }

      if (!sessionToken) {
        throw new Error(t('Demo account was created, but the login token was not returned.'));
      }

      // Log the user in right away after successful registration
      // brokerId is persisted atomically inside login()
      login(
        String(sessionLogin),
        accountName,
        brokerConfig?.server_name || canonicalBrokerId,
        {
          access_token: sessionToken,
          refresh_token: sessionRefreshToken,
          expires_at: sessionExpiresAt,
        },
        canonicalBrokerId,
        { isDemoAccount: true },
      );

      // Persist the new demo account in the directory + secure-store the
      // master password so the user can switch back to it from the Accounts
      // screen without re-typing credentials.
      const savedLogin = String(sessionLogin);
      upsertSavedAccount({
        login: savedLogin,
        name: accountName,
        brokerId: canonicalBrokerId,
        server: brokerConfig?.server_name || canonicalBrokerId,
        accountType: 'demo',
        lastUsedAt: Date.now(),
        hasCredentials: true,
      });
      setSavedAccountPassword(canonicalBrokerId, savedLogin, password).catch((err) => {
        console.warn('[Register] Failed to persist saved-account credential', err);
      });

      // Invalidate cached queries
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_LIST_KEY] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNT_DETAIL_KEY] });
      queryClient.invalidateQueries({ queryKey: [BROKER_CONFIG_KEY] });

      safeRouterBack(router, '/');
    } catch (error: any) {
      Alert.alert(t('Registration Failed'), error.message || t('Unable to register account.'));
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrengthScore = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const visiblePasswordStrengthScore = password ? passwordStrengthScore : 3;
  const passwordStrengthLabel = !password
    ? t('Strong')
    : passwordStrengthScore >= 3
    ? t('Strong')
    : passwordStrengthScore >= 2
      ? t('Medium')
      : t('Weak');
  const passwordStrengthColor = !password || passwordStrengthScore >= 3
    ? '#22C55E'
    : passwordStrengthScore >= 2
      ? '#F59E0B'
      : '#64748B';
  const selectedCurrency = selectedDemoGroup?.currency ?? 'USD';

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
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            ref={scrollViewRef}
            canCancelContentTouches={Platform.OS === 'ios'}
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="always"
          >

            <View style={styles.formContainer}>
              <View style={styles.heroSection}>
                <View pointerEvents="none" style={styles.heroHistoryChart}>
                  <View style={[styles.heroChartGridLine, styles.heroChartGridLineTop]} />
                  <View style={[styles.heroChartGridLine, styles.heroChartGridLineMiddle]} />
                  <View style={[styles.heroChartGridLine, styles.heroChartGridLineBottom]} />
                  <View style={[styles.heroChartGridColumn, styles.heroChartGridColumnOne]} />
                  <View style={[styles.heroChartGridColumn, styles.heroChartGridColumnTwo]} />
                  <View style={styles.heroChartAverageLine} />
                  {REGISTER_HERO_CANDLES.map((candle, index) => {
                    const colorStyles = candle.up
                      ? {
                          body: styles.heroCandleUpBody,
                          wick: styles.heroCandleUpWick,
                          volume: styles.heroVolumeUp,
                        }
                      : {
                          body: styles.heroCandleDownBody,
                          wick: styles.heroCandleDownWick,
                          volume: styles.heroVolumeDown,
                        };

                    return (
                      <View key={`register-hero-candle-${index}`} style={[styles.heroCandleSlot, { left: candle.x }]}>
                        <View
                          style={[
                            styles.heroCandleWick,
                            colorStyles.wick,
                            { top: candle.wickTop, height: candle.wickHeight },
                          ]}
                        />
                        <View
                          style={[
                            styles.heroCandleBody,
                            colorStyles.body,
                            { top: candle.bodyTop, height: candle.bodyHeight },
                          ]}
                        />
                        <View
                          style={[
                            styles.heroVolumeBar,
                            colorStyles.volume,
                            { height: candle.volume },
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
                <Pressable
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => safeRouterBack(router, '/login')}
                  style={styles.heroBackButton}
                >
                  <Ionicons name="arrow-back" size={26} color="#DCEBFF" />
                </Pressable>
                <Text style={styles.heroTitle}>
                  {t('Open Your Demo')}{'\n'}
                  <Text style={styles.heroTitleAccent}>{t('Trading Account')}</Text>
                </Text>
                <Text style={styles.heroSubtitle}>
                  {t('Create a practice account and start trading in minutes.')}
                </Text>
              </View>

              {isDemoSetupUnavailable && (
                <View style={styles.statusNotice}>
                  <Ionicons
                    name={isDemoServiceUnavailable ? 'cloud-offline-outline' : 'list-outline'}
                    size={18}
                    color="#38BDF8"
                  />
                  <Text style={styles.statusNoticeText} numberOfLines={2}>
                    {isDemoServiceUnavailable
                      ? (demoStatusError?.message || t('Demo account service is temporarily unavailable.'))
                      : (demoGroupsError?.message || t('No demo group is available for account creation.'))}
                  </Text>
                  <Pressable
                    style={styles.statusRetryBtn}
                    onPress={() => {
                      if (isDemoServiceUnavailable) {
                        refetchDemoStatus();
                      } else {
                        refetchDemoGroups();
                      }
                    }}
                    disabled={isRetryingDemoSetup}
                  >
                    {isRetryingDemoSetup ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.statusRetryText}>{t('Retry')}</Text>
                    )}
                  </Pressable>
                </View>
              )}

              <View style={styles.inputRow} onLayout={handleFieldLayout('firstName')}>
                <Text style={styles.inputLabel}>{t('First name')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="person-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={firstName}
                    onChangeText={setFirstName}
                    onFocus={() => handleFieldFocus('firstName')}
                    placeholder={t('First name')}
                    placeholderTextColor="#8EA0BA"
                    autoCapitalize="words"
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="name"
                    textContentType="name"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('lastName')}>
                <Text style={styles.inputLabel}>{t('Last name')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="id-card-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={lastName}
                    onChangeText={setLastName}
                    onFocus={() => handleFieldFocus('lastName')}
                    placeholder={t('Last name')}
                    placeholderTextColor="#8EA0BA"
                    autoCapitalize="words"
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="name-family"
                    textContentType="familyName"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('email')}>
                <Text style={styles.inputLabel}>{t('Email')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="mail-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => handleFieldFocus('email')}
                    placeholder={t('you@example.com')}
                    placeholderTextColor="#8EA0BA"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="email"
                    textContentType="emailAddress"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('phone')}>
                <Text style={styles.inputLabel}>{t('Phone')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="call-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => handleFieldFocus('phone')}
                    placeholder="+1 (555) 123-4567"
                    placeholderTextColor="#8EA0BA"
                    keyboardType="phone-pad"
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('country')}>
                <Text style={styles.inputLabel}>{t('Country')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="earth-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={country}
                    onChangeText={setCountry}
                    onFocus={() => handleFieldFocus('country')}
                    placeholder={t('United States')}
                    placeholderTextColor="#EAF2FF"
                    autoCapitalize="words"
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="countryName"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                  <Ionicons name="chevron-down" size={20} color="#A7B4CC" />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('password')}>
                <Text style={styles.inputLabel}>{t('Master password')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => handleFieldFocus('password')}
                    placeholder={t('Master password')}
                    placeholderTextColor="#8EA0BA"
                    autoCapitalize="none"
                    secureTextEntry={!showPassword}
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={15} style={styles.eyeIconBtn}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#A7B4CC" />
                  </Pressable>
                </View>
                <View style={styles.passwordStrengthRow}>
                  {[0, 1, 2, 3].map((level) => (
                    <View
                      key={level}
                      style={[
                        styles.passwordStrengthBar,
                        level < visiblePasswordStrengthScore && { backgroundColor: passwordStrengthColor },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.passwordStrengthText}>
                  {t('Password strength:')} <Text style={{ color: passwordStrengthColor }}>{passwordStrengthLabel}</Text>
                </Text>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('investorPassword')}>
                <Text style={styles.inputLabel}>{t('Investor password')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={investorPassword}
                    onChangeText={setInvestorPassword}
                    onFocus={() => handleFieldFocus('investorPassword')}
                    placeholder={t('Investor password')}
                    placeholderTextColor="#8EA0BA"
                    autoCapitalize="none"
                    secureTextEntry={!showInvestorPassword}
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                  <Pressable onPress={() => setShowInvestorPassword(!showInvestorPassword)} hitSlop={15} style={styles.eyeIconBtn}>
                    <Ionicons name={showInvestorPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#A7B4CC" />
                  </Pressable>
                </View>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.twoColumnCell}>
                  <Text style={styles.inputLabel}>{t('Currency')}</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="cash-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                    <Text style={styles.selectValue} numberOfLines={1}>{selectedCurrency}</Text>
                    <Ionicons name="chevron-down" size={20} color="#A7B4CC" />
                  </View>
                </View>

                <View style={styles.twoColumnCell}>
                  <Text style={styles.inputLabel}>{t('Leverage')}</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="speedometer-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                    <Text style={styles.selectValue} numberOfLines={1}>
                      {selectedDemoGroup?.leverage ? `1:${selectedDemoGroup.leverage}` : '--'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#A7B4CC" />
                  </View>
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('initialBalance')}>
                <Text style={styles.inputLabel}>{t('Initial balance')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="wallet-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={initialBalance}
                    onChangeText={setInitialBalance}
                    onFocus={() => handleFieldFocus('initialBalance')}
                    keyboardType="numeric"
                    placeholder="10000"
                    placeholderTextColor="#EAF2FF"
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('originBroker')}>
                <Text style={styles.inputLabel}>{t('Origin broker')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="business-outline" size={21} color="#A7B4CC" style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={originBroker}
                    onChangeText={setOriginBroker}
                    onFocus={() => handleFieldFocus('originBroker')}
                    placeholder={t('Origin broker')}
                    placeholderTextColor="#8EA0BA"
                    autoCapitalize="none"
                    selectionColor="#22A8FF"
                    cursorColor="#22A8FF"
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Group')}</Text>
                <Pressable
                  style={styles.inputShell}
                  onPress={() => {
                    if (demoGroupOptions.length <= 1) {
                      return;
                    }
                    const currentIndex = demoGroupOptions.findIndex((group) => group.name === selectedDemoGroup?.name);
                    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % demoGroupOptions.length : 0;
                    setSelectedGroupName(demoGroupOptions[nextIndex]?.name ?? '');
                  }}
                >
                  <Ionicons name="shield-checkmark-outline" size={21} color="#0A84FF" style={styles.inputRowIcon} />
                  <Text style={styles.selectValue} numberOfLines={1}>
                    {selectedDemoGroup?.name ?? t('Demo groups unavailable')}
                  </Text>
                  <View style={styles.demoTypeAction}>
                    <Ionicons name="arrow-forward" size={18} color="#9CCAFF" />
                  </View>
                  <Ionicons name="chevron-down" size={20} color="#A7B4CC" />
                </Pressable>
              </View>

              <Pressable
                style={styles.termsRow}
                onPress={() => setTermsAccepted((value) => !value)}
              >
                <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                  {termsAccepted && <Ionicons name="checkmark" size={17} color="#ffffff" />}
                </View>
                <Text style={styles.termsText}>
                  {t('I agree to the')} <Text style={styles.linkText}>{t('Terms and Conditions')}</Text> {t('and')} <Text style={styles.linkText}>{t('Privacy Policy')}.</Text>
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.registerBtn,
                  (!canSubmitDemoAccount || isLoading || !termsAccepted) && styles.registerBtnDisabled,
                  (pressed && canSubmitDemoAccount) && styles.registerBtnPressed
                ]}
                onPress={handleRegister}
                disabled={isLoading || !canSubmitDemoAccount || !termsAccepted}
              >
                <LinearGradient
                  colors={['#1597FF', '#006DFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.registerGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.registerBtnText}>{registerButtonLabel}</Text>
                  )}
                </LinearGradient>
              </Pressable>
              </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

// Dynamic theme + register layout.
function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number, chartColors: ChartColorsConfig) {
  const pageBg = '#020B18';
  const surface = 'rgba(7,23,44,0.74)';
  const surfaceSoft = 'rgba(14,34,60,0.82)';
  const border = 'rgba(128,166,211,0.34)';
  const borderStrong = 'rgba(34,168,255,0.56)';
  const iconBg = 'rgba(17,44,76,0.88)';

  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: pageBg,
      paddingTop: safeTop,
    },
    container: {
      flex: 1,
    },
    /* Header */
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 14,
      backgroundColor: pageBg,
      borderBottomWidth: 1,
      borderBottomColor: border,
      zIndex: 10,
      elevation: 0,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    headerTitle: {
      color: T.text,
      flex: 1,
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: 0,
    },

    scrollContent: {
      paddingBottom: REGISTER_KEYBOARD_BOTTOM_PADDING,
      paddingTop: 28,
    },

    formContainer: {
      position: 'relative',
      paddingHorizontal: 24,
    },
    heroSection: {
      position: 'relative',
      overflow: 'hidden',
      marginHorizontal: -24,
      paddingHorizontal: 24,
      paddingTop: 0,
      paddingBottom: 18,
      marginBottom: 4,
    },
    heroHistoryChart: {
      position: 'absolute',
      top: 16,
      right: -72,
      width: 316,
      height: 232,
      opacity: 0.5,
    },
    heroChartGridLine: {
      position: 'absolute',
      left: -18,
      right: -20,
      height: 1,
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderColor: 'rgba(41,98,255,0.16)',
    },
    heroChartGridLineTop: {
      top: 34,
      transform: [{ rotate: '5deg' }],
    },
    heroChartGridLineMiddle: {
      top: 98,
      transform: [{ rotate: '-2deg' }],
    },
    heroChartGridLineBottom: {
      top: 166,
      transform: [{ rotate: '3deg' }],
    },
    heroChartGridColumn: {
      position: 'absolute',
      top: 0,
      bottom: 12,
      width: 1,
      borderLeftWidth: 1,
      borderStyle: 'dashed',
      borderColor: 'rgba(41,98,255,0.12)',
    },
    heroChartGridColumnOne: {
      left: 100,
    },
    heroChartGridColumnTwo: {
      left: 210,
    },
    heroChartAverageLine: {
      position: 'absolute',
      left: 16,
      right: -20,
      bottom: 70,
      height: 1,
      backgroundColor: chartColors.candlesUptrend,
      opacity: 0.2,
      transform: [{ rotate: '-15deg' }],
    },
    heroCandleSlot: {
      position: 'absolute',
      top: 0,
      width: 14,
      height: 232,
    },
    heroCandleWick: {
      position: 'absolute',
      left: 6,
      width: 1,
      borderRadius: 1,
    },
    heroCandleBody: {
      position: 'absolute',
      left: 2,
      width: 10,
      borderWidth: 1,
      borderRadius: 1,
    },
    heroCandleUpWick: {
      backgroundColor: chartColors.candlesUptrend,
      opacity: 0.62,
    },
    heroCandleDownWick: {
      backgroundColor: chartColors.candlesDowntrend,
      opacity: 0.42,
    },
    heroCandleUpBody: {
      backgroundColor: chartColors.candlesUptrend,
      borderColor: chartColors.candlesUptrend,
      opacity: 0.56,
    },
    heroCandleDownBody: {
      backgroundColor: 'transparent',
      borderColor: chartColors.candlesDowntrend,
      opacity: 0.5,
    },
    heroVolumeBar: {
      position: 'absolute',
      left: 6,
      bottom: 4,
      width: 2,
      borderRadius: 1,
    },
    heroVolumeUp: {
      backgroundColor: chartColors.candlesUptrend,
      opacity: 0.18,
    },
    heroVolumeDown: {
      backgroundColor: chartColors.candlesDowntrend,
      opacity: 0.14,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 36,
      lineHeight: 42,
      fontWeight: '900',
      letterSpacing: 0,
      marginBottom: 14,
    },
    heroTitleAccent: {
      color: '#38BDF8',
    },
    heroBackButton: {
      alignSelf: 'flex-start',
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 0,
      marginBottom: 22,
      backgroundColor: 'transparent',
    },
    heroSubtitle: {
      color: '#B8C4D8',
      fontSize: 18,
      lineHeight: 25,
      fontWeight: '500',
      marginBottom: 0,
      maxWidth: 270,
    },
    statusNotice: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'rgba(34,168,255,0.36)',
      backgroundColor: 'rgba(9,31,58,0.78)',
    },
    statusNoticeText: {
      flex: 1,
      color: '#B8C4D8',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
    },
    statusRetryBtn: {
      minWidth: 56,
      height: 30,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0A84FF',
    },
    statusRetryText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    inlineStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(59,130,246,0.28)' : 'rgba(59,130,246,0.18)',
      backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.06)',
    },
    inlineStatusError: {
      borderColor: isDark ? 'rgba(239,68,68,0.32)' : 'rgba(239,68,68,0.22)',
      backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.06)',
    },
    inlineStatusIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
    },
    inlineStatusBody: {
      flex: 1,
      minWidth: 0,
    },
    inlineStatusTitle: {
      color: T.text,
      fontSize: 13,
      fontWeight: '800',
    },
    inlineStatusText: {
      color: T.textSub,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 2,
    },
    inlineRetryBtn: {
      minWidth: 64,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      backgroundColor: T.accent,
    },
    inlineRetryBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '800',
    },
    statusGate: {
      marginHorizontal: 20,
      marginTop: 40,
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? T.border : T.borderMedium,
      backgroundColor: T.glass1,
    },
    statusGateIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      backgroundColor: T.glass2,
    },
    statusGateTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 10,
    },
    statusGateText: {
      color: T.textSub,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 8,
    },
    retryBtn: {
      backgroundColor: T.accent,
      minWidth: 120,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
      paddingHorizontal: 20,
    },
    retryBtnPressed: {
      opacity: 0.85,
    },
    retryBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
    groupSelector: {
      paddingTop: 0,
      paddingBottom: 12,
      backgroundColor: 'transparent',
    },
    groupSurface: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: borderStrong,
      backgroundColor: surface,
      overflow: 'hidden',
      shadowColor: '#0F172A',
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: isDark ? 0 : 2,
    },
    groupHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    groupHeaderIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(59,130,246,0.14)' : 'rgba(37,99,235,0.10)',
    },
    groupHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    groupSectionLabel: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    groupSectionSubtitle: {
      color: T.text,
      fontSize: 15,
      fontWeight: '800',
      marginTop: 2,
    },
    groupSectionCount: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      overflow: 'hidden',
      textAlign: 'center',
      textAlignVertical: 'center',
      color: T.text,
      fontSize: 12,
      fontWeight: '800',
      backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.14)',
    },
    groupOptions: {
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.08)',
    },
    groupLoadingOption: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    groupLoadingText: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '600',
    },
    groupOption: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 64,
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    groupOptionSelected: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(37,99,235,0.06)',
    },
    groupRadio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: isDark ? 'rgba(148,163,184,0.42)' : 'rgba(100,116,139,0.38)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupRadioSelected: {
      borderColor: T.accent,
      backgroundColor: T.accent,
    },
    groupOptionTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    groupOptionTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    groupOptionName: {
      color: T.text,
      flex: 1,
      fontSize: 14,
      fontWeight: '800',
    },
    groupOptionDescription: {
      color: T.textSub,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 3,
    },
    groupSelectedPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(59,130,246,0.22)' : 'rgba(37,99,235,0.12)',
    },
    groupSelectedPillText: {
      color: T.accent,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    groupOptionDivider: {
      position: 'absolute',
      left: 46,
      right: 0,
      bottom: 0,
      height: 1,
      backgroundColor: isDark ? 'rgba(148,163,184,0.13)' : 'rgba(15,23,42,0.07)',
    },

    formSectionTitle: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0,
      marginTop: 14,
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    formSectionBlock: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      overflow: 'hidden',
      marginBottom: 4,
      shadowColor: '#0F172A',
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: isDark ? 0 : 1,
    },

    inputRow: {
      marginBottom: 11,
    },
    inputRowIcon: {
      width: 22,
      textAlign: 'center',
    },
    inputLabel: {
      color: '#FFFFFF',
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '600',
      marginBottom: 7,
      letterSpacing: 0,
    },
    inputShell: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    input: {
      flex: 1,
      color: '#F8FBFF',
      fontSize: 16,
      fontWeight: '500',
      padding: 0,
      paddingHorizontal: 0,
      margin: 0,
      height: 44,
      minHeight: 44,
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    readonlyValue: {
      flex: 1,
      color: '#F8FBFF',
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'right',
      includeFontPadding: false,
    },
    fieldDivider: {
      height: 1,
      marginLeft: 62,
      backgroundColor: border,
    },

    eyeIconBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    passwordStrengthRow: {
      flexDirection: 'row',
      gap: 4,
      width: 168,
      marginTop: 10,
      marginBottom: 5,
    },
    passwordStrengthBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(100,116,139,0.42)',
    },
    passwordStrengthText: {
      color: '#9AA8BE',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    twoColumnRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginBottom: 11,
    },
    twoColumnCell: {
      flex: 1,
      minWidth: 0,
    },
    selectValue: {
      flex: 1,
      color: '#F8FBFF',
      fontSize: 13,
      fontWeight: '600',
      includeFontPadding: false,
    },
    demoTypeRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      marginBottom: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    demoTypeText: {
      flex: 1,
      color: '#F8FBFF',
      fontSize: 16,
      fontWeight: '600',
    },
    demoTypeAction: {
      width: 48,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(10,132,255,0.70)',
      backgroundColor: 'rgba(10,132,255,0.14)',
    },
    termsRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 2,
      marginBottom: 14,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#0A84FF',
      backgroundColor: 'rgba(10,132,255,0.12)',
    },
    checkboxChecked: {
      backgroundColor: '#0A84FF',
    },
    termsText: {
      flex: 1,
      color: '#B8C4D8',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    linkText: {
      color: '#0A84FF',
      fontWeight: '700',
    },
    registerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2563EB',
      height: 58,
      borderRadius: 8,
      marginTop: 0,
      overflow: 'hidden',
      shadowColor: '#2563EB',
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    registerGradient: {
      flex: 1,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 18,
    },
    registerBtnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    registerBtnDisabled: {
      opacity: 0.55,
      shadowOpacity: 0,
      elevation: 0,
    },
    registerBtnText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 0,
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
