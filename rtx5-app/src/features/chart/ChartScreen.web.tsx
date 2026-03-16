import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useAccountSummary } from '../../query/account';
import { fmt } from '../../utils/format';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { useCandleStream } from '../../query/websocket';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

const CHART_SYMBOLS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'NZDUSD', 'USDCAD', 'EURGBP', 'AUDCAD', 'AUDCHF', 'AUDJPY', 'XAUUSD', 'BTCUSD'];

const SYMBOL_FLAGS: Record<string, [string, string]> = {
  EURUSD: ['eu', 'us'], GBPUSD: ['gb', 'us'], AUDUSD: ['au', 'us'],
  USDJPY: ['us', 'jp'], NZDUSD: ['nz', 'us'], USDCAD: ['us', 'ca'],
  EURGBP: ['eu', 'gb'], AUDCAD: ['au', 'ca'], AUDCHF: ['au', 'ch'],
  AUDJPY: ['au', 'jp'],
};

const SYMBOL_NAMES: Record<string, string> = {
  EURUSD: 'Euro / US Dollar', GBPUSD: 'British Pound / USD',
  AUDUSD: 'Australian Dollar / USD', USDJPY: 'US Dollar / Japanese Yen',
  NZDUSD: 'New Zealand Dollar / USD', USDCAD: 'US Dollar / Canadian Dollar',
  EURGBP: 'Euro / British Pound', AUDCAD: 'Australian / Canadian Dollar',
  AUDCHF: 'Australian / Swiss Franc', AUDJPY: 'Australian / Japanese Yen',
  XAUUSD: 'Gold / US Dollar', BTCUSD: 'Bitcoin / US Dollar',
};

const SYMBOL_CATEGORY: Record<string, string> = {
  XAUUSD: 'METAL', BTCUSD: 'CRYPTO',
};

const mapTf = (tf: string) => {
  if (tf.startsWith('M') && tf !== 'MN') return tf.replace('M', '') + ' m';
  if (tf.startsWith('H')) return tf.replace('H', '') + ' h';
  if (tf === 'D1') return '1 d';
  if (tf === 'W1') return '1 w';
  if (tf === 'MN') return '1 M';
  return tf;
};

/** Format a Unix timestamp into a short time label for the x-axis */
const formatXLabel = (time: number, tf: string): string => {
  const d = new Date(time * 1000);
  if (['D1', 'W1', 'MN'].includes(tf)) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const APP_BG = G.bg;
const CARD_BG = '#0B0F19'; // Deep Navy Card
const BLUE = '#2962FF'; // Vivid professional blue
const RED = '#FF2A55'; // Vibrant, sharp red
const UP_COLOR = G.up;
const GRID = G.border;
const TEXT = G.text;
const TEXT_MUTED = '#8E9AAF';
const BTN_BG = G.glass2;
const PILL_BG = G.glass1;

export function ChartScreen() {
  const { chartSymbol, chartTimeframe, setChartTimeframe, setChartSymbol, isDemoAccount, accountDetails } = useUserPreferences();
  const { data: liveAccount } = useAccountSummary(accountDetails?.id);
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [lotSize, setLotSize] = useState(0.10);
  const scrollRef = useRef<ScrollView>(null);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const { candles, isLoading, isError } = useCandleStream(chartSymbol, chartTimeframe);

  // Auto-scroll to end when candles arrive
  useEffect(() => {
    if (candles.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [candles.length]);

  const CANDLE_WIDTH = 6;
  const CANDLE_GAP = 3;
  const CHART_WIDTH = Math.max(candles.length * (CANDLE_WIDTH + CANDLE_GAP) + 60, chartLayout.width);
  const CHART_HEIGHT = chartLayout.height;

  const min = useMemo(() => Math.min(...candles.map(c => c.low)) * 0.999, [candles]);
  const max = useMemo(() => Math.max(...candles.map(c => c.high)) * 1.001, [candles]);
  const range = max - min;

  const getY = (val: number) => {
    if (range === 0 || CHART_HEIGHT === 0) return 0;
    return CHART_HEIGHT - ((val - min) / range) * CHART_HEIGHT;
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  };

  const latestClose = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (chartSymbol.includes('XAU') ? 0.30 : chartSymbol.includes('BTC') ? 25 : 0.00015);
  const displayDecimals = chartSymbol.includes('JPY') ? 3 : chartSymbol.includes('XAU') ? 2 : chartSymbol.includes('BTC') ? 2 : 5;
  const displaySymbol = chartSymbol.length >= 6 ? `${chartSymbol.slice(0, 3)}/${chartSymbol.slice(3, 6)}` : chartSymbol;
  const symbolFlags = SYMBOL_FLAGS[chartSymbol] ?? null;
  const symbolName = SYMBOL_NAMES[chartSymbol] ?? chartSymbol;
  const symbolCategory = SYMBOL_CATEGORY[chartSymbol] ?? 'FX';

  // Dynamic X-axis labels from actual candle timestamps
  const xAxisLabels = useMemo(() => {
    if (candles.length === 0) return [];
    const labelCount = 3;
    const labels: { text: string; position: `${number}%` }[] = [];
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((candles.length / (labelCount + 1)) * (i + 1));
      const candle = candles[Math.min(idx, candles.length - 1)];
      if (candle && candle.time) {
        labels.push({
          text: formatXLabel(candle.time, chartTimeframe),
          position: `${Math.round(((idx + 0.5) / candles.length) * 100)}%`,
        });
      }
    }
    return labels;
  }, [candles, chartTimeframe]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.topHeaderRow}>
        <View style={styles.headerSpacer}>
          <Pressable style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
            <Ionicons name="menu" size={24} color={G.textMuted} />
          </Pressable>
        </View>
        <View style={styles.accountBadgeGroup}>
          <View style={[styles.accountBadge, isDemoAccount ? styles.badgeDemo : styles.badgeLive]}>
            <View style={[styles.liveIndicatorGlow, isDemoAccount ? styles.glowDemo : styles.glowLive]}>
              <View style={[styles.liveIndicator, isDemoAccount ? styles.dotDemo : styles.dotLive]} />
            </View>
            <Text style={[styles.accountTypeText, isDemoAccount ? styles.textDemo : styles.textLive]}>
              {isDemoAccount ? 'DEMO ACCOUNT' : 'REAL ACCOUNT'}
            </Text>
          </View>
        </View>
        <View style={[styles.headerSpacer, styles.headerSpacerRight]} />
      </View>

      <View style={styles.card}>
        <View style={styles.glassToolbar}>
          {/* Blue Radial Glow Background */}
          <LinearGradient
            colors={['rgba(37, 99, 235, 0.15)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.toolbarRow}>
            <Pressable style={styles.symbolInfo} onPress={() => setSymbolPickerOpen(true)}>
              <View style={styles.flagStack}>
                {symbolFlags ? (
                  <>
                    <Image source={{ uri: `https://flagcdn.com/w160/${symbolFlags[0]}.png` }} style={[styles.flagCircle, { zIndex: 2 }]} />
                    <Image source={{ uri: `https://flagcdn.com/w160/${symbolFlags[1]}.png` }} style={[styles.flagCircle, styles.flagOverlap, { zIndex: 1 }]} />
                  </>
                ) : (
                  <View style={[styles.flagCircle, { backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{chartSymbol.slice(0, 3)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.symbolTextCol}>
                <View style={styles.symbolNameRow}>
                  <Text style={styles.symbolText}>{displaySymbol}</Text>
                  <View style={styles.microBadge}>
                    <Text style={styles.microBadgeText}>{symbolCategory}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED} />
                </View>
                <Text style={styles.symbolSubText}>{symbolName}</Text>
              </View>
            </Pressable>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={styles.balanceText}>
                {liveAccount ? fmt.int(liveAccount.balance) : '---'} <Text style={styles.currencyText}>{liveAccount ? liveAccount.currency : 'USD'}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.plRow}>
            <View style={styles.plInfoGroup}>
              <Text style={styles.plLabel}>Positions :</Text>
              <Text style={styles.plValue}>0</Text>
              <View style={styles.plDivider} />
              <Text style={styles.plLabel}>P&L :</Text>
              <Text style={[styles.plValue, { color: '#FFFFFF' }]}>0.00</Text>
            </View>
            <View style={styles.toolbarActions}>
              <Pressable style={styles.toolbarActionBtn} onPress={() => Alert.alert('Price Alert', `Set a price alert for ${chartSymbol}`)}>
                <Ionicons name="alarm-outline" size={17} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarActionBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="expand-outline" size={18} color="#5B9BFF" />
              </Pressable>
              <Pressable style={styles.toolbarActionBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="options-outline" size={17} color={TEXT_MUTED} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.chartContainer} onLayout={handleLayout}>
          {/* Loading Spinner */}
          {isLoading && (
            <View style={styles.chartOverlay}>
              <ActivityIndicator size="large" color={BLUE} />
              <Text style={styles.overlayText}>Loading chart data...</Text>
            </View>
          )}

          {/* Error / Retry */}
          {isError && !isLoading && (
            <View style={styles.chartOverlay}>
              <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
              <Text style={styles.overlayText}>Unable to load chart</Text>
              <Text style={styles.overlaySubText}>Waiting for market data connection...</Text>
            </View>
          )}

          {CHART_HEIGHT > 0 && candles.length > 0 && (
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              <View style={{ width: CHART_WIDTH, height: CHART_HEIGHT }}>
                {/* Grid Lines */}
                {[0.25, 0.5, 0.75].map(v => (
                  <View
                    key={v}
                    style={[styles.gridLine, { top: CHART_HEIGHT * v, width: CHART_WIDTH }]}
                  />
                ))}

                {/* Candles */}
                {candles.map((c, i) => {
                  const x = i * (CANDLE_WIDTH + CANDLE_GAP) + 10;
                  const isUp = c.close >= c.open;
                  const color = isUp ? BLUE : RED;
                  const openY = getY(c.open);
                  const closeY = getY(c.close);
                  const highY = getY(c.high);
                  const lowY = getY(c.low);
                  const topY = Math.min(openY, closeY);
                  const bodyHeight = Math.max(Math.abs(openY - closeY), 1);
                  const wickX = x + CANDLE_WIDTH / 2;

                  return (
                    <View key={i} style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, pointerEvents: 'none' }}>
                      <View style={{
                        position: 'absolute',
                        left: wickX,
                        top: highY,
                        height: Math.max(lowY - highY, 1),
                        width: 1,
                        backgroundColor: color
                      }} />
                      <View style={{
                        position: 'absolute',
                        left: x,
                        top: topY,
                        width: CANDLE_WIDTH,
                        height: bodyHeight,
                        backgroundColor: color
                      }} />
                    </View>
                  );
                })}

                {/* Current Price Line */}
                <View style={{ position: 'absolute', top: getY(latestBid), left: 0, right: 0, width: CHART_WIDTH, height: 1, backgroundColor: BLUE, opacity: 0.8, borderStyle: 'dashed', borderWidth: 1, borderColor: BLUE }} />
                <View style={{ position: 'absolute', top: getY(latestAsk), left: 0, right: 0, width: CHART_WIDTH, height: 1, backgroundColor: RED, opacity: 0.8, borderStyle: 'dashed', borderWidth: 1, borderColor: RED }} />
              </View>
            </ScrollView>
          )}

          {CHART_HEIGHT > 0 && candles.length > 0 && (
            <>
              <View style={[styles.priceTagWrap, { top: getY(latestBid) - 10, backgroundColor: BLUE }]}>
                <Text style={styles.priceTagText}>{(latestBid || 0).toFixed(displayDecimals)}</Text>
              </View>
              <View style={[styles.priceTagWrap, { top: getY(latestAsk) - 10, backgroundColor: RED }]}>
                <Text style={styles.priceTagText}>{(latestAsk || 0).toFixed(displayDecimals)}</Text>
              </View>

              <Text style={[styles.axisLabelY, { top: CHART_HEIGHT * 0.25 - 8 }]}>{(min + range * 0.75 || 0).toFixed(displayDecimals)}</Text>
              <Text style={[styles.axisLabelY, { top: CHART_HEIGHT * 0.5 - 8 }]}>{(min + range * 0.5 || 0).toFixed(displayDecimals)}</Text>
              <Text style={[styles.axisLabelY, { top: CHART_HEIGHT * 0.75 - 8 }]}>{(min + range * 0.25 || 0).toFixed(displayDecimals)}</Text>
            </>
          )}

          <View style={styles.xAxis}>
            {candles.length > 0 && xAxisLabels.map((label, i) => (
              <Text key={i} style={[styles.xTick, { left: label.position }]}>{label.text}</Text>
            ))}
          </View>
        </View>

        <View style={styles.bottomArea}>
          <View style={styles.timeframesRow}>
            {['M1', 'M5', 'M15', 'H1', 'H4', 'D1'].map((tf) => (
              <Pressable key={tf} onPress={() => setChartTimeframe(tf)} style={[styles.tfBtn, chartTimeframe === tf && styles.tfBtnActive]}>
                <Text style={[styles.tfText, chartTimeframe === tf && styles.tfTextActive]}>{tf}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.segmentedControl}>
            {['POSITIONS', 'ORDERS', 'HISTORY'].map((tab) => (
              <Pressable key={tab} style={[styles.segmentBtn, tab === 'POSITIONS' && styles.segmentBtnActive]}>
                <Text style={[styles.segmentText, tab === 'POSITIONS' && styles.segmentTextActive]}>{tab}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sentimentLabelsRow}>
            <Text style={styles.sentimentLabelSell}>32% SELL</Text>
            <Text style={styles.sentimentLabelBuy}>68% BUY</Text>
          </View>
          <View style={styles.sentimentBarRow}>
            <View style={[styles.sentimentHalf, styles.sentimentSell, { flex: 0.32 }]} />
            <View style={[styles.sentimentHalf, styles.sentimentBuy, { flex: 0.68 }]} />
          </View>

          <View style={styles.tradeControlsRow}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSell]}
              onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol: chartSymbol, side: 'sell' } })}
            >
              <View style={styles.actionBtnInnerLeft}>
                <Text style={styles.actionBtnLabelTitle}>SELL</Text>
                <Text style={styles.actionBtnPriceText}>@ {(latestAsk || 0).toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
            </Pressable>

            <View style={styles.actionSpacer} />

            <Pressable
              style={[styles.actionBtn, styles.actionBtnBuy]}
              onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol: chartSymbol, side: 'buy' } })}
            >
              <View style={styles.actionBtnInnerLeft}>
                <Text style={styles.actionBtnLabelTitle}>BUY</Text>
                <Text style={styles.actionBtnPriceText}>@ {(latestBid || 0).toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
            </Pressable>
          </View>

          <View style={styles.lotSelectorBar}>
            <Pressable style={styles.lotStepperBtn} onPress={() => setLotSize(prev => Math.max(0.01, +((prev || 0) - 0.01).toFixed(2)))}>
              <Ionicons name="remove" size={18} color={G.textSub} />
            </Pressable>
            <Text style={styles.lotLabelText}>Lot: <Text style={styles.lotValueText}>{(lotSize || 0).toFixed(2)}</Text></Text>
            <Pressable style={styles.lotStepperBtn} onPress={() => setLotSize(prev => +((prev || 0) + 0.01).toFixed(2))}>
              <Ionicons name="add" size={18} color={G.textSub} />
            </Pressable>
          </View>
        </View>
      </View>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={`${chartSymbol}: active chart`}
        actions={[
          { label: 'Indicators' },
          { label: 'Objects', onPress: () => router.push('/chart/objects') },
          { label: 'Settings' },
        ]}
      />

      <ActionSheet
        visible={tfOpen}
        onClose={() => setTfOpen(false)}
        title='Timeframes'
        actions={timeframes.map((tf) => ({ label: tf, onPress: () => setChartTimeframe(tf) }))}
      />

      <ActionSheet
        visible={symbolPickerOpen}
        onClose={() => setSymbolPickerOpen(false)}
        title='Select Symbol'
        actions={CHART_SYMBOLS.map((sym) => ({
          label: sym,
          onPress: () => setChartSymbol(sym),
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: APP_BG, paddingHorizontal: 0 },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerSpacer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  headerSpacerRight: {
    alignItems: 'flex-end',
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: G.glass1,
    borderWidth: 1,
    borderColor: G.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountBadgeGroup: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  badgeDemo: {
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  badgeLive: {
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    borderColor: 'rgba(250, 204, 21, 0.3)',
  },
  liveIndicatorGlow: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowDemo: {
    backgroundColor: 'rgba(0, 230, 118, 0.2)',
  },
  glowLive: {
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotDemo: {
    backgroundColor: '#00E676',
  },
  dotLive: {
    backgroundColor: '#FACC15',
  },
  accountTypeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  textDemo: {
    color: '#00E676',
  },
  textLive: {
    color: '#FACC15',
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  balanceText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  currencyText: {
    fontSize: 12,
    color: '#F8FAFC',
    fontWeight: '800',
  },
  card: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  glassToolbar: {
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#0a0f1f',
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  toolbarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  symbolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flagStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: CARD_BG,
  },
  flagOverlap: {
    marginLeft: -8,
  },
  symbolTextCol: {
    justifyContent: 'center',
  },
  symbolNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  symbolText: {
    color: G.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  microBadge: {
    backgroundColor: G.glass2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: G.border,
  },
  microBadgeText: {
    color: G.textSub,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  symbolSubText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: G.border,
  },
  plInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '800',
    marginRight: 4,
  },
  plValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  plDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginLeft: 20,
    marginRight: 2,
  },
  chartContainer: {
    flex: 1,
    backgroundColor: '#060b17',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: GRID,
    position: 'relative',
  },
  gestureWrap: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  xAxis: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    flexDirection: 'row',
  },
  xTick: {
    position: 'absolute',
    color: TEXT_MUTED,
    fontSize: 13,
    top: 4,
  },
  axisLabelY: {
    position: 'absolute',
    right: 8,
    color: TEXT_MUTED,
    fontSize: 13,
  },
  priceTagWrap: {
    position: 'absolute',
    right: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  priceTagText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  crosshairText: {
    color: '#E2E8F0',
    fontSize: 12,
  },
  bottomArea: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: G.border,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  timeframesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  tfBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tfBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tfText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  tfTextActive: {
    color: '#fff',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(41, 98, 255, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.15)',
    padding: 4,
    marginBottom: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  segmentText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  segmentTextActive: {
    color: '#fff',
  },
  sentimentLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sentimentLabelSell: {
    color: RED,
    fontSize: 11,
    fontWeight: '700',
  },
  sentimentLabelBuy: {
    color: BLUE,
    fontSize: 11,
    fontWeight: '700',
  },
  sentimentBarRow: {
    flexDirection: 'row',
    height: 4,
    marginBottom: 12,
    borderRadius: 2,
    overflow: 'hidden',
  },
  sentimentHalf: {
    height: '100%',
  },
  sentimentSell: {
    backgroundColor: RED,
  },
  sentimentBuy: {
    backgroundColor: BLUE,
  },
  tradeControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  actionBtnSell: {
    backgroundColor: 'rgba(255, 42, 85, 0.1)', // Subtle red tint
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 85, 0.25)',
    shadowColor: '#FF2A55',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  actionBtnBuy: {
    backgroundColor: 'rgba(41, 98, 255, 0.1)', // Subtle blue tint
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.25)',
    shadowColor: '#2962FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  actionBtnInnerLeft: {
    flex: 1,
  },
  actionBtnLabelTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  actionBtnPriceText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    opacity: 0.9,
  },
  actionChevron: {
    opacity: 0.8,
  },
  actionSpacer: {
    width: 12,
  },
  lotSelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(41, 98, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.15)',
  },
  lotStepperBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotLabelText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  lotValueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: GRID,
  },
  chartOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 8, 16, 0.85)',
  },
  overlayText: {
    color: TEXT_MUTED,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  overlaySubText: {
    color: 'rgba(142, 154, 175, 0.6)',
    fontSize: 12,
    marginTop: 4,
  },
});
