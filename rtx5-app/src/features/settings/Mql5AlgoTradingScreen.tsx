/**
 * Settings Feature UI: Mql5AlgoTradingScreen
 *
 * API-ready command center for MQL5 Expert Advisors, active automation,
 * account connection state, risk controls, and recent algo activity.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { makeMql5AlgoTradingStyles, type Mql5AlgoTradingStyles } from './Mql5AlgoTradingScreen.styles';
import {
  MQL5_ALGO_PREVIEW_DATA,
  filterStrategiesByCategory,
  hasConnectedAlgoAccount,
  selectAlgoCategories,
  type AccountConnectionStatus,
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
  type UserUiState,
} from './mql5AlgoTradingViewModel';

type ConfirmationConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'warning' | 'danger';
  onConfirm: () => void;
};

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

  const categories = useMemo(
    () => selectAlgoCategories(screenData.categories, selectedCategory),
    [screenData.categories, selectedCategory],
  );
  const visibleStrategies = useMemo(
    () => filterStrategiesByCategory(screenData.featuredStrategies, selectedCategory),
    [screenData.featuredStrategies, selectedCategory],
  );

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
        <AlgoHeader uiState={screenData.uiState} T={T} styles={styles} />
      </View>

      <ScrollView
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

        {showLoading ? (
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
    </Screen>
  );
}

function AlgoScreenContent({
  data,
  categories,
  visibleStrategies,
  accountConnected,
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
      <ConnectedAccountCard account={data.account} accountConnected={accountConnected} isDark={isDark} T={T} styles={styles} />
      <PerformanceOverviewCard performance={data.performance} currency={data.account?.currency} T={T} styles={styles} />
      <AlgoCategoryTabs categories={categories} onSelect={onSelectCategory} styles={styles} />
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
  );
}

function AlgoHeader({
  uiState,
  T,
  styles,
}: {
  uiState: UserUiState;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title} numberOfLines={1}>MQL5 Algo Trading</Text>
        <Text style={styles.subtitle} numberOfLines={1}>Automated strategy control center</Text>
      </View>

      <View style={styles.headerActions}>
        <HeaderIcon icon="search" T={T} styles={styles} />
        <HeaderIcon icon="options-outline" T={T} styles={styles} />
        <Pressable style={styles.headerIconButton} hitSlop={8}>
          <Ionicons name="notifications-outline" size={21} color={palette.secondary} />
          {uiState.notification_count > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationText}>{uiState.notification_count}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{uiState.user_avatar ?? 'U'}</Text>
          <View style={[styles.userStatusDot, { backgroundColor: getUserStatusColor(uiState.user_status, T) }]} />
        </View>
      </View>
    </View>
  );
}

function HeaderIcon({
  icon,
  T,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const palette = getAlgoUiPalette(T);

  return (
    <Pressable style={styles.headerIconButton} hitSlop={8}>
      <Ionicons name={icon} size={21} color={palette.secondary} />
    </Pressable>
  );
}

function ConnectedAccountCard({
  account,
  accountConnected,
  isDark,
  T,
  styles,
}: {
  account: UserAccount | null;
  accountConnected: boolean;
  isDark: boolean;
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  const connectionMeta = getConnectionMeta(account?.connection_status, T);
  const algoMeta = getAlgoStatusMeta(account?.algo_trading_status, T);
  const palette = getAlgoUiPalette(T);

  return (
    <LinearGradient
      colors={getAccountCardGradient(accountConnected, isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, accountConnected ? styles.connectedCard : styles.warningCard]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIcon}>
            <Ionicons name="server-outline" size={18} color={palette.primary} />
          </View>
          <View>
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
        <View style={styles.badgeColumn}>
          <StatusBadge label={account?.connection_status ?? 'Disconnected'} color={connectionMeta.color} styles={styles} />
          <StatusBadge label={account?.algo_trading_status ?? 'Disabled'} color={algoMeta.color} styles={styles} />
        </View>
      </View>

      {accountConnected ? (
        <View style={styles.accountMetrics}>
          <InlineMetric label="Balance" value={formatCurrency(account?.balance, account?.currency)} styles={styles} />
          <InlineMetric label="Equity" value={formatCurrency(account?.equity, account?.currency)} styles={styles} />
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
    { label: 'Today P/L', value: formatCurrency(performance?.today_pnl, currency), tone: getPnlTone(performance?.today_pnl) },
    { label: 'Active Bots', value: formatNumber(performance?.total_active_bots), tone: 'neutral' as const },
    { label: 'Win Rate', value: formatPercent(performance?.win_rate), tone: 'neutral' as const },
    { label: 'Open Trades', value: formatNumber(performance?.open_trades), tone: 'neutral' as const },
    { label: 'Max Drawdown', value: formatPercent(performance?.max_drawdown), tone: 'danger' as const },
    { label: 'Risk Score', value: formatNumber(performance?.risk_score), tone: getRiskScoreTone(performance?.risk_score) },
  ];

  return (
    <View style={styles.card}>
      <SectionHeader title="Performance Snapshot" styles={styles} />
      <View style={styles.performanceGrid}>
        {metricTiles.map((tile) => (
          <MetricTile key={tile.label} label={tile.label} value={tile.value} tone={tile.tone} T={T} styles={styles} />
        ))}
      </View>
      {performance?.sparkline_data.length ? (
        <View style={styles.sparklineRow}>
          <Sparkline values={performance.sparkline_data} color={getPnlColor(performance.net_pnl, T)} styles={styles} />
          <View style={styles.symbolRail}>
            {performance.active_symbols.slice(0, 4).map((symbol) => (
              <SmallChip key={symbol} label={symbol} styles={styles} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MetricTile({
  label,
  value,
  tone,
  T,
  styles,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'danger' | 'warning' | 'neutral';
  T: ThemeColors;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: getToneColor(tone, T) }]}>{value}</Text>
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strategyRail}>
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
  const riskMeta = getRiskMeta(strategy.risk_level, T);
  const palette = getAlgoUiPalette(T);
  const performanceLabel = strategy.live_verified || strategy.performance_summary ? strategy.performance_summary ?? 'Live verified' : 'Unverified';

  return (
    <View style={styles.strategyCard}>
      <View style={styles.strategyTopRow}>
        <View style={styles.providerAvatar}>
          <Text style={styles.providerAvatarText}>{strategy.provider_avatar ?? strategy.provider_name.slice(0, 2)}</Text>
        </View>
        <Pressable style={styles.favoriteButton}>
          <Ionicons name={strategy.is_favorite ? 'bookmark' : 'bookmark-outline'} size={18} color={strategy.is_favorite ? palette.warning : palette.secondary} />
        </Pressable>
      </View>

      <View style={styles.strategyTitleRow}>
        <Text style={styles.strategyTitle} numberOfLines={2}>{strategy.strategy_name}</Text>
        {strategy.verified_status ? <VerifiedBadge styles={styles} /> : null}
      </View>
      <Text style={styles.strategyProvider} numberOfLines={1}>{strategy.provider_name}</Text>

      <View style={styles.badgeWrap}>
        <TextChip label={strategy.strategy_type} styles={styles} />
        <StatusBadge label={strategy.risk_level} color={riskMeta.color} styles={styles} />
        <StatusBadge label={performanceLabel} color={strategy.live_verified ? palette.success : palette.secondary} styles={styles} />
      </View>

      <Text style={styles.strategyMarketLine} numberOfLines={1}>
        {strategy.supported_symbols.slice(0, 2).join(', ')} / {strategy.supported_timeframes.slice(0, 2).join(', ')}
      </Text>

      <View style={styles.strategyStats}>
        <InlineMetric label="Rating" value={strategy.rating ? strategy.rating.toFixed(1) : 'Unrated'} styles={styles} />
        <InlineMetric label="Users" value={formatCompactCount(strategy.users_count)} styles={styles} />
        <InlineMetric label="Price" value={formatMonthlyPrice(strategy.monthly_price)} styles={styles} />
      </View>

      <View style={styles.strategyActions}>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>View</Text>
        </Pressable>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Connect</Text>
        </Pressable>
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

function ConfirmationModal({
  config,
  onClose,
  styles,
}: {
  config: ConfirmationConfig | null;
  onClose: () => void;
  styles: Mql5AlgoTradingStyles;
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

function VerifiedBadge({ styles }: { styles: Mql5AlgoTradingStyles }) {
  return (
    <View style={styles.verifiedBadge}>
      <Ionicons name="checkmark" size={9} color="#07111F" />
    </View>
  );
}

function InlineMetric({
  label,
  value,
  valueColor,
  styles,
}: {
  label: string;
  value: string;
  valueColor?: string;
  styles: Mql5AlgoTradingStyles;
}) {
  return (
    <View style={styles.inlineMetric}>
      <Text style={styles.inlineMetricLabel}>{label}</Text>
      <Text style={[styles.inlineMetricValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function TextChip({ label, styles }: { label: string; styles: Mql5AlgoTradingStyles }) {
  return (
    <View style={styles.textChip}>
      <Text style={styles.textChipText}>{label}</Text>
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

function getUserStatusColor(status: UserUiState['user_status'], T: ThemeColors): string {
  const palette = getAlgoUiPalette(T);

  if (status === 'online') return palette.success;
  if (status === 'syncing') return palette.warning;
  return palette.secondary;
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
