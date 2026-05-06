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
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { quotes, type QuoteItem } from '../../../dev/mock/tradingData';
import { useMarketData } from '../../../query/websocket';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTheme } from '../../../ui/theme/useTheme';
import { fmt } from '../../../utils/format';
import { normalizeSymbol } from '../../../domain/symbols';
import { useInstrumentMeta } from '../../../query/instruments';
import { useLatestDailyCandle } from '../../../domain/candles/query/candles';
import { calculateMarketSentiment } from '../../../domain/marketSentiment';
import { makeMarketStatisticsStyles } from './styles';

type StatDirection = 'up' | 'neutral';

type StatRow = {
  label: string;
  value: string;
  direction: StatDirection;
};

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

  const styles = useMemo(() => makeMarketStatisticsStyles(T, isDark), [T, isDark]);
  const displaySymbol = fmt.symbol(symbol);

  return (
    <View style={[styles.root, { backgroundColor: T.bg }]}>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={15} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{displaySymbol}</Text>
          <View style={styles.headerRight}>
            <View style={[styles.liveDot, { backgroundColor: T.up, shadowColor: T.up }]} />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.statRow, index < rows.length - 1 && styles.statRowBorder]}>
            <View style={styles.statLeft}>
              {row.direction === 'up' ? (
                <Ionicons name="caret-up" size={12} color={T.up} style={styles.directionIcon} />
              ) : (
                <View style={[styles.neutralDot, { backgroundColor: T.up }]} />
              )}
              <Text style={styles.statLabel}>{row.label}</Text>
            </View>
            <Text style={styles.statValue}>{row.value}</Text>
          </View>
        ))}

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
              <Text style={[styles.additionalGridValue, { color: isUp ? T.up : T.down }]}>
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
              <Text style={styles.additionalGridValue}>{q.digits ?? 2}</Text>
            </View>
          </View>
        </View>

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

        <View style={styles.sentimentCard}>
          <Text style={styles.sentimentTitle}>MARKET SENTIMENT</Text>
          <View style={styles.sentimentBarRow}>
            <Text style={[styles.sentimentPct, { color: T.up }]}>
              {sentiment.buyPct.toFixed(0)}%
            </Text>
            <View style={styles.sentimentTrack}>
              <View style={[styles.sentimentFillLeft, { width: `${sentiment.buyPct}%` as any, backgroundColor: T.up }]} />
              <View style={[styles.sentimentFillRight, { width: `${sentiment.sellPct}%` as any, backgroundColor: T.down }]} />
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
