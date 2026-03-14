import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmt } from '../../utils/format';

/* ── Design tokens ─────────────────────────────────────────────────────── */
const BG       = '#0B0D14';
const SURFACE  = '#111520';
const ELEVATED = '#181D2A';
const LINE     = 'rgba(255,255,255,0.04)';
const LINE_M   = 'rgba(255,255,255,0.06)';
const SELL_C   = '#FF3B30';
const SELL_BG  = 'rgba(255,59,48,0.06)';
const SELL_BR  = 'rgba(255,59,48,0.25)';
const BUY_C    = '#34C759';
const BUY_BG   = 'rgba(52,199,89,0.06)';
const BUY_BR   = 'rgba(52,199,89,0.25)';
const ACCENT   = '#0A84FF';
const WHITE    = '#FFFFFF';
const SUB      = '#8E8E93';
const DIM      = 'rgba(255,255,255,0.28)';

const ORDER_TYPES = [
  'Market Execution',
  'Buy Limit', 'Sell Limit',
  'Buy Stop', 'Sell Stop',
  'Buy Stop Limit', 'Sell Stop Limit',
];

const BID = 67022.0;
const ASK = 67040.0;

/* ── Component ─────────────────────────────────────────────────────────── */
export function OrderTicketScreen() {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [orderType, setOrderType] = useState('Market Execution');
  const [typeOpen, setTypeOpen] = useState(false);
  const [volume, setVolume] = useState(0.01);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);

  const adj = (delta: number) =>
    setVolume(v => Math.min(100, Math.max(0.01, parseFloat(((v || 0) + delta).toFixed(2)))));

  const spread = Math.round((ASK - BID) / 0.01);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Compact Header ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 32 }]}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={18} color={WHITE} />
        </Pressable>
        <View style={styles.hCenter}>
          <Text style={styles.hSymbol}>EURUSD</Text>
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
          <Ionicons name="swap-horizontal" size={11} color={DIM} />
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
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Order Type */}
        <Pressable style={styles.flatRow} onPress={() => setTypeOpen(v => !v)}>
          <Text style={styles.rowLabel}>Order Type</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValueWhite}>{orderType}</Text>
            <Ionicons name={typeOpen ? 'chevron-up' : 'chevron-down'} size={14} color={DIM} />
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
                  {isCur && <Ionicons name="checkmark" size={16} color={ACCENT} />}
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
              <Ionicons name="remove" size={18} color={SUB} />
            </Pressable>
            <View style={styles.volCenter}>
              <Text style={styles.volNum}>{(volume || 0).toFixed(2)}</Text>
            </View>
            <Pressable style={styles.volBtn} onPress={() => adj(+0.01)} hitSlop={8}>
              <Ionicons name="add" size={18} color={SUB} />
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
        <ToggleRow label="Stop Loss" icon="shield-half-outline" enabled={slEnabled} onToggle={() => setSlEnabled(v => !v)} />
        <View style={styles.hairline} />
        <ToggleRow label="Take Profit" icon="analytics-outline" enabled={tpEnabled} onToggle={() => setTpEnabled(v => !v)} />
        <View style={styles.hairline} />
        <ToggleRow label="Trailing Stop" icon="git-commit-outline" enabled={false} onToggle={() => {}} />
        <View style={styles.hairline} />

        {/* Market Data (inline key-value) */}
        <Text style={styles.sectionTitle}>MARKET DATA</Text>
        <InfoRow label="Fill Policy" value="FOK" />
        <View style={styles.hairline} />
        <InfoRow label="Spread" value={`${spread} pts`} />
        <View style={styles.hairline} />
        <InfoRow label="Margin" value="-$6.72" />
        <View style={styles.hairline} />
        <InfoRow label="Acc. Leverage" value="1:30" />
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
          <Pressable style={[styles.execBtn, styles.execSell]}>
            <Text style={styles.execCta}>SELL BY MARKET</Text>
            <Text style={styles.execLots}>{(volume || 0).toFixed(2)} Lots</Text>
          </Pressable>
          <Pressable style={[styles.execBtn, styles.execBuy]}>
            <Text style={styles.execCta}>BUY BY MARKET</Text>
            <Text style={styles.execLots}>{(volume || 0).toFixed(2)} Lots</Text>
          </Pressable>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTxt}>
            *Market execution. The executed price may differ from the requested price.
          </Text>
          <View style={styles.disclaimerIcons}>
            <Ionicons name="document-text-outline" size={16} color={DIM} />
            <Ionicons name="information-circle-outline" size={16} color={DIM} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ── ToggleRow ─────────────────────────────────────────────────────────── */
function ToggleRow({ label, icon, enabled, onToggle }: {
  label: string; icon: keyof typeof Ionicons.glyphMap;
  enabled: boolean; onToggle: () => void;
}) {
  return (
    <View style={styles.flatRow}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={14} color={DIM} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Pressable onPress={onToggle} style={[styles.track, enabled && styles.trackOn]}>
          <View style={[styles.thumb, enabled && styles.thumbOn]} />
        </Pressable>
        <Text style={[styles.statusTxt, enabled && { color: ACCENT }]}>
          {enabled ? 'ON' : 'OFF'}
        </Text>
      </View>
    </View>
  );
}

/* ── InfoRow ────────────────────────────────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flatRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValueWhite}>{value}</Text>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    backgroundColor: ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hCenter: { flex: 1, alignItems: 'center' },
  hSymbol: { color: WHITE, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: BUY_BG,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BUY_C },
  liveLabel: { color: BUY_C, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  /* ── PRICE PANEL (Hero) ───────────────────────────────────── */
  pricePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  priceHalf: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  priceTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  priceMain: {
    color: WHITE,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
    letterSpacing: -0.5,
  },
  priceLabel: {
    color: DIM,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  spreadCenter: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spreadVal: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  spreadUnit: {
    color: DIM,
    fontSize: 8,
    fontWeight: '700',
  },

  /* ── Scroll ───────────────────────────────────────────────── */
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },

  /* ── Section titles ───────────────────────────────────────── */
  sectionTitle: {
    color: DIM,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 2,
  },

  /* ── Flat rows ────────────────────────────────────────────── */
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    color: '#E8E8ED',
    fontSize: 14,
    fontWeight: '500',
  },
  rowValueWhite: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hairline: {
    height: 1,
    backgroundColor: LINE,
  },

  /* ── Dropdown ─────────────────────────────────────────────── */
  dropdown: {
    backgroundColor: ELEVATED,
    borderRadius: 10,
    marginBottom: 4,
  },
  dropOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  dropOptActive: {
    backgroundColor: 'rgba(10,132,255,0.06)',
  },
  dropDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  dropText: {
    flex: 1, fontSize: 14, fontWeight: '500',
  },

  /* ── Volume ───────────────────────────────────────────────── */
  volSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  volStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 8,
    backgroundColor: ELEVATED,
    overflow: 'hidden',
  },
  volBtn: {
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volCenter: {
    paddingHorizontal: 16,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: LINE,
  },
  volNum: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  quickRow: {
    flexDirection: 'row',
    gap: 5,
    paddingBottom: 4,
  },
  quickPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: ELEVATED,
    alignItems: 'center',
  },
  quickPillActive: {
    backgroundColor: 'rgba(10,132,255,0.12)',
  },
  quickTxt: {
    color: SUB,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  quickTxtActive: {
    color: ACCENT,
  },

  /* ── Toggle switch ────────────────────────────────────────── */
  track: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#252C3B',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackOn: { backgroundColor: ACCENT },
  thumb: {
    width: 18, height: 18,
    borderRadius: 9,
    backgroundColor: '#A0ABC0',
  },
  thumbOn: {
    backgroundColor: WHITE,
    transform: [{ translateX: 18 }],
  },
  statusTxt: {
    color: DIM,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    minWidth: 22,
  },

  /* ── DOM Table ────────────────────────────────────────────── */
  domTable: {
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: SURFACE,
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  domHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  domColHead: {
    flex: 1,
    color: '#C8C8CC',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  domRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
    marginBottom: 2,
  },
  domBarCol: {
    flex: 1,
    height: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  domBarSell: {
    height: 12,
    borderRadius: 2,
    backgroundColor: 'rgba(255,59,48,0.55)',
  },
  domBarBuy: {
    height: 12,
    borderRadius: 2,
    backgroundColor: 'rgba(52,199,89,0.55)',
  },
  domPrice: {
    width: 80,
    textAlign: 'center',
    color: WHITE,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  /* ── Disclaimer ───────────────────────────────────────────── */
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  disclaimerTxt: {
    color: DIM,
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  },
  disclaimerIcons: { flexDirection: 'row', gap: 10 },

  /* ── Execution Buttons ─────────────────────────────── */
  execRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  execBtn: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  execSell: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  execBuy: {
    backgroundColor: '#16A34A',
    shadowColor: '#16A34A',
  },
  execCta: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  execLots: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
