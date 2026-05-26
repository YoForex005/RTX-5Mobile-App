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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../src/state/userPreferences';
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

export default function RegisterScreen() {
  const login = useUserPreferences((s) => s.login);
  const setIsDemoAccount = useUserPreferences((s) => s.setIsDemoAccount);
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
  const registerButtonLabel = isPreparingDemoAccount
    ? t('PREPARING...')
    : isDemoSetupUnavailable
      ? t('SERVICE UNAVAILABLE')
      : t('REGISTER');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [investorPassword, setInvestorPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState(String(ORRNN_DEMO_INITIAL_BALANCE));
  const [originBroker, setOriginBroker] = useState(ORRNN_DEMO_ORIGIN_BROKER ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [showInvestorPassword, setShowInvestorPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = React.useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const fieldYPositionsRef = React.useRef<Partial<Record<RegisterFieldKey, number>>>({});
  const fieldFocusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const themeMode = useThemeMode();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = makeStyles(T, isDark, insets.top);

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
    const trimmedCountry = country.trim().toUpperCase();
    const trimmedOriginBroker = originBroker.trim();
    const parsedInitialBalance = Number(initialBalance);

    if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !password || !investorPassword || !trimmedCountry) {
      Alert.alert(t('Error'), t('Please fill in all required fields'));
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
        canonicalBrokerId
      );
      setIsDemoAccount(true);

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
            onPress={() => safeRouterBack(router, '/login')}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Register a demo account')}</Text>
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            ref={scrollViewRef}
            canCancelContentTouches={false}
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="always"
          >

            <View style={styles.formContainer}>

              {/* Non-blocking readiness banner keeps the first render instant. */}
              {(isPreparingDemoAccount || isDemoSetupUnavailable) && (
                <View style={[
                  styles.inlineStatus,
                  isDemoSetupUnavailable && styles.inlineStatusError,
                ]}>
                  <View style={styles.inlineStatusIcon}>
                    {isPreparingDemoAccount ? (
                      <ActivityIndicator size="small" color={T.accent} />
                    ) : (
                      <Ionicons
                        name={isDemoServiceUnavailable ? 'cloud-offline-outline' : 'list-outline'}
                        size={18}
                        color={isDemoSetupUnavailable ? '#EF4444' : T.accent}
                      />
                    )}
                  </View>
                  <View style={styles.inlineStatusBody}>
                    <Text style={styles.inlineStatusTitle}>
                      {isPreparingDemoAccount
                        ? t('Preparing demo account details')
                        : t('Demo accounts are temporarily unavailable')}
                    </Text>
                    <Text style={styles.inlineStatusText}>
                      {isPreparingDemoAccount
                        ? t('You can start filling the form while RTX5 loads the live demo groups.')
                        : isDemoServiceUnavailable
                          ? (demoStatusError?.message || t('The Orrnn demo broker is not ready for account creation.'))
                          : (demoGroupsError?.message || t('No Orrnn demo group is available for account creation.'))}
                    </Text>
                  </View>
                  {isDemoSetupUnavailable && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.inlineRetryBtn,
                        (pressed || isRetryingDemoSetup) && styles.retryBtnPressed,
                      ]}
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
                        <Text style={styles.inlineRetryBtnText}>{t('Retry')}</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              )}

              {/* Group Field */}
              <View style={styles.groupSelector}>
                <View style={styles.groupHeaderRow}>
                  <Text style={styles.groupSectionLabel}>{t('Group')}</Text>
                  <Text style={styles.groupSectionCount}>{demoGroups?.count ?? demoGroupOptions.length}</Text>
                </View>
                <View style={styles.groupOptions}>
                  {demoGroupOptions.length > 0 ? demoGroupOptions.map((group) => {
                    const isSelected = group.name === selectedDemoGroup?.name;
                    return (
                      <Pressable
                        key={group.name}
                        style={[
                          styles.groupOption,
                          isSelected && styles.groupOptionSelected,
                        ]}
                        onPress={() => setSelectedGroupName(group.name)}
                      >
                        <View style={styles.groupOptionTextWrap}>
                          <View style={styles.groupOptionTopRow}>
                            <Text style={styles.groupOptionName} numberOfLines={1}>{group.name}</Text>
                            <View style={isSelected ? styles.groupSelectedPill : styles.groupDemoPill}>
                              <Ionicons
                                name={isSelected ? 'checkmark' : 'server-outline'}
                                size={12}
                                color={isSelected ? '#ffffff' : T.textMuted}
                              />
                              <Text style={isSelected ? styles.groupSelectedPillText : styles.groupDemoPillText}>
                                {isSelected ? t('Selected') : t('Demo')}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.groupOptionDescription} numberOfLines={2}>
                            {group.description}
                          </Text>
                          <View style={styles.groupMetricRow}>
                            <View style={styles.groupMetricChip}>
                              <Text style={styles.groupMetricLabel}>{t('Currency')}</Text>
                              <Text style={styles.groupMetricValue}>{group.currency}</Text>
                            </View>
                            <View style={styles.groupMetricChip}>
                              <Text style={styles.groupMetricLabel}>{t('Leverage')}</Text>
                              <Text style={styles.groupMetricValue}>1:{group.leverage}</Text>
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    );
                  }) : (
                    <View style={styles.groupLoadingOption}>
                      {isPreparingDemoAccount ? (
                        <ActivityIndicator size="small" color={T.accent} />
                      ) : (
                        <Ionicons name="server-outline" size={18} color={T.textMuted} />
                      )}
                      <Text style={styles.groupLoadingText}>
                        {isPreparingDemoAccount ? t('Loading available demo groups...') : t('Demo groups unavailable')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.fieldDivider} />

              {/* Currency Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Currency')}</Text>
                <Text style={styles.readonlyValue}>{selectedDemoGroup?.currency ?? '--'}</Text>
              </View>
              <View style={styles.fieldDivider} />

              {/* Leverage Field */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Leverage')}</Text>
                <Text style={styles.readonlyValue}>{selectedDemoGroup?.leverage ? `1:${selectedDemoGroup.leverage}` : '--'}</Text>
              </View>
              <View style={styles.fieldDivider} />

              {/* First name Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('firstName')}>
                <Text style={styles.inputLabel}>{t('First name')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={firstName}
                  onChangeText={setFirstName}
                  onFocus={() => handleFieldFocus('firstName')}
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

              {/* Last name Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('lastName')}>
                <Text style={styles.inputLabel}>{t('Last name')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={lastName}
                  onChangeText={setLastName}
                  onFocus={() => handleFieldFocus('lastName')}
                  autoCapitalize="words"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="name-family"
                  textContentType="familyName"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>
              <View style={styles.fieldDivider} />

              {/* Email Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('email')}>
                <Text style={styles.inputLabel}>{t('Email')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => handleFieldFocus('email')}
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

              {/* Phone Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('phone')}>
                <Text style={styles.inputLabel}>{t('Phone')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={phone}
                  onChangeText={setPhone}
                  onFocus={() => handleFieldFocus('phone')}
                  keyboardType="phone-pad"
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>
              <View style={styles.fieldDivider} />

              {/* Country Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('country')}>
                <Text style={styles.inputLabel}>{t('Country')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={country}
                  onChangeText={setCountry}
                  onFocus={() => handleFieldFocus('country')}
                  autoCapitalize="characters"
                  maxLength={2}
                  selectionColor={T.accent}
                  cursorColor={T.accent}
                  underlineColorAndroid="transparent"
                  importantForAutofill={"no" as any}
                  autoComplete="off"
                  textContentType="countryName"
                  spellCheck={false}
                  autoCorrect={false}
                  disableFullscreenUI={true}
                />
              </View>
              <View style={styles.fieldDivider} />

              {/* Master Password Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('password')}>
                <Text style={styles.inputLabel}>{t('Master password')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => handleFieldFocus('password')}
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

              {/* Investor Password Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('investorPassword')}>
                <Text style={styles.inputLabel}>{t('Investor password')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={investorPassword}
                  onChangeText={setInvestorPassword}
                  onFocus={() => handleFieldFocus('investorPassword')}
                  autoCapitalize="none"
                  secureTextEntry={!showInvestorPassword}
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
                <Pressable onPress={() => setShowInvestorPassword(!showInvestorPassword)} hitSlop={15} style={styles.eyeIconBtn}>
                  <Ionicons name={showInvestorPassword ? "eye-off-outline" : "eye-outline"} size={20} color={T.textSub} />
                </Pressable>
              </View>
              <View style={styles.fieldDivider} />

              {/* Initial balance Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('initialBalance')}>
                <Text style={styles.inputLabel}>{t('Initial balance')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={initialBalance}
                  onChangeText={setInitialBalance}
                  onFocus={() => handleFieldFocus('initialBalance')}
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

              {/* Origin broker Field */}
              <View style={styles.inputRow} onLayout={handleFieldLayout('originBroker')}>
                <Text style={styles.inputLabel}>{t('Origin broker')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
                  value={originBroker}
                  onChangeText={setOriginBroker}
                  onFocus={() => handleFieldFocus('originBroker')}
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

              <Pressable
                style={({ pressed }) => [
                  styles.registerBtn,
                  (!canSubmitDemoAccount || isLoading) && styles.registerBtnDisabled,
                  (pressed && canSubmitDemoAccount) && styles.registerBtnPressed
                ]}
                onPress={handleRegister}
                disabled={isLoading || !canSubmitDemoAccount}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.registerBtnText}>{registerButtonLabel}</Text>
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
      backgroundColor: T.bg,
      zIndex: 10,
      elevation: 4,
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
      paddingBottom: REGISTER_KEYBOARD_BOTTOM_PADDING,
    },

    formContainer: {
      paddingHorizontal: 20,
      marginTop: 6,
    },
    inlineStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
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
    groupHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    groupSectionLabel: {
      color: T.text,
      fontSize: 14,
      fontWeight: '700',
    },
    groupSectionCount: {
      minWidth: 24,
      height: 24,
      borderRadius: 8,
      overflow: 'hidden',
      textAlign: 'center',
      textAlignVertical: 'center',
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '800',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    },
    groupOptions: {
      gap: 6,
    },
    groupLoadingOption: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: isDark ? T.border : T.borderMedium,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    },
    groupLoadingText: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '600',
    },
    groupOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? T.border : T.borderMedium,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    },
    groupOptionSelected: {
      borderColor: T.accent,
      backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.06)',
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
      fontSize: 11,
      lineHeight: 14,
      marginTop: 3,
    },
    groupSelectedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: T.accent,
    },
    groupSelectedPillText: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    groupDemoPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    },
    groupDemoPillText: {
      color: T.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    groupMetricRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 7,
    },
    groupMetricChip: {
      flex: 1,
      minHeight: 34,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)',
    },
    groupMetricLabel: {
      color: T.textMuted,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    groupMetricValue: {
      color: T.text,
      fontSize: 13,
      fontWeight: '800',
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
      fontSize: 14,
      fontWeight: '500',
      width: 145,
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
    readonlyValue: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'right',
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
    registerBtnDisabled: {
      opacity: 0.55,
      shadowOpacity: 0,
      elevation: 0,
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
