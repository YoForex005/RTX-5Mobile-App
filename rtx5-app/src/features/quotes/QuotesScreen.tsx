import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, Image, SafeAreaView } from 'react-native';

import { QuoteItem, quotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { G } from '../../theme/glass';

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
  if (volume >= 1_000_000) return `${((volume || 0) / 1_000_000).toFixed(1)}M`;
  return volume.toLocaleString('en-US');
};

/* ───── Theme ───── */

const POSITIVE = G.trading.profit;   // #4ade80
const NEGATIVE = G.trading.loss;     // #f87171
const GREY = G.textMuted;            // #808088
const CARD_BG = '#0f1525';
const BORDER = 'rgba(255, 255, 255, 0.10)';
const BG = '#000';

const trendColor = (pct: number) => (pct >= 0 ? POSITIVE : NEGATIVE);
const pillBg = (pct: number) =>
  pct >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';

const gmtClock = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

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
  const pct = `${isUp ? '+' : ''}${(item.changePct || 0).toFixed(2)}%`;

  const bidTick = item.prevBid ? (item.bid > item.prevBid ? 'up' : item.bid < item.prevBid ? 'down' : 'neutral') : 'neutral';
  const askTick = item.prevAsk ? (item.ask > item.prevAsk ? 'up' : item.ask < item.prevAsk ? 'down' : 'neutral') : 'neutral';

  const getTickColor = (tick: string) => {
    if (tick === 'up') return POSITIVE;
    if (tick === 'down') return NEGATIVE;
    return 'transparent';
  };

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && s.cardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={180}
    >
      {/* Left accent bar */}
      <View style={[s.accentBar, { backgroundColor: color }]} />

      <View style={s.cardInner}>
        {/* Left: symbol info */}
        <View style={s.symbolCol}>
          {/* Row 1: Flags + Symbol + % pill */}
          <View style={s.cardRow1}>
            <CurrencyFlags symbol={item.symbol} />
            <Text style={s.symbolText}>{symbol}</Text>
            <View style={[s.changePill, { backgroundColor: pillBg(item.changePct) }]}>
              <Text style={[s.changePillText, { color }]}>{pct}</Text>
            </View>
          </View>
          {/* Row 2: Vol · Spread */}
          <View style={s.cardRow2}>
            <Text style={s.volText}>Vol <Text style={s.statValue}>{volumeLabel(item.volume)}</Text></Text>
            <View style={s.statDot} />
            <Text style={s.spreadText}>Spread <Text style={s.statValue}>{(item.spread || 0).toFixed(1)}</Text></Text>
          </View>
        </View>

        {/* Right: BID / ASK */}
        <View style={s.pricesRow}>
          <View style={s.priceBlock}>
            <View style={s.labelWithTick}>
              {bidTick !== 'neutral' && <Ionicons name={bidTick === 'up' ? 'caret-up' : 'caret-down'} size={9} color={getTickColor(bidTick)} style={{ marginRight: 2 }} />}
              <Text style={s.priceLabel}>BID</Text>
            </View>
            <Text style={[s.priceValue, { color }]}>{(item.bid || 0).toFixed(d)}</Text>
          </View>
          <View style={s.priceBlock}>
            <View style={s.labelWithTick}>
              {askTick !== 'neutral' && <Ionicons name={askTick === 'up' ? 'caret-up' : 'caret-down'} size={9} color={getTickColor(askTick)} style={{ marginRight: 2 }} />}
              <Text style={s.priceLabel}>ASK</Text>
            </View>
            <Text style={[s.priceValue, { color }]}>{(item.ask || 0).toFixed(d)}</Text>
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
  const showActionSheet = useUIState((s) => s.showActionSheet);

  const [search, setSearch] = useState('');
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
    <View style={[s.root, { backgroundColor: '#000' }]}>
      <SafeAreaView style={s.safe}>
        <View style={s.screen}>

          {/* ── Header ── */}
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Pressable style={s.menuBtn} onPress={() => setSidebarOpen(true)}>
              <Ionicons name="menu" size={24} color="#fff" />
            </Pressable>
            <Text style={s.headerTitle}>Quotes</Text>
          </View>
          <View style={s.headerRight}>
            <Pressable style={s.iconBtnPrimary} onPress={() => {}}>
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
            <Pressable style={s.iconBtnSecondary} onPress={() => {}}>
              <Ionicons name="create-outline" size={19} color="#94A3B8" />
            </Pressable>
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
              onLongPress={() => showActionSheet({ title: item.symbol, actions: [ { label: 'Chart', onPress: () => { setChartSymbol(item.symbol); router.push('/(tabs)/chart'); } }, { label: 'Details', onPress: () => goDetail(item.symbol) }, { label: 'Remove', danger: true, onPress: () => removeQuoteSymbol(item.symbol) }, ] })}
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

        </View>
      </SafeAreaView>
    </View>
  );
}

/* ───── Styles ───── */

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },

  /* Header */
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  iconBtnPrimary: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2563EB', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  iconBtnSecondary: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },

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
    backgroundColor: '#0c1018', borderColor: BORDER,
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
    marginBottom: 16, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: CARD_BG,
    paddingVertical: 22, paddingLeft: 24, paddingRight: 20,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.85 },

  /* Left accent bar */
  accentBar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },

  /* Card inner: horizontal split */
  cardInner: { flexDirection: 'row', alignItems: 'center' },
  symbolCol: { flex: 1 },

  /* Row 1: flags + symbol + % pill */
  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  symbolText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  flagsWrap: { flexDirection: 'row', alignItems: 'center' },
  flagIcon: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: CARD_BG },
  flagOverlap: { marginLeft: -6 },

  /* Change Pill */
  changePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  changePillText: { fontSize: 11, fontWeight: '700' },

  /* Row 2: vol · spread */
  cardRow2: { flexDirection: 'row', alignItems: 'center' },
  volText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  spreadText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  statValue: { color: '#CBD5E1', fontSize: 11, fontWeight: '700' },
  statDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 6,
  },

  /* Right: BID / ASK side-by-side */
  pricesRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  priceBlock: { alignItems: 'flex-end' },
  labelWithTick: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  priceLabel: { color: GREY, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  priceValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'right' },

});