import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PositionItem } from '../mock/tradingData';
import { colors, spacing } from '../theme';
import { fmt } from '../utils/format';

export function TradePositionRow({
  item,
  onPress,
  onLongPress,
  selected = false,
}: {
  item: PositionItem;
  onPress: (item: PositionItem) => void;
  onLongPress: (item: PositionItem) => void;
  selected?: boolean;
}) {
  const isBuy = item.side === 'buy';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        isBuy ? styles.rowBuy : styles.rowSell,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={160}
    >
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.symbolLine}>
            <Text style={styles.symbol}>{item.symbol}</Text>
            <View style={[styles.sideBadge, isBuy ? styles.sideBadgeBuy : styles.sideBadgeSell]}>
              <Text style={[styles.sideText, isBuy ? styles.sideTextBuy : styles.sideTextSell]}>
                {item.side}
              </Text>
            </View>
            <Text style={styles.volume}>{item.volume.toFixed(2)}</Text>
          </View>
          <Text style={[styles.pnl, item.pnl >= 0 ? styles.positive : styles.negative]}>
            {fmt.pnl(item.pnl)}
          </Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmt.price(item.openPrice)}</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.price}>{fmt.price(item.currentPrice)}</Text>
        </View>

        <Text style={styles.meta} numberOfLines={1}>#{item.id} • {item.openTime}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: '#0b131f',
    borderWidth: 1,
    borderColor: '#1d2a3f',
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowSelected: {
    backgroundColor: '#101d2e',
    borderColor: '#2a4369',
  },
  rowBuy: {
    borderLeftWidth: 2,
    borderLeftColor: '#1d8bff',
  },
  rowSell: {
    borderLeftWidth: 2,
    borderLeftColor: '#ff5f57',
  },
  body: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symbolLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  symbol: {
    color: '#eef3fb',
    fontSize: 17,
    fontWeight: '700',
  },
  sideBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sideBadgeBuy: {
    backgroundColor: '#173a63',
  },
  sideBadgeSell: {
    backgroundColor: '#4c2528',
  },
  sideText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  sideTextBuy: {
    color: '#8ec9ff',
  },
  sideTextSell: {
    color: '#ffaea9',
  },
  volume: {
    color: '#c8d2e2',
    fontSize: 12,
    fontWeight: '600',
  },
  pnl: {
    minWidth: 88,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  positive: {
    color: colors.positive,
  },
  negative: {
    color: colors.negative,
  },
  priceRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  price: {
    color: '#9ba9bf',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  arrow: {
    color: '#73829a',
    fontSize: 11,
  },
  meta: {
    marginTop: 4,
    color: '#6c7a91',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
