import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * History Feature UI: HistoryFilterScreen
 *
 * Provides an interactive calendar and preset toggle interface for explicitly
 * defining the time window of historical trades to pull from the backend.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../../ui/components/Screen';
import { useTranslation } from '../../../i18n/useTranslation';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTheme } from '../../../ui/theme/useTheme';
import { safeRouterBack } from '../../../utils/navigation';
import {
  PRESETS,
  type SelectionMode,
  formatLocalizedDate,
  formatMonthYear,
  getDaysInMonth,
  getFirstDayOfMonth,
  getWeekDates,
  getWeekdayLabels,
  toDateKey,
} from './dateUtils';
import { makeHistoryFilterStyles } from './styles';

export function HistoryFilterScreen() {
  const { t, language } = useTranslation();
  const historyRange = useUserPreferences((s) => s.historyRange);
  const setHistoryRange = useUserPreferences((s) => s.setHistoryRange);
  const setHistoryDateRange = useUserPreferences((s) => s.setHistoryDateRange);
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeHistoryFilterStyles(T, isDark), [T, isDark]);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('range');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [isCustom, setIsCustom] = useState(false);

  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const translatedHistoryRange = useMemo(
    () => (PRESETS.includes(historyRange) ? t(historyRange) : historyRange),
    [historyRange, t],
  );
  const weekdayLabels = useMemo(() => getWeekdayLabels(language), [language]);
  const monthLabel = useMemo(() => formatMonthYear(calYear, calMonth, language), [calYear, calMonth, language]);

  const today = useMemo(() => {
    const d = new Date();
    return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const handlePresetPress = (preset: string) => {
    setHistoryRange(preset);
    setIsCustom(preset === 'Custom');

    if (preset === 'Custom') {
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
      // no offset
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

    setHistoryDateRange(startD.setHours(0, 0, 0, 0), now.setHours(23, 59, 59, 999));

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
    safeRouterBack(router, '/(tabs)/history');
  }, []);

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
              <Ionicons name="arrow-back" size={26} color={T.text} />
            </Pressable>
            <View style={s.headerTitleWrap} pointerEvents="none">
              <Text style={s.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
                {t('History Filter')}
              </Text>
            </View>
            <View style={s.headerBackButton} />
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.symbolRow}>
            <Text style={s.label}>{t('Symbol')}:</Text>
            <Text style={s.value}>{t('All symbols')}</Text>
          </View>

          <View style={s.card}>
            {PRESETS.map((preset) => (
              <Pressable key={preset} onPress={() => handlePresetPress(preset)} style={s.option}>
                <Text style={s.optionText}>{t(preset)}</Text>
                <Text style={s.check}>
                  {historyRange === preset || (preset === 'Custom' && isCustom) ? '✓' : ''}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={s.calendarCard}>
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

            <View style={s.monthNav}>
              <Pressable onPress={prevMonth} hitSlop={12}>
                <Ionicons name="chevron-back" size={22} color={T.text} />
              </Pressable>
              <Text style={s.monthLabel}>{monthLabel}</Text>
              <Pressable onPress={nextMonth} hitSlop={12}>
                <Ionicons name="chevron-forward" size={22} color={T.text} />
              </Pressable>
            </View>

            <View style={s.dayHeaderRow}>
              {weekdayLabels.map((d) => (
                <Text key={d} style={s.dayHeaderText}>{d}</Text>
              ))}
            </View>

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

            {startDate && (
              <View style={s.selectionInfo}>
                <Text style={s.selectionLabel}>
                  {!endDate || startDate === endDate
                    ? formatLocalizedDate(new Date(startDate), language)
                    : `${formatLocalizedDate(new Date(startDate), language)} -> ${formatLocalizedDate(new Date(endDate!), language)}`}
                </Text>
              </View>
            )}

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
