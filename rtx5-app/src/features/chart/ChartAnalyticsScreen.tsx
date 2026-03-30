/**
 * Chart Feature UI: ChartAnalyticsScreen
 * 
 * Renders the advanced analytics panel providing fundamental data, news feeds,
 * high market volatility (HMR) periods, and performance metrics for the active pair.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Image, Pressable } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../theme/useTheme';

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

export function ChartAnalyticsScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const currentSymbol = symbol || 'EUR/USD';

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: `Analytics, ${currentSymbol}` }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Performance Block */}
        <View style={styles.perfBlock}>
          {PERFORMANCE_DATA.map((item, i) => (
            <View key={i} style={[styles.perfItem, item.active && styles.perfItemActive]}>
              <Text style={styles.perfLabel}>{item.label}</Text>
              <View style={styles.perfChangeRow}>
                <Ionicons name={item.isDown ? 'arrow-down' : 'arrow-up'} size={10} color={item.isDown ? T.trading.sell.primary : T.trading.buy.primary} />
                <Text style={item.isDown ? styles.perfValRed : styles.perfValBlue}>
                  {Math.abs(item.change).toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Mock Sparkline Section */}
        <View style={styles.sparklineSection}>
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=600&h=200' }} 
            style={[StyleSheet.absoluteFillObject, { opacity: 0.1 }]} 
            blurRadius={10}
          />
          <View style={styles.sparkBubbleTop}>
            <Text style={styles.sparkBubbleText}>max 1.15612 10:55</Text>
          </View>
          <View style={styles.sparkCurrentPrice}>
            <Text style={styles.sparkCurrentPriceText}>1.15580</Text>
          </View>
          <View style={styles.sparkBubbleBottom}>
            <Text style={styles.sparkBubbleText}>min 1.15536 11:19</Text>
          </View>
          <View style={styles.sparklineXAxis}>
            <Text style={styles.sparkTime}>10:20</Text>
            <Text style={styles.sparkTime}>11:20</Text>
          </View>
        </View>

        {/* Section Title 1 */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>UPCOMING HMR PERIODS</Text>
          <Ionicons name="information-circle-outline" size={20} color={T.textMuted} />
        </View>

        {/* HMR List */}
        <View style={styles.listContainer}>
          {HMR_PERIODS.map((item, i) => (
            <React.Fragment key={i}>
              <View style={styles.listItem}>
                <View style={styles.listTexts}>
                  <Text style={styles.listTime}>{item.time}</Text>
                  <Text style={styles.listDesc} numberOfLines={1}>{item.desc}</Text>
                </View>
                <Ionicons name="notifications-outline" size={22} color={T.text} />
              </View>
              {i < HMR_PERIODS.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
          <Pressable style={styles.showMoreBtn}>
            <Text style={styles.showMoreText}>Show More</Text>
          </Pressable>
        </View>

        {/* Section Title 2 */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>TRADING SIGNALS</Text>
        </View>

        {/* Signals */}
        <View style={styles.signalsContainer}>
          <View style={styles.signalBadge}>
            <Ionicons name='arrow-up' size={12} color='#FFF' />
            <Text style={styles.signalBadgeText}>Intraday</Text>
          </View>
          <Text style={styles.signalTitle}>Intraday: consolidation.</Text>
          <Text style={styles.signalDesc}>MT: the bias remains bullish.</Text>
          <Text style={styles.signalDate}>Feb 27, 2026</Text>
          <Pressable style={styles.showMoreBtn}>
            <Text style={styles.showMoreText}>Show More</Text>
          </Pressable>
        </View>

        {/* Section Title 3 */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
        </View>

        {/* Events */}
        <View style={styles.listContainer}>
          {UPCOMING_EVENTS.map((item, i) => (
            <React.Fragment key={i}>
              <View style={styles.eventItem}>
                <Image source={{ uri: item.flag }} style={styles.flagIcon} />
                <View style={styles.eventTexts}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <View style={styles.eventMetaRow}>
                    <Text style={styles.eventCode}>{item.countryCode}</Text>
                    <View style={styles.impactBars}>
                      {[1, 2, 3].map(b => (
                        <View key={b} style={[styles.impactBar, { backgroundColor: item.impact >= b ? T.trading.sell.primary : T.textMuted }]} />
                      ))}
                    </View>
                    <Text style={styles.eventTime}>{item.time}</Text>
                  </View>
                </View>
              </View>
              {i < UPCOMING_EVENTS.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
          <Pressable style={styles.showMoreBtn}>
            <Text style={styles.showMoreText}>Show More</Text>
          </Pressable>
        </View>

        {/* Section Title 4 */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>LATEST NEWS</Text>
        </View>

        {/* News */}
        <View style={[styles.listContainer, { borderBottomWidth: 0, paddingBottom: 20 }]}>
          {LATEST_NEWS.map((item, i) => (
            <React.Fragment key={i}>
              <View style={styles.newsItem}>
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
              {i < LATEST_NEWS.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
          <Pressable style={styles.showMoreBtn}>
            <Text style={styles.showMoreText}>Show More</Text>
          </Pressable>
        </View>

      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const APP_BG = isDark ? '#121826' : T.bg;
  const SEPARATORS = isDark ? '#1E293B' : '#E2E8F0';
  return StyleSheet.create({
    screen: {
      backgroundColor: APP_BG,
    },
    scrollContent: {
      paddingTop: 16,
    },
    perfBlock: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
      borderWidth: 1,
      borderColor: SEPARATORS,
      borderRadius: 8,
      marginHorizontal: 16,
      marginBottom: 30,
      justifyContent: 'space-between',
    },
    perfItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 8,
    },
    perfItemActive: {
      backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
    },
    perfLabel: {
      color: T.text,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 4,
    },
    perfChangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    perfValRed: {
      color: T.trading.sell.primary,
      fontSize: 12,
      fontWeight: '500',
    },
    perfValBlue: {
      color: T.trading.buy.primary,
      fontSize: 12,
      fontWeight: '500',
    },
    sparklineSection: {
      height: 180,
      marginHorizontal: 16,
      marginBottom: 30,
      borderBottomWidth: 1,
      borderColor: SEPARATORS,
      position: 'relative',
    },
    sparkBubbleTop: {
      position: 'absolute',
      top: 20,
      left: '30%',
      backgroundColor: isDark ? '#334155' : '#CBD5E1',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    sparkBubbleBottom: {
      position: 'absolute',
      bottom: 40,
      right: '25%',
      backgroundColor: isDark ? '#334155' : '#CBD5E1',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    sparkBubbleText: {
      color: isDark ? '#F1F5F9' : '#0F172A',
      fontSize: 11,
      fontWeight: '600',
    },
    sparkCurrentPrice: {
      position: 'absolute',
      left: 0,
      top: '50%',
      transform: [{ translateY: -10 }],
    },
    sparkCurrentPriceText: {
      color: T.text,
      fontSize: 12,
      fontWeight: '700',
    },
    sparklineXAxis: {
      position: 'absolute',
      bottom: 8,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sparkTime: {
      color: T.textMuted,
      fontSize: 11,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 12,
      marginTop: 20,
    },
    sectionTitle: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
    },
    listContainer: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: SEPARATORS,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    listTexts: {
      flex: 1,
      paddingRight: 16,
    },
    listTime: {
      color: T.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    listDesc: {
      color: T.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    divider: {
      height: 1,
      backgroundColor: SEPARATORS,
    },
    showMoreBtn: {
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 6,
      marginTop: 16,
      marginBottom: 8,
    },
    showMoreText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '500',
    },
    signalsContainer: {
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    signalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: '#00B4FF',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      gap: 4,
      marginBottom: 12,
    },
    signalBadgeText: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: '700',
    },
    signalTitle: {
      color: T.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    signalDesc: {
      color: T.textMuted,
      fontSize: 15,
      marginBottom: 6,
    },
    signalDate: {
      color: T.textMuted,
      fontSize: 12,
    },
    eventItem: {
      flexDirection: 'row',
      paddingVertical: 16,
    },
    flagIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      marginRight: 12,
    },
    eventTexts: {
      flex: 1,
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
      color: T.text,
      fontSize: 12,
      fontWeight: '700',
      marginRight: 8,
    },
    impactBars: {
      flexDirection: 'row',
      gap: 2,
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
    },
    newsItem: {
      flexDirection: 'row',
      paddingVertical: 16,
    },
    newsImage: {
      width: 80,
      height: 80,
      borderRadius: 8,
      marginRight: 16,
      backgroundColor: SEPARATORS,
    },
    newsTexts: {
      flex: 1,
      justifyContent: 'space-between',
    },
    newsTitle: {
      color: T.text,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 8,
    },
    newsMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    newsPair: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    newsChange: {
      color: T.trading.sell.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    newsTime: {
      color: T.textMuted,
      fontSize: 12,
    },
  });
}
