import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Calendar } from 'react-native-calendars';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useJournalState } from '../../../state/journalState';
import {
  useTerminalJournalState,
  type TerminalJournalEntry,
  type TerminalJournalLevel,
  type TerminalJournalSource,
} from '../../../state/terminalJournalState';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Screen } from '../../../ui/components/Screen';
import { useDeferredRouteContentReady } from '../../../ui/components/DeferredRouteMount';
import { useUIState } from '../../../state/uiState';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../../ui/components/sidebarDrawerController';
import { useTheme } from '../../../ui/theme/useTheme';
import { useJournalTrades } from './liveJournal';
import { makeJournalStyles } from './styles';
import { useNextFrameValue } from '../../../hooks/useNextFrameValue';
import { useTranslation } from '../../../i18n/useTranslation';

type JournalFilter = 'All' | 'Trades' | 'Accounts' | 'Actions' | 'Errors' | 'Notes';

type JournalLogRow = {
  id: string;
  filter: JournalFilter;
  timestamp: string;
  source: TerminalJournalSource;
  level: TerminalJournalLevel;
  message: string;
};

type JournalLogSection = {
  heading: string;
  data: JournalLogRow[];
};

const FILTERS: JournalFilter[] = ['All', 'Trades', 'Accounts', 'Actions', 'Errors', 'Notes'];
const JOURNAL_INITIAL_RENDER_ITEMS = 6;
const JOURNAL_RENDER_BATCH_SIZE = 6;
const JOURNAL_WINDOW_SIZE = 5;

const NOTE_SYMBOL = 'General';

const toCalendarDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseCalendarDateString = (value: string) => {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date();
  }
  return new Date(year, month - 1, day);
};

const isToday = (date: Date, now = new Date()) =>
  date.getFullYear() === now.getFullYear() &&
  date.getMonth() === now.getMonth() &&
  date.getDate() === now.getDate();

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const parseDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
};

const formatTerminalTime = (value: string) => {
  const date = parseDate(value);
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${time}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};

const formatDateHeading = (value: string, t: (key: string) => string) => {
  const date = parseDate(value);
  const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  if (isToday(date)) {
    return `${t('Today')}, ${label}`;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `${t('Yesterday')}, ${label}`;
  }

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
};

const formatSelectedDateLabel = (dateString: string, t: (key: string) => string) => {
  const date = parseCalendarDateString(dateString);
  const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (isToday(date)) {
    return `${t('Today')}, ${label}`;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `${t('Yesterday')}, ${label}`;
  }

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const formatMoney = (value: number | undefined) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return `${safe >= 0 ? '+' : '-'}$${Math.abs(safe).toFixed(2)}`;
};

const toTerminalLogRows = (entries: TerminalJournalEntry[]): JournalLogRow[] =>
  entries.map((entry) => ({
    id: entry.id,
    filter: entry.level === 'error'
      ? 'Errors'
      : entry.source === 'Notes'
        ? 'Notes'
        : entry.source === 'Trades'
          ? 'Trades'
          : entry.source === 'Accounts'
            ? 'Accounts'
            : 'Actions',
    timestamp: entry.createdAt,
    source: entry.source,
    level: entry.level,
    message: entry.message,
  }));

const mergeJournalRows = (
  terminalRows: JournalLogRow[],
): JournalLogRow[] => {
  const seen = new Set<string>();
  return terminalRows
    .filter((row) => {
      if (seen.has(row.id)) {
        return false;
      }
      seen.add(row.id);
      return true;
    })
    .sort((left, right) => {
      const byTime = parseDate(left.timestamp).getTime() - parseDate(right.timestamp).getTime();
      if (byTime !== 0) return byTime;
      return left.id.localeCompare(right.id);
    });
};

const groupJournalRowsByDate = (items: JournalLogRow[], t: (key: string) => string): JournalLogSection[] => {
  const groups: JournalLogSection[] = [];
  for (const item of items) {
    const heading = formatDateHeading(item.timestamp, t);
    const existing = groups.find((group) => group.heading === heading);
    if (existing) {
      existing.data.push(item);
    } else {
      groups.push({ heading, data: [item] });
    }
  }
  return groups;
};

/**
 * A detailed logging screen that tracks system events, connection status changes, and raw trade execution responses for diagnostic purposes.
 */
export const JournalScreenInner = React.memo(function JournalScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const routeBodyReady = useDeferredRouteContentReady(0, isScreenFocused);
  const T = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeJournalStyles(T), [T]);
  const actionColor = T.trading.buy.primary;
  const insets = useSafeAreaInsets();
  const { accountLogin, trades, isError, refetch } = useJournalTrades(isScreenFocused);
  const hideActionSheet = useUIState((state) => state.hideActionSheet);
  const addEntry = useJournalState((state) => state.addEntry);
  const terminalEntries = useTerminalJournalState((state) => state.entries);
  const addTerminalEntry = useTerminalJournalState((state) => state.addEntry);
  const pruneTerminalEntries = useTerminalJournalState((state) => state.pruneExpiredEntries);
  const todayDateIso = toCalendarDateString(new Date());
  const [selectedDateIso, setSelectedDateIso] = useState(() => toCalendarDateString(new Date()));
  const [filter, setFilter] = useState<JournalFilter>('All');
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (isScreenFocused) {
      pruneTerminalEntries();
    }
  }, [isScreenFocused, pruneTerminalEntries]);

  const selectedDate = useMemo(() => parseCalendarDateString(selectedDateIso), [selectedDateIso]);
  const selectedDateLabel = useMemo(() => formatSelectedDateLabel(selectedDateIso, t), [selectedDateIso, t]);

  const selectedDateClosedTrades = useMemo(
    () => trades.filter((trade) => isSameDay(parseDate(trade.date), selectedDate) && trade.result && trade.result !== 'Open'),
    [selectedDate, trades],
  );
  const selectedDatePnl = selectedDateClosedTrades.reduce((sum, trade) => sum + (trade.pnlMoney ?? 0), 0);
  const selectedDateWins = selectedDateClosedTrades.filter((trade) => (trade.pnlMoney ?? 0) > 0 || trade.result === 'Win').length;
  const selectedDateLosses = selectedDateClosedTrades.filter((trade) => (trade.pnlMoney ?? 0) < 0 || trade.result === 'Loss').length;

  const terminalRows = useMemo(() => toTerminalLogRows(terminalEntries), [terminalEntries]);
  const allJournalRows = useMemo(
    () => mergeJournalRows(terminalRows),
    [terminalRows],
  );
  const journalRows = useMemo(
    () => allJournalRows.filter((row) => toCalendarDateString(parseDate(row.timestamp)) === selectedDateIso),
    [allJournalRows, selectedDateIso],
  );
  const filteredRows = useMemo(
    () => filter === 'All'
      ? journalRows
      : journalRows.filter((item) => item.filter === filter),
    [filter, journalRows],
  );
  const groups = useMemo(() => groupJournalRowsByDate(filteredRows, t), [filteredRows, t]);
  const filterCounts = useMemo<Record<JournalFilter, number>>(() => ({
    All: journalRows.length,
    Trades: journalRows.filter((item) => item.filter === 'Trades').length,
    Accounts: journalRows.filter((item) => item.filter === 'Accounts').length,
    Actions: journalRows.filter((item) => item.filter === 'Actions').length,
    Errors: journalRows.filter((item) => item.filter === 'Errors').length,
    Notes: journalRows.filter((item) => item.filter === 'Notes').length,
  }), [journalRows]);
  const selectedDateLogCount = useMemo(
    () => journalRows.filter((row) => isSameDay(parseDate(row.timestamp), selectedDate)).length,
    [journalRows, selectedDate],
  );
  const selectedCalendarMarkedDates = useMemo(
    () => ({
      [selectedDateIso]: {
        selected: true,
        selectedColor: actionColor,
        selectedTextColor: '#FFFFFF',
      },
    }),
    [actionColor, selectedDateIso],
  );
  const retainedDateCount = useMemo(
    () => new Set(allJournalRows.map((row) => toCalendarDateString(parseDate(row.timestamp)))).size,
    [allJournalRows],
  );
  const latestActivityAt = journalRows[journalRows.length - 1]?.timestamp;
  const lastSyncLabel = latestActivityAt
    ? `${t('Last entry')} ${formatTerminalTime(latestActivityAt)}`
    : `${retainedDateCount} ${retainedDateCount === 1 ? t('day stored') : t('days stored')}`;
  const emptyMessage = isError
    ? t('Could not refresh account journal.')
    : `${t('No real journal events recorded for')} ${selectedDateLabel}.`;

  useEffect(() => {
    if (selectedDateIso > todayDateIso) {
      setSelectedDateIso(todayDateIso);
    }
  }, [selectedDateIso, todayDateIso]);

  /**
   * Opens the sidebar navigation drawer.
   */
  const handleOpenMenu = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  /**
   * Pulls the latest batch of journal logs from the internal database or state.
   */
  const handleRefresh = useCallback(() => {
    setIsPullRefreshing(true);
    pruneTerminalEntries();
    void Promise.resolve(refetch()).finally(() => setIsPullRefreshing(false));
  }, [pruneTerminalEntries, refetch]);

  /**
   * Filters the journal log view to show events occurring only on the selected calendar date.
   */
  const handleCalendarDayPress = useCallback((day: { dateString?: string }) => {
    if (day.dateString) {
      setSelectedDateIso(day.dateString);
      setIsCalendarOpen(false);
    }
  }, []);

  /**
   * Saves a user-annotated text note attached to a specific journal entry or trading day.
   */
  const handleSaveNote = useCallback(() => {
    const trimmed = noteText.trim();
    if (!trimmed) {
      return;
    }

    const now = new Date().toISOString();
    addEntry({
      id: `note-${Date.now()}`,
      createdAt: now,
      date: now,
      session: 'Out of Session',
      market: 'Forex',
      symbol: NOTE_SYMBOL,
      tradeType: 'Buy',
      strategy: 'Custom',
      result: 'Open',
      entryReason: trimmed,
      mainLesson: trimmed,
      followedPlan: 'Partial',
      brokeRule: false,
      disciplineScore: 0,
    });
    addTerminalEntry({
      source: 'Notes',
      level: 'info',
      createdAt: now,
      accountLogin: accountLogin ? String(accountLogin) : undefined,
      message: trimmed,
    });
    setNoteText('');
    setIsNoteOpen(false);
  }, [accountLogin, addEntry, addTerminalEntry, noteText]);

  const renderJournalRow = useCallback(({ item }: { item: JournalLogRow }) => (
    <View style={[
      styles.terminalLogRow,
      item.level === 'error' && styles.terminalLogRowError,
    ]}>
      <Text style={styles.terminalLogText}>
        <Text style={styles.terminalLogTime}>{formatTerminalTime(item.timestamp)} </Text>
        <Text style={[
          styles.terminalLogSource,
          item.source === 'Trades' && styles.terminalLogSourceTrades,
          item.source === 'Accounts' && styles.terminalLogSourceAccounts,
          item.source === 'Actions' && styles.terminalLogSourceActions,
          item.source === 'Notes' && styles.terminalLogSourceNotes,
          item.level === 'error' && styles.terminalLogSourceError,
        ]}>
          {item.source}{'  '}
        </Text>
        <Text style={[
          styles.terminalLogMessage,
          item.level === 'error' && styles.lossText,
        ]}>
          {item.message}
        </Text>
      </Text>
    </View>
  ), [styles]);

  const renderActivitySectionHeader = useCallback(({ section }: { section: JournalLogSection }) => (
    <Text style={styles.dateHeading}>{section.heading}</Text>
  ), [styles]);

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={handleOpenMenu}
          activateOnTouchStart
          hitSlop={15}
          style={styles.backButton}
          latencyLabel="journal.menu"
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={24} color={T.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{t('Journal')}</Text>
          <Text style={styles.headerSub}>{selectedDateLabel} | {accountLogin ? t('Live') : t('Local log')}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerActionButton}
            onPress={() => setIsCalendarOpen(true)}
            hitSlop={10}
            latencyLabel="journal.calendar.open"
            journalActionLabel="opened journal calendar"
            journalActionSource="Actions"
            accessibilityRole="button"
            accessibilityLabel="Select journal date"
          >
            <Ionicons name="calendar-outline" size={22} color={T.text} />
          </Pressable>
          <Pressable
            style={[styles.headerActionButton, isPullRefreshing && styles.headerActionButtonDisabled]}
            onPress={handleRefresh}
            disabled={isPullRefreshing}
            hitSlop={10}
            latencyLabel="journal.refresh"
            journalActionLabel="refreshed journal"
            journalActionSource="Actions"
            accessibilityRole="button"
            accessibilityLabel="Refresh journal"
          >
            <Ionicons name="refresh-outline" size={24} color={T.text} />
          </Pressable>
        </View>
      </View>

      {routeBodyReady ? <SectionList
        sections={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderJournalRow}
        renderSectionHeader={renderActivitySectionHeader}
        stickySectionHeadersEnabled={false}
        initialNumToRender={JOURNAL_INITIAL_RENDER_ITEMS}
        maxToRenderPerBatch={JOURNAL_RENDER_BATCH_SIZE}
        windowSize={JOURNAL_WINDOW_SIZE}
        removeClippedSubviews={Platform.OS !== 'web'}
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handleRefresh}
            tintColor={actionColor}
            colors={[actionColor]}
          />
        )}
        ListHeaderComponent={(
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View>
                  <Text style={styles.summaryTitle}>{t('Session Summary')}</Text>
                  <Text style={styles.summarySub}>{selectedDateLabel} | {lastSyncLabel}</Text>
                </View>
                <View style={styles.summaryStatus}>
                  <Ionicons name="reader-outline" size={14} color={actionColor} />
                  <Text style={styles.summaryStatusText}>{t('MT5 Log')}</Text>
                </View>
              </View>

              <View style={styles.summaryMetrics}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>{t('Logs')}</Text>
                  <Text style={styles.summaryValue}>{selectedDateLogCount}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>{t('Net P/L')}</Text>
                  <Text style={[styles.summaryValue, selectedDatePnl < 0 ? styles.lossText : styles.profitText]}>
                    {formatMoney(selectedDatePnl)}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>{t('Win/Loss')}</Text>
                  <Text style={styles.summaryValue}>{selectedDateWins}W / {selectedDateLosses}L</Text>
                </View>
              </View>
            </View>

            <View style={styles.activityToolbar}>
              <View>
                <Text style={styles.activityToolbarTitle}>{t('Terminal Log')}</Text>
                <Text style={styles.activityToolbarSub}>{filteredRows.length} {t('entries')} | {selectedDateLabel}</Text>
              </View>
              <Pressable
                style={styles.toolbarNoteButton}
                onPress={() => setIsNoteOpen(true)}
                latencyLabel="journal.toolbarNote"
              >
                <Ionicons name="create-outline" size={15} color={actionColor} />
                <Text style={styles.toolbarNoteText}>{t('Note')}</Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((item) => {
                const active = filter === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilter(item)}
                    latencyLabel={`journal.filter.${item}`}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{t(item)}</Text>
                    <Text style={[styles.filterCount, active && styles.filterTextActive]}>{filterCounts[item]}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="reader-outline" size={22} color={T.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{emptyMessage}</Text>
            <Text style={styles.emptySub}>{t('Use the calendar above to view retained Journal rows by date, then refresh for the latest account activity.')}</Text>
          </View>
        )}
        ListFooterComponent={(
          <Pressable
            style={[styles.addNoteButton, styles.addNoteButtonSecondary]}
            onPress={() => setIsNoteOpen(true)}
            latencyLabel="journal.addNote"
          >
            <Ionicons name="add-circle-outline" size={18} color={actionColor} />
            <Text style={styles.addNoteText}>{t('Add Note')}</Text>
          </Pressable>
        )}
      /> : <View style={styles.container} />}

      {isNoteOpen ? (
        <View style={styles.noteOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsNoteOpen(false)} latencyLabel="journal.noteOverlay" />
          <View style={[styles.noteSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.noteHeader}>
              <Text style={styles.noteTitle}>{t('Add Note')}</Text>
              <Pressable onPress={() => setIsNoteOpen(false)} style={styles.noteClose} latencyLabel="journal.noteClose">
                <Ionicons name="close" size={20} color={T.text} />
              </Pressable>
            </View>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t('Write a short trading note...')}
              placeholderTextColor={T.textMuted}
              multiline
              textAlignVertical="top"
              style={styles.noteInput}
            />
            <Pressable
              style={[styles.saveNoteButton, !noteText.trim() && styles.saveNoteButtonDisabled]}
              onPress={handleSaveNote}
              disabled={!noteText.trim()}
              latencyLabel="journal.noteSave"
            >
              <Text style={styles.saveNoteText}>{t('Save Note')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {isCalendarOpen ? (
        <View style={styles.calendarOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsCalendarOpen(false)}
            latencyLabel="journal.calendarOverlay"
          />
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>{t('Select Date')}</Text>
              <Pressable
                style={styles.calendarClose}
                onPress={() => setIsCalendarOpen(false)}
                latencyLabel="journal.calendarClose"
                accessibilityRole="button"
                accessibilityLabel="Close calendar"
              >
                <Ionicons name="close" size={20} color={T.text} />
              </Pressable>
            </View>
            <Calendar
              current={selectedDateIso}
              maxDate={todayDateIso}
              markedDates={selectedCalendarMarkedDates}
              enableSwipeMonths
              onDayPress={handleCalendarDayPress}
              theme={{
                backgroundColor: T.bgSecondary,
                calendarBackground: T.bgSecondary,
                textSectionTitleColor: T.textSub,
                selectedDayBackgroundColor: actionColor,
                selectedDayTextColor: '#FFFFFF',
                todayTextColor: actionColor,
                dayTextColor: T.text,
                textDisabledColor: T.textMuted,
                monthTextColor: T.text,
                arrowColor: actionColor,
              }}
            />
            <Pressable
              style={styles.calendarTodayButton}
              onPress={() => {
                setSelectedDateIso(todayDateIso);
                setIsCalendarOpen(false);
              }}
              latencyLabel="journal.calendarToday"
            >
              <Text style={styles.calendarTodayText}>{t('Today')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Own drawer instance so the hamburger works on this pushed route - the
          (tabs) drawer is below this screen and would open invisibly. Matches
          AboutScreen / UserGuideScreen. */}
    </Screen>
  );
});

export function JournalScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <JournalScreenInner isScreenFocused={deferredScreenFocused} />;
}
