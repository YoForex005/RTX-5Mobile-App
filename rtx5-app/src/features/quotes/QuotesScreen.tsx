import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState, useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { quotes, QuoteItem } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { fmt } from '../../utils/format';


const dCol = (c: number) => c > 0 ? G.up : c < 0 ? G.down : G.flat;
const dBg = (c: number) => c > 0 ? G.upGlow : c < 0 ? G.downGlow : 'rgba(161,168,181,0.05)';
const sgn = (c: number) => c > 0 ? '+' : '';
const digs = (q: QuoteItem) => q.digits ?? (q.bid >= 100 ? 2 : q.bid >= 10 ? 3 : 4);
const sMid = (q: QuoteItem) => (q.bid + q.ask) / 2;
const sRng = (q: QuoteItem) => q.high - q.low;
const sRPct = (q: QuoteItem) => q.low > 0 ? ((q.high - q.low) / q.low) * 100 : 0;
const sPos = (q: QuoteItem) => { const r = sRng(q); return r > 0 ? Math.min(100, Math.max(0, ((sMid(q) - q.low) / r) * 100)) : 50; };
const sPip = (q: QuoteItem) => (q.spread * (1 / Math.pow(10, digs(q)))).toFixed(1);

// ─── Glowing Neon Bar ─────────────────────────────────────────────────────────
function RangeBar({ pos, color }: { pos: number; color: string }) {
  return (
    <View style={rb.track}>
      <View style={[rb.fill, { width: `${pos}%` as any, backgroundColor: color, shadowColor: color, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }]} />
      <View style={[rb.knob, { left: `${pos}%` as any, backgroundColor: G.bg, borderColor: color, shadowColor: color, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }]} />
    </View>
  );
}
const rb = StyleSheet.create({
  track: { height: 3, backgroundColor: G.border, borderRadius: 2, position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, opacity: 0.8 },
  knob: { position: 'absolute', top: -4.5, width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginLeft: -6 },
});

// ─── Price Block ──────────────────────────────────────────────────────────────
function PriceCol({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={pc.wrap}>
      <Text style={pc.lbl}>{label}</Text>
      <Text style={[pc.val, { color }]}>{value}</Text>
    </View>
  );
}
const pc = StyleSheet.create({
  wrap: { alignItems: 'flex-end' },
  lbl: { color: G.textSub, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: '600' },
  val: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
});

// ─── Data cell ────────────────────────────────────────────────────────────────
function DC({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={dc.cell}>
      <Text style={dc.lbl}>{label}</Text>
      <Text style={[dc.val, color ? { color } : null]}>{value}</Text>
    </View>
  );
}
const dc = StyleSheet.create({
  cell: { width: '33.33%', paddingTop: 12, paddingRight: 6 },
  lbl: { color: G.textMuted, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  val: { color: G.textSub, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 3 },
});

// ─── Seamless Glass Shell & Swipeable ─────────────────────────────────────────
function CardShell({ item, children, onPress, onLongPress, onAction }: { item: QuoteItem; children: React.ReactNode; onPress: () => void; onLongPress: () => void; onAction: (action: string, sym: string) => void }) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-120, 0], outputRange: [1, 0], extrapolate: 'clamp' });

    // Four actions: Delete (red), Details (glass), Chart (glass), Trade (blue)
    return (
      <View style={sps.actionsWrap}>
        <Pressable style={[sps.btn, sps.btnDel]} onPress={() => { swipeableRef.current?.close(); onAction('delete', item.symbol); }}>
          <Ionicons name="trash-outline" size={20} color={G.text} />
        </Pressable>
        <Pressable style={[sps.btn, sps.btnGlass]} onPress={() => { swipeableRef.current?.close(); onAction('details', item.symbol); }}>
          <Ionicons name="information-circle-outline" size={20} color={G.text} />
        </Pressable>
        <Pressable style={[sps.btn, sps.btnGlass]} onPress={() => { swipeableRef.current?.close(); onAction('chart', item.symbol); }}>
          <Ionicons name="bar-chart-outline" size={20} color={G.text} />
        </Pressable>
        <Pressable style={[sps.btn, sps.btnTrade]} onPress={() => { swipeableRef.current?.close(); onAction('trade', item.symbol); }}>
          <Ionicons name="flash-outline" size={20} color={G.text} />
        </Pressable>
      </View>
    );
  };

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} overshootRight={false} friction={2}>
      <Pressable style={({ pressed }) => [cs.card, pressed && { backgroundColor: G.glass2, borderColor: G.borderHi }]} onPress={onPress} onLongPress={onLongPress} delayLongPress={150}>
        {children}
      </Pressable>
    </Swipeable>
  );
}
const cs = StyleSheet.create({
  card: { backgroundColor: G.glass1, borderWidth: 1, borderColor: G.border, borderRadius: 16, marginHorizontal: spacing.md, marginBottom: 12, overflow: 'hidden' },
});
const sps = StyleSheet.create({
  actionsWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: spacing.md, marginBottom: 12 },
  btn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  btnDel: { backgroundColor: 'rgba(255,23,68,0.2)', borderColor: G.down },
  btnGlass: { backgroundColor: G.glass2, borderColor: G.border },
  btnTrade: { backgroundColor: 'rgba(41,121,255,0.2)', borderColor: G.accent },
});

// ─── SIMPLE card ──────────────────────────────────────────────────────────────
function SimpleCard({ item, onPress, onLongPress, onAction }: { item: QuoteItem; onPress: () => void; onLongPress: () => void; onAction: (a: string, s: string) => void }) {
  const col = dCol(item.changePct); const d = digs(item);
  return (
    <CardShell item={item} onPress={onPress} onLongPress={onLongPress} onAction={onAction}>
      <View style={sm.body}>
        <View style={sm.left}>
          <Text style={sm.sym}>{item.symbol}</Text>
          <View style={[sm.badge, { backgroundColor: dBg(item.changePct) }]}>
            <Text style={[sm.badgeTxt, { color: col }]}>{sgn(item.changePct)}{item.changePct.toFixed(2)}%</Text>
          </View>
          <Text style={sm.sub}>VOL {(item.volume ?? 0).toLocaleString()}</Text>
        </View>
        <View style={sm.right}>
          <PriceCol label="BID" value={fmt.price(item.bid, d)} color={col} />
          <View style={sm.sep} />
          <PriceCol label="ASK" value={fmt.price(item.ask, d)} color={col} />
        </View>
      </View>
    </CardShell>
  );
}
const sm = StyleSheet.create({
  body: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  left: { gap: 6 },
  sym: { color: G.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { color: G.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center' },
  sep: { width: 1, height: 40, backgroundColor: G.border, marginHorizontal: 12 },
});

// ─── ADVANCED card ────────────────────────────────────────────────────────────
function AdvancedCard({ item, onPress, onLongPress, onAction }: { item: QuoteItem; onPress: () => void; onLongPress: () => void; onAction: (a: string, s: string) => void }) {
  const col = dCol(item.changePct); const d = digs(item);
  const pos = sPos(item); const m = sMid(item); const rng = sRng(item); const rp = sRPct(item); const spp = sPip(item);

  return (
    <CardShell item={item} onPress={onPress} onLongPress={onLongPress} onAction={onAction}>
      {/* Upper Data */}
      <View style={av.rowA}>
        <View style={av.leftBlock}>
          <Text style={av.sym}>{item.symbol}</Text>
          <View style={[av.badge, { backgroundColor: dBg(item.changePct) }]}>
            <Text style={[av.badgeTxt, { color: col }]}>{sgn(item.changePct)}{item.changePct.toFixed(2)}%</Text>
          </View>
          <Text style={av.oc}>O: {fmt.price(item.open ?? item.bid, d)}  ·  C: {fmt.price(item.close ?? item.ask, d)}</Text>
        </View>
        <View style={av.prices}>
          <PriceCol label="BID" value={fmt.price(item.bid, d)} color={col} />
          <View style={av.pSep} />
          <PriceCol label="ASK" value={fmt.price(item.ask, d)} color={col} />
        </View>
      </View>
      {/* Glowing Range */}
      <View style={av.rangeRow}>
        <Text style={av.rEdge}>{fmt.price(item.low, d)}</Text>
        <View style={{ flex: 1, marginHorizontal: 12 }}><RangeBar pos={pos} color={col} /></View>
        <Text style={av.rEdge}>{fmt.price(item.high, d)}</Text>
      </View>
      {/* 9-cell detail grid */}
      <View style={av.grid}>
        <DC label="SPREAD" value={String(item.spread)} />
        <DC label="SPR PIPS" value={spp} />
        <DC label="MID" value={fmt.price(m, d)} color={col} />
        <DC label="DAY RNG" value={fmt.price(rng, d)} />
        <DC label="RANGE %" value={rp.toFixed(2) + '%'} />
        <DC label="VOLUME" value={(item.volume ?? 0).toLocaleString()} />
        <DC label="LOT MIN" value={String(item.minVolume ?? '—')} />
        <DC label="CONTRACT" value={(item.contractSize ?? 0) >= 1000 ? `${Math.round((item.contractSize ?? 0) / 1000)}K` : String(item.contractSize ?? '—')} />
        <DC label="MARGIN" value={(item.marginInitial ?? 0).toFixed(1) + '%'} />
      </View>
    </CardShell>
  );
}
const av = StyleSheet.create({
  rowA: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingBottom: 12 },
  leftBlock: { gap: 6 },
  sym: { color: G.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  oc: { color: G.textSub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  prices: { flexDirection: 'row', alignItems: 'center' },
  pSep: { width: 1, height: 40, backgroundColor: G.border, marginHorizontal: 12 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: G.border },
  rEdge: { color: G.textMuted, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 16 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Mode = 'simple' | 'advanced';
export function QuotesScreen() {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>('simple');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const { quoteSymbols, quoteViewMode, setQuoteViewMode, addQuoteSymbol, removeQuoteSymbol, setChartSymbol } = useUserPreferences();

  const [liveQuotes, setLiveQuotes] = useState<QuoteItem[]>(quotes);

  useEffect(() => {
    // Advanced Physics & Market Simulation Engine
    const interval = setInterval(() => {
      setLiveQuotes(current => current.map(q => {
        const volProbability = q.volatilityClass === 'high' ? 0.75 : q.volatilityClass === 'medium' ? 0.4 : 0.15;

        // Skip tick if probability misses
        if (Math.random() > volProbability) return q;

        const pipSize = q.tickSize ?? (1 / Math.pow(10, q.digits ?? 4));
        const priceScale = q.bid;

        // Simulating realistic Brownian motion: prices move randomly but within a constrained daily 2-3% bounds
        const maxDailySwing = priceScale * 0.03; // ~3% daily variance
        const driftLimitHigh = (q.open ?? priceScale) + maxDailySwing;
        const driftLimitLow = (q.open ?? priceScale) - maxDailySwing;

        // Force mean reversion if boundaries are pushed
        let bias = 0;
        if (q.bid > driftLimitHigh) bias = -0.001;
        if (q.bid < driftLimitLow) bias = 0.001;

        // Move by 1 to 5 pips max per tick depending on asset weight
        const pipVariance = (Math.random() - 0.5 + bias) * pipSize * (q.volatilityClass === 'high' ? 15 : 5);

        const newBid = Math.max(0.0001, q.bid + pipVariance);
        const newAsk = newBid + (q.spread * pipSize); // Lock Ask to the Bid based on Spread

        const newHigh = Math.max(q.high, newAsk);
        const newLow = Math.min(q.low, newBid);

        const newVol = q.volume ? q.volume + Math.floor(Math.random() * (q.volatilityClass === 'high' ? 150 : 10)) : q.volume;

        const open = q.open ?? q.bid;
        const changePct = open > 0 ? ((newBid - open) / open) * 100 : 0;

        return { ...q, bid: newBid, ask: newAsk, high: newHigh, low: newLow, volume: newVol, changePct };
      }));
    }, 800); // Super fast 800ms cycle for dense updates

    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => liveQuotes.filter(q => quoteSymbols.includes(q.symbol)).filter(q => q.symbol.toLowerCase().includes(search.trim().toLowerCase())), [quoteSymbols, search, liveQuotes]);
  const nextSymbol = useMemo(() => liveQuotes.find(q => !quoteSymbols.includes(q.symbol)), [quoteSymbols, liveQuotes]);

  const isEdit = quoteViewMode === 'edit';
  const goDetail = (sym: string) => { setChartSymbol(sym); router.push({ pathname: '/quotes/details', params: { symbol: sym } }); };

  const handleAction = (action: string, sym: string) => {
    switch (action) {
      case 'delete': removeQuoteSymbol(sym); break;
      case 'details': goDetail(sym); break;
      case 'chart': setChartSymbol(sym); router.push('/(tabs)/chart'); break;
      case 'trade': router.push({ pathname: '/trade/order-ticket', params: { symbol: sym } }); break;
    }
  };

  return (
    // Beautiful deep layered gradient background
    <LinearGradient colors={['#040a18', '#000000', '#0a0d14']} locations={[0, 0.4, 1]} style={{ flex: 1 }}>
      {/* Decorative ambient glow orbs behind everything */}
      <View style={[s.orb, { top: -100, left: -100, backgroundColor: 'rgba(41, 121, 255, 0.15)' }]} />
      <View style={[s.orb, { top: 300, right: -150, backgroundColor: 'rgba(0, 230, 118, 0.08)' }]} />

      <Screen style={{ backgroundColor: 'transparent' }}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Markets</Text>
          <View style={s.actions}>
            <View style={s.seg}>
              <Pressable style={[s.segBtn, mode === 'simple' && s.segOn]} onPress={() => setMode('simple')}>
                <Text style={[s.segTxt, mode === 'simple' && s.segTxtOn]}>SIM</Text>
              </Pressable>
              <Pressable style={[s.segBtn, mode === 'advanced' && s.segOn]} onPress={() => setMode('advanced')}>
                <Text style={[s.segTxt, mode === 'advanced' && s.segTxtOn]}>ADV</Text>
              </Pressable>
            </View>
            <Pressable style={s.iconBtn} onPress={() => setQuoteViewMode(isEdit ? 'list' : 'edit')}>
              <Ionicons name={isEdit ? 'checkmark' : 'pencil'} size={14} color={isEdit ? G.up : G.textSub} />
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View style={s.search}>
          <Ionicons name="search" size={16} color={G.textMuted} />
          <TextInput style={s.searchInput} placeholder="Search assets..." placeholderTextColor={G.textMuted} value={search} onChangeText={setSearch} autoCapitalize="characters" />
          {search.length > 0 && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={G.textMuted} /></Pressable>}
        </View>

        {/* Edit mode adder */}
        {isEdit && (
          <Pressable style={[s.addBtn, !nextSymbol && { opacity: 0.3 }]} disabled={!nextSymbol} onPress={() => { if (nextSymbol) addQuoteSymbol(nextSymbol.symbol); }}>
            <Ionicons name="add-circle" size={18} color={G.accent} />
            <Text style={s.addTxt}>{nextSymbol ? `Add ${nextSymbol.symbol}` : 'All tracked'}</Text>
          </Pressable>
        )}

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={item => item.symbol}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.list}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTxt}>No assets match search.</Text></View>}
          renderItem={({ item }) => mode === 'advanced'
            ? <AdvancedCard item={item} onPress={() => goDetail(item.symbol)} onLongPress={() => setActiveSymbol(item.symbol)} onAction={handleAction} />
            : <SimpleCard item={item} onPress={() => goDetail(item.symbol)} onLongPress={() => setActiveSymbol(item.symbol)} onAction={handleAction} />
          }
        />

        {/* Action sheet */}
        <ActionSheet visible={Boolean(activeSymbol)} title={activeSymbol ?? ''} onClose={() => setActiveSymbol(null)} actions={[{ label: 'Chart', onPress: () => { if (activeSymbol) setChartSymbol(activeSymbol); router.push('/(tabs)/chart'); } }, { label: 'Details', onPress: () => goDetail(activeSymbol ?? 'BTCUSDm') }, { label: 'Remove', danger: true, onPress: () => { if (activeSymbol) removeQuoteSymbol(activeSymbol); } }]} />
      </Screen>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  orb: { position: 'absolute', width: 300, height: 300, borderRadius: 150, filter: [{ blur: 50 }] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: 16 },
  title: { color: G.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: G.glass2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: G.border },
  seg: { flexDirection: 'row', backgroundColor: G.border, borderRadius: 20, padding: 4 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  segOn: { backgroundColor: G.glass3 },
  segTxt: { color: G.textSub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  segTxtOn: { color: G.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: spacing.md, marginBottom: 16, backgroundColor: G.glass1, borderWidth: 1, borderColor: G.borderHi, borderRadius: 12, paddingHorizontal: 16, height: 48 },
  searchInput: { flex: 1, color: G.text, fontSize: 15, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: spacing.md, marginBottom: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, marginBottom: 16, backgroundColor: G.glass1, borderWidth: 1, borderColor: G.accentGlow, borderRadius: 12, paddingVertical: 16 },
  addTxt: { color: G.accent, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  list: { paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTxt: { color: G.textMuted, fontSize: 15, fontWeight: '600' },
});
