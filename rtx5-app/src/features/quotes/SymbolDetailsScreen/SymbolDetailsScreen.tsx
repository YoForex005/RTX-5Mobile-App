import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { quotes, type QuoteItem } from '../../../dev/mock/tradingData';
import { useMarketData } from '../../../query/websocket';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTheme } from '../../../ui/theme/useTheme';
import { usePlaceOrderMutation } from '../../../query/orders';
import { useInstrumentMeta } from '../../../query/instruments';
import { useLatestDailyCandle } from '../../../domain/candles/query/candles';
import { resolveTradingLogin, resolveTradingLoginString } from '../../../state/tradingLogin';
import { fmt } from '../../../utils/format';
import { calculateMarketSentiment } from '../../../domain/marketSentiment';
import { normalizeSymbol } from '../../../domain/symbols';
import { classifyTradingError, createFrontendTradingError } from '../../../api/tradingErrors';
import { safeRouterBack } from '../../../utils/navigation';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS } from '../../../utils/actionLatency';
import { prefetchOrderTicketData } from '../../../utils/navigationPrefetch';
import { dCol, getMeta, normalizeTradingSessions, sgn } from './instrumentMeta';
import { MetricPill, MomentumBar, RangeBar, Row, Section } from './SubComponents';
import { makeSymbolDetailsStyles } from './styles';

export function SymbolDetailsScreen() {
  const { symbol: routeSymbol = 'BTCUSD' } = useLocalSearchParams<{ symbol?: string }>();
  const symbol = useMemo(() => normalizeSymbol(routeSymbol), [routeSymbol]);
  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();
  const [activeSide, setActiveSide] = useState<'buy' | 'sell' | null>(null);
  const [alertOn, setAlertOn] = useState(false);
  const isScreenFocused = useIsFocused();

  const liveQuotes = useMarketData([symbol], isScreenFocused);

  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeSymbolDetailsStyles(T, isDark), [T, isDark]);

  const { data: remoteMeta } = useInstrumentMeta(symbol, isScreenFocused);

  const q = useMemo<QuoteItem>(() => {
    const live = liveQuotes[symbol] as Partial<QuoteItem> | undefined;
    const mock = quotes.find(i => i.symbol === symbol) ?? quotes[0];
    const base: QuoteItem = { ...mock, ...live, symbol };
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
      sessions: normalizeTradingSessions(remoteMeta.sessions ?? localMeta.sessions),
    };
  }, [symbol, remoteMeta]);

  const { data: dailyRangeCandle = null } = useLatestDailyCandle(symbol, isScreenFocused);

  const d = q.digits ?? 2;
  const col = dCol(q.changePct, T);
  const mid = ((q.bid || 0) + (q.ask || 0)) / 2;
  const bidPriceText = fmt.price(q.bid, d);
  const askPriceText = fmt.price(q.ask, d);

  const marketSentiment = useMemo(
    () => calculateMarketSentiment(q, dailyRangeCandle),
    [dailyRangeCandle, q],
  );
  const dynHigh = marketSentiment.dayHigh;
  const dynLow = marketSentiment.dayLow;

  const dynOpen = useMemo(() => {
    let baseOpen = q.open ?? q.close ?? q.bid ?? 0;
    if (dailyRangeCandle) {
      baseOpen = dailyRangeCandle.open;
    }
    return baseOpen;
  }, [dailyRangeCandle, q.bid, q.close, q.open]);

  const dynVol = useMemo(() => {
    let baseVol = q.volume ?? 0;
    if (dailyRangeCandle) {
      baseVol = dailyRangeCandle.volume;
    }
    return baseVol;
  }, [dailyRangeCandle, q.volume]);

  const rng = dynHigh - dynLow;
  const rPct = dynLow > 0 && dynLow !== Infinity ? (rng / dynLow) * 100 : 0;
  const rangePositionPct = marketSentiment.rangePositionPct;
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
      const bidPrice = fmt.price(q.bid, d);
      const askPrice = fmt.price(q.ask, d);
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

      await Share.share({ message, title: `${displayName} - Live Quote` });
    } catch (_err) {
      // User cancelled or share failed silently
    }
  };

  const handleTrade = (side: 'buy' | 'sell') => {
    setActiveSide(side);
    setTimeout(() => setActiveSide(null), 800);
    if (oneClickAccepted) {
      const tradingLogin = resolveTradingLogin();
      if (!tradingLogin) {
        const feedback = createFrontendTradingError(
          'Account Error',
          'The app could not resolve the active trading account from local state. Select an account and try again.',
        );
        Alert.alert(feedback.title, feedback.message);
        return;
      }

      placeOrder(
        {
          account_login: tradingLogin,
          symbol,
          side,
          volume: 0.01,
          price_sl: 0,
          price_tp: 0,
          comment: '',
          trailing_stop: 0,
          trailing_step: 0,
          magic: 0
        },
        {
          onSuccess: () => {
            Alert.alert('Order Executed', 'Your order was successfully transmitted.');
          },
          onError: (err: any) => {
            const feedback = classifyTradingError(err, { action: 'place-order' });
            Alert.alert(feedback.title, feedback.message);
          }
        }
      );
    } else {
      prefetchOrderTicketData(resolveTradingLoginString(), symbol);
      router.push({ pathname: '/trade/order-ticket', params: { symbol, side } });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={{
        paddingTop: insets.top, backgroundColor: T.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
          <Pressable onPress={() => safeRouterBack(router, '/(tabs)/quotes')} hitSlop={15} style={{ width: 46, alignItems: 'flex-start', padding: 4 }}>
            <Ionicons name="arrow-back" size={26} color={T.text} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: T.text }}>
            Quote Details
          </Text>
          <View style={{ width: 46 }} />
        </View>
      </View>

      {isDark && (
        <>
          <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: isUp ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)', top: 0, right: -60 }} />
          <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(59,130,246,0.03)', bottom: 300, left: -60 }} />
        </>
      )}

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60, paddingTop: 12 }}>

        <View style={s.glassHero.container}>
          {isDark && <BlurView intensity={50} tint="dark" style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]} />}
          {isDark && (
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]}
            />
          )}
          {isDark && <View style={s.glassHero.borderHighlight} />}

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

          <View style={s.glassHero.priceRow}>
            <Text style={[s.glassHero.bigPrice, { color: col }]}>{bidPriceText}</Text>
            <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
              <View style={s.hero.changePill}>
                <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={14} color={col} />
                <Text style={[s.hero.changeTxt, { color: col }]}>{sgn(q.changePct)}{(q.changePct || 0).toFixed(2)}%</Text>
              </View>
              <Text style={s.glassHero.ptsTxt}>{pts} pts today</Text>
            </View>
          </View>

          <View style={s.ticker.container}>
            {isDark && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />}
            {isDark && <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />}
            <View style={s.ticker.spreadBadge}>
              <Text style={s.ticker.spreadVal}>{parseFloat(Number(q.spread || 0).toFixed(2)).toString()}</Text>
              <Text style={s.ticker.spreadLbl}>SPREAD</Text>
            </View>

            <View style={[s.ticker.inner]}>
              <Pressable
                style={[s.ticker.side, (activeSide === 'sell' || (isPending && !activeSide)) && { opacity: 0.5 }]}
                disabled={isPending}
                onPress={() => handleTrade('sell')}
                latencyLabel="symbolDetails.trade.sell"
                latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
              >
                <LinearGradient colors={[isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.02)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.down }]}>SELL</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-down" size={10} color={T.down} style={{ marginTop: 1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{bidPriceText.slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.down }]}>{bidPriceText.slice(-2)}</Text>
                </View>
              </Pressable>

              <View style={s.ticker.dividerCol}>
                <View style={s.ticker.dividerLine} />
                <View style={s.ticker.pipBadge}>
                  <Text style={s.ticker.pipVal}>{spp}</Text>
                  <Text style={s.ticker.pipUnit}>PIP</Text>
                </View>
              </View>

              <Pressable
                style={[s.ticker.side, (activeSide === 'buy' || (isPending && !activeSide)) && { opacity: 0.5 }]}
                disabled={isPending}
                onPress={() => handleTrade('buy')}
                latencyLabel="symbolDetails.trade.buy"
                latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
              >
                <LinearGradient colors={[isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.02)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.up }]}>BUY</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-up" size={10} color={T.up} style={{ marginTop: -1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{askPriceText.slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.up }]}>{askPriceText.slice(-2)}</Text>
                </View>
              </Pressable>
            </View>

            <View style={[s.ticker.infoStrip, { justifyContent: 'center' }]}>
              <View style={s.ticker.infoItem}>
                <View style={[
                  s.nav.liveDot,
                  { marginRight: 2, backgroundColor: isMarketOpen ? T.up : T.textMuted, shadowColor: isMarketOpen ? T.up : 'transparent' }
                ]} />
                <Text style={[s.ticker.infoTxt, { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, color: T.textSub }]}>
                  {isMarketOpen ? 'Live Market Data' : 'Market Closed'}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.glassHero.metricsRow}>
            <MetricPill label="MID" value={fmt.price(mid, d)} icon="analytics-outline" />
            <MetricPill label="OPEN" value={fmt.price(dynOpen, d)} icon="time-outline" />
            <MetricPill label="PREV" value={fmt.price(q.close ?? q.ask, d)} icon="calendar-outline" />
            <MetricPill label="VOL" value={dynVol.toLocaleString()} icon="bar-chart-outline" />
          </View>

          <View style={s.glassHero.rangeCard}>
            <View style={s.glassHero.rangeTop}>
              <View>
                <Text style={s.glassHero.rangeLbl}>LOW</Text>
                <Text style={s.glassHero.rangeVal}>{fmt.price(dynLow !== Infinity ? dynLow : q.bid, d)}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.glassHero.rangeLbl}>DAY RANGE</Text>
                <Text style={[s.glassHero.rangeVal, { color: col }]}>{(rPct || 0).toFixed(2)}%</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.glassHero.rangeLbl}>HIGH</Text>
                <Text style={s.glassHero.rangeVal}>{fmt.price(dynHigh, d)}</Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>
              <RangeBar pos={rangePositionPct} color={col} />
            </View>
          </View>

          <MomentumBar sentiment={marketSentiment} />
        </View>

        <View style={s.act.row}>
          <Pressable style={({ pressed }) => [s.act.btn, s.act.buyBtn, pressed && { opacity: 0.85 }]} onPress={() => { prefetchOrderTicketData(resolveTradingLoginString(), symbol); router.push({ pathname: '/trade/order-ticket', params: { symbol } }); }}>
            <LinearGradient colors={['#2563EB', '#1D4ED8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <Ionicons name="flash" size={15} color="#fff" />
            <Text style={s.act.buyTxt}>Trade Now</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.act.btn, s.act.chartBtn, pressed && { opacity: 0.85 }]} onPress={() => { setChartSymbol(symbol); router.push('/(tabs)/chart'); }}>
            <Ionicons name="stats-chart-outline" size={15} color={isDark ? "#94A3B8" : T.textSub} />
            <Text style={s.act.chartTxt}>Full Chart</Text>
          </Pressable>
        </View>

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
