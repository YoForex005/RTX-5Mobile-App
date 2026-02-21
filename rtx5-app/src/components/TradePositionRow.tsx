import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PositionItem } from '../mock/tradingData';
import { spacing } from '../theme';
import { G } from '../theme/glass';
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
    backgroundColor: G.glass1,
    borderWidth: 1,
    borderColor: G.border,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowSelected: {
    backgroundColor: G.glass2,
    borderColor: G.borderHi,
  },
  rowBuy: {
    borderLeftWidth: 2,
    borderLeftColor: G.accent,
  },
  rowSell: {
    borderLeftWidth: 2,
    borderLeftColor: G.down,
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
    color: G.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sideBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sideBadgeBuy: {
    backgroundColor: G.accentGlow,
  },
  sideBadgeSell: {
    backgroundColor: G.downGlow,
  },
  sideText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  sideTextBuy: {
    color: G.accent,
  },
  sideTextSell: {
    color: G.down,
  },
  volume: {
    color: G.textSub,
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
    color: G.up,
  },
  negative: {
    color: G.down,
  },
  priceRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  price: {
    color: G.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  arrow: {
    color: G.textMuted,
    fontSize: 11,
  },
  meta: {
    marginTop: 4,
    color: G.textSub,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
