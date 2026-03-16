import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { quotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { fmt } from '../../utils/format';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dCol = (c: number) => c > 0 ? '#4ade80' : c < 0 ? '#f87171' : '#94A3B8';
const sgn = (c: number) => c > 0 ? '+' : '';

// ─── Flag helpers ─────────────────────────────────────────────────────────────
const CC: Record<string, string> = {
  EUR: 'eu', USD: 'us', GBP: 'gb', JPY: 'jp', CHF: 'ch', AUD: 'au',
  NZD: 'nz', CAD: 'ca', TRY: 'tr', ZAR: 'za', MXN: 'mx', SEK: 'se',
  NOK: 'no', DKK: 'dk', CNH: 'cn', SGD: 'sg', HKD: 'hk', PLN: 'pl',
  HUF: 'hu', CZK: 'cz', ILS: 'il', RUB: 'ru', BRL: 'br', INR: 'in',
  BTC: 'bt', ETH: 'et', XAU: 'xau', XAG: 'xag',
};
const flagUrl = (cc: string) => `https://flagcdn.com/w80/${cc}.png`;

// Crypto / commodity icon fallbacks
const ASSET_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  BTC: 'logo-bitcoin', ETH: 'diamond-outline', XAU: 'ellipse', XAG: 'ellipse',
  SPX: 'trending-up', US3: 'trending-up', NAS: 'trending-up', UK1: 'trending-up',
};

function SymbolFlags({ symbol }: { symbol: string }) {
  const core = symbol.replace(/m$/i, '');
  const base3 = core.slice(0, 3);
  const quote3 = core.length >= 6 ? core.slice(3, 6) : '';
  const baseCC = CC[base3];
  const quoteCC = CC[quote3];
  const assetIcon = ASSET_ICONS[base3];

  // If we have real country flags for both
  if (baseCC && quoteCC && !assetIcon) {
    return (
      <View style={fl.wrap}>
        <View style={fl.ring}><Image source={{ uri: flagUrl(baseCC) }} style={fl.img} /></View>
        <View style={[fl.ring, fl.overlap]}><Image source={{ uri: flagUrl(quoteCC) }} style={fl.img} /></View>
      </View>
    );
  }
  // Crypto / commodity fallback icon
  if (assetIcon) {
    return (
      <View style={fl.iconWrap}>
        <Ionicons name={assetIcon} size={22} color="#3B82F6" />
      </View>
    );
  }
  // Generic fallback
  return (
    <View style={fl.iconWrap}>
      <Ionicons name="globe-outline" size={22} color="#64748B" />
    </View>
  );
}
const fl = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(59,130,246,0.2)', overflow: 'hidden', backgroundColor: '#141a2e' },
  overlap: { marginLeft: -12 },
  img: { width: 40, height: 40, borderRadius: 20 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
});

// ─── Instrument meta ─────────────────────────────────────────────────────────
type Meta = { name: string; category: string; sector: string; spreadMode: string; stopsLevel: string; calculation: string; chartMode: string; sessions: Array<[string, string]>; };
const DEFAULT_SESSIONS: Array<[string, string]> = [['Sunday', '23:05 – 24:00'], ['Monday', '00:00 – 24:00'], ['Tuesday', '00:00 – 24:00'], ['Wednesday', '00:00 – 24:00'], ['Thursday', '00:00 – 24:00'], ['Friday', '00:00 – 22:59']];
const META: Record<string, Partial<Meta>> = {
  BTCUSDm: { name: 'Bitcoin vs US Dollar', category: 'Crypto', sector: 'Digital Asset', spreadMode: 'Floating', stopsLevel: '0', calculation: 'Exchange', chartMode: 'By Last' },
  XAUUSDm: { name: 'Gold vs US Dollar', category: 'Commodity', sector: 'Precious Metal', spreadMode: 'Floating', stopsLevel: '0', calculation: 'CFD', chartMode: 'By Bid' },
};
function getMeta(sym: string): Meta { return { name: sym.replace(/m$/i, '') + ' Instrument', category: 'Major', sector: 'Currency', spreadMode: 'Floating', stopsLevel: '0', calculation: 'Forex', chartMode: 'By Bid', sessions: DEFAULT_SESSIONS, ...META[sym] }; }

// ─── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={sec.card}>
      <LinearGradient colors={['rgba(59,130,246,0.06)', 'rgba(59,130,246,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sec.headerGrad}>
        <View style={sec.iconBox}>
          <Ionicons name={icon} size={13} color="#60A5FA" />
        </View>
        <Text style={sec.title}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-down" size={14} color="#475569" />
      </LinearGradient>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  card: { backgroundColor: 'rgba(12,18,34,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 16, marginHorizontal: spacing.md, marginBottom: 12, overflow: 'hidden' },
  headerGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 10 },
  iconBox: { width: 26, height: 26, borderRadius: 7, backgroundColor: 'rgba(96,165,250,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
});

// ─── Row ──────────────────────────────────────────────────────────────────────
function Row({ label, value, accent, last = false }: { label: string; value: string; accent?: string; last?: boolean }) {
  return (
    <View style={[rw.row, last && { borderBottomWidth: 0 }]}>
      <Text style={rw.key}>{label}</Text>
      <Text style={[rw.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}
const rw = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  key: { color: '#64748B', fontSize: 13, fontWeight: '500' },
  val: { color: '#E2E8F0', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: '60%', textAlign: 'right' },
});

// ─── Metric Pill ──────────────────────────────────────────────────────────────
function MetricPill({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={mp.chip}>
      <View style={mp.iconRow}>
        <Ionicons name={icon} size={14} color={accent ?? "#94A3B8"} />
        <Text style={mp.lbl}>{label}</Text>
      </View>
      <Text style={[mp.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}
const mp = StyleSheet.create({
  chip: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)',
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  lbl: { color: '#94A3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700' },
  val: { color: '#F8FAFC', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
});

// ─── Range Bar ────────────────────────────────────────────────────────────────
function RangeBar({ pos, color }: { pos: number; color: string }) {
  return (
    <View style={rangeB.track}>
      <LinearGradient
        colors={['transparent', color]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[rangeB.fill, { width: `${pos}%` as any }]}
      />
      <View style={[rangeB.knob, { left: `${pos}%` as any, borderColor: color, shadowColor: color, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]} />
    </View>
  );
}
const rangeB = StyleSheet.create({
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 2, position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  knob: { position: 'absolute', top: -6, width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginLeft: -7, backgroundColor: '#0a0e18' },
});

// ─── Momentum Indicator ──────────────────────────────────────────────────────
function MomentumBar({ pct }: { pct: number }) {
  const buyPct = Math.max(10, Math.min(90, 50 + pct * 10));
  const sellPct = 100 - buyPct;
  return (
    <View style={mom.container}>
      <View style={mom.header}>
        <Text style={mom.title}>MARKET SENTIMENT</Text>
      </View>
      <View style={mom.barRow}>
        <Text style={[mom.pctText, { color: '#4ade80' }]}>{buyPct.toFixed(0)}%</Text>
        <View style={mom.barTrack}>
          <LinearGradient colors={['#22c55e', '#16a34a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[mom.barFillLeft, { width: `${buyPct}%` as any }]} />
          <LinearGradient colors={['#dc2626', '#ef4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[mom.barFillRight, { width: `${sellPct}%` as any }]} />
        </View>
        <Text style={[mom.pctText, { color: '#f87171' }]}>{sellPct.toFixed(0)}%</Text>
      </View>
      <View style={mom.labelRow}>
        <Text style={[mom.label, { color: '#4ade80' }]}>BUYERS</Text>
        <Text style={[mom.label, { color: '#f87171' }]}>SELLERS</Text>
      </View>
    </View>
  );
}
const mom = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 16, padding: 14 },
  header: { marginBottom: 12 },
  title: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pctText: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'], width: 38 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden' },
  barFillLeft: { height: 6 },
  barFillRight: { height: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 48 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
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
  const spp = ((q.spread || 0) * (pip || 1)).toFixed(1);
  const ctk = q.tickValue ?? (10 / mid);
  const pts = (((q.bid || 0) - (q.close ?? q.bid ?? 0)) / (pip || 1)).toFixed(0);
  const isUp = q.changePct >= 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Ambient glow orbs */}
      <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: isUp ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)', top: -100, right: -60 }} />
      <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(59,130,246,0.03)', bottom: 300, left: -60 }} />

      {/* ── Sticky Nav ─────────────── */}
      <View style={nav.bar}>
        <Pressable style={nav.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#CBD5E1" />
        </Pressable>
        <View style={nav.center}>
          <View style={nav.liveDot} />
          <Text style={nav.categoryText}>{meta.category}</Text>
        </View>
        <View style={nav.rightGroup}>
          <Pressable style={nav.iconBtn} onPress={() => setAlertOn(v => !v)}>
            <Ionicons name={alertOn ? 'notifications' : 'notifications-outline'} size={17} color={alertOn ? '#FACC15' : '#64748B'} />
          </Pressable>
          <Pressable style={nav.iconBtn}>
            <Ionicons name="share-outline" size={17} color="#64748B" />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ════ ENTERPRISE HERO SECTION ════ */}
        <View style={glassHero.container}>
          {/* Base Blur and Gradient */}
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={glassHero.borderHighlight} />
          {/* 1. SYMBOL HEADER */}
          <View style={glassHero.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <SymbolFlags symbol={symbol} />
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={hero.sym}>{symbol.replace(/m$/i, '')}</Text>
                <Text style={hero.name}>{meta.name}</Text>
              </View>
            </View>
            <View style={[hero.statusBadge, {
              backgroundColor: q.tradeAllowed ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
              borderColor: q.tradeAllowed ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)'
            }]}>
              <View style={[hero.statusDot, { backgroundColor: q.tradeAllowed ? '#4ade80' : '#f87171' }]} />
              <Text style={[hero.statusTxt, { color: q.tradeAllowed ? '#4ade80' : '#f87171' }]}>
                {q.tradeAllowed ? 'OPEN' : 'CLOSED'}
              </Text>
            </View>
          </View>

          {/* 2. LIVE PRICE */}
          <View style={glassHero.priceRow}>
            <Text style={[glassHero.bigPrice, { color: col }]}>{fmt.price(q.bid, d)}</Text>
            <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
              <View style={[hero.changePill, { backgroundColor: col }]}>
                <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={12} color="#000" />
                <Text style={hero.changeTxt}>{sgn(q.changePct)}{(q.changePct || 0).toFixed(2)}%</Text>
              </View>
              <Text style={glassHero.ptsTxt}>{sgn(q.changePct)}{pts} pts today</Text>
            </View>
          </View>

          {/* 3. PREMIUM PRICE TICKER (BID/ASK) */}
          <View style={ticker.container}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <View style={ticker.spreadBadge}>
              <Text style={ticker.spreadVal}>{q.spread}</Text>
              <Text style={ticker.spreadLbl}>SPREAD</Text>
            </View>

            <View style={ticker.inner}>
              {/* SELL */}
              <Pressable style={ticker.side}>
                <View style={ticker.sideHeader}>
                  <Text style={[ticker.sideLabel, { color: '#f87171' }]}>SELL</Text>
                  <View style={ticker.arrowWrap}>
                    <Ionicons name="caret-down" size={12} color="#f87171" style={{ marginTop: 1 }} />
                  </View>
                </View>
                <View style={ticker.priceWrap}>
                  <Text style={ticker.priceBase}>{fmt.price(q.bid, d).slice(0, -2)}</Text>
                  <Text style={[ticker.pipHighlight, { color: '#f87171' }]}>{fmt.price(q.bid, d).slice(-2)}</Text>
                </View>
                <View style={[ticker.accentBar, { backgroundColor: '#f87171' }]} />
              </Pressable>

              {/* CENTER DIVIDER */}
              <View style={ticker.dividerCol}>
                <View style={ticker.dividerLine} />
                <View style={ticker.pipBadge}>
                  <Text style={ticker.pipVal}>{spp}</Text>
                  <Text style={ticker.pipUnit}>PIP</Text>
                </View>
              </View>

              {/* BUY */}
              <Pressable style={ticker.side}>
                <View style={ticker.sideHeader}>
                  <Text style={[ticker.sideLabel, { color: '#4ade80' }]}>BUY</Text>
                  <View style={ticker.arrowWrap}>
                    <Ionicons name="caret-up" size={12} color="#4ade80" style={{ marginTop: -1 }} />
                  </View>
                </View>
                <View style={ticker.priceWrap}>
                  <Text style={ticker.priceBase}>{fmt.price(q.ask, d).slice(0, -2)}</Text>
                  <Text style={[ticker.pipHighlight, { color: '#4ade80' }]}>{fmt.price(q.ask, d).slice(-2)}</Text>
                </View>
                <View style={[ticker.accentBar, { backgroundColor: '#4ade80' }]} />
              </Pressable>
            </View>

            <View style={ticker.infoStrip}>
              <View style={ticker.infoItem}>
                <Ionicons name="swap-horizontal" size={14} color="#64748B" />
                <Text style={ticker.infoTxt}>Spread: {q.spread} ({spp} pip)</Text>
              </View>
              <View style={ticker.infoItem}>
                <Ionicons name="time-outline" size={14} color="#64748B" />
                <Text style={ticker.infoTxt}>Live Data</Text>
              </View>
            </View>
          </View>

          {/* 4. METRICS ROW */}
          <View style={glassHero.metricsRow}>
            <MetricPill label="MID" value={fmt.price(mid, d)} accent={col} icon="analytics-outline" />
            <MetricPill label="OPEN" value={fmt.price(q.open ?? q.bid, d)} icon="time-outline" />
            <MetricPill label="PREV" value={fmt.price(q.close ?? q.ask, d)} icon="calendar-outline" />
            <MetricPill label="VOL" value={(q.volume ?? 0).toLocaleString()} icon="bar-chart-outline" />
          </View>

          {/* 5. DAY RANGE */}
          <View style={glassHero.rangeCard}>
            <View style={glassHero.rangeTop}>
              <View>
                <Text style={glassHero.rangeLbl}>LOW</Text>
                <Text style={glassHero.rangeVal}>{fmt.price(q.low, d)}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={glassHero.rangeLbl}>DAY RANGE</Text>
                <Text style={[glassHero.rangeVal, { color: col }]}>{(rPct || 0).toFixed(2)}%</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={glassHero.rangeLbl}>HIGH</Text>
                <Text style={glassHero.rangeVal}>{fmt.price(q.high, d)}</Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>
              <RangeBar pos={vol} color={col} />
            </View>
          </View>

          {/* 6. SENTIMENT */}
          <MomentumBar pct={q.changePct} />

        </View>

        {/* ── Action Buttons ───── */}
        <View style={act.row}>
          <Pressable style={({ pressed }) => [act.btn, act.buyBtn, pressed && { opacity: 0.85 }]} onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol } })}>
            <LinearGradient colors={['#2563EB', '#1D4ED8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <Ionicons name="flash" size={15} color="#fff" />
            <Text style={act.buyTxt}>Trade Now</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [act.btn, act.chartBtn, pressed && { opacity: 0.85 }]} onPress={() => { setChartSymbol(symbol); router.push('/(tabs)/chart'); }}>
            <Ionicons name="stats-chart-outline" size={15} color="#94A3B8" />
            <Text style={act.chartTxt}>Full Chart</Text>
          </Pressable>
        </View>

        {/* ── Data Sections ────────────── */}
        <Section title="Contract Specification" icon="document-text-outline">
          <Row label="Contract Size" value={q.contractSize >= 1000 ? `${((q.contractSize || 0) / 1000).toFixed(0)}K units` : String(q.contractSize)} />
          <Row label="Min Volume" value={String(q.minVolume ?? '0.01') + ' lot'} />
          <Row label="Max Volume" value={String(q.maxVolume ?? '500') + ' lots'} />
          <Row label="Lot Step" value={String(q.stepVolume ?? '0.01')} />
          <Row label="Tick Size" value={String(q.tickSize ?? pip)} />
          <Row label="Tick Value" value={'$' + (ctk || 0).toFixed(4)} last />
        </Section>

        <Section title="Pricing & Fees" icon="cash-outline">
          <Row label="Digits" value={String(d)} />
          <Row label="Spread Mode" value={meta.spreadMode} />
          <Row label="Current Spread" value={`${q.spread} (${spp} pips)`} />
          <Row label="Stops Level" value={meta.stopsLevel} />
          <Row label="Margin Initial" value={(q.marginInitial ?? 0).toFixed(2) + '%'} />
          <Row label="Margin Maintenance" value={(q.marginMaintenance ?? 0).toFixed(2) + '%'} />
          <Row label="Swap Long" value={(q.swapLong ?? 0).toFixed(2) + ' pts'} accent={(q.swapLong ?? 0) < 0 ? '#f87171' : '#4ade80'} />
          <Row label="Swap Short" value={(q.swapShort ?? 0).toFixed(2) + ' pts'} accent={(q.swapShort ?? 0) > 0 ? '#4ade80' : '#f87171'} last />
        </Section>

        <Section title="Instrument Profile" icon="briefcase-outline">
          <Row label="Category" value={meta.category} />
          <Row label="Sector" value={meta.sector} />
          <Row label="Calculation" value={meta.calculation} />
          <Row label="Chart Mode" value={meta.chartMode} />
          <Row label="Base Currency" value={q.baseCurrency ?? symbol.slice(0, 3)} />
          <Row label="Profit Currency" value={q.profitCurrency ?? 'USD'} last />
        </Section>

        <Section title="Trading Sessions" icon="time-outline">
          {meta.sessions.map(([day, hours], i) => {
            const isActive = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day);
            return (
              <View key={day} style={[rw.row, i === meta.sessions.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[ses.dot, isActive && ses.dotActive]} />
                  <Text style={rw.key}>{day}</Text>
                </View>
                <Text style={rw.val}>{hours}</Text>
              </View>
            );
          })}
        </Section>

      </ScrollView>
    </View>
  );
}

const ses = StyleSheet.create({
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1E293B' },
  dotActive: { backgroundColor: '#4ade80', shadowColor: '#4ade80', shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const nav = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: 44, paddingBottom: 8 },
  back: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  center: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80', shadowColor: '#4ade80', shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  categoryText: { color: '#94A3B8', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  rightGroup: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
});

const glassHero = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md, marginBottom: 20, borderRadius: 24, overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, backgroundColor: 'transparent'
  },
  borderHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
  priceRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 12 },
  bigPrice: { fontSize: 48, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1.5, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  ptsTxt: { color: '#94A3B8', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 4 },
  metricsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  rangeCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)', paddingVertical: 12 },
  rangeTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  rangeLbl: { color: '#94A3B8', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  rangeVal: { color: '#F8FAFC', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

const hero = StyleSheet.create({
  sym: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  name: { color: '#94A3B8', fontSize: 14, fontWeight: '500', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, alignSelf: 'center', marginBottom: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  changeTxt: { fontSize: 13, fontWeight: '900', color: '#000', fontVariant: ['tabular-nums'] },
});

const ticker = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginBottom: 10, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'transparent', position: 'relative', overflow: 'hidden',
  },
  spreadBadge: {
    position: 'absolute', top: -1, alignSelf: 'center', zIndex: 10,
    backgroundColor: 'rgba(15,20,35,0.95)', borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  spreadVal: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  spreadLbl: { color: '#CBD5E1', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  inner: { flexDirection: 'row', alignItems: 'stretch', paddingTop: 26, paddingBottom: 8 },
  side: { flex: 1, alignItems: 'center', position: 'relative' },
  sideHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sideLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  arrowWrap: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  priceWrap: { flexDirection: 'row', alignItems: 'baseline' },
  priceBase: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  pipHighlight: { fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  accentBar: { width: '50%', height: 2, borderRadius: 1, marginTop: 4, opacity: 0.8 },
  dividerCol: { alignItems: 'center', justifyContent: 'center', width: 44, position: 'relative' },
  dividerLine: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', position: 'absolute', top: 0, bottom: 0 },
  pipBadge: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', zIndex: 2, alignItems: 'center' },
  pipVal: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  pipUnit: { color: '#94A3B8', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  infoStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoTxt: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
});

const act = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginHorizontal: spacing.md, marginBottom: 16 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 15, gap: 6, overflow: 'hidden' },
  buyBtn: { borderWidth: 0, shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  buyTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  chartBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chartTxt: { color: '#94A3B8', fontSize: 15, fontWeight: '700' },
});
