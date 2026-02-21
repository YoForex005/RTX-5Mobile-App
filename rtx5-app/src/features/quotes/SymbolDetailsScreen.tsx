import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { quotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { fmt } from '../../utils/format';



const dCol = (c: number) => c > 0 ? G.up : c < 0 ? G.down : G.flat;
const dBg = (c: number) => c > 0 ? G.upGlow : c < 0 ? G.downGlow : 'rgba(255,255,255,0.05)';
const dBdr = (c: number) => c > 0 ? 'rgba(0,230,118,0.2)' : c < 0 ? 'rgba(255,23,68,0.15)' : G.border;
const sgn = (c: number) => c > 0 ? '+' : '';

// ─── Instrument meta (static broker spec) ────────────────────────────────────
type Meta = { name: string; category: string; sector: string; spreadMode: string; stopsLevel: string; calculation: string; chartMode: string; sessions: Array<[string, string]>; };
const DEFAULT_SESSIONS: Array<[string, string]> = [['Sunday', '23:05 – 24:00'], ['Monday', '00:00 – 24:00'], ['Tuesday', '00:00 – 24:00'], ['Wednesday', '00:00 – 24:00'], ['Thursday', '00:00 – 24:00'], ['Friday', '00:00 – 22:59']];
const META: Record<string, Partial<Meta>> = {
  BTCUSDm: { name: 'Bitcoin vs US Dollar', category: 'Crypto', sector: 'Digital Asset', spreadMode: 'Floating', stopsLevel: '0', calculation: 'Exchange', chartMode: 'By Last' },
  XAUUSDm: { name: 'Gold vs US Dollar', category: 'Commodity', sector: 'Precious Metal', spreadMode: 'Floating', stopsLevel: '0', calculation: 'CFD', chartMode: 'By Bid' },
};
function getMeta(sym: string): Meta { return { name: sym + ' Instrument', category: 'Major', sector: 'Currency', spreadMode: 'Floating', stopsLevel: '0', calculation: 'Forex', chartMode: 'By Bid', sessions: DEFAULT_SESSIONS, ...META[sym] }; }

// ─── Sub-components ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sec.card}>
      <Text style={sec.title}>{title}</Text>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  card: { backgroundColor: G.glass1, borderWidth: 1, borderColor: G.border, borderRadius: 16, marginHorizontal: spacing.md, marginBottom: 16, overflow: 'hidden' },
  title: { color: G.text, fontSize: 14, fontWeight: '800', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: G.border, letterSpacing: 1 },
});

function Row({ label, value, accent, last = false }: { label: string; value: string; accent?: string; last?: boolean }) {
  return (
    <View style={[rw.row, last && { borderBottomWidth: 0 }]}>
      <Text style={rw.key}>{label}</Text>
      <Text style={[rw.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}
const rw = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: G.border },
  key: { color: G.textSub, fontSize: 13, fontWeight: '500' },
  val: { color: G.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], maxWidth: '60%', textAlign: 'right', letterSpacing: -0.3 },
});

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={mt.chip}>
      <Text style={mt.lbl}>{label}</Text>
      <Text style={[mt.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}
const mt = StyleSheet.create({
  chip: { flex: 1, backgroundColor: G.glass2, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: G.border },
  lbl: { color: G.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  val: { color: G.text, fontSize: 16, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
});

function GlowingRangeBar({ pos, color }: { pos: number; color: string }) {
  return (
    <View style={rb.track}>
      <View style={[rb.fill, { width: `${pos}%` as any, backgroundColor: color, shadowColor: color, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }]} />
      <View style={[rb.knob, { left: `${pos}%` as any, backgroundColor: G.bg, borderColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }]} />
    </View>
  );
}
const rb = StyleSheet.create({
  track: { height: 4, backgroundColor: G.border, borderRadius: 2, position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, opacity: 0.9 },
  knob: { position: 'absolute', top: -6, width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginLeft: -8 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function SymbolDetailsScreen() {
  const { symbol = 'BTCUSDm' } = useLocalSearchParams<{ symbol?: string }>();
  const { setChartSymbol } = useUserPreferences();
  const [alertOn, setAlertOn] = useState(false);

  const q = useMemo(() => quotes.find(i => i.symbol === symbol) ?? quotes[0], [symbol]);
  const meta = useMemo(() => getMeta(symbol), [symbol]);

  const d = q.digits ?? (q.bid >= 100 ? 2 : q.bid >= 10 ? 3 : 4);
  const col = dCol(q.changePct);
  const mid = (q.bid + q.ask) / 2;
  const rng = q.high - q.low;
  const rPct = q.low > 0 ? (rng / q.low) * 100 : 0;
  const vol = rng > 0 ? Math.min(100, Math.max(0, ((mid - q.low) / rng) * 100)) : 50;
  const pip = 1 / Math.pow(10, d);
  const spp = (q.spread * pip).toFixed(1);
  const ctk = q.tickValue ?? (10 / mid);

  const pts = ((q.bid - (q.close ?? q.bid)) / pip).toFixed(0);

  return (
    <LinearGradient colors={['#000000', '#0a0d14', '#000000']} locations={[0, 0.5, 1]} style={{ flex: 1 }}>
      {/* Ambient orbs */}
      <View style={{ position: 'absolute', width: 400, height: 400, borderRadius: 200, filter: [{ blur: 80 }], backgroundColor: dBg(q.changePct), top: -150, right: -100, opacity: 0.4 }} />

      {/* ── Nav ──────────────────────── */}
      <View style={nav.bar}>
        <Pressable style={nav.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={G.text} />
        </Pressable>
        <Text style={nav.title}>{symbol}</Text>
        <Pressable style={nav.alertBtn} onPress={() => setAlertOn(v => !v)}>
          <Ionicons name={alertOn ? 'notifications' : 'notifications-outline'} size={18} color={alertOn ? G.up : G.text} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60, paddingTop: 10 }}>

        {/* ── Hero Glass Card ──────────── */}
        <View style={hero.card}>
          <View style={hero.top}>
            <View>
              <Text style={hero.sym}>{symbol}</Text>
              <Text style={hero.name}>{meta.name}</Text>
            </View>
            <View style={[hero.tradeBadge, { backgroundColor: q.tradeAllowed ? G.upGlow : G.downGlow, borderColor: q.tradeAllowed ? G.upGlow : G.downGlow }]}>
              <View style={[hero.dot, { backgroundColor: q.tradeAllowed ? G.up : G.down }]} />
              <Text style={[hero.tradeTxt, { color: q.tradeAllowed ? G.up : G.down }]}>
                {q.tradeAllowed ? 'TRADE OPEN' : 'TRADE CLOSED'}
              </Text>
            </View>
          </View>

          {/* Pricing Row */}
          <View style={hero.priceRow}>
            <View style={hero.priceCell}>
              <Text style={hero.priceLbl}>BID</Text>
              <Text style={[hero.priceVal, { color: col }]}>{fmt.price(q.bid, d)}</Text>
            </View>
            <View style={hero.priceDivider} />
            <View style={hero.priceCell}>
              <Text style={hero.priceLbl}>ASK</Text>
              <Text style={[hero.priceVal, { color: col }]}>{fmt.price(q.ask, d)}</Text>
            </View>
          </View>

          {/* Glowing Badges Row */}
          <View style={hero.strip}>
            <View style={[hero.chgBadge, { backgroundColor: col, shadowColor: col, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }]}>
              <Text style={hero.chgTxt}>{sgn(q.changePct)}{q.changePct.toFixed(2)}%</Text>
            </View>
            <Text style={[hero.pts, { color: col }]}>{sgn(q.changePct)}{pts} PTS</Text>
            <View style={{ flex: 1 }} />
            <Text style={hero.spreadTxt}>SPREAD {q.spread}  ({spp} PIP)</Text>
          </View>

          {/* Quick Info */}
          <View style={hero.metrics}>
            <Metric label="MID" value={fmt.price(mid, d)} accent={col} />
            <Metric label="OPEN" value={fmt.price(q.open ?? q.bid, d)} />
            <Metric label="PREV" value={fmt.price(q.close ?? q.ask, d)} />
            <Metric label="VOL" value={(q.volume ?? 0).toLocaleString()} />
          </View>

          {/* Heavy Glowing Day Range */}
          <View style={hero.rangeWrap}>
            <View style={hero.rangeLabels}>
              <Text style={hero.rLbl}>L  {fmt.price(q.low, d)}</Text>
              <Text style={hero.rLbl}>DAY RANGE  {rPct.toFixed(2)}%</Text>
              <Text style={hero.rLbl}>H  {fmt.price(q.high, d)}</Text>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
              <GlowingRangeBar pos={vol} color={col} />
            </View>
          </View>
        </View>

        {/* ── Massive Action Buttons ───── */}
        <View style={act.row}>
          <Pressable style={[act.btn, act.primary]} onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol } })}>
            <Text style={act.primaryTxt}>Trade</Text>
          </Pressable>
          <Pressable style={act.btn} onPress={() => { setChartSymbol(symbol); router.push('/(tabs)/chart'); }}>
            <Text style={act.btnTxt}>Chart</Text>
          </Pressable>
        </View>

        {/* ── Data Sections ────────────── */}
        <Section title="Contract Specification">
          <Row label="Contract Size" value={q.contractSize >= 1000 ? `${(q.contractSize / 1000).toFixed(0)}K units` : String(q.contractSize)} />
          <Row label="Min Volume" value={String(q.minVolume ?? ' 0.01') + ' lot'} />
          <Row label="Max Volume" value={String(q.maxVolume ?? '500') + ' lots'} />
          <Row label="Lot Step" value={String(q.stepVolume ?? '0.01')} />
          <Row label="Tick Size" value={String(q.tickSize ?? pip)} />
          <Row label="Tick Value" value={'$' + ctk.toFixed(4)} last />
        </Section>

        <Section title="Pricing & Fees">
          <Row label="Digits" value={String(d)} />
          <Row label="Spread Mode" value={meta.spreadMode} />
          <Row label="Current Spread" value={`${q.spread} (${spp} pips)`} />
          <Row label="Stops Level" value={meta.stopsLevel} />
          <Row label="Margin Initial" value={(q.marginInitial ?? 0).toFixed(2) + '%'} />
          <Row label="Margin Maintenance" value={(q.marginMaintenance ?? 0).toFixed(2) + '%'} />
          <Row label="Swap Long" value={String(q.swapLong ?? '—') + ' pts'} accent={q.swapLong < 0 ? G.down : G.up} />
          <Row label="Swap Short" value={String(q.swapShort ?? '—') + ' pts'} accent={q.swapShort > 0 ? G.up : G.down} last />
        </Section>

        <Section title="Instrument Profile">
          <Row label="Category" value={meta.category} />
          <Row label="Sector" value={meta.sector} />
          <Row label="Calculation" value={meta.calculation} />
          <Row label="Base Currency" value={q.baseCurrency ?? symbol.slice(0, 3)} />
          <Row label="Profit Currency" value={q.profitCurrency ?? 'USD'} last />
        </Section>

        <Section title="Trading Sessions">
          {meta.sessions.map(([day, hours], i) => (
            <Row key={day} label={day} value={hours} last={i === meta.sessions.length - 1} />
          ))}
        </Section>

      </ScrollView>
    </LinearGradient>
  );
}

const nav = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginTop: 40, marginBottom: 10, backgroundColor: 'transparent' },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: G.glass2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: G.border },
  title: { color: G.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  alertBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: G.border, backgroundColor: G.glass2, alignItems: 'center', justifyContent: 'center' },
});
const hero = StyleSheet.create({
  card: { backgroundColor: G.glass1, borderWidth: 1, borderColor: G.border, borderRadius: 20, marginHorizontal: spacing.md, marginBottom: 16, overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingBottom: 12 },
  sym: { color: G.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  name: { color: G.textSub, fontSize: 13, fontWeight: '500', marginTop: 4 },
  tradeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tradeTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  priceRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: G.border },
  priceCell: { flex: 1, alignItems: 'center', paddingVertical: 20 },
  priceDivider: { width: 1, backgroundColor: G.border },
  priceLbl: { color: G.textSub, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 },
  priceVal: { fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 6, letterSpacing: -1 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: G.border },
  chgBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chgTxt: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'], color: G.bg },
  pts: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  spreadTxt: { color: G.textSub, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metrics: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 10 },
  rangeWrap: {},
  rangeLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  rLbl: { color: G.textMuted, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
});
const act = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginHorizontal: spacing.md, marginBottom: 20 },
  btn: { flex: 1, backgroundColor: G.glass2, borderWidth: 1, borderColor: G.border, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 18 },
  primary: { backgroundColor: G.accentGlow, borderColor: G.accent, shadowColor: G.accent, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  btnTxt: { color: G.text, fontSize: 16, fontWeight: '800' },
  primaryTxt: { color: G.accent, fontSize: 16, fontWeight: '900', textShadowColor: G.accent, textShadowRadius: 8 },
});
