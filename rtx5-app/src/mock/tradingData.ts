export type QuoteItem = {
  symbol: string;
  bid: number;
  ask: number;
  changePct: number;
  spread: number;
  low: number;
  high: number;
};

export type PositionItem = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number;
  pnl: number;
  swap: number;
  openTime: string;
};

export const account = {
  floating: -918.02,
  currency: 'USD',
  balance: 119701.53,
  equity: 118783.51,
  margin: 317.01,
  freeMargin: 118466.5,
  marginLevel: 37469.96,
};

export const positions: PositionItem[] = [
  { id: '1', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68299.43, currentPrice: 66959.53, pnl: -13.39, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '2', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68259.19, currentPrice: 66959.53, pnl: -12.99, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '3', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68230.18, currentPrice: 66959.53, pnl: -12.7, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '4', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68204.21, currentPrice: 66959.53, pnl: -12.44, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '5', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68158.63, currentPrice: 66959.53, pnl: -11.99, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '6', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68110.4, currentPrice: 66959.53, pnl: -34.52, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '7', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68073.4, currentPrice: 66959.53, pnl: -33.41, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '8', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68040.52, currentPrice: 66959.53, pnl: -32.43, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '9', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68007.62, currentPrice: 66959.53, pnl: -31.44, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '10', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 67971.09, currentPrice: 66959.53, pnl: -30.34, swap: 0, openTime: '2026.02.18 16:44:11' },
];

export const quotes: QuoteItem[] = [
  { symbol: 'MBTUSD', bid: 0.0670381, ask: 0.0670507, changePct: -0.64, spread: 1260, low: 0.06667062, high: 0.06843159 },
  { symbol: 'MBTUSDm', bid: 0.0670354, ask: 0.0670534, changePct: -0.64, spread: 1800, low: 0.06667333, high: 0.06842889 },
  { symbol: 'USDAED', bid: 3.67248, ask: 3.67368, changePct: 0, spread: 120, low: 3.67196, high: 3.6725 },
  { symbol: 'USDAMD', bid: 376.911, ask: 378.2227, changePct: 0.48, spread: 13117, low: 375.2222, high: 376.911 },
  { symbol: 'USDARS', bid: 1426.3708, ask: 1508.5485, changePct: -1.03, spread: 821777, low: 1426.1283, high: 1442.0135 },
  { symbol: 'USDAZN', bid: 1.6947, ask: 1.7053, changePct: 0, spread: 106, low: 1.6947, high: 1.6947 },
  { symbol: 'USDBDT', bid: 124.1452, ask: 126.285, changePct: 0.07, spread: 21398, low: 123.7128, high: 124.1452 },
  { symbol: 'USDBGN', bid: 1.6632, ask: 1.6696, changePct: 0.07, spread: 64, low: 1.6609, high: 1.6652 },
  { symbol: 'USDBHD', bid: 0.37676, ask: 0.3772, changePct: -0.0, spread: 44, low: 0.37676, high: 0.37676 },
  { symbol: 'USDBND', bid: 1.2648, ask: 1.2655, changePct: 0.18, spread: 7, low: 1.2622, high: 1.2659 },
  { symbol: 'XAUUSDm', bid: 4999.331, ask: 4998.595, changePct: 2.86, spread: 264, low: 4858.455, high: 5008.998 },
  { symbol: 'BTCUSDm', bid: 67041.82, ask: 67059.82, changePct: -0.63, spread: 1800, low: 66450.2, high: 68600.13 },
];

export const historyPositions = [
  { id: 'hp1', line1: 'BTCUSDm sell 0.03', line2: '67369.64 → 67264.10', time: '2026.02.18 16:05:27', profit: 3.17 },
  { id: 'hp2', line1: 'BTCUSDm sell 0.01', line2: '67334.14 → 67264.12', time: '2026.02.18 16:05:28', profit: 0.7 },
  { id: 'hp3', line1: 'BTCUSDm sell 0.01', line2: '67293.08 → 67302.14', time: '2026.02.18 16:05:29', profit: -0.09 },
  { id: 'hp4', line1: 'BTCUSDm sell 0.01', line2: '67279.08 → 67222.14', time: '2026.02.18 16:05:30', profit: 0.57 },
  { id: 'hp5', line1: 'BTCUSDm sell 0.01', line2: '67241.27 → 67196.12', time: '2026.02.18 16:05:32', profit: 0.45 },
  { id: 'hp6', line1: 'BTCUSDm sell 0.01', line2: '67207.66 → 67204.81', time: '2026.02.18 16:05:33', profit: 0.03 },
  { id: 'hp7', line1: 'BTCUSDm sell 0.01', line2: '67239.18 → 67102.25', time: '2026.02.18 16:09:40', profit: 1.37 },
];

export const historyOrders = [
  { id: 'ho1', line1: 'BTCUSDm buy', line2: '0.01 / 0.01 at market', time: '2026.02.18 16:09:42', status: 'filled' },
  { id: 'ho2', line1: 'BTCUSDm sell', line2: '0.01 / 0.01 at market', time: '2026.02.18 16:09:44', status: 'filled' },
  { id: 'ho3', line1: 'BTCUSDm buy', line2: '0.11 / 0.11 at market', time: '2026.02.18 16:09:45', status: 'filled' },
  { id: 'ho4', line1: 'BTCUSDm sell', line2: '0.01 / 0.01 at market', time: '2026.02.18 16:10:01', status: 'filled' },
  { id: 'ho5', line1: 'BTCUSDm buy', line2: '0.11 / 0.11 at market', time: '2026.02.18 16:11:01', status: 'filled' },
];

export const historyDeals = [
  { id: 'hd1', line1: 'BTCUSDm buy,in', line2: '0.11 at 67072.95', time: '2026.02.18 16:09:45', profit: null },
  { id: 'hd2', line1: 'BTCUSDm sell,in', line2: '0.01 at 67106.26', time: '2026.02.18 16:10:01', profit: null },
  { id: 'hd3', line1: 'BTCUSDm buy,out', line2: '0.01 at 66996.70', time: '2026.02.18 16:12:46', profit: 1.36 },
  { id: 'hd4', line1: 'BTCUSDm buy,out', line2: '0.01 at 66984.70', time: '2026.02.18 16:12:47', profit: 1.21 },
  { id: 'hd5', line1: 'BTCUSDm buy,out', line2: '0.01 at 66977.53', time: '2026.02.18 16:12:49', profit: 0.87 },
];

export const settingsMenu = [
  { id: 'new-account', label: 'New Account', sub: '' },
  { id: 'mailbox', label: 'Mailbox', sub: 'The List of Instruments Affected by High Importance News' },
  { id: 'news', label: 'News', sub: 'WTI oil declines as US-Iran talks, OPEC+ output rumors cap gains' },
  { id: 'tradays', label: 'Tradays', sub: 'Economic calendar' },
  { id: 'chat', label: 'Chat and Messages', sub: 'Sign in to MQL5.community' },
  { id: 'community', label: 'Traders Community', sub: '' },
  { id: 'algo', label: 'MQL5 Algo Trading', sub: '' },
  { id: 'otp', label: 'OTP', sub: 'One-time password generator' },
  { id: 'interface', label: 'Interface', sub: 'English' },
  { id: 'charts', label: 'Charts', sub: '' },
  { id: 'journal', label: 'Journal', sub: '' },
  { id: 'settings', label: 'Settings', sub: '' },
];

export const newsItems = [
  'WTI Oil declines as US-Iran nuclear talks, OPEC+ output rumors cap gains',
  'Dow Jones Industrial Average dips as AI disruption fears persist, FOMC Minutes loom',
  'CAD: Softer CPI boosts BoC easing flexibility - RBC',
  'New Zealand GDT Price Index dipped from previous 6.7% to 3.6%',
  'USD/CHF nears one-week high amid stronger US Dollar',
];

export const brokers = [
  'Exness Technologies Ltd',
  'GTC Global Trade Capital Co. Limited',
  'Trade Securities Limited',
  'GTC Global SA (Pty) Ltd',
  'Flexy Markets Limited',
  'Ascends Global Markets Limited',
  'Equiti Brokerage (Seychelles) Limited',
  'Swissquote Bank SA',
  'FP Markets LLC',
  'Vantage International Group Limited',
  'AMarkets LLC',
  'MetaQuotes Ltd.',
];
