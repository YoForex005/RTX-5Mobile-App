import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLogin, resolveTradingLoginString } from '../../state/tradingLogin';
import { ordersApi } from '../../api/orders';
import { useTheme, ThemeColors } from '../../theme/useTheme';
import { fmt } from '../../utils/format';
import { useLiveTick } from '../../hooks/useLiveCandles';

const ORDER_TYPES = [
  'Market Execution',
  'Buy Limit', 'Sell Limit',
  'Buy Stop', 'Sell Stop',
  'Buy Stop Limit', 'Sell Stop Limit',
];

/* ── Component ─────────────────────────────────────────────────────────── */
export function OrderTicketScreen() {
  const { symbol: routeSymbol } = useLocalSearchParams<{ symbol?: string }>();
  const symbol = routeSymbol || 'EURUSD'; // Fallback so TS is happy and we have a valid symbol
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accountDetails, themeMode } = useUserPreferences();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const styles = makeStyles(T, isDark);

  const SELL_C = T.trading.sell.primary;
  const SELL_BG = isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)';
  const BUY_C = T.trading.buy.primary;
  const BUY_BG = isDark ? 'rgba(52,199,89,0.08)' : 'rgba(5,150,105,0.06)';
  const WHITE = T.text;
  const SUB = T.textSub;

  const [orderType, setOrderType] = useState('Market Execution');
  const [typeOpen, setTypeOpen] = useState(false);
  const [volume, setVolume] = useState(0.01);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);

  const [modalState, setModalState] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string; }>({ visible: false, type: 'success', title: '', message: '' });

  const handleModalClose = () => {
    if (modalState.type === 'success') {
      router.back();
    }
    setModalState(prev => ({ ...prev, visible: false }));
  };

  // Live WebSocket Pricing
  const latestTick = useLiveTick(symbol);
  const latestClose = latestTick?.close || 0;
  // Compute synthetic BID/ASK if true bid/ask not provided by the socket schema
  const syntheticAsk = latestClose + (symbol.includes('XAU') ? 0.30 : symbol.includes('BTC') ? 25 : 0.00015);
  
  const BID = (latestTick as any)?.bid || latestClose;
  const ASK = (latestTick as any)?.ask || syntheticAsk;

  const [pendingSide, setPendingSide] = useState<'buy' | 'sell' | null>(null);

  const syncOpenedPosition = async (login: string, ticketId?: number) => {
    const maxAttempts = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await usePositionsState.getState().refreshPositions(login);

      if (!ticketId) return;

      const exists = usePositionsState.getState().positions.some(
        (position) => String(position.id) === String(ticketId)
      );

      if (exists) return;

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  const handlePlaceOrder = async (side: 'buy' | 'sell') => {
    if (!accountDetails?.id || !accountDetails?.credentials?.accessToken) {
      setModalState({ visible: true, type: 'error', title: 'Authentication Error', message: 'You must be logged into a valid trading account to place orders.' });
      return;
    }

    const tradingLogin = resolveTradingLogin();
    if (!tradingLogin) {
      setModalState({ visible: true, type: 'error', title: 'Account Error', message: 'Unable to resolve the active trading account login.' });
      return;
    }

    const ALLOWED_SYMBOLS = ['GBPUSD', 'XAUUSD', 'US30', 'XRPUSD', 'XAGUSD'];
    const BLOCKED_SYMBOLS = ['BCHUSD', 'ADAUSD'];

    if (BLOCKED_SYMBOLS.includes(symbol)) {
      setModalState({ visible: true, type: 'error', title: 'Trade Blocked', message: `Trading is explicitly blocked for ${symbol?.replace(/\//g, '')}.` });
      return;
    }

    if (!ALLOWED_SYMBOLS.includes(symbol)) {
      setModalState({ visible: true, type: 'error', title: 'Trade Not Permitted', message: `${symbol?.replace(/\//g, '')} is not currently in the allowed trading list.` });
      return;
    }

    setPendingSide(side);

    // Yield control to the UI thread so the ActivityIndicator visually mounts instantly
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      // Live API Integration: POST /api/v2/orders
      // Places a market order via the centralized ordersApi.
      // Rate limited: 60 requests/min per account.
      // Routed through ordersApi → apiClient which handles:
      //   • Automatic Bearer token injection from Zustand state
      //   • 401 token refresh loops (cyclic refresh_token renewal)
      //   • DB transaction atomicity on the server side
      //   • Rejection on zero/negative market prices
      //   • SL/TP validation against current market price
      const data = await ordersApi.placeMarketOrder({
        account_login: tradingLogin,
        symbol: symbol,
        side: side,
        volume: volume,
        price_sl: 0,
        price_tp: 0,
        comment: 'RTX5 Mobile Order',
        trailing_stop: 0,
        trailing_step: 0,
        magic: 0,
      });

      if (['rejected', 'failed', 'error'].includes(data.status?.toLowerCase())) {
        setModalState({ visible: true, type: 'error', title: 'Order Rejected', message: data.comment || `Server returned status: ${data.status}` });
        return;
      }

      const positionTicket = data.position_ticket ?? data.order_ticket;

      // OPTIMISTIC UPDATE: Add position to state immediately so it renders without delay
      const state = usePositionsState.getState();
      const newPos = {
        id: String(positionTicket || Math.floor(Math.random() * 10000000)),
        symbol: symbol,
        side: side,
        volume: volume,
        openPrice: data.price || (side === 'buy' ? ASK : BID),
        currentPrice: data.price || (side === 'buy' ? ASK : BID),
        pnl: 0,
        swap: 0,
        openTime: new Date().toISOString(),
        sl: 0,
        tp: 0,
        clientCreatedAt: Date.now(),
      };
      
      // prepend the new position
      state.setPositions([newPos, ...state.positions]);

      // Refresh positions state from server in the background
      const mt5Login = resolveTradingLoginString();
      if (mt5Login) {
        void syncOpenedPosition(mt5Login, positionTicket);
      }
      
      // Auto-pop back to chart without forcing a blocking modal tap
      Alert.alert('Order Executed', `Successfully placed ${side.toUpperCase()} ${volume} lot(s) on ${symbol?.replace(/\//g, '')}.\nTicket: #${positionTicket}`);
      router.back();
    } catch (error: any) {
      // Handle specific server rejections from the API layer
      const status = error?.response?.status;
      const errData = error?.response?.data || {};
      switch (status) {
        case 400:
          setModalState({ visible: true, type: 'error', title: 'Order Rejected', message: errData.message || 'Invalid parameters or market closed.' });
          break;
        case 401:
          setModalState({ visible: true, type: 'error', title: 'Session Expired', message: 'Your trading session has expired. Please log in again.' });
          break;
        case 429:
          const retryStr = error?.response?.headers?.['retry-after'];
          const seconds = parseInt(retryStr, 10);
          const msg = !isNaN(seconds) 
            ? `Too many requests. Please wait ${seconds} seconds before placing another order.`
            : 'Too many requests. Please wait a moment before placing another order.';
          setModalState({ visible: true, type: 'error', title: 'Rate Limited', message: msg });
          break;
        default:
          setModalState({ visible: true, type: 'error', title: `Execution Failed (${status || 'Local Error'})`, message: errData.message || String(error?.message || error) || 'Failed to reach the trading server.' });
      }
    } finally {
      setPendingSide(null);
    }
  };

  const adj = (delta: number) =>
    setVolume(v => Math.min(100, Math.max(0.01, parseFloat(((v || 0) + delta).toFixed(2)))));

  const spread = Math.round((ASK - BID) / 0.01);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Compact Header ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 24, zIndex: 10 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Pressable>
        <View style={styles.hCenter}>
          <Text style={styles.hSymbol}>{symbol?.replace(/\//g, '')}</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>Live</Text>
        </View>
      </View>

      {/* ── Price Panel (HERO — always visible) ────────────────────── */}
      <View style={styles.pricePanel}>
        {/* SELL side */}
        <View style={[styles.priceHalf, { backgroundColor: SELL_BG }]}>
          <Text style={[styles.priceTag, { color: SELL_C }]}>SELL</Text>
          <Text style={styles.priceMain}>{fmt.price(BID, 2)}</Text>
          <Text style={styles.priceLabel}>BID</Text>
        </View>

        {/* Spread pillar */}
        <View style={styles.spreadCenter}>
          <Ionicons name="swap-horizontal" size={11} color={T.textSub} />
          <Text style={styles.spreadVal}>{spread}</Text>
          <Text style={styles.spreadUnit}>pts</Text>
        </View>

        {/* BUY side */}
        <View style={[styles.priceHalf, { backgroundColor: BUY_BG }]}>
          <Text style={[styles.priceTag, { color: BUY_C }]}>BUY</Text>
          <Text style={styles.priceMain}>{fmt.price(ASK, 2)}</Text>
          <Text style={styles.priceLabel}>ASK</Text>
        </View>
      </View>

      {/* ── Scrollable Form ────────────────────────────────────────── */}
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Order Type */}
        <Pressable style={styles.flatRow} onPress={() => setTypeOpen(v => !v)}>
          <Text style={styles.rowLabel}>Order Type</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValueWhite}>{orderType}</Text>
            <Ionicons name={typeOpen ? 'chevron-up' : 'chevron-down'} size={14} color={T.textMuted} />
          </View>
        </Pressable>
        <View style={styles.hairline} />

        {typeOpen && (
          <View style={styles.dropdown}>
            {ORDER_TYPES.map((opt, i) => {
              const isSell = opt.toLowerCase().includes('sell');
              const isCur = opt === orderType;
              return (
                <Pressable
                  key={opt}
                  style={[styles.dropOpt, isCur && styles.dropOptActive]}
                  onPress={() => { setOrderType(opt); setTypeOpen(false); }}
                >
                  <View style={[styles.dropDot, { backgroundColor: isSell ? SELL_C : BUY_C }]} />
                  <Text style={[styles.dropText, { color: isCur ? WHITE : SUB }]}>{opt}</Text>
                  {isCur && <Ionicons name="checkmark" size={16} color={T.accent} />}
                </Pressable>
              );
            })}
            <View style={styles.hairline} />
          </View>
        )}

        {/* Volume */}
        <View style={styles.volSection}>
          <Text style={styles.rowLabel}>Volume</Text>
          <View style={styles.volStepper}>
            <Pressable style={styles.volBtn} onPress={() => adj(-0.01)} hitSlop={8}>
              <Ionicons name="remove" size={18} color={T.textSub} />
            </Pressable>
            <View style={styles.volCenter}>
              <Text style={styles.volNum}>{(volume || 0).toFixed(2)}</Text>
            </View>
            <Pressable style={styles.volBtn} onPress={() => adj(+0.01)} hitSlop={8}>
              <Ionicons name="add" size={18} color={T.textSub} />
            </Pressable>
          </View>
        </View>
        <View style={styles.quickRow}>
          {[0.01, 0.05, 0.10, 0.50, 1.00].map(v => (
            <Pressable
              key={v}
              style={[styles.quickPill, volume === v && styles.quickPillActive]}
              onPress={() => setVolume(v)}
            >
              <Text style={[styles.quickTxt, volume === v && styles.quickTxtActive]}>
                {(v || 0).toFixed(2)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.hairline} />

        {/* Risk Management */}
        <Text style={styles.sectionTitle}>RISK MANAGEMENT</Text>
        <ToggleRow label="Stop Loss" icon="shield-half-outline" enabled={slEnabled} onToggle={() => setSlEnabled(v => !v)} T={T} isDark={isDark} styles={styles} />
        <View style={styles.hairline} />
        <ToggleRow label="Take Profit" icon="analytics-outline" enabled={tpEnabled} onToggle={() => setTpEnabled(v => !v)} T={T} isDark={isDark} styles={styles} />
        <View style={styles.hairline} />
        <ToggleRow label="Trailing Stop" icon="git-commit-outline" enabled={false} onToggle={() => { }} T={T} isDark={isDark} styles={styles} />
        <View style={styles.hairline} />

        {/* Market Data (inline key-value) */}
        <Text style={styles.sectionTitle}>MARKET DATA</Text>
        <InfoRow label="Fill Policy" value="FOK" styles={styles} />
        <View style={styles.hairline} />
        <InfoRow label="Spread" value={`${spread} pts`} styles={styles} />
        <View style={styles.hairline} />
        <InfoRow label="Margin" value="-$6.72" styles={styles} />
        <View style={styles.hairline} />
        <InfoRow label="Acc. Leverage" value="1:30" styles={styles} />
        <View style={styles.hairline} />

        {/* Depth of Market — compact table */}
        <Text style={styles.sectionTitle}>DEPTH OF MARKET</Text>
        <View style={styles.domTable}>
          {/* Header */}
          <View style={styles.domHeaderRow}>
            <Text style={[styles.domColHead, { textAlign: 'right' }]}>SELL VOL</Text>
            <Text style={styles.domColHead}>PRICE</Text>
            <Text style={styles.domColHead}>BUY VOL</Text>
          </View>
          {/* Rows */}
          {[
            { sell: 40, price: '67022.00', buy: 30 },
            { sell: 60, price: '67028.00', buy: 55 },
            { sell: 30, price: '67035.00', buy: 70 },
          ].map((r, i) => (
            <View key={i} style={styles.domRow}>
              <View style={styles.domBarCol}>
                <View style={[styles.domBarSell, { width: `${r.sell}%` }]} />
              </View>
              <Text style={styles.domPrice}>{r.price}</Text>
              <View style={[styles.domBarCol, { alignItems: 'flex-start' }]}>
                <View style={[styles.domBarBuy, { width: `${r.buy}%` }]} />
              </View>
            </View>
          ))}
        </View>

        {/* Execution Buttons */}
        <View style={styles.execRow}>
          <Pressable
            style={({ pressed }) => [
              styles.execBtn,
              styles.execSell,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
            ]}
            onPress={() => handlePlaceOrder('sell')}
            disabled={pendingSide !== null}
          >
            {pendingSide === 'sell' ? (
              <ActivityIndicator color={T.text} />
            ) : (
              <>
                <Text style={styles.execCta}>SELL BY MARKET</Text>
                <Text style={styles.execLots}>{(volume || 0).toFixed(2)} Lots</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.execBtn,
              styles.execBuy,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
            ]}
            onPress={() => handlePlaceOrder('buy')}
            disabled={pendingSide !== null}
          >
            {pendingSide === 'buy' ? (
              <ActivityIndicator color={T.text} />
            ) : (
              <>
                <Text style={styles.execCta}>BUY BY MARKET</Text>
                <Text style={styles.execLots}>{(volume || 0).toFixed(2)} Lots</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTxt}>
            *Market execution. The executed price may differ from the requested price.
          </Text>
        </View>
      </ScrollView>

      {/* Success/Error Modal Overlay */}
      {modalState.visible && (
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleModalClose} />
          <View style={styles.successModal}>
            <View style={[styles.successIconBox, modalState.type === 'error' && { backgroundColor: T.trading.sell.primary }]}>
              <Ionicons name={modalState.type === 'success' ? 'checkmark' : 'close'} size={32} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{modalState.title}</Text>
            <Text style={styles.successDesc}>{modalState.message}</Text>
            <Pressable style={[styles.successBtn, modalState.type === 'error' && { backgroundColor: T.trading.sell.primary }]} onPress={handleModalClose}>
              <Text style={styles.successBtnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/* ── ToggleRow ─────────────────────────────────────────────────────────── */
function ToggleRow({ label, icon, enabled, onToggle, T, isDark, styles }: {
  T: ThemeColors;
  isDark: boolean;
  styles: any;
  label: string; icon: keyof typeof Ionicons.glyphMap;
  enabled: boolean; onToggle: () => void;
}) {
  return (
    <View style={styles.flatRow}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={14} color={T.textSub} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Pressable onPress={onToggle} style={[styles.track, enabled && styles.trackOn]}>
          <View style={[styles.thumb, enabled && styles.thumbOn]} />
        </Pressable>
        <Text style={[styles.statusTxt, enabled && { color: T.accent }]}>
          {enabled ? 'ON' : 'OFF'}
        </Text>
      </View>
    </View>
  );
}

/* ── InfoRow ────────────────────────────────────────────────────────────── */
function InfoRow({ label, value, styles }: {
  label: string;
  value: string;
  styles: any;
}) {
  return (
    <View style={styles.flatRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValueWhite}>{value}</Text>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────── */
function makeStyles(T: ThemeColors, isDark: boolean) {
  const BG = T.bg;
  const SURFACE = T.glass2;
  const ELEVATED = T.glass1;
  const LINE = T.border;
  const WHITE = T.text;
  const SUB = T.textSub;
  const DIM = T.textMuted;
  const ACCENT = T.accent;

  const SELL_C = T.trading.sell.primary;
  const SELL_BG = isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)';
  const BUY_C = T.trading.buy.primary;
  const BUY_BG = isDark ? 'rgba(52,199,89,0.08)' : 'rgba(5,150,105,0.06)';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, zIndex: 10 },
    backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: ELEVATED, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
    hCenter: { flex: 1, alignItems: 'center' },
    hSymbol: { color: WHITE, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: BUY_BG },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BUY_C },
    liveLabel: { color: BUY_C, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

    pricePanel: {
      flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 12, borderRadius: 12, overflow: 'hidden',
      backgroundColor: SURFACE, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4
    },
    priceHalf: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    priceTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    priceMain: { color: WHITE, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1, letterSpacing: -0.5 },
    priceLabel: { color: T.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
    spreadCenter: { width: 40, alignItems: 'center', justifyContent: 'center' },
    spreadVal: { color: WHITE, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
    spreadUnit: { color: T.textSub, fontSize: 8, fontWeight: '700' },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
    sectionTitle: { color: T.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },

    flatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowLabel: { color: SUB, fontSize: 14, fontWeight: '500' },
    rowValueWhite: { color: WHITE, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
    hairline: { height: 1, backgroundColor: LINE },

    dropdown: { backgroundColor: ELEVATED, borderRadius: 10, marginBottom: 4, borderWidth: 1, borderColor: T.border },
    dropOpt: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    dropOptActive: { backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : T.glass3 },
    dropDot: { width: 6, height: 6, borderRadius: 3 },
    dropText: { flex: 1, fontSize: 14, fontWeight: '500' },

    volSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    volStepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 8, backgroundColor: ELEVATED, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
    volBtn: { width: 40, height: '100%', alignItems: 'center', justifyContent: 'center' },
    volCenter: { paddingHorizontal: 16, height: '100%', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: LINE },
    volNum: { color: WHITE, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
    quickRow: { flexDirection: 'row', gap: 5, paddingBottom: 4 },
    quickPill: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: ELEVATED, alignItems: 'center', borderWidth: 1, borderColor: T.border },
    quickPillActive: { backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : T.glass3, borderColor: ACCENT },
    quickTxt: { color: SUB, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
    quickTxtActive: { color: ACCENT },

    track: { width: 40, height: 22, borderRadius: 11, backgroundColor: isDark ? '#252C3B' : T.border, justifyContent: 'center', paddingHorizontal: 2 },
    trackOn: { backgroundColor: ACCENT },
    thumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: isDark ? '#A0ABC0' : '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
    thumbOn: { backgroundColor: '#FFFFFF', transform: [{ translateX: 18 }] },
    statusTxt: { color: SUB, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, minWidth: 22 },

    domTable: { marginTop: 4, marginBottom: 6, borderRadius: 8, backgroundColor: SURFACE, overflow: 'hidden', paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: T.border, shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 12, elevation: 2 },
    domHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    domColHead: { flex: 1, color: SUB, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
    domRow: { flexDirection: 'row', alignItems: 'center', height: 16, marginBottom: 2 },
    domBarCol: { flex: 1, height: 10, alignItems: 'flex-end', justifyContent: 'center' },
    domBarSell: { height: 12, borderRadius: 2, backgroundColor: SELL_C },
    domBarBuy: { height: 12, borderRadius: 2, backgroundColor: BUY_C },
    domPrice: { width: 80, textAlign: 'center', color: WHITE, fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },

    disclaimer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
    disclaimerTxt: { color: T.textMuted, fontSize: 10, lineHeight: 14, flex: 1 },
    disclaimerIcons: { flexDirection: 'row', gap: 10 },

    execRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
    execBtn: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    execSell: { backgroundColor: SELL_C, shadowColor: SELL_C },
    execBuy: { backgroundColor: BUY_C, shadowColor: BUY_C },
    execCta: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
    execLots: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
    
    /* Success / Error Modal */
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      zIndex: 999,
      elevation: 999,
    },
    successModal: {
      width: '85%',
      maxWidth: 340,
      backgroundColor: SURFACE,
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: T.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
    },
    successIconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: BUY_C,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    successTitle: {
      color: WHITE,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 8,
    },
    successDesc: {
      color: SUB,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    successBtn: {
      backgroundColor: ACCENT,
      width: '100%',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    successBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
