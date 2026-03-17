import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { quotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dCol = (c: number, T: ThemeColors) => c > 0 ? T.up : c < 0 ? T.down : T.textMuted;
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
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const fl = useMemo(() => makeStyles(T, isDark).fl, [T, isDark]);

  const core = symbol.replace(/m$/i, '');
  const base3 = core.slice(0, 3);
  const quote3 = core.length >= 6 ? core.slice(3, 6) : '';
  const baseCC = CC[base3];
  const quoteCC = CC[quote3];
  const assetIcon = ASSET_ICONS[base3];

  if (baseCC && quoteCC && !assetIcon) {
    return (
      <View style={fl.wrap}>
        <View style={fl.ring}><Image source={{ uri: flagUrl(baseCC) }} style={fl.img} /></View>
        <View style={[fl.ring, fl.overlap]}><Image source={{ uri: flagUrl(quoteCC) }} style={fl.img} /></View>
      </View>
    );
  }
  if (assetIcon) {
    return (
      <View style={fl.iconWrap}>
        <Ionicons name={assetIcon} size={22} color="#3B82F6" />
      </View>
    );
  }
  return (
    <View style={fl.iconWrap}>
      <Ionicons name="globe-outline" size={22} color={T.textMuted} />
    </View>
  );
}

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
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const sec = useMemo(() => makeStyles(T, isDark).sec, [T, isDark]);

  return (
    <View style={sec.card}>
      <LinearGradient colors={isDark ? ['rgba(59,130,246,0.06)', 'rgba(59,130,246,0)'] : ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sec.headerGrad}>
        <View style={sec.iconBox}>
          <Ionicons name={icon} size={13} color={isDark ? "#60A5FA" : T.trading.buy.primary} />
        </View>
        <Text style={sec.title}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-down" size={14} color={T.textMuted} />
      </LinearGradient>
      {children}
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function Row({ label, value, accent, last = false }: { label: string; value: string; accent?: string; last?: boolean }) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const rw = useMemo(() => makeStyles(T, isDark).rw, [T, isDark]);

  return (
    <View style={[rw.row, last && { borderBottomWidth: 0 }]}>
      <Text style={rw.key}>{label}</Text>
      <Text style={[rw.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

// ─── Metric Pill ──────────────────────────────────────────────────────────────
function MetricPill({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon: keyof typeof Ionicons.glyphMap }) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const mp = useMemo(() => makeStyles(T, isDark).mp, [T, isDark]);

  return (
    <View style={mp.chip}>
      <View style={mp.iconRow}>
        <Ionicons name={icon} size={14} color={accent ?? T.textSub} />
        <Text style={mp.lbl}>{label}</Text>
      </View>
      <Text style={[mp.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

// ─── Range Bar ────────────────────────────────────────────────────────────────
function RangeBar({ pos, color }: { pos: number; color: string }) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const rangeB = useMemo(() => makeStyles(T, isDark).rangeB, [T, isDark]);

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

// ─── Momentum Indicator ──────────────────────────────────────────────────────
function MomentumBar({ pct }: { pct: number }) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const mom = useMemo(() => makeStyles(T, isDark).mom, [T, isDark]);

  const buyPct = Math.max(10, Math.min(90, 50 + pct * 10));
  const sellPct = 100 - buyPct;
  return (
    <View style={mom.container}>
      <View style={mom.header}>
        <Text style={mom.title}>MARKET SENTIMENT</Text>
      </View>
      <View style={mom.barRow}>
        <Text style={[mom.pctText, { color: T.up }]}>{buyPct.toFixed(0)}%</Text>
        <View style={mom.barTrack}>
          <LinearGradient colors={[T.up, T.upGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[mom.barFillLeft, { width: `${buyPct}%` as any }]} />
          <LinearGradient colors={[T.downGlow, T.down]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[mom.barFillRight, { width: `${sellPct}%` as any }]} />
        </View>
        <Text style={[mom.pctText, { color: T.down }]}>{sellPct.toFixed(0)}%</Text>
      </View>
      <View style={mom.labelRow}>
        <Text style={[mom.label, { color: T.up }]}>BUYERS</Text>
        <Text style={[mom.label, { color: T.down }]}>SELLERS</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function SymbolDetailsScreen() {
  const { symbol = 'BTCUSDm' } = useLocalSearchParams<{ symbol?: string }>();
  const { setChartSymbol } = useUserPreferences();
  const [alertOn, setAlertOn] = useState(false);

  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const q = useMemo(() => quotes.find(i => i.symbol === symbol) ?? quotes[0], [symbol]);
  const meta = useMemo(() => getMeta(symbol), [symbol]);

  const d = q.digits ?? (q.bid >= 100 ? 2 : q.bid >= 10 ? 3 : 4);
  const col = dCol(q.changePct, T);
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
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Ambient glow orbs */}
      {isDark && (
        <>
          <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: isUp ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)', top: -100, right: -60 }} />
          <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(59,130,246,0.03)', bottom: 300, left: -60 }} />
        </>
      )}

      {/* ── Sticky Nav ─────────────── */}
      <View style={s.nav.bar}>
        <Pressable style={s.nav.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={T.textSub} />
        </Pressable>
        <View style={s.nav.center}>
          <View style={s.nav.liveDot} />
          <Text style={s.nav.categoryText}>{meta.category}</Text>
        </View>
        <View style={s.nav.rightGroup}>
          <Pressable style={s.nav.iconBtn} onPress={() => setAlertOn(v => !v)}>
            <Ionicons name={alertOn ? 'notifications' : 'notifications-outline'} size={17} color={alertOn ? '#FACC15' : T.textMuted} />
          </Pressable>
          <Pressable style={s.nav.iconBtn}>
            <Ionicons name="share-outline" size={17} color={T.textMuted} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ════ ENTERPRISE HERO SECTION ════ */}
        <View style={s.glassHero.container}>
          {/* Base Blur and Gradient */}
          {isDark && <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />}
          {isDark && (
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          {isDark && <View style={s.glassHero.borderHighlight} />}
          
          {/* 1. SYMBOL HEADER */}
          <View style={s.glassHero.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <SymbolFlags symbol={symbol} />
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={s.hero.sym}>{symbol.replace(/m$/i, '')}</Text>
                <Text style={s.hero.name}>{meta.name}</Text>
              </View>
            </View>
            <View style={[s.hero.statusBadge, {
              backgroundColor: q.tradeAllowed ? (isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.12)') : (isDark ? 'rgba(248,113,113,0.1)' : 'rgba(248,113,113,0.12)'),
              borderColor: q.tradeAllowed ? (isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.3)') : (isDark ? 'rgba(248,113,113,0.2)' : 'rgba(248,113,113,0.3)')
            }]}>
              <View style={[s.hero.statusDot, { backgroundColor: q.tradeAllowed ? T.up : T.down }]} />
              <Text style={[s.hero.statusTxt, { color: q.tradeAllowed ? T.up : T.down }]}>
                {q.tradeAllowed ? 'OPEN' : 'CLOSED'}
              </Text>
            </View>
          </View>

          {/* 2. LIVE PRICE */}
          <View style={s.glassHero.priceRow}>
            <Text style={[s.glassHero.bigPrice, { color: col }]}>{fmt.price(q.bid, d)}</Text>
            <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
              <View style={[s.hero.changePill, { backgroundColor: col }]}>
                <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={12} color={isDark ? "#000" : "#fff"} />
                <Text style={s.hero.changeTxt}>{sgn(q.changePct)}{(q.changePct || 0).toFixed(2)}%</Text>
              </View>
              <Text style={s.glassHero.ptsTxt}>{sgn(q.changePct)}{pts} pts today</Text>
            </View>
          </View>

          {/* 3. PREMIUM PRICE TICKER (BID/ASK) */}
          <View style={s.ticker.container}>
            {isDark && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />}
            {isDark && <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />}
            <View style={s.ticker.spreadBadge}>
              <Text style={s.ticker.spreadVal}>{q.spread}</Text>
              <Text style={s.ticker.spreadLbl}>SPREAD</Text>
            </View>

            <View style={s.ticker.inner}>
              {/* SELL */}
              <Pressable style={s.ticker.side}>
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.down }]}>SELL</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-down" size={12} color={T.down} style={{ marginTop: 1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{fmt.price(q.bid, d).slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.down }]}>{fmt.price(q.bid, d).slice(-2)}</Text>
                </View>
                <View style={[s.ticker.accentBar, { backgroundColor: T.down }]} />
              </Pressable>

              {/* CENTER DIVIDER */}
              <View style={s.ticker.dividerCol}>
                <View style={s.ticker.dividerLine} />
                <View style={s.ticker.pipBadge}>
                  <Text style={s.ticker.pipVal}>{spp}</Text>
                  <Text style={s.ticker.pipUnit}>PIP</Text>
                </View>
              </View>

              {/* BUY */}
              <Pressable style={s.ticker.side}>
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.up }]}>BUY</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-up" size={12} color={T.up} style={{ marginTop: -1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{fmt.price(q.ask, d).slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.up }]}>{fmt.price(q.ask, d).slice(-2)}</Text>
                </View>
                <View style={[s.ticker.accentBar, { backgroundColor: T.up }]} />
              </Pressable>
            </View>

            <View style={s.ticker.infoStrip}>
              <View style={s.ticker.infoItem}>
                <Ionicons name="swap-horizontal" size={14} color={T.textMuted} />
                <Text style={s.ticker.infoTxt}>Spread: {q.spread} ({spp} pip)</Text>
              </View>
              <View style={s.ticker.infoItem}>
                <Ionicons name="time-outline" size={14} color={T.textMuted} />
                <Text style={s.ticker.infoTxt}>Live Data</Text>
              </View>
            </View>
          </View>

          {/* 4. METRICS ROW */}
          <View style={s.glassHero.metricsRow}>
            <MetricPill label="MID" value={fmt.price(mid, d)} accent={col} icon="analytics-outline" />
            <MetricPill label="OPEN" value={fmt.price(q.open ?? q.bid, d)} icon="time-outline" />
            <MetricPill label="PREV" value={fmt.price(q.close ?? q.ask, d)} icon="calendar-outline" />
            <MetricPill label="VOL" value={(q.volume ?? 0).toLocaleString()} icon="bar-chart-outline" />
          </View>

          {/* 5. DAY RANGE */}
          <View style={s.glassHero.rangeCard}>
            <View style={s.glassHero.rangeTop}>
              <View>
                <Text style={s.glassHero.rangeLbl}>LOW</Text>
                <Text style={s.glassHero.rangeVal}>{fmt.price(q.low, d)}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.glassHero.rangeLbl}>DAY RANGE</Text>
                <Text style={[s.glassHero.rangeVal, { color: col }]}>{(rPct || 0).toFixed(2)}%</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.glassHero.rangeLbl}>HIGH</Text>
                <Text style={s.glassHero.rangeVal}>{fmt.price(q.high, d)}</Text>
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
        <View style={s.act.row}>
          <Pressable style={({ pressed }) => [s.act.btn, s.act.buyBtn, pressed && { opacity: 0.85 }]} onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol } })}>
            <LinearGradient colors={['#2563EB', '#1D4ED8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <Ionicons name="flash" size={15} color="#fff" />
            <Text style={s.act.buyTxt}>Trade Now</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.act.btn, s.act.chartBtn, pressed && { opacity: 0.85 }]} onPress={() => { setChartSymbol(symbol); router.push('/(tabs)/chart'); }}>
            <Ionicons name="stats-chart-outline" size={15} color={isDark ? "#94A3B8" : T.textSub} />
            <Text style={s.act.chartTxt}>Full Chart</Text>
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
          <Row label="Swap Long" value={(q.swapLong ?? 0).toFixed(2) + ' pts'} accent={(q.swapLong ?? 0) < 0 ? T.down : T.up} />
          <Row label="Swap Short" value={(q.swapShort ?? 0).toFixed(2) + ' pts'} accent={(q.swapShort ?? 0) > 0 ? T.up : T.down} last />
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
              <View key={day} style={[s.rw.row, i === meta.sessions.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.ses.dot, isActive && s.ses.dotActive]} />
                  <Text style={s.rw.key}>{day}</Text>
                </View>
                <Text style={s.rw.val}>{hours}</Text>
              </View>
            );
          })}
        </Section>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = T.glass2;
  return {
    fl: StyleSheet.create({
      wrap: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
      ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: isDark ? 'rgba(59,130,246,0.2)' : T.border, overflow: 'hidden', backgroundColor: isDark ? '#141a2e' : T.glass2, shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 12, elevation: 0 },
      overlap: { marginLeft: -12 },
      img: { width: 40, height: 40, borderRadius: 20 },
      iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : T.glass1, borderWidth: 1, borderColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    }),
    sec: StyleSheet.create({
      card: { backgroundColor: cardBg, borderWidth: 1, borderColor: T.border, borderRadius: 16, marginHorizontal: spacing.md, marginBottom: 12, overflow: 'hidden', shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4 },
      headerGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border, gap: 10 },
      iconBox: { width: 26, height: 26, borderRadius: 7, backgroundColor: isDark ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.08)', alignItems: 'center', justifyContent: 'center' },
      title: { color: T.textSub, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    }),
    rw: StyleSheet.create({
      row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
      key: { color: T.textSub, fontSize: 13, fontWeight: '500' },
      val: { color: T.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: '60%', textAlign: 'right' },
    }),
    mp: StyleSheet.create({
      chip: {
        flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : T.glass2, shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0 : 0.03, shadowRadius: 8, elevation: 0, borderWidth: 1, borderColor: isDark ? 'transparent' : 'rgba(0,0,0,0.03)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center',
        borderWidth: 1, borderColor: T.border,
      },
      iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
      lbl: { color: T.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700' },
      val: { color: T.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
    }),
    rangeB: StyleSheet.create({
      track: { height: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)', borderRadius: 2, position: 'relative' },
      fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
      knob: { position: 'absolute', top: -6, width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginLeft: -7, backgroundColor: cardBg },
    }),
    mom: StyleSheet.create({
      container: { marginHorizontal: 16, marginBottom: 16, padding: 14 },
      header: { marginBottom: 12 },
      title: { color: T.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
      barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
      pctText: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'], width: 38 },
      barTrack: { flex: 1, height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: T.border },
      barFillLeft: { height: 6 },
      barFillRight: { height: 6 },
      labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 48 },
      label: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    }),
    ses: StyleSheet.create({
      dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.borderMedium },
      dotActive: { backgroundColor: T.up, shadowColor: T.up, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
    }),
    nav: StyleSheet.create({
      bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: 44, paddingBottom: 8 },
      back: { width: 38, height: 38, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border },
      center: { flexDirection: 'row', alignItems: 'center', gap: 6 },
      liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.up, shadowColor: T.up, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
      categoryText: { color: T.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
      rightGroup: { flexDirection: 'row', gap: 6 },
      iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border },
    }),
    glassHero: StyleSheet.create({
      container: {
        marginHorizontal: spacing.md, marginBottom: 20, borderRadius: 24, overflow: 'hidden',
        borderColor: T.border, borderWidth: 1, backgroundColor: cardBg,
        shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4
      },
      borderHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
      header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
      priceRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 12 },
      bigPrice: { fontSize: 48, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1.5, textShadowColor: isDark ? 'rgba(0,0,0,0.4)' : 'transparent', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
      ptsTxt: { color: T.textSub, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 4 },
      metricsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
      rangeCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : T.glass1, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingVertical: 12 },
      rangeTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
      rangeLbl: { color: T.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
      rangeVal: { color: T.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    }),
    hero: StyleSheet.create({
      sym: { color: T.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
      name: { color: T.textSub, fontSize: 14, fontWeight: '500', marginTop: 2 },
      statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, alignSelf: 'center', marginBottom: 12 },
      statusDot: { width: 6, height: 6, borderRadius: 3 },
      statusTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
      changePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
      changeTxt: { fontSize: 13, fontWeight: '900', color: isDark ? '#000' : '#fff', fontVariant: ['tabular-nums'] },
    }),
    ticker: StyleSheet.create({
      container: {
        marginHorizontal: 16, marginBottom: 10, borderRadius: 16,
        borderWidth: 1, borderColor: T.border, backgroundColor: isDark ? 'transparent' : T.glass1, position: 'relative', overflow: 'hidden',
      },
      spreadBadge: {
        position: 'absolute', top: -1, alignSelf: 'center', zIndex: 10,
        backgroundColor: isDark ? 'rgba(15,20,35,0.95)' : T.glass2, borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
        paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderTopWidth: 0,
        borderColor: T.border, flexDirection: 'row', alignItems: 'center', gap: 6,
      },
      spreadVal: { color: T.text, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
      spreadLbl: { color: T.textSub, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
      inner: { flexDirection: 'row', alignItems: 'stretch', paddingTop: 26, paddingBottom: 8 },
      side: { flex: 1, alignItems: 'center', position: 'relative' },
      sideHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
      sideLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
      arrowWrap: { width: 18, height: 18, borderRadius: 9, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : T.border, alignItems: 'center', justifyContent: 'center' },
      priceWrap: { flexDirection: 'row', alignItems: 'baseline' },
      priceBase: { color: T.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
      pipHighlight: { fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
      accentBar: { width: '50%', height: 2, borderRadius: 1, marginTop: 4, opacity: 0.8 },
      dividerCol: { alignItems: 'center', justifyContent: 'center', width: 44, position: 'relative' },
      dividerLine: { width: 1, backgroundColor: T.border, position: 'absolute', top: 0, bottom: 0 },
      pipBadge: { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : T.glass1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, borderWidth: 1, borderColor: T.border, zIndex: 2, alignItems: 'center' },
      pipVal: { color: T.text, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
      pipUnit: { color: T.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
      infoStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderTopColor: T.border },
      infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
      infoTxt: { color: T.textSub, fontSize: 13, fontWeight: '600' },
    }),
    act: StyleSheet.create({
      row: { flexDirection: 'row', gap: 8, marginHorizontal: spacing.md, marginBottom: 16 },
      btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 15, gap: 6, overflow: 'hidden' },
      buyBtn: { borderWidth: 0, shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
      buyTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
      chartBtn: { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.glass2, borderWidth: 1, borderColor: T.border, shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 12, elevation: 1 },
      chartTxt: { color: T.textSub, fontSize: 15, fontWeight: '700' },
    })
  };
}
