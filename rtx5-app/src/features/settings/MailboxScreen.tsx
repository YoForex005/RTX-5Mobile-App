import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: MailboxScreen
 *
 * API-ready secure message center for trading, account, payment, risk,
 * support, prop-firm, and platform communication.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState, type ReactNode } from 'react';
import { Keyboard, Modal, RefreshControl, ScrollView, Text, TextInput, View, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { Screen } from '../../ui/components/Screen';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { makeMailboxScreenStyles, type MailboxScreenStyles } from './MailboxScreen.styles';
import {
  MAILBOX_PREVIEW_DATA,
  deriveMailboxStateFromMessages,
  filterMailboxMessages,
  getImportantAnnouncement,
  getSelectedMessage,
  selectMailboxCategories,
  selectPriorityFilters,
  type ImportantAnnouncement,
  type MailboxMessage,
  type MessageAttachment,
  type MessageCategory,
  type MessageCategoryItem,
  type MessagePriority,
  type PriorityFilterItem,
  type SenderType,
  type SupportState,
  type UserMailboxState,
} from './mailboxViewModel';
import { safeRouterBack } from '../../utils/navigation';

const MAIL_CYAN = '#2F9BFF';
const MAIL_BLUE = '#2F9BFF';
const MAIL_GOLD = '#F5B942';
const MAIL_AMBER = '#F59E0B';
const MAIL_PURPLE = '#7C3AED';
const MAIL_RED = '#EF4444';
const MAILBOX_SECONDARY_CONTENT_DELAY_MS = 320;

type ConfirmationConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'warning' | 'danger';
  onConfirm: () => void;
};

/**
 * In-app messaging center for receiving notifications, broker messages, and system alerts.
 */
export function MailboxScreen() {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeMailboxScreenStyles(T, isDark), [T, isDark]);
  const data = MAILBOX_PREVIEW_DATA;

  const [selectedCategory, setSelectedCategory] = useState(data.mailboxState.selected_category);
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState(data.mailboxState.selected_priority_filter);
  const [searchQuery, setSearchQuery] = useState(data.mailboxState.search_query);
  const [searchMode, setSearchMode] = useState(false);
  const [readMessageIds, setReadMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>(data.uiActionState.selected_message_id);
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | undefined>();
  const [riskDashboardMessageId, setRiskDashboardMessageId] = useState<string | undefined>();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [mailboxOptionsOpen, setMailboxOptionsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationConfig | null>(null);
  const secondaryContentReady = useDeferredRouteContentReady(MAILBOX_SECONDARY_CONTENT_DELAY_MS);

  const mailboxMessages = useMemo(
    () => data.messages.map((message) => (readMessageIds.has(message.message_id) ? { ...message, read_status: 'Read' as const } : message)),
    [data.messages, readMessageIds],
  );
  const categoryItems = useMemo(
    () => deriveCategoryItemsFromMessages(data.categories, mailboxMessages),
    [data.categories, mailboxMessages],
  );
  const mailboxState = useMemo(
    () => deriveMailboxStateFromMessages(data.mailboxState, mailboxMessages),
    [data.mailboxState, mailboxMessages],
  );
  const categories = useMemo(
    () => selectMailboxCategories(categoryItems, selectedCategory),
    [categoryItems, selectedCategory],
  );
  const priorityFilters = useMemo(
    () => selectPriorityFilters(data.priorityFilters, selectedPriorityFilter),
    [data.priorityFilters, selectedPriorityFilter],
  );
  const messages = useMemo(
    () => filterMailboxMessages(mailboxMessages, selectedCategory, selectedPriorityFilter, searchQuery),
    [mailboxMessages, selectedCategory, selectedPriorityFilter, searchQuery],
  );
  const renderedMessages = useMemo(
    () => (secondaryContentReady ? messages : messages.slice(0, 3)),
    [messages, secondaryContentReady],
  );
  const importantAnnouncement = useMemo(
    () => getImportantAnnouncement(data.importantAnnouncement, mailboxMessages),
    [data.importantAnnouncement, mailboxMessages],
  );
  const importantAnnouncementMessage = useMemo(
    () => getAnnouncementSourceMessage(importantAnnouncement, mailboxMessages),
    [importantAnnouncement, mailboxMessages],
  );
  const selectedMessage = useMemo(
    () => getSelectedMessage(mailboxMessages, selectedMessageId),
    [mailboxMessages, selectedMessageId],
  );
  const actionSheetMessage = useMemo(
    () => getSelectedMessage(mailboxMessages, actionSheetMessageId),
    [mailboxMessages, actionSheetMessageId],
  );
  const riskDashboardMessage = useMemo(
    () => getSelectedMessage(mailboxMessages, riskDashboardMessageId),
    [mailboxMessages, riskDashboardMessageId],
  );

  const showLoading = mailboxState.loading_status === 'loading';
  const showError = mailboxState.loading_status === 'error';
  // Search mode hides the centered title so the mailbox focuses on filtering.
  const searchActive = searchMode || searchQuery.trim().length > 0;
  const quickFilterCounts = useMemo(
    () => getQuickFilterCounts(mailboxState, mailboxMessages),
    [mailboxState, mailboxMessages],
  );

  const openDeleteConfirmation = (message: MailboxMessage) => {
    setActionSheetMessageId(undefined);
    setConfirmation({
      title: 'Delete Message',
      message: `Delete "${message.title}" from your mailbox? This action cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => setConfirmation(null),
    });
  };

  const refreshMailbox = () => {
    setMailboxOptionsOpen(false);
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const openMarkAllReadConfirmation = () => {
    setMailboxOptionsOpen(false);
    setConfirmation({
      title: 'Mark All as Read',
      message: 'Mark all official mailbox messages as read on this device?',
      confirmLabel: 'Mark Read',
      tone: 'warning',
      onConfirm: () => {
        setReadMessageIds(new Set(data.messages.map((message) => message.message_id)));
        setConfirmation(null);
      },
    });
  };

  const openSafetyNotice = () => {
    setMailboxOptionsOpen(false);
    setConfirmation({
      title: 'Official Message Safety',
      message: 'YoPips support will never ask for your password, OTP, seed phrase, or remote device access inside mailbox messages.',
      confirmLabel: 'Understood',
      tone: 'warning',
      onConfirm: () => setConfirmation(null),
    });
  };

  const openSuspiciousReportConfirmation = () => {
    setMailboxOptionsOpen(false);
    setConfirmation({
      title: 'Report Suspicious Message',
      message: 'Send this mailbox activity to the security team for review?',
      confirmLabel: 'Report',
      tone: 'warning',
      onConfirm: () => setConfirmation(null),
    });
  };

  const selectQuickFilter = (filterId: string) => {
    if (filterId === 'support') {
      setSelectedCategory('tickets');
      setSelectedPriorityFilter('last-7-days');
    } else {
      setSelectedCategory('all');
      setSelectedPriorityFilter(filterId);
    }
    setMailboxOptionsOpen(false);
  };

  const goBack = () => {
    safeRouterBack(router, '/(tabs)/settings');
  };

  const openAnnouncementMessage = () => {
    if (importantAnnouncementMessage) setSelectedMessageId(importantAnnouncementMessage.message_id);
  };

  const openRiskDashboardPreview = () => {
    if (importantAnnouncementMessage) setRiskDashboardMessageId(importantAnnouncementMessage.message_id);
  };

  const closeSearchModeIfEmpty = () => {
    if (searchQuery.trim().length === 0) setSearchMode(false);
  };

  const dismissSearchInput = () => {
    if (!searchActive) return;

    Keyboard.dismiss();
    closeSearchModeIfEmpty();
  };

  return (
    <Screen noBottomInset style={styles.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={getScreenGradient(isDark)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />

      <View style={[styles.fixedHeader, { paddingTop: insets.top + 12 }]}>
        {searchActive ? (
          <MailboxSearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchFocus={() => setSearchMode(true)}
            onSearchBlur={closeSearchModeIfEmpty}
            onOpenFilters={() => setFilterSheetOpen(true)}
            autoFocus
            T={T}
            styles={styles}
          />
        ) : (
          <MailboxHeader
            onBack={goBack}
            onOpenOptions={() => setMailboxOptionsOpen(true)}
            T={T}
            styles={styles}
          />
        )}
      </View>

      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 14, paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        onScrollBeginDrag={dismissSearchInput}
        onTouchStart={dismissSearchInput}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={MAIL_CYAN}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 500);
            }}
          />
        }
      >
        {mailboxState.offline_status ? <OfflineState styles={styles} /> : null}

        {showLoading ? (
          <MailboxLoadingSkeleton styles={styles} />
        ) : showError ? (
          <MailboxErrorState title="Unable to load mailbox" description="Check your internet connection and try again." buttonLabel="Retry" styles={styles} />
        ) : (
          <>
            {!searchActive ? (
              <MailboxSearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSearchFocus={() => setSearchMode(true)}
                onSearchBlur={() => undefined}
                onOpenFilters={() => setFilterSheetOpen(true)}
                T={T}
                styles={styles}
              />
            ) : null}
            <MailboxCategoryTabs categories={categories} onSelect={setSelectedCategory} styles={styles} />
            <ImportantAnnouncementCard
              announcement={importantAnnouncement}
              isDark={isDark}
              T={T}
              styles={styles}
              onPrimaryAction={openRiskDashboardPreview}
              onReadMore={openAnnouncementMessage}
            />
            <MessageList
              allMessagesCount={mailboxMessages.length}
              messages={renderedMessages}
              onOpenMessage={setSelectedMessageId}
              onLongPressMessage={setActionSheetMessageId}
              onDeleteMessage={openDeleteConfirmation}
              T={T}
              styles={styles}
            />
            {secondaryContentReady ? (
              <>
                <SupportShortcutCard supportState={data.supportState} isDark={isDark} styles={styles} />
                <View style={styles.securityNote}>
                  <Ionicons name="lock-closed-outline" size={15} color={T.textMuted} />
                  <Text style={styles.securityNoteText}>
                    Official account, payout, KYC, and risk messages appear here. Never share passwords or OTPs with support.
                  </Text>
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <MailboxDetailScreen
        message={selectedMessage}
        onClose={() => setSelectedMessageId(undefined)}
        onDelete={openDeleteConfirmation}
        T={T}
        styles={styles}
      />
      <RiskDashboardPreviewSheet
        message={riskDashboardMessage}
        onClose={() => setRiskDashboardMessageId(undefined)}
        onReadMore={() => {
          if (riskDashboardMessage) {
            setRiskDashboardMessageId(undefined);
            setSelectedMessageId(riskDashboardMessage.message_id);
          }
        }}
        T={T}
        styles={styles}
      />
      <MailboxFilterBottomSheet
        visible={filterSheetOpen}
        categories={categories}
        filters={priorityFilters}
        onSelectCategory={setSelectedCategory}
        onSelectFilter={setSelectedPriorityFilter}
        onClose={() => setFilterSheetOpen(false)}
        T={T}
        styles={styles}
      />
      <MailboxActionSheet
        message={actionSheetMessage}
        onClose={() => setActionSheetMessageId(undefined)}
        onDelete={openDeleteConfirmation}
        T={T}
        styles={styles}
      />
      <MailboxOptionsSheet
        visible={mailboxOptionsOpen}
        quickFilterCounts={quickFilterCounts}
        onClose={() => setMailboxOptionsOpen(false)}
        onSelectQuickFilter={selectQuickFilter}
        onMarkAllRead={openMarkAllReadConfirmation}
        onRefresh={refreshMailbox}
        onOpenArchived={() => setMailboxOptionsOpen(false)}
        onNotificationPreferences={() => setMailboxOptionsOpen(false)}
        onSafetyInfo={openSafetyNotice}
        onReportSuspicious={openSuspiciousReportConfirmation}
        T={T}
        styles={styles}
      />
      <ConfirmationModal config={confirmation} onClose={() => setConfirmation(null)} styles={styles} />
    </Screen>
  );
}

function MailboxHeader({ onBack, onOpenOptions, T, styles }: {
  onBack: () => void;
  onOpenOptions: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.headerBlock}>
      <View style={styles.header}>
        <HeaderIcon icon="arrow-back" onPress={onBack} accessibilityLabel="Go back" T={T} styles={styles} />

        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>Mailbox</Text>
        </View>

        <View style={styles.headerActions}>
          <HeaderIcon icon="ellipsis-horizontal" onPress={onOpenOptions} accessibilityLabel="Open mailbox options" T={T} styles={styles} />
        </View>
      </View>
    </View>
  );
}

type QuickFilterCounts = {
  unread: number;
  critical: number;
  support: number;
  actionNeeded: number;
};

function getQuickFilterCounts(
  mailboxState: UserMailboxState,
  messages: readonly MailboxMessage[],
): QuickFilterCounts {
  return {
    unread: mailboxState.unread_messages,
    critical: messages.filter((message) => message.priority === 'Critical').length,
    support: mailboxState.support_replies,
    actionNeeded: mailboxState.pending_action_messages,
  };
}

function getAnnouncementSourceMessage(
  announcement: ImportantAnnouncement | null,
  messages: readonly MailboxMessage[],
): MailboxMessage | null {
  if (!announcement) return null;

  return messages.find((message) => (
    message.title === announcement.title &&
    message.sender_name === announcement.sender &&
    message.created_at === announcement.published_at
  )) ?? null;
}

function HeaderIcon({
  icon,
  onPress,
  accessibilityLabel,
  T,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel?: string;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  return (
    <Pressable
      style={styles.headerIconButton}
      onPress={onPress}
      activateOnPressIn={Boolean(onPress)}
      activateOnTouchStart={Boolean(onPress)}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      unstable_pressDelay={0}
    >
      <Ionicons name={icon} size={19} color={T.textSub} />
    </Pressable>
  );
}

function deriveCategoryItemsFromMessages(
  categories: MessageCategoryItem[],
  messages: readonly MailboxMessage[],
): MessageCategoryItem[] {
  return categories.map((category) => {
    const categoryMessages = messages.filter((message) => matchesCategorySummary(message, category.category_id));

    return {
      ...category,
      total_count: categoryMessages.length,
      unread_count: categoryMessages.filter((message) => message.read_status === 'Unread').length,
    };
  });
}

function matchesCategorySummary(message: MailboxMessage, categoryId: string): boolean {
  switch (categoryId) {
    case 'all':
      return true;
    case 'alerts':
      return ['Risk', 'Security', 'Account', 'Prop Firm'].includes(message.category) || ['Risk', 'Security', 'Compliance'].includes(message.sender_type);
    case 'tickets':
      return message.category === 'Support' || Boolean(message.related_ticket_id);
    case 'broker':
      return message.category === 'Broker' || message.sender_type === 'Broker';
    case 'prop-firm':
      return message.category === 'Prop Firm';
    case 'security':
      return message.category === 'Security' || message.sender_type === 'Security';
    default:
      return normalizeCategoryId(message.category) === categoryId;
  }
}

function normalizeCategoryId(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-');
}

function MailboxSearchBar({
  searchQuery,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onOpenFilters,
  autoFocus,
  T,
  styles,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onOpenFilters: () => void;
  autoFocus?: boolean;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={17} color={T.textMuted} />
      <TextInput
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder="Search messages, tickets, payouts..."
        placeholderTextColor={T.textMuted}
        style={styles.searchInput}
        selectionColor={MAIL_CYAN}
        onFocus={onSearchFocus}
        onBlur={onSearchBlur}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search mailbox messages"
      />
      {searchQuery.length > 0 ? (
        <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={T.textMuted} />
        </Pressable>
      ) : (
        <Pressable
          style={styles.searchShortcut}
          onPress={onOpenFilters}
          activateOnPressIn
          activateOnTouchStart
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Ionicons name="options-outline" size={15} color={MAIL_BLUE} />
        </Pressable>
      )}
    </View>
  );
}

function MailboxCategoryTabs({
  categories,
  onSelect,
  styles,
}: {
  categories: MessageCategoryItem[];
  onSelect: (categoryId: string) => void;
  styles: MailboxScreenStyles;
}) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
      {categories.map((category) => (
        <Pressable key={category.category_id} onPress={() => onSelect(category.category_id)} hitSlop={6}>
          <View style={[styles.categoryPill, category.is_selected && styles.categoryPillActive]}>
            <Text style={[styles.categoryText, category.is_selected && styles.categoryTextActive]}>{category.category_name}</Text>
            {category.unread_count > 0 ? (
              <Text style={[styles.categoryCount, category.is_selected && styles.categoryCountActive]}>{category.unread_count}</Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ImportantAnnouncementCard({
  announcement,
  isDark,
  T,
  styles,
  onPrimaryAction,
  onReadMore,
}: {
  announcement: ImportantAnnouncement | null;
  isDark: boolean;
  T: ThemeColors;
  styles: MailboxScreenStyles;
  onPrimaryAction: () => void;
  onReadMore: () => void;
}) {
  if (!announcement) return null;

  const priorityMeta = getPriorityMeta(announcement.priority, T);

  return (
    <LinearGradient
      colors={getAnnouncementGradient(announcement.priority, isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.announcementCard, { borderColor: withAlpha(priorityMeta.color, 0.34), borderLeftColor: priorityMeta.color }]}
    >
      <View style={styles.announcementHeader}>
        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={styles.announcementSender}>{announcement.sender}</Text>
            <Text style={styles.announcementTime}>{formatShortTime(announcement.published_at)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.announcementTitle} numberOfLines={2}>{announcement.title}</Text>
      <Text style={styles.announcementSummary} numberOfLines={2}>{announcement.summary}</Text>

      {announcement.action_required && announcement.action_label ? (
        <View style={styles.announcementActions}>
          <Pressable style={styles.primaryButton} onPress={onPrimaryAction}>
            <Text style={styles.primaryButtonText}>{announcement.action_label}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onReadMore}>
            <Text style={styles.secondaryButtonText}>Read More</Text>
          </Pressable>
        </View>
      ) : null}
    </LinearGradient>
  );
}

function MessageList({
  allMessagesCount,
  messages,
  onOpenMessage,
  onLongPressMessage,
  onDeleteMessage,
  T,
  styles,
}: {
  allMessagesCount: number;
  messages: MailboxMessage[];
  onOpenMessage: (messageId: string) => void;
  onLongPressMessage: (messageId: string) => void;
  onDeleteMessage: (message: MailboxMessage) => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  const groupedMessages = groupMessagesByDate(messages);

  return (
    <View style={styles.sectionBlock}>
      <SectionHeader title="Messages" count={messages.length} styles={styles} />
      {messages.length ? (
        groupedMessages.map((group) => (
          <View key={group.label} style={styles.messageDateGroup}>
            <Text style={styles.dateGroupTitle}>{group.label}</Text>
            {group.messages.map((message) => (
              <MailboxMessageCard
                key={message.message_id}
                message={message}
                onPress={() => onOpenMessage(message.message_id)}
                onLongPress={() => onLongPressMessage(message.message_id)}
                onDelete={() => onDeleteMessage(message)}
                T={T}
                styles={styles}
              />
            ))}
          </View>
        ))
      ) : (
        <MailboxEmptyState
          title={allMessagesCount === 0 ? 'No messages yet' : 'No messages found for this filter'}
          subtitle={
            allMessagesCount === 0
              ? 'Important trading, payment, and account updates will appear here.'
              : 'Try changing category or priority.'
          }
          buttonLabel="Refresh"
          styles={styles}
        />
      )}
    </View>
  );
}

type MessageDateLabel = 'Today' | 'Yesterday' | 'Earlier';

function groupMessagesByDate(messages: MailboxMessage[]): Array<{ label: MessageDateLabel; messages: MailboxMessage[] }> {
  const groups: Record<MessageDateLabel, MailboxMessage[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };
  const now = startOfLocalDay(new Date());

  messages.forEach((message) => {
    const createdAt = new Date(message.created_at);
    if (Number.isNaN(createdAt.getTime())) {
      groups.Earlier.push(message);
      return;
    }

    const messageDay = startOfLocalDay(createdAt);
    const ageInDays = Math.floor((now.getTime() - messageDay.getTime()) / 86400000);

    if (ageInDays <= 0) groups.Today.push(message);
    else if (ageInDays === 1) groups.Yesterday.push(message);
    else groups.Earlier.push(message);
  });

  return (['Today', 'Yesterday', 'Earlier'] as const)
    .map((label) => ({ label, messages: groups[label] }))
    .filter((group) => group.messages.length > 0);
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function MailboxMessageCard({
  message,
  onPress,
  onLongPress,
  onDelete,
  T,
  styles,
}: {
  message: MailboxMessage;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  const priorityMeta = getPriorityMeta(message.priority, T);
  const senderColor = getSenderColor(message.sender_type, T);
  const unread = message.read_status === 'Unread';
  const showPriorityAccent = message.priority === 'Critical';

  return (
    <Swipeable
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <View style={styles.swipeLeftActions}>
          <SwipeAction icon={unread ? 'mail-open-outline' : 'mail-unread-outline'} label={unread ? 'Read' : 'Unread'} color={MAIL_CYAN} styles={styles} />
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.swipeRightActions}>
          <SwipeAction icon="archive-outline" label="Archive" color={MAIL_BLUE} styles={styles} />
          <SwipeAction icon="pin-outline" label="Pin" color={MAIL_GOLD} styles={styles} />
          <SwipeAction icon="trash-outline" label="Delete" color={MAIL_RED} onPress={onDelete} destructive styles={styles} />
        </View>
      )}
    >
      <Pressable
        style={[
          styles.messageCard,
          unread && styles.messageCardUnread,
          showPriorityAccent && styles.messageCardCritical,
          showPriorityAccent && { borderLeftColor: priorityMeta.color },
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? 'Unread' : 'Read'} message, ${message.title}`}
      >
        <View style={styles.messageTopRow}>
          <View style={styles.messageIdentity}>
            <SenderAvatar senderType={message.sender_type} color={senderColor} styles={styles} />
            <View style={styles.messageSenderBlock}>
              <View style={styles.messageMetaRow}>
                <Text style={styles.senderName} numberOfLines={1}>{message.sender_name}</Text>
                {isOfficialSender(message.sender_type) ? (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={10} color={MAIL_CYAN} />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <View style={styles.messageRightMeta}>
            <View style={styles.messageMetaIcons}>
              <Text style={styles.timestampText}>{formatShortTime(message.created_at)}</Text>
              {message.attachments.length > 0 ? <Ionicons name="attach-outline" size={15} color={T.textMuted} /> : null}
              <Ionicons name="chevron-forward" size={17} color={T.textMuted} />
            </View>
          </View>
        </View>

        <View style={styles.messageTitleRow}>
          <Text style={[styles.messageTitle, unread && styles.messageTitleUnread]} numberOfLines={2}>{message.title}</Text>
        </View>
        <Text style={styles.messagePreview} numberOfLines={2}>{message.preview}</Text>
      </Pressable>
    </Swipeable>
  );
}

function SwipeAction({
  icon,
  label,
  color,
  destructive,
  onPress,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  destructive?: boolean;
  onPress?: () => void;
  styles: MailboxScreenStyles;
}) {
  return (
    <Pressable
      style={[styles.swipeAction, destructive && styles.swipeActionDanger, { borderColor: withAlpha(color, 0.32) }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.swipeActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function PriorityBadge({ priority, T, styles }: { priority: MessagePriority; T: ThemeColors; styles: MailboxScreenStyles }) {
  return <StatusBadge label={priority} color={getPriorityMeta(priority, T).color} styles={styles} />;
}

function CategoryBadge({ category, T, styles }: { category: MessageCategory; T: ThemeColors; styles: MailboxScreenStyles }) {
  return <StatusBadge label={category} color={getCategoryColor(category, T)} styles={styles} />;
}

function SenderAvatar({
  senderType,
  color,
  styles,
}: {
  senderType: SenderType;
  color: string;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={[styles.messageIcon, { backgroundColor: withAlpha(color, 0.13), borderColor: withAlpha(color, 0.28) }]}>
      <Ionicons name={getSenderIcon(senderType)} size={18} color={color} />
    </View>
  );
}

function SupportShortcutCard({
  supportState,
  isDark,
  styles,
}: {
  supportState: SupportState;
  isDark: boolean;
  styles: MailboxScreenStyles;
}) {
  return (
    <LinearGradient
      colors={getSupportCardGradient(isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.supportCard}
    >
      <View style={styles.supportTopRow}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIcon, { backgroundColor: 'rgba(47,155,255,0.12)' }]}>
            <Ionicons name="headset-outline" size={18} color="#C4B5FD" />
          </View>
          <View>
            <Text style={styles.supportTitle}>Need help?</Text>
            <Text style={styles.supportCaption}>Open a support ticket or check existing replies.</Text>
          </View>
        </View>
      </View>

      <View style={styles.supportMetrics}>
        <View style={styles.supportMetricPill}>
          <Text style={styles.supportMetricLabel}>Open Tickets</Text>
          <Text style={styles.supportMetricValue}>{supportState.open_ticket_count}</Text>
        </View>
        <View style={styles.supportMetricPill}>
          <Text style={styles.supportMetricLabel}>Latest Reply</Text>
          <Text style={styles.supportMetricValue}>
            {supportState.latest_support_reply_time ? formatShortTime(supportState.latest_support_reply_time) : 'None'}
          </Text>
        </View>
      </View>

      <View style={styles.supportActions}>
        <Pressable style={[styles.primaryButton, !supportState.contact_support_enabled && styles.buttonDisabled]}>
          <Text style={styles.primaryButtonText}>Contact Support</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>View Tickets</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function MailboxDetailScreen({
  message,
  onClose,
  onDelete,
  T,
  styles,
}: {
  message: MailboxMessage | null;
  onClose: () => void;
  onDelete: (message: MailboxMessage) => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  const detailContext = message ? getDetailContextConfig(message, T) : null;

  if (!message) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.detailSheet}>
        <>
            <View style={styles.sheetHandle} />
            <View style={styles.detailHeader}>
              <Pressable style={styles.iconActionButton} onPress={onClose} accessibilityLabel="Back to mailbox">
                <Ionicons name="chevron-back" size={20} color={T.textSub} />
              </Pressable>
              <View style={styles.detailTitleBlock}>
                <View style={styles.detailSenderRow}>
                  <Text style={styles.detailMeta}>{message.sender_name}</Text>
                  {isOfficialSender(message.sender_type) ? (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="shield-checkmark" size={10} color={MAIL_CYAN} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.detailTime}>{formatLongTime(message.created_at)}</Text>
              </View>
              <Pressable style={styles.iconActionButton} onPress={onClose} accessibilityLabel="Close message detail">
                <Ionicons name="close" size={19} color={T.textSub} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              canCancelContentTouches={Platform.OS === 'ios'} showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
              {detailContext ? <DetailContextPanel config={detailContext} styles={styles} /> : null}
              {!detailContext ? <MessageDetailMetaPanel message={message} T={T} styles={styles} /> : null}

              <Text style={styles.detailTitle}>{message.title}</Text>
              <Text style={styles.detailBody}>{message.full_body}</Text>

              <RelatedMessageInfo message={message} styles={styles} />

              {message.attachments.length > 0 ? (
                <View style={styles.attachmentPanel}>
                  <Text style={styles.relatedInfoTitle}>Attachments</Text>
                  {message.attachments.map((attachment) => (
                    <AttachmentCard key={attachment.attachment_id} attachment={attachment} styles={styles} />
                  ))}
                </View>
              ) : null}

              {detailContext ? <MessageDetailMetaPanel message={message} T={T} styles={styles} trailing /> : null}

              <MessageActionButtons message={message} onDelete={() => onDelete(message)} styles={styles} />
            </ScrollView>
        </>
      </View>
    </Modal>
  );
}

function RiskDashboardPreviewSheet({
  message,
  onClose,
  onReadMore,
  T,
  styles,
}: {
  message: MailboxMessage | null;
  onClose: () => void;
  onReadMore: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  if (!message) {
    return null;
  }

  const rows = [
    { label: 'Account', value: message.related_account_id ?? 'Protected' },
    { label: 'Challenge', value: message.related_challenge_id ?? 'Prop Firm' },
    { label: 'Rule Set', value: message.category },
    { label: 'Priority', value: message.priority },
    { label: 'Status', value: message.status },
    { label: 'Alert Time', value: formatShortTime(message.created_at) },
  ];

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.riskSheet}>
        <>
            <View style={styles.sheetHandle} />
            <View style={styles.riskSheetHeader}>
              <View style={[styles.detailContextIcon, { backgroundColor: withAlpha(MAIL_RED, 0.1), borderColor: withAlpha(MAIL_RED, 0.24) }]}>
                <Ionicons name="speedometer-outline" size={18} color={MAIL_RED} />
              </View>
              <View style={styles.detailContextCopy}>
                <Text style={styles.riskSheetTitle}>Risk Dashboard</Text>
                <Text style={styles.riskSheetSubtitle}>Daily loss limit monitor</Text>
              </View>
              <Pressable style={styles.iconActionButton} onPress={onClose} accessibilityLabel="Close risk dashboard preview">
                <Ionicons name="close" size={19} color={T.textSub} />
              </Pressable>
            </View>

            <View style={styles.riskAlertPanel}>
              <Text style={styles.riskAlertLabel}>Official Risk Alert</Text>
              <Text style={styles.riskAlertTitle}>{message.title}</Text>
              <Text style={styles.riskAlertBody}>{message.preview}</Text>
            </View>

            <View style={styles.riskMetricGrid}>
              {rows.map((row) => (
                <View key={row.label} style={styles.riskMetricItem}>
                  <Text style={styles.detailContextMetricLabel}>{row.label}</Text>
                  <Text style={styles.detailContextMetricValue} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.riskGuidance}>
              <Ionicons name="shield-checkmark-outline" size={17} color={MAIL_AMBER} />
              <Text style={styles.riskGuidanceText}>
                Review open positions, reduce exposure if needed, and avoid placing additional trades until your loss buffer is comfortable.
              </Text>
            </View>

            <View style={styles.detailSecondaryActions}>
              <Pressable style={styles.secondaryButton} onPress={onReadMore}>
                <Text style={styles.secondaryButtonText}>Read Full Message</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={onClose}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            </View>
        </>
      </View>
    </Modal>
  );
}

type DetailContextConfig = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  statusLabel: string;
  metrics: Array<{ label: string; value: string }>;
};

function DetailContextPanel({
  config,
  styles,
}: {
  config: DetailContextConfig;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={[styles.detailContextPanel, { borderLeftColor: config.color }]}>
      <View style={styles.detailContextHeader}>
        <View style={styles.detailContextIdentity}>
          <View
            style={[
              styles.detailContextIcon,
              { backgroundColor: withAlpha(config.color, 0.1), borderColor: withAlpha(config.color, 0.22) },
            ]}
          >
            <Ionicons name={config.icon} size={18} color={config.color} />
          </View>
          <View style={styles.detailContextCopy}>
            <Text style={styles.detailContextTitle} numberOfLines={1}>{config.title}</Text>
            <Text style={styles.detailContextSubtitle} numberOfLines={1}>{config.subtitle}</Text>
          </View>
        </View>
        <View
          style={[
            styles.detailContextStatusPill,
            { backgroundColor: withAlpha(config.color, 0.1), borderColor: withAlpha(config.color, 0.28) },
          ]}
        >
          <Text style={[styles.detailContextStatusText, { color: config.color }]} numberOfLines={1}>{config.statusLabel}</Text>
        </View>
      </View>

      <View style={styles.detailContextGrid}>
        {config.metrics.map((metric) => (
          <View key={metric.label} style={styles.detailContextMetric}>
            <Text style={styles.detailContextMetricLabel}>{metric.label}</Text>
            <Text style={styles.detailContextMetricValue} numberOfLines={1}>{metric.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MessageDetailMetaPanel({
  message,
  T,
  styles,
  trailing,
}: {
  message: MailboxMessage;
  T: ThemeColors;
  styles: MailboxScreenStyles;
  trailing?: boolean;
}) {
  return (
    <View style={[styles.detailMetaPanel, trailing && styles.detailMetaPanelTrailing]}>
      <Text style={styles.detailMetaTitle}>Message Details</Text>
      <View style={styles.detailBadgeRow}>
        <CategoryBadge category={message.category} T={T} styles={styles} />
        <PriorityBadge priority={message.priority} T={T} styles={styles} />
        {message.action_required ? <StatusBadge label="Action Needed" color={MAIL_AMBER} styles={styles} /> : null}
        <StatusBadge label={message.status} color={getMessageStatusColor(message.status, T)} styles={styles} />
      </View>
    </View>
  );
}

function RelatedMessageInfo({
  message,
  styles,
}: {
  message: MailboxMessage;
  styles: MailboxScreenStyles;
}) {
  const rows = [
    { label: 'Account', value: message.related_account_id },
    { label: 'Ticket', value: message.related_ticket_id },
    { label: 'Challenge', value: message.related_challenge_id },
    { label: 'Order', value: message.related_order_id },
    { label: 'Symbol', value: message.related_symbol },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  if (!rows.length) return null;

  return (
    <View style={styles.relatedInfoPanel}>
      <Text style={styles.relatedInfoTitle}>Related Context</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.relatedInfoRow}>
          <Text style={styles.relatedInfoLabel}>{row.label}</Text>
          <Text style={styles.relatedInfoValue} numberOfLines={1}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function AttachmentCard({ attachment, styles }: { attachment: MessageAttachment; styles: MailboxScreenStyles }) {
  return (
    <View style={styles.attachmentRow}>
      <Ionicons name="document-attach-outline" size={17} color={MAIL_CYAN} />
      <View style={styles.attachmentCopy}>
        <Text style={styles.attachmentName} numberOfLines={1}>{attachment.file_name}</Text>
        <Text style={styles.attachmentMeta}>{attachment.file_type} / {attachment.file_size}</Text>
      </View>
      <Ionicons name="download-outline" size={16} color={MAIL_CYAN} />
    </View>
  );
}

function MessageActionButtons({
  message,
  onDelete,
  styles,
}: {
  message: MailboxMessage;
  onDelete: () => void;
  styles: MailboxScreenStyles;
}) {
  const isSupport = isSupportMessage(message);

  if (isSupport) {
    return (
      <View style={styles.detailActionStack}>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Reply to Support</Text>
        </Pressable>
        <View style={styles.detailSecondaryActions}>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>View Ticket</Text>
          </Pressable>
          <Pressable style={styles.dangerButton} onPress={onDelete}>
            <Text style={styles.dangerButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (message.action_required && message.action_label) {
    return (
      <View style={styles.detailActionStack}>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{message.action_label}</Text>
        </Pressable>
        <View style={styles.detailSecondaryActions}>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Mark Read</Text>
          </Pressable>
          <Pressable style={styles.dangerButton} onPress={onDelete}>
            <Text style={styles.dangerButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.detailActions}>
      <Pressable style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Mark Read</Text>
      </Pressable>
      <Pressable style={styles.dangerButton} onPress={onDelete}>
        <Text style={styles.dangerButtonText}>Delete</Text>
      </Pressable>
    </View>
  );
}

function MailboxFilterBottomSheet({
  visible,
  categories,
  filters,
  onSelectCategory,
  onSelectFilter,
  onClose,
  T,
  styles,
}: {
  visible: boolean;
  categories: MessageCategoryItem[];
  filters: PriorityFilterItem[];
  onSelectCategory: (categoryId: string) => void;
  onSelectFilter: (filterId: string) => void;
  onClose: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.filterSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.filterHeader}>
          <Text style={styles.filterTitle}>Filter Mailbox</Text>
          <Pressable style={styles.iconActionButton} onPress={onClose}>
            <Ionicons name="close" size={19} color={T.textSub} />
          </Pressable>
        </View>

        <FilterSection title="Message Status" styles={styles}>
          <FilterOption label="All" selected={filters.some((filter) => filter.filter_id === 'last-7-days' && filter.is_selected)} onPress={() => onSelectFilter('last-7-days')} styles={styles} />
          <FilterOption label="Unread" selected={filters.some((filter) => filter.filter_id === 'unread' && filter.is_selected)} onPress={() => onSelectFilter('unread')} styles={styles} />
          <FilterOption label="Pinned" selected={false} onPress={() => undefined} styles={styles} />
        </FilterSection>

        <FilterSection title="Category" styles={styles}>
          {categories.map((category) => (
            <FilterOption
              key={category.category_id}
              label={category.category_name}
              selected={category.is_selected}
              onPress={() => onSelectCategory(category.category_id)}
              styles={styles}
            />
          ))}
        </FilterSection>

        <FilterSection title="Priority" styles={styles}>
          {filters.map((filter) => (
            <FilterOption
              key={filter.filter_id}
              label={filter.filter_name}
              selected={filter.is_selected}
              onPress={() => onSelectFilter(filter.filter_id)}
              styles={styles}
            />
          ))}
        </FilterSection>

        <View style={styles.filterFooter}>
          <Pressable
            style={styles.modalCancelButton}
            onPress={() => {
              onSelectCategory('all');
              onSelectFilter('last-7-days');
            }}
          >
            <Text style={styles.modalCancelText}>Reset</Text>
          </Pressable>
          <Pressable style={styles.modalConfirmButton} onPress={onClose}>
            <Text style={styles.modalConfirmText}>Apply Filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({
  title,
  children,
  styles,
}: {
  title: string;
  children: ReactNode;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionTitle}>{title}</Text>
      <View style={styles.filterOptions}>{children}</View>
    </View>
  );
}

function FilterOption({
  label,
  selected,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: MailboxScreenStyles;
}) {
  return (
    <Pressable style={[styles.filterOption, selected && styles.filterOptionActive]} onPress={onPress}>
      <Text style={[styles.filterOptionText, selected && styles.filterOptionTextActive]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={14} color="#07111F" /> : null}
    </Pressable>
  );
}

function MailboxOptionsSheet({
  visible,
  quickFilterCounts,
  onClose,
  onSelectQuickFilter,
  onMarkAllRead,
  onRefresh,
  onOpenArchived,
  onNotificationPreferences,
  onSafetyInfo,
  onReportSuspicious,
  T,
  styles,
}: {
  visible: boolean;
  quickFilterCounts: QuickFilterCounts;
  onClose: () => void;
  onSelectQuickFilter: (filterId: string) => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
  onOpenArchived: () => void;
  onNotificationPreferences: () => void;
  onSafetyInfo: () => void;
  onReportSuspicious: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.actionSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.filterTitle}>Mailbox Options</Text>
        <Text style={styles.optionsSubtitle}>Manage official account messages and security actions.</Text>

        <Text style={styles.optionsSectionTitle}>Quick filters</Text>
        <ActionRow icon="mail-unread-outline" label="Unread" count={quickFilterCounts.unread} accentColor={MAIL_CYAN} onPress={() => onSelectQuickFilter('unread')} T={T} styles={styles} />
        <ActionRow icon="warning-outline" label="Critical" count={quickFilterCounts.critical} accentColor={MAIL_RED} onPress={() => onSelectQuickFilter('critical')} T={T} styles={styles} />
        <ActionRow icon="headset-outline" label="Support" count={quickFilterCounts.support} accentColor={MAIL_PURPLE} onPress={() => onSelectQuickFilter('support')} T={T} styles={styles} />
        <ActionRow icon="flag-outline" label="Action Needed" count={quickFilterCounts.actionNeeded} accentColor={MAIL_AMBER} onPress={() => onSelectQuickFilter('action-needed')} T={T} styles={styles} />

        <View style={styles.optionsDivider} />
        <Text style={styles.optionsSectionTitle}>Mailbox actions</Text>
        <ActionRow icon="checkmark-done-outline" label="Mark all as read" onPress={onMarkAllRead} T={T} styles={styles} />
        <ActionRow icon="refresh-outline" label="Refresh mailbox" onPress={onRefresh} T={T} styles={styles} />
        <ActionRow icon="archive-outline" label="View archived messages" onPress={onOpenArchived} T={T} styles={styles} />
        <ActionRow icon="notifications-outline" label="Notification preferences" onPress={onNotificationPreferences} T={T} styles={styles} />

        <View style={styles.optionsDivider} />
        <ActionRow icon="shield-checkmark-outline" label="Official message safety" onPress={onSafetyInfo} T={T} styles={styles} />
        <ActionRow icon="flag-outline" label="Report suspicious message" destructive onPress={onReportSuspicious} T={T} styles={styles} />
      </View>
    </Modal>
  );
}

function MailboxActionSheet({
  message,
  onClose,
  onDelete,
  T,
  styles,
}: {
  message: MailboxMessage | null;
  onClose: () => void;
  onDelete: (message: MailboxMessage) => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  if (!message) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.actionSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.filterTitle} numberOfLines={1}>{message.title}</Text>
        <ActionRow icon={message.read_status === 'Unread' ? 'mail-open-outline' : 'mail-unread-outline'} label={message.read_status === 'Unread' ? 'Mark as read' : 'Mark as unread'} onPress={onClose} T={T} styles={styles} />
        <ActionRow icon="pin-outline" label="Pin message" onPress={onClose} T={T} styles={styles} />
        <ActionRow icon="archive-outline" label="Archive" onPress={onClose} T={T} styles={styles} />
        <ActionRow icon="trash-outline" label="Delete" destructive onPress={() => onDelete(message)} T={T} styles={styles} />
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  count,
  accentColor,
  destructive,
  onPress,
  T,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count?: number;
  accentColor?: string;
  destructive?: boolean;
  onPress: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  const color = destructive ? MAIL_RED : accentColor ?? T.textSub;

  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.actionRowText, destructive && styles.actionRowTextDanger]}>{label}</Text>
      {typeof count === 'number' ? (
        <Text style={[styles.actionRowCount, { color }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

function ConfirmationModal({
  config,
  onClose,
  styles,
}: {
  config: ConfirmationConfig | null;
  onClose: () => void;
  styles: MailboxScreenStyles;
}) {
  if (!config) {
    return null;
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{config.title}</Text>
          <Text style={styles.modalMessage}>{config.message}</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelButton} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalConfirmButton, config.tone === 'danger' ? styles.modalDangerButton : null]}
              onPress={config.onConfirm}
            >
              <Text style={styles.modalConfirmText}>{config.confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SectionHeader({
  title,
  count,
  styles,
}: {
  title: string;
  count?: number;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {typeof count === 'number' ? <Text style={styles.sectionCount}>{count}</Text> : null}
    </View>
  );
}

function StatusBadge({ label, color, styles }: { label: string; color: string; styles: MailboxScreenStyles }) {
  return (
    <View style={[styles.statusBadge, { borderColor: color, backgroundColor: withAlpha(color, 0.12) }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function OfflineState({ styles }: { styles: MailboxScreenStyles }) {
  return (
    <View style={styles.stateBanner}>
      <Ionicons name="cloud-offline-outline" size={18} color={MAIL_CYAN} />
      <Text style={styles.stateBannerText}>You are offline. Showing last synced messages.</Text>
    </View>
  );
}

function MailboxErrorState({
  title,
  description,
  buttonLabel,
  styles,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.errorState}>
      <Ionicons name="warning-outline" size={24} color={MAIL_AMBER} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{description}</Text>
      <Pressable style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

function MailboxEmptyState({
  title,
  subtitle,
  buttonLabel,
  styles,
}: {
  title: string;
  subtitle: string;
  buttonLabel: string;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="file-tray-outline" size={24} color="#64748B" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      <Pressable style={styles.emptyButton}>
        <Text style={styles.secondaryButtonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

function MailboxLoadingSkeleton({ styles }: { styles: MailboxScreenStyles }) {
  return (
    <View style={styles.skeletonStack}>
      {[0, 1, 2, 3, 4].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonGrid}>
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLine} />
          </View>
          <View style={styles.skeletonLineShort} />
        </View>
      ))}
    </View>
  );
}

function getPriorityMeta(priority: MessagePriority, T: ThemeColors): { color: string } {
  switch (priority) {
    case 'Critical':
      return { color: MAIL_RED };
    case 'Important':
      return { color: MAIL_AMBER };
    case 'Success':
      return { color: '#22C55E' };
    case 'Promotion':
      return { color: MAIL_GOLD };
    case 'Info':
    default:
      return { color: MAIL_CYAN };
  }
}

function getMessageStatusColor(status: MailboxMessage['status'], T: ThemeColors): string {
  switch (status) {
    case 'Open':
      return MAIL_BLUE;
    case 'Pending':
      return MAIL_AMBER;
    case 'Resolved':
      return '#22C55E';
    case 'Archived':
    default:
      return T.textMuted;
  }
}

function getCategoryColor(category: MessageCategory, T: ThemeColors): string {
  switch (category) {
    case 'Payments':
      return '#22C55E';
    case 'Prop Firm':
      return MAIL_PURPLE;
    case 'Risk':
      return MAIL_RED;
    case 'Support':
      return MAIL_PURPLE;
    case 'Promotions':
      return MAIL_GOLD;
    case 'Account':
    case 'KYC':
    case 'Security':
      return MAIL_CYAN;
    case 'Broker':
      return MAIL_BLUE;
    case 'Trading':
    case 'System':
    default:
      return T.textSub;
  }
}

function getSenderColor(senderType: SenderType, T: ThemeColors): string {
  switch (senderType) {
    case 'Support':
      return MAIL_PURPLE;
    case 'Payments':
      return '#22C55E';
    case 'KYC':
      return MAIL_BLUE;
    case 'Risk':
      return MAIL_RED;
    case 'Compliance':
    case 'Security':
      return MAIL_CYAN;
    case 'Admin':
    case 'Broker':
    case 'Promotions':
      return MAIL_GOLD;
    case 'System':
    default:
      return T.textSub;
  }
}

function getSenderIcon(senderType: SenderType): keyof typeof Ionicons.glyphMap {
  switch (senderType) {
    case 'Support':
      return 'headset-outline';
    case 'Payments':
      return 'receipt-outline';
    case 'KYC':
      return 'id-card-outline';
    case 'Risk':
      return 'warning-outline';
    case 'Compliance':
    case 'Security':
      return 'shield-checkmark-outline';
    case 'Admin':
      return 'megaphone-outline';
    case 'Broker':
      return 'business-outline';
    case 'Promotions':
      return 'pricetag-outline';
    case 'System':
    default:
      return 'settings-outline';
  }
}

function isOfficialSender(senderType: SenderType): boolean {
  return ['Admin', 'Support', 'Broker', 'System', 'Risk', 'Payments', 'KYC', 'Compliance', 'Security'].includes(senderType);
}

// Detects support-ticket messages so the detail sheet can show secure ticket context.
function isSupportMessage(message: MailboxMessage): boolean {
  return message.sender_type === 'Support' || message.category === 'Support' || Boolean(message.related_ticket_id);
}

function getDetailContextConfig(message: MailboxMessage, T: ThemeColors): DetailContextConfig | null {
  if (isSupportMessage(message)) {
    return {
      title: 'Support Ticket',
      subtitle: 'Secure support conversation',
      icon: 'headset-outline',
      color: MAIL_PURPLE,
      statusLabel: message.status,
      metrics: [
        { label: 'Ticket ID', value: message.related_ticket_id ?? 'Not assigned' },
        { label: 'Latest Reply', value: formatShortTime(message.updated_at) },
        { label: 'Attachments', value: message.attachments.length ? `${message.attachments.length}` : 'None' },
      ],
    };
  }

  if (isKycMessage(message)) {
    return {
      title: 'KYC Verification Review',
      subtitle: 'Secure identity document workflow',
      icon: 'id-card-outline',
      color: MAIL_AMBER,
      statusLabel: message.action_required ? 'Action Needed' : message.status,
      metrics: [
        { label: 'Required Step', value: message.action_label ?? 'Review' },
        { label: 'Queue', value: 'Identity Check' },
        { label: 'Received', value: formatShortTime(message.created_at) },
      ],
    };
  }

  if (isSecurityMessage(message)) {
    return {
      title: 'Account Security Notice',
      subtitle: 'Verified platform security message',
      icon: 'shield-checkmark-outline',
      color: MAIL_CYAN,
      statusLabel: message.status,
      metrics: [
        { label: 'Account', value: message.related_account_id ?? 'Protected' },
        { label: 'Priority', value: message.priority },
        { label: 'Received', value: formatShortTime(message.created_at) },
      ],
    };
  }

  if (isYoPipsMessage(message)) {
    return {
      title: 'YoPips Platform Update',
      subtitle: 'Official prop firm account message',
      icon: 'trophy-outline',
      color: message.priority === 'Success' ? '#22C55E' : getMessageStatusColor(message.status, T),
      statusLabel: message.status,
      metrics: [
        { label: 'Challenge', value: message.related_challenge_id ?? 'Prop Firm' },
        { label: 'Outcome', value: message.priority === 'Success' ? 'Passed' : message.priority },
        { label: 'Received', value: formatShortTime(message.created_at) },
      ],
    };
  }

  return null;
}

function isYoPipsMessage(message: MailboxMessage): boolean {
  return message.sender_name === 'YoPips' || message.sender_type === 'Broker' || message.category === 'Prop Firm';
}

function isSecurityMessage(message: MailboxMessage): boolean {
  return message.sender_type === 'Security' || message.category === 'Security';
}

function isKycMessage(message: MailboxMessage): boolean {
  return message.sender_type === 'KYC' || message.category === 'KYC';
}

function getAnnouncementGradient(priority: MessagePriority, isDark: boolean): readonly [string, string, string] {
  if (!isDark) {
    if (priority === 'Critical') return ['#FFFFFF', '#FFF7F7', '#F8FAFC'];
    if (priority === 'Important') return ['#FFFFFF', '#FFF8ED', '#F8FAFC'];
    if (priority === 'Success') return ['#FFFFFF', '#F0FDF4', '#F8FAFC'];
    return ['#FFFFFF', '#F3F8FF', '#F8FAFC'];
  }

  if (priority === 'Critical') return ['rgba(18,24,38,0.98)', 'rgba(15,23,42,0.98)', 'rgba(9,13,22,0.98)'];
  if (priority === 'Important') return ['rgba(24,28,40,0.98)', 'rgba(17,24,39,0.98)', 'rgba(9,13,22,0.98)'];
  if (priority === 'Success') return ['rgba(14,32,29,0.96)', 'rgba(15,23,42,0.98)', 'rgba(9,13,22,0.98)'];
  return ['rgba(15,35,53,0.96)', 'rgba(8,21,39,0.98)', 'rgba(15,23,42,0.96)'];
}

function getSupportCardGradient(isDark: boolean): readonly [string, string] {
  return isDark ? ['#1E1E1E', '#1E1E1E'] : ['#FFFFFF', '#F3F7FF'];
}

function getScreenGradient(isDark: boolean): readonly [string, string, string] {
  return isDark ? ['#121212', '#121212', '#121212'] : ['#F2F4F8', '#F2F4F8', '#F2F4F8'];
}

function formatShortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatLongTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const red = parseInt(color.slice(1, 3), 16);
    const green = parseInt(color.slice(3, 5), 16);
    const blue = parseInt(color.slice(5, 7), 16);

    return `rgba(${red},${green},${blue},${alpha})`;
  }

  return color;
}
