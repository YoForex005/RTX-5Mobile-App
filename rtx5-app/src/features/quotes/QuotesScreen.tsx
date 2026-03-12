import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, Image } from 'react-native';

import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { QuoteItem, quotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';

/* ───── Helpers ───── */

/* Currency code → ISO country code for flag images */
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  EUR: 'eu', USD: 'us', GBP: 'gb', JPY: 'jp',
  CHF: 'ch', AUD: 'au', NZD: 'nz', CAD: 'ca',
};

const flagUrl = (cc: string) => `https://flagcdn.com/w80/${cc}.png`;

/* Renders two overlapping circular flag icons for a currency pair */
function CurrencyFlags({ symbol }: { symbol: string }) {
  const core = symbol.replace(/m$/i, '');
  if (core.length < 6) return null;
  const base = CURRENCY_TO_COUNTRY[core.slice(0, 3)];
  const quote = CURRENCY_TO_COUNTRY[core.slice(3, 6)];
  if (!base || !quote) return null;
  return (
    <View style={s.flagsWrap}>
      <Image source={{ uri: flagUrl(base) }} style={s.flagIcon} />
      <Image source={{ uri: flagUrl(quote) }} style={[s.flagIcon, s.flagOverlap]} />
    </View>
  );
}

const digitsFor = (item: QuoteItem) =>
  item.digits ?? (item.bid >= 100 ? 3 : item.bid >= 10 ? 4 : 5);

const pairLabel = (symbol: string) => {
  const core = symbol.replace(/m$/i, '');
  return core;
};

const volumeLabel = (volume?: number) => {
  if (!volume) return '--';
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  return volume.toLocaleString('en-US');
};

/* ───── Theme ───── */

const POSITIVE = '#089981'; // Pro green
const NEGATIVE = '#F23645'; // Pro red
const GREY = '#78849E';
const CARD_BG = '#131722';  // TradingView dark card
const BORDER = '#1E2433';   // Subtle delineation
const BG = '#040609';       // Ultra-premium OLED Midnight

const trendColor = (pct: number) => (pct >= 0 ? POSITIVE : NEGATIVE);
const pillBg = (pct: number) =>
  pct >= 0 ? 'rgba(8,153,129,0.12)' : 'rgba(242,54,69,0.12)';

const gmtClock = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

/* ───── Sparkline (smooth curve – pure RN, web + native) ───── */

const SPARK_W = 90;
const SPARK_H = 36;
const NUM_PTS = 40; // many points → smooth curve

/** Simple seeded random for consistent sparklines per pair */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s & 0x7fffffff) / 0x7fffffff;
  };
}

/** Generate smooth Y points for a sparkline */
function generatePoints(isUp: boolean, seed: number): number[] {
  const rand = seededRandom(seed);
  const pts: number[] = [];
  const pad = 1;
  const range = SPARK_H - pad * 2;

  for (let i = 0; i < NUM_PTS; i++) {
    const t = i / (NUM_PTS - 1);
    // Base trend: upward starts LOW on screen (high Y) → rises to TOP; downward opposite
    const trend = isUp ? (0.95 - t * 0.85) : (0.05 + t * 0.85);
    // Smaller wave so trend direction is clearly visible
    const wave = Math.sin(t * Math.PI * 2.5 + seed) * 0.1
      + Math.sin(t * Math.PI * 4 + seed * 2) * 0.06;
    const noise = (rand() - 0.5) * 0.04;
    const val = trend + wave + noise;
    pts.push(pad + Math.max(0, Math.min(1, val)) * range);
  }
  return pts;
}

/** Hash symbol string to a seed number */
function hashSymbol(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) {
    h = ((h << 5) - h + sym.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function Sparkline({ isUp, color, symbol }: { isUp: boolean; color: string; symbol: string }) {
  const pts = useMemo(() => generatePoints(isUp, hashSymbol(symbol)), [isUp, symbol]);
  const step = SPARK_W / (pts.length - 1);

  const segments = useMemo(() => {
    const segs: React.ReactNode[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const x1 = i * step;
      const y1 = pts[i];
      const x2 = (i + 1) * step;
      const y2 = pts[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      segs.push(
        <View
          key={i}
          style={{
            position: 'absolute',
            left: x1,
            top: y1 - 0.75,
            width: len + 0.5, // tiny overlap to avoid gaps
            height: 1.5,
            backgroundColor: color,
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: 'left center',
          }}
        />,
      );
    }
    return segs;
  }, [pts, step, color]);

  // Faded fill columns under each point
  const fills = useMemo(() => {
    const cols: React.ReactNode[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = i * step;
      const y = pts[i];
      cols.push(
        <View
          key={`f${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: step * 2.5,
            height: SPARK_H - y,
            backgroundColor: color,
            opacity: 0.06,
          }}
        />,
      );
    }
    return cols;
  }, [pts, step, color]);

  return (
    <View style={{ width: SPARK_W, height: SPARK_H, overflow: 'hidden' }}>
      {fills}
      {segments}
    </View>
  );
}

/* ───── QuoteCard ───── */

function QuoteCard({
  item,
  updatedAt,
  onPress,
  onLongPress,
}: {
  item: QuoteItem;
  updatedAt: Date;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const isUp = item.changePct >= 0;
  const color = trendColor(item.changePct);
  const d = digitsFor(item);
  const symbol = pairLabel(item.symbol);
  const pct = `${isUp ? '+' : ''}${item.changePct.toFixed(2)}%`;

  const bidTick = item.prevBid ? (item.bid > item.prevBid ? 'up' : item.bid < item.prevBid ? 'down' : 'neutral') : 'neutral';
  const askTick = item.prevAsk ? (item.ask > item.prevAsk ? 'up' : item.ask < item.prevAsk ? 'down' : 'neutral') : 'neutral';

  const getTickColor = (tick: string) => {
    if (tick === 'up') return POSITIVE;
    if (tick === 'down') return NEGATIVE;
    return 'transparent';
  };

  const getTickArrow = (tick: string) => {
    if (tick === 'up') return '↗';
    if (tick === 'down') return '↘';
    return '';
  };

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && s.cardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={180}
    >
      {/* Row 1: Symbol + Flags … Change Pill … Timestamp */}
      <View style={s.cardRow1}>
        <View style={s.symbolWrap}>
          <Text style={s.symbolText}>{symbol}</Text>
          <CurrencyFlags symbol={item.symbol} />
          <View style={[s.changePill, { backgroundColor: pillBg(item.changePct) }]}>
            <Text style={[s.changePillText, { color }]}>{pct}</Text>
          </View>
        </View>
        <Text style={s.timestampText}>{gmtClock(updatedAt)} GMT</Text>
      </View>

      {/* Row 2: Stats … Sparkline … Prices */}
      <View style={s.cardRow2}>
        <View style={s.statsCol}>
          <Text style={s.volText}>Vol: <Text style={s.statValue}>{volumeLabel(item.volume)}</Text></Text>
          <Text style={s.spreadText}>Spread: <Text style={s.statValue}>{item.spread.toFixed(1)}</Text></Text>
        </View>

        <View style={s.sparkCol}>
          <Sparkline isUp={isUp} color={color} symbol={item.symbol} />
        </View>

        <View style={s.pricesCol}>
          <View style={s.priceLabelsRow}>
            <View style={s.labelWithTick}>
               <Text style={s.priceLabel}>BID</Text>
               {bidTick !== 'neutral' && <Text style={[s.tickArrow, { color: getTickColor(bidTick) }]}>{getTickArrow(bidTick)}</Text>}
            </View>
            <View style={s.labelWithTick}>
               <Text style={s.priceLabel}>ASK</Text>
               {askTick !== 'neutral' && <Text style={[s.tickArrow, { color: getTickColor(askTick) }]}>{getTickArrow(askTick)}</Text>}
            </View>
          </View>
          <View style={s.priceValuesRow}>
            <Text style={[s.priceValue, { color }]}>{item.bid.toFixed(d)}</Text>
            <Text style={[s.priceValue, { color }]}>{item.ask.toFixed(d)}</Text>
          </View>
        </View>
      </View>

    </Pressable>
  );
}

/* ───── QuotesScreen ───── */

export function QuotesScreen() {
  const router = useRouter();
  
  const quoteSymbols = useUserPreferences((st) => st.quoteSymbols);
  const removeQuoteSymbol = useUserPreferences((st) => st.removeQuoteSymbol);
  const setChartSymbol = useUserPreferences((st) => st.setChartSymbol);

  const sidebarOpen = useUIState((s) => s.sidebarOpen);
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);

  const [search, setSearch] = useState('');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [liveQuotes, setLiveQuotes] = useState<QuoteItem[]>(quotes);
  const [updatedAt, setUpdatedAt] = useState(new Date());

  /* 1-second clock tick */
  useEffect(() => {
    const id = setInterval(() => setUpdatedAt(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* Simulated price feed */
  useEffect(() => {
    const id = setInterval(() => {
      setLiveQuotes((cur) =>
        cur.map((q) => {
          const pip = q.tickSize ?? 1 / Math.pow(10, q.digits ?? 5);
          const nextBid = Math.max(0.00001, q.bid + (Math.random() - 0.5) * pip * 6);
          const nextAsk = nextBid + q.spread * pip;
          const open = q.open ?? q.bid;
          const change = open > 0 ? ((nextBid - open) / open) * 100 : q.changePct;
          return {
            ...q, 
            prevBid: q.bid, 
            prevAsk: q.ask,
            bid: nextBid, 
            ask: nextAsk,
            high: Math.max(q.high, nextAsk), low: Math.min(q.low, nextBid),
            changePct: change,
          };
        }),
      );
    }, 850);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveQuotes
      .filter((i) => quoteSymbols.includes(i.symbol))
      .filter((i) => i.symbol.toLowerCase().includes(q));
  }, [liveQuotes, quoteSymbols, search]);

  const goDetail = (sym: string) => {
    setChartSymbol(sym);
    router.push({ pathname: '/quotes/details', params: { symbol: sym } });
  };

  return (
      <Screen style={s.screen}>

        {/* ── Header ── */}
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Pressable style={s.menuBtn} onPress={() => setSidebarOpen(true)}>
              <Ionicons name="menu" size={24} color="#fff" />
            </Pressable>
            <Text style={s.headerTitle}>Markets</Text>
          </View>
          <View style={s.headerRight}>
            <View style={s.avatarWrap}>
              <Image
                source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }}
                style={s.avatarImg}
              />
              <View style={s.avatarDot} />
            </View>
          </View>
        </View>

        {/* ── Subheader ── */}
        <View style={s.subheaderRow}>
          <Text style={s.subLeft}>Last Updated: {gmtClock(updatedAt)} GMT</Text>
          <View style={s.subRight}>
            <Text style={s.subGrey}>Status: </Text>
            <Text style={s.subLive}>LIVE</Text>
          </View>
        </View>

        {/* ── Search ── */}
        <View style={s.searchBar}>
          <Ionicons name="search" size={20} color={GREY} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            style={s.searchInput}
            placeholder="Search Assets, Pairs, and Indices..."
            placeholderTextColor={GREY}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={GREY} />
            </Pressable>
          )}
        </View>

        {/* ── List ── */}
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.symbol}
          renderItem={({ item }) => (
            <QuoteCard
              item={item}
              updatedAt={updatedAt}
              onPress={() => goDetail(item.symbol)}
              onLongPress={() => setActiveSymbol(item.symbol)}
            />
          )}
          style={s.list}
          contentContainerStyle={s.listPad}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>No assets match this search.</Text>
            </View>
          }
        />

        <ActionSheet
          visible={Boolean(activeSymbol)}
          title={activeSymbol ?? ''}
          onClose={() => setActiveSymbol(null)}
          actions={[
            { label: 'Chart', onPress: () => { if (activeSymbol) { setChartSymbol(activeSymbol); router.push('/(tabs)/chart'); } } },
            { label: 'Details', onPress: () => goDetail(activeSymbol ?? 'EURUSD') },
            { label: 'Remove', danger: true, onPress: () => { if (activeSymbol) removeQuoteSymbol(activeSymbol); } },
          ]}
        />
      </Screen>
  );
}

/* ───── Styles ───── */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  screen: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 16, paddingTop: 10 },

  /* Header */
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  avatarWrap: { width: 34, height: 34, borderRadius: 17, position: 'relative' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 17 },
  avatarDot: {
    position: 'absolute', right: -2, bottom: -2, width: 10, height: 10,
    borderRadius: 5, backgroundColor: POSITIVE, borderWidth: 2, borderColor: BG,
  },

  /* Subheader */
  subheaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, marginBottom: 16,
  },
  subLeft: { color: GREY, fontSize: 13, fontWeight: '500' },
  subRight: { flexDirection: 'row', alignItems: 'center' },
  subGrey: { color: GREY, fontSize: 13, fontWeight: '500' },
  subLive: { color: POSITIVE, fontSize: 13, fontWeight: '700' },

  /* Search */
  searchBar: {
    backgroundColor: '#1A202C', borderColor: BORDER,
    borderWidth: 1, borderRadius: 24, height: 44,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 20, gap: 10,
  },
  searchInput: { flex: 1, color: '#E2E8F0', fontSize: 14, fontWeight: '500' },

  /* List */
  list: { flex: 1 },
  listPad: { paddingBottom: 100 },
  emptyWrap: { paddingTop: 48, alignItems: 'center' },
  emptyText: { color: GREY, fontSize: 16, fontWeight: '500' },

  /* ── Card ── */
  card: {
    marginBottom: 12, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: CARD_BG,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  cardPressed: { opacity: 0.85 },

  /* Card Row 1: symbol + flags … timestamp */
  cardRow1: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  symbolWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  symbolText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  flagsWrap: { flexDirection: 'row', alignItems: 'center' },
  flagIcon: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: BG },
  flagOverlap: { marginLeft: -6 },
  timestampText: { color: GREY, fontSize: 13, fontWeight: '500' },

  /* Change Pill */
  changePill: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, marginLeft: 6,
  },
  changePillText: { fontSize: 13, fontWeight: '700' },

  /* Card Row 2: stats … sparkline … prices */
  cardRow2: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  /* Left stats column */
  statsCol: { flex: 1, justifyContent: 'flex-end' },
  volText: { color: GREY, fontSize: 13, fontWeight: '500', marginBottom: 2 },
  spreadText: { color: GREY, fontSize: 13, fontWeight: '500' },
  statValue: { color: '#E2E8F0', fontSize: 15, fontWeight: '700' },

  /* Center sparkline column */
  sparkCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', marginLeft: -20, marginBottom: 2 },

  /* Right prices column */
  pricesCol: { alignItems: 'flex-end', flexShrink: 0, justifyContent: 'flex-end' },
  priceLabelsRow: { flexDirection: 'row', gap: 4, marginBottom: 2 },
  labelWithTick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 75 },
  priceLabel: { color: GREY, fontSize: 14, fontWeight: '700' },
  tickArrow: { fontSize: 12, fontWeight: '900', marginLeft: 6 },
  priceValuesRow: { flexDirection: 'row', gap: 4, flexWrap: 'nowrap' },
  priceValue: {
    fontSize: 20, fontWeight: '800', textAlign: 'center',
    width: 80, fontVariant: ['tabular-nums'],
  },

  /* Daily Range Row (Text based) */
  rangeTextRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  rangeLabel: { color: GREY, fontSize: 13, fontWeight: '500' },
  rangeValue: { color: '#E2E8F0', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});