/**
 * Settings Feature UI: MailboxScreen
 *
 * API-ready secure message center for trading, account, payment, risk,
 * support, prop-firm, and platform communication.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { Screen } from '../../ui/components/Screen';
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

const MAIL_CYAN = '#38BDF8';
const MAIL_BLUE = '#3B82F6';
const MAIL_GOLD = '#F5B942';
const MAIL_AMBER = '#F59E0B';
const MAIL_PURPLE = '#8B5CF6';
const MAIL_RED = '#EF4444';

type ConfirmationConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'warning' | 'danger';
  onConfirm: () => void;
};

export function MailboxScreen() {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeMailboxScreenStyles(T, isDark), [T, isDark]);
  const data = MAILBOX_PREVIEW_DATA;

  const [selectedCategory, setSelectedCategory] = useState(data.mailboxState.selected_category);
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState(data.mailboxState.selected_priority_filter);
  const [searchQuery, setSearchQuery] = useState(data.mailboxState.search_query);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>(data.uiActionState.selected_message_id);
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | undefined>();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationConfig | null>(null);

  const mailboxState = useMemo(
    () => deriveMailboxStateFromMessages(data.mailboxState, data.messages),
    [data.mailboxState, data.messages],
  );
  const categories = useMemo(
    () => selectMailboxCategories(data.categories, selectedCategory),
    [data.categories, selectedCategory],
  );
  const priorityFilters = useMemo(
    () => selectPriorityFilters(data.priorityFilters, selectedPriorityFilter),
    [data.priorityFilters, selectedPriorityFilter],
  );
  const messages = useMemo(
    () => filterMailboxMessages(data.messages, selectedCategory, selectedPriorityFilter, searchQuery),
    [data.messages, selectedCategory, selectedPriorityFilter, searchQuery],
  );
  const importantAnnouncement = useMemo(
    () => getImportantAnnouncement(data.importantAnnouncement, data.messages),
    [data.importantAnnouncement, data.messages],
  );
  const selectedMessage = useMemo(
    () => getSelectedMessage(data.messages, selectedMessageId),
    [data.messages, selectedMessageId],
  );
  const actionSheetMessage = useMemo(
    () => getSelectedMessage(data.messages, actionSheetMessageId),
    [data.messages, actionSheetMessageId],
  );

  const showLoading = mailboxState.loading_status === 'loading';
  const showError = mailboxState.loading_status === 'error';

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

  return (
    <Screen noBottomInset style={styles.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={getScreenGradient(isDark)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
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
        <MailboxHeader
          mailboxState={mailboxState}
          onOpenFilters={() => setFilterSheetOpen(true)}
          T={T}
          styles={styles}
        />

        {mailboxState.offline_status ? <OfflineState styles={styles} /> : null}

        {showLoading ? (
          <MailboxLoadingSkeleton styles={styles} />
        ) : showError ? (
          <MailboxErrorState title="Unable to load mailbox" description="Check your internet connection and try again." buttonLabel="Retry" styles={styles} />
        ) : (
          <>
            <MailboxSummaryStrip mailboxState={mailboxState} messages={data.messages} styles={styles} />
            <MailboxSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenFilters={() => setFilterSheetOpen(true)}
              T={T}
              styles={styles}
            />
            <MailboxCategoryTabs categories={categories} onSelect={setSelectedCategory} styles={styles} />
            <MailboxFilterChips filters={priorityFilters} onSelect={setSelectedPriorityFilter} T={T} styles={styles} />
            <ImportantAnnouncementCard announcement={importantAnnouncement} T={T} styles={styles} />
            <MessageList
              allMessagesCount={data.messages.length}
              messages={messages}
              onOpenMessage={setSelectedMessageId}
              onLongPressMessage={setActionSheetMessageId}
              onDeleteMessage={openDeleteConfirmation}
              T={T}
              styles={styles}
            />
            <SupportShortcutCard supportState={data.supportState} styles={styles} />
            <View style={styles.securityNote}>
              <Ionicons name="lock-closed-outline" size={15} color={T.textMuted} />
              <Text style={styles.securityNoteText}>
                Official account, payout, KYC, and risk messages will appear here. Never share passwords or OTPs with anyone.
              </Text>
            </View>
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
      <ConfirmationModal config={confirmation} onClose={() => setConfirmation(null)} styles={styles} />
    </Screen>
  );
}

function MailboxHeader({ mailboxState, onOpenFilters, T, styles }: {
  mailboxState: UserMailboxState;
  onOpenFilters: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.headerBlock}>
      <LinearGradient
        colors={['rgba(245,185,66,0.14)', 'rgba(56,189,248,0.08)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGlow}
      />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title} numberOfLines={1}>Mailbox</Text>
            {mailboxState.unread_messages > 0 ? (
              <Text style={styles.unreadCountText}>{mailboxState.unread_messages} unread</Text>
            ) : null}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>Secure trading account communications</Text>
        </View>

        <View style={styles.headerActions}>
          <HeaderIcon icon="search" T={T} styles={styles} />
          <HeaderIcon icon="options-outline" onPress={onOpenFilters} T={T} styles={styles} />
          <HeaderIcon icon="ellipsis-horizontal" T={T} styles={styles} />
        </View>
      </View>
    </View>
  );
}

function HeaderIcon({
  icon,
  onPress,
  T,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  return (
    <Pressable style={styles.headerIconButton} onPress={onPress} hitSlop={8}>
      <Ionicons name={icon} size={21} color={T.textSub} />
    </Pressable>
  );
}

function MailboxSummaryStrip({
  mailboxState,
  messages,
  styles,
}: {
  mailboxState: UserMailboxState;
  messages: readonly MailboxMessage[];
  styles: MailboxScreenStyles;
}) {
  const criticalCount = messages.filter((message) => message.priority === 'Critical').length;
  const metrics = [
    { id: 'unread', label: 'Unread', value: mailboxState.unread_messages, icon: 'mail-unread-outline' as const, color: MAIL_CYAN },
    { id: 'critical', label: 'Critical', value: criticalCount, icon: 'warning-outline' as const, color: MAIL_RED },
    { id: 'support', label: 'Support', value: mailboxState.support_replies, icon: 'chatbubbles-outline' as const, color: MAIL_PURPLE },
    { id: 'action', label: 'Action Needed', value: mailboxState.pending_action_messages, icon: 'flag-outline' as const, color: MAIL_AMBER },
  ];

  return (
    <View style={styles.summaryStrip}>
      {metrics.map((metric) => (
        <SummaryMetricCard key={metric.id} metric={metric} styles={styles} />
      ))}
    </View>
  );
}

function SummaryMetricCard({
  metric,
  styles,
}: {
  metric: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string };
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={[styles.summaryCard, { borderColor: withAlpha(metric.color, 0.14) }]}>
      <View style={[styles.summaryAccent, { backgroundColor: metric.color }]} />
      <View style={[styles.summaryIcon, { backgroundColor: withAlpha(metric.color, 0.12) }]}>
        <Ionicons name={metric.icon} size={16} color={metric.color} />
      </View>
      <Text style={styles.summaryValue}>{metric.value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={1}>{metric.label}</Text>
    </View>
  );
}

function MailboxSearchBar({
  searchQuery,
  onSearchChange,
  onOpenFilters,
  T,
  styles,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={17} color={T.textMuted} />
      <TextInput
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder="Search messages, tickets, orders..."
        placeholderTextColor={T.textMuted}
        style={styles.searchInput}
        selectionColor={MAIL_CYAN}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search mailbox messages"
      />
      {searchQuery.length > 0 ? (
        <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={T.textMuted} />
        </Pressable>
      ) : (
        <Pressable style={styles.searchShortcut} onPress={onOpenFilters} hitSlop={8}>
          <Ionicons name="funnel-outline" size={15} color={MAIL_GOLD} />
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
      {categories.map((category) => (
        <Pressable key={category.category_id} onPress={() => onSelect(category.category_id)} hitSlop={6}>
          {category.is_selected ? (
            <LinearGradient
              colors={[MAIL_CYAN, MAIL_BLUE]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.categoryPill, styles.categoryPillActive]}
            >
              <Text style={[styles.categoryText, styles.categoryTextActive]}>{category.category_name}</Text>
              {category.unread_count > 0 ? (
                <Text style={[styles.categoryCount, styles.categoryCountActive]}>{category.unread_count}</Text>
              ) : null}
            </LinearGradient>
          ) : (
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{category.category_name}</Text>
              {category.unread_count > 0 ? <Text style={styles.categoryCount}>{category.unread_count}</Text> : null}
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MailboxFilterChips({
  filters,
  onSelect,
  T,
  styles,
}: {
  filters: PriorityFilterItem[];
  onSelect: (filterId: string) => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.priorityRail}>
      {filters.map((filter) => {
        const color = getPriorityFilterColor(filter.filter_id, T);

        return (
          <Pressable
            key={filter.filter_id}
            style={[
              styles.priorityChip,
              filter.is_selected && { borderColor: color, backgroundColor: withAlpha(color, 0.14) },
            ]}
            onPress={() => onSelect(filter.filter_id)}
            hitSlop={6}
          >
            <Text style={[styles.priorityChipText, filter.is_selected && { color }]}>{filter.filter_name}</Text>
            <Text style={[styles.priorityChipCount, filter.is_selected && { color }]}>{filter.count}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ImportantAnnouncementCard({
  announcement,
  T,
  styles,
}: {
  announcement: ImportantAnnouncement | null;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  if (!announcement) return null;

  const priorityMeta = getPriorityMeta(announcement.priority, T);

  return (
    <LinearGradient
      colors={getAnnouncementGradient(announcement.priority)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.announcementCard, { borderColor: withAlpha(priorityMeta.color, 0.34) }]}
    >
      <View style={[styles.announcementAccent, { backgroundColor: priorityMeta.color }]} />
      <View style={styles.announcementHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIcon, { backgroundColor: withAlpha(priorityMeta.color, 0.14) }]}>
            <Ionicons name="warning-outline" size={17} color={priorityMeta.color} />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Important Updates</Text>
            <Text style={styles.sectionCaption}>{announcement.sender} / {formatShortTime(announcement.published_at)}</Text>
          </View>
        </View>
        {announcement.dismissible ? (
          <Pressable style={styles.iconActionButton} accessibilityLabel="Mark announcement as read">
            <Ionicons name="checkmark-done-outline" size={17} color={T.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.announcementTitle} numberOfLines={2}>{announcement.title}</Text>
      <Text style={styles.announcementSummary} numberOfLines={2}>{announcement.summary}</Text>

      <View style={styles.announcementFooter}>
        <PriorityBadge priority={announcement.priority} T={T} styles={styles} />
        <CategoryBadge category={announcement.category} T={T} styles={styles} />
      </View>

      {announcement.action_required && announcement.action_label ? (
        <View style={styles.announcementActions}>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{announcement.action_label}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton}>
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
  return (
    <View style={styles.sectionBlock}>
      <SectionHeader title="Messages" count={messages.length} styles={styles} />
      {messages.length ? (
        messages.map((message) => (
          <MailboxMessageCard
            key={message.message_id}
            message={message}
            onPress={() => onOpenMessage(message.message_id)}
            onLongPress={() => onLongPressMessage(message.message_id)}
            onDelete={() => onDeleteMessage(message)}
            T={T}
            styles={styles}
          />
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
          { borderLeftColor: priorityMeta.color },
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
            <Text style={styles.timestampText}>{formatShortTime(message.created_at)}</Text>
            <View style={styles.messageMetaIcons}>
              {message.attachments.length > 0 ? <Ionicons name="attach-outline" size={15} color={T.textMuted} /> : null}
              <Ionicons name="chevron-forward" size={17} color={T.textMuted} />
            </View>
          </View>
        </View>

        <View style={styles.messageTitleRow}>
          {unread ? <UnreadIndicator styles={styles} /> : null}
          <Text style={[styles.messageTitle, unread && styles.messageTitleUnread]} numberOfLines={2}>{message.title}</Text>
        </View>
        <Text style={styles.messagePreview} numberOfLines={2}>{message.preview}</Text>

        <View style={styles.messageFooter}>
          <CategoryBadge category={message.category} T={T} styles={styles} />
          <PriorityBadge priority={message.priority} T={T} styles={styles} />
          {message.action_required ? <StatusBadge label="Action Needed" color={MAIL_AMBER} styles={styles} /> : null}
        </View>
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
      <Ionicons name={getSenderIcon(senderType)} size={17} color={color} />
    </View>
  );
}

function UnreadIndicator({ styles }: { styles: MailboxScreenStyles }) {
  return <View style={styles.unreadDot} />;
}

function SupportShortcutCard({
  supportState,
  styles,
}: {
  supportState: SupportState;
  styles: MailboxScreenStyles;
}) {
  return (
    <LinearGradient
      colors={['rgba(49,46,129,0.82)', 'rgba(15,23,42,0.94)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.supportCard}
    >
      <View style={styles.supportTopRow}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIcon, { backgroundColor: 'rgba(139,92,246,0.16)' }]}>
            <Ionicons name="headset-outline" size={18} color="#C4B5FD" />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Need help?</Text>
            <Text style={styles.sectionCaption}>Open a support ticket or check existing replies.</Text>
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
  return (
    <Modal transparent visible={Boolean(message)} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.detailSheet}>
        {message ? (
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

            <View style={styles.detailBadgeRow}>
              <CategoryBadge category={message.category} T={T} styles={styles} />
              <PriorityBadge priority={message.priority} T={T} styles={styles} />
            </View>

            <Text style={styles.detailTitle}>{message.title}</Text>
            <Text style={styles.detailBody}>{message.full_body}</Text>

            {message.attachments.length > 0 ? (
              <View style={styles.attachmentPanel}>
                <Text style={styles.relatedInfoTitle}>Attachments</Text>
                {message.attachments.map((attachment) => (
                  <AttachmentCard key={attachment.attachment_id} attachment={attachment} styles={styles} />
                ))}
              </View>
            ) : null}

            <MessageActionButtons message={message} onDelete={() => onDelete(message)} styles={styles} />
          </>
        ) : null}
      </View>
    </Modal>
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
  return (
    <View style={styles.detailActions}>
      {message.action_required && message.action_label ? (
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{message.action_label}</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>{message.sender_type === 'Support' ? 'Reply' : 'Mark Read'}</Text>
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
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
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
  return (
    <Modal transparent visible={Boolean(message)} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.actionSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.filterTitle} numberOfLines={1}>{message?.title ?? 'Message Actions'}</Text>
        <ActionRow icon={message?.read_status === 'Unread' ? 'mail-open-outline' : 'mail-unread-outline'} label={message?.read_status === 'Unread' ? 'Mark as read' : 'Mark as unread'} onPress={onClose} T={T} styles={styles} />
        <ActionRow icon="pin-outline" label="Pin message" onPress={onClose} T={T} styles={styles} />
        <ActionRow icon="archive-outline" label="Archive" onPress={onClose} T={T} styles={styles} />
        {message ? (
          <ActionRow icon="trash-outline" label="Delete" destructive onPress={() => onDelete(message)} T={T} styles={styles} />
        ) : null}
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  destructive,
  onPress,
  T,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
  T: ThemeColors;
  styles: MailboxScreenStyles;
}) {
  const color = destructive ? MAIL_RED : T.textSub;

  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.actionRowText, destructive && styles.actionRowTextDanger]}>{label}</Text>
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
  return (
    <Modal transparent visible={Boolean(config)} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{config?.title}</Text>
          <Text style={styles.modalMessage}>{config?.message}</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelButton} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalConfirmButton, config?.tone === 'danger' ? styles.modalDangerButton : null]}
              onPress={config?.onConfirm}
            >
              <Text style={styles.modalConfirmText}>{config?.confirmLabel}</Text>
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
      <View style={styles.summaryStrip}>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.skeletonSummaryCard}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonLineWide} />
          </View>
        ))}
      </View>
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
      return { color: T.down };
    case 'Important':
      return { color: MAIL_AMBER };
    case 'Success':
      return { color: T.up };
    case 'Promotion':
      return { color: MAIL_GOLD };
    case 'Info':
    default:
      return { color: MAIL_CYAN };
  }
}

function getPriorityFilterColor(filterId: string, T: ThemeColors): string {
  if (filterId === 'critical') return T.down;
  if (filterId === 'attachments') return MAIL_PURPLE;
  if (filterId === 'unread') return MAIL_CYAN;
  if (filterId === 'action-needed') return MAIL_AMBER;
  return MAIL_GOLD;
}

function getCategoryColor(category: MessageCategory, T: ThemeColors): string {
  switch (category) {
    case 'Payments':
      return T.up;
    case 'Prop Firm':
    case 'Risk':
      return MAIL_AMBER;
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
      return T.up;
    case 'KYC':
      return MAIL_CYAN;
    case 'Risk':
    case 'Compliance':
    case 'Security':
      return MAIL_AMBER;
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
      return 'chatbubbles-outline';
    case 'Payments':
      return 'wallet-outline';
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
  return ['Admin', 'Broker', 'System', 'Risk', 'Payments', 'KYC', 'Compliance', 'Security'].includes(senderType);
}

function getAnnouncementGradient(priority: MessagePriority): readonly [string, string, string] {
  if (priority === 'Critical') return ['rgba(18,24,38,0.98)', 'rgba(15,23,42,0.98)', 'rgba(9,13,22,0.98)'];
  if (priority === 'Important') return ['rgba(24,28,40,0.98)', 'rgba(17,24,39,0.98)', 'rgba(9,13,22,0.98)'];
  if (priority === 'Success') return ['rgba(14,32,29,0.96)', 'rgba(15,23,42,0.98)', 'rgba(9,13,22,0.98)'];
  return ['rgba(15,35,53,0.96)', 'rgba(8,21,39,0.98)', 'rgba(15,23,42,0.96)'];
}

function getScreenGradient(isDark: boolean): readonly [string, string, string] {
  return isDark ? ['#070B12', '#101827', '#05070D'] : ['#F8FAFC', '#EEF4FF', '#FFFFFF'];
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
