/**
 * History Feature UI: HistoryFilterScreen
 * 
 * Provides an interactive calendar and preset toggle interface for explicitly
 * defining the time window of historical trades to pull from the backend.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useTranslation } from '../../i18n/useTranslation';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';

const presets = ['All time', 'Today', 'Last week', 'Last month', 'Last 3 months', 'Last 6 months', 'Last year', 'Custom'];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type SelectionMode = 'range' | 'single' | 'week';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday-first
}


function getWeekDates(date: Date): [Date, Date] {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [monday, sunday];
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

function formatLocalizedDate(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return formatDate(d);
  }
}

function formatMonthYear(year: number, month: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  } catch {
    return `${MONTHS[month]} ${year}`;
  }
}

function getWeekdayLabels(locale: string): string[] {
  try {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const monday = new Date(2021, 7, 2);
    return DAYS.map((_, offset) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + offset);
      return formatter.format(day);
    });
  } catch {
    return DAYS;
  }
}

export function HistoryFilterScreen() {
  const { t, language } = useTranslation();
  const historyRange = useUserPreferences((s) => s.historyRange);
  const setHistoryRange = useUserPreferences((s) => s.setHistoryRange);
  const setHistoryDateRange = useUserPreferences((s) => s.setHistoryDateRange);
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('range');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [isCustom, setIsCustom] = useState(false);

  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const translatedHistoryRange = useMemo(
    () => (presets.includes(historyRange) ? t(historyRange) : historyRange),
    [historyRange, t],
  );
  const weekdayLabels = useMemo(() => getWeekdayLabels(language), [language]);
  const monthLabel = useMemo(() => formatMonthYear(calYear, calMonth, language), [calYear, calMonth, language]);

  const today = useMemo(() => {
    const d = new Date();
    return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  // Compute date range for a preset, persist it, and update the calendar view
  const handlePresetPress = (preset: string) => {
    setHistoryRange(preset);
    setIsCustom(preset === 'Custom');

    if (preset === 'Custom') {
      // Don't auto-set dates for custom — let user pick from calendar
      setStartDate(null);
      setEndDate(null);
      setHistoryDateRange(null, null);
      return;
    }

    if (preset === 'All time') {
      setStartDate(null);
      setEndDate(null);
      setHistoryDateRange(null, null);
      return;
    }

    const now = new Date();
    const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
    const startD = new Date(now);

    if (preset === 'Today') {
      // no offset — startD stays as today
    } else if (preset === 'Last week') {
      startD.setDate(startD.getDate() - 7);
    } else if (preset === 'Last month') {
      startD.setMonth(startD.getMonth() - 1);
    } else if (preset === 'Last 3 months') {
      startD.setMonth(startD.getMonth() - 3);
    } else if (preset === 'Last 6 months') {
      startD.setMonth(startD.getMonth() - 6);
    } else if (preset === 'Last year') {
      startD.setFullYear(startD.getFullYear() - 1);
    }

    const start = toDateKey(startD.getFullYear(), startD.getMonth(), startD.getDate());
    const end = todayKey;

    setStartDate(start);
    setEndDate(end);

    // Persist Unix-ms timestamps so query hooks can pass from/to to the API
    setHistoryDateRange(startD.setHours(0, 0, 0, 0), now.setHours(23, 59, 59, 999));

    // Navigate calendar to start month
    setCalYear(startD.getFullYear());
    setCalMonth(startD.getMonth());
  };

  const handleDayPress = useCallback((year: number, month: number, day: number) => {
    const key = toDateKey(year, month, day);
    const date = new Date(year, month, day);

    if (selectionMode === 'single') {
      setStartDate(key);
      setEndDate(key);
    } else if (selectionMode === 'week') {
      const [monday, sunday] = getWeekDates(date);
      setStartDate(toDateKey(monday.getFullYear(), monday.getMonth(), monday.getDate()));
      setEndDate(toDateKey(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()));
    } else {
      // Range mode
      if (!startDate || (startDate && endDate)) {
        setStartDate(key);
        setEndDate(null);
      } else {
        if (key < startDate) {
          setEndDate(startDate);
          setStartDate(key);
        } else {
          setEndDate(key);
        }
      }
    }
  }, [selectionMode, startDate, endDate]);

  const isInRange = useCallback((key: string) => {
    if (!startDate || !endDate) return false;
    return key >= startDate && key <= endDate;
  }, [startDate, endDate]);

  const isStart = useCallback((key: string) => key === startDate, [startDate]);
  const isEnd = useCallback((key: string) => key === endDate, [endDate]);

  const applyCustomRange = () => {
    if (startDate) {
      const sDate = new Date(startDate);
      const eDate = endDate ? new Date(endDate) : new Date(startDate);
      const label = startDate === endDate
        ? formatLocalizedDate(sDate, language)
        : `${formatLocalizedDate(sDate, language)} - ${formatLocalizedDate(eDate, language)}`;
      setHistoryRange(label);
      // Persist Unix-ms timestamps for the custom range so API queries can use them
      setHistoryDateRange(sDate.setHours(0, 0, 0, 0), eDate.setHours(23, 59, 59, 999));
      setIsCustom(false);
    }
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/history');
  }, []);

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDayOfMonth(calYear, calMonth);
    const rows: (number | null)[][] = [];
    let currentRow: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) currentRow.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      currentRow.push(d);
      if (currentRow.length === 7) {
        rows.push(currentRow);
        currentRow = [];
      }
    }
    if (currentRow.length > 0) {
      while (currentRow.length < 7) currentRow.push(null);
      rows.push(currentRow);
    }
    return rows;
  }, [calYear, calMonth]);

  return (
    <Screen>
      <View style={s.page}>
        <View
          style={[
            s.header,
            {
              paddingTop: Math.max(insets.top, 20) + 12,
              borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.08)',
            },
          ]}
        >
          <View style={s.headerRow}>
            <Pressable onPress={handleBack} hitSlop={16} style={s.headerBackButton}>
              <Ionicons name="chevron-back" size={28} color={T.text} />
            </Pressable>
            <View style={s.headerTitleWrap} pointerEvents="none">
              <Text style={s.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
                {t('History Filter')}
              </Text>
            </View>
            <View style={s.headerBackButton} />
          </View>
        </View>

        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.symbolRow}>
          <Text style={s.label}>{t('Symbol')}:</Text>
          <Text style={s.value}>{t('All symbols')}</Text>
        </View>

        <View style={s.card}>
          {presets.map((preset) => (
            <Pressable key={preset} onPress={() => handlePresetPress(preset)} style={s.option}>
              <Text style={s.optionText}>{t(preset)}</Text>
              <Text style={s.check}>
          {historyRange === preset || (preset === 'Custom' && isCustom) ? '✓' : ''}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Calendar (always visible) ── */}
        <View style={s.calendarCard}>
          {/* Mode Selector — only for Custom */}
          {isCustom && (
            <View style={s.modeRow}>
              {(['single', 'range', 'week'] as SelectionMode[]).map((mode) => (
                <Pressable
                  key={mode}
                  style={[s.modePill, selectionMode === mode && s.modePillActive]}
                  onPress={() => { setSelectionMode(mode); setStartDate(null); setEndDate(null); }}
                >
                  <Text style={[s.modePillText, selectionMode === mode && s.modePillTextActive]}>
                    {mode === 'single' ? t('Single') : mode === 'range' ? t('Range') : t('Week')}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Month Navigation */}
          <View style={s.monthNav}>
            <Pressable onPress={prevMonth} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={T.text} />
            </Pressable>
            <Text style={s.monthLabel}>{monthLabel}</Text>
            <Pressable onPress={nextMonth} hitSlop={12}>
              <Ionicons name="chevron-forward" size={22} color={T.text} />
            </Pressable>
          </View>

          {/* Day Headers */}
          <View style={s.dayHeaderRow}>
            {weekdayLabels.map((d) => (
              <Text key={d} style={s.dayHeaderText}>{d}</Text>
            ))}
          </View>

          {/* Calendar Grid */}
          {calendarGrid.map((row, rowIdx) => (
            <View key={rowIdx} style={s.calRow}>
              {row.map((day, colIdx) => {
                if (day === null) {
                  return <View key={colIdx} style={s.calCell} />;
                }

                const key = toDateKey(calYear, calMonth, day);
                const isToday = key === today;
                const selected = isStart(key) || isEnd(key);
                const inRange = isInRange(key) && !selected;
                const isRangeStart = isStart(key) && endDate && startDate !== endDate;
                const isRangeEnd = isEnd(key) && startDate && startDate !== endDate;

                return (
                  <Pressable
                    key={colIdx}
                    style={[
                      s.calCell,
                      inRange && s.calCellInRange,
                      isRangeStart && s.calCellRangeStart,
                      isRangeEnd && s.calCellRangeEnd,
                    ]}
                    onPress={() => isCustom && handleDayPress(calYear, calMonth, day)}
                  >
                    <View style={[
                      s.calDayCircle,
                      selected && s.calDaySelected,
                      isToday && !selected && s.calDayToday,
                    ]}>
                      <Text style={[
                        s.calDayText,
                        selected && s.calDayTextSelected,
                        isToday && !selected && s.calDayTextToday,
                        inRange && s.calDayTextInRange,
                      ]}>
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Selected Range Display */}
          {startDate && (
            <View style={s.selectionInfo}>
              <Text style={s.selectionLabel}>
                {!endDate || startDate === endDate
                  ? formatLocalizedDate(new Date(startDate), language)
                  : `${formatLocalizedDate(new Date(startDate), language)} -> ${formatLocalizedDate(new Date(endDate!), language)}`
                }
              </Text>
            </View>
          )}

          {/* Apply Button — only for Custom */}
          {isCustom && (
            <Pressable
              style={[s.applyBtn, !startDate && { opacity: 0.4 }]}
              onPress={applyCustomRange}
              disabled={!startDate}
            >
              <Text style={s.applyBtnText}>{t('Apply Custom Range')}</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={s.reportBtn}>
          <Text style={s.reportTitle}>{t('Create a trade report')}</Text>
          <Text style={s.reportSub}>{translatedHistoryRange}</Text>
        </Pressable>
        </ScrollView>
      </View>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: isDark ? '#06080D' : T.bg,
    },
    header: {
      backgroundColor: isDark ? '#06080D' : T.bg,
      paddingBottom: 10,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerTitle: {
      color: T.text,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    scrollContent: {
      paddingBottom: spacing.xl,
    },
    symbolRow: {
      margin: spacing.md,
      backgroundColor: isDark ? '#0E141F' : T.glass1,
      borderRadius: 12,
      padding: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
    },
    label: {
      color: T.textSub,
      fontSize: 16,
    },
    value: {
      color: T.textMuted,
      fontSize: 16,
    },
    card: {
      marginHorizontal: spacing.md,
      backgroundColor: isDark ? '#0E141F' : T.glass1,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderMedium,
    },
    option: {
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : T.borderMedium,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    optionText: {
      color: T.text,
      fontSize: 16,
      fontWeight: '500',
    },
    check: {
      color: T.accent,
      fontSize: 20,
    },
    reportBtn: {
      margin: spacing.md,
      marginTop: spacing.sm,
      backgroundColor: isDark ? '#0E141F' : T.glass1,
      borderRadius: 12,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
    },
    reportTitle: {
      color: T.text,
      fontSize: 18,
    },
    reportSub: {
      color: T.textMuted,
      marginTop: 4,
    },

    /* ── Calendar ── */
    calendarCard: {
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      backgroundColor: isDark ? '#0E141F' : T.glass1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
      padding: spacing.md,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: isDark ? 12 : 24,
      elevation: 4,
    },

    /* Mode pills */
    modeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 16,
    },
    modePill: {
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: 'transparent',
    },
    modePillActive: {
      backgroundColor: T.accent,
      borderColor: T.accent,
    },
    modePillText: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? 'rgba(148,163,184,0.7)' : T.textSub,
      letterSpacing: 0.3,
    },
    modePillTextActive: {
      color: '#FFFFFF',
    },

    /* Month nav */
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    monthLabel: {
      fontSize: 17,
      fontWeight: '700',
      color: T.text,
      letterSpacing: -0.3,
    },

    /* Day header */
    dayHeaderRow: {
      flexDirection: 'row',
      marginBottom: 6,
    },
    dayHeaderText: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    /* Calendar grid */
    calRow: {
      flexDirection: 'row',
    },
    calCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
    },
    calCellInRange: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
    },
    calCellRangeStart: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
      borderTopLeftRadius: 20,
      borderBottomLeftRadius: 20,
    },
    calCellRangeEnd: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
      borderTopRightRadius: 20,
      borderBottomRightRadius: 20,
    },

    /* Day circle */
    calDayCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calDaySelected: {
      backgroundColor: T.accent,
    },
    calDayToday: {
      borderWidth: 1.5,
      borderColor: T.accent,
    },
    calDayText: {
      fontSize: 14,
      fontWeight: '600',
      color: T.text,
      fontVariant: ['tabular-nums'],
    },
    calDayTextSelected: {
      color: '#FFFFFF',
      fontWeight: '800',
    },
    calDayTextToday: {
      color: T.accent,
      fontWeight: '800',
    },
    calDayTextInRange: {
      color: T.accent,
      fontWeight: '700',
    },

    /* Selection info */
    selectionInfo: {
      marginTop: 12,
      alignItems: 'center',
    },
    selectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: T.textSub,
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.2,
    },

    /* Apply button */
    applyBtn: {
      marginTop: 12,
      backgroundColor: T.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    applyBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
}
