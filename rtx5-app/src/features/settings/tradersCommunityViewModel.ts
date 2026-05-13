import type { Ionicons } from '@expo/vector-icons';

export type CommunityFilter =
  | 'All'
  | 'Market Talk'
  | 'Trade Ideas'
  | 'Analysis'
  | 'News'
  | 'Learning'
  | 'Prop Firm'
  | 'Copy Trading';

export type CommunityPostCategory = Exclude<CommunityFilter, 'All'>;
export type MarketSentiment = 'Bullish' | 'Neutral' | 'Bearish';
export type PollTone = 'bullish' | 'bearish' | 'neutral';

export type MarketSentimentItem = {
  symbol: string;
  name?: string;
  sentiment: MarketSentiment;
  percent: number;
  icon: keyof typeof Ionicons.glyphMap;
};

export type FeaturedTrader = {
  id: string;
  name: string;
  specialty: string;
  helpfulRating?: number;
  followersLabel?: string;
  initials: string;
  verified: boolean;
};

export type TradingRoom = {
  id: string;
  name: string;
  activeMembers: number;
  memberPreview?: string[];
  icon: keyof typeof Ionicons.glyphMap;
};

export type CommunityPost = {
  id: string;
  traderName: string;
  roleLabel?: string;
  initials: string;
  verified: boolean;
  timeLabel?: string;
  symbol: string;
  postType?: string;
  category: CommunityPostCategory;
  text: string;
  riskLabel?: string;
  likes?: number;
  comments?: number;
  hasChart?: boolean;
};

export type MarketPollOption = {
  id: string;
  label: string;
  percent: number;
  tone: PollTone;
};

export type MarketPoll = {
  question: string;
  votesLabel?: string;
  endsInLabel?: string;
  options: MarketPollOption[];
};

export type CommunitySummary = {
  totalPosts: number;
  verifiedTraders: number;
  activeRooms: number;
  trackedSymbols: number;
  pollDistributionTotal: number;
};

export const COMMUNITY_FILTERS: CommunityFilter[] = [
  'All',
  'Market Talk',
  'Trade Ideas',
  'Analysis',
  'News',
  'Learning',
  'Prop Firm',
  'Copy Trading',
];

export const MARKET_SENTIMENTS: MarketSentimentItem[] = [
  {
    symbol: 'XAUUSD',
    name: 'Gold / U.S. Dollar',
    sentiment: 'Bullish',
    percent: 64,
    icon: 'diamond-outline',
  },
  {
    symbol: 'EURUSD',
    name: 'Euro / U.S. Dollar',
    sentiment: 'Neutral',
    percent: 51,
    icon: 'ellipse-outline',
  },
  {
    symbol: 'BTCUSD',
    name: 'Bitcoin / U.S. Dollar',
    sentiment: 'Bearish',
    percent: 58,
    icon: 'logo-bitcoin',
  },
];

export const FEATURED_TRADERS: FeaturedTrader[] = [
  {
    id: 'arjun-charts',
    name: 'Arjun Charts',
    specialty: 'Gold Analyst',
    helpfulRating: 92,
    followersLabel: '12.4K followers',
    initials: 'AC',
    verified: true,
  },
  {
    id: 'meera-markets',
    name: 'Meera Markets',
    specialty: 'EURUSD Scalper',
    helpfulRating: 91,
    followersLabel: '8.7K followers',
    initials: 'MM',
    verified: true,
  },
  {
    id: 'leo-price-action',
    name: 'Leo Price Action',
    specialty: 'Price Action Trader',
    helpfulRating: 89,
    followersLabel: '6.2K followers',
    initials: 'LP',
    verified: true,
  },
];

export const LIVE_TRADING_ROOMS: TradingRoom[] = [
  {
    id: 'gold-traders-room',
    name: 'Gold Traders Room',
    activeMembers: 186,
    memberPreview: ['AC', 'MM', 'LP', 'RS'],
    icon: 'cube-outline',
  },
  {
    id: 'eurusd-scalpers',
    name: 'EURUSD Scalpers',
    activeMembers: 154,
    memberPreview: ['MM', 'AS', 'VK', 'LN'],
    icon: 'flag-outline',
  },
  {
    id: 'prop-firm-help',
    name: 'Prop Firm Challenge Help',
    activeMembers: 212,
    memberPreview: ['RD', 'NP', 'SK', 'JA'],
    icon: 'trophy-outline',
  },
];

export const COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: 'aarav-xau-liquidity',
    traderName: 'Aarav FX',
    roleLabel: 'Verified Analyst',
    initials: 'AF',
    verified: true,
    timeLabel: '1h ago',
    symbol: 'XAUUSD',
    postType: 'Trade Idea',
    category: 'Trade Ideas',
    text: 'Gold is reacting near the previous liquidity zone. Waiting for confirmation before entry.',
    riskLabel: 'Educational only',
    likes: 128,
    comments: 34,
    hasChart: true,
  },
  {
    id: 'meera-eurusd-compression',
    traderName: 'Meera Markets',
    roleLabel: 'FX Desk Contributor',
    initials: 'MM',
    verified: true,
    timeLabel: '2h ago',
    symbol: 'EURUSD',
    postType: 'Analysis',
    category: 'Analysis',
    text: 'EURUSD remains compressed before the London session. Watching breakout confirmation.',
    riskLabel: 'Educational only',
    likes: 86,
    comments: 19,
    hasChart: false,
  },
  {
    id: 'risk-desk-prop-reset',
    traderName: 'Risk Desk',
    roleLabel: 'Prop Firm Coach',
    initials: 'RD',
    verified: true,
    timeLabel: '3h ago',
    symbol: 'US30',
    postType: 'Prop Firm',
    category: 'Prop Firm',
    text: 'Challenge accounts need cleaner daily risk limits before high-impact U.S. data. Keep loss caps visible.',
    riskLabel: 'Risk education',
    likes: 64,
    comments: 22,
    hasChart: false,
  },
  {
    id: 'lina-btc-session-range',
    traderName: 'Lina Crypto',
    roleLabel: 'Market Talk Host',
    initials: 'LC',
    verified: false,
    timeLabel: '4h ago',
    symbol: 'BTCUSD',
    postType: 'Market Talk',
    category: 'Market Talk',
    text: 'BTC is holding the Asian range midline. I am watching whether New York accepts above the weekly open.',
    riskLabel: 'Educational only',
    likes: 52,
    comments: 15,
    hasChart: false,
  },
];

export const MARKET_POLL: MarketPoll = {
  question: 'Where will Gold move next?',
  votesLabel: '3,842 votes',
  endsInLabel: 'Voting ends in 08:45:12',
  options: [
    { id: 'bullish-break', label: 'Bullish above resistance', percent: 47, tone: 'bullish' },
    { id: 'bearish-break', label: 'Bearish below support', percent: 32, tone: 'bearish' },
    { id: 'sideways', label: 'Sideways consolidation', percent: 21, tone: 'neutral' },
  ],
};

export const EDUCATION_DISCLOSURE = 'Community ideas are for education only. Not financial advice.';

export function buildCommunitySummary(
  posts: CommunityPost[] = COMMUNITY_POSTS,
  traders: FeaturedTrader[] = FEATURED_TRADERS,
  rooms: TradingRoom[] = LIVE_TRADING_ROOMS,
  sentiments: MarketSentimentItem[] = MARKET_SENTIMENTS,
  poll: MarketPoll = MARKET_POLL,
): CommunitySummary {
  const trackedSymbols = new Set([
    ...posts.map((post) => post.symbol),
    ...sentiments.map((sentiment) => sentiment.symbol),
  ]);

  return {
    totalPosts: posts.length,
    verifiedTraders: traders.filter((trader) => trader.verified).length,
    activeRooms: rooms.length,
    trackedSymbols: trackedSymbols.size,
    pollDistributionTotal: poll.options.reduce((sum, option) => sum + option.percent, 0),
  };
}

export function filterCommunityPosts(
  posts: CommunityPost[],
  filter: CommunityFilter,
  query: string,
): CommunityPost[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPosts = posts.filter((post) => filter === 'All' || post.category === filter);

  if (!normalizedQuery) return filteredPosts;

  return filteredPosts.filter((post) => {
    const searchableText = [
      post.traderName,
      post.roleLabel ?? '',
      post.symbol,
      post.postType ?? '',
      post.category,
      post.text,
      post.riskLabel ?? '',
    ].join(' ').toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getCommunityPostCountByCategory(category: CommunityPostCategory): number {
  return COMMUNITY_POSTS.filter((post) => post.category === category).length;
}
