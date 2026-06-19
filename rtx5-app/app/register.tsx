import { FastPressable as Pressable } from '../src/ui/components/FastPressable';
import { Stack, router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  type GestureResponderEvent,
  Linking,
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
import { useUserPreferences } from '../src/state/userPreferences';
import { useThemeMode } from '../src/state/themeMode';
import { useSavedAccounts, setSavedAccountPassword } from '../src/state/savedAccounts';
import { loginAPI } from '../src/api/auth';
import { getBrokerConfig, type BrokerServer } from '../src/api/broker';
import { useTheme, type ThemeColors } from '../src/ui/theme/useTheme';
import { useDeferredRouteContentReady } from '../src/ui/components/DeferredRouteMount';
import { useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../src/query/accounts';
import { BROKER_CONFIG_KEY, useBrokerServers } from '../src/query/broker';
import { useTranslation } from '../src/i18n/useTranslation';
import { getConfiguredPrivacyPolicyUrl, getConfiguredTermsUrl, resolveLegalUrl } from '../src/config/legalLinks';
import {
  ORRNN_DEMO_BROKER_ID,
  ORRNN_DEMO_INITIAL_BALANCE,
  ORRNN_DEMO_ORIGIN_BROKER,
  isOrrnnDemoHealthy,
  resolveOrrnnDemoBrokerAuthRoute,
} from '../src/api/publicDemo';
import {
  useCreateOrrnnDemoAccount,
  useOrrnnDemoGroups,
  useOrrnnDemoStatus,
} from '../src/query/publicDemo';
import { safeRouterBack } from '../src/utils/navigation';
import { isValidEmail, isValidPhoneNumber } from '../src/utils/contactValidation';
import { ActionSheet } from '../src/ui/components/ActionSheet';
import {
  persistAuthSessionTokens,
  persistSelectedBrokerSession,
} from '../src/state/brokerSessionStorage';

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
const REGISTER_QUOTES_LIGHT_BACKGROUND = '#F2F4F8';
const REGISTER_BACK_FALLBACK_HREF = '/settings/brokers';
const DEMO_COUNTRY_OPTIONS = [
  { label: 'United States', code: 'US', dialCode: '+1' },
  { label: 'India', code: 'IN', dialCode: '+91' },
  { label: 'United Kingdom', code: 'GB', dialCode: '+44' },
  { label: 'United Arab Emirates', code: 'AE', dialCode: '+971' },
  { label: 'Canada', code: 'CA', dialCode: '+1' },
  { label: 'Australia', code: 'AU', dialCode: '+61' },
  { label: 'Germany', code: 'DE', dialCode: '+49' },
  { label: 'France', code: 'FR', dialCode: '+33' },
  { label: 'Italy', code: 'IT', dialCode: '+39' },
  { label: 'Spain', code: 'ES', dialCode: '+34' },
  { label: 'Netherlands', code: 'NL', dialCode: '+31' },
  { label: 'Switzerland', code: 'CH', dialCode: '+41' },
  { label: 'Singapore', code: 'SG', dialCode: '+65' },
  { label: 'Malaysia', code: 'MY', dialCode: '+60' },
  { label: 'Indonesia', code: 'ID', dialCode: '+62' },
  { label: 'Thailand', code: 'TH', dialCode: '+66' },
  { label: 'Vietnam', code: 'VN', dialCode: '+84' },
  { label: 'Philippines', code: 'PH', dialCode: '+63' },
  { label: 'Japan', code: 'JP', dialCode: '+81' },
  { label: 'South Korea', code: 'KR', dialCode: '+82' },
  { label: 'China', code: 'CN', dialCode: '+86' },
  { label: 'Hong Kong', code: 'HK', dialCode: '+852' },
  { label: 'South Africa', code: 'ZA', dialCode: '+27' },
  { label: 'Nigeria', code: 'NG', dialCode: '+234' },
  { label: 'Brazil', code: 'BR', dialCode: '+55' },
  { label: 'Mexico', code: 'MX', dialCode: '+52' },
  { label: 'Turkey', code: 'TR', dialCode: '+90' },
  { label: 'Saudi Arabia', code: 'SA', dialCode: '+966' },
] as const;
const DEFAULT_DEMO_COUNTRY = DEMO_COUNTRY_OPTIONS[0];
type DemoCountryCode = (typeof DEMO_COUNTRY_OPTIONS)[number]['code'];

const DEMO_LEVERAGE_MIN = 100;
const DEMO_LEVERAGE_MAX = 20000;
const DEMO_LEVERAGE_STEP = 100;

type DemoLeverageOption = {
  value: number;
  label: `1:${number}`;
};

type RegisterBrokerOption = {
  key: string;
  brokerId: string;
  brokerName: string;
  region: string;
  protocol: string;
};

const DEMO_LEVERAGE_OPTIONS: readonly DemoLeverageOption[] = Array.from(
  { length: (DEMO_LEVERAGE_MAX - DEMO_LEVERAGE_MIN) / DEMO_LEVERAGE_STEP + 1 },
  (_, index) => {
    const value = DEMO_LEVERAGE_MIN + index * DEMO_LEVERAGE_STEP;
    return { value, label: `1:${value}` as const };
  },
);

const normalizeRegisterBrokerKey = (brokerId: string) => brokerId.trim().toLowerCase();

const formatRegisterBrokerOptionSubtitle = (option: RegisterBrokerOption) => (
  [option.brokerId, option.region, option.protocol.toUpperCase()].filter(Boolean).join(' / ')
);

const isDemoLeverageValue = (value: number | null | undefined): value is number => (
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= DEMO_LEVERAGE_MIN &&
  value <= DEMO_LEVERAGE_MAX &&
  value % DEMO_LEVERAGE_STEP === 0
);

const getDefaultDemoLeverage = (groupLeverage: number | null | undefined) => (
  isDemoLeverageValue(groupLeverage) ? groupLeverage : DEMO_LEVERAGE_MIN
);

const formatDemoPhoneForSubmission = (dialCode: string, phoneNumber: string) => {
  const trimmedPhone = phoneNumber.trim();
  if (!trimmedPhone) {
    return undefined;
  }

  return trimmedPhone.startsWith('+') ? trimmedPhone : `${dialCode}${trimmedPhone}`;
};

export default function RegisterScreen() {
  const login = useUserPreferences((s) => s.login);
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
  const {
    data: brokerServers = [],
    isLoading: isBrokerServersLoading,
    isFetching: isBrokerServersFetching,
    refetch: refetchBrokerServers,
  } = useBrokerServers(isScreenFocused);
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
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState<DemoCountryCode>(DEFAULT_DEMO_COUNTRY.code);
  const [phoneCountryPickerOpen, setPhoneCountryPickerOpen] = useState(false);
  const [selectedLeverageValue, setSelectedLeverageValue] = useState<number | null>(null);
  const [leveragePickerOpen, setLeveragePickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [investorPassword, setInvestorPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState(String(ORRNN_DEMO_INITIAL_BALANCE));
  const [originBroker, setOriginBroker] = useState(ORRNN_DEMO_ORIGIN_BROKER ?? '');
  const [originBrokerPickerOpen, setOriginBrokerPickerOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showInvestorPassword, setShowInvestorPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = React.useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const fieldYPositionsRef = React.useRef<Partial<Record<RegisterFieldKey, number>>>({});
  const fieldFocusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerBackNavigationStartedRef = React.useRef(false);

  const themeMode = useThemeMode();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  // Defer the heavy form mount by ~2 frames so opening "New Account" shows the
  // modal backdrop instantly instead of freezing while the whole form mounts.
  const contentReady = useDeferredRouteContentReady(0);
  const privacyPolicyUrl = resolveLegalUrl(
    getConfiguredPrivacyPolicyUrl(),
    'https://rtx5.orrnn.com/privacy-policy',
  );
  const termsConditionsUrl = resolveLegalUrl(
    getConfiguredTermsUrl(),
    'https://rtx5.orrnn.com/terms-conditions',
  );

  React.useEffect(() => () => {
    if (fieldFocusTimerRef.current) {
      clearTimeout(fieldFocusTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (isScreenFocused) {
      registerBackNavigationStartedRef.current = false;
    }
  }, [isScreenFocused]);

  const handleRegisterBack = React.useCallback((event: GestureResponderEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (registerBackNavigationStartedRef.current) {
      return;
    }

    registerBackNavigationStartedRef.current = true;
    safeRouterBack(router, REGISTER_BACK_FALLBACK_HREF);
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

  const handleOpenPrivacyPolicy = React.useCallback(() => {
    void Linking.openURL(privacyPolicyUrl).catch(() => {
      Alert.alert(t('Privacy Policy'), privacyPolicyUrl);
    });
  }, [privacyPolicyUrl, t]);

  const handleOpenTermsAndConditions = React.useCallback(() => {
    void Linking.openURL(termsConditionsUrl).catch(() => {
      Alert.alert(t('Terms and Conditions'), termsConditionsUrl);
    });
  }, [termsConditionsUrl, t]);

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
    const selectedCountry = DEMO_COUNTRY_OPTIONS.find((option) => option.label === country);
    const selectedPhoneCountry =
      DEMO_COUNTRY_OPTIONS.find((option) => option.code === phoneCountryCode) ?? DEFAULT_DEMO_COUNTRY;
    const trimmedCountry = selectedCountry?.code ?? country.trim().toUpperCase();
    const trimmedOriginBroker = originBroker.trim();
    const parsedInitialBalance = Number(initialBalance);
    const submissionPhone = formatDemoPhoneForSubmission(selectedPhoneCountry.dialCode, trimmedPhone);
    const effectiveCurrency = selectedDemoGroup.currency;
    const effectiveLeverage = selectedLeverageValue ?? getDefaultDemoLeverage(selectedDemoGroup.leverage);

    if (!trimmedFirstName || !trimmedEmail || !password || !investorPassword || !trimmedCountry) {
      Alert.alert(t('Error'), t('Please fill in all required fields'));
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      Alert.alert(t('Error'), t('Please enter a valid email address (e.g. you@example.com)'));
      return;
    }

    if (trimmedPhone && !isValidPhoneNumber(submissionPhone ?? trimmedPhone)) {
      Alert.alert(t('Error'), t('Please enter a valid phone number (digits only, 7-15 digits)'));
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
        last_name: trimmedLastName || undefined,
        phone: submissionPhone,
        country: trimmedCountry,
        currency: effectiveCurrency,
        leverage: effectiveLeverage,
        initial_balance: parsedInitialBalance,
        origin_broker: trimmedOriginBroker || undefined,
      });

      // Use the broker_id from the API response as canonical
      const canonicalBrokerId = response.broker_id || ORRNN_DEMO_BROKER_ID;
      let demoAuthRoute = resolveOrrnnDemoBrokerAuthRoute(canonicalBrokerId, brokerServers);
      if (demoAuthRoute.source !== 'broker-directory') {
        const refreshedBrokerServers = await refetchBrokerServers()
          .then((result) => result.data ?? [])
          .catch(() => []);
        const refreshedDemoAuthRoute = resolveOrrnnDemoBrokerAuthRoute(canonicalBrokerId, refreshedBrokerServers);
        if (refreshedDemoAuthRoute.source === 'broker-directory' || !demoAuthRoute.serverUrl) {
          demoAuthRoute = refreshedDemoAuthRoute;
        }
      }
      if (!demoAuthRoute.serverUrl) {
        throw new Error(t('Demo account was created, but the Orrnn broker login server was not found.'));
      }

      const accountName = `${trimmedFirstName} ${trimmedLastName}`.trim();
      let sessionLogin = response.login;
      let sessionToken = response.api_key ?? '';
      let sessionRefreshToken = '';
      let sessionExpiresAt = new Date(Date.now() + 86400 * 1000).toISOString();

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
        }, {
          serverUrl: demoAuthRoute.serverUrl,
          proxyServer: demoAuthRoute.proxyServer,
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
        {
          serverUrl: demoAuthRoute.serverUrl,
          logoUrl: demoAuthRoute.logoUrl,
          isDemoAccount: true,
        },
      );
      void Promise.all([
        persistSelectedBrokerSession({
          brokerId: canonicalBrokerId,
          serverUrl: demoAuthRoute.serverUrl,
          logoUrl: demoAuthRoute.logoUrl,
        }),
        persistAuthSessionTokens({
          accessToken: sessionToken,
          refreshToken: sessionRefreshToken,
          expiresAt: sessionExpiresAt,
        }),
      ]).catch((err) => {
        console.warn('[Register] Failed to persist secure broker session', err);
      });

      // Persist the new demo account in the directory + secure-store the
      // master password so the user can switch back to it from the Accounts
      // screen without re-typing credentials.
      const savedLogin = String(sessionLogin);
      upsertSavedAccount({
        login: savedLogin,
        name: accountName,
        brokerId: canonicalBrokerId,
        server: brokerConfig?.server_name || canonicalBrokerId,
        serverUrl: demoAuthRoute.serverUrl,
        logoUrl: demoAuthRoute.logoUrl,
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
  const visiblePasswordStrengthScore = password ? passwordStrengthScore : 0;
  const passwordStrengthLabel = !password
    ? ''
    : passwordStrengthScore >= 3
    ? t('Strong')
    : passwordStrengthScore >= 2
      ? t('Medium')
      : t('Weak');
  const passwordStrengthColor = !password
    ? '#64748B'
    : passwordStrengthScore >= 3
      ? '#22C55E'
      : passwordStrengthScore >= 2
        ? '#F59E0B'
        : '#EF4444';
  const selectedCurrency = selectedDemoGroup?.currency || 'USD';
  const selectedLeverage = selectedLeverageValue ?? getDefaultDemoLeverage(selectedDemoGroup?.leverage);
  const selectedPhoneCountry =
    DEMO_COUNTRY_OPTIONS.find((option) => option.code === phoneCountryCode) ?? DEFAULT_DEMO_COUNTRY;
  const originBrokerOptions = React.useMemo<RegisterBrokerOption[]>(() => {
    const rows = [...brokerServers]
      .filter((broker: BrokerServer) => broker.enabled !== false && !!broker.broker_id?.trim())
      .sort((a, b) => {
        const aName = a.broker_name?.trim() || a.broker_id;
        const bName = b.broker_name?.trim() || b.broker_id;
        const byName = aName.localeCompare(bName);
        if (byName !== 0) return byName;
        return a.id - b.id;
      });
    const seen = new Set<string>();
    const options: RegisterBrokerOption[] = [];

    for (const broker of rows) {
      const brokerId = broker.broker_id.trim();
      const key = normalizeRegisterBrokerKey(brokerId);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      options.push({
        key,
        brokerId,
        brokerName: broker.broker_name?.trim() || brokerId,
        region: broker.region?.trim() || '',
        protocol: broker.protocol?.trim() || '',
      });
    }

    return options;
  }, [brokerServers]);
  const selectedOriginBrokerOption = React.useMemo(() => {
    const selectedKey = normalizeRegisterBrokerKey(originBroker);
    if (!selectedKey) {
      return undefined;
    }

    return originBrokerOptions.find((option) => option.key === selectedKey);
  }, [originBroker, originBrokerOptions]);
  const originBrokerDisplayValue =
    selectedOriginBrokerOption?.brokerName || originBroker || t('Select broker');
  const countryPickerActions = React.useMemo(
    () => DEMO_COUNTRY_OPTIONS.map((option) => ({
      label: t(option.label),
      subtitle: `${option.code} ${option.dialCode}`,
      onPress: () => {
        setCountry(option.label);
        setPhoneCountryCode(option.code);
      },
    })),
    [t],
  );
  const phoneCountryPickerActions = React.useMemo(
    () => DEMO_COUNTRY_OPTIONS.map((option) => ({
      label: `${option.dialCode} ${t(option.label)}`,
      subtitle: option.code,
      onPress: () => setPhoneCountryCode(option.code),
    })),
    [t],
  );
  const handleOpenCountryPicker = React.useCallback(() => {
    Keyboard.dismiss();
    handleFieldFocus('country');
    setCountryPickerOpen(true);
  }, [handleFieldFocus]);
  const handleOpenPhoneCountryPicker = React.useCallback(() => {
    Keyboard.dismiss();
    handleFieldFocus('phone');
    setPhoneCountryPickerOpen(true);
  }, [handleFieldFocus]);
  const leveragePickerActions = React.useMemo(
    () => DEMO_LEVERAGE_OPTIONS.map((option) => ({
      label: option.label,
      subtitle: option.value === selectedDemoGroup?.leverage ? t('Group default') : undefined,
      onPress: () => setSelectedLeverageValue(option.value),
    })),
    [selectedDemoGroup?.leverage, t],
  );
  const originBrokerPickerActions = React.useMemo(() => {
    if (originBrokerOptions.length === 0) {
      const isBusy = isBrokerServersLoading || isBrokerServersFetching;
      return [{
        label: isBusy ? t('Loading brokers...') : t('Retry broker list'),
        subtitle: isBusy
          ? t('Please wait while the broker list loads.')
          : t('Broker list is unavailable. Try loading it again.'),
        disabled: isBusy,
        onPress: () => {
          void refetchBrokerServers();
        },
      }];
    }

    return originBrokerOptions.map((option) => ({
      label: option.brokerName,
      subtitle: formatRegisterBrokerOptionSubtitle(option),
      onPress: () => setOriginBroker(option.brokerId),
    }));
  }, [
    isBrokerServersFetching,
    isBrokerServersLoading,
    originBrokerOptions,
    refetchBrokerServers,
    t,
  ]);
  const groupPickerActions = React.useMemo(
    () => demoGroupOptions.map((group) => ({
      label: group.name,
      subtitle: `${group.currency} / 1:${group.leverage}`,
      onPress: () => {
        setSelectedGroupName(group.name);
        setSelectedLeverageValue(getDefaultDemoLeverage(group.leverage));
      },
    })),
    [demoGroupOptions],
  );
  const handleOpenLeveragePicker = React.useCallback(() => {
    Keyboard.dismiss();
    setLeveragePickerOpen(true);
  }, []);
  const handleOpenOriginBrokerPicker = React.useCallback(() => {
    Keyboard.dismiss();
    handleFieldFocus('originBroker');
    if (originBrokerOptions.length === 0 && !isBrokerServersLoading && !isBrokerServersFetching) {
      void refetchBrokerServers();
    }
    setOriginBrokerPickerOpen(true);
  }, [
    handleFieldFocus,
    isBrokerServersFetching,
    isBrokerServersLoading,
    originBrokerOptions.length,
    refetchBrokerServers,
  ]);
  const handleOpenGroupPicker = React.useCallback(() => {
    if (demoGroupOptions.length === 0) {
      return;
    }

    Keyboard.dismiss();
    setGroupPickerOpen(true);
  }, [demoGroupOptions.length]);
  const fieldIconColor = isDark ? '#A7B4CC' : T.textMuted;
  const fieldPlaceholderColor = isDark ? '#8EA0BA' : T.textMuted;
  const strongPlaceholderColor = isDark ? '#EAF2FF' : T.text;
  const fieldAccentColor = isDark ? '#22A8FF' : T.trading.buy.primary;
  const heroBackIconColor = isDark ? '#DCEBFF' : T.text;
  const noticeIconColor = isDark ? '#38BDF8' : T.trading.buy.primary;
  const autofillBackgroundColor = isDark ? T.bg : REGISTER_QUOTES_LIGHT_BACKGROUND;

  if (!contentReady) {
    // Backdrop-only first paint: the modal appears immediately; the form below
    // mounts on the next frames without blocking the open.
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.bg} />
      </>
    );
  }

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
              -webkit-box-shadow: 0 0 0 1000px ${autofillBackgroundColor} inset !important;
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
                <View style={styles.heroTitleRow}>
                  <Pressable
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={handleRegisterBack}
                    activateOnPressIn
                    latencyLabel="register.back"
                    unstable_pressDelay={0}
                    style={styles.heroBackButton}
                  >
                    <Ionicons name="arrow-back" size={26} color={heroBackIconColor} />
                  </Pressable>
                  <Text
                    style={styles.heroTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {t('Demo Trading Account')}
                  </Text>
                </View>
                <Text style={styles.heroSubtitle}>
                  {t('Create a practice account and start trading in minutes.')}
                </Text>
              </View>

              {isDemoSetupUnavailable && (
                <View style={styles.statusNotice}>
                  <Ionicons
                    name={isDemoServiceUnavailable ? 'cloud-offline-outline' : 'list-outline'}
                    size={18}
                    color={noticeIconColor}
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
                  <Ionicons name="person-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={firstName}
                    onChangeText={setFirstName}
                    onFocus={() => handleFieldFocus('firstName')}
                    placeholder={t('First name')}
                    placeholderTextColor={fieldPlaceholderColor}
                    autoCapitalize="words"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
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
                  <Ionicons name="id-card-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={lastName}
                    onChangeText={setLastName}
                    onFocus={() => handleFieldFocus('lastName')}
                    placeholder={t('Last name')}
                    placeholderTextColor={fieldPlaceholderColor}
                    autoCapitalize="words"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
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
                  <Ionicons name="mail-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => handleFieldFocus('email')}
                    placeholder={t('you@example.com')}
                    placeholderTextColor={fieldPlaceholderColor}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
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
                  <Ionicons name="call-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.phoneCodeButton,
                      pressed && styles.inputShellPressed,
                    ]}
                    onPress={handleOpenPhoneCountryPicker}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    latencyLabel="register.phoneCountry.open"
                    accessibilityRole="button"
                    accessibilityLabel={t('Phone country code')}
                    accessibilityState={{ expanded: phoneCountryPickerOpen }}
                  >
                    <Text style={styles.phoneCodeText} numberOfLines={1}>
                      {selectedPhoneCountry.dialCode}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={fieldIconColor} />
                  </Pressable>
                  <View style={styles.phoneCodeDivider} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => handleFieldFocus('phone')}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={fieldPlaceholderColor}
                    keyboardType="phone-pad"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
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
                <Pressable
                  style={({ pressed }) => [
                    styles.inputShell,
                    pressed && styles.inputShellPressed,
                  ]}
                  onPress={handleOpenCountryPicker}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  latencyLabel="register.country.open"
                  accessibilityRole="button"
                  accessibilityLabel={t('Country')}
                  accessibilityState={{ expanded: countryPickerOpen }}
                >
                  <Ionicons name="earth-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <Text style={styles.selectValue} numberOfLines={1}>
                    {t(country)}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={fieldIconColor} />
                </Pressable>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('password')}>
                <Text style={styles.inputLabel}>{t('Master password')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => handleFieldFocus('password')}
                    placeholder={t('Master password')}
                    placeholderTextColor={fieldPlaceholderColor}
                    autoCapitalize="none"
                    secureTextEntry={!showPassword}
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={15} style={styles.eyeIconBtn}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color={fieldIconColor} />
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
                  <Ionicons name="lock-closed-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={investorPassword}
                    onChangeText={setInvestorPassword}
                    onFocus={() => handleFieldFocus('investorPassword')}
                    placeholder={t('Investor password')}
                    placeholderTextColor={fieldPlaceholderColor}
                    autoCapitalize="none"
                    secureTextEntry={!showInvestorPassword}
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                  <Pressable onPress={() => setShowInvestorPassword(!showInvestorPassword)} hitSlop={15} style={styles.eyeIconBtn}>
                    <Ionicons name={showInvestorPassword ? "eye-off-outline" : "eye-outline"} size={21} color={fieldIconColor} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.twoColumnCell}>
                  <Text style={styles.inputLabel}>{t('Currency')}</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="cash-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                    <Text style={styles.selectValue} numberOfLines={1}>{selectedCurrency}</Text>
                  </View>
                </View>

                <View style={styles.twoColumnCell}>
                  <Text style={styles.inputLabel}>{t('Leverage')}</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.inputShell,
                      pressed && styles.inputShellPressed,
                    ]}
                    onPress={handleOpenLeveragePicker}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    latencyLabel="register.leverage.open"
                    accessibilityRole="button"
                    accessibilityLabel={t('Leverage')}
                    accessibilityState={{ expanded: leveragePickerOpen }}
                  >
                    <Ionicons name="speedometer-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                    <Text style={styles.selectValue} numberOfLines={1}>
                      {selectedLeverage ? `1:${selectedLeverage}` : '--'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={fieldIconColor} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('initialBalance')}>
                <Text style={styles.inputLabel}>{t('Initial balance')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="wallet-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={initialBalance}
                    onChangeText={setInitialBalance}
                    onFocus={() => handleFieldFocus('initialBalance')}
                    keyboardType="numeric"
                    placeholder="10000"
                    placeholderTextColor={strongPlaceholderColor}
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
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
                <Pressable
                  style={({ pressed }) => [
                    styles.inputShell,
                    pressed && styles.inputShellPressed,
                  ]}
                  onPress={handleOpenOriginBrokerPicker}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  latencyLabel="register.originBroker.open"
                  accessibilityRole="button"
                  accessibilityLabel={t('Origin broker')}
                  accessibilityState={{ expanded: originBrokerPickerOpen }}
                >
                  <Ionicons name="business-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <Text style={styles.selectValue} numberOfLines={1}>
                    {originBrokerDisplayValue}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={fieldIconColor} />
                </Pressable>
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Group')}</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.inputShell,
                    pressed && styles.inputShellPressed,
                  ]}
                  onPress={handleOpenGroupPicker}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  latencyLabel="register.group.open"
                  accessibilityRole="button"
                  accessibilityLabel={t('Group')}
                  accessibilityState={{
                    expanded: groupPickerOpen,
                    disabled: demoGroupOptions.length === 0,
                  }}
                  disabled={demoGroupOptions.length === 0}
                >
                  <Ionicons name="shield-checkmark-outline" size={21} color={fieldAccentColor} style={styles.inputRowIcon} />
                  <Text style={styles.selectValue} numberOfLines={1}>
                    {selectedDemoGroup?.name ?? t('Demo groups unavailable')}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={fieldIconColor} />
                </Pressable>
              </View>

              <View style={styles.termsRow}>
                <Pressable
                  onPress={() => setTermsAccepted((value) => !value)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                    {termsAccepted && <Ionicons name="checkmark" size={17} color="#ffffff" />}
                  </View>
                </Pressable>
                <Text style={styles.termsText}>
                  {t('I agree to the')}{' '}
                  <Text
                    style={styles.linkText}
                    onPress={handleOpenTermsAndConditions}
                  >
                    {t('Terms and Conditions')}
                  </Text>
                  {' '}{t('and')}{' '}
                  <Text
                    style={styles.linkText}
                    onPress={handleOpenPrivacyPolicy}
                  >
                    {t('Privacy Policy')}
                  </Text>
                  .
                </Text>
              </View>

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

        <ActionSheet
          visible={countryPickerOpen}
          title={t('Country')}
          actions={countryPickerActions}
          onClose={() => setCountryPickerOpen(false)}
          searchable
          searchPlaceholder={t('Search countries...')}
          detent="large"
          instantOpen
          runActionAfterClose={false}
          androidKeyboardAvoidance="resize"
        />
        <ActionSheet
          visible={phoneCountryPickerOpen}
          title={t('Phone country code')}
          actions={phoneCountryPickerActions}
          onClose={() => setPhoneCountryPickerOpen(false)}
          searchable
          searchPlaceholder={t('Search country codes...')}
          detent="large"
          instantOpen
          runActionAfterClose={false}
          androidKeyboardAvoidance="resize"
        />
        <ActionSheet
          visible={leveragePickerOpen}
          title={t('Leverage')}
          actions={leveragePickerActions}
          onClose={() => setLeveragePickerOpen(false)}
          searchable
          searchPlaceholder={t('Search leverage...')}
          detent="large"
          instantOpen
          runActionAfterClose={false}
          androidKeyboardAvoidance="resize"
        />
        <ActionSheet
          visible={originBrokerPickerOpen}
          title={t('Origin broker')}
          actions={originBrokerPickerActions}
          onClose={() => setOriginBrokerPickerOpen(false)}
          searchable={originBrokerOptions.length > 0}
          searchPlaceholder={t('Search brokers...')}
          detent="large"
          instantOpen
          runActionAfterClose={false}
          androidKeyboardAvoidance="resize"
        />
        <ActionSheet
          visible={groupPickerOpen}
          title={t('Group')}
          actions={groupPickerActions}
          onClose={() => setGroupPickerOpen(false)}
          searchable
          searchPlaceholder={t('Search groups...')}
          detent="large"
          instantOpen
          runActionAfterClose={false}
          androidKeyboardAvoidance="resize"
        />
      </View>
    </>
  );
}

// Dynamic theme + register layout.
function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  const pageBg = isDark ? '#020B18' : REGISTER_QUOTES_LIGHT_BACKGROUND;
  const surface = isDark ? 'rgba(7,23,44,0.74)' : '#FFFFFF';
  const border = isDark ? 'rgba(128,166,211,0.34)' : '#DFE7F1';
  const borderStrong = isDark ? 'rgba(34,168,255,0.56)' : '#D8E2EF';
  const primaryBlue = T.trading.buy.primary;
  const heroTitleColor = isDark ? '#FFFFFF' : T.text;
  const secondaryText = isDark ? '#B8C4D8' : T.textSub;
  const fieldText = isDark ? '#F8FBFF' : T.text;
  const mutedText = isDark ? '#9AA8BE' : T.textMuted;
  const statusBg = isDark ? 'rgba(9,31,58,0.78)' : '#FFFFFF';
  const statusBorder = isDark ? 'rgba(34,168,255,0.36)' : '#D8E2EF';
  const actionTintBg = isDark ? 'rgba(10,132,255,0.14)' : 'rgba(37,99,235,0.08)';

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
      paddingTop: 18,
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
      paddingBottom: 14,
      marginBottom: 2,
    },
    heroTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 9,
    },
    heroTitle: {
      color: heroTitleColor,
      fontSize: 26,
      lineHeight: 32,
      fontWeight: '900',
      letterSpacing: 0,
      flex: 1,
      marginBottom: 0,
    },
    heroBackButton: {
      alignSelf: 'flex-start',
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      backgroundColor: 'transparent',
    },
    heroSubtitle: {
      color: secondaryText,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      marginLeft: 0,
      marginBottom: 0,
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
      borderColor: statusBorder,
      backgroundColor: statusBg,
    },
    statusNoticeText: {
      flex: 1,
      color: secondaryText,
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
      backgroundColor: primaryBlue,
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
      color: heroTitleColor,
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
    inputShellPressed: {
      opacity: 0.86,
    },
    phoneCodeButton: {
      minWidth: 54,
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 5,
      borderRadius: 7,
      backgroundColor: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)',
    },
    phoneCodeText: {
      color: fieldText,
      fontSize: 14,
      fontWeight: '800',
      includeFontPadding: false,
    },
    phoneCodeDivider: {
      width: 1,
      height: 28,
      backgroundColor: border,
    },
    input: {
      flex: 1,
      color: fieldText,
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
      color: fieldText,
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
      color: mutedText,
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
      color: fieldText,
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
      color: fieldText,
      fontSize: 16,
      fontWeight: '600',
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
      borderColor: primaryBlue,
      backgroundColor: actionTintBg,
    },
    checkboxChecked: {
      backgroundColor: primaryBlue,
    },
    termsText: {
      flex: 1,
      color: secondaryText,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    linkText: {
      color: primaryBlue,
      fontWeight: '700',
    },
    registerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primaryBlue,
      height: 58,
      borderRadius: 8,
      marginTop: 0,
      overflow: 'hidden',
      shadowColor: primaryBlue,
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
