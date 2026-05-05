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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Screen } from '../../ui/components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { spacing } from '../../ui/theme/index';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useMarketData } from '../../query/websocket';
import { useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';

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
  { title: 'PPI YoY', flag: 'https://flagcdn.com/w40/de.png', countryCode: 'DE', impact: 3, time: 'In 1 hour' },
  { title: 'PPI MoM', flag: 'https://flagcdn.com/w40/de.png', countryCode: 'DE', impact: 3, time: 'In 1 hour' },
  { title: 'Balance of Trade', flag: 'https://flagcdn.com/w40/it.png', countryCode: 'IT', impact: 3, time: 'In 3 hours' },
  { title: 'Consumer Confidence', flag: 'https://flagcdn.com/w40/us.png', countryCode: 'US', impact: 2, time: 'In 5 hours' },
  { title: 'Retail Sales MoM', flag: 'https://flagcdn.com/w40/gb.png', countryCode: 'GB', impact: 2, time: 'Tomorrow' },
  { title: 'GDP QoQ', flag: 'https://flagcdn.com/w40/jp.png', countryCode: 'JP', impact: 3, time: 'In 12 hours' },
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
  const insets = useSafeAreaInsets();
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

  const isSignalActive = true; // Set to false to test the EXPIRED gray dot indicator
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [activePerf, setActivePerf] = useState(0);

  const toggleSection = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(prev => !prev);
  };



  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>
              Analytics · {currentSymbol}
            </Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </View>
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

        {/* Daily Range — Enterprise Premium Design */}
        {(() => {
          const current = livePrice || rangeData.current;
          const range = rangeData.high - rangeData.low;
          const positionPct = range > 0 ? Math.max(0, Math.min(100, ((current - rangeData.low) / range) * 100)) : 50;
          const change = current - rangeData.open;
          const changePct = rangeData.open > 0 ? (change / rangeData.open) * 100 : 0;
          const isUp = change >= 0;
          const accentColor = isUp ? T.trading.buy.primary : T.trading.sell.primary;
          const pipMultiplier = decimals === 3 ? 1000 : 100000;
          const rangePts = (range * pipMultiplier).toFixed(0);
          const volatilityPct = current > 0 ? (range / current) * 100 : 0;

          // Split-decimal hero price (last 2 digits emphasized)
          const priceStr = current.toFixed(decimals);
          const priceMain = priceStr.slice(0, -2);
          const priceHuge = priceStr.slice(-2);

          const formatSigned = (n: number, fixed: number, suffix = '') =>
            `${n >= 0 ? '+' : ''}${n.toFixed(fixed)}${suffix}`;

          // Where to render the position indicator zone label
          const zoneLabel = positionPct >= 66 ? 'UPPER' : positionPct >= 33 ? 'MID' : 'LOWER';
          const zoneColor = positionPct >= 66
            ? T.trading.buy.primary
            : positionPct >= 33
              ? T.textMuted
              : T.trading.sell.primary;

          return (
            <View style={styles.card}>
              <View style={styles.rangeHeaderRow}>
                <Text style={styles.cardHeader}>Daily Range</Text>
                <View style={styles.rangeLivePill}>
                  <View style={styles.rangeLiveDot} />
                  <Text style={styles.rangeLiveText}>LIVE</Text>
                </View>
              </View>

              {/* Hero: split-decimal price + signed change pill */}
              <View style={styles.rangeHeroRow}>
                <Text style={styles.rangeHeroPrice} numberOfLines={1} adjustsFontSizeToFit>
                  {priceMain}
                  <Text style={[styles.rangeHeroPriceHuge, { color: accentColor }]}>{priceHuge}</Text>
                </Text>
                <View style={[styles.rangeChangePill, { backgroundColor: isUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', borderColor: isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)' }]}>
                  <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={11} color={accentColor} />
                  <Text style={[styles.rangeChangePillText, { color: accentColor }]}>
                    {formatSigned(changePct, 2, '%')}
                  </Text>
                </View>
              </View>

              {/* Position-in-range row */}
              <View style={styles.rangePositionRow}>
                <Text style={styles.rangePositionLabel}>POSITION IN RANGE</Text>
                <View style={styles.rangePositionRight}>
                  <Text style={[styles.rangePositionZone, { color: zoneColor }]}>{zoneLabel}</Text>
                  <Text style={styles.rangePositionPct}>{positionPct.toFixed(0)}%</Text>
                </View>
              </View>

              {/* Range bar */}
              <View style={styles.rangeBarSection}>
                <View style={styles.rangeBarOuter}>
                  <View style={styles.rangeBarTrack}>
                    <View style={[styles.rangeTick, { left: '25%' }]} />
                    <View style={[styles.rangeTick, { left: '50%' }]} />
                    <View style={[styles.rangeTick, { left: '75%' }]} />

                    <View style={[styles.rangeBarFill, { width: `${positionPct}%`, backgroundColor: accentColor }]} />

                    <View style={[
                      styles.rangeBarThumb, 
                      { 
                        left: `${positionPct}%`, 
                        backgroundColor: accentColor, 
                        shadowColor: accentColor, 
                        borderColor: isDark ? '#0E141F' : '#FFFFFF' 
                      }
                    ]} />
                  </View>
                </View>

                {/* Low / High labels */}
                <View style={styles.rangeEndpointsRow}>
                  <View style={styles.rangeEndpointCol}>
                    <Text style={styles.rangeEndpointLabel}>LOW</Text>
                    <Text style={styles.rangeEndpointValue}>{rangeData.low.toFixed(decimals)}</Text>
                  </View>
                  <View style={[styles.rangeEndpointCol, { alignItems: 'flex-end' }]}>
                    <Text style={styles.rangeEndpointLabel}>HIGH</Text>
                    <Text style={styles.rangeEndpointValue}>{rangeData.high.toFixed(decimals)}</Text>
                  </View>
                </View>
              </View>

              {/* Premium stats grid: Open / Range / Volatility / Change */}
              <View style={styles.rangeStatsRow}>
                <View style={styles.rangeStatItem}>
                  <Text style={styles.rangeStatLabel}>Open</Text>
                  <Text style={styles.rangeStatValue}>{rangeData.open.toFixed(decimals)}</Text>
                </View>
                <View style={styles.rangeStatDivider} />
                <View style={styles.rangeStatItem}>
                  <Text style={styles.rangeStatLabel}>Range</Text>
                  <Text style={styles.rangeStatValue}>{rangePts} pts</Text>
                </View>
                <View style={styles.rangeStatDivider} />
                <View style={styles.rangeStatItem}>
                  <Text style={styles.rangeStatLabel}>Volatility</Text>
                  <Text style={styles.rangeStatValue}>{volatilityPct.toFixed(2)}%</Text>
                </View>
                <View style={styles.rangeStatDivider} />
                <View style={styles.rangeStatItem}>
                  <Text style={styles.rangeStatLabel}>Change</Text>
                  <Text style={[styles.rangeStatValue, { color: accentColor }]}>{formatSigned(change, decimals)}</Text>
                </View>
              </View>
            </View>
          );
        })()}

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
            <View style={styles.signalHeroRow}>
              <View style={styles.signalOrb}>
                <Ionicons name="trending-up" size={24} color={T.trading.buy.primary} />
              </View>
              <View style={styles.signalHeroTexts}>
                <Text style={styles.signalPrimaryAction}>BUY OPPORTUNITY</Text>
                <Text style={styles.signalSubAction}>{currentSymbol} • Intraday</Text>
              </View>
              <View style={styles.signalBadge}>
                <View style={isSignalActive ? styles.signalActiveDot : styles.signalInactiveDot} />
                <Text style={[styles.signalBadgeText, !isSignalActive && { color: T.textMuted }]}>
                  {isSignalActive ? 'ACTIVE' : 'EXPIRED'}
                </Text>
              </View>
            </View>
            
            <View style={styles.signalBody}>
              <Text style={styles.signalTitle}>Consolidation Breakout Expected</Text>
              <Text style={styles.signalDesc}>Medium term bias remains strongly bullish with upper targets in sight. Resistance break triggers continuation.</Text>
            </View>

            <View style={styles.signalMetricsGrid}>
              <View style={styles.signalMetricCol}>
                <Text style={styles.signalMetricLabel}>ENTRY</Text>
                <Text style={[styles.signalMetricVal, { color: T.text }]}>1.1550</Text>
              </View>
              <View style={styles.signalMetricDiv} />
              <View style={styles.signalMetricCol}>
                <Text style={styles.signalMetricLabel}>TARGET</Text>
                <Text style={[styles.signalMetricVal, { color: T.trading.buy.primary }]}>1.1680</Text>
              </View>
              <View style={styles.signalMetricDiv} />
              <View style={styles.signalMetricCol}>
                <Text style={styles.signalMetricLabel}>STOP LOSS</Text>
                <Text style={[styles.signalMetricVal, { color: T.trading.sell.primary }]}>1.1490</Text>
              </View>
            </View>

            <View style={styles.signalSecondaryMetrics}>
              <View style={styles.signalSecBadge}>
                <Ionicons name="pie-chart" size={12} color={T.textMuted} />
                <Text style={styles.signalSecText}>Risk/Reward 1:2.4</Text>
              </View>
              <View style={styles.signalSecBadge}>
                <Ionicons name="shield-checkmark" size={12} color={T.textMuted} />
                <Text style={styles.signalSecText}>Med-High Conviction</Text>
              </View>
            </View>
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
                    <View style={styles.eventTitleRow}>
                      <Text style={styles.eventTitle}>{item.title}</Text>
                      {(() => {
                        let cfg = { bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: T.textMuted, text: 'LOW' };
                        if (item.impact >= 3) cfg = { bg: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)', color: T.trading.sell.primary, text: 'HIGH' };
                        else if (item.impact === 2) cfg = { bg: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', text: 'MED' };

                        return (
                          <View style={[styles.impactPill, { backgroundColor: cfg.bg }]}>
                            <View style={[styles.impactDot, { backgroundColor: cfg.color }]} />
                            <Text style={[styles.impactPillText, { color: cfg.color }]}>{cfg.text}</Text>
                          </View>
                        );
                      })()}
                    </View>
                    <View style={styles.eventMetaRow}>
                      <Text style={styles.eventCode}>
                        {item.countryCode}
                        <Text style={{ color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', fontWeight: '400' }}>  |  </Text>
                        <Text style={styles.eventTime}>{item.time}</Text>
                      </Text>
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
  const cardBg = isDark ? '#0E141F' : T.glass2;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: isDark ? '#06080D' : T.bg,
    },
    scrollContent: {
      paddingTop: spacing.md,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : T.border,
      backgroundColor: isDark ? '#06080D' : T.bg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
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
    // Hero row
    rangeHeroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    rangeHeroPrice: {
      color: T.text,
      fontSize: 30,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -1.2,
      flex: 1,
    },
    rangeHeroPriceHuge: {
      fontSize: 34,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    rangeChangePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
    },
    rangeChangePillText: {
      fontSize: 12,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.2,
    },

    // Position-in-range row
    rangePositionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    rangePositionLabel: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    rangePositionRight: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    rangePositionZone: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    rangePositionPct: {
      color: T.text,
      fontSize: 14,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },

    // Range bar
    rangeBarSection: {
      marginBottom: 16,
    },
    rangeBarOuter: {
      position: 'relative',
      paddingVertical: 12,
    },
    rangeBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      position: 'relative',
      justifyContent: 'center',
    },
    rangeTick: {
      position: 'absolute',
      width: 2,
      height: 8,
      borderRadius: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      marginLeft: -1,
      zIndex: 1,
    },
    rangeBarFill: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      borderRadius: 4,
      zIndex: 2,
    },
    rangeBarThumb: {
      position: 'absolute',
      top: '50%',
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 4,
      marginLeft: -10,
      marginTop: -10,
      zIndex: 3,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    rangeEndpointsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    rangeEndpointCol: {
      alignItems: 'flex-start',
    },
    rangeEndpointLabel: {
      color: T.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      marginBottom: 2,
    },
    rangeEndpointValue: {
      color: T.text,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
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
    signalMetricsGrid: {
      flexDirection: 'row',
      marginTop: 16,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
      paddingVertical: 12,
    },
    signalMetricCol: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signalMetricDiv: {
      width: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    },
    signalMetricLabel: {
      color: T.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    signalMetricVal: {
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    signalSecondaryMetrics: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    signalSecBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    signalSecText: {
      color: T.textSub,
      fontSize: 11,
      fontWeight: '600',
    },
    signalsContainer: {
      paddingBottom: 4,
    },
    signalHeroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    },
    signalOrb: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    signalHeroTexts: {
      flex: 1,
    },
    signalPrimaryAction: {
      color: T.trading.buy.primary,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    signalSubAction: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    signalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    signalActiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#22C55E',
      shadowColor: '#22C55E',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 4,
      elevation: 2,
    },
    signalInactiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: T.textMuted,
    },
    signalBadgeText: {
      color: T.text,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    signalBody: {
      marginBottom: 4,
    },
    signalTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 6,
    },
    signalDesc: {
      color: T.textSub,
      fontSize: 14,
      lineHeight: 20,
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
    eventTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    eventTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
      flex: 1,
      marginRight: 8,
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
    impactPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
    },
    impactDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    impactPillText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
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

