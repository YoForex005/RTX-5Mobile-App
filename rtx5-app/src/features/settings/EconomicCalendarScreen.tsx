/**
 * Settings Feature UI: EconomicCalendarScreen
 *
 * Enterprise-grade economic calendar with glassmorphic cards,
 * animated impact indicators, expandable event detail panels,
 * multi-dimension filtering, and live countdown timers.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchEconomicCalendarData, EconomicEvent, ImpactLevel } from '../../dev/mock/calendarData';

// ── Mock Data ─────────────────────────────────────────────────────
// The MOCK_EVENTS array was moved to src/mock/calendarData.ts to simulate a dynamic remote fetch

const DATE_TABS = ['Today', 'Tomorrow', 'This Week'];
const IMPACT_FILTERS: ImpactLevel[] = ['high', 'medium', 'low'];
const CURRENCY_FILTERS = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'NZD'];

const IMPACT_CONFIG: Record<ImpactLevel, { color: string; gradient: [string, string]; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  high: { color: '#EF4444', gradient: ['#EF4444', '#DC2626'], label: 'High', icon: 'flame' },
  medium: { color: '#F59E0B', gradient: ['#F59E0B', '#D97706'], label: 'Medium', icon: 'alert-circle' },
  low: { color: '#10B981', gradient: ['#10B981', '#059669'], label: 'Low', icon: 'information-circle' },
  holiday: { color: '#8B5CF6', gradient: ['#8B5CF6', '#7C3AED'], label: 'Holiday', icon: 'calendar' },
};

// Country/region color mapping for styled badges (replaces emoji flags which break on Windows)
const COUNTRY_COLORS: Record<string, { bg: string; text: string; abbr: string }> = {
  'China': { bg: '#DC262620', text: '#DC2626', abbr: 'CN' },
  'Australia': { bg: '#1D4ED820', text: '#3B82F6', abbr: 'AU' },
  'Germany': { bg: '#F59E0B20', text: '#F59E0B', abbr: 'DE' },
  'United Kingdom': { bg: '#1D4ED820', text: '#60A5FA', abbr: 'UK' },
  'Eurozone': { bg: '#2563EB20', text: '#3B82F6', abbr: 'EU' },
  'United States': { bg: '#1E40AF20', text: '#3B82F6', abbr: 'US' },
  'Japan': { bg: '#DC262620', text: '#EF4444', abbr: 'JP' },
  'Canada': { bg: '#DC262620', text: '#EF4444', abbr: 'CA' },
  'France': { bg: '#2563EB20', text: '#3B82F6', abbr: 'FR' },
  'Switzerland': { bg: '#DC262620', text: '#DC2626', abbr: 'CH' },
  'New Zealand': { bg: '#1E40AF20', text: '#2563EB', abbr: 'NZ' },
};

const DEFAULT_COUNTRY_COLOR = { bg: '#64748B20', text: '#64748B', abbr: '??' };

// ── Helpers ────────────────────────────────────────────────────────

function parseAndDiff(valA?: string, valB?: string) {
  if (!valA || valA === '—' || !valB || valB === '—') return null;
  const numA = parseFloat(valA.replace(/[^0-9.-]/g, ''));
  const numB = parseFloat(valB.replace(/[^0-9.-]/g, ''));
  if (isNaN(numA) || isNaN(numB)) return null;
  const diff = numA - numB;
  if (Math.abs(diff) < 0.0001) return null;
  const hasPct = valA.includes('%');
  const hasK = valA.includes('K');
  const hasM = valA.includes('M');
  const hasB = valA.includes('B');
  const suffix = hasPct ? '%' : hasK ? 'K' : hasM ? 'M' : hasB ? 'B' : '';
  const isPositive = diff > 0;
  const sign = isPositive ? '+' : '';
  const diffStr = sign + (diff).toFixed(hasPct ? 2 : 1) + suffix;
  return {
    text: diffStr,
    color: isPositive ? '#4ADE80' : '#F87171',
    symbol: isPositive ? '▲' : '▼'
  };
}

function getDateLabel(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function getShortDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDateLabel(d: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatShortDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getEventsForTab(tab: string, eventsList: EconomicEvent[]): { date: string; shortDate: string; events: EconomicEvent[]; dayOffset: number }[] {
  const now = new Date();
  const todayKey = toDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  // Group events by date
  const grouped = new Map<string, { d: Date; events: EconomicEvent[] }>();
  for (const ev of eventsList) {
    const evDate = ev.date ? new Date(ev.date) : now;
    const key = toDateKey(evDate);
    if (!grouped.has(key)) {
      grouped.set(key, { d: evDate, events: [] });
    }
    grouped.get(key)!.events.push(ev);
  }

  // Sort each group by time
  for (const group of grouped.values()) {
    group.events.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }

  // Sort groups by date
  const sortedKeys = [...grouped.keys()].sort();

  if (tab === 'Today') {
    const g = grouped.get(todayKey);
    if (!g) return [];
    return [{ date: formatDateLabel(g.d), shortDate: formatShortDate(g.d), events: g.events, dayOffset: 0 }];
  } else if (tab === 'Tomorrow') {
    const g = grouped.get(tomorrowKey);
    if (!g) return [];
    return [{ date: formatDateLabel(g.d), shortDate: formatShortDate(g.d), events: g.events, dayOffset: 1 }];
  } else {
    // This Week — return all grouped dates
    return sortedKeys.map((key, i) => {
      const g = grouped.get(key)!;
      return { date: formatDateLabel(g.d), shortDate: formatShortDate(g.d), events: g.events, dayOffset: i };
    });
  }
}

// ── Animated Pulse Dot ────────────────────────────────────────────

function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ width: size * 2.6, height: size * 2.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size * 2.2, height: size * 2.2, borderRadius: 99, backgroundColor: color, opacity: 0.2, transform: [{ scale: pulse }] }} />
      <View style={{ width: size, height: size, borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

// ── Impact Badge ──────────────────────────────────────────────────

function ImpactBadge({ impact, compact }: { impact: ImpactLevel; compact?: boolean }) {
  const config = IMPACT_CONFIG[impact];
  if (compact) {
    const isDark = true; // Safe fallback, or pass as prop if needed
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 18 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: config.color + '30', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: config.color }} />
        </View>
      </View>
    );
  }
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
      backgroundColor: config.color + '15',
    }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: config.color + '30', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: config.color }} />
      </View>
      <Text style={{ color: config.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>{config.label.toUpperCase()}</Text>
    </View>
  );
}

// ── Country Badge (replaces broken emoji flags) ───────────────────

function CountryBadge({ country }: { country: string }) {
  const cfg = COUNTRY_COLORS[country] || DEFAULT_COUNTRY_COLOR;
  return (
    <View style={{
      width: 22, height: 16, borderRadius: 3, alignItems: 'center', justifyContent: 'center',
      backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.text + '30',
    }}>
      <Text style={{ color: cfg.text, fontSize: 8, fontWeight: '900', letterSpacing: 0.2 }}>{cfg.abbr}</Text>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────

export function EconomicCalendarScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const [activeTab, setActiveTab] = useState('Today');
  const [selectedImpacts, setSelectedImpacts] = useState<Set<ImpactLevel>>(new Set(['high', 'medium', 'low', 'holiday']));
  const [selectedCurrency, setSelectedCurrency] = useState('All');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const [dataEvents, setDataEvents] = useState<EconomicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Live API fetch with auto-refresh every 5 minutes
  const loadData = useCallback(() => {
    console.log('[EconCalendarScreen] loadData() called');
    setIsLoading(true);
    setFetchError(false);
    fetchEconomicCalendarData().then((data) => {
      console.log('[EconCalendarScreen] Received', data.length, 'events');
      if (data.length > 0) {
        setDataEvents(data);
        setFetchError(false);
        // Log first 3 events for debugging
        data.slice(0, 3).forEach((e, i) => {
          console.log(`  [${i}] ${e.date} | ${e.time} | ${e.currency} | ${e.title} | impact=${e.impact}`);
        });
      } else {
        console.warn('[EconCalendarScreen] No data received, setting error state');
        setFetchError(true);
      }
      setIsLoading(false);
    }).catch((err) => {
      console.error('[EconCalendarScreen] Fetch threw:', err);
      setFetchError(true);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); // Refresh every 5 min
    return () => clearInterval(interval);
  }, [loadData]);

  const toggleImpact = useCallback((impact: ImpactLevel) => {
    setSelectedImpacts((prev) => {
      const next = new Set(prev);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      return next;
    });
  }, []);

  const sections = useMemo(() => {
    const raw = getEventsForTab(activeTab, dataEvents);
    return raw.map((section) => ({
      ...section,
      events: section.events.filter((e) => {
        if (!selectedImpacts.has(e.impact)) return false;
        if (selectedCurrency !== 'All' && e.currency !== selectedCurrency) return false;
        return true;
      }),
    })).filter((s) => s.events.length > 0);
  }, [activeTab, selectedImpacts, selectedCurrency, dataEvents]);

  const totalCount = sections.reduce((sum, s) => sum + s.events.length, 0);
  const highCount = sections.reduce((s, sec) => s + sec.events.filter(e => e.impact === 'high').length, 0);
  const releasedCount = sections.reduce((s, sec) => s + sec.events.filter(e => !!e.actual && e.actual !== '—').length, 0);
  const pendingCount = totalCount - releasedCount;

  const renderEvent = useCallback((event: EconomicEvent, idx: number, total: number) => {
    const isExpanded = expandedEventId === event.id;
    const config = IMPACT_CONFIG[event.impact];
    const hasActual = !!event.actual && event.actual !== '—';
    const isLast = idx === total - 1;

    if (isExpanded && !event.isAllDay) {
      const forecastDiff = parseAndDiff(event.actual, event.forecast);
      const previousDiff = parseAndDiff(event.actual, event.previous);

      return (
        <Pressable
          key={event.id}
          style={[styles.eventCard, { padding: 12, backgroundColor: isDark ? '#151D2A' : '#F8FAFC', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', marginBottom: 8 }]}
          onPress={() => setExpandedEventId(null)}
        >
          {/* Fixed Alignment Header */}
          <View style={{ flexDirection: 'column' }}>
            {/* Top Row: Perfectly centered horizontally */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              {/* Left Column: Time */}
              <View style={{ width: 80 }}>
                <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {event.time} <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '500' }}>GMT</Text>
                </Text>
              </View>

              {/* Middle Column: Badge */}
              <View style={{ flex: 1, paddingHorizontal: 12, flexDirection: 'row' }}>
                <View style={styles.currencyTag}>
                  <Text style={styles.currencyTagText}>{event.currency}</Text>
                </View>
              </View>

              {/* Right Column: Impact */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: config.color + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }}>
                <PulseDot color={config.color} size={5} />
                <Text style={{ marginLeft: 6, color: config.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{config.label.toUpperCase()}</Text>
              </View>
            </View>

            {/* Bottom Row: Title */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ width: 80 }} />
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 16, color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 'bold' }}>{event.title}</Text>
              </View>
            </View>
          </View>

          {/* Value Grid Inset */}
          <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', marginTop: 8 }}>
            {/* Column 1: ACTUAL */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text style={{ color: hasActual ? config.color : (isDark ? '#475569' : '#94A3B8'), fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 }}>ACTUAL</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: hasActual ? config.color : (isDark ? '#475569' : '#94A3B8'), fontVariant: ['tabular-nums'] }}>
                {hasActual ? event.actual : '—'}
              </Text>
            </View>

            {/* Column 2: FORECAST */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>FORECAST</Text>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{event.forecast || '—'}</Text>
              {forecastDiff ? (
                <Text style={{ color: forecastDiff.color, fontSize: 10, fontWeight: '700', marginTop: 4 }}>vs: {forecastDiff.text} {forecastDiff.symbol}</Text>
              ) : <View style={{ height: 16 }} />}
            </View>

            {/* Column 3: PREVIOUS */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
              <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>PREVIOUS</Text>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{event.previous || '—'}</Text>
              {previousDiff ? (
                <Text style={{ color: previousDiff.color, fontSize: 10, fontWeight: '700', marginTop: 4 }}>vs: {previousDiff.text} {previousDiff.symbol}</Text>
              ) : <View style={{ height: 16 }} />}
            </View>
          </View>

          {/* Location Bottom Right */}
          <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={14} color={isDark ? '#64748B' : '#94A3B8'} />
              <Text style={{ color: isDark ? '#94A3B8' : '#475569', fontSize: 13, fontWeight: '600' }}>{event.country}</Text>
            </View>
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
        key={event.id}
        style={[
          styles.eventCard,
          idx === 0 && styles.eventCardFirst,
          isLast && styles.eventCardLast,
          !isLast && styles.eventCardNotLast,
        ]}
        onPress={() => setExpandedEventId(event.id)}
      >
        {/* Main row */}
        <View style={styles.eventRow}>
          {/* Left: time block */}
          <View style={styles.timeBlock}>
            {event.isAllDay ? (
              <View style={styles.allDayPill}>
                <Ionicons name="calendar" size={10} color="#8B5CF6" />
                <Text style={styles.allDayText}>ALL DAY</Text>
              </View>
            ) : (
              <>
                <Text style={styles.timeText}>{event.time}</Text>
              </>
            )}
          </View>



          {/* Center: event info */}
          <View style={styles.eventInfo}>
            <View style={styles.eventMetaRow}>
              <CountryBadge country={event.country} />
              <View style={styles.currencyTag}>
                <Text style={styles.currencyTagText}>{event.currency}</Text>
              </View>
            </View>
            <Text style={[styles.eventTitle, event.impact === 'holiday' && styles.eventTitleHoliday]} numberOfLines={1}>
              {event.title}
            </Text>
          </View>

          {/* Right: value preview */}
          {!event.isAllDay && (
            <View style={styles.valuePreview}>
              {hasActual ? (
                <>
                  <Text style={[styles.previewActual, { color: config.color }]}>{event.actual}</Text>
                  <Text style={styles.previewLabel}>Actual</Text>
                </>
              ) : event.forecast && event.forecast !== '—' ? (
                <>
                  <Text style={styles.previewForecast}>{event.forecast}</Text>
                  <Text style={styles.previewLabel}>Forecast</Text>
                </>
              ) : (
                <>
                  <Ionicons name="time-outline" size={14} color={isDark ? '#475569' : '#94A3B8'} />
                  <Text style={styles.previewLabel}>Pending</Text>
                </>
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  }, [expandedEventId, styles, isDark]);

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Hero Header ──────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="calendar-outline" size={30} color={isDark ? '#818CF8' : '#4F46E5'} />
              </View>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={styles.heroTitle}>Economic Calender</Text>
                <Text style={styles.heroSub}>Market events calendar</Text>
              </View>
              <Pressable style={styles.filterBtn} onPress={() => setFilterModalOpen(true)}>
                <Ionicons name="options-outline" size={16} color={isDark ? '#A5B4FC' : '#4F46E5'} />
              </Pressable>
            </View>

            {/* ── Date Tabs ─── */}
            <View style={styles.segmentRow}>
              {DATE_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <Pressable key={tab} style={[styles.segmentBtn, isActive && styles.segmentBtnActive]} onPress={() => setActiveTab(tab)}>
                    {isActive && (
                      <LinearGradient
                        colors={isDark ? ['#3B82F6', '#2563EB'] : ['#4F46E5', '#4338CA']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={[StyleSheet.absoluteFillObject, { borderRadius: 10 }]}
                      />
                    )}
                    <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>{tab}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Currency Chips ─── */}
            {Platform.OS === 'web' && (
              <style>{`
                [data-scroll="chips"]::-webkit-scrollbar {
                  height: 4px;
                }
                [data-scroll="chips"]::-webkit-scrollbar-track {
                  background: transparent;
                }
                [data-scroll="chips"]::-webkit-scrollbar-thumb {
                  background: ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'};
                  border-radius: 4px;
                }
                [data-scroll="chips"]::-webkit-scrollbar-thumb:hover {
                  background: ${isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)'};
                }
              `}</style>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              indicatorStyle={isDark ? "white" : "black"}
              {...({ dataSet: { scroll: 'chips' } } as any)}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipScrollContent}
            >
              {CURRENCY_FILTERS.map((cur) => {
                const isActive = selectedCurrency === cur;
                return (
                  <Pressable key={cur} style={[styles.chipBtn, isActive && styles.chipBtnActive]} onPress={() => setSelectedCurrency(cur)}>
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {cur === 'All' ? '● All' : cur}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* ── Events List ─────────────────────────── */}
        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Animated.View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <PulseDot color={isDark ? '#60A5FA' : '#4F46E5'} size={12} />
            </Animated.View>
            <Text style={{ marginTop: 24, fontSize: 15, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B' }}>
              Fetching live calendar data...
            </Text>
          </View>
        ) : fetchError ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={32} color={isDark ? '#EF4444' : '#DC2626'} />
            </View>
            <Text style={styles.emptyTitle}>Unable to load events</Text>
            <Text style={styles.emptySub}>Check your internet connection and try again</Text>
            <Pressable style={[styles.emptyResetBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : 'rgba(79,70,229,0.1)' }]} onPress={loadData}>
              <Text style={styles.emptyResetText}>Retry</Text>
            </Pressable>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search" size={32} color={isDark ? '#334155' : '#CBD5E1'} />
            </View>
            <Text style={styles.emptyTitle}>No events found</Text>
            <Text style={styles.emptySub}>Try adjusting your filters or date range</Text>
            <Pressable style={styles.emptyResetBtn} onPress={() => { setSelectedCurrency('All'); setSelectedImpacts(new Set(['high', 'medium', 'low', 'holiday'])); }}>
              <Text style={styles.emptyResetText}>Reset All Filters</Text>
            </Pressable>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.date} style={styles.daySection}>
              {/* Day header */}
              <View style={styles.dayHeader}>
                <View style={styles.dayHeaderLeft}>
                  <View style={styles.dayHeaderDot} />
                  <View>
                    <Text style={styles.dayHeaderTitle}>{section.date}</Text>
                  </View>
                </View>
                <View style={styles.dayHeaderBadge}>
                  <Text style={styles.dayHeaderBadgeText}>{section.events.length} events</Text>
                </View>
              </View>

              {/* Events group card */}
              <View style={styles.eventsGroup}>
                {section.events.map((event, idx) => renderEvent(event, idx, section.events.length))}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 36 }} />
      </ScrollView>

      {/* ── Filter Modal ────────────────────────── */}
      {filterModalOpen && (
        <Pressable style={styles.modalOverlay} onPress={() => setFilterModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Event Filters</Text>
              <Text style={styles.modalSub}>Customize which events appear</Text>
            </View>

            {/* Impact section */}
            <Text style={styles.modalGroupTitle}>IMPACT LEVEL</Text>
            <View style={styles.modalImpactRow}>
              {IMPACT_FILTERS.map((impact) => {
                const config = IMPACT_CONFIG[impact];
                const isActive = selectedImpacts.has(impact);
                return (
                  <Pressable key={impact} style={[styles.modalImpactBtn, isActive && { borderColor: config.color + '60', backgroundColor: config.color + '10' }]} onPress={() => toggleImpact(impact)}>
                    <View style={[styles.modalImpactIndicator, { opacity: isActive ? 1 : 0.6 }]}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: isActive ? config.color + '30' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isActive ? config.color : isDark ? '#334155' : '#CBD5E1' }} />
                      </View>
                    </View>
                    <Text style={[styles.modalImpactLabel, isActive && { color: config.color }]}>{config.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Holidays toggle */}
            <Text style={styles.modalGroupTitle}>OTHER</Text>
            <Pressable style={[styles.modalToggleRow, selectedImpacts.has('holiday') && styles.modalToggleRowActive]} onPress={() => toggleImpact('holiday')}>
              <Ionicons name="calendar" size={16} color="#8B5CF6" />
              <Text style={styles.modalToggleLabel}>Show Bank Holidays</Text>
              <View style={[styles.modalToggle, selectedImpacts.has('holiday') && styles.modalToggleOn]}>
                <View style={[styles.modalToggleThumb, selectedImpacts.has('holiday') && styles.modalToggleThumbOn]} />
              </View>
            </Pressable>

            {/* Done */}
            <Pressable style={styles.modalDoneBtn} onPress={() => setFilterModalOpen(false)}>
              <LinearGradient
                colors={isDark ? ['#3B82F6', '#2563EB'] : ['#4F46E5', '#4338CA']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]}
              />
              <Text style={styles.modalDoneBtnText}>Apply Filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </Screen>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? '#0F1724' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const subtleText = isDark ? '#64748B' : '#94A3B8';

  return StyleSheet.create({
    screen: { backgroundColor: isDark ? '#080B11' : '#F1F5F9' },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },

    // ── Hero ──────────────────
    heroCard: {
      borderRadius: 16, overflow: 'hidden', marginBottom: 20,
      backgroundColor: isDark ? '#111827' : '#FFFFFF',
      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      elevation: 2,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.4 : 0.05, shadowRadius: 10,
    },
    heroContent: { padding: 18 },
    heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
    heroIconWrap: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    heroIconBadge: { position: 'absolute', bottom: 2, right: -2, backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderRadius: 9, padding: 2 },
    heroTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
    heroSub: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: '600', marginTop: 1 },
    filterBtn: {
      width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(79,70,229,0.15)' : 'rgba(79,70,229,0.08)',
    },
    heroPillsRow: { flexDirection: 'row', gap: 10 },
    heroPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10,
    },
    heroPillText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '700' },

    // ── Segment tabs ──────────
    segmentRow: {
      flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3,
      backgroundColor: isDark ? '#0F1724' : '#E2E8F0',
      marginBottom: 10,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, overflow: 'hidden' },
    segmentBtnActive: {},
    segmentText: { color: subtleText, fontSize: 13, fontWeight: '700' },
    segmentTextActive: { color: '#FFFFFF', fontWeight: '800' },

    // ── Currency chips ────────
    chipScroll: { marginBottom: 4 },
    chipScrollContent: { gap: 6, paddingRight: 16, paddingBottom: 10 },
    chipBtn: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      backgroundColor: isDark ? '#0F1724' : '#FFFFFF',
    },
    chipBtnActive: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#EEF2FF',
      borderColor: isDark ? 'rgba(59,130,246,0.4)' : '#4F46E5',
    },
    chipText: { color: subtleText, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: isDark ? '#60A5FA' : '#4F46E5' },

    // ── Day section ───────────
    daySection: { marginBottom: 20 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
    dayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dayHeaderDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? '#3B82F6' : '#4F46E5' },
    dayHeaderTitle: { color: isDark ? '#CBD5E1' : '#334155', fontSize: 14, fontWeight: '800' },
    dayHeaderBadge: {
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
      backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(79,70,229,0.06)',
    },
    dayHeaderBadgeText: { color: isDark ? '#60A5FA' : '#4F46E5', fontSize: 11, fontWeight: '800' },

    // ── Events group ──────────
    eventsGroup: {
      borderRadius: 16, overflow: 'hidden',
      borderWidth: 1, borderColor: cardBorder,
      backgroundColor: cardBg,
    },

    eventCard: { overflow: 'hidden' },
    eventCardExpanded: { backgroundColor: isDark ? '#121D2F' : '#F8FAFC' },
    eventCardFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    eventCardLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
    eventCardNotLast: { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },

    eventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 20, paddingHorizontal: 16, gap: 12 },

    // Time block
    timeBlock: { width: 50, alignItems: 'center', gap: 6 },
    timeText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
    allDayPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(139,92,246,0.1)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    },
    allDayText: { color: '#8B5CF6', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
    releasedPill: { backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 },
    releasedPillText: { color: '#10B981', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },

    // Event info
    eventInfo: { flex: 1, gap: 6 },
    eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    currencyTag: {
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    currencyTagText: { color: isDark ? '#93C5FD' : '#4338CA', fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
    eventTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 14, fontWeight: '700', lineHeight: 20 },
    eventTitleHoliday: { color: '#8B5CF6', fontStyle: 'italic' },

    // Value preview
    valuePreview: { alignItems: 'flex-end', gap: 4 },
    previewActual: { fontSize: 16, fontWeight: '900' },
    previewForecast: { color: subtleText, fontSize: 14, fontWeight: '700' },
    previewLabel: { color: isDark ? '#475569' : '#CBD5E1', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    // ── Expanded panel ────────
    expandedPanel: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4 },
    valuesGrid: {
      flexDirection: 'row', borderRadius: 14, overflow: 'hidden',
      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      backgroundColor: isDark ? 'rgba(8,11,17,0.6)' : '#F1F5F9',
    },
    valueCell: { flex: 1, alignItems: 'center', paddingVertical: 16 },
    valueCellBorder: { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
    valueCellLabel: { color: subtleText, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
    valueCellData: { color: isDark ? '#CBD5E1' : '#334155', fontSize: 18, fontWeight: '800' },

    expandedMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    expandedMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    expandedMetaText: { color: subtleText, fontSize: 12, fontWeight: '600' },

    // ── Empty state ───────────
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: {
      width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? '#0F1724' : '#E2E8F0', marginBottom: 14,
    },
    emptyTitle: { color: isDark ? '#CBD5E1' : '#334155', fontSize: 16, fontWeight: '800' },
    emptySub: { color: subtleText, fontSize: 13, fontWeight: '500', marginTop: 4 },
    emptyResetBtn: {
      marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12,
      backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#EEF2FF',
    },
    emptyResetText: { color: isDark ? '#60A5FA' : '#4F46E5', fontSize: 14, fontWeight: '800' },

    // ── Filter modal ──────────
    modalOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
    modalCard: {
      width: '100%', maxWidth: 480,
      backgroundColor: isDark ? '#0F1724' : '#FFFFFF',
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderWidth: 1, borderBottomWidth: 0,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      paddingHorizontal: 20, paddingBottom: 34,
    },
    modalHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#334155' : '#CBD5E1', marginBottom: 14 },
    modalTitle: { color: isDark ? '#F1F5F9' : '#0F172A', fontSize: 18, fontWeight: '800' },
    modalSub: { color: subtleText, fontSize: 12, fontWeight: '500', marginTop: 3 },

    modalGroupTitle: { color: subtleText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },

    modalImpactRow: { flexDirection: 'row', gap: 8 },
    modalImpactBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      backgroundColor: isDark ? '#080B11' : '#F8FAFC',
    },
    modalImpactIndicator: {
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalImpactLabel: { color: subtleText, fontSize: 12, fontWeight: '700', flexShrink: 1 },

    modalToggleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14,
      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      backgroundColor: isDark ? '#080B11' : '#F8FAFC',
    },
    modalToggleRowActive: { borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.05)' },
    modalToggleLabel: { flex: 1, color: isDark ? '#CBD5E1' : '#334155', fontSize: 14, fontWeight: '600' },
    modalToggle: {
      width: 40, height: 22, borderRadius: 11, justifyContent: 'center',
      backgroundColor: isDark ? '#1E293B' : '#CBD5E1', paddingHorizontal: 2,
    },
    modalToggleOn: { backgroundColor: '#8B5CF6' },
    modalToggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
    modalToggleThumbOn: { alignSelf: 'flex-end' },

    modalDoneBtn: { marginTop: 22, borderRadius: 14, overflow: 'hidden', paddingVertical: 15, alignItems: 'center' },
    modalDoneBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  });
}
