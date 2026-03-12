import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View, Dimensions, Image } from 'react-native';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

const getStartPrice = (sym: string) => {
  if (sym.includes('JPY')) return 150.00;
  if (sym.includes('XAU')) return 5180.00;
  return 1.0500;
};

const mapTf = (tf: string) => {
  if (tf.startsWith('M') && tf !== 'MN') return tf.replace('M', '') + ' m';
  if (tf.startsWith('H')) return tf.replace('H', '') + ' h';
  if (tf === 'D1') return '1 d';
  if (tf === 'W1') return '1 w';
  if (tf === 'MN') return '1 M';
  return tf;
};

function generateCandles(count: number, startPrice: number) {
  let price = startPrice;
  const candles = [];
  for (let i = 0; i < count; i++) {
    const isUp = Math.random() > 0.49;
    const range = price * 0.001;
    const open = price;
    let close = price + (isUp ? 1 : -1) * (Math.random() * range);
    if (Math.random() > 0.8) {
      close += (isUp ? 1 : -1) * range * 1.5;
    }
    const high = Math.max(open, close) + Math.random() * (range * 0.4);
    const low = Math.min(open, close) - Math.random() * (range * 0.4);
    price = close;
    candles.push({ open, high, low, close });
  }
  return candles;
}

const APP_BG = '#0B0E14';
const CARD_BG = '#131722';
const BLUE = '#2962FF';
const RED = '#F23645';
const UP_COLOR = '#00C853';
const GRID = 'rgba(255, 255, 255, 0.04)';
const TEXT = '#F7F9FC';
const TEXT_MUTED = '#8B9DB6';
const BTN_BG = '#1A2130';

export function ChartScreen() {
  const { chartSymbol, chartTimeframe, setChartTimeframe } = useUserPreferences();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [candles, setCandles] = useState(() => generateCandles(120, getStartPrice(chartSymbol)));

  // Live tick simulation
  useEffect(() => {
    let tickCount = 0;
    const interval = setInterval(() => {
      setCandles(prev => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        const current = { ...next[lastIndex] };

        // Random walk
        const range = current.open * 0.0003;
        const tick = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * range);

        current.close += tick;
        current.high = Math.max(current.high, current.close);
        current.low = Math.min(current.low, current.close);

        next[lastIndex] = current;

        // Spawn literal new candle every 40 ticks
        tickCount++;
        if (tickCount > 40) {
          tickCount = 0;
          next.push({
            open: current.close,
            high: current.close,
            low: current.close,
            close: current.close,
          });
          // Scroll slightly to reveal new candle
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        }

        return next;
      });
    }, 250); // fast ticks
    return () => clearInterval(interval);
  }, []);

  // Update starting baseline if symbol changes (hard reset)
  useEffect(() => {
    setCandles(generateCandles(120, getStartPrice(chartSymbol)));
  }, [chartSymbol, chartTimeframe]);

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

  const latestClose = candles.length > 0 ? candles[candles.length - 1].close : getStartPrice(chartSymbol);
  const latestBid = latestClose;
  const latestAsk = latestClose + (chartSymbol.includes('XAU') ? 0.396 : 0.00015); 
  const displayDecimals = chartSymbol.includes('JPY') || chartSymbol.includes('XAU') ? 3 : 5;
  const displaySymbol = chartSymbol.replace('/', '') === 'EURUSD' ? 'EUR/USD' : chartSymbol.replace('/', '') === 'XAUUSD' ? 'XAU/USD' : chartSymbol;

  return (
    <Screen style={styles.screen}>
      <View style={styles.topHeaderRow}>
        <View style={styles.accountBadge}>
          <View style={styles.liveIndicator} />
          <Text style={styles.accountTypeText}>DEMO ACCOUNT</Text>
        </View>
        <Text style={styles.balanceText}>1,500.00 USD</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.glassToolbar}>
          <View style={styles.toolbarRow}>
            <View style={styles.symbolInfo}>
              <View style={styles.flagStack}>
                <Image
                  source={{ uri: 'https://flagcdn.com/w160/eu.png' }}
                  style={[styles.flagCircle, { zIndex: 2 }]}
                />
                <Image
                  source={{ uri: 'https://flagcdn.com/w160/us.png' }}
                  style={[styles.flagCircle, styles.flagOverlap, { zIndex: 1 }]}
                />
              </View>
              <View>
                <Text style={styles.symbolText}>
                  {displaySymbol}
                </Text>
                <Text style={styles.symbolSubText}>Euro / US Dollar</Text>
              </View>
            </View>
          </View>

          <View style={styles.plRow}>
            <Text style={styles.plText}>Positions: 0 Open  •  P&L: 0.00</Text>
            <View style={styles.toolbarActions}>
              <Ionicons name="alarm-outline" size={18} color={TEXT_MUTED} />
              <Ionicons name="expand-outline" size={18} color={TEXT_MUTED} />
              <Ionicons name="settings-outline" size={18} color={TEXT_MUTED} />
              <Ionicons name="ellipsis-vertical" size={18} color={TEXT_MUTED} />
            </View>
          </View>
        </View>

        <View style={styles.chartContainer} onLayout={handleLayout}>
          {CHART_HEIGHT > 0 && (
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

          {CHART_HEIGHT > 0 && (
            <>
              <View style={[styles.priceTagWrap, { top: getY(latestBid) - 10, backgroundColor: BLUE }]}>
                <Text style={styles.priceTagText}>{latestBid.toFixed(displayDecimals)}</Text>
              </View>
              <View style={[styles.priceTagWrap, { top: getY(latestAsk) - 10, backgroundColor: RED }]}>
                <Text style={styles.priceTagText}>{latestAsk.toFixed(displayDecimals)}</Text>
              </View>

              <Text style={[styles.axisLabelY, { top: CHART_HEIGHT * 0.25 - 8 }]}>{(min + range * 0.75).toFixed(displayDecimals)}</Text>
              <Text style={[styles.axisLabelY, { top: CHART_HEIGHT * 0.5 - 8 }]}>{(min + range * 0.5).toFixed(displayDecimals)}</Text>
              <Text style={[styles.axisLabelY, { top: CHART_HEIGHT * 0.75 - 8 }]}>{(min + range * 0.25).toFixed(displayDecimals)}</Text>
            </>
          )}

          <View style={styles.xAxis}>
            <Text style={[styles.xTick, { left: '8%' }]}>14:15</Text>
            <Text style={[styles.xTick, { left: '42%' }]}>15:05</Text>
            <Text style={[styles.xTick, { left: '80%' }]}>15:55</Text>
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
            <Pressable style={[styles.actionBtn, styles.actionBtnSell]}>
              <View style={styles.actionBtnInnerLeft}>
                <Text style={styles.actionBtnLabelTitle}>SELL</Text>
                <Text style={styles.actionBtnPriceText}>@ {latestAsk.toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
            </Pressable>

            <View style={styles.actionSpacer} />

            <Pressable style={[styles.actionBtn, styles.actionBtnBuy]}>
              <View style={styles.actionBtnInnerLeft}>
                <Text style={styles.actionBtnLabelTitle}>BUY</Text>
                <Text style={styles.actionBtnPriceText}>@ {latestBid.toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
            </Pressable>
          </View>

          <View style={styles.lotSelectorBar}>
            <Pressable style={styles.lotStepperBtn}>
              <Ionicons name="remove" size={20} color="#94A3B8" />
            </Pressable>
            <Text style={styles.lotLabelText}>Lot: <Text style={styles.lotValueText}>0.10</Text></Text>
            <Pressable style={styles.lotStepperBtn}>
              <Ionicons name="add" size={20} color="#94A3B8" />
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
    paddingTop: 12,
    paddingBottom: 8,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.4)',
    gap: 8,
  },
  liveIndicator: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: UP_COLOR,
  },
  accountTypeText: {
    color: UP_COLOR, fontSize: 11, fontWeight: '800', letterSpacing: 0.5
  },
  balanceText: {
    color: TEXT, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.3,
    marginTop: 4,
  },
  card: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  glassToolbar: {
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 12,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: APP_BG,
  },
  flagOverlap: {
    marginLeft: -10,
  },
  symbolText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  symbolSubText: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 14,
  },
  plRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  plText: {
    color: TEXT_MUTED,
    fontSize: 11,
  },
  chartContainer: {
    flex: 1,
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
    fontSize: 11,
    top: 4,
  },
  axisLabelY: {
    position: 'absolute',
    right: 8,
    color: TEXT_MUTED,
    fontSize: 11,
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
    fontSize: 11,
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
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  timeframesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
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
    marginBottom: 6,
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
    marginBottom: 20,
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
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  actionBtnSell: {
    backgroundColor: 'rgba(255, 51, 102, 0.15)', // Translucent red
    borderWidth: 1,
    borderColor: 'rgba(255, 51, 102, 0.3)',
  },
  actionBtnBuy: {
    backgroundColor: 'rgba(41, 98, 255, 0.15)', // Translucent blue
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.3)',
  },
  actionBtnInnerLeft: {
    flex: 1,
  },
  actionBtnLabelTitle: {
    color: TEXT,
    fontSize: 14,
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
    backgroundColor: '#0A0D14', // Inset CNC dial look
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
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
});
