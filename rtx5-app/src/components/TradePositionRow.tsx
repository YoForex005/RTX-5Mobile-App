import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PositionItem } from '../mock/tradingData';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
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
  const T = useTheme();
  const isBuy = item.side === 'buy';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: T.glass2,
          borderColor: T.borderMedium,
          borderLeftColor: isBuy ? T.trading.buy.primary : T.trading.sell.primary,
        },
        selected && { backgroundColor: T.glass1, borderColor: T.trading.buy.primary },
        pressed && styles.rowPressed,
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={160}
    >
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.symbolLine}>
            <Text style={[styles.symbol, { color: T.text }]}>{item.symbol}</Text>
            <View style={[
              styles.sideBadge,
              isBuy
                ? { backgroundColor: 'rgba(37,99,235,0.15)' }
                : { backgroundColor: 'rgba(220,38,38,0.12)' },
            ]}>
              <Text style={[styles.sideText, { color: isBuy ? T.trading.buy.hover : T.trading.sell.hover }]}>
                {item.side}
              </Text>
            </View>
            <Text style={[styles.volume, { color: T.textMuted }]}>{item.volume.toFixed(2)}</Text>
          </View>
          <Text style={[styles.pnl, { color: item.pnl >= 0 ? T.trading.profit : T.trading.loss }]}>
            {fmt.pnl(item.pnl)}
          </Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: T.textSub }]}>{fmt.price(item.openPrice)}</Text>
          <Text style={[styles.arrow, { color: T.textDimmed }]}>→</Text>
          <Text style={[styles.price, { color: T.textSub }]}>{fmt.price(item.currentPrice)}</Text>
        </View>

        <Text style={[styles.meta, { color: T.textMuted }]} numberOfLines={1}>#{item.id} • {item.openTime}</Text>
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
    borderRadius: 7,
    borderWidth: 1,
    borderLeftWidth: 2,
  },
  rowPressed: {
    opacity: 0.88,
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
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sideBadge: {
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sideText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  volume: {
    fontSize: 13,
    fontWeight: '700',
  },
  pnl: {
    minWidth: 88,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  priceRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  price: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  arrow: {
    fontSize: 11,
  },
  meta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
