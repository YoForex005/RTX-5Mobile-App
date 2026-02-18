import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { ActionSheet } from '../../components/ActionSheet';
import { MetricRow } from '../../components/MetricRow';
import { Screen } from '../../components/Screen';
import { TradePositionRow } from '../../components/TradePositionRow';
import { account, PositionItem, positions } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, radius, spacing } from '../../theme';
import { fmt } from '../../utils/format';

export function TradeScreen() {
  const [activePosition, setActivePosition] = useState<PositionItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { oneClickAccepted, setChartSymbol } = useUserPreferences();
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
            <View style={styles.summaryBlock}>
              <View style={styles.summaryTop}>
                <View>
                  <Text style={styles.summaryLabel}>Unrealized P/L</Text>
                  <Text style={[styles.floating, account.floating >= 0 ? styles.floatingPositive : styles.floatingNegative]}>
                    {fmt.pnl(account.floating)} {account.currency}
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
                <MetricRow label='Balance:' value={fmt.int(account.balance)} compact withDivider />
                <MetricRow label='Equity:' value={fmt.int(account.equity)} compact withDivider />
                <MetricRow label='Margin:' value={fmt.int(account.margin)} compact withDivider />
                <MetricRow label='Free Margin:' value={fmt.int(account.freeMargin)} compact withDivider />
                <MetricRow label='Margin Level (%):' value={fmt.int(account.marginLevel)} compact />
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
    borderRadius: radius.lg,
    backgroundColor: '#0b1422',
    borderWidth: 1,
    borderColor: '#23314a',
  },
  summaryTop: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#8a99b2',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  floating: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 36,
    marginTop: 3,
  },
  floatingPositive: {
    color: colors.positive,
  },
  floatingNegative: {
    color: colors.negative,
  },
  summaryHint: {
    marginTop: 4,
    color: '#70819c',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  newOrderButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#3a5682',
    backgroundColor: '#14233b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newOrderButtonPressed: {
    opacity: 0.86,
  },
  plus: {
    color: '#9ab7e2',
    fontSize: 31,
    lineHeight: 31,
  },
  metricsCard: {
    borderTopWidth: 1,
    borderTopColor: '#25344e',
    backgroundColor: '#0c1727',
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
    borderBottomColor: '#24324a',
  },
  positionsTitle: {
    color: '#edf2fb',
    fontSize: 21,
    fontWeight: '700',
  },
  positionsMeta: {
    marginTop: 3,
    color: '#7c8ca7',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  bulkButton: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#304461',
    backgroundColor: '#13223a',
  },
  bulkButtonPressed: {
    opacity: 0.88,
  },
  bulkButtonText: {
    color: '#8db4f2',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  oneClick: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#0d1727',
    borderColor: '#263652',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  oneClickPressed: {
    opacity: 0.9,
  },
  oneClickTitle: {
    color: '#e8eef8',
    fontSize: 14,
    fontWeight: '600',
  },
  oneClickSub: {
    color: '#8597b2',
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillEnabled: {
    borderColor: '#1a5a49',
    backgroundColor: '#0f2c24',
  },
  statusPillDisabled: {
    borderColor: '#524527',
    backgroundColor: '#2d2614',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statusPillTextEnabled: {
    color: '#51cf9f',
  },
  statusPillTextDisabled: {
    color: '#e6ca6b',
  },
});
