import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PositionItem } from '../mock/tradingData';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { fmt } from '../utils/format';
import { useUserPreferences } from '../state/userPreferences';

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
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const isBuy = item.side === 'buy';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: T.glass2,
          borderColor: T.border,
          borderLeftColor: isBuy ? T.trading.buy.primary : T.trading.sell.primary,
        },
        !isDark && styles.shadowLight,
        selected && { backgroundColor: T.glass1, borderColor: T.trading.buy.primary },
        pressed && styles.rowPressed,
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={160}
    >
      <Text style={[styles.cornerId, { color: T.textMuted }]}>#{item.id}</Text>
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
            <Text style={[styles.volume, { color: T.textMuted }]}>{(item.volume || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.rightCol}>
            <Text style={[styles.pnl, { color: item.pnl >= 0 ? T.trading.profit : T.trading.loss }]}>
              {fmt.pnl(item.pnl)}
            </Text>
          </View>
        </View>

        <View style={styles.priceRow}>
          <View style={styles.priceLeft}>
            <Text style={[styles.price, { color: T.textSub }]}>{fmt.price(item.openPrice)}</Text>
            <Text style={[styles.arrow, { color: T.textDimmed }]}>→</Text>
            <Text style={[styles.price, { color: T.textSub }]}>{fmt.price(item.currentPrice)}</Text>
          </View>
          <Text style={[styles.dateRight, { color: T.textSub }]}>
            {item.openTime.replace(' ', '   ')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingTop: 18,
    paddingBottom: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 7,
    borderWidth: 1,
    borderLeftWidth: 2,
  },
  rowPressed: {
    opacity: 0.88,
  },
  shadowLight: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  body: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLeft: {
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
  dateRight: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  cornerId: {
    position: 'absolute',
    top: 4,
    left: 8,
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
});
