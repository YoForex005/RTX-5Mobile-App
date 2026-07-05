import { FastPressable as Pressable } from '../src/ui/components/FastPressable';
import { Stack, router } from 'expo-router';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getSecureItemAsync, setSecureItemAsync, removeSecureItemAsync } from '../src/utils/secureStorage';
import {
  ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
  type NativeSyntheticEvent,
  type TextInputEndEditingEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../src/state/userPreferences';
import { useThemeMode } from '../src/state/themeMode';
import { useSavedAccounts, setSavedAccountPassword } from '../src/state/savedAccounts';
import { loginAPI } from '../src/api/auth';
import { extractFeedBrokerToken } from '../src/api/feedAuth';
import { redactAuthPayload } from '../src/api/authRedaction';
// Broker config API — validates broker_id before login and provides server_name
import { checkBrokerServerHealth, getBrokerConfig, type BrokerServer } from '../src/api/broker';
import {
  getBrokerBackendDomainUnavailableMessage,
  isBrokerServiceBaseUrl,
  normalizeBrokerServerUrl,
  resolveBrokerServiceBaseUrl,
} from '../src/api/brokerRouting';
import { useTheme, type ThemeColors } from '../src/ui/theme/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_LIST_KEY, ACCOUNT_DETAIL_KEY } from '../src/query/accounts';
import { BROKER_CONFIG_KEY, useBrokerServers } from '../src/query/broker';
import { useTranslation } from '../src/i18n/useTranslation';
import { getTradingAccountTypeFromBackend } from '../src/domain/accountType';
import { safeRouterBack } from '../src/utils/navigation';
import { runImmediateAction } from '../src/utils/actionLatency';
import { ActionSheet } from '../src/ui/components/ActionSheet';
import {
  persistAuthSessionTokens,
  persistSelectedBrokerSession,
} from '../src/state/brokerSessionStorage';
import { bootstrapApp } from '../src/services/bootstrapApp';
import { recordAccountJournalEvent } from '../src/state/terminalJournalState';
import { preloadRegisterScreen } from '../src/features/settings/registerScreenPreload';

const LOGIN_SCREEN_COPY = {
  headerTitle: 'Login Account',
  sectionTitle: 'Sign in to your trading account',
  savedLoginKey: 'rtx5_saved_login',
};
const LOGIN_TOUCH_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
const LOGIN_BUTTON_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const LOGIN_BUTTON_PRESS_RETENTION_OFFSET = { top: 24, bottom: 24, left: 24, right: 24 } as const;
const LOGIN_SUBMIT_PRESS_GUARD_MS = 350;
const PINNED_LOGIN_BROKER_NAMES = ['MetaQuotes Ltd.'];
const DEV_LOGIN_PREFILL_ENABLED =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_PREFILL_TEST_LOGIN !== 'false';
const DEV_DEFAULT_LOGIN = {
  brokerId: process.env.EXPO_PUBLIC_TEST_BROKER_ID || 'testorrnn',
  brokerName: process.env.EXPO_PUBLIC_TEST_BROKER_NAME || 'Test Orrnn Broker (Demo)',
  serverUrl: normalizeBrokerServerUrl(process.env.EXPO_PUBLIC_TEST_BROKER_SERVER_URL || ''),
  username: process.env.EXPO_PUBLIC_TEST_USERNAME || '900001',
  password: process.env.EXPO_PUBLIC_TEST_PASSWORD || 'TestPass1234',
};

const KNOWN_LOGIN_BROKER_DOMAINS: Record<string, string> = {
  flexymarkets: 'flexymarkets.com',
  metaquotes: 'metaquotes.net',
  alphatrading: 'alphatrading.com',
};

type LoginBrokerOption = {
  key: string;
  brokerId: string;
  brokerName: string;
  serverUrl: string;
  logoUrl: string;
  region: string;
  protocol: string;
  domain?: string;
};

const normalizeBrokerKey = (brokerId: string) => brokerId.trim().toLowerCase();

const resolveLoginBrokerDomain = (name: string): string | undefined => {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [needle, domain] of Object.entries(KNOWN_LOGIN_BROKER_DOMAINS)) {
    if (key.includes(needle)) return domain;
  }
  return undefined;
};

const formatLoginBrokerInitials = (name: string) => {
  const words = name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase();
  return initials || 'BR';
};

const formatBrokerOptionSubtitle = (option: LoginBrokerOption) => (
  [option.brokerId, option.region, option.protocol.toUpperCase()].filter(Boolean).join(' / ')
);

const formatSelectedBrokerHint = (option: LoginBrokerOption) => (
  [option.brokerName, option.region].filter(Boolean).join(' / ')
);

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

const scheduleLoginKeyboardDismiss = () => {
  const dismissKeyboard = () => Keyboard.dismiss();

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(dismissKeyboard);
    return;
  }

  setTimeout(dismissKeyboard, 0);
};

type LoginCredentialsSnapshot = {
  brokerId: string;
  serverUrl: string;
  logoUrl: string;
  accountId: string;
  password: string;
};

export function AccountLoginScreen() {
  const login = useUserPreferences((s) => s.login);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  // Broker config integration: persist broker_id to Zustand so useBrokerConfig()
  // can fetch GET /broker/config with the correct broker context app-wide
  const setBrokerConnection = useUserPreferences((s) => s.setBrokerConnection);
  const queryClient = useQueryClient();
  const screenCopy = LOGIN_SCREEN_COPY;
  const { t } = useTranslation();

  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [brokerId, setBrokerId] = useState('');
  const [brokerServerUrl, setBrokerServerUrl] = useState('');
  const [brokerLogoUrl, setBrokerLogoUrl] = useState('');
  const [brokerLogoFailed, setBrokerLogoFailed] = useState<Record<string, boolean>>({});
  const [brokerPickerOpen, setBrokerPickerOpen] = useState(false);
  const [brokerHealthWarning, setBrokerHealthWarning] = useState('');
  const [isBrokerHealthChecking, setIsBrokerHealthChecking] = useState(false);
  const [savedCredentialsChecked, setSavedCredentialsChecked] = useState(false);
  const [modalState, setModalState] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string; }>({ visible: false, type: 'success', title: '', message: '' });
  const themeMode = useThemeMode();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const loginRequestInFlightRef = useRef(false);
  const loginSubmitPressGuardRef = useRef(false);
  const loginSubmitPressGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brokerIdValueRef = useRef<string | null>(null);
  const brokerServerUrlValueRef = useRef<string | null>(null);
  const brokerLogoUrlValueRef = useRef<string | null>(null);
  const accountIdValueRef = useRef<string | null>(null);
  const passwordValueRef = useRef<string | null>(null);
  const brokerHealthProbeRef = useRef(0);
  const hasSavedCredentialsRef = useRef(false);
  const hasAppliedDevDefaultsRef = useRef(false);
  const {
    data: brokerServers = [],
    isLoading: isBrokerServersLoading,
    isFetching: isBrokerServersFetching,
    isError: isBrokerServersError,
    refetch: refetchBrokerServers,
  } = useBrokerServers(true);

  useEffect(() => {
    // Auto-populate saved credentials if they exist
    getSecureItemAsync(screenCopy.savedLoginKey).then((val) => {
      if (val) {
        hasSavedCredentialsRef.current = true;
        try {
          const {
            broker,
            server_url: savedServerUrl,
            logo_url: savedLogoUrl,
            login: savedAccountId,
            pass,
          } = JSON.parse(val);
          if (broker) {
            brokerIdValueRef.current = broker;
            setBrokerId(broker);
          }
          if (savedServerUrl) {
            const normalizedServerUrl = normalizeBrokerServerUrl(savedServerUrl);
            brokerServerUrlValueRef.current = normalizedServerUrl || null;
            if (normalizedServerUrl) {
              setBrokerServerUrl(normalizedServerUrl);
            }
          }
          if (savedLogoUrl) {
            brokerLogoUrlValueRef.current = savedLogoUrl;
            setBrokerLogoUrl(savedLogoUrl);
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
    }).finally(() => {
      setSavedCredentialsChecked(true);
    });
  }, [screenCopy.savedLoginKey]);

  useEffect(() => () => {
    if (loginSubmitPressGuardTimerRef.current) {
      clearTimeout(loginSubmitPressGuardTimerRef.current);
      loginSubmitPressGuardTimerRef.current = null;
    }
  }, []);

  const probeBrokerHealth = useCallback(async (serverUrl: string) => {
    const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
    if (!normalizedServerUrl) {
      setBrokerHealthWarning('');
      return;
    }

    const probeId = brokerHealthProbeRef.current + 1;
    brokerHealthProbeRef.current = probeId;
    setIsBrokerHealthChecking(true);
    setBrokerHealthWarning('');

    try {
      await checkBrokerServerHealth(normalizedServerUrl);
      if (brokerHealthProbeRef.current === probeId) {
        setBrokerHealthWarning('');
      }
    } catch {
      if (brokerHealthProbeRef.current === probeId) {
        setBrokerHealthWarning(t('Broker temporarily unavailable'));
      }
    } finally {
      if (brokerHealthProbeRef.current === probeId) {
        setIsBrokerHealthChecking(false);
      }
    }
  }, [t]);

  const updateBrokerId = (value: string) => {
    brokerIdValueRef.current = value;
    setBrokerId(value);
    brokerServerUrlValueRef.current = null;
    brokerLogoUrlValueRef.current = null;
    setBrokerServerUrl('');
    setBrokerLogoUrl('');
    setBrokerHealthWarning('');
  };

  const selectBrokerOption = useCallback((option: LoginBrokerOption) => {
    brokerIdValueRef.current = option.brokerId;
    brokerServerUrlValueRef.current = option.serverUrl;
    brokerLogoUrlValueRef.current = option.logoUrl;
    setBrokerId(option.brokerId);
    setBrokerServerUrl(option.serverUrl);
    setBrokerLogoUrl(option.logoUrl);
    setBrokerConnection(option.brokerId, option.serverUrl, option.logoUrl);
    void persistSelectedBrokerSession({
      brokerId: option.brokerId,
      serverUrl: option.serverUrl,
      logoUrl: option.logoUrl,
    });
    void probeBrokerHealth(option.serverUrl);
  }, [probeBrokerHealth, setBrokerConnection]);

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

  const brokerOptions = useMemo<LoginBrokerOption[]>(() => {
    const pinnedBrokerNames = new Set(PINNED_LOGIN_BROKER_NAMES.map((name) => name.toLowerCase()));
    const rows = [...brokerServers]
      .filter((broker: BrokerServer) => broker.enabled !== false && !!broker.broker_id?.trim())
      .sort((a, b) => {
        const aName = a.broker_name?.trim() || a.broker_id;
        const bName = b.broker_name?.trim() || b.broker_id;
        const aPinned = pinnedBrokerNames.has(aName.toLowerCase()) ? 0 : 1;
        const bPinned = pinnedBrokerNames.has(bName.toLowerCase()) ? 0 : 1;
        if (aPinned !== bPinned) return aPinned - bPinned;
        const byName = aName.localeCompare(bName);
        if (byName !== 0) return byName;
        return a.id - b.id;
      });
    const seen = new Set<string>();
    const options: LoginBrokerOption[] = [];
    for (const broker of rows) {
      const brokerIdValue = broker.broker_id.trim();
      const key = normalizeBrokerKey(brokerIdValue);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        key,
        brokerId: brokerIdValue,
        brokerName: broker.broker_name?.trim() || brokerIdValue,
        serverUrl: resolveBrokerServiceBaseUrl(broker),
        logoUrl: broker.logo_url?.trim() || '',
        region: broker.region?.trim() || '',
        protocol: broker.protocol?.trim() || '',
        domain: resolveLoginBrokerDomain(broker.broker_name) ?? resolveLoginBrokerDomain(broker.broker_id),
      });
    }
    return options;
  }, [brokerServers]);

  const selectedBrokerOption = useMemo(() => {
    const selectedKey = normalizeBrokerKey(brokerId);
    if (!selectedKey) return undefined;
    return brokerOptions.find((option) => option.key === selectedKey);
  }, [brokerId, brokerOptions]);
  const selectedBrokerServerUrl = brokerServerUrl || selectedBrokerOption?.serverUrl || '';
  const selectedBrokerLogoUrl = brokerLogoUrl || selectedBrokerOption?.logoUrl || '';
  const selectedBrokerLogoUri = selectedBrokerLogoUrl || (
    selectedBrokerOption?.domain ? `https://logo.clearbit.com/${selectedBrokerOption.domain}` : ''
  );
  const selectedBrokerLogoFailed = selectedBrokerLogoUri ? Boolean(brokerLogoFailed[selectedBrokerLogoUri]) : false;
  const selectedBrokerInitials = formatLoginBrokerInitials(
    selectedBrokerOption?.brokerName || brokerId || t('Broker'),
  );
  const isBrokerDirectoryBusy = isBrokerServersLoading || isBrokerServersFetching;
  const isBrokerDirectoryUnavailable = !isBrokerDirectoryBusy && brokerOptions.length === 0;

  const resolveBrokerSelectionError = useCallback((candidateBrokerId: string, candidateServerUrl = '') => {
    const candidateKey = normalizeBrokerKey(candidateBrokerId);
    if (!candidateKey) {
      return '';
    }
    const matchedBrokerOption = brokerOptions.find((option) => option.key === candidateKey);
    if (matchedBrokerOption) {
      if (!matchedBrokerOption.serverUrl) {
        return getBrokerBackendDomainUnavailableMessage(candidateBrokerId);
      }
      return '';
    }

    if (isBrokerServiceBaseUrl(normalizeBrokerServerUrl(candidateServerUrl))) {
      return '';
    }

    if (isBrokerDirectoryBusy) {
      return t('Please wait while the broker list loads.');
    }
    if (isBrokerDirectoryUnavailable) {
      return t('Broker list unavailable. Retry broker list and select your broker before login.');
    }
    return t('Please select your broker from the broker list before login.');
  }, [
    brokerOptions,
    isBrokerDirectoryBusy,
    isBrokerDirectoryUnavailable,
    t,
  ]);
  const brokerSelectionError = resolveBrokerSelectionError(
    (brokerIdValueRef.current ?? brokerId).trim(),
    brokerServerUrlValueRef.current || selectedBrokerServerUrl,
  );
  const isLoginSubmitDisabled = isLoading || Boolean(brokerSelectionError);

  useEffect(() => {
    if (!selectedBrokerOption?.serverUrl) {
      return;
    }

    const currentServerUrl = normalizeBrokerServerUrl(brokerServerUrlValueRef.current || brokerServerUrl);
    const nextServerUrl = selectedBrokerOption.serverUrl;
    const nextLogoUrl = selectedBrokerOption.logoUrl;

    if (currentServerUrl === nextServerUrl && brokerLogoUrlValueRef.current === nextLogoUrl) {
      return;
    }

    brokerIdValueRef.current = selectedBrokerOption.brokerId;
    brokerServerUrlValueRef.current = nextServerUrl;
    brokerLogoUrlValueRef.current = nextLogoUrl;
    setBrokerServerUrl(nextServerUrl);
    setBrokerLogoUrl(nextLogoUrl);
    setBrokerConnection(selectedBrokerOption.brokerId, nextServerUrl, nextLogoUrl);
    void persistSelectedBrokerSession({
      brokerId: selectedBrokerOption.brokerId,
      serverUrl: nextServerUrl,
      logoUrl: nextLogoUrl,
    });
  }, [brokerLogoUrl, brokerServerUrl, selectedBrokerOption, setBrokerConnection]);

  useEffect(() => {
    if (
      !DEV_LOGIN_PREFILL_ENABLED ||
      !savedCredentialsChecked ||
      hasSavedCredentialsRef.current ||
      hasAppliedDevDefaultsRef.current ||
      brokerId ||
      accountId ||
      password
    ) {
      return;
    }

    hasAppliedDevDefaultsRef.current = true;
    const directoryOption = brokerOptions.find(
      (option) => option.brokerId.toLowerCase() === DEV_DEFAULT_LOGIN.brokerId.toLowerCase(),
    );
    const defaultOption = {
      key: normalizeBrokerKey(DEV_DEFAULT_LOGIN.brokerId),
      brokerId: DEV_DEFAULT_LOGIN.brokerId,
      brokerName: directoryOption?.brokerName || DEV_DEFAULT_LOGIN.brokerName,
      serverUrl: directoryOption?.serverUrl || DEV_DEFAULT_LOGIN.serverUrl,
      logoUrl: directoryOption?.logoUrl || '',
      region: directoryOption?.region || 'Demo',
      protocol: directoryOption?.protocol || 'https',
      domain: directoryOption?.domain ?? resolveLoginBrokerDomain(DEV_DEFAULT_LOGIN.brokerName),
    };

    selectBrokerOption(defaultOption);
    accountIdValueRef.current = DEV_DEFAULT_LOGIN.username;
    passwordValueRef.current = DEV_DEFAULT_LOGIN.password;
    setAccountId(DEV_DEFAULT_LOGIN.username);
    setPassword(DEV_DEFAULT_LOGIN.password);
  }, [
    accountId,
    brokerId,
    brokerOptions,
    password,
    savedCredentialsChecked,
    selectBrokerOption,
  ]);

  const brokerPickerActions = useMemo(() => {
    if (brokerOptions.length === 0) {
      const isBusy = isBrokerServersLoading || isBrokerServersFetching;
      return [{
        label: isBusy ? 'Loading brokers...' : 'Retry broker list',
        subtitle: isBusy
          ? t('Please wait while the broker list loads.')
          : t('Broker list is unavailable. Retry before login.'),
        disabled: isBusy,
        onPress: () => {
          void refetchBrokerServers();
        },
      }];
    }

    return brokerOptions.map((option) => ({
      label: option.brokerName,
      subtitle: formatBrokerOptionSubtitle(option),
      onPress: () => selectBrokerOption(option),
    }));
  }, [
    brokerOptions,
    isBrokerServersFetching,
    isBrokerServersLoading,
    refetchBrokerServers,
    t,
    selectBrokerOption,
  ]);

  const getLoginCredentialsSnapshot = (): LoginCredentialsSnapshot => {
    const candidateServerUrl = normalizeBrokerServerUrl(
      brokerServerUrlValueRef.current || selectedBrokerServerUrl,
    );
    return {
      brokerId: (brokerIdValueRef.current ?? brokerId).trim(),
      serverUrl: isBrokerServiceBaseUrl(candidateServerUrl) ? candidateServerUrl : '',
      logoUrl: brokerLogoUrlValueRef.current ?? selectedBrokerLogoUrl,
      accountId: (accountIdValueRef.current ?? accountId).trim(),
      password: passwordValueRef.current ?? password,
    };
  };

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
    const normalizedServerUrl = snapshot.serverUrl;
    const selectedLogoUrl = snapshot.logoUrl;
    const normalizedAccountId = snapshot.accountId;
    const currentPassword = snapshot.password;

    if (!normalizedBrokerId) {
      setIsLoading(false);
      recordAccountJournalEvent('login blocked: broker id missing', { level: 'error' });
      setModalState({ visible: true, type: 'error', title: t('Error'), message: t('Please enter your Broker ID') });
      return;
    }
    const brokerSelectionMessage = resolveBrokerSelectionError(normalizedBrokerId, normalizedServerUrl);
    if (brokerSelectionMessage) {
      setIsLoading(false);
      recordAccountJournalEvent(`login blocked: ${brokerSelectionMessage}`, {
        level: 'error',
        accountLogin: normalizedAccountId,
      });
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: brokerSelectionMessage,
      });
      return;
    }
    if (!normalizedServerUrl) {
      setIsLoading(false);
      recordAccountJournalEvent('login blocked: broker login server unavailable', {
        level: 'error',
        accountLogin: normalizedAccountId,
      });
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: getBrokerBackendDomainUnavailableMessage(normalizedBrokerId),
      });
      return;
    }
    if (!normalizedAccountId || !currentPassword) {
      setIsLoading(false);
      recordAccountJournalEvent('login blocked: login id or password missing', {
        level: 'error',
        accountLogin: normalizedAccountId,
      });
      setModalState({ visible: true, type: 'error', title: t('Error'), message: t('Please enter both Login ID and Password') });
      return;
    }

    loginRequestInFlightRef.current = true;
    setIsLoading(true);
    recordAccountJournalEvent(`login requested for broker ${normalizedBrokerId}`, {
      accountLogin: normalizedAccountId,
    });
    let didStartSuccessNavigation = false;
    try {
      const response: any = await loginAPI({
        username: normalizedAccountId,
        password: currentPassword,
        broker_id: normalizedBrokerId,
      }, { serverUrl: normalizedServerUrl });

      // ── Defensive response parsing ──
      // The V2 server's spec (AuthTokenResponse) returns `token` + nested
      // `user`, while older deployments returned the flat `access_token` +
      // `account_login` shape. Accept BOTH so a server-side field rename
      // can't silently break login and leave trades with an undefined JWT.
      const accessToken = response.access_token ?? response.token;
      const refreshToken = response.refresh_token ?? response.refreshToken;
      const feedToken = extractFeedBrokerToken(response);
      const accountLogin =
        response.account_login ??
        response.accountLogin ??
        response.user?.account_login ??
        response.user?.id ??
        response.username ??
        response.user?.username ??
        normalizedAccountId;
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
        console.warn('[Login] Unexpected auth response shape:', redactAuthPayload(response));
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
      // conditions with the async Zustand persist middleware. Account type is
      // included here too so success performs one store update before routing.
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
        {
          serverUrl: normalizedServerUrl,
          logoUrl: selectedLogoUrl,
          isDemoAccount: accountType === 'demo',
        },
      );
      recordAccountJournalEvent(`login succeeded on ${canonicalBrokerId}`, {
        level: 'success',
        accountLogin: savedLogin,
      });

      router.replace('/(tabs)/quotes');
      didStartSuccessNavigation = true;
      schedulePostLoginWork(() => {
        void Promise.all([
          persistSelectedBrokerSession({
            brokerId: canonicalBrokerId,
            serverUrl: normalizedServerUrl,
            logoUrl: selectedLogoUrl,
          }),
          persistAuthSessionTokens({
            accessToken,
            refreshToken: refreshToken ?? '',
            expiresAt: expiresAtIso,
            feedToken,
          }),
        ]).catch((err) => {
          console.warn('[Login] Failed to persist secure broker session', err);
        });
        void bootstrapApp({ accountLogin: savedLogin }).catch((err) => {
          console.warn('[Login] Post-login bootstrap failed', err);
        });
        // Record this account in the persistent directory and stash the master
        // password securely so the user can one-tap switch back to it later
        // from the Accounts screen.
        upsertSavedAccount({
          login: savedLogin,
          name: accountName,
          brokerId: canonicalBrokerId,
          server: immediateServerName,
          serverUrl: normalizedServerUrl,
          logoUrl: selectedLogoUrl,
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
            JSON.stringify({
              broker: canonicalBrokerId,
              server_url: normalizedServerUrl,
              logo_url: selectedLogoUrl,
              login: normalizedAccountId,
              pass: currentPassword,
            })
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
                serverUrl: normalizedServerUrl,
                logoUrl: selectedLogoUrl,
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
      recordAccountJournalEvent(`login failed: ${error?.message || t('Invalid credentials')}`, {
        level: 'error',
        accountLogin: normalizedAccountId,
      });
      setModalState({ visible: true, type: 'error', title: t('Login Failed'), message: error.message || t('Invalid credentials') });
    } finally {
      loginRequestInFlightRef.current = false;
      if (!didStartSuccessNavigation) {
        setIsLoading(false);
      }
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
      setIsLoading(true);
      const snapshot = getLoginCredentialsSnapshot();
      void handleLogin(snapshot);
      scheduleLoginKeyboardDismiss();
      releaseLoginSubmitPressGuard();
    });
  };

  const handleBrokerPickerPress = () => {
    runImmediateAction('login.brokerPicker.open', () => {
      Keyboard.dismiss();
      if (brokerOptions.length === 0 && !isBrokerServersLoading && !isBrokerServersFetching) {
        void refetchBrokerServers();
      }
      setBrokerPickerOpen(true);
    });
  };

  const handleRegisterAccountPress = () => {
    runImmediateAction('login.register.open', () => {
      Keyboard.dismiss();
      void preloadRegisterScreen().catch(() => undefined);
      router.push('/register-entry');
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
            canCancelContentTouches={Platform.OS === 'ios'}
          >

            {/* ── Section Title ── */}
            <View style={styles.sectionTitleContainer}>
              <Text
                style={styles.sectionTitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {t(screenCopy.sectionTitle)}
              </Text>
              <Text style={styles.sectionSubtitle}>{t('Secure access to your broker workspace')}</Text>
            </View>

            {/* ── Form Body ── */}
            <View style={styles.formContainer}>

              {/* Broker ID Field */}
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>{t('Trading Server')}</Text>
                <View style={[styles.inputRow, styles.brokerInputRow]}>
                  <View
                    style={[
                      styles.brokerAvatar,
                      (!selectedBrokerLogoUri || selectedBrokerLogoFailed) && styles.brokerAvatarFallback,
                    ]}
                  >
                    {selectedBrokerLogoUri && !selectedBrokerLogoFailed ? (
                      <Image
                        source={{ uri: selectedBrokerLogoUri }}
                        style={styles.brokerAvatarImage}
                        resizeMode="contain"
                        onError={() => setBrokerLogoFailed((prev) => ({
                          ...prev,
                          [selectedBrokerLogoUri]: true,
                        }))}
                      />
                    ) : (
                      <Text style={styles.brokerAvatarInitials}>{selectedBrokerInitials}</Text>
                    )}
                  </View>
                  <View style={styles.fieldValueColumn}>
                    <TextInput
                      style={[styles.input, styles.brokerInput, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
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
                    {brokerSelectionError ? (
                      <Text style={[styles.brokerInlineHint, styles.brokerInlineHintError]} numberOfLines={2}>
                        {brokerSelectionError}
                      </Text>
                    ) : selectedBrokerOption ? (
                      <Text style={styles.brokerInlineHint} numberOfLines={1}>
                        {formatSelectedBrokerHint(selectedBrokerOption)}
                      </Text>
                    ) : isBrokerServersError ? (
                      <Text style={[styles.brokerInlineHint, styles.brokerInlineHintError]} numberOfLines={2}>
                        {t('Broker list unavailable. Retry broker list before login.')}
                      </Text>
                    ) : null}
                    {isBrokerHealthChecking ? (
                      <Text style={styles.brokerInlineHint} numberOfLines={1}>
                        {t('Checking broker server...')}
                      </Text>
                    ) : brokerHealthWarning ? (
                      <Text style={[styles.brokerInlineHint, styles.brokerInlineHintError]} numberOfLines={2}>
                        {brokerHealthWarning}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.brokerPickerBtn,
                      pressed && styles.brokerPickerBtnPressed,
                    ]}
                    onPress={handleBrokerPickerPress}
                    activateOnPressIn
                    activateOnTouchStart
                    hitSlop={LOGIN_TOUCH_HIT_SLOP}
                    latencyLabel="login.brokerPicker.open"
                    accessibilityRole="button"
                    accessibilityLabel={t('Select broker')}
                    accessibilityState={{
                      expanded: brokerPickerOpen,
                      busy: isBrokerServersLoading || isBrokerServersFetching,
                    }}
                    testID="login-broker-picker-button"
                  >
                    {isBrokerServersLoading || isBrokerServersFetching ? (
                      <ActivityIndicator size="small" color={T.accent} />
                    ) : (
                      <Ionicons name="chevron-down" size={19} color={T.accent} />
                    )}
                  </Pressable>
                </View>
              </View>
              <View style={styles.fieldDivider} />

              {/* Login ID Field */}
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>{t('Login ID')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={21} color={T.textSub} style={styles.inputLeadingIcon} />
                  <TextInput
                    style={[styles.input, styles.stackedInput, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
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
              </View>
              <View style={styles.fieldDivider} />

              {/* Password Field */}
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>{t('Password')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={21} color={T.textSub} style={styles.inputLeadingIcon} />
                  <TextInput
                    style={[styles.input, styles.stackedInput, { backgroundColor: 'transparent', outlineStyle: 'none', outlineWidth: 0, borderWidth: 0 }] as any}
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
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color={T.textSub} />
                  </Pressable>
                </View>
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
                  size={24}
                  color={savePassword ? T.trading.buy.primary : T.textSub}
                />
                <Text style={styles.checkboxText}>{t('Remember me')}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.loginBtn,
                  (pressed || isLoginSubmitDisabled) && styles.loginBtnPressed
                ]}
                onPress={handleLoginPress}
                activateOnTouchStart
                disabled={isLoginSubmitDisabled}
                hitSlop={LOGIN_BUTTON_HIT_SLOP}
                pressRetentionOffset={LOGIN_BUTTON_PRESS_RETENTION_OFFSET}
                latencyLabel="login.submit"
                journalActionLabel="pressed Login button"
                journalActionSource="Actions"
                unstable_pressDelay={0}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoginSubmitDisabled, busy: isLoading }}
                testID="login-submit-button"
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginBtnText}>{t('LOGIN')}</Text>
                )}
              </Pressable>

              <View style={styles.registerPromptRow}>
                <Text style={styles.registerPromptText}>{t("Don't have an account?")}</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.registerAccountBtn,
                    pressed && styles.registerAccountBtnPressed,
                  ]}
                  onPress={handleRegisterAccountPress}
                  hitSlop={LOGIN_BUTTON_HIT_SLOP}
                  pressRetentionOffset={LOGIN_BUTTON_PRESS_RETENTION_OFFSET}
                  latencyLabel="login.register.open"
                  journalActionLabel="opened account registration"
                  journalActionSource="Actions"
                  unstable_pressDelay={0}
                  accessibilityRole="button"
                  accessibilityLabel={t('Register account')}
                  testID="login-register-account-button"
                >
                  <Text style={styles.registerAccountText}>{t('Register an account')}</Text>
                </Pressable>
              </View>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        <ActionSheet
          visible={brokerPickerOpen}
          title="Select Broker"
          actions={brokerPickerActions}
          onClose={() => setBrokerPickerOpen(false)}
          searchable={brokerOptions.length > 0}
          searchPlaceholder="Search brokers..."
          detent="large"
          instantOpen
          runActionAfterClose={false}
        />

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
  const pageBg = isDark ? T.bg : '#F2F4F8';
  const fieldBg = isDark ? T.glass1 : '#FFFFFF';
  const fieldBorder = isDark ? T.border : '#DFE7F1';
  const shadowColor = isDark ? '#000000' : T.textDark;
  const secondaryText = isDark ? '#93C5FD' : T.trading.buy.primary;

  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: T.bg,
      paddingTop: safeTop + 8,
    },
    container: {
      flex: 1,
      backgroundColor: pageBg,
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
      backgroundColor: T.glass1,
    },
    headerTitle: {
      color: T.text,
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: 0,
    },

    scrollContent: {
      paddingTop: 20,
      paddingBottom: 36,
    },

    /* Section Title */
    sectionTitleContainer: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: 34,
      paddingTop: 0,
      paddingBottom: 30,
    },
    sectionTitle: {
      color: T.text,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      textAlign: 'left',
      letterSpacing: 0,
    },
    sectionSubtitle: {
      color: T.textSub,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      marginTop: 12,
    },


    formContainer: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: 34,
      marginTop: 0,
    },

    /* Input Rows */
    fieldBlock: {
      marginBottom: 14,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 58,
      paddingVertical: 0,
      paddingLeft: 14,
      paddingRight: 12,
      marginBottom: 0,
      borderWidth: 1,
      borderColor: fieldBorder,
      borderRadius: 8,
      backgroundColor: fieldBg,
      shadowColor,
      shadowOpacity: isDark ? 0 : 0.035,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: isDark ? 0 : 1,
    },
    brokerInputRow: {
      minHeight: 74,
      paddingVertical: 8,
      alignItems: 'center',
    },
    inputLabel: {
      color: T.text,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      marginBottom: 8,
      backgroundColor: 'transparent',
    },
    input: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '500',
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
    fieldValueColumn: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    stackedInput: {
      height: 40,
      minHeight: 40,
      marginTop: 0,
    },
    brokerInput: {
      height: 25,
      minHeight: 25,
      marginTop: 0,
    },
    brokerPickerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      borderWidth: 0,
      backgroundColor: 'transparent',
    },
    brokerPickerBtnPressed: {
      opacity: 0.78,
    },
    brokerInlineHint: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
      marginTop: 1,
    },
    brokerInlineHintError: {
      color: T.trading.sell.primary,
    },

    /* Divider between fields */
    fieldDivider: {
      height: 0,
      backgroundColor: 'transparent',
      marginLeft: 0,
    },

    /* Eye Icon */
    eyeIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      backgroundColor: 'transparent',
    },
    inputLeadingIcon: {
      marginRight: 10,
    },
    brokerAvatar: {
      width: 32,
      height: 32,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
    },
    brokerAvatarFallback: {
      backgroundColor: T.trading.buy.primary,
    },
    brokerAvatarImage: {
      width: 24,
      height: 24,
    },
    brokerAvatarInitials: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0,
    },

    /* Checkbox */
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginTop: 2,
      marginBottom: 14,
      paddingVertical: 2,
    },
    checkboxText: {
      color: T.textSub,
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 12,
    },

    /* Solid Login Button */
    loginBtn: {
      backgroundColor: T.trading.buy.primary,
      minHeight: 56,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 0,
      shadowColor: T.trading.buy.primary,
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    loginBtnPressed: {
      opacity: 0.85,
    },
    loginBtnText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0,
    },

    registerPromptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
    },
    registerPromptText: {
      color: T.textSub,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    registerAccountBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 32,
      paddingHorizontal: 6,
      marginLeft: 4,
      backgroundColor: 'transparent',
    },
    registerAccountBtnPressed: {
      opacity: 0.82,
    },
    registerAccountText: {
      color: secondaryText,
      fontSize: 13,
      fontWeight: '700',
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
