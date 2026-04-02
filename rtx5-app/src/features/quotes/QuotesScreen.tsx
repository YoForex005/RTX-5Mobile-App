/**
 * Quotes Watchlist Screen (aka 'Quotes' tab).
 * 
 * Provides a real-time table/list view of financial instruments customized locally by the user.
 * 
 * Key Features:
 * - Dynamic sub-rendering via fast-list to handle 100+ ticker updates reliably without lag.
 * - Deep integrations with `QuotesWebSocketService` for hardware-accelerated ticking.
 * - Supports List (Simple, Advanced) and Table (Grid) view modes, persisted to local storage.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, TextInput, View, Image, SafeAreaView, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { QuoteItem, quotes as mockQuotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { quotesWsService } from '../../api/ws/quotesSocket';
import { useTradingState } from '../../state/tradingState';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMarketSymbols } from '../../query/market';
import { fmt } from '../../utils/format';

/* ───── Helpers ───── */

const digitsFor = (item: QuoteItem) => 2;

const pairLabel = (symbol: string) => fmt.symbol(symbol);

const volumeLabel = (volume?: number) => {
  if (!volume) return '--';
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  return volume.toLocaleString('en-US');
};

const gmtClock = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

/* ───── QuoteCard ───── */

function QuoteCard({
  symbol,
  T,
  isDark,
  onPress,
  onLongPress,
}: {
  symbol: string;
  T: ThemeColors;
  isDark: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const liveItem = useTradingState((state) => state.quotes[symbol]);

  const noData = liveItem === undefined || !liveItem.bid;
  
  // Hide the card completely if no data values are actively streaming for it.
  if (noData) return null;
  
  const item: any = liveItem || { symbol, bid: 0, ask: 0, changePct: 0, spread: 0, volume: 0, digits: 5 };

  const isUp = item.changePct >= 0;
  const POSITIVE = T.trading.profit;
  const NEGATIVE = T.trading.loss;
  const color = isUp ? POSITIVE : NEGATIVE;
  const pillBgColor = noData ? T.border : (isUp ? POSITIVE : NEGATIVE);

  const d = digitsFor(item);
  const displaySymbol = pairLabel(item.symbol);
  const pct = `${isUp ? '+' : ''}${(item.changePct || 0).toFixed(2)}%`;

  const bidDirection = item.prevBid
    ? item.bid > item.prevBid ? 'up' : item.bid < item.prevBid ? 'down' : 'neutral'
    : 'neutral';
  const askDirection = item.prevAsk
    ? item.ask > item.prevAsk ? 'up' : item.ask < item.prevAsk ? 'down' : 'neutral'
    : 'neutral';

  const bidColor = noData ? T.textMuted : (bidDirection === 'up' ? POSITIVE : bidDirection === 'down' ? NEGATIVE : color);
  const askColor = noData ? T.textMuted : (askDirection === 'up' ? POSITIVE : askDirection === 'down' ? NEGATIVE : color);

  const showBidCaret = !noData && (bidDirection !== 'neutral' || !item.prevBid);
  const showAskCaret = !noData && (askDirection !== 'neutral' || !item.prevAsk);

  const bidCaret = bidDirection !== 'neutral' ? bidDirection : isUp ? 'up' : 'down';
  const askCaret = askDirection !== 'neutral' ? askDirection : isUp ? 'up' : 'down';

  // ── Flash animation removed per user request ──────────────────────────

  // Elite Fintech Paradigm: Cards on a clean canvas
  const cardBg = isDark ? 'rgba(15, 23, 42, 0.7)' : T.glass2;
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : T.border;

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
      {isDark && (
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.03)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
        />
      )}
      {/* Left accent bar removed to match pure flat aesthetics */}

      <View style={sc.cardInner}>
        {/* Left: symbol info */}
        <View style={sc.symbolCol}>
          {/* Row 1: Flags + Symbol + % pill */}
          <View style={sc.cardRow1}>
            <Text style={[sc.symbolText, { color: T.text }]}>{displaySymbol}</Text>
            <View style={[sc.changePill, { backgroundColor: pillBgColor }]}>
              <Text style={[sc.changePillText, { color: noData ? T.textMuted : '#FFFFFF' }]}>{noData ? '--' : pct}</Text>
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
            <Text style={[sc.priceValue, { color: bidColor }]}>{noData ? '--' : (item.bid || 0).toFixed(2)}</Text>
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
            <Text style={[sc.priceValue, { color: askColor }]}>{noData ? '--' : (item.ask || 0).toFixed(2)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function EditQuoteRow({
  symbol,
  index,
  total,
  T,
  isDark,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  symbol: string;
  index: number;
  total: number;
  T: ThemeColors;
  isDark: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const cardBg = isDark ? 'rgba(15, 23, 42, 0.7)' : T.glass2;
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : T.border;

  return (
    <View style={[sc.card, { backgroundColor: cardBg, borderColor: cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={onRemove} style={{ padding: 4 }}>
          <Ionicons name="remove-circle" size={24} color={T.down} />
        </Pressable>
        <Text style={[sc.symbolText, { color: T.text }]}>{fmt.symbol(symbol)}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable onPress={onMoveUp} disabled={index === 0} style={{ opacity: index === 0 ? 0.3 : 1, padding: 4 }}>
          <Ionicons name="chevron-up-circle-outline" size={30} color={T.textSub} />
        </Pressable>
        <Pressable onPress={onMoveDown} disabled={index === total - 1} style={{ opacity: index === total - 1 ? 0.3 : 1, padding: 4 }}>
          <Ionicons name="chevron-down-circle-outline" size={30} color={T.textSub} />
        </Pressable>
      </View>
    </View>
  );
}

function AddSymbolModal({ visible, onClose, onAdd, T, isDark, existingSymbols }: any) {
  const { data: apiSymbols, isLoading } = useMarketSymbols();
  const [query, setQuery] = useState('');

  const available = useMemo(() => {
    const all = apiSymbols || [];
    const q = query.trim().toLowerCase();

    // Exact match for case-insensitive symbols
    const existingBases = new Set(
      (existingSymbols || []).map((s: string) => s.toLowerCase())
    );

    return all.filter(sym => {
      const baseSym = sym.toLowerCase();
      return !existingBases.has(baseSym) && baseSym.includes(q);
    });
  }, [query, existingSymbols, apiSymbols]);

  if (!visible) return null;

  const content = (
    <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: Platform.OS === 'web' ? 430 : '100%', height: '80%', backgroundColor: T.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: T.text }}>Add Asset</Text>
          <Pressable onPress={onClose}><Ionicons name="close" size={24} color={T.text} /></Pressable>
        </View>
        <View style={[s.searchBar, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : T.border, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff' }]}>
          <Ionicons name="search" size={20} color={T.textMuted} />
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder={isLoading ? "Loading assets..." : "Search available assets..."}
            placeholderTextColor={T.textMuted}
            style={[s.searchInput, { color: T.text }, { outlineStyle: 'none' } as any]}
            autoCapitalize="characters"
          />
        </View>
        <FlatList
          data={available}
          keyExtractor={sym => sym}
          renderItem={({ item: sym }) => (
            <Pressable onPress={() => onAdd(sym)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>{fmt.symbol(sym)}</Text>
                  <Text style={{ fontSize: 12, color: T.textMuted }}>Forex</Text>
                </View>
              </View>
              <Ionicons name="add-circle" size={26} color={T.trading.profit} />
            </Pressable>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: T.textMuted, marginTop: 40, fontSize: 15 }}>{isLoading ? "Fetching markets..." : "No matching assets available."}</Text>}
        />
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
        {content}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}



/* ───── QuotesScreen ───── */

export function QuotesScreen() {
  const router = useRouter();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';

  const quoteSymbols = useUserPreferences((st) => st.quoteSymbols);
  const addQuoteSymbol = useUserPreferences((st) => st.addQuoteSymbol);
  const removeQuoteSymbol = useUserPreferences((st) => st.removeQuoteSymbol);
  const setQuoteSymbols = useUserPreferences((st) => st.setQuoteSymbols);
  const setChartSymbol = useUserPreferences((st) => st.setChartSymbol);

  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const showActionSheet = useUIState((s) => s.showActionSheet);

  const { data: apiSymbols = [] } = useMarketSymbols();

  const hasSetInitialSymbols = useUserPreferences((st) => st.hasSetInitialSymbols);
  const setHasSetInitialSymbols = useUserPreferences((st) => st.setHasSetInitialSymbols);

  // ── Auto-Purge Invalid Symbols & Initial Population ────────────────────────
  useEffect(() => {
    if (apiSymbols.length > 0) {
      if (!hasSetInitialSymbols) {
        quotesWsService.setSubscriptions(apiSymbols);
        const timer = setTimeout(() => {
          const state = useTradingState.getState();
          const tickingSymbols = Object.keys(state.quotes).filter(sym => !!state.quotes[sym].bid);
          
          if (tickingSymbols.length > 0) {
            setQuoteSymbols(tickingSymbols.slice(0, 8));
          } else {
            setQuoteSymbols(apiSymbols.slice(0, 6)); 
          }
          setHasSetInitialSymbols(true);
        }, 2500);
        return () => clearTimeout(timer);
      } else {
        const validSymbols = quoteSymbols.filter((sym) => apiSymbols.includes(sym));
        if (validSymbols.length < quoteSymbols.length) {
          setQuoteSymbols(validSymbols);
        }
      }
    }
  }, [apiSymbols, quoteSymbols, setQuoteSymbols, hasSetInitialSymbols, setHasSetInitialSymbols]);

  // One-time aggressive purge for legacy polluted lists
  useEffect(() => {
    const timer = setTimeout(() => {
      const stateQuotes = useTradingState.getState().quotes;
      const active = quoteSymbols.filter(sym => !!stateQuotes[sym]?.bid);
      if (active.length > 0 && active.length < quoteSymbols.length) {
         setQuoteSymbols(active);
      }
    }, 4500);
    return () => clearTimeout(timer);
  }, []);

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(new Date());

  const toggleEditMode = () => {
    if (!isEditing) setSearch('');
    setIsEditing(!isEditing);
  };

  const moveQuote = (fromIndex: number, toIndex: number) => {
    const newQueue = [...quoteSymbols];
    const element = newQueue.splice(fromIndex, 1)[0];
    newQueue.splice(toIndex, 0, element);
    setQuoteSymbols(newQueue);
  };

  /* 1-second clock tick */
  useEffect(() => {
    const id = setInterval(() => setUpdatedAt(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeQuoteSymbols = useActiveSymbols(quoteSymbols);

  /* Real-time WebSocket feed subscriptions (bypasses UI re-renders) */
  useEffect(() => {
    quotesWsService.connect();
    quotesWsService.setSubscriptions(quoteSymbols);
    return () => {
      quotesWsService.unsubscribe(quoteSymbols);
    };
  }, [quoteSymbols]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Use activeQuoteSymbols for viewing so dead symbols are completely invisible.
    // Use quoteSymbols for editing so they can still manage their raw list if needed.
    const sourceList = isEditing ? quoteSymbols : activeQuoteSymbols;
    return sourceList.filter((sym) => sym.toLowerCase().includes(q));
  }, [quoteSymbols, activeQuoteSymbols, search, isEditing]);

  const goDetail = (sym: string) => {
    setChartSymbol(sym);
    router.push({ pathname: '/quotes/details', params: { symbol: sym } });
  };

  /* Dynamic per-theme values */
  const menuBtnBg = isDark ? 'rgba(255,255,255,0.08)' : T.glass1;
  const menuBtnBdr = isDark ? 'rgba(255,255,255,0.15)' : T.border;
  const secBtnBg = isDark ? 'rgba(255,255,255,0.06)' : T.glass1;
  const secBtnBdr = isDark ? 'rgba(255,255,255,0.12)' : T.border;
  const searchBarStyle: any = isDark ? {
    backgroundColor: 'rgba(30, 41, 59, 0.55)', // Deep translucent slate glass
    borderTopColor: 'rgba(255, 255, 255, 0.12)', // Top edge light reflection
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
    borderRightColor: 'rgba(0, 0, 0, 0.2)',
    borderBottomColor: 'rgba(0, 0, 0, 0.4)', // Bottom shadow sink
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  } : {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <SafeAreaView style={s.safe}>
        <View style={s.screen}>

          {/* ── Inline Header ── */}
          <View style={{ height: 40, marginTop: 0, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: T.text, textAlign: 'center' }}>Quotes</Text>

            {/* Float header controls to the right */}
            <View style={{ position: 'absolute', right: 0, height: '100%', justifyContent: 'center' }}>
              <View style={{
                 flexDirection: 'row', 
                 alignItems: 'center', 
                 gap: 18,
                 paddingRight: 4,
              }}>
                <Pressable onPress={() => setShowAddModal(true)} hitSlop={12}>
                  <Ionicons name="add-outline" size={24} color={isDark ? 'rgba(255, 255, 255, 0.75)' : T.textSub} />
                </Pressable>
                <Pressable onPress={toggleEditMode} hitSlop={12}>
                  <Ionicons name={isEditing ? "checkmark-done-outline" : "pencil-outline"} size={22} color={isDark ? 'rgba(255, 255, 255, 0.75)' : T.textSub} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Subheader ── */}
          <View style={s.subheaderRow}>
            <Text style={[s.subLeft, { color: T.textMuted }]}>Last Updated: {gmtClock(updatedAt)} GMT</Text>
            <TickCounter T={T} />
          </View>

          {/* ── Search ── */}
          <View style={[s.searchBar, searchBarStyle]}>
            <Ionicons name="search" size={20} color={T.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              style={[s.searchInput, { color: T.text }, { outlineStyle: 'none' } as any]}
              placeholder="Search Assets, Pairs, and Indices..."
              placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.4)' : T.textMuted}
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
            keyExtractor={(sym) => sym}
            extraData={isEditing}
            renderItem={({ item: sym, index }) => {
              if (isEditing) {
                const globalIndex = quoteSymbols.indexOf(sym);
                return (
                  <EditQuoteRow
                    symbol={sym}
                    index={globalIndex}
                    total={quoteSymbols.length}
                    T={T}
                    isDark={isDark}
                    onRemove={() => removeQuoteSymbol(sym)}
                    onMoveUp={() => moveQuote(globalIndex, globalIndex - 1)}
                    onMoveDown={() => moveQuote(globalIndex, globalIndex + 1)}
                  />
                );
              }

              return (
                <QuoteCard
                  symbol={sym}
                  T={T}
                  isDark={isDark}
                  onPress={() => goDetail(sym)}
                  onLongPress={() => showActionSheet({
                    title: sym,
                    actions: [
                      { label: 'Chart', onPress: () => { setChartSymbol(sym); router.push('/(tabs)/chart'); } },
                      { label: 'Details', onPress: () => goDetail(sym) },
                      { label: 'Hide', danger: true, onPress: () => removeQuoteSymbol(sym) },
                    ],
                  })}
                />
              );
            }}
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

      {/* ── Add Modal (Moved out of padding scope so Web absolute overlay works) ── */}
      <AddSymbolModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={(sym: string) => {
          addQuoteSymbol(sym);
          setShowAddModal(false);
        }}
        T={T}
        isDark={isDark}
        existingSymbols={activeQuoteSymbols}
      />
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
  menuBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  iconBtnPrimary: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#6366F1' },
  iconBtnSecondary: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },

  /* Subheader */
  subheaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 16 },
  subLeft: { fontSize: 13, fontWeight: '500' },
  subRight: { flexDirection: 'row', alignItems: 'center' },
  subGrey: { fontSize: 13, fontWeight: '500' },
  subLive: { fontSize: 13, fontWeight: '700' },

  /* Search */
  searchBar: {
    borderWidth: 1, borderRadius: 24, height: 48,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 20, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },

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
    elevation: 0,
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
  flashOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 4, opacity: 0 },
  labelWithTick: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  priceValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'right' },
});

function TickCounter({ T }: { T: ThemeColors }) {
  const [tps, setTps] = useState(0);
  const tickCountRef = useRef(useTradingState.getState().tickCount);

  useEffect(() => {
    const unsub = useTradingState.subscribe((state) => {
      tickCountRef.current = state.tickCount;
    });
    return unsub;
  }, []);

  useEffect(() => {
    let lastTicks = tickCountRef.current;
    const interval = setInterval(() => {
      const current = tickCountRef.current;
      setTps(current - lastTicks);
      lastTicks = current;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={s.subRight}>
      <Text style={[s.subGrey, { color: T.textMuted }]}>Speed: </Text>
      <Text style={[s.subLive, { color: T.trading.profit, transform: [{ translateY: -1 }] }]}>{tps} tps  </Text>
      <Text style={[s.subGrey, { color: T.textMuted }]}>Status: </Text>
      <Text style={[s.subLive, { color: T.trading.profit, transform: [{ translateY: -1 }] }]}>LIVE</Text>
    </View>
  );
}

// Global active symbols tracker to avoid excessive re-renders
function useActiveSymbols(quoteSymbols: string[]) {
  const [activeSymbols, setActiveSymbols] = useState<string[]>([]);
  
  useEffect(() => {
    const id = setInterval(() => {
      const stateQuotes = useTradingState.getState().quotes;
      const currentActive = quoteSymbols.filter(sym => !!stateQuotes[sym]?.bid);
      
      setActiveSymbols(prev => {
        if (prev.length !== currentActive.length || prev.some((s, i) => s !== currentActive[i])) {
          return currentActive;
        }
        return prev;
      });
    }, 1500);
    return () => clearInterval(id);
  }, [quoteSymbols]);

  return activeSymbols;
}
