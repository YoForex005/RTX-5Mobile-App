import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, FlatList, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../components/ActionSheet';
import { MetricRow } from '../../components/MetricRow';
import { Screen } from '../../components/Screen';
import { TradePositionRow } from '../../components/TradePositionRow';
import { account, PositionItem, positions } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { radius, spacing } from '../../theme';
import { G } from '../../theme/glass';
import { fmt } from '../../utils/format';

export function TradeScreen() {
  const [activePosition, setActivePosition] = useState<PositionItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { oneClickAccepted, setChartSymbol } = useUserPreferences();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const totalVolume = positions.reduce((sum, position) => sum + position.volume, 0);
  const activePositionId = activePosition?.id;

  return (
    <Screen>
      <FlatList
        style={styles.list}
        data={positions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            {/* ── Header with ☰ ── */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Pressable style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
                  <Ionicons name="menu" size={24} color="#fff" />
                </Pressable>
                <Text style={styles.headerTitle}>Trade</Text>
              </View>
            </View>

            <View style={styles.summaryBlock}>
              <View style={styles.summaryTop}>
                {/* Glow Background for the Top Section */}
                <LinearGradient
                  colors={['rgba(37, 99, 235, 0.15)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View>
                  <Text style={styles.summaryLabel}>Unrealized P/L</Text>
                  <Text style={styles.floating}>
                    {fmt.pnl(account.floating)} <Text style={styles.floatingCurrency}>{account.currency}</Text>
                  </Text>
                  <Text style={styles.summaryHint}>Margin level {fmt.int(account.marginLevel)}%</Text>
                </View>
                <Pressable
                  onPress={() => router.push('/trade/order-ticket')}
                  style={({ pressed }) => [styles.newOrderButton, pressed && styles.newOrderButtonPressed]}
                >
                  <Text style={styles.plus}>＋</Text>
                </Pressable>
              </View>
              <View style={styles.metricsCard}>
                <MetricRow label='Balance:' value={fmt.int(account.balance)} compact withDivider white />
                <MetricRow label='Equity:' value={fmt.int(account.equity)} compact withDivider white />
                <MetricRow label='Margin:' value={fmt.int(account.margin)} compact withDivider white />
                <MetricRow label='Free Margin:' value={fmt.int(account.freeMargin)} compact withDivider white />
                <MetricRow label='Margin Level (%):' value={fmt.int(account.marginLevel)} compact white />
              </View>
            </View>

            <View style={styles.positionsHeader}>
              <View>
                <Text style={styles.positionsTitle}>Positions</Text>
                <Text style={styles.positionsMeta}>
                  {positions.length} open • {totalVolume.toFixed(2)} lots
                </Text>
              </View>
              <Pressable
                onPress={() => setBulkOpen(true)}
                style={({ pressed }) => [styles.bulkButton, pressed && styles.bulkButtonPressed]}
              >
                <Text style={styles.bulkButtonText}>Bulk</Text>
              </Pressable>
            </View>
          </>
        )}
        renderItem={({ item }) => (
          <TradePositionRow
            item={item}
            onPress={setActivePosition}
            onLongPress={setActivePosition}
            selected={activePosition?.id === item.id}
          />
        )}
        ListFooterComponent={(
          <Pressable
            style={({ pressed }) => [styles.oneClick, pressed && styles.oneClickPressed]}
            onPress={() => router.push('/trade/one-click-terms')}
          >
            <View>
              <Text style={styles.oneClickTitle}>One Click Trading</Text>
              <Text style={styles.oneClickSub}>
                {oneClickAccepted ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <View style={[
              styles.statusPill,
              oneClickAccepted ? styles.statusPillEnabled : styles.statusPillDisabled,
            ]}>
              <Text style={[
                styles.statusPillText,
                oneClickAccepted ? styles.statusPillTextEnabled : styles.statusPillTextDisabled,
              ]}>
                {oneClickAccepted ? 'ACTIVE' : 'SETUP'}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <ActionSheet
        visible={Boolean(activePosition)}
        title={activePosition ? `#${activePosition.id} ${activePosition.symbol} ${activePosition.side} ${activePosition.volume.toFixed(2)}` : ''}
        onClose={() => setActivePosition(null)}
        actions={[
          {
            label: 'Close position',
            danger: true,
            onPress: () => {
              if (!activePositionId) return;
              router.push({
                pathname: '/trade/close-position',
                params: { positionId: activePositionId },
              });
            },
          },
          {
            label: 'Close By',
            danger: true,
            onPress: () => {
              if (!activePositionId) return;
              router.push({
                pathname: '/trade/close-by',
                params: { positionId: activePositionId },
              });
            },
          },
          {
            label: 'Modify position',
            onPress: () => {
              if (!activePositionId) return;
              router.push({
                pathname: '/trade/modify-position',
                params: { positionId: activePositionId },
              });
            },
          },
          {
            label: 'Trade',
            onPress: () => {
              router.push({
                pathname: '/trade/order-ticket',
                params: { symbol: activePosition?.symbol ?? 'BTCUSDm' },
              });
            },
          },
          {
            label: 'Chart',
            onPress: () => {
              if (activePosition) {
                setChartSymbol(activePosition.symbol);
              }
              router.push('/(tabs)/chart');
            },
          },
          { label: 'Bulk Operations...', onPress: () => setBulkOpen(true) },
        ]}
      />

      <ActionSheet
        visible={bulkOpen}
        title='Bulk Operations'
        onClose={() => setBulkOpen(false)}
        actions={[
          {
            label: 'Close All Positions',
            danger: true,
            onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'all' } }),
          },
          {
            label: 'Close Profitable Positions',
            danger: true,
            onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'profitable' } }),
          },
          {
            label: 'Close Losing Positions',
            danger: true,
            onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'losing' } }),
          },
          {
            label: 'Close Buy Positions',
            danger: true,
            onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'buy' } }),
          },
          {
            label: 'Close BTCUSDm Positions',
            danger: true,
            onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'symbol:BTCUSDm' } }),
          },
        ]}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl + spacing.md,
  },
  summaryBlock: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 18,
    backgroundColor: G.glass2,
    borderWidth: 1,
    borderColor: G.borderMedium,
    shadowColor: G.trading.buy.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden',
  },
  summaryTop: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: G.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  floating: {
    color: G.trading.buy.hover,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 46,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  floatingCurrency: {
    color: G.trading.buy.hover,
    fontSize: 22,
    fontWeight: '800',
  },
  summaryHint: {
    marginTop: 4,
    color: G.textSub,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  newOrderButton: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  newOrderButtonPressed: {
    backgroundColor: G.glass3,
  },
  plus: {
    color: G.text,
    fontSize: 31,
    lineHeight: 31,
  },
  metricsCard: {
    borderTopWidth: 1,
    borderTopColor: G.borderMedium,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  positionsHeader: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: G.borderMedium,
  },
  positionsTitle: {
    color: G.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  positionsMeta: {
    marginTop: 2,
    color: G.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  bulkButton: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass1,
  },
  bulkButtonPressed: {
    backgroundColor: G.glass3,
  },
  bulkButtonText: {
    color: G.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  oneClick: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    backgroundColor: G.glass2,
    borderColor: G.borderMedium,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: G.trading.buy.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  oneClickPressed: {
    backgroundColor: G.glass2,
  },
  oneClickTitle: {
    color: G.text,
    fontSize: 15,
    fontWeight: '700',
  },
  oneClickSub: {
    color: G.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillEnabled: {
    borderColor: G.upGlow,
    backgroundColor: G.upGlow,
  },
  statusPillDisabled: {
    borderColor: G.downGlow,
    backgroundColor: G.downGlow,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statusPillTextEnabled: {
    color: G.up,
  },
  statusPillTextDisabled: {
    color: G.down,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: G.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: G.borderMedium },
  headerTitle: { color: G.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
});
