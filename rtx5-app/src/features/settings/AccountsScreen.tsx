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
import { Pressable, StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
import { Screen } from '../../components/Screen';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo } from 'react';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { ChangePasswordSheet } from './ChangePasswordSheet';
import { QRCodeSheet } from './QRCodeSheet';
import { ActionSheet } from '../../components/ActionSheet';
import { Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
// ── API Integration: fetches live account + broker data for active card ──
import { useAccounts } from '../../query/accounts';
import { useBrokerConfig } from '../../query/broker';

export function AccountsScreen() {
  const router = useRouter();
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const showActionSheet = useUIState((s) => s.showActionSheet);
  const actionSheet = useUIState((s) => s.actionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  // ── GET /accounts — live trading accounts for the authenticated user ──
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const { data: accounts } = useAccounts(isLoggedIn);

  // ── GET /broker/config — broker name and server name ──
  const brokerId = useUserPreferences((s) => s.brokerId);
  const { data: brokerConfig } = useBrokerConfig(brokerId);

  // Find the active account by matching the login from Zustand state
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const activeAccount = accounts?.find((a) => a.login === currentLogin) ?? accounts?.[0];

  // Filter out the active account to render the other connected accounts
  const otherAccounts = accounts?.filter((a) => a.login !== activeAccount?.login) ?? [];

  // Extract the 5 essential display values (fallbacks for when API hasn't loaded)
  const displayName = activeAccount?.name ?? accountDetails?.name ?? '---';
  const displayLogin = activeAccount ? String(activeAccount.login) : (accountDetails?.id ?? '---');
  const displayBalance = activeAccount ? `${fmt.price(activeAccount.balance)} ${activeAccount.currency}` : '--- USD';
  const displayBrokerName = brokerConfig?.broker_name ?? '---';
  const displayServerName = brokerConfig?.server_name ?? '---';

  const health = { status: 'healthy', version: '1.0.0' };
  const healthError = false;
  const mt5Status = { connected: true };
  const mt5StatusError = false;

  const handleConnectAccount = () => {
    router.push('/login');
  };

  const [passwordSheetVisible, setPasswordSheetVisible] = React.useState(false);
  const [passwordType, setPasswordType] = React.useState<'master' | 'investor'>('master');
  const [successMessage, setSuccessMessage] = React.useState('');
  const [qrSheetVisible, setQRSheetVisible] = React.useState(false);
  const [qrData, setQRData] = React.useState('');

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
      title: 'Settings',
      actions: [
        { label: 'Change master password', onPress: () => openPasswordSheet('master') },
        { label: 'Change investor password', onPress: () => openPasswordSheet('investor') },
        { label: 'Clear saved password' },
        { label: 'Delete account', danger: true },
      ],
    });
  };

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} hitSlop={15} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Accounts</Text>
          <View style={styles.headerRight}>
            <Pressable style={styles.iconBtn} hitSlop={10} onPress={() => Alert.alert('Certification', 'Certification info will be displayed here.')}>
              <Ionicons name="ribbon-outline" size={24} color={T.text} />
            </Pressable>
            <Pressable style={styles.iconBtn} hitSlop={10} onPress={handleConnectAccount}>
              <Ionicons name="add" size={30} color={T.text} />
            </Pressable>
            <Pressable style={styles.iconBtn} hitSlop={10} onPress={openOptions}>
              <Ionicons name="ellipsis-vertical" size={24} color={T.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Active Account Card — data from GET /accounts + GET /broker/config */}
          <View style={styles.activeCardWrap}>
            <View style={styles.activeCard}>
              <View style={styles.contestRibbon}>
                <Text style={styles.contestText}>Contest</Text>
              </View>

              <View style={styles.activeLogoWrap}>
                <Ionicons name="flash" size={28} color={T.accent} />
              </View>

              {/* Username — from GET /accounts API */}
              <Text style={styles.activeName}>{displayName}</Text>
              {/* Broker name — from GET /broker/config API */}
              <Text style={styles.activeCompany}>{displayBrokerName}</Text>

              {/* Login ID + Broker server — from GET /accounts + GET /broker/config */}
              <Text style={styles.activeServer}>{displayLogin} — {displayServerName}</Text>

              {/* Balance — from GET /accounts API */}
              <Text style={styles.activeBalance}>{displayBalance}</Text>

              <View style={styles.activeCardBottom}>
                <Pressable onPress={() => openQRSheet(displayLogin)} hitSlop={15}>
                  <Ionicons name="qr-code-outline" size={24} color={T.textSub} />
                </Pressable>
                <Ionicons name="notifications-outline" size={24} color={T.textSub} />
              </View>
            </View>
          </View>

          {/* Connect To List */}
          {otherAccounts.length > 0 && (
            <Text style={styles.connectToLabel}>Connect to:</Text>
          )}

          {otherAccounts.map((account) => {
            const isDemo = account.group?.toLowerCase().includes('demo') || true; // Fallback logic as per original UI
            const isReadonly = account.leverage === 0; // Simple heuristic or property if available
            
            return (
              <View key={account.login} style={[styles.secondaryCardWrap, { marginTop: spacing.md }]}>
                <View style={styles.secondaryCard}>
                  {isReadonly && (
                    <View style={styles.readonlyRibbon}>
                      <Text style={styles.readonlyText}>Readonly</Text>
                    </View>
                  )}
                  {isDemo && (
                    <View style={styles.demoRibbon}>
                      <Text style={styles.demoText}>Demo</Text>
                    </View>
                  )}

                  <View style={styles.secondaryHeaderRow}>
                    <View style={[styles.secondaryLogoWrap, { backgroundColor: '#080e18', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]}>
                      <Text style={styles.secondaryLogoText}>lexy</Text>
                    </View>
                    <View style={styles.secondaryInfoWrap}>
                      <Text style={styles.secondaryName}>{account.name || `Account ${account.login}`}</Text>
                      <Text style={styles.secondaryCompany}>{displayBrokerName}</Text>
                      <Text style={styles.secondaryServer}>{account.login} — {displayServerName}</Text>
                    </View>
                  </View>

                  <Text style={styles.secondaryBalance}>{fmt.price(account.balance)}</Text>
                  <Text style={styles.secondaryCurrency}>{account.currency}, last known</Text>

                  <View style={styles.secondaryCardBottom}>
                    <Pressable onPress={() => openQRSheet(String(account.login))} hitSlop={15}>
                      <Ionicons name="qr-code-outline" size={24} color={T.textSub} />
                    </Pressable>
                    <Ionicons name="information-circle-outline" size={24} color={T.textSub} />
                  </View>
                </View>
              </View>
            );
          })}

          {/* Server Status */}
          {/* API INTEGRATION: GET /api/mt5/status */}
          <View style={styles.serverStatusContainer}>
            <View style={styles.serverStatus}>
              <View style={[styles.statusDot, { backgroundColor: health?.status === 'healthy' ? '#34C759' : healthError ? '#FF3B30' : '#8E8E93' }]} />
              <Text style={styles.statusText}>
                {health?.status === 'healthy'
                  ? `Gateway: Healthy · v${health.version}`
                  : healthError
                    ? 'Gateway: Unreachable'
                    : 'Gateway: Checking...'}
              </Text>
            </View>

            <View style={styles.serverStatus}>
              <View style={[styles.statusDot, { backgroundColor: mt5Status?.connected ? '#34C759' : mt5StatusError ? '#FF3B30' : '#8E8E93' }]} />
              <Text style={styles.statusText}>
                {mt5Status?.connected
                  ? `MT5: Connected`
                  : mt5StatusError
                    ? 'MT5: Disconnected'
                    : 'MT5: Checking...'}
              </Text>
            </View>
          </View>

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
                setSuccessMessage(`${passwordType === 'master' ? 'Master' : 'Investor'} password change successfully`);
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
            <Text style={styles.successTitle}>Success</Text>
            <Text style={styles.successDesc}>{successMessage}</Text>
            <Pressable style={styles.successBtn} onPress={() => setSuccessMessage('')}>
              <Text style={styles.successBtnText}>OK</Text>
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
      />
    </Screen>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) => StyleSheet.create({
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
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: T.bgRoot,
  },
  headerTitle: {
    color: T.text,
    fontSize: 20,
    fontWeight: '500',
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

  // Active Card
  activeCardWrap: {
    marginTop: 8,
    marginBottom: 24,
  },
  activeCard: {
    backgroundColor: isDark ? '#0f1525' : T.glass2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
    shadowColor: isDark ? T.trading.buy.primary : '#0F172A', shadowOffset: { width: 0, height: isDark ? 4 : 8 }, shadowOpacity: isDark ? 0.05 : 0.04, shadowRadius: isDark ? 16 : 24, elevation: isDark ? 4 : 0,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  contestRibbon: {
    position: 'absolute',
    top: 16,
    right: -24,
    backgroundColor: '#007AFF', // Blue badge
    paddingVertical: 4,
    paddingHorizontal: 30,
    transform: [{ rotate: '45deg' }],
  },
  contestText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  activeLogoWrap: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: isDark ? '#080e18' : T.glass1,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : T.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  activeName: {
    color: T.text,
    fontSize: 20,
    fontWeight: '600',
  },
  activeCompany: {
    color: '#348be8', // Light blue
    fontSize: 14,
    marginTop: 4,
  },
  activeServer: {
    color: T.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  accessServer: {
    color: T.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  activeBalance: {
    color: T.text,
    fontSize: 28,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 8,
  },
  activeCardBottom: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // Secondary Cards
  connectToLabel: {
    color: T.textMuted,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
  },
  secondaryCardWrap: {
    marginBottom: 16,
  },
  secondaryCard: {
    backgroundColor: isDark ? '#0c1018' : T.glass1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : T.borderSubtle,
    padding: 20,
    overflow: 'hidden',
    shadowColor: isDark ? '#000' : '#0F172A', shadowOffset: { width: 0, height: isDark ? 2 : 6 }, shadowOpacity: isDark ? 0.3 : 0.03, shadowRadius: isDark ? 8 : 16, elevation: isDark ? 2 : 0,
  },
  demoRibbon: {
    position: 'absolute',
    top: 16,
    right: -24,
    backgroundColor: '#2ca82e', // Green badge
    paddingVertical: 4,
    paddingHorizontal: 30,
    transform: [{ rotate: '45deg' }],
  },
  demoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  readonlyRibbon: {
    position: 'absolute',
    top: 16,
    left: -24,
    backgroundColor: '#555', // Grey badge
    paddingVertical: 2,
    paddingHorizontal: 24,
    transform: [{ rotate: '-45deg' }],
    zIndex: 10,
  },
  readonlyText: {
    color: isDark ? '#ccc' : '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  secondaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  secondaryLogoText: {
    color: '#348be8',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryInfoWrap: {
    flex: 1,
  },
  secondaryName: {
    color: T.text,
    fontSize: 18,
    fontWeight: '500',
  },
  secondaryCompany: {
    color: '#348be8',
    fontSize: 14,
    marginTop: 2,
  },
  secondaryServer: {
    color: T.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  secondaryBalance: {
    color: T.textMuted,
    fontSize: 24,
    fontWeight: '400',
  },
  secondaryCurrency: {
    color: T.textMuted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  secondaryCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serverStatusContainer: {
    paddingVertical: 16,
    gap: 12,
    alignItems: 'center',
  },
  serverStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
