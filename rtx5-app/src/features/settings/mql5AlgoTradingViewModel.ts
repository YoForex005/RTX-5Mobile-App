import type { Ionicons } from '@expo/vector-icons';

export type AccountConnectionStatus = 'Connected' | 'Disconnected' | 'Syncing' | 'Error';
export type AlgoTradingStatus = 'Enabled' | 'Disabled' | 'Paused';
export type AlgoRiskLevel = 'Low' | 'Medium' | 'High';
export type BotStatus = 'Running' | 'Paused' | 'Stopped' | 'Error';
export type ActivitySeverity = 'success' | 'warning' | 'error' | 'neutral';
export type RiskSavingStatus = 'idle' | 'saving' | 'error';
export type LoadingStatus = 'idle' | 'loading' | 'error';
export type ActiveModal = 'stopBot' | 'disableAlgo' | 'emergencyStop' | null;

export type UserAccount = {
  account_id: string;
  account_label: string;
  account_number_masked: string;
  broker_server: string;
  account_type: string;
  connection_status: AccountConnectionStatus;
  algo_trading_status: AlgoTradingStatus;
  balance: number | null;
  equity: number | null;
  free_margin: number | null;
  currency: string;
  last_sync_time: string | null;
};

export type PerformanceOverview = {
  total_active_bots: number | null;
  total_installed_strategies: number | null;
  open_trades: number | null;
  total_closed_trades: number | null;
  today_pnl: number | null;
  today_pnl_percentage: number | null;
  net_pnl: number | null;
  net_pnl_percentage: number | null;
  win_rate: number | null;
  max_drawdown: number | null;
  risk_score: number | null;
  active_symbols: string[];
  sparkline_data: number[];
};

export type AlgoCategory = {
  category_id: string;
  category_name: string;
  is_selected: boolean;
  strategy_count: number;
};

export type Strategy = {
  strategy_id: string;
  strategy_name: string;
  strategy_type: string;
  provider_name: string;
  provider_avatar?: string;
  verified_status: boolean;
  live_verified: boolean;
  backtest_available: boolean;
  supported_symbols: string[];
  supported_timeframes: string[];
  risk_level: AlgoRiskLevel;
  rating: number | null;
  users_count: number | null;
  monthly_price: string | null;
  trial_available: boolean;
  performance_summary: string | null;
  is_installed: boolean;
  is_favorite: boolean;
};

export type ActiveBot = {
  bot_id: string;
  strategy_id: string;
  strategy_name: string;
  account_id: string;
  symbol: string;
  timeframe: string;
  status: BotStatus;
  runtime: string | null;
  open_trades: number | null;
  today_pnl: number | null;
  max_drawdown: number | null;
  lot_mode: string | null;
  risk_mode: string | null;
  last_trade_time: string | null;
  last_signal: string | null;
  error_status: string | null;
};

export type RiskSettings = {
  max_daily_loss_enabled: boolean;
  max_daily_loss_value: number | null;
  max_total_drawdown_enabled: boolean;
  max_total_drawdown_value: number | null;
  max_lot_size: number | null;
  max_open_trades: number | null;
  news_trading_allowed: boolean;
  weekend_trading_allowed: boolean;
  auto_stop_on_drawdown: boolean;
  emergency_stop_status: 'Ready' | 'Triggered' | 'Unavailable';
  saving_status: RiskSavingStatus;
};

export type RecentActivityItem = {
  activity_id: string;
  activity_type: string;
  strategy_name: string;
  symbol?: string;
  message: string;
  timestamp: string;
  status: string;
  severity: ActivitySeverity;
};

export type UserUiState = {
  notification_count: number;
  user_avatar?: string;
  user_status: 'online' | 'offline' | 'syncing';
  selected_category: string;
  selected_strategy_id?: string;
  saved_strategy_ids: string[];
  active_modal: ActiveModal;
  loading_status: LoadingStatus;
  offline_status: boolean;
  risk_limit_triggered: boolean;
  permission_required: boolean;
};

export type Mql5AlgoTradingScreenData = {
  account: UserAccount | null;
  performance: PerformanceOverview | null;
  categories: AlgoCategory[];
  featuredStrategies: Strategy[];
  activeBots: ActiveBot[];
  riskSettings: RiskSettings | null;
  recentActivity: RecentActivityItem[];
  uiState: UserUiState;
};

export type BottomNavItem = {
  id: 'home' | 'markets' | 'trade' | 'algo' | 'profile';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
};

export const MQL5_ALGO_NAV_ITEMS: BottomNavItem[] = [
  { id: 'home', label: 'Home', icon: 'home-outline', route: '/(tabs)/quotes' },
  { id: 'markets', label: 'Markets', icon: 'bar-chart-outline', route: '/(tabs)/chart' },
  { id: 'trade', label: 'Trade', icon: 'swap-vertical-outline', route: '/(tabs)/trade' },
  { id: 'algo', label: 'Algo', icon: 'hardware-chip' },
  { id: 'profile', label: 'Profile', icon: 'person-outline', route: '/(tabs)/settings' },
];

export const MQL5_ALGO_PREVIEW_DATA: Mql5AlgoTradingScreenData = {
  account: {
    account_id: 'preview-account',
    account_label: 'Primary Trading Account',
    account_number_masked: '**** 4821',
    broker_server: 'MT5 Server',
    account_type: 'Live',
    connection_status: 'Connected',
    algo_trading_status: 'Enabled',
    balance: 24860.4,
    equity: 25114.72,
    free_margin: 18732.18,
    currency: 'USD',
    last_sync_time: '2026-05-13T09:20:00.000Z',
  },
  performance: {
    total_active_bots: 2,
    total_installed_strategies: 5,
    open_trades: 3,
    total_closed_trades: 128,
    today_pnl: 184.2,
    today_pnl_percentage: 0.74,
    net_pnl: 1248.7,
    net_pnl_percentage: 5.28,
    win_rate: 61.4,
    max_drawdown: 4.8,
    risk_score: 32,
    active_symbols: ['XAUUSD', 'EURUSD', 'US30'],
    sparkline_data: [-8, 4, 8, 14, 18, 20, 28, 24, 34, 38, 45, 52, 58, 63],
  },
  categories: [
    { category_id: 'all', category_name: 'All', is_selected: true, strategy_count: 5 },
    { category_id: 'scalping', category_name: 'Scalping', is_selected: false, strategy_count: 2 },
    { category_id: 'trend', category_name: 'Trend', is_selected: false, strategy_count: 1 },
    { category_id: 'grid', category_name: 'Grid', is_selected: false, strategy_count: 1 },
    { category_id: 'gold', category_name: 'Gold', is_selected: false, strategy_count: 2 },
    { category_id: 'news', category_name: 'News', is_selected: false, strategy_count: 1 },
    { category_id: 'low-risk', category_name: 'Low Risk', is_selected: false, strategy_count: 2 },
  ],
  featuredStrategies: [
    {
      strategy_id: 'ea-session-guard',
      strategy_name: 'Session Guard EA',
      strategy_type: 'Scalping',
      provider_name: 'Strategy Desk',
      provider_avatar: 'SD',
      verified_status: true,
      live_verified: true,
      backtest_available: true,
      supported_symbols: ['XAUUSD', 'EURUSD'],
      supported_timeframes: ['M5', 'M15'],
      risk_level: 'Medium',
      rating: 4.6,
      users_count: 1840,
      monthly_price: '$49/mo',
      trial_available: true,
      performance_summary: 'Live verified',
      is_installed: true,
      is_favorite: true,
    },
    {
      strategy_id: 'ea-trend-matrix',
      strategy_name: 'Trend Matrix Robot',
      strategy_type: 'Trend',
      provider_name: 'Algo Lab',
      provider_avatar: 'AL',
      verified_status: true,
      live_verified: false,
      backtest_available: true,
      supported_symbols: ['EURUSD', 'GBPUSD'],
      supported_timeframes: ['H1', 'H4'],
      risk_level: 'Low',
      rating: 4.3,
      users_count: 920,
      monthly_price: '$35/mo',
      trial_available: true,
      performance_summary: 'Backtest available',
      is_installed: false,
      is_favorite: false,
    },
    {
      strategy_id: 'ea-news-shield',
      strategy_name: 'News Shield Automation',
      strategy_type: 'News Filter',
      provider_name: 'Risk Desk',
      provider_avatar: 'RD',
      verified_status: false,
      live_verified: false,
      backtest_available: false,
      supported_symbols: ['Forex Majors'],
      supported_timeframes: ['M15', 'H1'],
      risk_level: 'High',
      rating: null,
      users_count: null,
      monthly_price: null,
      trial_available: false,
      performance_summary: null,
      is_installed: false,
      is_favorite: false,
    },
  ],
  activeBots: [
    {
      bot_id: 'bot-session-guard-xau',
      strategy_id: 'ea-session-guard',
      strategy_name: 'Session Guard EA',
      account_id: 'preview-account',
      symbol: 'XAUUSD',
      timeframe: 'M5',
      status: 'Running',
      runtime: '6h 24m',
      open_trades: 2,
      today_pnl: 126.4,
      max_drawdown: 2.1,
      lot_mode: 'Fixed',
      risk_mode: 'Controlled',
      last_trade_time: '2026-05-13T08:55:00.000Z',
      last_signal: 'Breakout confirmed',
      error_status: null,
    },
    {
      bot_id: 'bot-trend-eur',
      strategy_id: 'ea-trend-matrix',
      strategy_name: 'Trend Matrix Robot',
      account_id: 'preview-account',
      symbol: 'EURUSD',
      timeframe: 'H1',
      status: 'Paused',
      runtime: '1d 3h',
      open_trades: 1,
      today_pnl: -18.8,
      max_drawdown: 3.4,
      lot_mode: 'Risk based',
      risk_mode: 'Low',
      last_trade_time: '2026-05-13T07:10:00.000Z',
      last_signal: 'Trend hold',
      error_status: null,
    },
  ],
  riskSettings: {
    max_daily_loss_enabled: true,
    max_daily_loss_value: 350,
    max_total_drawdown_enabled: true,
    max_total_drawdown_value: 7.5,
    max_lot_size: 0.2,
    max_open_trades: 5,
    news_trading_allowed: false,
    weekend_trading_allowed: false,
    auto_stop_on_drawdown: true,
    emergency_stop_status: 'Ready',
    saving_status: 'idle',
  },
  recentActivity: [
    {
      activity_id: 'activity-risk-sync',
      activity_type: 'Connection synced',
      strategy_name: 'Account Bridge',
      symbol: 'MT5',
      message: 'Account and automation permissions synced.',
      timestamp: '2026-05-13T09:20:00.000Z',
      status: 'Synced',
      severity: 'success',
    },
    {
      activity_id: 'activity-trade-opened',
      activity_type: 'Trade opened',
      strategy_name: 'Session Guard EA',
      symbol: 'XAUUSD',
      message: 'Automation opened a trade after signal confirmation.',
      timestamp: '2026-05-13T08:55:00.000Z',
      status: 'Executed',
      severity: 'success',
    },
    {
      activity_id: 'activity-news-block',
      activity_type: 'Risk limit triggered',
      strategy_name: 'News Shield Automation',
      symbol: 'EURUSD',
      message: 'News window protection blocked new entries.',
      timestamp: '2026-05-13T08:05:00.000Z',
      status: 'Guarded',
      severity: 'warning',
    },
  ],
  uiState: {
    notification_count: 3,
    user_avatar: 'AX',
    user_status: 'online',
    selected_category: 'all',
    selected_strategy_id: undefined,
    saved_strategy_ids: ['ea-session-guard'],
    active_modal: null,
    loading_status: 'idle',
    offline_status: false,
    risk_limit_triggered: false,
    permission_required: false,
  },
};

// ─── Filter sheet ──────────────────────────────────────────────────────────
//
// v1 trim: only the filters that materially help users narrow the strategy
// list. Strategy *type* (Scalping/Trend/Grid…) is already covered by the
// horizontal category tab rail, and free-text is covered by the header
// search. Anything not tied to a real `Strategy` field is intentionally
// excluded so toggles never silently no-op.

export type AlgoStrategyLibraryFilter = 'all' | 'installed' | 'favorites';

export type AlgoStrategySortOption =
  | 'recommended' // Default order (no sort)
  | 'popular'     // users_count desc
  | 'rating';     // rating desc (nulls last)

export type AlgoStrategyFilters = {
  library: AlgoStrategyLibraryFilter;
  riskLevels: AlgoRiskLevel[];
  verifiedSellerOnly: boolean;
  liveVerifiedOnly: boolean;
  sort: AlgoStrategySortOption;
};

export const DEFAULT_ALGO_STRATEGY_FILTERS: AlgoStrategyFilters = {
  library: 'all',
  riskLevels: [],
  verifiedSellerOnly: false,
  liveVerifiedOnly: false,
  sort: 'recommended',
};

export function applyAlgoStrategyFilters(
  strategies: Strategy[],
  filters: AlgoStrategyFilters,
): Strategy[] {
  const filtered = strategies.filter((strategy) => {
    if (filters.library === 'installed' && !strategy.is_installed) return false;
    if (filters.library === 'favorites' && !strategy.is_favorite) return false;
    if (filters.riskLevels.length > 0 && !filters.riskLevels.includes(strategy.risk_level)) return false;
    if (filters.verifiedSellerOnly && !strategy.verified_status) return false;
    if (filters.liveVerifiedOnly && !strategy.live_verified) return false;
    return true;
  });

  return sortAlgoStrategies(filtered, filters.sort);
}

export function sortAlgoStrategies(
  strategies: Strategy[],
  sort: AlgoStrategySortOption,
): Strategy[] {
  if (sort === 'recommended') return strategies;
  const next = [...strategies];

  if (sort === 'popular') {
    next.sort((a, b) => (b.users_count ?? -1) - (a.users_count ?? -1));
  } else if (sort === 'rating') {
    next.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }

  return next;
}

export function getActiveAlgoFilterCount(filters: AlgoStrategyFilters): number {
  let count = 0;
  if (filters.library !== 'all') count += 1;
  if (filters.riskLevels.length > 0) count += 1;
  if (filters.verifiedSellerOnly) count += 1;
  if (filters.liveVerifiedOnly) count += 1;
  if (filters.sort !== 'recommended') count += 1;
  return count;
}

export function selectAlgoCategories(categories: AlgoCategory[], selectedCategoryId: string): AlgoCategory[] {
  return categories.map((category) => ({
    ...category,
    is_selected: category.category_id === selectedCategoryId,
  }));
}

export function filterStrategiesByCategory(strategies: Strategy[], selectedCategoryId: string): Strategy[] {
  if (selectedCategoryId === 'all') return strategies;

  const normalizedCategory = selectedCategoryId.toLowerCase();

  return strategies.filter((strategy) => {
    const type = strategy.strategy_type.toLowerCase();
    const risk = strategy.risk_level.toLowerCase();
    const symbols = strategy.supported_symbols.join(' ').toLowerCase();

    if (normalizedCategory === 'low-risk') return strategy.risk_level === 'Low';
    if (normalizedCategory === 'prop-safe') return type.includes('prop') || risk === 'low';

    return type.includes(normalizedCategory) || symbols.includes(normalizedCategory);
  });
}

export function getActiveBotCount(bots: ActiveBot[]): number {
  return bots.filter((bot) => bot.status === 'Running').length;
}

export function hasConnectedAlgoAccount(account: UserAccount | null): boolean {
  return account?.connection_status === 'Connected';
}
