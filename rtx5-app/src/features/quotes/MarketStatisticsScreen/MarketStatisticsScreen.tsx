import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Market Statistics Screen
 *
 * Displays real-time market statistics for a single instrument.
 * Shows Bid, Bid high, Bid low, Ask, Ask high, Ask low, Open price,
 * and Close price with live tick data from WebSocket.
 *
 * Presents the MT5-style statistics as an enterprise trading-desk panel.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { quotes, type QuoteItem } from '../../../dev/mock/tradingData';
import { useMarketData } from '../../../query/websocket';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTheme } from '../../../ui/theme/useTheme';
import { fmt } from '../../../utils/format';
import { safeRouterBack } from '../../../utils/navigation';
import { normalizeSymbol } from '../../../domain/symbols';
import { useInstrumentMeta } from '../../../query/instruments';
import { useLatestDailyCandle } from '../../../domain/candles/query/candles';
import { calculateMarketSentiment } from '../../../domain/marketSentiment';
import { getMeta } from '../SymbolDetailsScreen/instrumentMeta';
import { makeMarketStatisticsStyles } from './styles';

const LIVE_FEED_STALE_MS = 45_000;

type StatDirection = 'up' | 'down' | 'neutral';

type StatRow = {
  label: string;
  value: string;
  direction: StatDirection;
};

type MetricTile = {
  label: string;
  value: string;
  accent?: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const finiteOr = (value: number | undefined | null, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const formatVolume = (volume?: number) => {
  const safeVolume = finiteOr(volume, 0);
  if (safeVolume >= 1_000_000) return `${(safeVolume / 1_000_000).toFixed(2)}M`;
  if (safeVolume >= 1_000) return `${(safeVolume / 1_000).toFixed(1)}K`;
  return safeVolume.toLocaleString();
};

const formatTickTime = (timestamp?: number) => {
  if (!timestamp || !Number.isFinite(timestamp)) return '--';
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false });
};

const pickLatestTimestamp = (quote: QuoteItem) => {
  const candidates = [
    quote.lastReceivedAt,
    quote.lastTickAt,
    quote.feedTickAt,
    quote.lastPriceChangedAt,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return candidates.length > 0 ? Math.max(...candidates) : undefined;
};

const resolveDirection = (current: number, previous?: number): StatDirection => {
  if (typeof previous !== 'number' || !Number.isFinite(previous)) return 'neutral';
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'neutral';
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

  const bidHigh = Number.isFinite(sentiment.dayHigh) ? sentiment.dayHigh : q.high;
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
  const pip = 1 / Math.pow(10, priceDigits);
  const midPrice = ((q.bid || 0) + (q.ask || 0)) / 2;
  const absoluteChange = (q.bid || 0) - openPrice;
  const pointsChange = pip > 0 ? absoluteChange / pip : 0;
  const rangePositionPct = clampPercent(sentiment.rangePositionPct);
  const rangePct = bidLow > 0 && bidHigh > bidLow ? ((bidHigh - bidLow) / bidLow) * 100 : 0;
  const latestTickAt = pickLatestTimestamp(q);
  const liveSnapshotAvailable = Boolean(liveQuotes[symbol]);
  const hasRecentTick = latestTickAt ? Date.now() - latestTickAt <= LIVE_FEED_STALE_MS : liveSnapshotAvailable;
  const feedStatusLabel = hasRecentTick ? 'LIVE' : 'CONNECTING';
  const feedStatusColor = hasRecentTick ? T.up : T.textMuted;
  const marketStatusLabel = q.tradeAllowed === false ? 'Closed' : 'Open';
  const marketStatusColor = q.tradeAllowed === false ? T.down : T.up;
  const localMeta = useMemo(() => getMeta(symbol), [symbol]);
  const instrumentName = remoteMeta?.name ?? localMeta.name;
  const instrumentCategory = remoteMeta?.category ?? localMeta.category;
  const instrumentSector = remoteMeta?.sector ?? localMeta.sector;
  const instrumentDescriptor = [instrumentCategory, instrumentSector].filter(Boolean).join(' / ');
  const bidDirection = resolveDirection(q.bid, q.prevBid);
  const askDirection = resolveDirection(q.ask, q.prevAsk);
  const changeAccent = isUp ? T.up : T.down;
  const signedChange = `${isUp ? '+' : ''}${(q.changePct || 0).toFixed(2)}%`;
  const signedPoints = `${pointsChange >= 0 ? '+' : ''}${pointsChange.toFixed(0)} pts`;

  const rows: StatRow[] = useMemo(() => [
    { label: 'Bid high', value: fmt.price(bidHigh, priceDigits), direction: 'up' },
    { label: 'Bid low', value: fmt.price(bidLow, priceDigits), direction: 'down' },
    { label: 'Ask high', value: fmt.price(askHigh, priceDigits), direction: 'up' },
    { label: 'Ask low', value: fmt.price(askLow, priceDigits), direction: 'down' },
    { label: 'Open price', value: fmt.price(openPrice, priceDigits), direction: 'neutral' },
    { label: 'Close price', value: fmt.price(closePrice, priceDigits), direction: closePrice >= openPrice ? 'up' : 'down' },
    { label: 'Mid price', value: fmt.price(midPrice, priceDigits), direction: 'neutral' },
    { label: 'Day range', value: `${rangePct.toFixed(2)}%`, direction: 'neutral' },
  ], [askHigh, askLow, bidHigh, bidLow, closePrice, midPrice, openPrice, priceDigits, rangePct]);

  const overviewTiles: MetricTile[] = useMemo(() => [
    {
      label: 'Spread',
      value: parseFloat(Number(q.spread || 0).toFixed(2)).toString(),
      icon: 'swap-horizontal-outline',
    },
    {
      label: 'Change',
      value: signedChange,
      accent: changeAccent,
      icon: isUp ? 'trending-up-outline' : 'trending-down-outline',
    },
    {
      label: 'Points',
      value: signedPoints,
      accent: pointsChange >= 0 ? T.up : T.down,
      icon: 'analytics-outline',
    },
    {
      label: 'Volume',
      value: formatVolume(q.volume),
      icon: 'bar-chart-outline',
    },
    {
      label: 'Digits',
      value: String(priceDigits),
      icon: 'calculator-outline',
    },
    {
      label: 'Last Tick',
      value: formatTickTime(latestTickAt),
      icon: 'time-outline',
    },
  ], [changeAccent, isUp, latestTickAt, pointsChange, priceDigits, q.spread, q.volume, signedChange, signedPoints, T.down, T.up]);

  const styles = useMemo(() => makeMarketStatisticsStyles(T, isDark), [T, isDark]);
  const displaySymbol = fmt.symbol(symbol);
  const bidColor = bidDirection === 'down' ? T.down : bidDirection === 'up' ? T.up : T.text;
  const askColor = askDirection === 'down' ? T.down : askDirection === 'up' ? T.up : T.text;

  const markerColor = (direction: StatDirection) => {
    if (direction === 'up') return T.up;
    if (direction === 'down') return T.down;
    return T.textMuted;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => safeRouterBack(router, '/(tabs)/quotes')} hitSlop={15} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>Market Statistics</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{displaySymbol}</Text>
          </View>
          <View style={[styles.feedChip, { borderColor: feedStatusColor }]}>
            <View style={[styles.liveDot, { backgroundColor: feedStatusColor, shadowColor: feedStatusColor }]} />
            <Text style={[styles.feedText, { color: feedStatusColor }]}>{feedStatusLabel}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroPanel}>
          <View style={styles.instrumentRow}>
            <View style={styles.symbolMark}>
              <Ionicons name="stats-chart-outline" size={22} color={T.trading.buy.primary} />
            </View>
            <View style={styles.instrumentCopy}>
              <Text style={styles.symbolText} numberOfLines={1}>{displaySymbol}</Text>
              <Text style={styles.instrumentName} numberOfLines={1}>{instrumentName}</Text>
              <Text style={styles.instrumentDescriptor} numberOfLines={1}>{instrumentDescriptor}</Text>
            </View>
            <View style={[styles.marketChip, { borderColor: marketStatusColor }]}>
              <View style={[styles.marketDot, { backgroundColor: marketStatusColor }]} />
              <Text style={[styles.marketChipText, { color: marketStatusColor }]}>{marketStatusLabel}</Text>
            </View>
          </View>

          <View style={styles.quoteBand}>
            <View style={styles.quoteSide}>
              <View style={styles.quoteLabelRow}>
                <Text style={[styles.quoteLabel, { color: T.down }]}>BID</Text>
                {bidDirection !== 'neutral' && (
                  <Ionicons name={bidDirection === 'up' ? 'caret-up' : 'caret-down'} size={11} color={bidColor} />
                )}
              </View>
              <Text style={[styles.quoteValue, { color: bidColor }]} numberOfLines={1} adjustsFontSizeToFit>
                {fmt.price(q.bid, priceDigits)}
              </Text>
              <View style={styles.quoteMetaRow}>
                <Text style={styles.quoteMetaLabel}>Low</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(bidLow, priceDigits)}</Text>
                <Text style={styles.quoteMetaDivider}>/</Text>
                <Text style={styles.quoteMetaLabel}>High</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(bidHigh, priceDigits)}</Text>
              </View>
            </View>

            <View style={styles.quoteDivider} />

            <View style={styles.quoteSide}>
              <View style={styles.quoteLabelRow}>
                <Text style={[styles.quoteLabel, { color: T.up }]}>ASK</Text>
                {askDirection !== 'neutral' && (
                  <Ionicons name={askDirection === 'up' ? 'caret-up' : 'caret-down'} size={11} color={askColor} />
                )}
              </View>
              <Text style={[styles.quoteValue, { color: askColor }]} numberOfLines={1} adjustsFontSizeToFit>
                {fmt.price(q.ask, priceDigits)}
              </Text>
              <View style={styles.quoteMetaRow}>
                <Text style={styles.quoteMetaLabel}>Low</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(askLow, priceDigits)}</Text>
                <Text style={styles.quoteMetaDivider}>/</Text>
                <Text style={styles.quoteMetaLabel}>High</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(askHigh, priceDigits)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.changeStrip}>
            <View style={styles.changeItem}>
              <Text style={styles.changeLabel} numberOfLines={1}>Net Change</Text>
              <Text style={[styles.changeValue, { color: changeAccent }]} numberOfLines={1} adjustsFontSizeToFit>{signedChange}</Text>
            </View>
            <View style={styles.changeDivider} />
            <View style={styles.changeItem}>
              <Text style={styles.changeLabel} numberOfLines={1}>Points</Text>
              <Text style={[styles.changeValue, { color: pointsChange >= 0 ? T.up : T.down }]} numberOfLines={1} adjustsFontSizeToFit>{signedPoints}</Text>
            </View>
            <View style={styles.changeDivider} />
            <View style={styles.changeItem}>
              <Text style={styles.changeLabel} numberOfLines={1}>Range Position</Text>
              <Text style={styles.changeValue} numberOfLines={1} adjustsFontSizeToFit>{rangePositionPct.toFixed(0)}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="pulse-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>Session Statistics</Text>
            </View>
            <Text style={styles.sectionMeta}>Realtime</Text>
          </View>
          {rows.map((row, index) => (
            <View key={row.label} style={[styles.statRow, index < rows.length - 1 && styles.statRowBorder]}>
              <View style={styles.statLeft}>
                <View style={[styles.rowMarker, { backgroundColor: markerColor(row.direction) }]} />
                <Text style={styles.statLabel}>{row.label}</Text>
              </View>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="grid-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>Market Overview</Text>
            </View>
            <Text style={styles.sectionMeta}>{marketStatusLabel}</Text>
          </View>
          <View style={styles.overviewGrid}>
            {overviewTiles.map((tile, index) => (
              <View
                key={tile.label}
                style={[
                  styles.overviewCell,
                  index % 2 === 0 && styles.overviewCellRightBorder,
                  index < overviewTiles.length - 2 && styles.overviewCellBottomBorder,
                ]}
              >
                <View style={styles.overviewLabelRow}>
                  <Ionicons name={tile.icon} size={13} color={tile.accent ?? T.textMuted} />
                  <Text style={styles.overviewLabel}>{tile.label}</Text>
                </View>
                <Text
                  style={[styles.overviewValue, tile.accent ? { color: tile.accent } : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {tile.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.rangePanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="resize-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>Day Range</Text>
            </View>
            <Text style={styles.sectionMeta}>{rangePct.toFixed(2)}%</Text>
          </View>
          <View style={styles.rangeValueRow}>
            <View style={styles.rangeValueBlock}>
              <Text style={styles.rangeLabelSmall}>LOW</Text>
              <Text style={styles.rangeLabelValue}>{fmt.price(bidLow, priceDigits)}</Text>
            </View>
            <View style={[styles.rangeValueBlock, styles.rangeValueBlockCenter]}>
              <Text style={styles.rangeLabelSmall}>CURRENT</Text>
              <Text style={[styles.rangeLabelValue, { color: changeAccent }]}>{fmt.price(q.bid, priceDigits)}</Text>
            </View>
            <View style={[styles.rangeValueBlock, styles.rangeValueBlockRight]}>
              <Text style={styles.rangeLabelSmall}>HIGH</Text>
              <Text style={styles.rangeLabelValue}>{fmt.price(bidHigh, priceDigits)}</Text>
            </View>
          </View>
          <View style={styles.rangeTrack}>
            <View
              style={[
                styles.rangeFill,
                {
                  width: `${rangePositionPct}%` as any,
                  backgroundColor: changeAccent,
                },
              ]}
            />
            <View
              style={[
                styles.rangeKnob,
                {
                  left: `${rangePositionPct}%` as any,
                  borderColor: changeAccent,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.sentimentPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="people-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>Market Sentiment</Text>
            </View>
            <Text style={styles.sectionMeta}>Range model</Text>
          </View>
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
