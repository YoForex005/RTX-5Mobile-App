import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: Mql5AlgoTradingScreen
 *
 * API-ready command center for MQL5 Expert Advisors, active automation,
 * account connection state, risk controls, and recent algo activity.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Modal, RefreshControl, ScrollView, Switch, Text, TextInput, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { makeMql5AlgoTradingStyles, type Mql5AlgoTradingStyles } from './Mql5AlgoTradingScreen.styles';
import {
  DEFAULT_ALGO_STRATEGY_FILTERS,
  MQL5_ALGO_PREVIEW_DATA,
  applyAlgoStrategyFilters,
  filterStrategiesByCategory,
  getActiveAlgoFilterCount,
  hasConnectedAlgoAccount,
  selectAlgoCategories,
  type AccountConnectionStatus,
  type AlgoStrategyFilters,
  type AlgoStrategyLibraryFilter,
  type AlgoStrategySortOption,
  type ActiveBot,
  type ActivitySeverity,
  type AlgoCategory,
  type AlgoRiskLevel,
  type AlgoTradingStatus,
  type BotStatus,
  type Mql5AlgoTradingScreenData,
  type PerformanceOverview,
  type RecentActivityItem,
  type RiskSettings,
  type Strategy,
  type UserAccount,
} from './mql5AlgoTradingViewModel';

type ConfirmationConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'warning' | 'danger';
  onConfirm: () => void;
};

const MQL5_PRIMARY_CONTENT_DELAY_MS = 120;
const MQL5_SECONDARY_CONTENT_DELAY_MS = 320;

export function Mql5AlgoTradingScreen() {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeMql5AlgoTradingStyles(T, isDark), [T, isDark]);
  const palette = getAlgoUiPalette(T);
  const screenData = MQL5_ALGO_PREVIEW_DATA;
  const [selectedCategory, setSelectedCategory] = useState(screenData.uiState.selected_category);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationConfig | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filters, setFilters] = useState<AlgoStrategyFilters>(DEFAULT_ALGO_STRATEGY_FILTERS);
  const primaryContentReady = useDeferredRouteContentReady(MQL5_PRIMARY_CONTENT_DELAY_MS);
  const secondaryContentReady = useDeferredRouteContentReady(MQL5_SECONDARY_CONTENT_DELAY_MS);

  const categories = useMemo(
    () => selectAlgoCategories(screenData.categories, selectedCategory),
    [screenData.categories, selectedCategory],
  );
  // Run sheet filters first, then narrow by category tab. Both are
  // orthogonal concerns: filters cover trust/risk/library/sort, the tab
  // rail covers strategy *type*.
  const visibleStrategies = useMemo(() => {
    if (!secondaryContentReady) {
      return [];
    }
    const filtered = applyAlgoStrategyFilters(screenData.featuredStrategies, filters);
    return filterStrategiesByCategory(filtered, selectedCategory);
  }, [screenData.featuredStrategies, filters, selectedCategory, secondaryContentReady]);
  const activeFilterCount = useMemo(() => getActiveAlgoFilterCount(filters), [filters]);

  const showLoading = screenData.uiState.loading_status === 'loading';
  const showError = screenData.uiState.loading_status === 'error';
  const accountConnected = hasConnectedAlgoAccount(screenData.account);
  const algoDisabled = screenData.account?.algo_trading_status === 'Disabled';

  const openStopBotConfirmation = (bot: ActiveBot) => {
    setConfirmation({
      title: 'Stop Bot',
      message: `Stop ${bot.strategy_name}? This will halt automation for the selected strategy.`,
      confirmLabel: 'Stop Bot',
      tone: 'danger',
      onConfirm: () => setConfirmation(null),
    });
  };

  const openEmergencyStopConfirmation = () => {
    setConfirmation({
      title: 'Emergency Stop',
      message: 'Pause all active algo strategies and block new automated entries?',
      confirmLabel: 'Emergency Stop',
      tone: 'danger',
      onConfirm: () => setConfirmation(null),
    });
  };

  const goBack = () => {
    router.replace('/(tabs)/settings');
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    setSearchQuery('');
    setSearchOpen(false);
  };

  return (
    <Screen noBottomInset style={styles.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={getAlgoScreenGradient(isDark)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />

      <View style={[styles.fixedHeader, { paddingTop: insets.top + 14 }]}>
        {searchOpen ? (
          <AlgoSearchHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClose={closeSearch}
            T={T}
            styles={styles}
          />
        ) : (
          <AlgoHeader
            onBack={goBack}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenFilters={() => setFilterSheetOpen(true)}
            activeFilterCount={activeFilterCount}
            T={T}
            styles={styles}
          />
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 18, paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.primary}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 500);
            }}
          />
        }
      >
        {screenData.uiState.offline_status ? <OfflineState T={T} styles={styles} /> : null}
        {screenData.uiState.risk_limit_triggered ? (
          <StateBanner
            icon="warning-outline"
            title="Risk limit triggered. Algo trading has been paused."
            tone="warning"
            T={T}
            styles={styles}
          />
        ) : null}
        {algoDisabled ? (
          <StateBanner
            icon="pause-circle-outline"
            title="Algo trading is currently disabled."
            actionLabel="Enable Algo Trading"
            tone="warning"
            T={T}
            styles={styles}
          />
        ) : null}
        {screenData.uiState.permission_required ? (
          <StateBanner
            icon="key-outline"
            title="Permission required to run automated strategies."
            actionLabel="Review Permissions"
            tone="neutral"
            T={T}
            styles={styles}
          />
        ) : null}

        {showLoading || !primaryContentReady ? (
          <AlgoSkeletonLoader styles={styles} />
        ) : showError ? (
          <ErrorState
            title="Unable to load algo trading data."
            buttonLabel="Retry"
            T={T}
            styles={styles}
          />
        ) : (
          <AlgoScreenContent
            data={screenData}
            categories={categories}
            visibleStrategies={visibleStrategies}
            accountConnected={accountConnected}
            secondaryContentReady={secondaryContentReady}
            isDark={isDark}
            onSelectCategory={setSelectedCategory}
            onStopBot={openStopBotConfirmation}
            onEmergencyStop={openEmergencyStopConfirmation}
            T={T}
            styles={styles}
          />
        )}
      </ScrollView>

      <ConfirmationModal config={confirmation} onClose={() => setConfirmation(null)} styles={styles} />
      <AlgoFilterSheet
        visible={filterSheetOpen}
        filters={filters}
        strategies={screenData.featuredStrategies}
        onClose={() => setFilterSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFilterSheetOpen(false);
        }}
        onReset={() => setFilters(DEFAULT_ALGO_STRATEGY_FILTERS)}
        T={T}
        styles={styles}
      />
    </Screen>
  );
}

function AlgoScreenContent({
  data,
  categories,
  visibleStrategies,
  accountConnected,
  secondaryContentReady,
  isDark,
  onSelectCategory,
  onStopBot,
  onEmergencyStop,
  T,
  styles,
}: {
  data: Mql5AlgoTradingScreenData;
  categories: AlgoCategory[];
  visibleStrategies: Strategy[];
  accountConnected: boolean;
  secondaryContentReady: boolean;
  isDark: boolean;
  onSelectCategory: (categoryId: string) => void;
  onStopBot: (bot: ActiveBot) => void;
  onEmergencyStop: () => void;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <>
      <ConnectedAccountCard
        account={data.account}
        performance={data.performance}
        accountConnected={accountConnected}
        isDark={isDark}
        T={T}
        styles={styles}
      />
      <PerformanceOverviewCard performance={data.performance} currency={data.account?.currency} T={T} styles={styles} />
      <AlgoCategoryTabs categories={categories} onSelect={onSelectCategory} styles={styles} />
      {secondaryContentReady ? (
        <>
          <FeaturedStrategiesSection strategies={visibleStrategies} T={T} styles={styles} />
          <ActiveBotsSection bots={data.activeBots} currency={data.account?.currency} onStopBot={onStopBot} T={T} styles={styles} />
          <RiskControlsPanel
            settings={data.riskSettings}
            currency={data.account?.currency}
            onEmergencyStop={onEmergencyStop}
            T={T}
            styles={styles}
          />
          <RecentAlgoActivity activities={data.recentActivity} T={T} styles={styles} />
          <View style={styles.disclaimer}>
            <Ionicons name="shield-checkmark-outline" size={15} color={palette.secondary} />
            <Text style={styles.disclaimerText}>
              Algo trading involves risk. Strategy performance is not guaranteed. Use proper risk controls before enabling automation.
            </Text>
          </View>
        </>
      ) : null}
    </>
  );
}

function AlgoHeader({
  onBack,
  onOpenSearch,
  onOpenFilters,
  activeFilterCount,
  T,
  styles,
}: {
  onBack: () => void;
  onOpenSearch: () => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        <Pressable style={styles.headerIconButton} hitSlop={8} onPress={onBack} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={18} color={palette.secondary} />
        </Pressable>
      </View>

      <View style={styles.headerCopy}>
        <Text style={styles.title} numberOfLines={1}>MQL5 Algo Trading</Text>
      </View>

      <View style={styles.headerActions}>
        <HeaderIcon icon="search" onPress={onOpenSearch} T={T} styles={styles} />
        <View>
          <HeaderIcon icon="options-outline" onPress={onOpenFilters} T={T} styles={styles} />
          {activeFilterCount > 0 ? <View style={styles.headerFilterDot} /> : null}
        </View>
      </View>
    </View>
  );
}

function AlgoSearchHeader({
  searchQuery,
  onSearchChange,
  onClose,
  T,
  styles,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <View style={styles.searchHeader}>
      <Pressable style={styles.searchBackButton} onPress={onClose} hitSlop={8} accessibilityLabel="Back from search">
        <Ionicons name="arrow-back" size={18} color={palette.secondary} />
      </Pressable>
      <Ionicons name="search" size={16} color={palette.secondary} />
      <TextInput
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder="Search strategies, bots, symbols..."
        placeholderTextColor={palette.secondary}
        selectionColor={palette.primary}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
        accessibilityLabel="Search MQL5 algo trading"
      />
      {searchQuery.length > 0 ? (
        <Pressable style={styles.searchCloseButton} onPress={() => onSearchChange('')} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close" size={17} color={palette.secondary} />
        </Pressable>
      ) : null}
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
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <Pressable
      style={styles.headerIconButton}
      hitSlop={8}
      onPress={onPress}
      activateOnPressIn={Boolean(onPress)}
      activateOnTouchStart={Boolean(onPress)}
      unstable_pressDelay={0}
    >
      <Ionicons name={icon} size={18} color={palette.secondary} />
    </Pressable>
  );
}

function ConnectedAccountCard({
  account,
  performance,
  accountConnected,
  isDark,
  T,
  styles,
}: {
  account: UserAccount | null;
  performance: PerformanceOverview | null;
  accountConnected: boolean;
  isDark: boolean;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);
  const todayPnlTone = getPnlTone(performance?.today_pnl);
  const accountMetricItems = [
    { label: 'Balance', value: formatUnsignedCurrency(account?.balance, account?.currency) },
    { label: 'Equity', value: formatUnsignedCurrency(account?.equity, account?.currency) },
    { label: 'Free Margin', value: formatUnsignedCurrency(account?.free_margin, account?.currency) },
    {
      label: 'Daily P/L',
      value: formatCurrency(performance?.today_pnl, account?.currency),
      valueColor: getToneColor(todayPnlTone, T),
    },
  ];

  return (
    <LinearGradient
      colors={getAccountCardGradient(accountConnected, isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, accountConnected ? styles.connectedCard : styles.warningCard]}
    >
      <View style={styles.accountHeaderRow}>
        <View style={styles.accountHeaderIdentity}>
          <View style={styles.sectionIcon}>
            <Ionicons name="server-outline" size={18} color={palette.primary} />
          </View>
          <View style={styles.accountHeaderCopy}>
            <Text style={styles.sectionTitle}>Connected Account</Text>
            <Text style={styles.sectionCaption}>
              {accountConnected ? formatLastSync(account?.last_sync_time) : 'Connect your trading account to enable algo trading.'}
            </Text>
          </View>
        </View>
        <Pressable style={styles.manageButton}>
          <Text style={styles.manageButtonText}>{accountConnected ? 'Manage' : 'Connect Account'}</Text>
        </Pressable>
      </View>

      <View style={styles.accountMainRow}>
        <View style={styles.accountIdentity}>
          <Text style={styles.accountName} numberOfLines={1}>{account?.account_label ?? 'Trading Account'}</Text>
          <Text style={styles.accountServer} numberOfLines={1}>
            {[account?.account_number_masked, account?.broker_server, account?.account_type].filter(Boolean).join(' / ')}
          </Text>
        </View>
      </View>

      {accountConnected ? (
        <View style={styles.accountMetrics}>
          {accountMetricItems.map((item, index) => (
            <InlineMetric
              key={item.label}
              label={item.label}
              value={item.value}
              valueColor={item.valueColor}
              showDivider={index > 0}
              styles={styles}
            />
          ))}
        </View>
      ) : (
        <Pressable style={styles.reconnectButton}>
          <Ionicons name="reload-outline" size={14} color={palette.warning} />
          <Text style={styles.reconnectButtonText}>Reconnect</Text>
        </Pressable>
      )}
    </LinearGradient>
  );
}

function PerformanceOverviewCard({
  performance,
  currency,
  T,
  styles,
}: {
  performance: PerformanceOverview | null;
  currency?: string;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const metricTiles = [
    { label: 'Today P/L', value: formatCurrency(performance?.today_pnl, currency), tone: getPnlTone(performance?.today_pnl), icon: 'trending-up-outline' as const },
    { label: 'Active Bots', value: formatNumber(performance?.total_active_bots), tone: 'neutral' as const, icon: 'hardware-chip-outline' as const },
    { label: 'Win Rate', value: formatPercent(performance?.win_rate), tone: 'neutral' as const, icon: 'analytics-outline' as const },
    { label: 'Open Trades', value: formatNumber(performance?.open_trades), tone: 'neutral' as const, icon: 'swap-vertical-outline' as const },
    { label: 'Max Drawdown', value: formatPercent(performance?.max_drawdown), tone: 'danger' as const, icon: 'trending-down-outline' as const },
    { label: 'Risk Score', value: formatNumber(performance?.risk_score), tone: getRiskScoreTone(performance?.risk_score), icon: 'shield-checkmark-outline' as const },
  ];

  return (
    <View style={[styles.card, styles.performanceCard]}>
      <View style={styles.performanceHeaderRow}>
        <Text style={styles.performanceTitle}>Performance Snapshot</Text>
        <Pressable style={styles.periodSelector} hitSlop={8}>
          <Text style={styles.periodSelectorText}>Today</Text>
          <Ionicons name="chevron-down" size={15} color={getAlgoUiPalette(T).secondary} />
        </Pressable>
      </View>
      <View style={styles.performanceGrid}>
        {metricTiles.map((tile) => (
          <MetricTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            tone={tile.tone}
            icon={tile.icon}
            T={T}
            styles={styles}
          />
        ))}
      </View>
      {performance?.sparkline_data.length ? (
        <PerformanceChart
          values={performance.sparkline_data}
          color={getPnlColor(performance.net_pnl, T)}
          styles={styles}
        />
      ) : null}
    </View>
  );
}

function MetricTile({
  label,
  value,
  tone,
  icon,
  T,
  styles,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'danger' | 'warning' | 'neutral';
  icon: keyof typeof Ionicons.glyphMap;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const color = getToneColor(tone, T);
  const palette = getAlgoUiPalette(T);
  const iconColor = tone === 'neutral' ? palette.primary : color;

  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <View style={[styles.metricIconBubble, { backgroundColor: withAlpha(iconColor, 0.1) }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
    </View>
  );
}

function PerformanceChart({
  values,
  color,
  styles,
}: {
  values: number[];
  color: string;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.performanceChartSection}>
      <View style={styles.chartPanel}>
        <Text style={styles.chartTitle}>Performance (Last 14 Days)</Text>
        <View style={styles.chartBodyRow}>
          <View style={styles.chartAxis}>
            <Text style={styles.chartAxisText}>4K</Text>
            <Text style={styles.chartAxisText}>2K</Text>
            <Text style={styles.chartAxisText}>0</Text>
            <Text style={styles.chartAxisText}>-2K</Text>
          </View>
          <View style={styles.chartColumn}>
            <Sparkline values={values} color={color} styles={styles} />
            <View style={styles.chartDateRow}>
              <Text style={styles.chartDateText}>May 9</Text>
              <Text style={styles.chartDateText}>May 22</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function AlgoCategoryTabs({
  categories,
  onSelect,
  styles,
}: {
  categories: AlgoCategory[];
  onSelect: (categoryId: string) => void;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
      {categories.map((category) => (
        <Pressable key={category.category_id} onPress={() => onSelect(category.category_id)} hitSlop={6}>
          {category.is_selected ? (
            <View style={[styles.categoryPill, styles.categoryPillActive]}>
              <Text style={[styles.categoryText, styles.categoryTextActive]}>{category.category_name}</Text>
            </View>
          ) : (
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{category.category_name}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function FeaturedStrategiesSection({
  strategies,
  T,
  styles,
}: {
  strategies: Strategy[];
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionHeader title="Featured Strategies" styles={styles} />
      {strategies.length ? (
        <ScrollView
          keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strategyRail}>
          {strategies.map((strategy) => (
            <StrategyCard key={strategy.strategy_id} strategy={strategy} T={T} styles={styles} />
          ))}
        </ScrollView>
      ) : (
        <EmptyState
          title="No algo strategies available right now."
          subtitle="Check back later or adjust your filters."
          styles={styles}
        />
      )}
    </View>
  );
}

function StrategyCard({
  strategy,
  T,
  styles,
}: {
  strategy: Strategy;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);
  const riskMeta = getRiskMeta(strategy.risk_level, T);
  const ratingLabel = typeof strategy.rating === 'number' ? strategy.rating.toFixed(1) : null;
  const usersLabel = formatCompactCount(strategy.users_count);
  const priceLabel = formatMonthlyPrice(strategy.monthly_price);
  const primaryActionLabel = strategy.is_installed ? 'Manage' : 'Connect';
  const showTrialNote = strategy.trial_available && !strategy.is_installed;
  const marketLineParts = [
    ...strategy.supported_symbols.slice(0, 2),
    ...strategy.supported_timeframes.slice(0, 2),
  ];

  return (
    <View style={styles.strategyCard}>
      {/* Type kicker + bookmark — quiet header so the title can lead */}
      <View style={styles.strategyTopRow}>
        <View style={styles.strategyTypeChip}>
          <Text style={styles.strategyTypeChipText} numberOfLines={1}>{strategy.strategy_type}</Text>
        </View>
        <Pressable style={styles.favoriteButton} hitSlop={6} accessibilityLabel="Bookmark strategy">
          <Ionicons
            name={strategy.is_favorite ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={strategy.is_favorite ? palette.warning : palette.secondary}
          />
        </Pressable>
      </View>

      {/* Title — the single bold element in the body */}
      <Text style={styles.strategyTitle} numberOfLines={2}>{strategy.strategy_name}</Text>

      {/* Provider attribution: small avatar, name, verified check inline */}
      <View style={styles.providerRow}>
        <View style={styles.providerAvatar}>
          <Text style={styles.providerAvatarText}>
            {strategy.provider_avatar ?? strategy.provider_name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.providerName} numberOfLines={1}>{strategy.provider_name}</Text>
        {strategy.verified_status ? (
          <Ionicons name="checkmark-circle" size={14} color={palette.success} />
        ) : null}
      </View>

      {/* Meta row: rating · users · risk · live (only what's available) */}
      <View style={styles.strategyMetaRow}>
        {ratingLabel ? (
          <View style={styles.strategyMetaItem}>
            <Ionicons name="star" size={12} color={palette.warning} />
            <Text style={styles.strategyMetaText}>{ratingLabel}</Text>
          </View>
        ) : null}
        <View style={styles.strategyMetaItem}>
          <Ionicons name="people" size={12} color={palette.secondary} />
          <Text style={styles.strategyMetaText}>{usersLabel}</Text>
        </View>
        <View style={styles.strategyMetaItem}>
          <View style={[styles.strategyRiskDot, { backgroundColor: riskMeta.color }]} />
          <Text style={styles.strategyMetaText}>{strategy.risk_level} risk</Text>
        </View>
        {strategy.live_verified ? (
          <View style={styles.strategyMetaItem}>
            <View style={[styles.strategyRiskDot, { backgroundColor: palette.success }]} />
            <Text style={styles.strategyMetaText}>Live</Text>
          </View>
        ) : null}
      </View>

      {/* Markets / timeframes — subdued reference line */}
      {marketLineParts.length > 0 ? (
        <Text style={styles.strategyMarketsLine} numberOfLines={1}>
          {marketLineParts.join(' · ')}
        </Text>
      ) : null}

      {/* Footer: price (left, prominent) + asymmetric actions (right) */}
      <View style={styles.strategyDivider} />
      <View style={styles.strategyFooter}>
        <View style={styles.strategyPriceBlock}>
          <Text style={styles.strategyPrice} numberOfLines={1}>{priceLabel}</Text>
          {showTrialNote ? <Text style={styles.strategyPriceSub}>Free trial</Text> : null}
        </View>
        <View style={styles.strategyActions}>
          <Pressable style={styles.strategyGhostButton} hitSlop={4}>
            <Text style={styles.strategyGhostButtonText}>View</Text>
          </Pressable>
          <Pressable style={styles.strategyPrimaryButton} hitSlop={4}>
            <Text style={styles.strategyPrimaryButtonText}>{primaryActionLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ActiveBotsSection({
  bots,
  currency,
  onStopBot,
  T,
  styles,
}: {
  bots: ActiveBot[];
  currency?: string;
  onStopBot: (bot: ActiveBot) => void;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionHeader title="Active Bots" styles={styles} />
      {bots.length ? (
        bots.map((bot) => (
          <ActiveBotCard key={bot.bot_id} bot={bot} currency={currency} onStopBot={onStopBot} T={T} styles={styles} />
        ))
      ) : (
        <EmptyState
          title="No active algo bots."
          subtitle="Install or connect a strategy to start automation."
          styles={styles}
        />
      )}
    </View>
  );
}

function ActiveBotCard({
  bot,
  currency,
  onStopBot,
  T,
  styles,
}: {
  bot: ActiveBot;
  currency?: string;
  onStopBot: (bot: ActiveBot) => void;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const statusMeta = getBotStatusMeta(bot.status, T);
  const palette = getAlgoUiPalette(T);

  return (
    <View style={styles.botCard}>
      <View style={[styles.statusRail, { backgroundColor: statusMeta.color }]} />
      <View style={styles.botTopRow}>
        <View>
          <View style={styles.botTitleRow}>
            <Text style={styles.botTitle} numberOfLines={1}>{bot.strategy_name}</Text>
            <StatusBadge label={bot.status} color={statusMeta.color} styles={styles} />
          </View>
          <Text style={styles.botMeta} numberOfLines={1}>{bot.symbol} / {bot.timeframe}</Text>
        </View>
        <Ionicons name={statusMeta.icon} size={22} color={statusMeta.color} />
      </View>

      <View style={styles.botMetricGrid}>
        <View style={styles.botMetricItem}>
          <InlineMetric label="Today P/L" value={formatCurrency(bot.today_pnl, currency)} valueColor={getPnlColor(bot.today_pnl, T)} styles={styles} />
        </View>
        <View style={styles.botMetricItem}>
          <InlineMetric label="Open Trades" value={formatNumber(bot.open_trades)} styles={styles} />
        </View>
        <View style={styles.botMetricItem}>
          <InlineMetric label="Drawdown" value={formatPercent(bot.max_drawdown)} valueColor={palette.danger} styles={styles} />
        </View>
        <View style={styles.botMetricItem}>
          <InlineMetric label="Runtime" value={bot.runtime ?? '--'} styles={styles} />
        </View>
      </View>

      <View style={styles.botSignalRow}>
        <Ionicons name="pulse-outline" size={14} color={palette.secondary} />
        <Text style={styles.botSignalText} numberOfLines={1}>{bot.last_signal ?? 'No recent signal'}</Text>
      </View>

      <View style={styles.botActionRow}>
        <Pressable style={styles.botPauseButton}>
          <Text style={styles.botPauseText}>{bot.status === 'Paused' ? 'Resume' : 'Pause'}</Text>
        </Pressable>
        <Pressable style={styles.botDetailsButton}>
          <Text style={styles.botDetailsText}>Details</Text>
        </Pressable>
        <Pressable style={styles.botStopButton} onPress={() => onStopBot(bot)}>
          <Text style={styles.botStopText}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RiskControlsPanel({
  settings,
  currency,
  onEmergencyStop,
  T,
  styles,
}: {
  settings: RiskSettings | null;
  currency?: string;
  onEmergencyStop: () => void;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  if (!settings) {
    return (
      <View style={styles.sectionBlock}>
        <SectionHeader title="Risk Controls" styles={styles} />
        <EmptyState title="Risk settings are unavailable." subtitle="Reconnect the account or try again." styles={styles} />
      </View>
    );
  }

  const disabled = settings.saving_status === 'saving';
  const palette = getAlgoUiPalette(T);

  return (
    <View style={styles.card}>
      <SectionHeader title="Risk Controls" styles={styles} />
      <Text style={styles.helperText}>Risk controls apply to all active algo strategies.</Text>

      <View style={styles.riskModeBanner}>
        <View style={styles.riskModeIcon}>
          <Ionicons name="shield-checkmark-outline" size={17} color={palette.primary} />
        </View>
        <View style={styles.riskModeCopy}>
          <Text style={styles.riskModeLabel}>Risk Mode</Text>
          <Text style={styles.riskModeValue}>Protected</Text>
        </View>
        <StatusBadge label={settings.emergency_stop_status} color={settings.emergency_stop_status === 'Ready' ? palette.success : palette.danger} styles={styles} />
      </View>

      <View style={styles.riskGroup}>
        <Text style={styles.riskGroupTitle}>Loss Protection</Text>
        <RiskControlRow
          label="Max Daily Loss"
          value={formatCurrency(settings.max_daily_loss_value, currency)}
          enabled={settings.max_daily_loss_enabled}
          disabled={disabled}
          T={T}
          styles={styles}
        />
        <RiskControlRow
          label="Max Total Drawdown"
          value={formatPercent(settings.max_total_drawdown_value)}
          enabled={settings.max_total_drawdown_enabled}
          disabled={disabled}
          T={T}
          styles={styles}
        />
        <RiskControlRow label="Auto Stop on Drawdown" value={settings.auto_stop_on_drawdown ? 'Active' : 'Off'} enabled={settings.auto_stop_on_drawdown} disabled={disabled} T={T} styles={styles} />
      </View>

      <View style={styles.riskGroup}>
        <Text style={styles.riskGroupTitle}>Trade Limits</Text>
        <RiskControlRow label="Max Lot Size" value={formatNullableNumber(settings.max_lot_size)} enabled disabled={disabled} T={T} styles={styles} />
        <RiskControlRow label="Max Open Trades" value={formatNumber(settings.max_open_trades)} enabled disabled={disabled} T={T} styles={styles} />
      </View>

      <View style={styles.riskGroup}>
        <Text style={styles.riskGroupTitle}>Restrictions</Text>
        <RiskControlRow label="News Trading" value={settings.news_trading_allowed ? 'Allowed' : 'Blocked'} enabled={settings.news_trading_allowed} disabled={disabled} warningWhenEnabled T={T} styles={styles} />
        <RiskControlRow label="Weekend Trading" value={settings.weekend_trading_allowed ? 'Allowed' : 'Blocked'} enabled={settings.weekend_trading_allowed} disabled={disabled} warningWhenEnabled T={T} styles={styles} />
      </View>

      <View style={styles.emergencyRow}>
        <View>
          <Text style={styles.emergencyTitle}>Emergency Stop</Text>
          <Text style={styles.emergencySubtitle}>{settings.emergency_stop_status}</Text>
        </View>
        <Pressable style={styles.emergencyButton} onPress={onEmergencyStop}>
          <Ionicons name="stop-circle-outline" size={16} color="#FFFFFF" />
          <Text style={styles.emergencyButtonText}>Stop All</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RiskControlRow({
  label,
  value,
  enabled,
  disabled,
  warningWhenEnabled = false,
  T,
  styles,
}: {
  label: string;
  value: string;
  enabled: boolean;
  disabled: boolean;
  warningWhenEnabled?: boolean;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <View style={styles.riskRow}>
      <View style={styles.riskCopy}>
        <Text style={styles.riskLabel}>{label}</Text>
        <Text style={[styles.riskValue, warningWhenEnabled && enabled ? styles.riskWarningText : null]}>{value}</Text>
      </View>
      <Switch
        value={enabled}
        disabled={disabled}
        onValueChange={() => undefined}
        trackColor={{
          false: withAlpha(palette.secondary, 0.34),
          true: withAlpha(warningWhenEnabled ? palette.warning : palette.primary, 0.42),
        }}
        thumbColor={enabled ? (warningWhenEnabled ? palette.warning : palette.primary) : palette.secondary}
      />
    </View>
  );
}

function RecentAlgoActivity({
  activities,
  T,
  styles,
}: {
  activities: RecentActivityItem[];
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionHeader title="Recent Activity" styles={styles} />
      <View style={styles.activityPanel}>
        {activities.length ? (
          activities.map((activity, index) => (
            <ActivityRow
              key={activity.activity_id}
              activity={activity}
              isLast={index === activities.length - 1}
              T={T}
              styles={styles}
            />
          ))
        ) : (
          <EmptyState title="No recent algo activity." subtitle="Automation events will appear here." styles={styles} />
        )}
      </View>
    </View>
  );
}

function ActivityRow({
  activity,
  isLast,
  T,
  styles,
}: {
  activity: RecentActivityItem;
  isLast: boolean;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const severityMeta = getActivitySeverityMeta(activity.severity, T);

  return (
    <View style={[styles.activityRow, isLast && styles.activityRowLast]}>
      <View style={[styles.activityIcon, { backgroundColor: severityMeta.tint }]}>
        <Ionicons name={severityMeta.icon} size={15} color={severityMeta.color} />
      </View>
      <View style={styles.activityBody}>
        <View style={styles.activityTopRow}>
          <Text style={styles.activityTitle} numberOfLines={1}>{activity.activity_type}</Text>
          <Text style={styles.activityTime}>{formatShortTime(activity.timestamp)}</Text>
        </View>
        <Text style={styles.activityMessage} numberOfLines={2}>{activity.message}</Text>
        <View style={styles.activityFooter}>
          <Text style={styles.activityStrategy} numberOfLines={1}>{activity.strategy_name}</Text>
          {activity.symbol ? <SmallChip label={activity.symbol} styles={styles} /> : null}
          <StatusBadge label={activity.status} color={severityMeta.color} styles={styles} />
        </View>
      </View>
    </View>
  );
}

type LibraryOption = { id: AlgoStrategyLibraryFilter; label: string };
type SortOption = { id: AlgoStrategySortOption; label: string };

const LIBRARY_OPTIONS: LibraryOption[] = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'favorites', label: 'Favorites' },
];

const RISK_OPTIONS: AlgoRiskLevel[] = ['Low', 'Medium', 'High'];

const SORT_OPTIONS: SortOption[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'popular', label: 'Most popular' },
  { id: 'rating', label: 'Top rated' },
];

function AlgoFilterSheet({
  visible,
  filters,
  strategies,
  onClose,
  onApply,
  onReset,
  T,
  styles,
}: {
  visible: boolean;
  filters: AlgoStrategyFilters;
  strategies: Strategy[];
  onClose: () => void;
  onApply: (next: AlgoStrategyFilters) => void;
  onReset: () => void;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  // Local draft so users can play with toggles before committing via Apply.
  const [draft, setDraft] = useState<AlgoStrategyFilters>(filters);

  // Resync draft whenever the sheet reopens with the current applied filters.
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const palette = getAlgoUiPalette(T);
  // Live result count for the Apply button so users see what their toggles
  // will produce before committing. Ignores the category tab — the sheet is
  // orthogonal to it; users can verify their narrowing in the page after.
  const previewCount = useMemo(
    () => (visible ? applyAlgoStrategyFilters(strategies, draft).length : 0),
    [strategies, draft, visible],
  );

  const toggleRisk = (level: AlgoRiskLevel) => {
    setDraft((prev) => ({
      ...prev,
      riskLevels: prev.riskLevels.includes(level)
        ? prev.riskLevels.filter((existing) => existing !== level)
        : [...prev.riskLevels, level],
    }));
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.filterSheetOverlay}>
        <Pressable style={styles.filterSheetBackdrop} onPress={onClose} />
        <View style={styles.filterSheet}>
          <View style={styles.filterSheetHandle} />
          <View style={styles.filterSheetHeader}>
            <Text style={styles.filterSheetTitle}>Filters</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={styles.filterSheetCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close filters"
            >
              <Ionicons name="close" size={18} color={palette.secondary} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'} showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterSheetBody}>
            <FilterSection title="Library" styles={styles}>
              <View style={styles.filterChipRow}>
                {LIBRARY_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.id}
                    label={option.label}
                    selected={draft.library === option.id}
                    onPress={() => setDraft((prev) => ({ ...prev, library: option.id }))}
                    palette={palette}
                    styles={styles}
                  />
                ))}
              </View>
            </FilterSection>

            <FilterSection title="Risk level" styles={styles}>
              <View style={styles.filterChipRow}>
                {RISK_OPTIONS.map((level) => (
                  <FilterChip
                    key={level}
                    label={level}
                    selected={draft.riskLevels.includes(level)}
                    onPress={() => toggleRisk(level)}
                    palette={palette}
                    styles={styles}
                  />
                ))}
              </View>
            </FilterSection>

            <FilterSection title="Verification" styles={styles}>
              <FilterToggleRow
                label="Verified seller only"
                value={draft.verifiedSellerOnly}
                onValueChange={(next) => setDraft((prev) => ({ ...prev, verifiedSellerOnly: next }))}
                palette={palette}
                styles={styles}
              />
              <FilterToggleRow
                label="Live-verified track record"
                value={draft.liveVerifiedOnly}
                onValueChange={(next) => setDraft((prev) => ({ ...prev, liveVerifiedOnly: next }))}
                palette={palette}
                styles={styles}
              />
            </FilterSection>

            <FilterSection title="Sort by" styles={styles}>
              <View style={styles.filterChipRow}>
                {SORT_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.id}
                    label={option.label}
                    selected={draft.sort === option.id}
                    onPress={() => setDraft((prev) => ({ ...prev, sort: option.id }))}
                    palette={palette}
                    styles={styles}
                  />
                ))}
              </View>
            </FilterSection>
          </ScrollView>

          <View style={styles.filterSheetFooter}>
            <Pressable
              style={styles.filterResetButton}
              onPress={() => {
                setDraft(DEFAULT_ALGO_STRATEGY_FILTERS);
                onReset();
              }}
              hitSlop={6}
            >
              <Text style={styles.filterResetButtonText}>Reset</Text>
            </Pressable>
            <Pressable
              style={styles.filterApplyButton}
              onPress={() => onApply(draft)}
              hitSlop={6}
            >
              <Text style={styles.filterApplyButtonText}>
                Apply · {previewCount} {previewCount === 1 ? 'result' : 'results'}
              </Text>
            </Pressable>
          </View>
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
  children: React.ReactNode;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
  palette,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  palette: ReturnType<typeof getAlgoUiPalette>;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.filterChip,
        selected && {
          borderColor: palette.primary,
          backgroundColor: withAlpha(palette.primary, 0.16),
        },
      ]}
    >
      <Text style={[styles.filterChipText, selected && { color: palette.primary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterToggleRow({
  label,
  value,
  onValueChange,
  palette,
  styles,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  palette: ReturnType<typeof getAlgoUiPalette>;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.filterToggleRow}>
      <Text style={styles.filterToggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: withAlpha(palette.secondary, 0.34),
          true: withAlpha(palette.primary, 0.42),
        }}
        thumbColor={value ? palette.primary : palette.secondary}
      />
    </View>
  );
}

function ConfirmationModal({
  config,
  onClose,
  styles,
}: {
  config: ConfirmationConfig | null;
  onClose: () => void;
  styles: Mql5AlgoTradingStyles;
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

function SectionHeader({ title, styles }: { title: string; styles: Mql5AlgoTradingStyles }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function StatusBadge({ label, color, styles }: { label: string; color: string; styles: Mql5AlgoTradingStyles }) {
  return (
    <View style={[styles.statusBadge, { borderColor: color, backgroundColor: withAlpha(color, 0.12) }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function InlineMetric({
  label,
  value,
  valueColor,
  showDivider = false,
  styles,
}: {
  label: string;
  value: string;
  valueColor?: string;
  showDivider?: boolean;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={[styles.inlineMetric, showDivider && styles.inlineMetricDivider]}>
      <Text style={styles.inlineMetricLabel}>{label}</Text>
      <Text style={[styles.inlineMetricValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SmallChip({ label, styles }: { label: string; styles: Mql5AlgoTradingStyles }) {
  return (
    <View style={styles.smallChip}>
      <Text style={styles.smallChipText}>{label}</Text>
    </View>
  );
}

function Sparkline({ values, color, styles }: { values: number[]; color: string; styles: Mql5AlgoTradingStyles }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);

  return (
    <View style={styles.sparkline}>
      {values.map((value, index) => {
        const height = 12 + ((value - min) / range) * 32;

        return <View key={`${value}-${index}`} style={[styles.sparklineBar, { height, backgroundColor: color }]} />;
      })}
    </View>
  );
}

function StateBanner({
  icon,
  title,
  actionLabel,
  tone,
  T,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  actionLabel?: string;
  tone: 'warning' | 'neutral';
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);
  const color = tone === 'warning' ? palette.warning : palette.primary;

  return (
    <View style={[styles.stateBanner, { borderColor: withAlpha(color, 0.32) }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.stateBannerText}>{title}</Text>
      {actionLabel ? (
        <Pressable style={styles.stateBannerButton}>
          <Text style={[styles.stateBannerButtonText, { color }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function OfflineState({ T, styles }: { T: ThemeColors; styles: Mql5AlgoTradingStyles }) {
  return (
    <StateBanner
      icon="cloud-offline-outline"
      title="You are offline. Showing last synced algo data."
      tone="neutral"
      T={T}
      styles={styles}
    />
  );
}

function ErrorState({
  title,
  buttonLabel,
  T,
  styles,
}: {
  title: string;
  buttonLabel: string;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <View style={styles.errorState}>
      <Ionicons name="warning-outline" size={24} color={palette.warning} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Pressable style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({
  title,
  subtitle,
  styles,
}: {
  title: string;
  subtitle: string;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

function AlgoSkeletonLoader({ styles }: { styles: Mql5AlgoTradingStyles }) {
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

function getConnectionMeta(status: AccountConnectionStatus | undefined, T: ThemeColors) {
  const palette = getAlgoUiPalette(T);

  switch (status) {
    case 'Connected':
      return { color: palette.success };
    case 'Syncing':
      return { color: palette.primary };
    case 'Error':
      return { color: palette.danger };
    case 'Disconnected':
    default:
      return { color: palette.warning };
  }
}

function getAlgoStatusMeta(status: AlgoTradingStatus | undefined, T: ThemeColors) {
  const palette = getAlgoUiPalette(T);

  switch (status) {
    case 'Enabled':
      return { color: palette.success };
    case 'Paused':
      return { color: palette.warning };
    case 'Disabled':
    default:
      return { color: palette.danger };
  }
}

function getRiskMeta(risk: AlgoRiskLevel, T: ThemeColors) {
  const palette = getAlgoUiPalette(T);

  switch (risk) {
    case 'High':
      return { color: palette.danger };
    case 'Medium':
      return { color: palette.warning };
    case 'Low':
    default:
      return { color: palette.primary };
  }
}

function getBotStatusMeta(status: BotStatus, T: ThemeColors): { color: string; icon: keyof typeof Ionicons.glyphMap } {
  const palette = getAlgoUiPalette(T);

  switch (status) {
    case 'Running':
      return { color: palette.success, icon: 'play-circle-outline' };
    case 'Paused':
      return { color: palette.warning, icon: 'pause-circle-outline' };
    case 'Error':
      return { color: palette.danger, icon: 'alert-circle-outline' };
    case 'Stopped':
    default:
      return { color: palette.secondary, icon: 'stop-circle-outline' };
  }
}

function getActivitySeverityMeta(severity: ActivitySeverity, T: ThemeColors) {
  const palette = getAlgoUiPalette(T);

  switch (severity) {
    case 'success':
      return { color: palette.success, tint: withAlpha(palette.success, 0.12), icon: 'checkmark-circle-outline' as const };
    case 'warning':
      return { color: palette.warning, tint: withAlpha(palette.warning, 0.14), icon: 'warning-outline' as const };
    case 'error':
      return { color: palette.danger, tint: withAlpha(palette.danger, 0.12), icon: 'alert-circle-outline' as const };
    case 'neutral':
    default:
      return { color: palette.secondary, tint: withAlpha(palette.secondary, 0.14), icon: 'information-circle-outline' as const };
  }
}

function getPnlTone(value: number | null | undefined): 'positive' | 'danger' | 'neutral' {
  if (typeof value !== 'number') return 'neutral';
  if (value > 0) return 'positive';
  if (value < 0) return 'danger';
  return 'neutral';
}

function getRiskScoreTone(value: number | null | undefined): 'positive' | 'warning' | 'danger' | 'neutral' {
  if (typeof value !== 'number') return 'neutral';
  if (value >= 70) return 'danger';
  if (value >= 40) return 'warning';
  return 'positive';
}

function getToneColor(tone: 'positive' | 'danger' | 'warning' | 'neutral', T: ThemeColors): string {
  const palette = getAlgoUiPalette(T);

  if (tone === 'positive') return palette.success;
  if (tone === 'danger') return palette.danger;
  if (tone === 'warning') return palette.warning;
  return palette.text;
}

function getPnlColor(value: number | null | undefined, T: ThemeColors): string {
  const palette = getAlgoUiPalette(T);

  if (typeof value !== 'number') return palette.secondary;
  if (value > 0) return palette.success;
  if (value < 0) return palette.danger;
  return palette.secondary;
}

function getAlgoUiPalette(T: ThemeColors) {
  const isDark = T.text === '#F8FAFC' || T.bgRoot === '#020617';

  return isDark
    ? {
        primary: '#38BDF8',
        success: '#22C55E',
        warning: '#FBBF24',
        danger: '#F87171',
        text: '#F8FAFC',
        secondary: '#94A3B8',
      }
    : {
        primary: '#0EA5E9',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        text: '#111827',
        secondary: '#64748B',
      };
}

function formatCurrency(value: number | null | undefined, currency = ''): string {
  if (typeof value !== 'number') return '--';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const label = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${currency ? `${currency} ` : ''}${label}`;
}

function formatUnsignedCurrency(value: number | null | undefined, currency = ''): string {
  if (typeof value !== 'number') return '--';
  const label = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency ? `${currency} ` : ''}${label}`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number') return '--';
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number') return '--';
  return value.toLocaleString();
}

function formatNullableNumber(value: number | null | undefined): string {
  if (typeof value !== 'number') return '--';
  return String(value);
}

function formatCompactCount(value: number | null | undefined): string {
  if (typeof value !== 'number') return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function formatMonthlyPrice(value: string | null | undefined): string {
  return value ?? 'On request';
}

function formatLastSync(value: string | null | undefined): string {
  if (!value) return 'Last sync unavailable';
  return `Last sync ${formatShortTime(value)}`;
}

function formatShortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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

function getAlgoScreenGradient(isDark: boolean): readonly [string, string, string] {
  return isDark
    ? ['#07111F', '#07111F', '#07111F']
    : ['#F5F8FC', '#F5F8FC', '#F5F8FC'];
}

function getAccountCardGradient(accountConnected: boolean, isDark: boolean): readonly [string, string] {
  if (accountConnected) {
    return isDark ? ['#111827', '#111827'] : ['#FFFFFF', '#FFFFFF'];
  }

  return isDark ? ['#111827', '#111827'] : ['#FFFFFF', '#FFFFFF'];
}
