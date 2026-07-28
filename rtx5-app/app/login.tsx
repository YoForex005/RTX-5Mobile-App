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
import { useThemeMode } from '../src/state/themeMode';
import { useSavedAccounts, setSavedAccountPassword } from '../src/state/savedAccounts';
import { isLoginRequestAbortedError, loginAPI } from '../src/api/auth';
import { redactAuthPayload, redactSensitiveString } from '../src/api/authRedaction';
// Broker config API — validates broker_id before login and provides server_name
import { checkBrokerServerHealth, getBrokerConfig, type BrokerServer } from '../src/api/broker';
import {
  getBrokerBackendDomainUnavailableMessage,
  isBrokerServerUrlForApiBase,
  normalizeBrokerServerUrl,
  resolveBrokerEndpointSet,
  type ValidatedBrokerEndpointSet,
} from '../src/api/brokerRouting';
import { useTheme, type ThemeColors } from '../src/ui/theme/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { useBrokerServers, getBrokerConfigQueryKey } from '../src/query/broker';
import {
  invalidateSessionQueryRoots,
} from '../src/query/authenticatedQueryScope';
import { useTranslation } from '../src/i18n/useTranslation';
import {
  buildAccountEnvironmentKey,
  mergeAccountEnvironment,
  readRawAccountGroup,
  resolveAccountEnvironment,
  type AccountEnvironmentState,
} from '../src/domain/accountType';
import { safeRouterBack } from '../src/utils/navigation';
import { runImmediateAction } from '../src/utils/actionLatency';
import { ActionSheet } from '../src/ui/components/ActionSheet';
import { bootstrapApp } from '../src/services/bootstrapApp';
import { recordAccountJournalEvent } from '../src/state/terminalJournalState';
import { preloadRegisterScreen } from '../src/features/settings/registerScreenPreload';
import {
  authorizeBrokerSessionCommit,
  cancelBrokerSessionCommitAuthorization,
  commitBrokerSession,
  isStaleBrokerSessionCommitError,
  type BrokerSessionCommitAuthorization,
} from '../src/services/brokerSessionCoordinator';
import { resolveSessionFeedAuth } from '../src/api/feedAuthContract';
import {
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../src/state/activeBrokerSession';

const LOGIN_SCREEN_COPY = {
  headerTitle: 'Login Account',
  sectionTitle: 'Sign in to your trading account',
  savedLoginKey: 'rtx5_saved_login',
};
const LOGIN_TOUCH_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
const LOGIN_BUTTON_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const LOGIN_BUTTON_PRESS_RETENTION_OFFSET = { top: 24, bottom: 24, left: 24, right: 24 } as const;
const LOGIN_SUBMIT_PRESS_GUARD_MS = 120;
const PINNED_LOGIN_BROKER_NAMES = ['MetaQuotes Ltd.'];
const DEV_DEFAULT_LOGIN = {
  brokerId: process.env.EXPO_PUBLIC_TEST_BROKER_ID || '',
  brokerName: process.env.EXPO_PUBLIC_TEST_BROKER_NAME || '',
  serverUrl: normalizeBrokerServerUrl(process.env.EXPO_PUBLIC_TEST_BROKER_SERVER_URL || ''),
  username: process.env.EXPO_PUBLIC_TEST_USERNAME || '',
  password: process.env.EXPO_PUBLIC_TEST_PASSWORD || '',
};
const DEV_LOGIN_PREFILL_ENABLED =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_PREFILL_TEST_LOGIN !== 'false' &&
  Boolean(
    DEV_DEFAULT_LOGIN.brokerId &&
    DEV_DEFAULT_LOGIN.serverUrl &&
    DEV_DEFAULT_LOGIN.username &&
    DEV_DEFAULT_LOGIN.password,
  );

type LoginBrokerOption = {
  key: string;
  brokerId: string;
  brokerName: string;
  serverUrl: string;
  logoUrl: string;
  region: string;
  protocol: string;
  endpoints: ValidatedBrokerEndpointSet;
  domain?: string;
};

const normalizeBrokerKey = (brokerId: string) => brokerId.trim().toLowerCase();

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
  endpoints: ValidatedBrokerEndpointSet | null;
};

/**
 * Form screen for entering server credentials (login, password, server selection) to authenticate an account.
 */
export function AccountLoginScreen() {
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
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
  const [healthVerifiedBrokerServerUrl, setHealthVerifiedBrokerServerUrl] = useState('');
  const [savedCredentialsChecked, setSavedCredentialsChecked] = useState(false);
  const [modalState, setModalState] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string; }>({ visible: false, type: 'success', title: '', message: '' });
  const themeMode = useThemeMode();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const loginRequestInFlightRef = useRef(false);
  const loginMountedRef = useRef(true);
  const activeLoginAttemptRef = useRef<{
    authorization: BrokerSessionCommitAuthorization;
    controller: AbortController;
  } | null>(null);
  const loginSubmitPressGuardRef = useRef(false);
  const loginSubmitPressGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brokerIdValueRef = useRef<string | null>(null);
  const brokerServerUrlValueRef = useRef<string | null>(null);
  const brokerLogoUrlValueRef = useRef<string | null>(null);
  const accountIdValueRef = useRef<string | null>(null);
  const passwordValueRef = useRef<string | null>(null);
  const brokerHealthProbeRef = useRef(0);
  const healthVerifiedBrokerServerUrlRef = useRef('');
  const warmedBrokerServerUrlRef = useRef('');
  const hasSavedCredentialsRef = useRef(false);
  const hasAppliedDevDefaultsRef = useRef(false);
  const {
    data: brokerServers = [],
    isLoading: isBrokerServersLoading,
    isFetching: isBrokerServersFetching,
    isError: isBrokerServersError,
    error: brokerServersError,
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

  useEffect(() => {
    loginMountedRef.current = true;
    return () => {
      loginMountedRef.current = false;
      const activeAttempt = activeLoginAttemptRef.current;
      activeAttempt?.controller.abort();
      cancelBrokerSessionCommitAuthorization(activeAttempt?.authorization);
      activeLoginAttemptRef.current = null;
      if (loginSubmitPressGuardTimerRef.current) {
        clearTimeout(loginSubmitPressGuardTimerRef.current);
        loginSubmitPressGuardTimerRef.current = null;
      }
    };
  }, []);

  const clearBrokerHealthVerification = useCallback(() => {
    healthVerifiedBrokerServerUrlRef.current = '';
    setHealthVerifiedBrokerServerUrl('');
    setIsBrokerHealthChecking(false);
  }, []);

  const probeBrokerHealth = useCallback(async (serverUrl: string): Promise<boolean> => {
    const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
    if (!normalizedServerUrl) {
      brokerHealthProbeRef.current += 1;
      clearBrokerHealthVerification();
      setIsBrokerHealthChecking(false);
      setBrokerHealthWarning('');
      return false;
    }

    // Already verified for this host — never clear the green light or block LOGIN.
    if (healthVerifiedBrokerServerUrlRef.current === normalizedServerUrl) {
      setBrokerHealthWarning('');
      setIsBrokerHealthChecking(false);
      return true;
    }

    const probeId = brokerHealthProbeRef.current + 1;
    brokerHealthProbeRef.current = probeId;
    // Do not clear a prior verification until this probe fails. Clearing on
    // every re-warm disabled LOGIN mid-flight while health was re-checked.
    setIsBrokerHealthChecking(true);
    setBrokerHealthWarning('');

    try {
      await checkBrokerServerHealth(normalizedServerUrl);
      if (brokerHealthProbeRef.current === probeId) {
        healthVerifiedBrokerServerUrlRef.current = normalizedServerUrl;
        setHealthVerifiedBrokerServerUrl(normalizedServerUrl);
        setBrokerHealthWarning('');
        return true;
      }
    } catch {
      if (brokerHealthProbeRef.current === probeId) {
        clearBrokerHealthVerification();
        setBrokerHealthWarning(t('Selected broker is unavailable'));
      }
    } finally {
      if (brokerHealthProbeRef.current === probeId) {
        setIsBrokerHealthChecking(false);
      }
    }
    return false;
  }, [clearBrokerHealthVerification, t]);

  const updateBrokerId = (value: string) => {
    brokerHealthProbeRef.current += 1;
    clearBrokerHealthVerification();
    brokerIdValueRef.current = value;
    setBrokerId(value);
    brokerServerUrlValueRef.current = null;
    brokerLogoUrlValueRef.current = null;
    setBrokerServerUrl('');
    setBrokerLogoUrl('');
    setBrokerHealthWarning('');
  };

  const selectBrokerOption = useCallback((option: LoginBrokerOption) => {
    const nextServerUrl = normalizeBrokerServerUrl(option.serverUrl);
    brokerIdValueRef.current = option.brokerId;
    brokerServerUrlValueRef.current = option.serverUrl;
    brokerLogoUrlValueRef.current = option.logoUrl;
    setBrokerId(option.brokerId);
    setBrokerServerUrl(option.serverUrl);
    setBrokerLogoUrl(option.logoUrl);
    // Same already-verified broker — skip clear/re-probe so LOGIN stays ready.
    if (
      nextServerUrl
      && healthVerifiedBrokerServerUrlRef.current === nextServerUrl
    ) {
      warmedBrokerServerUrlRef.current = option.serverUrl;
      setBrokerHealthWarning('');
      return;
    }
    brokerHealthProbeRef.current += 1;
    clearBrokerHealthVerification();
    warmedBrokerServerUrlRef.current = option.serverUrl;
    void probeBrokerHealth(option.serverUrl);
  }, [clearBrokerHealthVerification, probeBrokerHealth]);

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
      const resolution = resolveBrokerEndpointSet(broker);
      if (!resolution.ok) continue;
      const exactServerUrl = normalizeBrokerServerUrl(broker.server_url);
      // Handoff: keep exact directory server_url; REST is {server_url}/api/v2.
      if (
        !exactServerUrl
        || !isBrokerServerUrlForApiBase(exactServerUrl, resolution.endpoints.apiBase)
      ) {
        continue;
      }
      const brokerIdValue = broker.broker_id.trim();
      const key = normalizeBrokerKey(brokerIdValue);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        key,
        brokerId: brokerIdValue,
        brokerName: broker.broker_name?.trim() || brokerIdValue,
        serverUrl: exactServerUrl,
        logoUrl: broker.logo_url?.trim() || '',
        region: broker.region?.trim() || '',
        protocol: broker.protocol?.trim() || '',
        endpoints: resolution.endpoints,
        // Branding may use the exact host that already passed the rich-record
        // validator. Never infer a domain from a broker name or identifier.
        domain: resolution.endpoints.servicesDomain,
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
  const brokerDirectoryFailureMessage = useMemo(() => {
    if (!isBrokerServersError) return '';

    const message = brokerServersError instanceof Error
      ? brokerServersError.message
      : '';
    if (/not configured/i.test(message)) {
      return t('Broker directory configuration is missing. Reload after correcting the local app configuration.');
    }
    if (/timed out|abort/i.test(message)) {
      return t('Broker list request timed out. Check this device\'s internet connection and retry.');
    }
    if (/network|fetch|connection/i.test(message)) {
      return t('Unable to reach the broker directory. Check this device\'s internet connection and retry.');
    }
    if (/contract|invalid json|schema/i.test(message)) {
      return t('Broker directory returned invalid data. Retry or contact support.');
    }
    return t('Broker list could not be loaded. Retry before login.');
  }, [brokerServersError, isBrokerServersError, t]);

  // Pre-warm the broker connection (DNS + TCP + TLS) as soon as the screen
  // knows which server the login POST will target. With saved credentials the
  // submit press otherwise pays the full handshake on a cold socket (~0.3-1s
  // on mobile networks). The health probe hits the same host:port, so the OS
  // connection pool keeps the socket hot for the login request — measured to
  // cut POST /auth/login from ~1.1s to ~0.4s — and any "broker temporarily
  // unavailable" warning surfaces while the user is still typing instead of
  // after they press LOGIN.
  useEffect(() => {
    if (!savedCredentialsChecked) {
      return;
    }
    const serverUrl = normalizeBrokerServerUrl(selectedBrokerOption?.serverUrl || '');
    if (!serverUrl) {
      brokerHealthProbeRef.current += 1;
      warmedBrokerServerUrlRef.current = '';
      clearBrokerHealthVerification();
      setIsBrokerHealthChecking(false);
      return;
    }
    if (healthVerifiedBrokerServerUrlRef.current !== serverUrl) {
      clearBrokerHealthVerification();
    }
    if (warmedBrokerServerUrlRef.current === serverUrl) {
      return;
    }
    warmedBrokerServerUrlRef.current = serverUrl;
    void probeBrokerHealth(serverUrl);
  }, [savedCredentialsChecked, selectedBrokerOption, clearBrokerHealthVerification, probeBrokerHealth]);

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

    if (isBrokerDirectoryBusy) {
      return t('Please wait while the broker list loads.');
    }
    if (isBrokerDirectoryUnavailable) {
      return brokerDirectoryFailureMessage
        || t('No available brokers were returned. Retry the broker list before login.');
    }
    return t('Please select your broker from the broker list before login.');
  }, [
    brokerDirectoryFailureMessage,
    brokerOptions,
    isBrokerDirectoryBusy,
    isBrokerDirectoryUnavailable,
    t,
  ]);
  const brokerSelectionError = resolveBrokerSelectionError(
    (brokerIdValueRef.current ?? brokerId).trim(),
    brokerServerUrlValueRef.current || selectedBrokerServerUrl,
  );
  const exactSelectedBrokerServerUrl = normalizeBrokerServerUrl(selectedBrokerOption?.serverUrl || '');
  const isSelectedBrokerHealthVerified = Boolean(
    exactSelectedBrokerServerUrl
    && healthVerifiedBrokerServerUrl === exactSelectedBrokerServerUrl,
  );
  // Only gate on verified health for the selected host — not on a background
  // re-probe. Waiting on isBrokerHealthChecking blocked LOGIN for seconds even
  // after the host was already confirmed reachable.
  const isLoginSubmitDisabled = isLoading
    || Boolean(brokerSelectionError)
    || !isSelectedBrokerHealthVerified;

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
  }, [brokerLogoUrl, brokerServerUrl, selectedBrokerOption]);

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
    if (!directoryOption) return;

    selectBrokerOption(directoryOption);
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
          : brokerDirectoryFailureMessage
            || t('No available brokers were returned. Retry before login.'),
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
    brokerDirectoryFailureMessage,
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
    const candidateBrokerId = (brokerIdValueRef.current ?? brokerId).trim();
    const matchedOption = brokerOptions.find(
      (option) => option.key === normalizeBrokerKey(candidateBrokerId),
    );
    return {
      brokerId: candidateBrokerId,
      serverUrl: isBrokerServerUrlForApiBase(candidateServerUrl, matchedOption?.endpoints.apiBase)
        ? candidateServerUrl
        : '',
      logoUrl: brokerLogoUrlValueRef.current ?? selectedBrokerLogoUrl,
      accountId: (accountIdValueRef.current ?? accountId).trim(),
      password: passwordValueRef.current ?? password,
      endpoints: matchedOption?.endpoints ?? null,
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
    const selectedEndpoints = snapshot.endpoints;
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
    if (
      !normalizedServerUrl
      || !selectedEndpoints
      || !isBrokerServerUrlForApiBase(normalizedServerUrl, selectedEndpoints.apiBase)
    ) {
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
    if (healthVerifiedBrokerServerUrlRef.current !== normalizedServerUrl) {
      const unavailableMessage = t('Selected broker is unavailable');
      setIsLoading(false);
      setBrokerHealthWarning(unavailableMessage);
      recordAccountJournalEvent('login blocked: selected broker health not verified', {
        level: 'error',
        accountLogin: normalizedAccountId,
      });
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: unavailableMessage,
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
    const commitAuthorization = authorizeBrokerSessionCommit();
    const loginAbortController = new AbortController();
    activeLoginAttemptRef.current = {
      authorization: commitAuthorization,
      controller: loginAbortController,
    };
    let didStartSuccessNavigation = false;
    // Kick the POST before React loading-state re-render work so the network
    // RTT starts in this same touch turn.
    const loginRequestPromise = loginAPI({
      username: normalizedAccountId,
      password: currentPassword,
      broker_id: normalizedBrokerId,
    }, { serverUrl: normalizedServerUrl, signal: loginAbortController.signal });
    setIsLoading(true);
    recordAccountJournalEvent(`login requested for broker ${normalizedBrokerId}`, {
      accountLogin: normalizedAccountId,
    });
    try {
      const response: any = await loginRequestPromise;

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
        console.warn('[Login] Unexpected auth response shape', {
          hasAccessToken: Boolean(accessToken),
          hasAccountLogin: Boolean(accountLogin),
        });
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
      if (normalizeBrokerKey(canonicalBrokerId) !== normalizeBrokerKey(selectedEndpoints.brokerId)) {
        throw new Error(t('Login response did not match the selected broker.'));
      }
      const immediateServerName = serverName || canonicalBrokerId;
      const savedLogin = String(accountLogin);
      const accountEnvironmentEvidence = resolveAccountEnvironment(response, true);
      const resolvedAccountType = accountEnvironmentEvidence.accountType;
      const accountEnvironmentKey = buildAccountEnvironmentKey(
        selectedEndpoints.brokerId,
        savedLogin,
      );
      const matchingSavedAccount = useSavedAccounts.getState().accounts.find(
        (account) =>
          buildAccountEnvironmentKey(account.brokerId, account.login) === accountEnvironmentKey,
      );
      const previousAccountEnvironment: AccountEnvironmentState | null =
        matchingSavedAccount && matchingSavedAccount.accountType !== 'unknown'
          ? {
              accountKey: accountEnvironmentKey,
              accountType: matchingSavedAccount.accountType,
              accountEnvironmentSource: matchingSavedAccount.accountEnvironmentSource,
              isDemoAccount: matchingSavedAccount.accountType === 'demo',
            }
          : null;
      const initialAccountEnvironment = mergeAccountEnvironment(previousAccountEnvironment, {
        accountKey: accountEnvironmentKey,
        resolved: resolvedAccountType,
        source: accountEnvironmentEvidence.source,
        allowInitialFallback: true,
      })!;
      const accountType = initialAccountEnvironment.accountType;
      const accountEnvironmentSource = initialAccountEnvironment.accountEnvironmentSource;
      const responseAccountGroup = readRawAccountGroup(response);
      const sessionFeed = resolveSessionFeedAuth({
        response,
        brokerId: selectedEndpoints.brokerId,
        accountLogin: normalizedAccountId,
      });

      const committedSession = await commitBrokerSession({
        session: {
          brokerId: selectedEndpoints.brokerId,
          accountLogin: savedLogin,
          apiBase: selectedEndpoints.apiBase,
          feedWsBase: selectedEndpoints.feedWsBase,
          tradeWsBase: selectedEndpoints.tradeWsBase,
          feedStatusUrl: selectedEndpoints.feedStatusUrl,
          servicesDomain: selectedEndpoints.servicesDomain,
          feedAuthContext: sessionFeed.feedAuthContext,
          configVersion: selectedEndpoints.configVersion,
        },
        credentials: {
          accessToken,
          refreshToken: refreshToken ?? '',
          expiresAt: expiresAtIso,
          ...(sessionFeed.feedToken ? { feedToken: sessionFeed.feedToken } : {}),
        },
        account: {
          name: accountName,
          serverName: immediateServerName,
          logoUrl: selectedLogoUrl,
          accountType,
          accountEnvironmentSource,
        },
      }, commitAuthorization);
      const committedProvenance = getActiveBrokerSessionProvenance(committedSession.session);
      recordAccountJournalEvent(`login succeeded on ${canonicalBrokerId}`, {
        level: 'success',
        accountLogin: savedLogin,
      });

      router.replace('/(tabs)/quotes');
      didStartSuccessNavigation = true;
      schedulePostLoginWork(() => {
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
          accountEnvironmentSource,
          ...(responseAccountGroup ? { rawGroup: responseAccountGroup } : {}),
          lastUsedAt: Date.now(),
          hasCredentials: true,
        });
        // The saved row must exist before bootstrap can return classification
        // evidence; otherwise a fast response would update only canonical
        // session state and the following seed write could persist stale data.
        void bootstrapApp({
          accountLogin: savedLogin,
          expectedProvenance: committedProvenance,
        }).catch((err) => {
          console.warn('[Login] Post-login bootstrap failed', redactAuthPayload(err));
        });
        setSavedAccountPassword(canonicalBrokerId, savedLogin, currentPassword).catch((err) => {
          console.warn('[Login] Failed to persist saved-account credential', redactAuthPayload(err));
        });

        // Refresh session-scoped caches after navigation has started.
        void invalidateSessionQueryRoots(
          queryClient,
          committedSession.session.cacheNamespace,
          ['accountsList', 'accountDetail', 'brokerConfig'],
        );

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

        if (!isActiveBrokerSessionProvenanceCurrent(committedProvenance)) return;
        void getBrokerConfig(canonicalBrokerId)
          .then((brokerConfig) => {
            if (!isActiveBrokerSessionProvenanceCurrent(committedProvenance)) return;
            queryClient.setQueryData(
              getBrokerConfigQueryKey(committedSession.session.cacheNamespace, canonicalBrokerId),
              brokerConfig,
            );
            if (canonicalBrokerId !== normalizedBrokerId) {
              queryClient.setQueryData(
                getBrokerConfigQueryKey(committedSession.session.cacheNamespace, normalizedBrokerId),
                brokerConfig,
              );
            }
            if (brokerConfig.server_name && brokerConfig.server_name !== immediateServerName) {
              // Bootstrap may have refreshed the environment while this
              // independent broker-config request was in flight. Re-read the
              // account row so this late metadata write cannot restore stale
              // login-time classification evidence.
              const latestSavedAccount = useSavedAccounts.getState().accounts.find(
                (account) =>
                  buildAccountEnvironmentKey(account.brokerId, account.login)
                  === accountEnvironmentKey,
              );
              const latestRawGroup =
                latestSavedAccount?.rawGroup ?? responseAccountGroup;
              upsertSavedAccount({
                login: savedLogin,
                name: accountName,
                brokerId: canonicalBrokerId,
                server: brokerConfig.server_name,
                serverUrl: normalizedServerUrl,
                logoUrl: selectedLogoUrl,
                accountType: latestSavedAccount?.accountType ?? accountType,
                accountEnvironmentSource:
                  latestSavedAccount?.accountEnvironmentSource ?? accountEnvironmentSource,
                ...(latestRawGroup ? { rawGroup: latestRawGroup } : {}),
                lastUsedAt: Date.now(),
                hasCredentials: true,
              });
            }
          })
          .catch((err) => {
            console.warn('[Login] Broker config refresh failed after login', redactAuthPayload(err));
          });
      });
      
    } catch (error: any) {
      if (
        !loginMountedRef.current ||
        isLoginRequestAbortedError(error) ||
        isStaleBrokerSessionCommitError(error)
      ) {
        return;
      }
      const safeErrorMessage = redactSensitiveString(
        typeof error?.message === 'string' && error.message.trim()
          ? error.message
          : t('Invalid credentials'),
      );
      recordAccountJournalEvent(`login failed: ${safeErrorMessage}`, {
        level: 'error',
        accountLogin: normalizedAccountId,
      });
      setModalState({ visible: true, type: 'error', title: t('Login Failed'), message: safeErrorMessage });
    } finally {
      loginRequestInFlightRef.current = false;
      cancelBrokerSessionCommitAuthorization(commitAuthorization);
      if (activeLoginAttemptRef.current?.authorization === commitAuthorization) {
        activeLoginAttemptRef.current = null;
      }
      if (!didStartSuccessNavigation) {
        if (loginMountedRef.current) {
          setIsLoading(false);
        }
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
      // Snapshot + kick auth first. Spinner is set inside handleLogin only after
      // validation passes and the POST has already been started.
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
            activateOnPressIn
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
                        {brokerDirectoryFailureMessage}
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
                activateOnPressIn
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
/**
 * Main entry point for authentication. Allows the user to select an existing account or proceed to login with a new account.
 */
export default function LoginScreen() {
  return <AccountLoginScreen />;
}

function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  const pageBg = T.bg;
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
