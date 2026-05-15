/**
 * Settings Feature UI: AccountsScreen
 * 
 * Central hub for managing multiple trading accounts. Displays the active 
 * connection status (live ping/health), balances across connected accounts,
 * and handles credential management (passwords, QR codes).
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { useQueryClient } from '@tanstack/react-query';


import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useMemo } from 'react';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import {
  getSavedAccountPassword,
  removeSavedAccountPassword,
  useSavedAccounts,
  type SavedAccountSnapshot,
  type SavedAccountType,
} from '../../state/savedAccounts';
import { signInWithCredentials } from '../../api/authSession';
import { fmt } from '../../utils/format';
import { ChangePasswordSheet } from './ChangePasswordSheet';
import { QRCodeSheet } from './QRCodeSheet';
import { ActionSheet } from '../../ui/components/ActionSheet';


// ── API Integration: fetches live account + broker data for active card ──
import {
  ACCOUNTS_LIST_KEY,
  ACCOUNT_DETAIL_KEY,
  useAccountDetails,
  useAccounts,
} from '../../query/accounts';
import { BROKER_CONFIG_KEY, useBrokerConfig } from '../../query/broker';
import { useHealth } from '../../query/health';
import { useMt5Status } from '../../query/mt5';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveAccountState } from '../../state/liveAccountState';
import { traceUiInteraction } from '../../dev/uiInteractionDiagnostics';
import { useTranslation } from '../../i18n/useTranslation';
import { translateAccountCardName } from '../../i18n/translations';
import {
  getTradingAccountBadgeLabel,
  getTradingAccountType,
  isDemoTradingAccount,
} from '../../domain/accountType';
import type { TradingAccount } from '../../api/accounts';

type OtherAccountRow = {
  key: string;
  login: string;
  name: string;
  brokerId: string;
  server: string;
  accountType: SavedAccountType;
  hasSavedCredentials: boolean;
  snapshot: SavedAccountSnapshot | null;
  liveAccount: TradingAccount | null;
};

const buildSavedAccountSnapshot = (account: TradingAccount): SavedAccountSnapshot => ({
  balance: account.balance,
  equity: account.equity,
  freeMargin: account.freeMargin,
  leverage: account.leverage,
  floatingPnl: account.floatingPnl,
  openPositions: account.openPositions,
  currency: account.currency,
  updatedAt: account.updatedAt,
});

const areSavedAccountSnapshotsEqual = (
  left: SavedAccountSnapshot | undefined,
  right: SavedAccountSnapshot,
) => {
  if (!left) return false;
  return left.balance === right.balance
    && left.equity === right.equity
    && left.freeMargin === right.freeMargin
    && left.leverage === right.leverage
    && left.floatingPnl === right.floatingPnl
    && left.openPositions === right.openPositions
    && left.currency === right.currency
    && left.updatedAt === right.updatedAt;
};

export function AccountsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const showActionSheet = useUIState((s) => s.showActionSheet);
  const actionSheet = useUIState((s) => s.actionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const isDemoAccount = useUserPreferences((s) => s.isDemoAccount);
  const userLogin = useUserPreferences((s) => s.login);
  const setIsDemoAccountFlag = useUserPreferences((s) => s.setIsDemoAccount);
  const savedAccounts = useSavedAccounts((s) => s.accounts);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  const removeSavedAccount = useSavedAccounts((s) => s.removeAccount);
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);

  // ── GET /accounts — live trading accounts for the authenticated user ──
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const { data: accounts } = useAccounts(isLoggedIn);

  // ── GET /broker/config — broker name and server name ──
  const brokerId = useUserPreferences((s) => s.brokerId);
  const { data: brokerConfig } = useBrokerConfig(brokerId);

  // Find the active account by matching the login from Zustand state
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const listedAccount = accounts?.find((a) => a.login === currentLogin) ?? accounts?.[0];
  const activeLogin = listedAccount?.login ?? currentLogin;
  const { data: activeAccountDetails } = useAccountDetails(activeLogin, isLoggedIn && !!activeLogin);
  const activeAccount = activeAccountDetails ?? listedAccount;
  const activeIsDemo = activeAccount ? isDemoTradingAccount(activeAccount.group) : isDemoAccount;
  const activeRibbonLabel = t(activeIsDemo ? 'Demo' : 'Real');
  const activeBadgeLabel = t(activeAccount ? getTradingAccountBadgeLabel(activeAccount.group) : (isDemoAccount ? 'Demo' : 'Live'));

  // Build the unified "Other Connected Accounts" list. We merge two sources:
  //   1. `accounts` from /accounts — sub-accounts of the current session
  //      (full live balance/equity), excluding the active account.
  //   2. The persistent saved-accounts directory — accounts the user logged
  //      into in prior sessions, even on different brokers.
  // Entries are deduped by `${brokerId}:${login}`. When both sources have the
  // same key, we keep the live data (richer) but treat credentials as saved.
  const activeBrokerId = brokerId;
  const activeLoginStr = activeAccount
    ? String(activeAccount.login)
    : accountDetails?.id ?? '';
  const activeKey = `${activeBrokerId}:${activeLoginStr}`;

  const otherRows: OtherAccountRow[] = useMemo(() => {
    const map = new Map<string, OtherAccountRow>();

    for (const sa of savedAccounts) {
      const key = `${sa.brokerId}:${sa.login}`;
      if (key === activeKey) continue;
      map.set(key, {
        key,
        login: sa.login,
        name: sa.name,
        brokerId: sa.brokerId,
        server: sa.server,
        accountType: sa.accountType,
        hasSavedCredentials: sa.hasCredentials,
        snapshot: sa.snapshot ?? null,
        liveAccount: null,
      });
    }

    for (const a of accounts ?? []) {
      const loginStr = String(a.login);
      const key = `${activeBrokerId}:${loginStr}`;
      if (key === activeKey) continue;
      const existing = map.get(key);
      const accountType: SavedAccountType = existing?.accountType ?? getTradingAccountType(a.group);
      map.set(key, {
        key,
        login: loginStr,
        name: a.name,
        brokerId: activeBrokerId,
        server: existing?.server || brokerConfig?.server_name || '',
        accountType,
        hasSavedCredentials: existing?.hasSavedCredentials ?? false,
        snapshot: buildSavedAccountSnapshot(a),
        liveAccount: a,
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      // Live entries first (they have actionable balances), then saved-only.
      if (!!a.liveAccount !== !!b.liveAccount) return a.liveAccount ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [accounts, activeBrokerId, activeKey, brokerConfig?.server_name, savedAccounts]);

  // Backfill the active session into the directory so accounts that were
  // logged in before this feature shipped (or pre-existing sessions on first
  // open) show up once the user signs into another account. The entry has
  // hasCredentials=false until the user signs in via the form again.
  React.useEffect(() => {
    if (!isLoggedIn || !activeAccount) return;
    if (!activeBrokerId || !activeLoginStr) return;
    const existing = savedAccounts.find(
      (sa) => sa.brokerId === activeBrokerId && sa.login === activeLoginStr,
    );
    const snapshot = buildSavedAccountSnapshot(activeAccount);
    const nextName = activeAccount.name || `Account ${activeLoginStr}`;
    const nextServer = brokerConfig?.server_name || activeBrokerId;
    const nextType = getTradingAccountType(activeAccount.group);
    if (
      existing
      && existing.name === nextName
      && existing.server === nextServer
      && existing.accountType === nextType
      && areSavedAccountSnapshotsEqual(existing.snapshot, snapshot)
    ) {
      return;
    }
    upsertSavedAccount({
      login: activeLoginStr,
      name: nextName,
      brokerId: activeBrokerId,
      server: nextServer,
      accountType: nextType,
      lastUsedAt: existing?.lastUsedAt ?? Date.now(),
      hasCredentials: existing?.hasCredentials ?? false,
      snapshot,
    });
  }, [
    activeAccount,
    activeBrokerId,
    activeLoginStr,
    brokerConfig?.server_name,
    isLoggedIn,
    savedAccounts,
    upsertSavedAccount,
  ]);

  // ── Live WebSocket account metrics (real-time balance/equity from accountSocket) ──
  const liveLogin = useLiveAccountState((s) => s.login);
  const liveBalance = useLiveAccountState((s) => s.balance);
  const liveEquity = useLiveAccountState((s) => s.equity);
  const liveMarginFree = useLiveAccountState((s) => s.margin_free);
  const liveFloating = useLiveAccountState((s) => s.floating);
  const liveMetricFlags = useLiveAccountState((s) => s.metricFlags);

  // Extract the essential display values — prefer live WS data, fall back to REST API
  const displayLogin = activeAccount ? String(activeAccount.login) : (accountDetails?.id ?? '---');
  const rawDisplayName = activeAccount?.name?.trim() || (displayLogin !== '---' ? `Account ${displayLogin}` : '---');
  const displayName = rawDisplayName === '---' ? rawDisplayName : translateAccountCardName(rawDisplayName, t);
  const displayCurrency = activeAccount?.currency ?? 'USD';
  const liveMatchesActiveAccount = liveLogin !== 0 && (!activeAccount || liveLogin === activeAccount.login);
  const displayBalance = liveMetricFlags.balance && liveMatchesActiveAccount ? fmt.price(liveBalance) : activeAccount ? fmt.price(activeAccount.balance) : '---';
  const displayEquity = liveMetricFlags.equity && liveMatchesActiveAccount ? fmt.price(liveEquity) : activeAccount ? fmt.price(activeAccount.equity) : '---';
  const displayLeverage = activeAccount ? `1:${activeAccount.leverage}` : '---';
  const displayFreeMargin = liveMetricFlags.margin_free && liveMatchesActiveAccount ? fmt.price(liveMarginFree) : activeAccount ? fmt.price(activeAccount.freeMargin) : '---';
  const displayFloatingPnl = liveMetricFlags.floating && liveMatchesActiveAccount ? liveFloating : (activeAccount?.floatingPnl ?? 0);
  const displayOpenPositions = activeAccount?.openPositions ?? 0;
  const displayBrokerName = brokerConfig?.broker_name ?? '---';
  const displayServerName = brokerConfig?.server_name ?? '---';

  console.log('[AccountsScreen] activeAccount:', activeAccount ? { login: activeAccount.login, balance: activeAccount.balance, equity: activeAccount.equity, freeMargin: activeAccount.freeMargin, floatingPnl: activeAccount.floatingPnl, currency: activeAccount.currency } : 'none');
  console.log('[AccountsScreen] live WS metrics:', { liveBalance, liveEquity, liveMarginFree, liveFloating });
  console.log('[AccountsScreen] display values:', { displayBalance, displayEquity, displayFreeMargin, displayFloatingPnl, displayCurrency });

  const { data: health } = useHealth();
  const { data: mt5Status } = useMt5Status();

  const handleConnectAccount = () => {
    showActionSheet({
      title: t('Connect account'),
      actions: [
        { label: t('Login Account'), onPress: () => router.push('/login') },
      ],
    });
  };

  const [connectingKey, setConnectingKey] = React.useState<string | null>(null);
  const [expandedAccountKey, setExpandedAccountKey] = React.useState<string | null>(null);
  const [passwordSheetVisible, setPasswordSheetVisible] = React.useState(false);
  const [passwordType, setPasswordType] = React.useState<'master' | 'investor'>('master');
  const [successMessage, setSuccessMessage] = React.useState('');
  const [qrSheetVisible, setQRSheetVisible] = React.useState(false);
  const [qrData, setQRData] = React.useState('');

  const handleConnectSavedAccount = async (row: OtherAccountRow) => {
    if (connectingKey) return;
    setConnectingKey(row.key);
    try {
      if (!row.hasSavedCredentials) {
        Alert.alert(
          t('Password not saved'),
          t('Sign in to this account once so it can be reconnected with one tap next time.'),
        );
        router.push('/login');
        return;
      }

      const password = await getSavedAccountPassword(row.brokerId, row.login);
      if (!password) {
        // Saved entry exists but secure-store lost the credential — clear the
        // stale flag so the directory matches reality and prompt re-login.
        removeSavedAccount(row.login, row.brokerId);
        Alert.alert(
          t('Password not saved'),
          t('Sign in to this account once so it can be reconnected with one tap next time.'),
        );
        router.push('/login');
        return;
      }

      const result = await signInWithCredentials({
        username: row.login,
        password,
        brokerId: row.brokerId,
      });

      userLogin(
        result.accountLogin,
        result.accountName,
        result.serverName || row.server || result.brokerId,
        {
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
          expires_at: result.expiresAtIso,
        },
        result.brokerId,
      );
      setIsDemoAccountFlag(result.accountType === 'demo');
      upsertSavedAccount({
        login: result.accountLogin,
        name: result.accountName || row.name,
        brokerId: result.brokerId,
        server: result.serverName || row.server,
        accountType: result.accountType,
        lastUsedAt: Date.now(),
        hasCredentials: true,
      });

      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_LIST_KEY] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNT_DETAIL_KEY] });
      queryClient.invalidateQueries({ queryKey: [BROKER_CONFIG_KEY] });

      setSuccessMessage(t('Account switched successfully'));
    } catch (error: any) {
      Alert.alert(t('Switch failed'), error?.message || t('Unable to switch account.'));
    } finally {
      setConnectingKey(null);
    }
  };

  const handleRemoveSavedAccount = (row: OtherAccountRow) => {
    Alert.alert(
      t('Remove account?'),
      t('This will remove this account from the list on this device. You can sign in again to add it back.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => {
            removeSavedAccount(row.login, row.brokerId);
            removeSavedAccountPassword(row.brokerId, row.login).catch(() => undefined);
          },
        },
      ],
    );
  };

  const openQRSheet = (loginId: string) => {
    setQRData(loginId);
    setQRSheetVisible(true);
  };

  const openPasswordSheet = (type: 'master' | 'investor') => {
    setPasswordType(type);
    setPasswordSheetVisible(true);
  };

  const openOptions = () => {
    showActionSheet({
      title: t('Settings'),
      actions: [
        { label: t('Change master password'), onPress: () => openPasswordSheet('master') },
        { label: t('Change investor password'), onPress: () => openPasswordSheet('investor') },
        { label: t('Clear saved password') },
        { label: t('Delete account'), danger: true },
      ],
    });
  };

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} hitSlop={15} onPress={() => router.back()} unstable_pressDelay={0}>
            <Ionicons name="arrow-back" size={28} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Accounts')}</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.iconBtn}
              hitSlop={10}
              onPress={() => traceUiInteraction('accounts.certification.open', () => Alert.alert(t('Certification'), t('Certification info will be displayed here.')))}
              unstable_pressDelay={0}
            >
              <Ionicons name="ribbon-outline" size={24} color={T.text} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              hitSlop={10}
              onPress={() => traceUiInteraction('accounts.connect.open', handleConnectAccount)}
              unstable_pressDelay={0}
            >
              <Ionicons name="add" size={30} color={T.text} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              hitSlop={10}
              onPress={() => traceUiInteraction('accounts.options.open', openOptions)}
              unstable_pressDelay={0}
            >
              <Ionicons name="ellipsis-vertical" size={24} color={T.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* ── Active Account Card ── */}
          <View style={styles.activeCard}>
            {/* Corner ribbons */}
            {!activeIsDemo && (
              <View style={styles.ribbonRightContest}><Text style={styles.ribbonRightText}>{activeRibbonLabel}</Text></View>
            )}
            {activeIsDemo && (
              <View style={styles.ribbonRightDemo}><Text style={styles.ribbonRightText}>{activeRibbonLabel}</Text></View>
            )}
            {/* Top: Avatar + Name + Connected badge */}
            <View style={styles.activeTopRow}>
              <View style={styles.avatarWrap}>
                <Image source={require('../../../assets/rtx5-app-icon.png')} style={styles.avatarImage} />
              </View>
              <View style={styles.activeInfoCol}>
                <View style={styles.nameAndBadges}>
                  <Text style={styles.activeName} numberOfLines={1}>{displayName}</Text>
                  <View style={styles.badgesRow}>
                    {!activeIsDemo && (
                      <View style={styles.liveBadge}>
                        <Text style={styles.liveBadgeText}>{activeBadgeLabel}</Text>
                      </View>
                    )}
                    <View style={styles.connectedBadge}>
                      <View style={styles.connectedDot} />
                      <Text style={styles.connectedLabel}>{t('Connected')}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.activeCompany}>{displayBrokerName}</Text>
              </View>
            </View>

            {/* Balance — hero section */}
            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>{t('Balance')}</Text>
              <Text style={styles.balanceValue}>{displayBalance} <Text style={styles.balanceCurrency}>{displayCurrency}</Text></Text>
            </View>

            {/* Metrics grid */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Equity')}</Text>
                <Text style={styles.metricValue}>{displayEquity}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Free Margin')}</Text>
                <Text style={styles.metricValue}>{displayFreeMargin}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Leverage')}</Text>
                <Text style={styles.metricValue}>{displayLeverage}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('Floating P/L')}</Text>
                <Text style={[styles.metricValue, { color: displayFloatingPnl >= 0 ? '#10B981' : '#EF4444' }]} numberOfLines={1}>{displayFloatingPnl >= 0 ? '+' : ''}{fmt.price(displayFloatingPnl)}</Text>
              </View>
            </View>

            {/* Detail chips row */}
            <View style={styles.detailChipsRow}>
              <View style={styles.detailChip}>
                <Ionicons name="key-outline" size={13} color={T.textMuted} />
                <Text style={styles.detailChipText}>{displayLogin}</Text>
              </View>
              <View style={styles.detailChip}>
                <Ionicons name="server-outline" size={13} color={T.textMuted} />
                <Text style={styles.detailChipText}>{displayServerName}</Text>
              </View>
              <View style={styles.detailChip}>
                <Ionicons name="briefcase-outline" size={13} color={T.textMuted} />
                <Text style={styles.detailChipText}>{displayOpenPositions} {t('open')}</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.activeDivider} />

            {/* Status + Actions row */}
            <View style={styles.activeFooter}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: mt5Status?.connected ? '#10B981' : '#94A3B8' }]} />
                <Text style={styles.statusText}>Orrnn</Text>
                <View style={styles.statusSep} />
                <View style={[styles.statusDot, { backgroundColor: health?.status === 'healthy' ? '#10B981' : '#94A3B8' }]} />
                <Text style={styles.statusText}>{t('Gateway')}</Text>
              </View>
              <View style={styles.activeActions}>
                <Pressable style={styles.actionIcon} onPress={() => openQRSheet(displayLogin)} hitSlop={12}>
                  <Ionicons name="qr-code-outline" size={16} color={T.textMuted} />
                </Pressable>
                <Pressable style={styles.actionIcon} hitSlop={12}>
                  <Ionicons name="notifications-outline" size={16} color={T.textMuted} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Other Accounts ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>{t('Other Accounts')}</Text>
            {otherRows.length > 0 && (
              <Text style={styles.sectionCount}>{otherRows.length}</Text>
            )}
          </View>

          {otherRows.length === 0 && (
            <View style={styles.emptyOtherCard}>
              <Ionicons name="people-outline" size={20} color={T.textDimmed} />
              <Text style={styles.emptyOtherTitle}>{t('No other accounts yet')}</Text>
              <Text style={styles.emptyOtherText}>
                {t('Sign in to another real, demo or contest account to switch between them with one tap.')}
              </Text>
              <Pressable
                style={styles.emptyOtherButton}
                onPress={() => traceUiInteraction('accounts.connect.open', handleConnectAccount)}
              >
                <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
                <Text style={styles.emptyOtherButtonText}>{t('Add account')}</Text>
              </Pressable>
            </View>
          )}

          {otherRows.map((row) => {
            const ribbonLabel = t(
              row.accountType === 'demo'
                ? 'Demo'
                : row.accountType === 'contest'
                  ? 'Contest'
                  : 'Real',
            );
            const accountDisplayName = translateAccountCardName(row.name || `Account ${row.login}`, t);
            const isSwitching = connectingKey === row.key;
            const live = row.liveAccount;
            const metrics = live ? buildSavedAccountSnapshot(live) : row.snapshot;
            const isExpanded = expandedAccountKey === row.key;
            const ribbonStyle = row.accountType === 'demo' ? styles.ribbonRightDemo : styles.ribbonRightContest;
            const serverLabel = row.server || displayServerName;
            const balanceText = metrics ? fmt.price(metrics.balance) : '---';
            const equityText = metrics ? fmt.price(metrics.equity) : '---';
            const freeMarginText = metrics ? fmt.price(metrics.freeMargin) : '---';
            const leverageText = metrics ? `1:${metrics.leverage}` : '---';
            const floatingPnl = metrics?.floatingPnl ?? 0;
            const floatingPnlText = metrics ? `${floatingPnl >= 0 ? '+' : ''}${fmt.price(floatingPnl)}` : '---';
            const openPositionsText = metrics ? String(metrics.openPositions) : '---';
            const switchButton = (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Switch to this account')}
                style={[styles.connectButton, isSwitching && styles.connectButtonBusy]}
                onPress={() => handleConnectSavedAccount(row)}
                disabled={isSwitching || !!connectingKey}
                hitSlop={6}
              >
                {isSwitching ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
                    <Text style={styles.connectButtonText}>{t('Switch')}</Text>
                  </>
                )}
              </Pressable>
            );

            return (
              <Pressable
                key={row.key}
                style={[styles.secondaryCard, isExpanded && styles.secondaryCardExpanded]}
                onPress={() => setExpandedAccountKey(isExpanded ? null : row.key)}
                onLongPress={() => handleRemoveSavedAccount(row)}
                delayLongPress={400}
              >
                {/* Diagonal ribbon */}
                <View style={ribbonStyle}>
                  <Text style={styles.ribbonRightText}>{ribbonLabel}</Text>
                </View>

                {/* Top row: avatar + name + type pill — mirrors active card */}
                <View style={styles.secondaryTopRow}>
                  <View style={styles.secondaryLeft}>
                    <View style={styles.secondaryAvatar}>
                      <Image source={require('../../../assets/rtx5-app-icon.png')} style={styles.secondaryAvatarImage} />
                    </View>
                    <View style={styles.secondaryInfo}>
                      <View style={styles.nameAndBadges}>
                        <Text style={styles.secondaryName} numberOfLines={1}>{accountDisplayName}</Text>
                        {row.accountType !== 'demo' && (
                          <View style={styles.liveBadge}>
                            <Text style={styles.liveBadgeText}>{ribbonLabel}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.secondaryMeta} numberOfLines={1}>
                        {row.login} · {serverLabel || row.brokerId}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={T.textDimmed}
                  />
                </View>

                {isExpanded && (
                  <>
                    {/* Balance hero — mirrors active card */}
                    <View style={styles.balanceSection}>
                      <Text style={styles.balanceLabel}>{t('Balance')}</Text>
                      <Text style={styles.balanceValue}>
                        {balanceText}{' '}
                        {metrics ? <Text style={styles.balanceCurrency}>{metrics.currency}</Text> : null}
                      </Text>
                    </View>

                    {/* Metrics grid — same fields as active card */}
                    <View style={styles.metricsGrid}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Equity')}</Text>
                        <Text style={styles.metricValue}>{equityText}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Free Margin')}</Text>
                        <Text style={styles.metricValue}>{freeMarginText}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Leverage')}</Text>
                        <Text style={styles.metricValue}>{leverageText}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{t('Floating P/L')}</Text>
                        <Text
                          style={[styles.metricValue, metrics && { color: floatingPnl >= 0 ? '#10B981' : '#EF4444' }]}
                          numberOfLines={1}
                        >
                          {floatingPnlText}
                        </Text>
                      </View>
                    </View>

                    {/* Detail chips */}
                    <View style={styles.detailChipsRow}>
                      <View style={styles.detailChip}>
                        <Ionicons name="key-outline" size={13} color={T.textMuted} />
                        <Text style={styles.detailChipText}>{row.login}</Text>
                      </View>
                      <View style={styles.detailChip}>
                        <Ionicons name="server-outline" size={13} color={T.textMuted} />
                        <Text style={styles.detailChipText}>{serverLabel || row.brokerId}</Text>
                      </View>
                      <View style={styles.detailChip}>
                        <Ionicons name="briefcase-outline" size={13} color={T.textMuted} />
                        <Text style={styles.detailChipText}>{openPositionsText} {t('open')}</Text>
                      </View>
                    </View>

                    <View style={styles.activeDivider} />

                    {/* Footer: status + Switch button */}
                    <View style={styles.activeFooter}>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: mt5Status?.connected ? '#10B981' : '#94A3B8' }]} />
                        <Text style={styles.statusText}>Orrnn</Text>
                        <View style={styles.statusSep} />
                        <View style={[styles.statusDot, { backgroundColor: health?.status === 'healthy' ? '#10B981' : '#94A3B8' }]} />
                        <Text style={styles.statusText}>{t('Gateway')}</Text>
                      </View>
                      {switchButton}
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}

        </ScrollView>
      </View>

      {passwordSheetVisible && (
        <View style={styles.modalOverlay} pointerEvents="box-none">
          {/* Background tap to close */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPasswordSheetVisible(false)} />

          <View style={styles.modalContent}>
            <ChangePasswordSheet
              loginId={displayLogin}
              type={passwordType}
              onClose={() => setPasswordSheetVisible(false)}
              onSuccess={() => {
                setPasswordSheetVisible(false);
                setSuccessMessage(`${t(passwordType === 'master' ? 'Master' : 'Investor')} ${t('password change successfully')}`);
              }}
            />
          </View>
        </View>
      )}

      {qrSheetVisible && (
        <View style={styles.modalOverlay} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setQRSheetVisible(false)} />
          <View style={styles.modalContent}>
            <QRCodeSheet data={qrData} onClose={() => setQRSheetVisible(false)} />
          </View>
        </View>
      )}

      {/* Success Modal */}
      {!!successMessage && (
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSuccessMessage('')} />
          <View style={styles.successModal}>
            <View style={styles.successIconBox}>
              <Ionicons name="checkmark" size={32} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{t('Success')}</Text>
            <Text style={styles.successDesc}>{successMessage}</Text>
            <Pressable style={styles.successBtn} onPress={() => setSuccessMessage('')}>
              <Text style={styles.successBtnText}>{t('OK')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ActionSheet — rendered locally since this is a Stack route outside (tabs) */}
      <ActionSheet
        visible={actionSheet !== null}
        title={actionSheet?.title}
        actions={actionSheet?.actions ?? []}
        onClose={hideActionSheet}
        searchable={actionSheet?.searchable}
        detent={actionSheet?.detent}
        minimumTopInset={actionSheet?.minimumTopInset}
        instantOpen={actionSheet?.instantOpen}
        runActionAfterClose={actionSheet?.runActionAfterClose}
      />
    </Screen>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: T.bgRoot,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 999,
  },
  modalContent: {
    width: '100%',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: safeTop + 8,
    paddingBottom: 16,
    backgroundColor: T.bgRoot,
  },
  headerTitle: {
    color: T.text,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginLeft: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // ── Active Card ──
  activeCard: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: isDark ? '#0E1420' : '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(0,0,0,0.06)',
    padding: 10,
    shadowColor: isDark ? '#3B82F6' : '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.06 : 0.04,
    shadowRadius: 20,
    elevation: 4,
    overflow: 'hidden',
  },
  ribbonRightContest: {
    position: 'absolute',
    top: -3,
    right: -55,
    backgroundColor: '#3B82F6',
    width: 140,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 6,
    transform: [{ rotate: '45deg' }],
    zIndex: 10,
  },
  ribbonRightDemo: {
    position: 'absolute',
    top: -3,
    right: -55,
    backgroundColor: '#10B981',
    width: 140,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 6,
    transform: [{ rotate: '45deg' }],
    zIndex: 10,
  },
  ribbonRightText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ribbonLeft: {
    position: 'absolute',
    top: 14,
    left: -30,
    backgroundColor: '#10B981',
    paddingVertical: 4,
    paddingHorizontal: 32,
    transform: [{ rotate: '-45deg' }],
    zIndex: 10,
  },
  ribbonLeftText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: T.accent,
    fontSize: 20,
    fontWeight: '800',
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 14,
  },
  activeInfoCol: {
    flex: 1,
  },
  activeName: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  activeCompany: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  connectedLabel: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nameAndBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  demoBadgeActive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  demoBadgeActiveText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  liveBadge: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgeText: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // Balance hero
  balanceSection: {
    marginBottom: 8,
  },
  balanceLabel: {
    color: T.textDimmed,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  balanceValue: {
    color: T.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'] as any,
  },

  balanceCurrency: {
    color: T.textDimmed,
    fontSize: 18,
    fontWeight: '600',
  },

  // Metrics grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  metricItem: {
    width: '47%' as any,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 48,
  },
  metricLabel: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metricValue: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },

  // Detail chips
  detailChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  detailChipText: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },

  activeDivider: {
    height: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    marginBottom: 12,
  },

  // Footer
  activeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
  },
  statusSep: {
    width: 1,
    height: 10,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    marginHorizontal: 4,
  },
  activeActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionLabel: {
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionCount: {
    color: T.textDimmed,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // ── Secondary cards ──
  secondaryCard: {
    backgroundColor: isDark ? '#0E1420' : '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(0,0,0,0.06)',
    padding: 10,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: isDark ? '#3B82F6' : '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.06 : 0.04,
    shadowRadius: 20,
    elevation: 4,
  },
  secondaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  secondaryAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  secondaryAvatarText: {
    color: T.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  secondaryInfo: {
    flex: 1,
  },
  secondaryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryName: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  tagDemo: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tagDemoText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tagContest: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tagContestText: {
    color: '#3B82F6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tagReadonly: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tagReadonlyText: {
    color: T.textDimmed,
    fontSize: 9,
    fontWeight: '800',
  },
  secondaryMeta: {
    color: T.textDimmed,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  secondaryBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 10,
    paddingLeft: 50,
  },
  secondaryRight: {
    alignItems: 'flex-end',
  },
  secondaryBalance: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  secondaryCurrency: {
    color: T.textDimmed,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  secondaryCardExpanded: {
    borderColor: isDark ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.18)',
  },
  secondaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  expandedSection: {
    marginTop: 0,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    marginVertical: 6,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  expandedItem: {
    width: '47%' as any,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  expandedLabel: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  expandedValue: {
    color: T.text,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  expandedChips: {
    flexDirection: 'row',
    gap: 8,
  },
  cornerBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomLeftRadius: 10,
    borderTopRightRadius: 15,
    zIndex: 10,
  },
  cornerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  ribbonLeftSmall: {
    position: 'absolute',
    top: 10,
    left: -32,
    backgroundColor: '#10B981',
    paddingVertical: 3,
    paddingHorizontal: 32,
    transform: [{ rotate: '-45deg' }],
    zIndex: 10,
  },
  secondaryRightCol: {
    alignItems: 'flex-end',
  },
  expandedBalanceSection: {
    marginBottom: 6,
  },
  expandedBalanceLabel: {
    color: T.textDimmed,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  expandedBalanceValue: {
    color: T.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'] as any,
  },
  expandedBalanceCurrency: {
    color: T.textDimmed,
    fontSize: 14,
    fontWeight: '600',
  },
  expandedFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  secondaryConnectRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  connectButton: {
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: T.accent,
    shadowColor: T.accent,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  connectButtonBusy: {
    opacity: 0.7,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyOtherCard: {
    marginTop: 4,
    padding: 16,
    borderRadius: 16,
    backgroundColor: isDark ? '#0C1018' : T.glass2,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    gap: 8,
  },
  emptyOtherTitle: {
    color: T.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyOtherText: {
    color: T.textDimmed,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 17,
  },
  emptyOtherButton: {
    marginTop: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.accent,
  },
  emptyOtherButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  savedPlaceholderText: {
    color: T.textDimmed,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  savedFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});
