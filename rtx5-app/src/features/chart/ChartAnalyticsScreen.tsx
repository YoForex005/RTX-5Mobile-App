/**
 * Chart Feature UI: ChartAnalyticsScreen
 * 
 * Renders the advanced analytics panel providing fundamental data, news feeds,
 * high market volatility (HMR) periods, and performance metrics for the active pair.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Image, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../theme/useTheme';
import { spacing } from '../../theme';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useMarketData } from '../../query/websocket';
import { useLiveCandles } from '../../hooks/useLiveCandles';

// Performance periods — labels only; values computed dynamically from candle data
const PERF_LABELS = ['Hour', 'Today', 'Week', 'Month', 'Year'] as const;
const PERF_CANDLE_COUNTS: Record<string, number> = { Hour: 60, Today: 1440, Week: 10080, Month: 43200, Year: 525600 };

const HMR_PERIODS = [
  { time: '23:25 - 23 Mar, 03:35', desc: 'Max Leverage 1:200 | ECB Cipollone Speech | Fed Chair...' },
  { time: '23 Mar, 17:00 - 18:01', desc: 'Max Leverage 1:200 | Chicago Fed National Activity Index' },
  { time: '23 Mar, 17:45 - 18:01', desc: 'Max Leverage 1:200 | Chicago Fed National Activity Index' },
  { time: '24 Mar, 09:00 - 10:01', desc: 'Max Leverage 1:200 | German Manufacturing PMI' },
  { time: '24 Mar, 14:30 - 15:01', desc: 'Max Leverage 1:200 | US Durable Goods Orders' },
  { time: '25 Mar, 12:00 - 13:01', desc: 'Max Leverage 1:200 | UK CPI YoY' },
];

const HMR_PREVIEW_COUNT = 3;

const UPCOMING_EVENTS = [
  { title: 'PPI YoY', flag: 'https://flagcdn.com/w40/de.png', countryCode: 'DE', impact: 3, time: '12:30 PM – In 1 hour' },
  { title: 'PPI MoM', flag: 'https://flagcdn.com/w40/de.png', countryCode: 'DE', impact: 3, time: '12:30 PM – In 1 hour' },
  { title: 'Balance of Trade', flag: 'https://flagcdn.com/w40/it.png', countryCode: 'IT', impact: 3, time: '2:30 PM – In 3 hours' },
  { title: 'Consumer Confidence', flag: 'https://flagcdn.com/w40/us.png', countryCode: 'US', impact: 2, time: '4:00 PM – In 5 hours' },
  { title: 'Retail Sales MoM', flag: 'https://flagcdn.com/w40/gb.png', countryCode: 'GB', impact: 2, time: '7:00 AM – Tomorrow' },
  { title: 'GDP QoQ', flag: 'https://flagcdn.com/w40/jp.png', countryCode: 'JP', impact: 3, time: '11:50 PM – In 12 hours' },
];

const EVENTS_PREVIEW_COUNT = 3;

const LATEST_NEWS = [
  {
    title: 'EU urges halt to strikes on energy and water infrastructure amid Middle East su...',
    pair: 'EUR/USD', change: -0.20, time: '6 hours ago',
    image: 'https://images.unsplash.com/photo-1628151015968-3a4429e9ef04?w=100'
  },
  {
    title: 'EUR/USD surges over 1% as ECB rate hike talk hits USD',
    pair: 'EUR/USD', change: -0.20, time: '8 hours ago',
    image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=100'
  },
  {
    title: 'Forex Today: US Dollar Index drops below 100 after central banks hold rates',
    pair: 'EUR/USD', change: -0.20, time: '11 hours ago',
    image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=100'
  },
  {
    title: 'Gold prices climb as weaker USD pushes haven demand',
    pair: 'XAU/USD', change: 0.45, time: '14 hours ago',
    image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=100'
  },
  {
    title: 'GBP/USD steadies near 1.32 as UK data boosts recovery outlook',
    pair: 'GBP/USD', change: 0.12, time: '16 hours ago',
    image: 'https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=100'
  },
];

const NEWS_PREVIEW_COUNT = 3;

const SIGNAL_DETAILS = [
  { label: 'Entry Zone', value: '1.1540 – 1.1560' },
  { label: 'Target 1', value: '1.1620' },
  { label: 'Target 2', value: '1.1680' },
  { label: 'Stop Loss', value: '1.1490' },
  { label: 'Risk/Reward', value: '1 : 2.4' },
  { label: 'Confidence', value: 'Medium-High' },
];

// Helper: format unix timestamp to HH:MM
function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Helper: get decimal precision for symbol
function getDecimals(sym: string): number {
  return sym.toUpperCase().includes('JPY') ? 3 : 5;
}

// Converts a raw array of x,y coordinates into a mathematically smoothed SVG path
function generateSmoothPath(points: { x: number, y: number }[]) {
  if (points.length === 0) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    d += ` C ${p1.x + (p2.x - p1.x) / 2},${p1.y} ${p1.x + (p2.x - p1.x) / 2},${p2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function ChartAnalyticsScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const currentSymbol = symbol || 'EUR/USD';
  const chartTimeframe = useUserPreferences((s) => s.chartTimeframe);
  const decimals = getDecimals(currentSymbol);

  // ── Live WebSocket Price ──────────────────────────────────────────
  const liveQuotes = useMarketData([currentSymbol]);
  const liveQuote = liveQuotes[currentSymbol];
  const livePrice = liveQuote?.bid ?? 0;

  // ── Live Candles (OHLC) from WebSocket ────────────────────────────
  const { candles } = useLiveCandles(currentSymbol, chartTimeframe);

  // ── Daily Range data from candles ─────────────────────────────────
  const rangeData = useMemo(() => {
    if (candles.length === 0) return { low: 0, high: 0, open: 0, current: 0, points: [] as { time: string; price: number }[] };
    const closes = candles.map(c => c.close);
    const low = Math.min(...candles.map(c => c.low));
    const high = Math.max(...candles.map(c => c.high));
    const open = candles[0].open;
    const current = candles[candles.length - 1].close;
    // Sample last 20 candles for sparkline
    const sample = candles.slice(-20);
    const points = sample.map(c => ({ time: formatTime(c.time), price: c.close }));
    return { low, high, open, current, points };
  }, [candles]);

  // ── Performance Snapshot from candle history ──────────────────────
  const performanceData = useMemo(() => {
    const current = rangeData.current || livePrice;
    if (!current || candles.length === 0) {
      return PERF_LABELS.map((label, i) => ({ label, change: 0, isDown: false, active: i === 0 }));
    }
    return PERF_LABELS.map((label, i) => {
      const lookback = Math.min(PERF_CANDLE_COUNTS[label], candles.length);
      const pastCandle = candles[Math.max(0, candles.length - lookback)];
      const pastPrice = pastCandle?.close || current;
      const change = pastPrice !== 0 ? ((current - pastPrice) / pastPrice) * 100 : 0;
      return { label, change: Math.round(change * 100) / 100, isDown: change < 0, active: i === 0 };
    });
  }, [candles, rangeData.current, livePrice]);

  // Expand/collapse state for each section
  const [hmrExpanded, setHmrExpanded] = useState(false);
  const [signalExpanded, setSignalExpanded] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [activePerf, setActivePerf] = useState(0);

  const toggleSection = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(prev => !prev);
  };

  // ── Sparkline SVG from dynamic range points ──────────────────────
  const sparkLineData = useMemo(() => {
    const data = rangeData.points;
    if (data.length < 2) return { path: '', maxNode: { x: 0, y: 0 }, minNode: { x: 0, y: 0 }, maxIndex: 0, minIndex: 0 };
    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const prange = maxPrice - minPrice || 1;

    const points = data.map((d, i) => ({
      x: (i / (data.length - 1)) * 100,
      y: 35 - ((d.price - minPrice) / prange) * 30
    }));

    const maxIndex = prices.indexOf(maxPrice);
    const minIndex = prices.indexOf(minPrice);

    return {
      path: generateSmoothPath(points),
      maxNode: points[maxIndex] || { x: 0, y: 0 },
      minNode: points[minIndex] || { x: 0, y: 0 },
      maxIndex, minIndex
    };
  }, [rangeData.points]);

  return (
    <Screen style={styles.screen}>
      <Stack.Screen 
        options={{ 
          title: `Analytics, ${currentSymbol}`, 
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={16} style={{ marginLeft: 6 }}>
              <Ionicons name="arrow-back" size={26} color={T.text} />
            </Pressable>
          ),
          headerStyle: { backgroundColor: isDark ? '#000000' : T.bg },
          headerTitleStyle: { color: T.text, fontSize: 18, fontWeight: '700' },
          headerShadowVisible: false,
        }} 
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Performance Block — Dynamic from candle data */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Performance Snapshot</Text>
          <View style={styles.perfBlock}>
            {performanceData.map((item, i) => (
              <Pressable key={i} style={[styles.perfItem, activePerf === i && styles.perfItemActive]} onPress={() => setActivePerf(i)}>
                <Text style={[styles.perfLabel, activePerf === i && styles.perfLabelActive]}>{item.label}</Text>
                <View style={styles.perfChangeRow}>
                  <Ionicons name={item.isDown ? 'arrow-down' : 'arrow-up'} size={10} color={item.isDown ? T.trading.sell.primary : T.trading.buy.primary} />
                  <Text style={item.isDown ? styles.perfValRed : styles.perfValBlue}>
                    {Math.abs(item.change).toFixed(2)}%
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Daily Range — Modern Professional Design */}
        <View style={styles.card}>
          <View style={styles.rangeHeaderRow}>
            <Text style={styles.cardHeader}>Daily Range</Text>
            <View style={styles.rangeLivePill}>
              <View style={styles.rangeLiveDot} />
              <Text style={styles.rangeLiveText}>LIVE</Text>
            </View>
          </View>

          {/* Current Price Hero */}
          <View style={styles.rangeCurrentRow}>
            <Text style={styles.rangeCurrentPrice}>
              {(livePrice || rangeData.current).toFixed(decimals)}
            </Text>
            <View style={styles.rangeCurrentBadge}>
              <Text style={styles.rangeCurrentBadgeText}>Current</Text>
            </View>
          </View>

          {/* Range Bar Visualization */}
          <View style={styles.rangeBarSection}>
            {/* Labels Row */}
            <View style={styles.rangeLabelsRow}>
              <Text style={styles.rangeLabelLow}>LOW</Text>
              <Text style={styles.rangeLabelHigh}>HIGH</Text>
            </View>
            
            {/* Price Values Row */}
            <View style={styles.rangePricesRow}>
              <Text style={styles.rangePriceLow}>
                {rangeData.low.toFixed(decimals)}
              </Text>
              <Text style={styles.rangePriceHigh}>
                {rangeData.high.toFixed(decimals)}
              </Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.rangeBarTrack}>
              <View style={[styles.rangeBarFill, { 
                width: `${rangeData.high !== rangeData.low ? ((rangeData.current - rangeData.low) / (rangeData.high - rangeData.low)) * 100 : 50}%` 
              }]} />
              <View style={[styles.rangeBarThumb, {
                left: `${rangeData.high !== rangeData.low ? ((rangeData.current - rangeData.low) / (rangeData.high - rangeData.low)) * 100 : 50}%`
              }]} />
            </View>

            {/* Sparkline Curve */}
            <View style={styles.rangeSparklineWrap}>
              <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="rangeGlow" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={T.trading.buy.primary} stopOpacity="0.25" />
                    <Stop offset="1" stopColor={T.trading.buy.primary} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Path d={`${sparkLineData.path} L100,40 L0,40 Z`} fill="url(#rangeGlow)" />
                <Path d={sparkLineData.path} fill="none" stroke={T.trading.buy.primary} strokeWidth="1.5" strokeLinecap="round" />
                <Circle cx={sparkLineData.maxNode.x} cy={sparkLineData.maxNode.y} r="2.5" fill={T.trading.buy.primary} stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
                <Circle cx={sparkLineData.minNode.x} cy={sparkLineData.minNode.y} r="2.5" fill={T.trading.sell.primary} stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
              </Svg>
            </View>
          </View>

          {/* Time Range & Stats Grid */}
          <View style={styles.rangeStatsRow}>
            <View style={styles.rangeStatItem}>
              <Text style={styles.rangeStatLabel}>Open</Text>
              <Text style={styles.rangeStatValue}>{rangeData.open.toFixed(decimals)}</Text>
            </View>
            <View style={styles.rangeStatDivider} />
            <View style={styles.rangeStatItem}>
              <Text style={styles.rangeStatLabel}>Spread</Text>
              <Text style={styles.rangeStatValue}>
                {liveQuote?.spread?.toFixed(1) ?? ((rangeData.high - rangeData.low) * (decimals === 3 ? 1000 : 100000)).toFixed(1)} pts
              </Text>
            </View>
            <View style={styles.rangeStatDivider} />
            <View style={styles.rangeStatItem}>
              <Text style={styles.rangeStatLabel}>Time</Text>
              <Text style={styles.rangeStatValue}>{rangeData.points.length > 0 ? `${rangeData.points[0].time} – ${rangeData.points[rangeData.points.length - 1].time}` : '--'}</Text>
            </View>
          </View>
        </View>

        {/* HMR List */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeader}>Upcoming HMR Periods</Text>
            <Ionicons name="information-circle-outline" size={20} color={T.textMuted} />
          </View>
          <View style={styles.listContainer}>
            {(hmrExpanded ? HMR_PERIODS : HMR_PERIODS.slice(0, HMR_PREVIEW_COUNT)).map((item, i) => (
              <React.Fragment key={i}>
                <View style={[styles.listItem, i !== 0 && styles.divider]}>
                  <View style={styles.listTexts}>
                    <Text style={styles.listTime}>{item.time}</Text>
                    <Text style={styles.listDesc} numberOfLines={1}>{item.desc}</Text>
                  </View>
                  <Ionicons name="notifications-outline" size={20} color={T.textMuted} />
                </View>
              </React.Fragment>
            ))}
            {HMR_PERIODS.length > HMR_PREVIEW_COUNT && (
              <Pressable style={styles.linkBtn} onPress={() => toggleSection(setHmrExpanded)}>
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>{hmrExpanded ? 'Show Less' : 'View All Periods'}</Text>
                  <Ionicons name={hmrExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={T.trading.buy.hover} />
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {/* Signals */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Trading Signals</Text>
          <View style={styles.signalsContainer}>
            <View style={styles.signalBadgeRow}>
              <View style={styles.signalBadge}>
                <Ionicons name='arrow-up' size={12} color={T.trading.buy.hover} />
                <Text style={styles.signalBadgeText}>Intraday</Text>
              </View>
              <Text style={styles.signalDate}>Feb 27, 2026</Text>
            </View>
            <Text style={styles.signalTitle}>Intraday: consolidation.</Text>
            <Text style={styles.signalDesc}>MT: the bias remains bullish.</Text>
            {signalExpanded && (
              <View style={styles.signalDetailsGrid}>
                {SIGNAL_DETAILS.map((detail, i) => (
                  <View key={detail.label} style={[styles.signalDetailRow, i !== 0 && styles.divider]}>
                    <Text style={styles.signalDetailLabel}>{detail.label}</Text>
                    <Text style={styles.signalDetailValue}>{detail.value}</Text>
                  </View>
                ))}
              </View>
            )}
            <Pressable style={styles.linkBtn} onPress={() => toggleSection(setSignalExpanded)}>
              <View style={styles.linkRow}>
                <Text style={styles.linkText}>{signalExpanded ? 'Show Less' : 'Full Signal Report'}</Text>
                <Ionicons name={signalExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={T.trading.buy.hover} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Events */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Upcoming Events</Text>
          <View style={styles.listContainer}>
            {(eventsExpanded ? UPCOMING_EVENTS : UPCOMING_EVENTS.slice(0, EVENTS_PREVIEW_COUNT)).map((item, i) => (
              <React.Fragment key={i}>
                <View style={[styles.eventItem, i !== 0 && styles.divider]}>
                  <Image source={{ uri: item.flag }} style={styles.flagIcon} />
                  <View style={styles.eventTexts}>
                    <Text style={styles.eventTitle}>{item.title}</Text>
                    <View style={styles.eventMetaRow}>
                      <Text style={styles.eventCode}>{item.countryCode}</Text>
                      <View style={styles.impactBars}>
                        {[1, 2, 3].map(b => (
                          <View key={b} style={[styles.impactBar, { backgroundColor: item.impact >= b ? T.trading.sell.primary : T.borderSubtle }]} />
                        ))}
                      </View>
                      <Text style={styles.eventTime}>{item.time}</Text>
                    </View>
                  </View>
                </View>
              </React.Fragment>
            ))}
            {UPCOMING_EVENTS.length > EVENTS_PREVIEW_COUNT && (
              <Pressable style={styles.linkBtn} onPress={() => toggleSection(setEventsExpanded)}>
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>{eventsExpanded ? 'Show Less' : 'Economic Calendar'}</Text>
                  <Ionicons name={eventsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={T.trading.buy.hover} />
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {/* News */}
        <View style={[styles.card, { marginBottom: 40 }]}>
          <Text style={styles.cardHeader}>Latest News</Text>
          <View style={styles.listContainer}>
            {(newsExpanded ? LATEST_NEWS : LATEST_NEWS.slice(0, NEWS_PREVIEW_COUNT)).map((item, i) => (
              <React.Fragment key={i}>
                <View style={[styles.newsItem, i !== 0 && styles.divider]}>
                  <Image source={{ uri: item.image }} style={styles.newsImage} />
                  <View style={styles.newsTexts}>
                    <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.newsMetaRow}>
                      <Text style={styles.newsPair}>{item.pair}</Text>
                      <Ionicons name={item.change >= 0 ? 'arrow-up' : 'arrow-down'} size={10} color={item.change >= 0 ? T.trading.buy.primary : T.trading.sell.primary} />
                      <Text style={[styles.newsChange, item.change >= 0 && { color: T.trading.buy.primary }]}>{Math.abs(item.change).toFixed(2)}%</Text>
                      <Text style={styles.newsTime}>{item.time}</Text>
                    </View>
                  </View>
                </View>
              </React.Fragment>
            ))}
            {LATEST_NEWS.length > NEWS_PREVIEW_COUNT && (
              <Pressable style={styles.linkBtn} onPress={() => toggleSection(setNewsExpanded)}>
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>{newsExpanded ? 'Show Less' : 'More Updates'}</Text>
                  <Ionicons name={newsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={T.trading.buy.hover} />
                </View>
              </Pressable>
            )}
          </View>
        </View>

      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? 'rgba(15, 23, 42, 0.7)' : T.glass2;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: isDark ? '#000000' : T.bg,
    },
    scrollContent: {
      paddingTop: spacing.md,
    },
    card: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? T.border : T.borderSubtle,
      backgroundColor: cardBg,
      shadowColor: isDark ? '#2563EB' : '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.08 : 0.03,
      shadowRadius: isDark ? 16 : 10,
      elevation: 4,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    cardHeader: {
      color: T.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.5,
      marginBottom: spacing.md,
    },
    perfBlock: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : T.glass1,
      borderRadius: 12,
      padding: 4,
      justifyContent: 'space-between',
    },
    perfItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 8,
    },
    perfItemActive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : T.glass2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    perfLabel: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '500',
      marginBottom: 6,
    },
    perfLabelActive: {
      color: T.text,
      fontWeight: '700',
    },
    perfChangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    perfValRed: {
      color: T.trading.sell.primary,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    perfValBlue: {
      color: T.trading.buy.primary,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },

    // ── Daily Range — Modern Design ──────────────────────────────────────
    rangeHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    rangeLivePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)',
    },
    rangeLiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#22C55E',
    },
    rangeLiveText: {
      color: '#22C55E',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    rangeCurrentRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      marginBottom: 18,
    },
    rangeCurrentPrice: {
      color: T.text,
      fontSize: 28,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    rangeCurrentBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)',
    },
    rangeCurrentBadgeText: {
      color: T.trading.buy.primary,
      fontSize: 11,
      fontWeight: '700',
    },

    // Range bar
    rangeBarSection: {
      marginBottom: 16,
    },
    rangeLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    rangeLabelLow: {
      color: T.trading.sell.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    rangeLabelHigh: {
      color: T.trading.buy.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    rangePricesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    rangePriceLow: {
      color: T.textSub,
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    rangePriceHigh: {
      color: T.textSub,
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    rangeBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      position: 'relative',
      overflow: 'visible',
      marginBottom: 16,
    },
    rangeBarFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      height: 6,
      borderRadius: 3,
      backgroundColor: T.trading.buy.primary,
    },
    rangeBarThumb: {
      position: 'absolute',
      top: -5,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: T.trading.buy.primary,
      borderWidth: 3,
      borderColor: isDark ? '#000000' : '#FFFFFF',
      marginLeft: -8,
      shadowColor: T.trading.buy.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 6,
      elevation: 4,
    },

    // Sparkline inside range
    rangeSparklineWrap: {
      height: 64,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    },

    // Stats grid
    rangeStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
      paddingTop: 14,
    },
    rangeStatItem: {
      flex: 1,
      alignItems: 'center',
    },
    rangeStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    },
    rangeStatLabel: {
      color: T.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    rangeStatValue: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },

    listContainer: {
      paddingBottom: 4,
    },
    listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
    },
    listTexts: {
      flex: 1,
      paddingRight: 16,
    },
    listTime: {
      color: T.text,
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      marginBottom: 6,
    },
    listDesc: {
      color: T.textSub,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    divider: {
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    },
    linkBtn: {
      marginTop: spacing.sm,
      alignItems: 'center',
      paddingVertical: 14,
    },
    linkText: {
      color: T.trading.buy.hover,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    signalDetailsGrid: {
      marginTop: 16,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    },
    signalDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    signalDetailLabel: {
      color: T.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    signalDetailValue: {
      color: T.text,
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    signalsContainer: {
      paddingBottom: 4,
    },
    signalBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    signalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.08)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      gap: 4,
    },
    signalBadgeText: {
      color: T.trading.buy.hover,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    signalTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 6,
      letterSpacing: -0.3,
    },
    signalDesc: {
      color: T.textSub,
      fontSize: 15,
      lineHeight: 22,
    },
    signalDate: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    eventItem: {
      flexDirection: 'row',
      paddingVertical: 16,
    },
    flagIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : T.borderSubtle,
    },
    eventTexts: {
      flex: 1,
      justifyContent: 'center',
    },
    eventTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 8,
    },
    eventMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    eventCode: {
      color: T.textSub,
      fontSize: 13,
      fontWeight: '800',
      marginRight: 10,
    },
    impactBars: {
      flexDirection: 'row',
      gap: 3,
      marginRight: 12,
    },
    impactBar: {
      width: 4,
      height: 12,
      borderRadius: 2,
    },
    eventTime: {
      color: T.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    newsItem: {
      flexDirection: 'row',
      paddingVertical: 16,
      alignItems: 'center',
    },
    newsImage: {
      width: 56,
      height: 56,
      borderRadius: 12,
      marginRight: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : T.glass1,
    },
    newsTexts: {
      flex: 1,
    },
    newsTitle: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
      marginBottom: 8,
    },
    newsMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    newsPair: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '800',
    },
    newsChange: {
      color: T.trading.sell.primary,
      fontSize: 12,
      fontWeight: '800',
    },
    newsTime: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '500',
    },
  });
}

