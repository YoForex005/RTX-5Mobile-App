/**
 * Chart Feature UI: ChartAnalyticsScreen
 * 
 * Renders the advanced analytics panel providing fundamental data, news feeds,
 * high market volatility (HMR) periods, and performance metrics for the active pair.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Image, Pressable } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../theme/useTheme';
import { spacing } from '../../theme';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

const PERFORMANCE_DATA = [
  { label: 'Hour', change: -0.03, isDown: true, active: true },
  { label: 'Today', change: -0.20, isDown: true },
  { label: 'Week', change: 0.43, isDown: false },
  { label: 'Month', change: -1.73, isDown: true },
  { label: 'Year', change: 5.88, isDown: false },
];

const HMR_PERIODS = [
  { time: '23:25 - 23 Mar, 03:35', desc: 'Max Leverage 1:200 | ECB Cipollone Speech | Fed Chair...' },
  { time: '23 Mar, 17:00 - 18:01', desc: 'Max Leverage 1:200 | Chicago Fed National Activity Index' },
  { time: '23 Mar, 17:45 - 18:01', desc: 'Max Leverage 1:200 | Chicago Fed National Activity Index' },
];

const UPCOMING_EVENTS = [
  { title: 'PPI YoY', flag: 'https://flagcdn.com/w40/de.png', countryCode: 'DE', impact: 3, time: '12:30 PM \u2013 In 1 hour' },
  { title: 'PPI MoM', flag: 'https://flagcdn.com/w40/de.png', countryCode: 'DE', impact: 3, time: '12:30 PM \u2013 In 1 hour' },
  { title: 'Balance of Trade', flag: 'https://flagcdn.com/w40/it.png', countryCode: 'IT', impact: 3, time: '2:30 PM \u2013 In 3 hours' },
];

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
];

// Mock Trade/History records payload (Replace this with real hooked API data later)
const MOCK_CHART_HISTORY = [
  { time: '10:20', price: 1.15550 },
  { time: '10:30', price: 1.15570 },
  { time: '10:45', price: 1.15540 },
  { time: '10:55', price: 1.15612 }, // MAX
  { time: '11:05', price: 1.15540 },
  { time: '11:13', price: 1.15560 },
  { time: '11:19', price: 1.15536 }, // MIN
  { time: '11:25', price: 1.15555 },
  { time: '11:35', price: 1.15570 },
  { time: '11:45', price: 1.15580 }  // CURRENT
];

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

  // Compute smooth chart path dynamically from the history data
  const sparkLineData = useMemo(() => {
    const data = MOCK_CHART_HISTORY;
    const minPrice = Math.min(...data.map(d => d.price));
    const maxPrice = Math.max(...data.map(d => d.price));
    const prange = maxPrice - minPrice || 1;

    // Scale X 0-100, Y 5-30 (leaving visual padding top and bottom)
    const points = data.map((d, i) => ({
      x: (i / (data.length - 1)) * 100,
      y: 35 - ((d.price - minPrice) / prange) * 30
    }));

    const maxIndex = data.findIndex(d => d.price === maxPrice);
    const minIndex = data.findIndex(d => d.price === minPrice);

    return {
      path: generateSmoothPath(points),
      maxNode: points[maxIndex],
      minNode: points[minIndex],
      maxIndex, minIndex
    };
  }, []);

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
          headerStyle: { backgroundColor: isDark ? '#121212' : T.bg },
          headerTitleStyle: { color: T.text, fontSize: 18, fontWeight: '700' },
          headerShadowVisible: false,
        }} 
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Performance Block */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Performance Snapshot</Text>
          <View style={styles.perfBlock}>
            {PERFORMANCE_DATA.map((item, i) => (
              <View key={i} style={[styles.perfItem, item.active && styles.perfItemActive]}>
                <Text style={[styles.perfLabel, item.active && styles.perfLabelActive]}>{item.label}</Text>
                <View style={styles.perfChangeRow}>
                  <Ionicons name={item.isDown ? 'arrow-down' : 'arrow-up'} size={10} color={item.isDown ? T.trading.sell.primary : T.trading.buy.primary} />
                  <Text style={item.isDown ? styles.perfValRed : styles.perfValBlue}>
                    {Math.abs(item.change).toFixed(2)}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Dynamic Sparkline Section mapped from History Data */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Daily Range</Text>
          <View style={styles.sparklineSection}>
            <View style={styles.sparkCanvasWrapper}>

              <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={T.trading.buy.primary} stopOpacity="0.4" />
                    <Stop offset="1" stopColor={T.trading.buy.primary} stopOpacity="0" />
                  </LinearGradient>
                </Defs>

                {/* Curve Fill */}
                <Path d={`${sparkLineData.path} L100,40 L0,40 Z`} fill="url(#glow)" />
                {/* Core Curve */}
                <Path d={sparkLineData.path} fill="none" stroke={T.trading.buy.primary} strokeWidth="2" />

                {/* Glowing Nodes at exact Peaks and Valleys */}
                <Circle cx={sparkLineData.maxNode.x} cy={sparkLineData.maxNode.y} r="2" fill={isDark ? '#FFF' : '#000'} stroke={T.trading.buy.hover} strokeWidth="1" />
                <Circle cx={sparkLineData.minNode.x} cy={sparkLineData.minNode.y} r="2" fill={isDark ? '#FFF' : '#000'} stroke={T.trading.sell.primary} strokeWidth="1" />
              </Svg>

              {/* Precise Absolute Tooltips based exactly on data coords - Max Peak */}
              <View style={[styles.tooltipPill, { left: `${sparkLineData.maxNode.x}%`, top: '-5%', transform: [{ translateX: -40 }] }]}>
                <Text style={styles.tooltipPillText}>max {MOCK_CHART_HISTORY[sparkLineData.maxIndex].price}  ({MOCK_CHART_HISTORY[sparkLineData.maxIndex].time})</Text>
                <View style={styles.tooltipTriangleDown} />
              </View>

              {/* Precise Absolute Tooltips based exactly on data coords - Min Valley */}
              <View style={[styles.tooltipPill, { left: `${sparkLineData.minNode.x}%`, top: '75%', transform: [{ translateX: -40 }] }]}>
                <View style={styles.tooltipTriangleUp} />
                <Text style={styles.tooltipPillText}>min {MOCK_CHART_HISTORY[sparkLineData.minIndex].price}  ({MOCK_CHART_HISTORY[sparkLineData.minIndex].time})</Text>
              </View>

              <View style={styles.sparkCurrentPrice}>
                <Text style={styles.sparkCurrentPriceText}>{MOCK_CHART_HISTORY[MOCK_CHART_HISTORY.length - 1].price}</Text>
              </View>
            </View>

            <View style={styles.sparklineXAxis}>
              <Text style={styles.sparkTime}>{MOCK_CHART_HISTORY[0].time}</Text>
              <Text style={styles.sparkTime}>{MOCK_CHART_HISTORY[MOCK_CHART_HISTORY.length - 1].time}</Text>
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
            {HMR_PERIODS.map((item, i) => (
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
            <Pressable style={styles.linkBtn}>
              <Text style={styles.linkText}>View All Periods</Text>
            </Pressable>
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
            <Pressable style={styles.linkBtn}>
              <Text style={styles.linkText}>Full Signal Report</Text>
            </Pressable>
          </View>
        </View>

        {/* Events */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Upcoming Events</Text>
          <View style={styles.listContainer}>
            {UPCOMING_EVENTS.map((item, i) => (
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
            <Pressable style={styles.linkBtn}>
              <Text style={styles.linkText}>Economic Calendar</Text>
            </Pressable>
          </View>
        </View>

        {/* News */}
        <View style={[styles.card, { marginBottom: 40 }]}>
          <Text style={styles.cardHeader}>Latest News</Text>
          <View style={styles.listContainer}>
            {LATEST_NEWS.map((item, i) => (
              <React.Fragment key={i}>
                <View style={[styles.newsItem, i !== 0 && styles.divider]}>
                  <Image source={{ uri: item.image }} style={styles.newsImage} />
                  <View style={styles.newsTexts}>
                    <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.newsMetaRow}>
                      <Text style={styles.newsPair}>{item.pair}</Text>
                      <Ionicons name="arrow-down" size={10} color={T.trading.sell.primary} />
                      <Text style={styles.newsChange}>{Math.abs(item.change).toFixed(2)}%</Text>
                      <Text style={styles.newsTime}>{item.time}</Text>
                    </View>
                  </View>
                </View>
              </React.Fragment>
            ))}
            <Pressable style={styles.linkBtn}>
              <Text style={styles.linkText}>More Updates</Text>
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: isDark ? '#121212' : T.bg, // Strict match to History pattern
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
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : T.glass2,
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

    // SVG GRAPH STYLES
    sparklineSection: {
      height: 140,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : T.glass1,
      borderRadius: 12,
      padding: spacing.sm,
      position: 'relative',
    },
    sparkCanvasWrapper: {
      flex: 1,
      position: 'relative',
    },
    tooltipPill: {
      position: 'absolute',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : T.borderSubtle,
      alignItems: 'center',
      zIndex: 10,
    },
    tooltipPillText: {
      color: T.textSub,
      fontSize: 11,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    tooltipTriangleDown: {
      position: 'absolute',
      bottom: -4,
      width: 0,
      height: 0,
      borderLeftWidth: 5,
      borderRightWidth: 5,
      borderTopWidth: 5,
      borderStyle: 'solid',
      backgroundColor: 'transparent',
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    tooltipTriangleUp: {
      position: 'absolute',
      top: -4,
      width: 0,
      height: 0,
      borderLeftWidth: 5,
      borderRightWidth: 5,
      borderBottomWidth: 5,
      borderStyle: 'solid',
      backgroundColor: 'transparent',
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    sparkCurrentPrice: {
      position: 'absolute',
      left: 12,
      top: '50%',
      transform: [{ translateY: -12 }],
    },
    sparkCurrentPriceText: {
      color: T.text,
      fontSize: 18,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    sparklineXAxis: {
      position: 'absolute',
      bottom: 8,
      left: 12,
      right: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sparkTime: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
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
