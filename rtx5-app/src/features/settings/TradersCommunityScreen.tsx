/**
 * Settings Feature UI: TradersCommunityScreen
 *
 * Premium educational trader-community surface with market sentiment,
 * verified contributors, live rooms, idea feed, and compliance framing.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { makeTradersCommunityStyles, type TradersCommunityStyles } from './TradersCommunityScreen.styles';
import {
  COMMUNITY_FILTERS,
  COMMUNITY_POSTS,
  EDUCATION_DISCLOSURE,
  FEATURED_TRADERS,
  LIVE_TRADING_ROOMS,
  MARKET_POLL,
  MARKET_SENTIMENTS,
  filterCommunityPosts,
  type CommunityFilter,
  type CommunityPost,
  type FeaturedTrader,
  type MarketPollOption,
  type MarketSentiment,
  type MarketSentimentItem,
  type PollTone,
  type TradingRoom,
} from './tradersCommunityViewModel';

const CHART_CANDLES = [
  { body: 20, wick: 42, up: true },
  { body: 28, wick: 56, up: true },
  { body: 22, wick: 48, up: false },
  { body: 34, wick: 64, up: false },
  { body: 18, wick: 42, up: true },
  { body: 30, wick: 58, up: false },
  { body: 24, wick: 50, up: true },
  { body: 40, wick: 70, up: true },
  { body: 26, wick: 54, up: false },
  { body: 32, wick: 62, up: true },
  { body: 20, wick: 46, up: true },
  { body: 36, wick: 68, up: true },
];

export function TradersCommunityScreen() {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeTradersCommunityStyles(T, isDark), [T, isDark]);
  const [selectedFilter, setSelectedFilter] = useState<CommunityFilter>('All');

  const visiblePosts = useMemo(
    () => filterCommunityPosts(COMMUNITY_POSTS, selectedFilter, ''),
    [selectedFilter],
  );

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
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <CommunityHeader T={T} styles={styles} />

        <MarketSentimentCard sentiments={MARKET_SENTIMENTS} T={T} isDark={isDark} styles={styles} />

        <CategoryTabs
          filters={COMMUNITY_FILTERS}
          selectedFilter={selectedFilter}
          onSelect={setSelectedFilter}
          isDark={isDark}
          styles={styles}
        />

        <SectionHeader title="Featured Traders" styles={styles} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalRail}
        >
          {FEATURED_TRADERS.map((trader) => (
            <FeaturedTraderCard key={trader.id} trader={trader} isDark={isDark} styles={styles} />
          ))}
        </ScrollView>

        <SectionHeader title="Live Trading Rooms" styles={styles} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalRail}
        >
          {LIVE_TRADING_ROOMS.map((room) => (
            <TradingRoomCard key={room.id} room={room} T={T} isDark={isDark} styles={styles} />
          ))}
        </ScrollView>

        <View style={styles.feedPollGrid}>
          <View style={styles.feedColumn}>
            <SectionHeader title="Community Feed" styles={styles} />
            {visiblePosts.map((post) => (
              <CommunityPostCard key={post.id} post={post} T={T} isDark={isDark} styles={styles} />
            ))}
          </View>

          <View style={styles.pollColumn}>
            <SectionHeader title="Market Poll" styles={styles} />
            <MarketPollCard T={T} isDark={isDark} styles={styles} />
          </View>
        </View>

        <View style={styles.disclosureRow}>
          <Ionicons name="shield-checkmark-outline" size={15} color={T.textMuted} />
          <Text style={styles.disclosureText}>{EDUCATION_DISCLOSURE}</Text>
        </View>
      </ScrollView>

      <ShareIdeaButton bottomOffset={insets.bottom + 20} isDark={isDark} styles={styles} />
    </Screen>
  );
}

function CommunityHeader({
  T,
  styles,
}: {
  T: ThemeColors;
  styles: TradersCommunityStyles;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle} numberOfLines={1}>Trader Community</Text>
      </View>

      <View style={styles.headerActions}>
        <Pressable style={styles.headerIconButton} hitSlop={8}>
          <Ionicons name="search" size={23} color={T.textSub} />
        </Pressable>
        <Pressable style={styles.headerIconButton} hitSlop={8}>
          <Ionicons name="notifications-outline" size={23} color={T.textSub} />
          <View style={styles.notificationDot} />
        </Pressable>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>AX</Text>
          <VerifiedBadge styles={styles} size="small" />
        </View>
      </View>
    </View>
  );
}

function MarketSentimentCard({
  sentiments,
  T,
  isDark,
  styles,
}: {
  sentiments: MarketSentimentItem[];
  T: ThemeColors;
  isDark: boolean;
  styles: TradersCommunityStyles;
}) {
  return (
    <LinearGradient
      colors={getCardGradient(isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.sentimentCard}
    >
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardEyebrow}>Market Sentiment Today</Text>
        </View>
      </View>

      {sentiments.map((item) => (
        <SentimentRow key={item.symbol} item={item} T={T} styles={styles} />
      ))}
    </LinearGradient>
  );
}

function SentimentRow({
  item,
  T,
  styles,
}: {
  item: MarketSentimentItem;
  T: ThemeColors;
  styles: TradersCommunityStyles;
}) {
  const color = getSentimentColor(item.sentiment, T);

  return (
    <View style={styles.sentimentRow}>
      <View style={[styles.symbolIcon, { backgroundColor: getSentimentTint(item.sentiment) }]}>
        <Ionicons name={item.icon} size={18} color={color} />
      </View>

      <View style={styles.sentimentSymbolBlock}>
        <Text style={styles.sentimentSymbol}>{item.symbol}</Text>
      </View>

      <View style={[styles.sentimentChip, { borderColor: color, backgroundColor: getSentimentTint(item.sentiment) }]}>
        <Text style={[styles.sentimentChipText, { color }]}>{item.sentiment}</Text>
      </View>

      <View style={styles.sentimentTrack}>
        <View style={[styles.sentimentFill, { width: `${item.percent}%`, backgroundColor: color }]} />
      </View>

      <Text style={[styles.sentimentPercent, { color }]}>{item.percent}%</Text>
    </View>
  );
}

function CategoryTabs({
  filters,
  selectedFilter,
  onSelect,
  isDark,
  styles,
}: {
  filters: CommunityFilter[];
  selectedFilter: CommunityFilter;
  onSelect: (filter: CommunityFilter) => void;
  isDark: boolean;
  styles: TradersCommunityStyles;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRail}>
      {filters.map((filter) => {
        const selected = filter === selectedFilter;

        return (
          <Pressable key={filter} onPress={() => onSelect(filter)} hitSlop={6}>
            {selected ? (
              <LinearGradient
                colors={getAccentGradient(isDark)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.tabChip, styles.tabChipActive]}
              >
                <Text style={[styles.tabText, styles.tabTextActive]}>{filter}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.tabChip}>
                <Text style={styles.tabText}>{filter}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SectionHeader({
  title,
  action,
  styles,
}: {
  title: string;
  action?: string;
  styles: TradersCommunityStyles;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <View style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FeaturedTraderCard({
  trader,
  isDark,
  styles,
}: {
  trader: FeaturedTrader;
  isDark: boolean;
  styles: TradersCommunityStyles;
}) {
  return (
    <LinearGradient
      colors={getPanelGradient(isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.traderCard}
    >
      <View style={styles.traderTopRow}>
        <Avatar initials={trader.initials} styles={styles} />
        <View style={styles.traderCopy}>
          <View style={styles.verifiedNameRow}>
            <Text style={styles.traderName} numberOfLines={1}>{trader.name}</Text>
            {trader.verified ? <VerifiedBadge styles={styles} /> : null}
          </View>
          <Text style={styles.traderSpecialty} numberOfLines={1}>{trader.specialty}</Text>
        </View>
      </View>

      <Pressable style={styles.followButton}>
        <Text style={styles.followButtonText}>Follow</Text>
      </Pressable>
    </LinearGradient>
  );
}

function TradingRoomCard({
  room,
  T,
  isDark,
  styles,
}: {
  room: TradingRoom;
  T: ThemeColors;
  isDark: boolean;
  styles: TradersCommunityStyles;
}) {
  return (
    <LinearGradient
      colors={getPanelGradient(isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.roomCard}
    >
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Live</Text>
      </View>

      <View style={styles.roomMainRow}>
        <View style={styles.roomIcon}>
          <Ionicons name={room.icon} size={26} color="#F5B642" />
        </View>
        <View style={styles.roomCopy}>
          <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.roomMembers}>{room.activeMembers} online</Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.joinButton}>
        <Text style={styles.joinButtonText}>Join Room</Text>
        <Ionicons name="arrow-forward" size={14} color={T.accent} />
      </Pressable>
    </LinearGradient>
  );
}

function CommunityPostCard({
  post,
  T,
  isDark,
  styles,
}: {
  post: CommunityPost;
  T: ThemeColors;
  isDark: boolean;
  styles: TradersCommunityStyles;
}) {
  const hasPostActions = typeof post.likes === 'number' || typeof post.comments === 'number';

  return (
    <LinearGradient
      colors={getPanelGradient(isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.postCard}
    >
      <View style={styles.postHeader}>
        <Avatar initials={post.initials} styles={styles} compact />
        <View style={styles.postAuthorBlock}>
          <View style={styles.verifiedNameRow}>
            <Text style={styles.postAuthor} numberOfLines={1}>{post.traderName}</Text>
            {post.verified ? <VerifiedBadge styles={styles} size="small" /> : null}
          </View>
          {post.timeLabel ? <Text style={styles.postRole} numberOfLines={1}>{post.timeLabel}</Text> : null}
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={T.textMuted} />
      </View>

      <View style={styles.postTagRow}>
        <Tag label={post.symbol} styles={styles} />
      </View>

      <Text style={styles.postText}>{post.text}</Text>

      {post.hasChart ? <MiniChartPreview T={T} styles={styles} /> : null}

      {hasPostActions ? (
        <View style={styles.postActions}>
          {typeof post.likes === 'number' ? (
            <PostAction icon="thumbs-up-outline" label={String(post.likes)} color={T.textSub} styles={styles} />
          ) : null}
          {typeof post.comments === 'number' ? (
            <PostAction icon="chatbubble-outline" label={String(post.comments)} color={T.textSub} styles={styles} />
          ) : null}
        </View>
      ) : null}
    </LinearGradient>
  );
}

function MiniChartPreview({
  T,
  styles,
}: {
  T: ThemeColors;
  styles: TradersCommunityStyles;
}) {
  return (
    <View style={styles.chartPreview}>
      <View style={[styles.chartGridLine, { top: '28%' }]} />
      <View style={[styles.chartGridLine, { top: '56%' }]} />
      <View style={styles.chartCandles}>
        {CHART_CANDLES.map((candle, index) => {
          const color = candle.up ? T.up : T.down;

          return (
            <View key={`${candle.body}-${index}`} style={styles.candleSlot}>
              <View style={[styles.candleWick, { height: candle.wick, backgroundColor: color }]} />
              <View style={[styles.candleBody, { height: candle.body, backgroundColor: color }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MarketPollCard({
  T,
  isDark,
  styles,
}: {
  T: ThemeColors;
  isDark: boolean;
  styles: TradersCommunityStyles;
}) {
  return (
    <LinearGradient
      colors={getPanelGradient(isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.pollCard}
    >
      <Text style={styles.pollQuestion}>{MARKET_POLL.question}</Text>

      {MARKET_POLL.options.map((option) => (
        <PollOption key={option.id} option={option} T={T} styles={styles} />
      ))}
    </LinearGradient>
  );
}

function PollOption({
  option,
  T,
  styles,
}: {
  option: MarketPollOption;
  T: ThemeColors;
  styles: TradersCommunityStyles;
}) {
  const color = getPollColor(option.tone, T);

  return (
    <View style={styles.pollOption}>
      <View style={styles.pollOptionTop}>
        <View style={[styles.pollIcon, { backgroundColor: getPollTint(option.tone) }]}>
          <Ionicons name={getPollIcon(option.tone)} size={14} color={color} />
        </View>
        <Text style={styles.pollLabel}>{option.label}</Text>
        <Text style={[styles.pollPercent, { color }]}>{option.percent}%</Text>
      </View>
      <View style={styles.pollTrack}>
        <View style={[styles.pollFill, { width: `${option.percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ShareIdeaButton({
  bottomOffset,
  isDark,
  styles,
}: {
  bottomOffset: number;
  isDark: boolean;
  styles: TradersCommunityStyles;
}) {
  return (
    <Pressable style={[styles.shareButton, { bottom: bottomOffset }]} hitSlop={8}>
      <LinearGradient
        colors={getShareGradient(isDark)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shareButtonGradient}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.shareButtonText}>Share Idea</Text>
      </LinearGradient>
    </Pressable>
  );
}

function Avatar({
  initials,
  styles,
  compact = false,
}: {
  initials: string;
  styles: TradersCommunityStyles;
  compact?: boolean;
}) {
  return (
    <LinearGradient
      colors={['#D7E6FF', '#64748B']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatar, compact && styles.avatarCompact]}
    >
      <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>{initials}</Text>
    </LinearGradient>
  );
}

function VerifiedBadge({
  styles,
  size = 'regular',
}: {
  styles: TradersCommunityStyles;
  size?: 'regular' | 'small';
}) {
  return (
    <View style={[styles.verifiedBadge, size === 'small' && styles.verifiedBadgeSmall]}>
      <Ionicons name="checkmark" size={size === 'small' ? 8 : 10} color="#07111F" />
    </View>
  );
}

function Tag({
  label,
  styles,
}: {
  label: string;
  styles: TradersCommunityStyles;
}) {
  return (
    <View style={[styles.tag, styles.symbolTag]}>
      <Text style={[styles.tagText, styles.symbolTagText]}>{label}</Text>
    </View>
  );
}

function PostAction({
  icon,
  label,
  color,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  styles: TradersCommunityStyles;
}) {
  return (
    <View style={styles.postAction}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={styles.postActionText}>{label}</Text>
    </View>
  );
}

function getSentimentColor(sentiment: MarketSentiment, T: ThemeColors): string {
  switch (sentiment) {
    case 'Bullish':
      return T.up;
    case 'Bearish':
      return T.down;
    case 'Neutral':
    default:
      return T.textSub;
  }
}

function getSentimentTint(sentiment: MarketSentiment): string {
  switch (sentiment) {
    case 'Bullish':
      return 'rgba(16,185,129,0.14)';
    case 'Bearish':
      return 'rgba(239,68,68,0.14)';
    case 'Neutral':
    default:
      return 'rgba(148,163,184,0.14)';
  }
}

function getPollColor(tone: PollTone, T: ThemeColors): string {
  if (tone === 'bullish') return T.up;
  if (tone === 'bearish') return T.down;
  return T.textSub;
}

function getPollTint(tone: PollTone): string {
  if (tone === 'bullish') return 'rgba(16,185,129,0.15)';
  if (tone === 'bearish') return 'rgba(239,68,68,0.15)';
  return 'rgba(148,163,184,0.14)';
}

function getPollIcon(tone: PollTone): keyof typeof Ionicons.glyphMap {
  if (tone === 'bullish') return 'arrow-up';
  if (tone === 'bearish') return 'arrow-down';
  return 'remove';
}

function getScreenGradient(isDark: boolean): readonly [string, string, string] {
  return isDark
    ? ['#020713', '#061426', '#020617']
    : ['#F7FAFF', '#EEF5FF', '#EAF0F8'];
}

function getCardGradient(isDark: boolean): readonly [string, string, string] {
  return isDark
    ? ['rgba(15,23,42,0.94)', 'rgba(8,17,33,0.94)', 'rgba(2,6,23,0.96)']
    : ['#FFFFFF', '#F8FAFC', '#EEF4FF'];
}

function getPanelGradient(isDark: boolean): readonly [string, string, string] {
  return isDark
    ? ['rgba(15,28,50,0.94)', 'rgba(9,18,34,0.94)', 'rgba(3,9,20,0.96)']
    : ['#FFFFFF', '#F9FBFF', '#F1F5F9'];
}

function getAccentGradient(isDark: boolean): readonly [string, string] {
  return isDark ? ['#38BDF8', '#2563EB'] : ['#3B82F6', '#4338CA'];
}

function getShareGradient(isDark: boolean): readonly [string, string, string] {
  return isDark ? ['#F8C35B', '#F59E0B', '#D97706'] : ['#F59E0B', '#2563EB', '#4338CA'];
}
