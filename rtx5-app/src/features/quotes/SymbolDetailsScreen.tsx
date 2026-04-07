import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { quotes } from '../../mock/tradingData';
import { useMarketData } from '../../query/websocket';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { usePlaceOrderMutation } from '../../query/orders';
import { useInstrumentMeta } from '../../query/instruments';
import { useCandleHistory } from '../../query/candles';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { fmt } from '../../utils/format';
import { Alert } from 'react-native';

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
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={sec.card}>
      <Pressable onPress={() => setExpanded(e => !e)}>
        <LinearGradient colors={isDark ? ['rgba(59,130,246,0.06)', 'rgba(59,130,246,0)'] : ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sec.headerGrad}>
          <View style={sec.iconBox}>
            <Ionicons name={icon} size={13} color={isDark ? "#60A5FA" : T.trading.buy.primary} />
          </View>
          <Text style={sec.title}>{title}</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={T.textMuted} />
        </LinearGradient>
      </Pressable>
      {expanded && children}
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
      <View style={[rangeB.knob, { left: `${pos}%` as any, borderColor: color, shadowColor: color, shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } }]} />
    </View>
  );
}

// ─── Momentum Indicator ──────────────────────────────────────────────────────
function MomentumBar({ q }: { q: any }) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const mom = useMemo(() => makeStyles(T, isDark).mom, [T, isDark]);

  const { buyPct, sellPct } = useMemo(() => {
    const dynHigh = Math.max(q.high || 0, q.bid, q.ask);
    const dynLow = Math.min(q.low || Infinity, q.bid, q.ask);
    const rng = dynHigh - dynLow;

    if (rng <= 0 || dynLow === Infinity) return { buyPct: 50, sellPct: 50 };

    const mid = (q.bid + q.ask) / 2;
    // Calculate buying pressure based on daily position, constrained nicely
    let b = Math.round(((mid - dynLow) / rng) * 100);
    b = Math.max(12, Math.min(88, b));

    return { buyPct: b, sellPct: 100 - b };
  }, [q.bid, q.ask, q.high, q.low]);

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
  const { setChartSymbol, oneClickAccepted } = useUserPreferences();
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();
  const [alertOn, setAlertOn] = useState(false);


  // Subscribe to live tick data for this symbol
  const liveQuotes = useMarketData([symbol]);

  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const { data: remoteMeta } = useInstrumentMeta(symbol);

  const q = useMemo(() => {
    const live = liveQuotes[symbol];
    const mock = quotes.find(i => i.symbol === symbol) ?? quotes[0];
    const base = { ...mock, ...live } as any;
    if (remoteMeta) {
      base.contractSize = remoteMeta.contractSize ?? base.contractSize;
      base.minVolume = remoteMeta.minVolume ?? base.minVolume;
      base.maxVolume = remoteMeta.maxVolume ?? base.maxVolume;
      base.stepVolume = remoteMeta.stepVolume ?? base.stepVolume;
      base.tickSize = remoteMeta.tickSize ?? base.tickSize;
      base.marginInitial = remoteMeta.marginInitial ?? base.marginInitial;
      base.marginMaintenance = remoteMeta.marginMaintenance ?? base.marginMaintenance;
      base.swapLong = remoteMeta.swapLong ?? base.swapLong;
      base.swapShort = remoteMeta.swapShort ?? base.swapShort;
      base.baseCurrency = remoteMeta.baseCurrency ?? base.baseCurrency;
      base.profitCurrency = remoteMeta.profitCurrency ?? base.profitCurrency;
    }
    return base;
  }, [liveQuotes, symbol, remoteMeta]);

  const meta = useMemo(() => {
    const localMeta = getMeta(symbol);
    if (!remoteMeta) return localMeta;
    return {
      ...localMeta,
      category: remoteMeta.category ?? localMeta.category,
      sector: remoteMeta.sector ?? localMeta.sector,
      spreadMode: remoteMeta.spreadMode ?? localMeta.spreadMode,
      stopsLevel: remoteMeta.stopsLevel !== undefined ? String(remoteMeta.stopsLevel) : localMeta.stopsLevel,
      calculation: remoteMeta.calculation ?? localMeta.calculation,
      chartMode: remoteMeta.chartMode ?? localMeta.chartMode,
      sessions: remoteMeta.sessions ?? localMeta.sessions,
    };
  }, [symbol, remoteMeta]);

  // ─── Fetch Tru Daily Range from Candles API ──────────────────────────
  const { data: d1Candles } = useCandleHistory(symbol, 'D1');

  const d = 2;
  const col = dCol(q.changePct, T);
  const mid = ((q.bid || 0) + (q.ask || 0)) / 2;

  const dynHigh = useMemo(() => {
    let baseHigh = q.high || 0;
    if (d1Candles && d1Candles.length > 0) {
      baseHigh = d1Candles[d1Candles.length - 1].high;
    }
    return Math.max(baseHigh, q.bid || 0, q.ask || 0);
  }, [q.high, q.bid, q.ask, d1Candles]);

  const dynLow = useMemo(() => {
    let baseLow = q.low || Infinity;
    if (d1Candles && d1Candles.length > 0) {
      baseLow = d1Candles[d1Candles.length - 1].low;
    }
    return Math.min(baseLow, q.bid || Infinity, q.ask || Infinity);
  }, [q.low, q.bid, q.ask, d1Candles]);

  const dynOpen = useMemo(() => {
    let baseOpen = q.open ?? q.close ?? q.bid ?? 0;
    if (d1Candles && d1Candles.length > 0) {
      baseOpen = d1Candles[d1Candles.length - 1].open;
    }
    return baseOpen;
  }, [q.open, q.close, q.bid, d1Candles]);

  const dynVol = useMemo(() => {
    let baseVol = q.volume ?? 0;
    if (d1Candles && d1Candles.length > 0) {
      baseVol = d1Candles[d1Candles.length - 1].volume;
    }
    return baseVol;
  }, [q.volume, d1Candles]);

  const rng = dynHigh - dynLow;
  const rPct = dynLow > 0 && dynLow !== Infinity ? (rng / dynLow) * 100 : 0;
  const vol = rng > 0 ? Math.min(100, Math.max(0, ((mid - dynLow) / rng) * 100)) : 50;
  const pip = 1 / Math.pow(10, d);
  const spp = ((q.spread || 0) * (pip || 1)).toFixed(1);
  const ctk = q.tickValue ?? (10 / mid);

  const ptsRaw = ((q.bid || 0) - dynOpen) / (pip || 1);
  const pts = `${ptsRaw >= 0 ? '+' : ''}${ptsRaw.toFixed(0)}`;
  const isUp = q.changePct >= 0;
  const isMarketOpen = q.tradeAllowed !== false;

  const handleShare = async () => {
    try {
      const displayName = symbol.replace(/m$/i, '').replace(/\//g, '');
      const bidPrice = fmt.price(q.bid);
      const askPrice = fmt.price(q.ask);
      const changePct = (q.changePct || 0).toFixed(2);
      const changeSign = q.changePct >= 0 ? '+' : '';
      const spreadVal = parseFloat(Number(q.spread || 0).toFixed(2)).toString();

      const message = [
        `📊 ${displayName}`,
        ``,
        `💰 Bid: ${bidPrice}  |  Ask: ${askPrice}`,
        `📈 Change: ${changeSign}${changePct}%`,
        `📉 Spread: ${spreadVal}`,
        ``,
        `Shared from RTX5 Trading App`,
      ].join('\n');

      await Share.share({
        message,
        title: `${displayName} - Live Quote`,
      });
    } catch (_err) {
      // User cancelled or share failed silently
    }
  };

  const handleTrade = (side: 'buy' | 'sell') => {
    if (oneClickAccepted) {
      const tradingLogin = resolveTradingLogin();
      if (!tradingLogin) {
        Alert.alert('Error', 'No active trading account resolved.');
        return;
      }

      placeOrder(
        {
          account_login: tradingLogin,
          symbol,
          side,
          volume: 0.01, // Using 0.01 micro-lot as safety default for quotes view
          price_sl: 0,
          price_tp: 0,
          comment: 'One-Click RTX5 Order',
          trailing_stop: 0,
          trailing_step: 0,
          magic: 0
        },
        {
          onSuccess: (data: any) => {
            Alert.alert('Trade Executed', `Successfully placed ${side.toUpperCase()} on ${symbol}.\nTicket #${data?.position_ticket || data?.order_ticket || 'Confirmed'}`);
          },
          onError: (err: any) => {
            const msg = err?.response?.data?.message || err?.message || 'Execution error';
            Alert.alert('Trade Failed', msg);
          }
        }
      );
    } else {
      router.push({ pathname: '/trade/order-ticket', params: { symbol, side } });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Ambient glow orbs */}
      {isDark && (
        <>
          <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: isUp ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)', top: -100, right: -60 }} />
          <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(59,130,246,0.03)', bottom: 300, left: -60 }} />
        </>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60, paddingTop: Math.max(useSafeAreaInsets().top, 16) }}>

        {/* ════ ENTERPRISE HERO SECTION ════ */}
        <View style={s.glassHero.container}>
          {/* Base Blur and Gradient */}
          {isDark && <BlurView intensity={50} tint="dark" style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]} />}
          {isDark && (
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]}
            />
          )}
          {isDark && <View style={s.glassHero.borderHighlight} />}

          {/* 1. SYMBOL HEADER */}
          <View style={[s.glassHero.header, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.hero.sym}>{symbol.replace(/m$/i, '').replace(/\//g, '')}</Text>
              <Text style={s.hero.name}>{meta.name}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, marginRight: -8 }}>
              <Pressable style={{ paddingHorizontal: 6, paddingVertical: 4 }} onPress={() => setAlertOn(v => !v)}>
                <Ionicons name={alertOn ? 'notifications' : 'notifications-outline'} size={22} color={alertOn ? '#FACC15' : T.textSub} />
              </Pressable>
              <Pressable style={{ paddingHorizontal: 6, paddingVertical: 4 }} onPress={handleShare}>
                <Ionicons name="share-outline" size={22} color={T.textSub} />
              </Pressable>
            </View>
          </View>

          {/* 2. LIVE PRICE */}
          <View style={s.glassHero.priceRow}>
            <Text style={[s.glassHero.bigPrice, { color: col }]}>{fmt.price(q.bid)}</Text>
            <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
              <View style={s.hero.changePill}>
                <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={14} color={col} />
                <Text style={[s.hero.changeTxt, { color: col }]}>{sgn(q.changePct)}{(q.changePct || 0).toFixed(2)}%</Text>
              </View>
              <Text style={s.glassHero.ptsTxt}>{pts} pts today</Text>
            </View>
          </View>

          {/* 3. PREMIUM PRICE TICKER (BID/ASK) */}
          <View style={s.ticker.container}>
            {isDark && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />}
            {isDark && <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />}
            <View style={s.ticker.spreadBadge}>
              <Text style={s.ticker.spreadVal}>{parseFloat(Number(q.spread || 0).toFixed(2)).toString()}</Text>
              <Text style={s.ticker.spreadLbl}>SPREAD</Text>
            </View>

            <View style={[s.ticker.inner, isPending && { opacity: 0.6 }]}>
              {/* SELL */}
              <Pressable style={s.ticker.side} disabled={isPending} onPress={() => handleTrade('sell')}>
                <LinearGradient colors={[isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.02)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.down }]}>SELL</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-down" size={10} color={T.down} style={{ marginTop: 1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{fmt.price(q.bid).slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.down }]}>{fmt.price(q.bid).slice(-2)}</Text>
                </View>
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
              <Pressable style={s.ticker.side} disabled={isPending} onPress={() => handleTrade('buy')}>
                <LinearGradient colors={[isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.02)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.up }]}>BUY</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-up" size={10} color={T.up} style={{ marginTop: -1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{fmt.price(q.ask).slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.up }]}>{fmt.price(q.ask).slice(-2)}</Text>
                </View>
              </Pressable>
            </View>

            <View style={[s.ticker.infoStrip, { justifyContent: 'center' }]}>
              <View style={s.ticker.infoItem}>
                <View style={[
                  s.nav.liveDot,
                  {
                    marginRight: 2,
                    backgroundColor: isMarketOpen ? T.up : T.textMuted,
                    shadowColor: isMarketOpen ? T.up : 'transparent'
                  }
                ]} />
                <Text style={[s.ticker.infoTxt, { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, color: T.textSub }]}>
                  {isMarketOpen ? 'Live Market Data' : 'Market Closed'}
                </Text>
              </View>
            </View>
          </View>

          {/* 4. METRICS ROW */}
          <View style={s.glassHero.metricsRow}>
            <MetricPill label="MID" value={fmt.price(mid)} icon="analytics-outline" />
            <MetricPill label="OPEN" value={fmt.price(dynOpen)} icon="time-outline" />
            <MetricPill label="PREV" value={fmt.price(q.close ?? q.ask)} icon="calendar-outline" />
            <MetricPill label="VOL" value={dynVol.toLocaleString()} icon="bar-chart-outline" />
          </View>

          {/* 5. DAY RANGE */}
          <View style={s.glassHero.rangeCard}>
            <View style={s.glassHero.rangeTop}>
              <View>
                <Text style={s.glassHero.rangeLbl}>LOW</Text>
                <Text style={s.glassHero.rangeVal}>{fmt.price(dynLow !== Infinity ? dynLow : q.bid)}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.glassHero.rangeLbl}>DAY RANGE</Text>
                <Text style={[s.glassHero.rangeVal, { color: col }]}>{(rPct || 0).toFixed(2)}%</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.glassHero.rangeLbl}>HIGH</Text>
                <Text style={s.glassHero.rangeVal}>{fmt.price(dynHigh)}</Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>
              <RangeBar pos={vol} color={col} />
            </View>
          </View>

          {/* 6. SENTIMENT */}
          <MomentumBar q={q} />

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
        <Section title="Contract Specification" icon="reader-outline">
          <Row label="Contract Size" value={q.contractSize >= 1000 ? `${((q.contractSize || 0) / 1000).toFixed(0)}K units` : String(q.contractSize)} />
          <Row label="Min Volume" value={String(q.minVolume ?? '0.01') + ' lot'} />
          <Row label="Max Volume" value={String(q.maxVolume ?? '500') + ' lots'} />
          <Row label="Lot Step" value={String(q.stepVolume ?? '0.01')} />
          <Row label="Tick Size" value={String(q.tickSize ?? pip)} />
          <Row label="Tick Value" value={'$' + (ctk || 0).toFixed(2)} last />
        </Section>

        <Section title="Pricing & Fees" icon="pricetags-outline">
          <Row label="Digits" value={String(d)} />
          <Row label="Spread Mode" value={meta.spreadMode} />
          <Row label="Current Spread" value={`${parseFloat(Number(q.spread || 0).toFixed(2)).toString()} (${spp} pips)`} />
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
      row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
      key: { color: T.textSub, fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
      val: { color: T.text, fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'], maxWidth: '65%', textAlign: 'right', letterSpacing: -0.2 },
    }),
    mp: StyleSheet.create({
      chip: {
        flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : T.glass2, shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0 : 0.03, shadowRadius: 8, elevation: 0, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center',
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
      bigPrice: { fontSize: 42, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1.5, textShadowColor: isDark ? 'rgba(0,0,0,0.4)' : 'transparent', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
      ptsTxt: { color: T.textSub, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 4 },
      metricsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
      rangeCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : T.glass1, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingVertical: 12 },
      rangeTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
      rangeLbl: { color: T.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
      rangeVal: { color: T.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    }),
    hero: StyleSheet.create({
      sym: { color: T.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
      name: { color: T.textSub, fontSize: 14, fontWeight: '500', marginTop: 2 },
      statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginBottom: 12 },
      statusDot: { width: 6, height: 6, borderRadius: 3 },
      statusTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
      changePill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
      changeTxt: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
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
      inner: { flexDirection: 'row', alignItems: 'stretch' },
      side: { flex: 1, alignItems: 'center', position: 'relative', paddingTop: 26, paddingBottom: 12 },
      sideHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
      sideLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
      arrowWrap: { width: 16, height: 16, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : T.border, alignItems: 'center', justifyContent: 'center' },
      priceWrap: { flexDirection: 'row', alignItems: 'baseline' },
      priceBase: { color: T.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
      pipHighlight: { fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
      accentBar: { width: '80%', height: 3, borderRadius: 1.5, marginTop: 4, opacity: 0.9 },
      dividerCol: { alignItems: 'center', justifyContent: 'center', width: 44, position: 'relative' },
      dividerLine: { width: 1, backgroundColor: T.border, position: 'absolute', top: 0, bottom: 0 },
      pipBadge: { backgroundColor: isDark ? 'rgba(255,255,255,0.75)' : '#FFFFFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, zIndex: 2, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1.5 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2, marginTop: 14 },
      pipVal: { color: isDark ? '#000' : T.text, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
      pipUnit: { color: isDark ? '#000' : '#64748B', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
      infoStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
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
