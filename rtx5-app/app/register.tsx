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
import { extractFeedBrokerToken } from '../src/api/feedAuth';
import { getBrokerConfig } from '../src/api/broker';
import { useTheme, type ThemeColors } from '../src/ui/theme/useTheme';
import { useDeferredActiveFlag } from '../src/hooks/useDeferredActiveFlag';
import { useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../src/query/accounts';
import { BROKER_CONFIG_KEY, useBrokerServers } from '../src/query/broker';
import { useTranslation } from '../src/i18n/useTranslation';
import { getConfiguredPrivacyPolicyUrl, getConfiguredTermsUrl, resolveLegalUrl } from '../src/config/legalLinks';
import {
  ORRNN_DEMO_BROKER_ID,
  ORRNN_DEMO_INITIAL_BALANCE,
  ORRNN_DEMO_ORIGIN_BROKER,
  ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME,
  ORRNN_DEMO_ORIGIN_BROKER_LABEL,
  TEST_ORRNN_DEMO_ORIGIN_BROKER,
  TEST_ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME,
  TEST_ORRNN_DEMO_ORIGIN_BROKER_LABEL,
  isOrrnnDemoHealthy,
  resolveOrrnnDemoBrokerAuthRoute,
} from '../src/api/publicDemo';
import {
  useCreateOrrnnDemoAccount,
  useOrrnnDemoGroups,
  useOrrnnDemoStatus,
} from '../src/query/publicDemo';
import { notifyRegisterScreenReady } from '../src/features/settings/registerHandoffState';
import { safeRouterBack } from '../src/utils/navigation';
import { isValidEmail, isValidPhoneNumber } from '../src/utils/contactValidation';
import { ActionSheet } from '../src/ui/components/ActionSheet';
import {
  persistAuthSessionTokens,
  persistSelectedBrokerSession,
} from '../src/state/brokerSessionStorage';
import { recordAccountJournalEvent } from '../src/state/terminalJournalState';

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
const REGISTER_BACK_FALLBACK_HREF = '/(tabs)/settings';
const REGISTER_INITIAL_PICKER_PRESS_GUARD_MS = 900;
const REGISTER_ROUTE_DATA_DELAY_MS = 900;
const getRegisterInteractionNow = () => (
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
);
const scheduleRegisterBackAfterVisualFrame = (action: () => void) => {
  const runAfterFrame = () => setTimeout(action, 0);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }
  setTimeout(action, 0);
};
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

type RegisterPickerHostKey =
  | 'country'
  | 'phoneCountry'
  | 'leverage'
  | 'originBroker'
  | 'group';

type DemoOriginBrokerOption = {
  value: string;
  label: string;
  subtitle: string;
};

const DEMO_ORIGIN_BROKER_OPTIONS: readonly DemoOriginBrokerOption[] = [
  {
    value: ORRNN_DEMO_ORIGIN_BROKER,
    label: ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME,
    subtitle: ORRNN_DEMO_ORIGIN_BROKER_LABEL,
  },
  {
    value: TEST_ORRNN_DEMO_ORIGIN_BROKER,
    label: TEST_ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME,
    subtitle: TEST_ORRNN_DEMO_ORIGIN_BROKER_LABEL,
  },
] as const;
const DEFAULT_DEMO_ORIGIN_BROKER = DEMO_ORIGIN_BROKER_OPTIONS[0];

const DEMO_LEVERAGE_OPTIONS: readonly DemoLeverageOption[] = Array.from(
  { length: (DEMO_LEVERAGE_MAX - DEMO_LEVERAGE_MIN) / DEMO_LEVERAGE_STEP + 1 },
  (_, index) => {
    const value = DEMO_LEVERAGE_MIN + index * DEMO_LEVERAGE_STEP;
    return { value, label: `1:${value}` as const };
  },
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

/**
 * Screen for opening a new Demo or Real account. Contains forms for user details, server selection, and account preferences.
 */
export default function RegisterScreen() {
  const login = useUserPreferences((s) => s.login);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isScreenFocused = useIsFocused();
  const [firstPaintReady, setFirstPaintReady] = useState(false);
  React.useEffect(() => {
    let cancelled = false;
    let frameId: number | null = null;
    const markReady = () => {
      if (!cancelled) {
        setFirstPaintReady(true);
      }
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(markReady);
    } else {
      const timerId = setTimeout(markReady, 16);
      return () => {
        cancelled = true;
        clearTimeout(timerId);
      };
    }

    return () => {
      cancelled = true;
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, []);
  const registerDataActive = useDeferredActiveFlag(
    isScreenFocused && firstPaintReady,
    REGISTER_ROUTE_DATA_DELAY_MS,
  );
  const {
    data: demoStatus,
    isLoading: isDemoStatusLoading,
    error: demoStatusError,
  } = useOrrnnDemoStatus(registerDataActive);
  const isDemoServiceReady = isOrrnnDemoHealthy(demoStatus);
  const {
    data: demoGroups,
    isLoading: isDemoGroupsLoading,
    error: demoGroupsError,
  } = useOrrnnDemoGroups(registerDataActive && isDemoServiceReady);
  const {
    data: brokerServers = [],
    refetch: refetchBrokerServers,
  } = useBrokerServers(registerDataActive);
  const createDemoAccount = useCreateOrrnnDemoAccount();
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const demoGroupOptions = demoGroups?.groups ?? [];
  const selectedDemoGroup =
    demoGroupOptions.find((group) => group.name === selectedGroupName) ??
    demoGroupOptions[0];
  // Cold-start network checks should never hide the form. They only control
  // whether the final submit is enabled once the live demo contract is ready.
  const isPreparingDemoAccount =
    !registerDataActive ||
    isDemoStatusLoading || (isDemoServiceReady && isDemoGroupsLoading);
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
  const [selectedOriginBrokerValue, setSelectedOriginBrokerValue] = useState(DEFAULT_DEMO_ORIGIN_BROKER.value);
  const [originBrokerPickerOpen, setOriginBrokerPickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [investorPassword, setInvestorPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState(String(ORRNN_DEMO_INITIAL_BALANCE));
  const [mountedPickerHosts, setMountedPickerHosts] = useState<Record<RegisterPickerHostKey, boolean>>({
    country: false,
    phoneCountry: false,
    leverage: false,
    originBroker: false,
    group: false,
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showInvestorPassword, setShowInvestorPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = React.useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const fieldYPositionsRef = React.useRef<Partial<Record<RegisterFieldKey, number>>>({});
  const fieldFocusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerBackNavigationStartedRef = React.useRef(false);
  const registerReadyNotifiedRef = React.useRef(false);
  const registerPickerPressBlockedUntilRef = React.useRef(
    getRegisterInteractionNow() + REGISTER_INITIAL_PICKER_PRESS_GUARD_MS,
  );
  const registerPickerFocusSeenRef = React.useRef(false);
  if (registerPickerFocusSeenRef.current !== isScreenFocused) {
    registerPickerFocusSeenRef.current = isScreenFocused;
    if (isScreenFocused) {
      registerPickerPressBlockedUntilRef.current =
        getRegisterInteractionNow() + REGISTER_INITIAL_PICKER_PRESS_GUARD_MS;
    }
  }
  const isRegisterInitialPickerPressBlocked = React.useCallback(() => (
    getRegisterInteractionNow() < registerPickerPressBlockedUntilRef.current
  ), []);

  const themeMode = useThemeMode();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const privacyPolicyUrl = resolveLegalUrl(
    getConfiguredPrivacyPolicyUrl(),
    'https://rtx5.orrnn.com/privacy-policy',
  );
  const termsConditionsUrl = resolveLegalUrl(
    getConfiguredTermsUrl(),
    'https://rtx5.orrnn.com/terms-conditions',
  );
  const demoStatusUnavailableMessage =
    demoStatusError?.message || t('Demo account service is temporarily unavailable.');
  const demoGroupsUnavailableMessage =
    demoGroupsError?.message || t('No demo group is available for account creation.');
  const isRegisterButtonDisabled = isLoading || !termsAccepted;

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

  const handleRegisterRootLayout = React.useCallback(() => {
    if (registerReadyNotifiedRef.current) {
      return;
    }

    registerReadyNotifiedRef.current = true;
    const notifyAfterPaint = () => {
      notifyRegisterScreenReady();
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(notifyAfterPaint);
      });
      return;
    }

    setTimeout(notifyAfterPaint, 32);
  }, []);

  const handleRegisterBack = React.useCallback((event: GestureResponderEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (registerBackNavigationStartedRef.current) {
      return;
    }

    registerBackNavigationStartedRef.current = true;
    if (fieldFocusTimerRef.current) {
      clearTimeout(fieldFocusTimerRef.current);
      fieldFocusTimerRef.current = null;
    }
    scheduleRegisterBackAfterVisualFrame(() => {
      safeRouterBack(router, REGISTER_BACK_FALLBACK_HREF);
    });
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
      recordAccountJournalEvent('demo account registration blocked: setup still loading', { level: 'error' });
      Alert.alert(
        t('Demo account unavailable'),
        t('Demo account details are still loading. Please try again in a moment.'),
      );
      return;
    }

    if (!isDemoServiceReady) {
      recordAccountJournalEvent(`demo account registration blocked: ${demoStatusUnavailableMessage}`, { level: 'error' });
      Alert.alert(
        t('Demo account unavailable'),
        demoStatusUnavailableMessage,
      );
      return;
    }

    if (!selectedDemoGroup?.name) {
      recordAccountJournalEvent(`demo account registration blocked: ${demoGroupsUnavailableMessage}`, { level: 'error' });
      Alert.alert(
        t('Demo account unavailable'),
        demoGroupsUnavailableMessage,
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
    const trimmedOriginBroker = selectedOriginBrokerValue.trim();
    const parsedInitialBalance = Number(initialBalance);
    const submissionPhone = formatDemoPhoneForSubmission(selectedPhoneCountry.dialCode, trimmedPhone);
    const effectiveCurrency = selectedDemoGroup.currency;
    const effectiveLeverage = selectedLeverageValue ?? getDefaultDemoLeverage(selectedDemoGroup.leverage);

    if (!trimmedFirstName || !trimmedEmail || !password || !investorPassword || !trimmedCountry) {
      recordAccountJournalEvent('demo account registration blocked: required fields missing', { level: 'error' });
      Alert.alert(t('Error'), t('Please fill in all required fields'));
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      recordAccountJournalEvent('demo account registration blocked: invalid email format', { level: 'error' });
      Alert.alert(t('Error'), t('Please enter a valid email address (e.g. you@example.com)'));
      return;
    }

    if (trimmedPhone && !isValidPhoneNumber(submissionPhone ?? trimmedPhone)) {
      recordAccountJournalEvent('demo account registration blocked: invalid phone number', { level: 'error' });
      Alert.alert(t('Error'), t('Please enter a valid phone number (digits only, 7-15 digits)'));
      return;
    }

    if (!termsAccepted) {
      recordAccountJournalEvent('demo account registration blocked: terms not accepted', { level: 'error' });
      Alert.alert(t('Error'), t('Please accept the terms and conditions'));
      return;
    }

    if (!Number.isFinite(parsedInitialBalance) || parsedInitialBalance <= 0) {
      recordAccountJournalEvent('demo account registration blocked: invalid initial balance', { level: 'error' });
      Alert.alert(t('Error'), t('Please enter a valid initial balance'));
      return;
    }

    setIsLoading(true);
    recordAccountJournalEvent('demo account registration requested');
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
      let sessionFeedToken = extractFeedBrokerToken(response);

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
        });
        sessionToken = authResponse.access_token ?? authResponse.token ?? '';
        sessionRefreshToken = authResponse.refresh_token ?? authResponse.refreshToken ?? '';
        sessionFeedToken = extractFeedBrokerToken(authResponse) || sessionFeedToken;
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
      recordAccountJournalEvent(`demo account created and signed in on ${canonicalBrokerId}`, {
        level: 'success',
        accountLogin: sessionLogin,
      });
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
          feedToken: sessionFeedToken,
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
      recordAccountJournalEvent(`demo account registration failed: ${error?.message || t('Unable to register account.')}`, {
        level: 'error',
      });
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
  const selectedOriginBroker =
    DEMO_ORIGIN_BROKER_OPTIONS.find((option) => option.value === selectedOriginBrokerValue) ??
    DEFAULT_DEMO_ORIGIN_BROKER;
  const originBrokerDisplayValue = selectedOriginBroker.label;
  const mountPickerHost = React.useCallback((key: RegisterPickerHostKey) => {
    setMountedPickerHosts((current) => (
      current[key] ? current : { ...current, [key]: true }
    ));
  }, []);
  const countryPickerMounted = mountedPickerHosts.country || countryPickerOpen;
  const countryPickerActions = React.useMemo(
    () => countryPickerMounted ? DEMO_COUNTRY_OPTIONS.map((option) => ({
      label: t(option.label),
      subtitle: `${option.code} ${option.dialCode}`,
      onPress: () => {
        setCountry(option.label);
        setPhoneCountryCode(option.code);
      },
    })) : [],
    [countryPickerMounted, t],
  );
  const phoneCountryPickerMounted = mountedPickerHosts.phoneCountry || phoneCountryPickerOpen;
  const phoneCountryPickerActions = React.useMemo(
    () => phoneCountryPickerMounted ? DEMO_COUNTRY_OPTIONS.map((option) => ({
      label: `${option.dialCode} ${t(option.label)}`,
      subtitle: option.code,
      onPress: () => setPhoneCountryCode(option.code),
    })) : [],
    [phoneCountryPickerMounted, t],
  );
  const handleOpenCountryPicker = React.useCallback(() => {
    if (isRegisterInitialPickerPressBlocked()) {
      return;
    }

    Keyboard.dismiss();
    handleFieldFocus('country');
    mountPickerHost('country');
    setCountryPickerOpen(true);
  }, [handleFieldFocus, isRegisterInitialPickerPressBlocked, mountPickerHost]);
  const handleOpenPhoneCountryPicker = React.useCallback(() => {
    if (isRegisterInitialPickerPressBlocked()) {
      return;
    }

    Keyboard.dismiss();
    handleFieldFocus('phone');
    mountPickerHost('phoneCountry');
    setPhoneCountryPickerOpen(true);
  }, [handleFieldFocus, isRegisterInitialPickerPressBlocked, mountPickerHost]);
  const leveragePickerMounted = mountedPickerHosts.leverage || leveragePickerOpen;
  const leveragePickerActions = React.useMemo(
    () => leveragePickerMounted ? DEMO_LEVERAGE_OPTIONS.map((option) => ({
      label: option.label,
      subtitle: option.value === selectedDemoGroup?.leverage ? t('Group default') : undefined,
      onPress: () => setSelectedLeverageValue(option.value),
    })) : [],
    [leveragePickerMounted, selectedDemoGroup?.leverage, t],
  );
  const originBrokerPickerMounted = mountedPickerHosts.originBroker || originBrokerPickerOpen;
  const originBrokerPickerActions = React.useMemo(
    () => originBrokerPickerMounted ? DEMO_ORIGIN_BROKER_OPTIONS.map((option) => ({
      label: t(option.label),
      subtitle: t(option.subtitle),
      selected: option.value === selectedOriginBroker.value,
      onPress: () => setSelectedOriginBrokerValue(option.value),
    })) : [],
    [originBrokerPickerMounted, selectedOriginBroker.value, t],
  );
  const groupPickerMounted = mountedPickerHosts.group || groupPickerOpen;
  const groupPickerActions = React.useMemo(
    () => groupPickerMounted ? demoGroupOptions.map((group) => ({
      label: group.name,
      subtitle: `${group.currency} / 1:${group.leverage}`,
      onPress: () => {
        setSelectedGroupName(group.name);
        setSelectedLeverageValue(getDefaultDemoLeverage(group.leverage));
      },
    })) : [],
    [demoGroupOptions, groupPickerMounted],
  );
  const handleOpenLeveragePicker = React.useCallback(() => {
    if (isRegisterInitialPickerPressBlocked()) {
      return;
    }

    Keyboard.dismiss();
    mountPickerHost('leverage');
    setLeveragePickerOpen(true);
  }, [isRegisterInitialPickerPressBlocked, mountPickerHost]);
  const handleOpenOriginBrokerPicker = React.useCallback(() => {
    if (isRegisterInitialPickerPressBlocked()) {
      return;
    }

    Keyboard.dismiss();
    handleFieldFocus('originBroker');
    mountPickerHost('originBroker');
    setOriginBrokerPickerOpen(true);
  }, [handleFieldFocus, isRegisterInitialPickerPressBlocked, mountPickerHost]);
  const handleOpenGroupPicker = React.useCallback(() => {
    if (isRegisterInitialPickerPressBlocked()) {
      return;
    }

    if (demoGroupOptions.length === 0) {
      return;
    }

    Keyboard.dismiss();
    mountPickerHost('group');
    setGroupPickerOpen(true);
  }, [demoGroupOptions.length, isRegisterInitialPickerPressBlocked, mountPickerHost]);
  const fieldIconColor = isDark ? T.textSub : T.textMuted;
  const fieldAccentColor = isDark ? T.accent : T.trading.buy.primary;
  const fieldPlaceholderColor = T.textMuted;
  const heroBackIconColor = T.text;
  const autofillBackgroundColor = isDark ? T.bg : REGISTER_QUOTES_LIGHT_BACKGROUND;

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
      <View style={styles.bg} onLayout={handleRegisterRootLayout}>
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
                <View style={styles.heroHeader}>
                  <Pressable
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={handleRegisterBack}
                    activateOnPressIn
                    activateOnTouchStart
                    latencyLabel="register.back"
                    latencyBudgetMs={50}
                    unstable_pressDelay={0}
                    style={styles.heroBackButton}
                  >
                    <Ionicons name="arrow-back" size={24} color={heroBackIconColor} />
                  </Pressable>
                  <View style={styles.heroCopy}>
                    <Text
                      style={styles.heroTitle}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.86}
                    >
                      {t('Open Demo Account')}
                    </Text>
                    <Text style={styles.heroSubtitle}>
                      {t('Create a practice account and start trading in minutes.')}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('firstName')}>
                <Text style={styles.inputLabel}>{t('First name')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="person-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={firstName}
                    placeholder={t('Enter first name')}
                    placeholderTextColor={fieldPlaceholderColor}
                    onChangeText={setFirstName}
                    onFocus={() => handleFieldFocus('firstName')}
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
                <Text style={styles.inputLabel}>
                  {t('Last name')} <Text style={styles.inputOptionalLabel}>({t('optional')})</Text>
                </Text>
                <View style={styles.inputShell}>
                  <Ionicons name="id-card-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={lastName}
                    placeholder={t('Enter last name')}
                    placeholderTextColor={fieldPlaceholderColor}
                    onChangeText={setLastName}
                    onFocus={() => handleFieldFocus('lastName')}
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
                    placeholder={t('Enter email address')}
                    placeholderTextColor={fieldPlaceholderColor}
                    onChangeText={setEmail}
                    onFocus={() => handleFieldFocus('email')}
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
                  <View style={styles.originBrokerValueStack}>
                    <Text style={styles.originBrokerPrimaryValue} numberOfLines={1}>
                      {t(originBrokerDisplayValue)}
                    </Text>
                    <Text style={styles.originBrokerSecondaryValue} numberOfLines={1}>
                      {t(selectedOriginBroker.subtitle)}
                    </Text>
                  </View>
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
                  isRegisterButtonDisabled && styles.registerBtnDisabled,
                  (pressed && !isRegisterButtonDisabled) && styles.registerBtnPressed
                ]}
                onPress={handleRegister}
                disabled={isRegisterButtonDisabled}
                journalActionLabel="pressed Register demo account button"
                journalActionSource="Actions"
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

        {countryPickerMounted ? (
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
        ) : null}
        {phoneCountryPickerMounted ? (
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
        ) : null}
        {leveragePickerMounted ? (
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
        ) : null}
        {originBrokerPickerMounted ? (
          <ActionSheet
            visible={originBrokerPickerOpen}
            title={t('Origin broker')}
            actions={originBrokerPickerActions}
            onClose={() => setOriginBrokerPickerOpen(false)}
            detent="auto"
            instantOpen
            runActionAfterClose={false}
          />
        ) : null}
        {groupPickerMounted ? (
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
        ) : null}
      </View>
    </>
  );
}

// Dynamic theme + register layout.
function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  const pageBg = isDark ? T.bg : REGISTER_QUOTES_LIGHT_BACKGROUND;
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const raisedSurface = isDark ? T.glass1 : 'rgba(15,23,42,0.04)';
  const selectedSurface = isDark ? T.glass3 : 'rgba(37,99,235,0.06)';
  const divider = isDark ? T.borderSubtle : 'rgba(15,23,42,0.07)';
  const border = isDark ? T.border : '#DFE7F1';
  const borderStrong = isDark ? T.borderMedium : '#D8E2EF';
  const primaryBlue = isDark ? T.accent : T.trading.buy.primary;
  const heroTitleColor = isDark ? '#FFFFFF' : T.text;
  const secondaryText = T.textSub;
  const fieldText = T.text;
  const mutedText = T.textMuted;
  const actionTintBg = isDark ? raisedSurface : 'rgba(37,99,235,0.08)';

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
      fontSize: 18,
      fontWeight: '600',
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
    heroHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
      paddingTop: 1,
    },
    heroTitle: {
      color: heroTitleColor,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '600',
      letterSpacing: 0,
      marginBottom: 0,
    },
    heroBackButton: {
      alignSelf: 'flex-start',
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    heroSubtitle: {
      color: secondaryText,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      marginTop: 5,
      marginLeft: 0,
      marginBottom: 0,
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
      borderColor: isDark ? border : 'rgba(59,130,246,0.18)',
      backgroundColor: isDark ? surface : 'rgba(59,130,246,0.06)',
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
      backgroundColor: isDark ? raisedSurface : 'rgba(255,255,255,0.7)',
    },
    inlineStatusBody: {
      flex: 1,
      minWidth: 0,
    },
    inlineStatusTitle: {
      color: T.text,
      fontSize: 13,
      fontWeight: '600',
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
      fontWeight: '600',
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
      borderColor: isDark ? border : T.borderMedium,
      backgroundColor: isDark ? surface : T.glass1,
    },
    statusGateIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      backgroundColor: isDark ? raisedSurface : T.glass2,
    },
    statusGateTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '600',
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
      fontWeight: '600',
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
      shadowColor: '#000000',
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
      backgroundColor: isDark ? raisedSurface : 'rgba(37,99,235,0.10)',
    },
    groupHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    groupSectionLabel: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    groupSectionSubtitle: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
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
      fontWeight: '600',
      backgroundColor: isDark ? raisedSurface : 'rgba(148,163,184,0.14)',
    },
    groupOptions: {
      borderTopWidth: 1,
      borderTopColor: isDark ? divider : 'rgba(15,23,42,0.08)',
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
      fontWeight: '500',
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
      backgroundColor: selectedSurface,
    },
    groupRadio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: isDark ? T.borderHi : 'rgba(100,116,139,0.38)',
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
      fontWeight: '600',
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
      backgroundColor: isDark ? raisedSurface : 'rgba(37,99,235,0.12)',
    },
    groupSelectedPillText: {
      color: T.accent,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    groupOptionDivider: {
      position: 'absolute',
      left: 46,
      right: 0,
      bottom: 0,
      height: 1,
      backgroundColor: isDark ? divider : 'rgba(15,23,42,0.07)',
    },

    formSectionTitle: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
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
      shadowColor: '#000000',
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
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
      marginBottom: 6,
      letterSpacing: 0,
    },
    inputOptionalLabel: {
      color: secondaryText,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
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
      backgroundColor: raisedSurface,
    },
    phoneCodeText: {
      color: fieldText,
      fontSize: 14,
      fontWeight: '600',
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
      fontWeight: '500',
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
      backgroundColor: isDark ? divider : 'rgba(100,116,139,0.42)',
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
      fontSize: 14,
      fontWeight: '500',
      includeFontPadding: false,
    },
    originBrokerValueStack: {
      flex: 1,
      minWidth: 0,
    },
    originBrokerPrimaryValue: {
      color: fieldText,
      fontSize: 14,
      lineHeight: 17,
      fontWeight: '600',
      includeFontPadding: false,
    },
    originBrokerSecondaryValue: {
      color: secondaryText,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '500',
      includeFontPadding: false,
      marginTop: 2,
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
      fontWeight: '600',
    },
    registerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primaryBlue,
      height: 54,
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
      fontSize: 16,
      fontWeight: '600',
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
