import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, LayoutAnimation, Platform, UIManager } from 'react-native';
import { PositionItem } from '../mock/tradingData';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { fmt } from '../utils/format';
import { useUserPreferences } from '../state/userPreferences';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const detailColor = T.textSub;
  const detailLabelColor = T.textMuted;
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : T.border;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : T.glass2,
          borderColor: T.border,
          borderLeftColor: isBuy ? T.trading.buy.primary : T.trading.sell.primary,
        },
        !isDark && styles.shadowLight,
        isDark && styles.shadowDark,
        selected && { backgroundColor: T.glass1, borderColor: T.trading.buy.primary },
        pressed && !expanded && styles.rowPressed,
      ]}
      onPress={toggleExpand}
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

        {/* ── Expanded Details ── */}
        {expanded && (
          <View style={[styles.expandedSection, { borderTopColor: dividerColor }]}>
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>S/L</Text>
                <Text style={[styles.detailValue, { color: item.sl ? T.trading.loss : detailColor }]}>
                  {item.sl ? fmt.price(item.sl) : '—'}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>T/P</Text>
                <Text style={[styles.detailValue, { color: item.tp ? T.trading.profit : detailColor }]}>
                  {item.tp ? fmt.price(item.tp) : '—'}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Open</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  {fmt.price(item.openPrice)}
                </Text>
              </View>
            </View>
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Swap</Text>
                <Text style={[styles.detailValue, { color: item.swap !== 0 ? T.trading.loss : detailColor }]}>
                  {item.swap.toFixed(2)}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Ticket</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  #{item.id}
                </Text>
              </View>
              <View style={styles.detailCell} />
            </View>
          </View>
        )}
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
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 2,
  },
  rowPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  shadowLight: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  shadowDark: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
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
    fontSize: 16,
    fontWeight: '800',
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

  /* ── Expanded Details ── */
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  detailGrid: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailCell: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
