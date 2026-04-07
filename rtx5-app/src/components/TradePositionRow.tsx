/**
 * Optimized list item rendering an individual Open Position.
 * 
 * Architectural Note: 
 * This component intentionally hooks its own `useMarketData([item.symbol])` listener.
 * This pattern ensures that when a high-frequency WebSocket tick arrives for "EURUSD", 
 * ONLY the specific `TradePositionRow` instances holding EURUSD will re-render,
 * bypassing a full `<FlatList>` re-render entirely.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, LayoutAnimation, Platform, UIManager } from 'react-native';
import { router } from 'expo-router';
import { PositionItem } from '../mock/tradingData';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { fmt } from '../utils/format';
import { formatBrokerTime } from '../utils/brokerTime';
import { useUserPreferences } from '../state/userPreferences';
import { useMarketData } from '../query/websocket';
import { useTradingState } from '../state/tradingState';

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
  
  // Continuously hook into the global multi-symbol WebSocket Quotes stream!
  // This extracts THIS specific symbol's exact nanosecond ask/bid feed.
  const quotesStore = useMarketData([item.symbol]);
  const liveQuote = quotesStore[item.symbol];
  
  // Real bids and asks mapping from the raw WebSocket, with extreme defensive fallback chains
  const fallbackBid = typeof item.currentPrice === 'number' && !isNaN(item.currentPrice) ? item.currentPrice : item.openPrice;
  const liveBid = typeof liveQuote?.bid === 'number' && !isNaN(liveQuote.bid) ? liveQuote.bid : fallbackBid;
  
  const fallbackAsk = liveBid + (item.symbol.includes('JPY') ? 0.015 : 0.00015);
  const liveAsk = typeof liveQuote?.ask === 'number' && !isNaN(liveQuote.ask) ? liveQuote.ask : fallbackAsk;
  
  // For Buy positions, we close at the Bid price. For Sell positions, we close at the Ask price.
  const rawLivePrice = isBuy ? liveBid : liveAsk;
  const livePrice = Number.isFinite(rawLivePrice) ? rawLivePrice : item.openPrice;

  // Calculate live floating P&L using standard FX contract math safely
  const isJpy = item.symbol.includes('JPY');
  const decimals = isJpy ? 3 : 5; // Standard FX: 5 decimals, JPY pairs: 3 decimals
  const contractSize = isJpy ? 1000 : 100000;
  const priceDiff = isBuy ? (livePrice - item.openPrice) : (item.openPrice - livePrice);
  const livePnl = Number.isFinite(priceDiff) ? (priceDiff * (item.volume || 0.01) * contractSize) : 0;

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const detailColor = T.textSub;
  const detailLabelColor = T.textMuted;
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : T.border;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : T.glass2,
          borderColor: T.border,
          borderLeftColor: isBuy ? T.trading.buy.primary : T.trading.sell.primary,
        },
        !isDark && styles.shadowLight,
        isDark && styles.shadowDark,
        selected && { backgroundColor: T.glass1, borderColor: T.trading.buy.primary },
      ]}
    >
      <Text style={[styles.cornerId, { color: T.textMuted }]}>#{item.id}</Text>
      
      <Pressable
        onPress={toggleExpand}
        onLongPress={() => onLongPress(item)}
        delayLongPress={160}
        style={({ pressed }) => [styles.body, pressed && !expanded && styles.rowPressed]}
      >
        <View style={styles.headerRow}>
          <View style={styles.symbolLine}>
            <Text style={[styles.symbol, { color: T.text }]}>{fmt.symbol(item.symbol)}</Text>
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
            <Text style={[styles.pnl, { color: livePnl >= 0 ? T.trading.profit : T.trading.loss }]}>
              {fmt.pnl(livePnl)}
            </Text>
          </View>
        </View>

        <View style={styles.priceRow}>
          <View style={styles.priceLeft}>
            <Text style={[styles.price, { color: T.textSub }]}>
              {Number.isFinite(item.openPrice) ? item.openPrice.toFixed(decimals) : '---'}
            </Text>
            <Text style={[styles.arrow, { color: T.textDimmed }]}>→</Text>
            <Text style={[styles.price, { color: T.textSub }]}>
              {Number.isFinite(livePrice) ? livePrice.toFixed(decimals) : '---'}
            </Text>
          </View>
          <Text style={[styles.dateRight, { color: T.textSub }]}>
            {formatBrokerTime(item.openTime).replace(' ', '   ')}
          </Text>
        </View>

        {(!!item.sl || !!item.tp) && (
          <View style={styles.slTpRow}>
            {!!item.sl && (
              <View style={styles.slTpBadge}>
                <Text style={[styles.slTpText, { color: '#F57C00' }]}>SL {fmt.price(item.sl as number)}</Text>
              </View>
            )}
            {!!item.tp && (
              <View style={styles.slTpBadge}>
                <Text style={[styles.slTpText, { color: '#388E3C' }]}>TP {fmt.price(item.tp as number)}</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>

    {/* ── Expanded Details ── */}
      {expanded && (
        <View style={[styles.expandedSection, { borderTopColor: dividerColor }]}>
          <View style={styles.detailGrid}>
            <View style={styles.detailCell}>
              <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Limits</Text>
              <Pressable onPress={() => router.push(`/trade/modify-position?positionId=${item.id}`)} hitSlop={12}>
                <Text style={[styles.detailValue, { color: T.accent }]}>
                  Modify
                </Text>
              </Pressable>
            </View>
            <View style={styles.detailCell}>
              <Text style={[styles.detailLabel, { color: detailLabelColor }]}>OPEN</Text>
              <Text style={[styles.detailValue, { color: detailColor }]}>
                {fmt.price(item.openPrice)}
              </Text>
            </View>
            <View style={styles.detailCell}>
              <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Swap</Text>
              <Text style={[styles.detailValue, { color: item.swap !== 0 ? T.trading.loss : detailColor }]}>
                {item.swap.toFixed(2)}
              </Text>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <View style={styles.detailCell}>
              <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Ticket</Text>
              <Text style={[styles.detailValue, { color: detailColor }]}>
                #{item.id}
              </Text>
            </View>
            <View style={styles.detailCell} />
            <View style={styles.detailCell} />
          </View>
        </View>
      )}
    </View>
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
  slTpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.1)',
  },
  slTpBadge: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(150,150,150,0.05)',
  },
  slTpText: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
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
  modBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(150,150,150,0.08)',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.2)',
    marginTop: 2,
  },
  modBadgeIcon: {
    fontSize: 12,
    color: 'rgba(150,150,150,0.8)',
  },
});
