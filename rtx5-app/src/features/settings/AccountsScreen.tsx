import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
import { Screen } from '../../components/Screen';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useAccountSummary } from '../../query/account';
import { useHealth } from '../../query/health';
import { fmt } from '../../utils/format';
import { ChangePasswordSheet } from './ChangePasswordSheet';
import { Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';

export function AccountsScreen() {
  const router = useRouter();
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const showActionSheet = useUIState((s) => s.showActionSheet);
  
  // Fallback values if not logged in
  const activeAccount = accountDetails || {
    name: 'Abhishek+Kumar+1',
    id: '900909494443',
    server: 'ALFX-Trade',
  };

  const { data: liveAccount } = useAccountSummary(activeAccount.id);
  const { data: health, isError: healthError } = useHealth();

  const handleConnectAccount = () => {
    router.push('/login');
  };

  const [passwordSheetVisible, setPasswordSheetVisible] = React.useState(false);
  const [passwordType, setPasswordType] = React.useState<'master' | 'investor'>('master');

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
            <Ionicons name="menu" size={28} color={G.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Accounts</Text>
          <View style={styles.headerRight}>
            <Pressable style={styles.iconBtn} hitSlop={10} onPress={() => Alert.alert('Certification', 'Certification info will be displayed here.')}>
              <Ionicons name="ribbon-outline" size={24} color={G.text} />
            </Pressable>
            <Pressable style={styles.iconBtn} hitSlop={10} onPress={handleConnectAccount}>
              <Ionicons name="add" size={30} color={G.text} />
            </Pressable>
            <Pressable style={styles.iconBtn} hitSlop={10} onPress={openOptions}>
              <Ionicons name="ellipsis-vertical" size={24} color={G.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Active Account Card */}
          <View style={styles.activeCardWrap}>
            <View style={styles.activeCard}>
              <View style={styles.contestRibbon}>
                <Text style={styles.contestText}>Contest</Text>
              </View>
              
              <View style={styles.activeLogoWrap}>
                 <Ionicons name="flash" size={28} color={G.accent} />
              </View>
              
              <Text style={styles.activeName}>{activeAccount.name}</Text>
              <Text style={styles.activeCompany}>ALFX Limited</Text>
              
              <Text style={styles.activeServer}>{activeAccount.id} — {activeAccount.server}</Text>
              <Text style={styles.accessServer}>Access Server 1</Text>
              
              <Text style={styles.activeBalance}>
                {liveAccount ? `${fmt.int(liveAccount.balance)} ${liveAccount.currency}` : '--- USD'}
              </Text>
              
              <View style={styles.activeCardBottom}>
                <Ionicons name="qr-code-outline" size={24} color={G.textSub} />
                <Ionicons name="notifications-outline" size={24} color={G.textSub} />
              </View>
            </View>
          </View>

          {/* Connect To List */}
          <Text style={styles.connectToLabel}>Connect to:</Text>
          
          {/* Mock Account 1 */}
          <View style={styles.secondaryCardWrap}>
            <View style={styles.secondaryCard}>
              <View style={styles.demoRibbon}>
                <Text style={styles.demoText}>Demo</Text>
              </View>
              
              <View style={styles.secondaryHeaderRow}>
                <View style={[styles.secondaryLogoWrap, { backgroundColor: '#080e18', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]}>
                  <Text style={styles.secondaryLogoText}>lexy</Text>
                </View>
                <View style={styles.secondaryInfoWrap}>
                  <Text style={styles.secondaryName}>Abhishek Kumar</Text>
                  <Text style={styles.secondaryCompany}>Flexy Markets Limited</Text>
                  <Text style={styles.secondaryServer}>500001 — FlexyMarkets-Server</Text>
                </View>
              </View>
              
              <Text style={styles.secondaryBalance}>1 024.58</Text>
              <Text style={styles.secondaryCurrency}>USD, last known</Text>
              
              <View style={styles.secondaryCardBottom}>
                 <Ionicons name="qr-code-outline" size={24} color={G.textSub} />
                 <Ionicons name="information-circle-outline" size={24} color={G.textSub} />
              </View>
            </View>
          </View>

          {/* Mock Account 2 (Readonly) */}
          <View style={[styles.secondaryCardWrap, { marginTop: spacing.md }]}>
            <View style={styles.secondaryCard}>
              <View style={styles.readonlyRibbon}>
                 <Text style={styles.readonlyText}>Readonly</Text>
              </View>
              <View style={styles.demoRibbon}>
                <Text style={styles.demoText}>Demo</Text>
              </View>
              
              <View style={styles.secondaryHeaderRow}>
                <View style={[styles.secondaryLogoWrap, { backgroundColor: '#080e18', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]}>
                  <Text style={styles.secondaryLogoText}>lexy</Text>
                </View>
                <View style={styles.secondaryInfoWrap}>
                  <Text style={styles.secondaryName}>Sid Saw</Text>
                  <Text style={styles.secondaryCompany}>Flexy Markets Limited</Text>
                  <Text style={styles.secondaryServer}>900524 — FlexyMarkets-Server</Text>
                </View>
              </View>
              
              <Text style={styles.secondaryBalance}>100 000.00</Text>
              <Text style={styles.secondaryCurrency}>USD, last known</Text>
              
              <View style={styles.secondaryCardBottom}>
                 <Ionicons name="grid-outline" size={24} color={G.textSub} />
                 <Ionicons name="information-circle-outline" size={24} color={G.textSub} />
              </View>
            </View>
          </View>

          {/* Server Status */}
          <View style={styles.serverStatus}>
            <View style={[styles.statusDot, { backgroundColor: health?.status === 'healthy' ? '#34C759' : healthError ? '#FF3B30' : '#8E8E93' }]} />
            <Text style={styles.statusText}>
              {health?.status === 'healthy'
                ? `Server: Healthy · v${health.version}`
                : healthError
                ? 'Server: Unreachable'
                : 'Server: Checking...'}
            </Text>
          </View>

        </ScrollView>
      </View>

      <Modal
        visible={passwordSheetVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPasswordSheetVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setPasswordSheetVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <ChangePasswordSheet
                  loginId={activeAccount.id}
                  type={passwordType}
                  onClose={() => setPasswordSheetVisible(false)}
                  onSuccess={() => {
                    setPasswordSheetVisible(false);
                    Alert.alert('Success', `Your ${passwordType} password has been changed successfully.`);
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#000',
  },
  headerTitle: {
    color: '#fff',
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
    backgroundColor: '#0f1525',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
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
    backgroundColor: '#080e18',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  activeName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  activeCompany: {
    color: '#348be8', // Light blue
    fontSize: 14,
    marginTop: 4,
  },
  activeServer: {
    color: '#8a94a6',
    fontSize: 14,
    marginTop: 12,
  },
  accessServer: {
    color: '#8a94a6',
    fontSize: 14,
    marginTop: 2,
  },
  activeBalance: {
    color: '#fff',
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
    color: '#8a94a6',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
  },
  secondaryCardWrap: {
    marginBottom: 16,
  },
  secondaryCard: {
    backgroundColor: '#0c1018',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    overflow: 'hidden',
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
    color: '#ccc',
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  secondaryCompany: {
    color: '#348be8',
    fontSize: 14,
    marginTop: 2,
  },
  secondaryServer: {
    color: '#8a94a6',
    fontSize: 13,
    marginTop: 4,
  },
  secondaryBalance: {
    color: '#8a94a6',
    fontSize: 24,
    fontWeight: '400',
  },
  secondaryCurrency: {
    color: '#8a94a6',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  secondaryCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serverStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: '#8a94a6',
    fontSize: 12,
    fontWeight: '500',
  },
});
