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
        { backgroundColor: T.glass1, borderColor: T.border },
        isBuy ? { borderLeftWidth: 2, borderLeftColor: T.accent } : { borderLeftWidth: 2, borderLeftColor: T.down },
        selected && { backgroundColor: T.glass2, borderColor: T.borderHi },
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
            <View style={[styles.sideBadge, { backgroundColor: isBuy ? T.accentGlow : T.downGlow }]}>
              <Text style={[styles.sideText, { color: isBuy ? T.accent : T.down }]}>
                {item.side}
              </Text>
            </View>
            <Text style={[styles.volume, { color: T.textSub }]}>{item.volume.toFixed(2)}</Text>
          </View>
          <Text style={[styles.pnl, { color: item.pnl >= 0 ? T.up : T.down }]}>
            {fmt.pnl(item.pnl)}
          </Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: T.textMuted }]}>{fmt.price(item.openPrice)}</Text>
          <Text style={[styles.arrow, { color: T.textMuted }]}>→</Text>
          <Text style={[styles.price, { color: T.textMuted }]}>{fmt.price(item.currentPrice)}</Text>
        </View>

        <Text style={[styles.meta, { color: T.textSub }]} numberOfLines={1}>#{item.id} • {item.openTime}</Text>
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
    borderWidth: 1,
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
    fontSize: 17,
    fontWeight: '700',
  },
  sideBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sideText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  volume: {
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
  priceRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  price: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  arrow: {
    fontSize: 11,
  },
  meta: {
    marginTop: 4,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
