import { Ionicons } from '@expo/vector-icons';
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
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Screen } from '../../../ui/components/Screen';
import { useUIState } from '../../../state/uiState';
import { SidebarDrawer } from '../../../ui/components/SidebarDrawer';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../../ui/components/sidebarDrawerController';
import { useTheme } from '../../../ui/theme/useTheme';
import { fmt } from '../../../utils/format';
import { useJournalTrades } from './liveJournal';
import { makeJournalStyles } from './styles';
import type { TradeJournalEntry } from './types';

type JournalFilter = 'All' | 'Opened' | 'Modified' | 'Closed' | 'Notes';
type JournalTone = 'buy' | 'sell' | 'profit' | 'loss' | 'neutral' | 'note';
type JournalActivityType = 'opened' | 'modified' | 'closed' | 'snapshot' | 'note';

type JournalDetail = {
  label: string;
  value: string;
  tone?: JournalTone;
};

type JournalActivityItem = {
  id: string;
  type: JournalActivityType;
  filter: JournalFilter;
  timestamp: string;
  title: string;
  symbol?: string;
  tone: JournalTone;
  details: JournalDetail[];
};

type JournalActivitySection = {
  heading: string;
  data: JournalActivityItem[];
};

const FILTERS: JournalFilter[] = ['All', 'Opened', 'Modified', 'Closed', 'Notes'];
const JOURNAL_INITIAL_RENDER_ITEMS = 6;
const JOURNAL_RENDER_BATCH_SIZE = 6;
const JOURNAL_WINDOW_SIZE = 5;

const NOTE_SYMBOL = 'General';

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

const formatTime = (value: string) =>
  parseDate(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const formatDateHeading = (value: string) => {
  const date = parseDate(value);
  const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  if (isToday(date)) {
    return `Today, ${label}`;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `Yesterday, ${label}`;
  }

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
};

const formatMoney = (value: number | undefined) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return `${safe >= 0 ? '+' : '-'}$${Math.abs(safe).toFixed(2)}`;
};

const formatPlainMoney = (value: number | undefined) => {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return `$${Math.abs(safe).toFixed(2)}`;
};

const formatPriceValue = (value: number | undefined, symbol?: string) => {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const upper = symbol?.toUpperCase() ?? '';
  const decimals = upper.includes('JPY') ? 3 : upper.includes('XAU') ? 2 : 5;
  return fmt.price(Number(value), decimals);
};

const formatLots = (value: number | undefined) =>
  Number.isFinite(value) ? Number(value).toFixed(2) : '--';

const formatPips = (trade: TradeJournalEntry) => {
  if (Number.isFinite(trade.pnlPips)) {
    const pips = Number(trade.pnlPips);
    return `${pips >= 0 ? '+' : ''}${pips.toFixed(1)}`;
  }

  return '--';
};

const formatDuration = (trade: TradeJournalEntry) => {
  const openedAt = parseDate(trade.createdAt).getTime();
  const closedAt = parseDate(trade.date).getTime();
  const minutes = Math.max(0, Math.round((closedAt - openedAt) / 60000));
  if (minutes <= 0) return '--';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;
};

const hasNoteOnlyShape = (trade: TradeJournalEntry) =>
  trade.symbol === NOTE_SYMBOL && !Number.isFinite(trade.entryPrice) && Boolean(trade.entryReason || trade.mainLesson);

const buildJournalActivity = (trades: TradeJournalEntry[]): JournalActivityItem[] => {
  const items: JournalActivityItem[] = [];

  for (const trade of trades) {
    if (hasNoteOnlyShape(trade)) {
      items.push({
        id: `${trade.id}-note`,
        type: 'note',
        filter: 'Notes',
        timestamp: trade.date,
        title: 'Note Added',
        tone: 'note',
        details: [
          { label: 'Note', value: trade.entryReason || trade.mainLesson || 'No note text' },
        ],
      });
      continue;
    }

    const isSell = trade.tradeType === 'Sell';
    items.push({
      id: `${trade.id}-opened`,
      type: 'opened',
      filter: 'Opened',
      timestamp: trade.createdAt,
      title: `${trade.tradeType.toUpperCase()} order opened`,
      symbol: trade.symbol,
      tone: isSell ? 'sell' : 'buy',
      details: [
        { label: 'Symbol', value: trade.symbol },
        { label: 'Entry Price', value: formatPriceValue(trade.entryPrice, trade.symbol) },
        { label: 'Lot Size', value: formatLots(trade.lotSize) },
        { label: 'Spread', value: '--' },
      ],
    });

    if (Number.isFinite(trade.stopLoss)) {
      items.push({
        id: `${trade.id}-sl`,
        type: 'modified',
        filter: 'Modified',
        timestamp: trade.createdAt,
        title: 'Stop Loss Added',
        symbol: trade.symbol,
        tone: 'loss',
        details: [
          { label: 'SL Price', value: formatPriceValue(trade.stopLoss, trade.symbol), tone: 'loss' },
          { label: 'Risk', value: trade.riskAmount ? formatPlainMoney(trade.riskAmount) : '--' },
        ],
      });
    }

    if (Number.isFinite(trade.takeProfit)) {
      items.push({
        id: `${trade.id}-tp`,
        type: 'modified',
        filter: 'Modified',
        timestamp: trade.createdAt,
        title: 'Take Profit Added',
        symbol: trade.symbol,
        tone: 'profit',
        details: [
          { label: 'TP Price', value: formatPriceValue(trade.takeProfit, trade.symbol), tone: 'profit' },
          { label: 'Reward', value: trade.rewardToRiskRatio ? `${trade.rewardToRiskRatio.toFixed(2)}R` : '--' },
        ],
      });
    }

    if (trade.result === 'Open' && Number.isFinite(trade.exitPrice)) {
      const pnl = trade.pnlMoney ?? 0;
      items.push({
        id: `${trade.id}-snapshot`,
        type: 'snapshot',
        filter: 'All',
        timestamp: trade.date,
        title: 'Price Snapshot',
        symbol: trade.symbol,
        tone: pnl < 0 ? 'loss' : pnl > 0 ? 'profit' : 'neutral',
        details: [
          { label: 'Current Price', value: formatPriceValue(trade.exitPrice, trade.symbol) },
          { label: 'Floating Profit/Loss', value: formatMoney(pnl), tone: pnl < 0 ? 'loss' : 'profit' },
        ],
      });
    }

    if (trade.result && trade.result !== 'Open') {
      const pnl = trade.pnlMoney ?? 0;
      const pips = formatPips(trade);
      items.push({
        id: `${trade.id}-closed`,
        type: 'closed',
        filter: 'Closed',
        timestamp: trade.date,
        title: trade.closeType === 'SL Hit' ? 'Trade Closed by Stop Loss' : 'Trade Closed Manually',
        symbol: trade.symbol,
        tone: pnl < 0 ? 'loss' : pnl > 0 ? 'profit' : 'neutral',
        details: [
          { label: 'Exit Price', value: formatPriceValue(trade.exitPrice, trade.symbol) },
          { label: 'Final P/L', value: formatMoney(pnl), tone: pnl < 0 ? 'loss' : 'profit' },
          { label: 'Pips', value: pips, tone: pips === '--' ? undefined : pnl < 0 ? 'loss' : 'profit' },
          { label: 'Duration', value: formatDuration(trade) },
        ],
      });
    }

    const note = trade.mainLesson || trade.entryReason;
    if (note && note !== 'Imported from account closed-position history.') {
      items.push({
        id: `${trade.id}-note`,
        type: 'note',
        filter: 'Notes',
        timestamp: trade.date,
        title: 'Trade Note',
        symbol: trade.symbol,
        tone: 'note',
        details: [{ label: 'Note', value: note }],
      });
    }
  }

  return items.sort((left, right) => parseDate(right.timestamp).getTime() - parseDate(left.timestamp).getTime());
};

const groupActivityByDate = (items: JournalActivityItem[]): JournalActivitySection[] => {
  const groups: JournalActivitySection[] = [];
  for (const item of items) {
    const heading = formatDateHeading(item.timestamp);
    const existing = groups.find((group) => group.heading === heading);
    if (existing) {
      existing.data.push(item);
    } else {
      groups.push({ heading, data: [item] });
    }
  }
  return groups;
};

const getActivityBadgeLabel = (item: JournalActivityItem) =>
  item.type === 'snapshot' ? 'Live' : item.filter;

export function JournalScreen() {
  const T = useTheme();
  const styles = useMemo(() => makeJournalStyles(T), [T]);
  const actionColor = T.trading.buy.primary;
  const insets = useSafeAreaInsets();
  const { accountLogin, trades, isLoading, isError, refetch } = useJournalTrades();
  const hideActionSheet = useUIState((state) => state.hideActionSheet);
  const addEntry = useJournalState((state) => state.addEntry);
  const [filter, setFilter] = useState<JournalFilter>('All');
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [drawerReady, setDrawerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let frameId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const showDrawer = () => {
      if (!cancelled) {
        setDrawerReady(true);
      }
    };

    // The pushed Journal route owns a drawer too, but it is not needed for the
    // first paint. Mount it one frame later so the activity screen opens first.
    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(showDrawer);
    } else {
      timerId = setTimeout(showDrawer, 16);
    }

    return () => {
      cancelled = true;
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, []);

  const todayTrades = useMemo(
    () => trades.filter((trade) => isToday(parseDate(trade.date))).length,
    [trades],
  );
  const todayClosedTrades = useMemo(
    () => trades.filter((trade) => isToday(parseDate(trade.date)) && trade.result && trade.result !== 'Open'),
    [trades],
  );
  const todayPnl = todayClosedTrades.reduce((sum, trade) => sum + (trade.pnlMoney ?? 0), 0);
  const todayWins = todayClosedTrades.filter((trade) => (trade.pnlMoney ?? 0) > 0 || trade.result === 'Win').length;
  const todayLosses = todayClosedTrades.filter((trade) => (trade.pnlMoney ?? 0) < 0 || trade.result === 'Loss').length;

  const activityItems = useMemo(() => buildJournalActivity(trades), [trades]);
  const filteredItems = useMemo(
    () => filter === 'All'
      ? activityItems
      : activityItems.filter((item) => item.filter === filter),
    [activityItems, filter],
  );
  const groups = useMemo(() => groupActivityByDate(filteredItems), [filteredItems]);
  const filterCounts = useMemo<Record<JournalFilter, number>>(() => ({
    All: activityItems.length,
    Opened: activityItems.filter((item) => item.filter === 'Opened').length,
    Modified: activityItems.filter((item) => item.filter === 'Modified').length,
    Closed: activityItems.filter((item) => item.filter === 'Closed').length,
    Notes: activityItems.filter((item) => item.filter === 'Notes').length,
  }), [activityItems]);
  const toneStyles = useMemo(() => ({
    pills: {
      buy: styles.buyPill,
      sell: styles.sellPill,
      profit: styles.profitPill,
      loss: styles.lossPill,
      neutral: styles.neutralPill,
      note: styles.notePill,
    },
    labels: {
      buy: styles.buyText,
      sell: styles.sellText,
      profit: styles.profitText,
      loss: styles.lossText,
      neutral: styles.neutralText,
      note: styles.noteText,
    },
    cards: {
      buy: styles.buyCard,
      sell: styles.sellCard,
      profit: styles.profitCard,
      loss: styles.lossCard,
      neutral: styles.neutralCard,
      note: styles.noteCard,
    },
  }), [styles]);
  const latestActivityAt = activityItems[0]?.timestamp;
  const lastSyncLabel = latestActivityAt
    ? `Synced ${formatTime(latestActivityAt)}`
    : accountLogin
      ? 'Live account'
      : 'No account';
  const emptyMessage = !accountLogin
    ? 'Log in to view your trading activity journal.'
    : isLoading
      ? 'Loading account activity...'
      : isError
        ? 'Could not load account activity.'
        : 'No journal activity for this filter yet.';

  const handleOpenMenu = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  const handleRefresh = useCallback(() => {
    setIsPullRefreshing(true);
    void refetch().finally(() => setIsPullRefreshing(false));
  }, [refetch]);

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
    setNoteText('');
    setIsNoteOpen(false);
  }, [addEntry, noteText]);

  const renderActivityItem = useCallback(({ item }: { item: JournalActivityItem }) => (
    <View style={styles.timelineRow}>
      <View style={[styles.activityCard, toneStyles.cards[item.tone]]}>
        <View style={styles.activityTop}>
          <View style={styles.activityTitleBlock}>
            <Text style={styles.activityTitle}>{item.title}</Text>
            <View style={styles.activityMetaRow}>
              <Text style={styles.activityTime}>{formatTime(item.timestamp)}</Text>
              {item.symbol ? <Text style={styles.symbolBadge}>{item.symbol}</Text> : null}
            </View>
          </View>
          <View style={[styles.actionPill, toneStyles.pills[item.tone]]}>
            <Text style={[styles.actionPillText, toneStyles.labels[item.tone]]}>
              {getActivityBadgeLabel(item)}
            </Text>
          </View>
        </View>
        <View style={styles.detailGrid}>
          {item.details.map((detail) => (
            <View key={`${item.id}-${detail.label}`} style={styles.detailItem}>
              <Text style={styles.detailLabel}>{detail.label}</Text>
              <Text
                style={[
                  styles.detailValue,
                  detail.tone === 'profit' && styles.profitText,
                  detail.tone === 'loss' && styles.lossText,
                ]}
                numberOfLines={2}
              >
                {detail.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  ), [styles, toneStyles]);

  const renderActivitySectionHeader = useCallback(({ section }: { section: JournalActivitySection }) => (
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
          <Text style={styles.headerTitle}>Journal</Text>
          <Text style={styles.headerSub}>Today activity log</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, accountLogin ? styles.statusDotLive : styles.statusDotMuted]} />
          <Text style={styles.statusPillText}>{accountLogin ? 'Live' : 'Login'}</Text>
        </View>
      </View>

      <SectionList
        sections={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderActivityItem}
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
                  <Text style={styles.summaryTitle}>Session Summary</Text>
                  <Text style={styles.summarySub}>Today | {lastSyncLabel}</Text>
                </View>
                <View style={styles.summaryStatus}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={actionColor} />
                  <Text style={styles.summaryStatusText}>Audit</Text>
                </View>
              </View>

              <View style={styles.summaryMetrics}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Today's Trades</Text>
                  <Text style={styles.summaryValue}>{todayTrades}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Net P/L</Text>
                  <Text style={[styles.summaryValue, todayPnl < 0 ? styles.lossText : styles.profitText]}>
                    {formatMoney(todayPnl)}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Win/Loss</Text>
                  <Text style={styles.summaryValue}>{todayWins}W / {todayLosses}L</Text>
                </View>
              </View>
            </View>

            <View style={styles.activityToolbar}>
              <View>
                <Text style={styles.activityToolbarTitle}>Activity Feed</Text>
                <Text style={styles.activityToolbarSub}>{filteredItems.length} entries | clears at midnight</Text>
              </View>
              <Pressable
                style={styles.toolbarNoteButton}
                onPress={() => setIsNoteOpen(true)}
                latencyLabel="journal.toolbarNote"
              >
                <Ionicons name="create-outline" size={15} color={actionColor} />
                <Text style={styles.toolbarNoteText}>Note</Text>
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
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{item}</Text>
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
            <Text style={styles.emptySub}>Actions will appear here after trades are opened, modified, closed, or noted.</Text>
          </View>
        )}
        ListFooterComponent={(
          <Pressable
            style={[styles.addNoteButton, styles.addNoteButtonSecondary]}
            onPress={() => setIsNoteOpen(true)}
            latencyLabel="journal.addNote"
          >
            <Ionicons name="add-circle-outline" size={18} color={actionColor} />
            <Text style={styles.addNoteText}>Add Note</Text>
          </Pressable>
        )}
      />

      {isNoteOpen ? (
        <View style={styles.noteOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsNoteOpen(false)} latencyLabel="journal.noteOverlay" />
          <View style={[styles.noteSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.noteHeader}>
              <Text style={styles.noteTitle}>Add Note</Text>
              <Pressable onPress={() => setIsNoteOpen(false)} style={styles.noteClose} latencyLabel="journal.noteClose">
                <Ionicons name="close" size={20} color={T.text} />
              </Pressable>
            </View>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Write a short trading note..."
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
              <Text style={styles.saveNoteText}>Save Note</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Own drawer instance so the hamburger works on this pushed route — the
          (tabs) drawer is below this screen and would open invisibly. Matches
          AboutScreen / UserGuideScreen. */}
      {drawerReady ? <SidebarDrawer /> : null}
    </Screen>
  );
}
