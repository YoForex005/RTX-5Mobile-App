import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, Image, SafeAreaView } from 'react-native';

import { QuoteItem, quotes as mockQuotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useMarketData } from '../../query/websocket';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';

/* ───── Helpers ───── */

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  EUR: 'eu', USD: 'us', GBP: 'gb', JPY: 'jp',
  CHF: 'ch', AUD: 'au', NZD: 'nz', CAD: 'ca',
};

const flagUrl = (cc: string) => `https://flagcdn.com/w80/${cc}.png`;

function CurrencyFlags({ symbol, cardBg }: { symbol: string; cardBg: string }) {
  const core = symbol.replace(/m$/i, '');
  if (core.length < 6) return null;
  const base = CURRENCY_TO_COUNTRY[core.slice(0, 3)];
  const quote = CURRENCY_TO_COUNTRY[core.slice(3, 6)];
  if (!base || !quote) return null;
  return (
    <View style={sf.flagsWrap}>
      <Image source={{ uri: flagUrl(base) }} style={[sf.flagIcon, { borderColor: cardBg }]} />
      <Image source={{ uri: flagUrl(quote) }} style={[sf.flagIcon, sf.flagOverlap, { borderColor: cardBg }]} />
    </View>
  );
}

const sf = StyleSheet.create({
  flagsWrap: { flexDirection: 'row', alignItems: 'center' },
  flagIcon: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  flagOverlap: { marginLeft: -6 },
});

const digitsFor = (item: QuoteItem) =>
  item.digits ?? (item.bid >= 100 ? 3 : item.bid >= 10 ? 4 : 5);

const pairLabel = (symbol: string) => symbol.replace(/m$/i, '');

const volumeLabel = (volume?: number) => {
  if (!volume) return '--';
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  return volume.toLocaleString('en-US');
};

const gmtClock = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

/* ───── QuoteCard ───── */

function QuoteCard({
  item,
  T,
  isDark,
  onPress,
  onLongPress,
}: {
  item: QuoteItem;
  T: ThemeColors;
  isDark: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const isUp = item.changePct >= 0;
  const POSITIVE = T.trading.profit;
  const NEGATIVE = T.trading.loss;
  const color = isUp ? POSITIVE : NEGATIVE;
  const pillBgColor = isUp ? POSITIVE : NEGATIVE;

  const d = digitsFor(item);
  const symbol = pairLabel(item.symbol);
  const pct = `${isUp ? '+' : ''}${(item.changePct || 0).toFixed(2)}%`;

  const bidDirection = item.prevBid
    ? item.bid > item.prevBid ? 'up' : item.bid < item.prevBid ? 'down' : 'neutral'
    : 'neutral';
  const askDirection = item.prevAsk
    ? item.ask > item.prevAsk ? 'up' : item.ask < item.prevAsk ? 'down' : 'neutral'
    : 'neutral';

  const bidColor = bidDirection === 'up' ? POSITIVE : bidDirection === 'down' ? NEGATIVE : color;
  const askColor = askDirection === 'up' ? POSITIVE : askDirection === 'down' ? NEGATIVE : color;

  const showBidCaret = bidDirection !== 'neutral' || !item.prevBid;
  const showAskCaret = askDirection !== 'neutral' || !item.prevAsk;

  const bidCaret = bidDirection !== 'neutral' ? bidDirection : isUp ? 'up' : 'down';
  const askCaret = askDirection !== 'neutral' ? askDirection : isUp ? 'up' : 'down';

  // Elite Fintech Paradigm: Cards on a clean canvas
  const cardBg = isDark ? '#0f1525' : T.glass2;
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : T.border;

  return (
    <Pressable
      style={({ pressed }) => [
        sc.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
        !isDark && sc.cardShadowLight,
        isDark && sc.cardShadowDark,
        pressed && sc.cardPressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={180}
    >
      {/* Left accent bar removed to match pure flat aesthetics */}

      <View style={sc.cardInner}>
        {/* Left: symbol info */}
        <View style={sc.symbolCol}>
          {/* Row 1: Flags + Symbol + % pill */}
          <View style={sc.cardRow1}>
            <CurrencyFlags symbol={item.symbol} cardBg={cardBg} />
            <Text style={[sc.symbolText, { color: T.text }]}>{symbol}</Text>
            <View style={[sc.changePill, { backgroundColor: pillBgColor }]}>
              <Text style={[sc.changePillText, { color: '#FFFFFF' }]}>{pct}</Text>
            </View>
          </View>
          {/* Row 2: Vol · Spread */}
          <View style={sc.cardRow2}>
            <Text style={[sc.volText, { color: T.textSub }]}>
              Vol <Text style={[sc.statValue, { color: T.text }]}>{volumeLabel(item.volume)}</Text>
            </Text>
            <View style={[sc.statDot, { backgroundColor: T.textMuted }]} />
            <Text style={[sc.spreadText, { color: T.textSub }]}>
              Spread <Text style={[sc.statValue, { color: T.text }]}>{(item.spread || 0).toFixed(1)}</Text>
            </Text>
          </View>
        </View>

        {/* Right: BID / ASK */}
        <View style={sc.pricesRow}>
          {/* BID */}
          <View style={sc.priceBlock}>
            <View style={sc.labelWithTick}>
              <Text style={[sc.priceLabel, { color: T.textMuted }]}>BID</Text>
              {showBidCaret && (
                <Ionicons
                  name={bidCaret === 'up' ? 'caret-up' : 'caret-down'}
                  size={9}
                  color={bidCaret === 'up' ? POSITIVE : NEGATIVE}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
            <Text style={[sc.priceValue, { color: bidColor }]}>{(item.bid || 0).toFixed(d)}</Text>
          </View>

          {/* ASK */}
          <View style={sc.priceBlock}>
            <View style={sc.labelWithTick}>
              <Text style={[sc.priceLabel, { color: T.textMuted }]}>ASK</Text>
              {showAskCaret && (
                <Ionicons
                  name={askCaret === 'up' ? 'caret-up' : 'caret-down'}
                  size={9}
                  color={askCaret === 'up' ? POSITIVE : NEGATIVE}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
            <Text style={[sc.priceValue, { color: askColor }]}>{(item.ask || 0).toFixed(d)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ───── QuotesScreen ───── */

export function QuotesScreen() {
  const router = useRouter();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';

  const quoteSymbols = useUserPreferences((st) => st.quoteSymbols);
  const removeQuoteSymbol = useUserPreferences((st) => st.removeQuoteSymbol);
  const setChartSymbol = useUserPreferences((st) => st.setChartSymbol);

  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const showActionSheet = useUIState((s) => s.showActionSheet);

  const [search, setSearch] = useState('');
  const [updatedAt, setUpdatedAt] = useState(new Date());

  /* 1-second clock tick */
  useEffect(() => {
    const id = setInterval(() => setUpdatedAt(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* Real-time WebSocket feed */
  const liveQuotesMap = useMarketData(quoteSymbols);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const mapped = quoteSymbols
      .map((sym) => liveQuotesMap[sym] || mockQuotes.find((m) => m.symbol === sym) || null)
      .filter((i) => i !== null) as QuoteItem[];
    return mapped.filter((i) => i.symbol.toLowerCase().includes(q));
  }, [liveQuotesMap, quoteSymbols, search]);

  const goDetail = (sym: string) => {
    setChartSymbol(sym);
    router.push({ pathname: '/quotes/details', params: { symbol: sym } });
  };

  /* Dynamic per-theme values */
  const menuBtnBg   = isDark ? 'rgba(255,255,255,0.08)' : T.glass1;
  const menuBtnBdr  = isDark ? 'rgba(255,255,255,0.15)' : T.border;
  const secBtnBg    = isDark ? 'rgba(255,255,255,0.06)' : T.glass1;
  const secBtnBdr   = isDark ? 'rgba(255,255,255,0.12)' : T.border;
  const searchBg    = isDark ? '#0c1018' : T.glass2;
  const searchBdr   = isDark ? T.border : T.border;

  return (
    <View style={{ flex: 1, backgroundColor: T.bgRoot }}>
      <SafeAreaView style={s.safe}>
        <View style={s.screen}>

          {/* ── Header ── */}
          <View style={s.headerRow}>
            <Pressable
              style={[s.menuBtn, { backgroundColor: menuBtnBg, borderColor: menuBtnBdr }]}
              onPress={() => setSidebarOpen(true)}
            >
              <Ionicons name="menu" size={24} color={T.text} />
            </Pressable>
            <View style={s.headerRight}>
              <Pressable style={s.iconBtnPrimary} onPress={() => {}}>
                <Ionicons name="add" size={22} color="#fff" />
              </Pressable>
              <Pressable
                style={[s.iconBtnSecondary, { backgroundColor: secBtnBg, borderColor: secBtnBdr }]}
                onPress={() => {}}
              >
                <Ionicons name="create-outline" size={19} color={T.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* ── Subheader ── */}
          <View style={s.subheaderRow}>
            <Text style={[s.subLeft, { color: T.textMuted }]}>Last Updated: {gmtClock(updatedAt)} GMT</Text>
            <View style={s.subRight}>
              <Text style={[s.subGrey, { color: T.textMuted }]}>Status: </Text>
              <Text style={[s.subLive, { color: T.trading.profit }]}>LIVE</Text>
            </View>
          </View>

          {/* ── Search ── */}
          <View style={[s.searchBar, { backgroundColor: searchBg, borderColor: searchBdr }]}>
            <Ionicons name="search" size={20} color={T.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              style={[s.searchInput, { color: T.text }]}
              placeholder="Search Assets, Pairs, and Indices..."
              placeholderTextColor={T.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={T.textMuted} />
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
                T={T}
                isDark={isDark}
                onPress={() => goDetail(item.symbol)}
                onLongPress={() => showActionSheet({
                  title: item.symbol,
                  actions: [
                    { label: 'Chart', onPress: () => { setChartSymbol(item.symbol); router.push('/(tabs)/chart'); } },
                    { label: 'Details', onPress: () => goDetail(item.symbol) },
                    { label: 'Remove', danger: true, onPress: () => removeQuoteSymbol(item.symbol) },
                  ],
                })}
              />
            )}
            style={s.list}
            contentContainerStyle={s.listPad}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Text style={[s.emptyText, { color: T.textMuted }]}>No assets match this search.</Text>
              </View>
            }
          />

        </View>
      </SafeAreaView>
    </View>
  );
}

/* ───── Styles (layout-only, colors applied inline) ───── */

const s = StyleSheet.create({
  safe: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  /* Header */
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  iconBtnPrimary: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#4F46E5', shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 0 },
  iconBtnSecondary: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },

  /* Subheader */
  subheaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 16 },
  subLeft: { fontSize: 13, fontWeight: '500' },
  subRight: { flexDirection: 'row', alignItems: 'center' },
  subGrey: { fontSize: 13, fontWeight: '500' },
  subLive: { fontSize: 13, fontWeight: '700' },

  /* Search */
  searchBar: {
    borderWidth: 1, borderRadius: 24, height: 44,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 20, gap: 10,
    borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  /* List */
  list: { flex: 1 },
  listPad: { paddingBottom: 100 },
  emptyWrap: { paddingTop: 48, alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '500' },
});

/* ───── Card Styles (layout-only, colors inline) ───── */

const sc = StyleSheet.create({
  card: {
    marginBottom: 16, borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 22, paddingLeft: 24, paddingRight: 20,
    overflow: 'hidden',
  },
  cardShadowLight: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 0, // Eliminate harsh Android shadow on Light Mode
  },
  cardShadowDark: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  cardInner: { flexDirection: 'row', alignItems: 'center' },
  symbolCol: { flex: 1 },
  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  symbolText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  changePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  changePillText: { fontSize: 11, fontWeight: '700' },
  cardRow2: { flexDirection: 'row', alignItems: 'center' },
  volText: { fontSize: 12, fontWeight: '600' },
  spreadText: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 12, fontWeight: '700' },
  statDot: { width: 4, height: 4, borderRadius: 2, marginLeft: 6, marginRight: 3 },
  pricesRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  priceBlock: { alignItems: 'flex-end' },
  labelWithTick: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  priceValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'right' },
});
