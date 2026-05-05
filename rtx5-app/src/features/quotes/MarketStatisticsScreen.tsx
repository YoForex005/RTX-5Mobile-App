/**
 * Market Statistics Screen
 *
 * Displays real-time market statistics for a single instrument.
 * Shows Bid, Bid high, Bid low, Ask, Ask high, Ask low, Open price,
 * and Close price with live tick data from WebSocket.
 *
 * Matches the MT5 "Market Statistics" popup reference design.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { quotes, type QuoteItem } from '../../dev/mock/tradingData';
import { useMarketData } from '../../query/websocket';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme } from '../../ui/theme/useTheme';
import type { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { normalizeSymbol } from '../../domain/symbols';
import { useInstrumentMeta } from '../../query/instruments';
import { useLatestDailyCandle } from '../../domain/candles/query/candles';
import { calculateMarketSentiment } from '../../domain/marketSentiment';

/* ───── Types ───── */

type StatDirection = 'up' | 'neutral';

type StatRow = {
  label: string;
  value: string;
  direction: StatDirection;
};

/* ───── Main Screen ───── */

export function MarketStatisticsScreen() {
  const router = useRouter();
  const { symbol: routeSymbol = 'EURUSD' } = useLocalSearchParams<{ symbol?: string }>();
  const symbol = useMemo(() => normalizeSymbol(routeSymbol), [routeSymbol]);

  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();

  // Subscribe to live tick data
  const liveQuotes = useMarketData([symbol]);
  const { data: remoteMeta } = useInstrumentMeta(symbol);
  const { data: dailyRangeCandle = null } = useLatestDailyCandle(symbol);

  const q = useMemo<QuoteItem>(() => {
    const live = liveQuotes[symbol] as Partial<QuoteItem> | undefined;
    const mock = quotes.find((i) => i.symbol === symbol) ?? quotes[0];
    const base: QuoteItem = { ...mock, ...live, symbol };
    if (remoteMeta) {
      base.contractSize = remoteMeta.contractSize ?? base.contractSize;
    }
    return base;
  }, [liveQuotes, symbol, remoteMeta]);

  const sentiment = useMemo(
    () => calculateMarketSentiment(q, dailyRangeCandle),
    [dailyRangeCandle, q],
  );

  const bidHigh = sentiment.dayHigh;
  const bidLow = sentiment.dayLow !== Infinity ? sentiment.dayLow : q.low;
  const askHigh = useMemo(() => {
    const spread = (q.ask || 0) - (q.bid || 0);
    return bidHigh + spread;
  }, [bidHigh, q.ask, q.bid]);
  const askLow = useMemo(() => {
    const spread = (q.ask || 0) - (q.bid || 0);
    return bidLow + spread;
  }, [bidLow, q.ask, q.bid]);

  const openPrice = useMemo(() => {
    if (dailyRangeCandle) return dailyRangeCandle.open;
    return q.open ?? q.close ?? q.bid ?? 0;
  }, [dailyRangeCandle, q.bid, q.close, q.open]);

  const closePrice = useMemo(() => {
    return q.close ?? q.bid ?? 0;
  }, [q.close, q.bid]);

  const isUp = q.changePct >= 0;
  const priceDigits = q.digits ?? 2;

  // Build the rows to display
  const rows: StatRow[] = useMemo(() => [
    { label: 'Bid', value: fmt.price(q.bid, priceDigits), direction: 'up' as StatDirection },
    { label: 'Bid high', value: fmt.price(bidHigh, priceDigits), direction: 'neutral' as StatDirection },
    { label: 'Bid low', value: fmt.price(bidLow, priceDigits), direction: 'neutral' as StatDirection },
    { label: 'Ask', value: fmt.price(q.ask, priceDigits), direction: 'up' as StatDirection },
    { label: 'Ask high', value: fmt.price(askHigh, priceDigits), direction: 'neutral' as StatDirection },
    { label: 'Ask low', value: fmt.price(askLow, priceDigits), direction: 'neutral' as StatDirection },
    { label: 'Open price', value: fmt.price(openPrice, priceDigits), direction: 'neutral' as StatDirection },
    { label: 'Close price', value: fmt.price(closePrice, priceDigits), direction: 'neutral' as StatDirection },
  ], [q.bid, q.ask, priceDigits, bidHigh, bidLow, askHigh, askLow, openPrice, closePrice]);

  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const displaySymbol = fmt.symbol(symbol);

  return (
    <View style={[styles.root, { backgroundColor: T.bg }]}>
      {/* ── Header ── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={15}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {displaySymbol}
          </Text>

          <View style={styles.headerRight}>
            <View style={[styles.liveDot, { backgroundColor: T.up, shadowColor: T.up }]} />
          </View>
        </View>
      </View>

      {/* ── Statistics List ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[
              styles.statRow,
              index < rows.length - 1 && styles.statRowBorder,
            ]}
          >
            <View style={styles.statLeft}>
              {row.direction === 'up' ? (
                <Ionicons
                  name="caret-up"
                  size={12}
                  color={T.up}
                  style={styles.directionIcon}
                />
              ) : (
                <View style={[styles.neutralDot, { backgroundColor: T.up }]} />
              )}
              <Text style={styles.statLabel}>{row.label}</Text>
            </View>

            <Text style={styles.statValue}>{row.value}</Text>
          </View>
        ))}

        {/* ── Additional Stats Card ── */}
        <View style={styles.additionalCard}>
          <Text style={styles.additionalTitle}>OVERVIEW</Text>

          <View style={styles.additionalGrid}>
            <View style={styles.additionalGridItem}>
              <Text style={styles.additionalGridLabel}>SPREAD</Text>
              <Text style={styles.additionalGridValue}>
                {parseFloat(Number(q.spread || 0).toFixed(2)).toString()}
              </Text>
            </View>
            <View style={styles.additionalGridItem}>
              <Text style={styles.additionalGridLabel}>CHANGE</Text>
              <Text
                style={[
                  styles.additionalGridValue,
                  { color: isUp ? T.up : T.down },
                ]}
              >
                {isUp ? '+' : ''}{(q.changePct || 0).toFixed(2)}%
              </Text>
            </View>
            <View style={styles.additionalGridItem}>
              <Text style={styles.additionalGridLabel}>VOLUME</Text>
              <Text style={styles.additionalGridValue}>
                {(q.volume ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.additionalGridItem}>
              <Text style={styles.additionalGridLabel}>DIGITS</Text>
              <Text style={styles.additionalGridValue}>
                {q.digits ?? 2}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Day Range Visual ── */}
        <View style={styles.rangeCard}>
          <Text style={styles.rangeTitle}>DAY RANGE</Text>
          <View style={styles.rangeBar}>
            <View style={styles.rangeTrack}>
              <View
                style={[
                  styles.rangeFill,
                  {
                    width: `${Math.min(100, Math.max(0, sentiment.rangePositionPct))}%` as any,
                    backgroundColor: isUp ? T.up : T.down,
                  },
                ]}
              />
              <View
                style={[
                  styles.rangeKnob,
                  {
                    left: `${Math.min(100, Math.max(0, sentiment.rangePositionPct))}%` as any,
                    borderColor: isUp ? T.up : T.down,
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.rangeLabels}>
            <Text style={styles.rangeLabelValue}>{fmt.price(bidLow, priceDigits)}</Text>
            <Text style={[styles.rangeLabelValue, { color: isUp ? T.up : T.down }]}>
              {fmt.price(q.bid, priceDigits)}
            </Text>
            <Text style={styles.rangeLabelValue}>{fmt.price(bidHigh, priceDigits)}</Text>
          </View>
          <View style={styles.rangeLabels}>
            <Text style={styles.rangeLabelSmall}>LOW</Text>
            <Text style={styles.rangeLabelSmall}>CURRENT</Text>
            <Text style={styles.rangeLabelSmall}>HIGH</Text>
          </View>
        </View>

        {/* ── Sentiment Bar ── */}
        <View style={styles.sentimentCard}>
          <Text style={styles.sentimentTitle}>MARKET SENTIMENT</Text>
          <View style={styles.sentimentBarRow}>
            <Text style={[styles.sentimentPct, { color: T.up }]}>
              {sentiment.buyPct.toFixed(0)}%
            </Text>
            <View style={styles.sentimentTrack}>
              <View
                style={[
                  styles.sentimentFillLeft,
                  { width: `${sentiment.buyPct}%` as any, backgroundColor: T.up },
                ]}
              />
              <View
                style={[
                  styles.sentimentFillRight,
                  { width: `${sentiment.sellPct}%` as any, backgroundColor: T.down },
                ]}
              />
            </View>
            <Text style={[styles.sentimentPct, { color: T.down }]}>
              {sentiment.sellPct.toFixed(0)}%
            </Text>
          </View>
          <View style={styles.sentimentLabels}>
            <Text style={[styles.sentimentLabel, { color: T.up }]}>BUYERS</Text>
            <Text style={[styles.sentimentLabel, { color: T.down }]}>SELLERS</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ───── Styles ───── */

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : T.glass2;
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : T.border;

  return StyleSheet.create({
    root: {
      flex: 1,
    },

    headerContainer: {
      backgroundColor: T.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderColor,
    },

    headerRow: {
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
    },

    backButton: {
      width: 46,
      alignItems: 'flex-start',
      padding: 4,
    },

    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: T.text,
      letterSpacing: -0.3,
    },

    headerRight: {
      width: 46,
      alignItems: 'flex-end',
      paddingRight: 4,
    },

    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      shadowOpacity: 0.8,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
    },

    scrollView: {
      flex: 1,
    },

    scrollContent: {
      paddingTop: 8,
    },

    // ── Stat Rows ──
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 20,
      minHeight: 52,
    },

    statRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderColor,
    },

    statLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    directionIcon: {
      width: 16,
      textAlign: 'center',
    },

    neutralDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginHorizontal: 4,
    },

    statLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: T.text,
      letterSpacing: -0.2,
    },

    statValue: {
      fontSize: 16,
      fontWeight: '500',
      color: T.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },

    // ── Additional Stats Card ──
    additionalCard: {
      marginTop: 20,
      marginHorizontal: 16,
      backgroundColor: cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: borderColor,
      padding: 16,
      overflow: 'hidden',
    },

    additionalTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: T.textMuted,
      letterSpacing: 1.2,
      marginBottom: 14,
    },

    additionalGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },

    additionalGridItem: {
      flex: 1,
      minWidth: '40%' as any,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: borderColor,
      paddingVertical: 14,
      paddingHorizontal: 12,
      alignItems: 'center',
    },

    additionalGridLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: T.textMuted,
      letterSpacing: 1,
      marginBottom: 6,
    },

    additionalGridValue: {
      fontSize: 17,
      fontWeight: '700',
      color: T.text,
      fontVariant: ['tabular-nums'],
    },

    // ── Day Range ──
    rangeCard: {
      marginTop: 12,
      marginHorizontal: 16,
      backgroundColor: cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: borderColor,
      padding: 16,
      overflow: 'hidden',
    },

    rangeTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: T.textMuted,
      letterSpacing: 1.2,
      marginBottom: 16,
    },

    rangeBar: {
      paddingHorizontal: 4,
    },

    rangeTrack: {
      height: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      borderRadius: 2,
      position: 'relative',
    },

    rangeFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: 2,
    },

    rangeKnob: {
      position: 'absolute',
      top: -6,
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2.5,
      marginLeft: -8,
      backgroundColor: T.bg,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },

    rangeLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
    },

    rangeLabelValue: {
      fontSize: 13,
      fontWeight: '600',
      color: T.text,
      fontVariant: ['tabular-nums'],
    },

    rangeLabelSmall: {
      fontSize: 10,
      fontWeight: '700',
      color: T.textMuted,
      letterSpacing: 1,
      marginTop: 2,
    },

    // ── Sentiment ──
    sentimentCard: {
      marginTop: 12,
      marginHorizontal: 16,
      backgroundColor: cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: borderColor,
      padding: 16,
      overflow: 'hidden',
    },

    sentimentTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: T.textMuted,
      letterSpacing: 1.2,
      marginBottom: 14,
    },

    sentimentBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    sentimentPct: {
      fontSize: 14,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
      width: 42,
    },

    sentimentTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      flexDirection: 'row',
      overflow: 'hidden',
      backgroundColor: T.border,
    },

    sentimentFillLeft: {
      height: 6,
    },

    sentimentFillRight: {
      height: 6,
    },

    sentimentLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingHorizontal: 52,
    },

    sentimentLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1,
    },
  });
}
