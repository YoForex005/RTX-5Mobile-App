/**
 * Settings Feature UI: EconomicCalendarScreen
 *
 * Enterprise-grade economic calendar with glassmorphic cards,
 * animated impact indicators, expandable event detail panels,
 * multi-dimension filtering, and live countdown timers.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../../ui/components/Screen';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTheme } from '../../../ui/theme/useTheme';
import { fetchEconomicCalendarData, type EconomicEvent, type ImpactLevel } from '../../../dev/mock/calendarData';
import {
  CURRENCY_FILTERS,
  DATE_TABS,
  IMPACT_CONFIG,
  IMPACT_FILTERS,
  getEventsForTab,
  parseAndDiff,
} from './eventHelpers';
import { CountryBadge, PulseDot } from './subComponents';
import { makeEconomicCalendarStyles } from './styles';

export function EconomicCalendarScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeEconomicCalendarStyles(T, isDark), [T, isDark]);

  const [activeTab, setActiveTab] = useState('Today');
  const [selectedImpacts, setSelectedImpacts] = useState<Set<ImpactLevel>>(new Set(['high', 'medium', 'low', 'holiday']));
  const [selectedCurrency, setSelectedCurrency] = useState('All');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const [dataEvents, setDataEvents] = useState<EconomicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const loadData = useCallback(() => {
    setIsLoading(true);
    setFetchError(false);
    fetchEconomicCalendarData().then((data) => {
      if (data.length > 0) {
        setDataEvents(data);
        setFetchError(false);
      } else {
        setFetchError(true);
      }
      setIsLoading(false);
    }).catch(() => {
      setFetchError(true);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
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
          <View style={{ flexDirection: 'column' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View style={{ width: 80 }}>
                <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {event.time} <Text style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '500' }}>GMT</Text>
                </Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 12, flexDirection: 'row' }}>
                <View style={styles.currencyTag}>
                  <Text style={styles.currencyTagText}>{event.currency}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: config.color + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }}>
                <PulseDot color={config.color} size={5} />
                <Text style={{ marginLeft: 6, color: config.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{config.label.toUpperCase()}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ width: 80 }} />
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 16, color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 'bold' }}>{event.title}</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', marginTop: 8 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text style={{ color: hasActual ? config.color : (isDark ? '#475569' : '#94A3B8'), fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 }}>ACTUAL</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: hasActual ? config.color : (isDark ? '#475569' : '#94A3B8'), fontVariant: ['tabular-nums'] }}>
                {hasActual ? event.actual : '—'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>FORECAST</Text>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{event.forecast || '—'}</Text>
              {forecastDiff ? (
                <Text style={{ color: forecastDiff.color, fontSize: 10, fontWeight: '700', marginTop: 4 }}>vs: {forecastDiff.text} {forecastDiff.symbol}</Text>
              ) : <View style={{ height: 16 }} />}
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
              <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>PREVIOUS</Text>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{event.previous || '—'}</Text>
              {previousDiff ? (
                <Text style={{ color: previousDiff.color, fontSize: 10, fontWeight: '700', marginTop: 4 }}>vs: {previousDiff.text} {previousDiff.symbol}</Text>
              ) : <View style={{ height: 16 }} />}
            </View>
          </View>

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
        <View style={styles.eventRow}>
          <View style={styles.timeBlock}>
            {event.isAllDay ? (
              <View style={styles.allDayPill}>
                <Ionicons name="calendar" size={10} color="#8B5CF6" />
                <Text style={styles.allDayText}>ALL DAY</Text>
              </View>
            ) : (
              <Text style={styles.timeText}>{event.time}</Text>
            )}
          </View>

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

            {Platform.OS === 'web' && (
              <style>{`
                [data-scroll="chips"]::-webkit-scrollbar { height: 4px; }
                [data-scroll="chips"]::-webkit-scrollbar-track { background: transparent; }
                [data-scroll="chips"]::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}; border-radius: 4px; }
                [data-scroll="chips"]::-webkit-scrollbar-thumb:hover { background: ${isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)'}; }
              `}</style>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              indicatorStyle={isDark ? 'white' : 'black'}
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

              <View style={styles.eventsGroup}>
                {section.events.map((event, idx) => renderEvent(event, idx, section.events.length))}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 36 }} />
      </ScrollView>

      {filterModalOpen && (
        <Pressable style={styles.modalOverlay} onPress={() => setFilterModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Event Filters</Text>
              <Text style={styles.modalSub}>Customize which events appear</Text>
            </View>

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

            <Text style={styles.modalGroupTitle}>OTHER</Text>
            <Pressable style={[styles.modalToggleRow, selectedImpacts.has('holiday') && styles.modalToggleRowActive]} onPress={() => toggleImpact('holiday')}>
              <Ionicons name="calendar" size={16} color="#8B5CF6" />
              <Text style={styles.modalToggleLabel}>Show Bank Holidays</Text>
              <View style={[styles.modalToggle, selectedImpacts.has('holiday') && styles.modalToggleOn]}>
                <View style={[styles.modalToggleThumb, selectedImpacts.has('holiday') && styles.modalToggleThumbOn]} />
              </View>
            </Pressable>

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
