import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, Vibration } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface TradeFeedbackState {
  visible: boolean;
  type: 'success' | 'error';
  title?: string;
  message?: string;
  side?: 'buy' | 'sell';
  symbol?: string;
  ticket?: string;
  price?: number;
  volume?: number;
  executedAt?: string;
}

export const TRADE_MODAL_INITIAL: TradeFeedbackState = {
  visible: false,
  type: 'success',
};

// Determines how many decimals to show for a given symbol
export function priceDecimalsFor(symbol?: string): number {
  if (!symbol) return 5;
  if (symbol.includes('JPY')) return 3;
  if (symbol.includes('XAU') || symbol.includes('BTC') || symbol.includes('ETH')) return 2;
  return 5;
}

export const TradeFeedbackModal = React.memo(({
  state,
  onClose,
  isDark = true,
}: {
  state: TradeFeedbackState;
  onClose: () => void;
  isDark?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!state.visible) return;
    slideAnim.setValue(0);
    opacityAnim.setValue(0);
    progressAnim.setValue(1);

    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 1, tension: 80, friction: 11, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    if (state.type === 'success') {
      Vibration.vibrate([0, 28, 40, 28]);
      Animated.timing(progressAnim, { toValue: 0, duration: 5000, useNativeDriver: false }).start();
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.visible, slideAnim, opacityAnim, progressAnim, state.type, onClose]);

  if (!state.visible) return null;

  const isBuy = state.side === 'buy';
  const isSuccess = state.type === 'success';

  // The user explicitly requested that BOTH "Buy by Market" and "Sell by Market" successful
  // order executions share the exact same professional Green success theme.
  // We strictly reserve Red ONLY for actual failures/errors.
  const BUY_HEX = '#10B981';
  const ERR_HEX = '#EF4444';
  
  const accent = isSuccess ? BUY_HEX : ERR_HEX;
  const accentSoft = isSuccess ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)';
  const gradientTo = isSuccess ? '#34D399' : '#F87171';

  const cardBg = isDark ? '#14161D' : '#FFFFFF';
  const subtleBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textMuted = isDark ? '#94A3B8' : '#64748B';
  const rowBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)';

  const formattedPrice = typeof state.price === 'number'
    ? state.price.toFixed(priceDecimalsFor(state.symbol))
    : '—';

  const scale = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <View style={tfmStyles.overlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <Animated.View style={[
        tfmStyles.card,
        {
          backgroundColor: cardBg,
          borderColor: subtleBorder,
          opacity: opacityAnim,
          transform: [{ scale }],
        },
      ]}>
        {/* Gradient header strip */}
        <LinearGradient
          colors={[accent, gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={tfmStyles.headerStrip}
        >
          {isSuccess && (
            <Animated.View style={[
              tfmStyles.headerProgress,
              {
                width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]} />
          )}
        </LinearGradient>

        {/* Status row — icon + badge */}
        <View style={tfmStyles.statusRow}>
          <View style={[tfmStyles.statusIcon, { backgroundColor: accentSoft, borderColor: accent }]}>
            <Ionicons
              name={isSuccess ? 'checkmark' : 'close'}
              size={22}
              color={accent}
            />
          </View>
          <View style={tfmStyles.statusTextCol}>
            <Text style={[tfmStyles.statusTitle, { color: textPrimary }]} numberOfLines={1}>
              {isSuccess ? 'Order Executed' : (state.title || 'Order Rejected')}
            </Text>
            <View style={tfmStyles.statusSubRow}>
              <View style={[tfmStyles.statusBadge, { backgroundColor: accentSoft }]}>
                <View style={[tfmStyles.statusDot, { backgroundColor: accent }]} />
                <Text style={[tfmStyles.statusBadgeText, { color: accent }]}>
                  {isSuccess ? 'FILLED' : 'FAILED'}
                </Text>
              </View>
              {isSuccess && state.executedAt ? (
                <Text style={[tfmStyles.statusSubText, { color: textMuted }]} numberOfLines={1}>
                  {state.executedAt}
                </Text>
              ) : null}
            </View>
          </View>
          <Pressable style={tfmStyles.closeBtn} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={textMuted} />
          </Pressable>
        </View>

        {isSuccess ? (
          <>
            {/* Symbol + side chip + price */}
            <View style={tfmStyles.priceCard}>
              <View style={tfmStyles.priceHeaderRow}>
                <Text style={[tfmStyles.symbolText, { color: textPrimary }]} numberOfLines={1}>
                  {state.symbol}
                </Text>
                <View style={[tfmStyles.sideChip, { backgroundColor: accent }]}>
                  <Ionicons name={isBuy ? 'arrow-up' : 'arrow-down'} size={11} color="#fff" />
                  <Text style={tfmStyles.sideChipText}>{state.side?.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={[tfmStyles.priceText, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                {formattedPrice}
              </Text>
              <Text style={[tfmStyles.priceLabel, { color: textMuted }]}>EXECUTION PRICE</Text>
            </View>

            {/* Details grid */}
            <View style={[tfmStyles.detailsGrid, { backgroundColor: rowBg, borderColor: subtleBorder }]}>
              <View style={tfmStyles.detailItem}>
                <Text style={[tfmStyles.detailLabel, { color: textMuted }]}>VOLUME</Text>
                <Text style={[tfmStyles.detailValue, { color: textPrimary }]} numberOfLines={1}>
                  {typeof state.volume === 'number' ? state.volume.toFixed(2) : state.volume ?? '—'}
                </Text>
              </View>
              <View style={[tfmStyles.detailSep, { backgroundColor: subtleBorder }]} />
              <View style={tfmStyles.detailItem}>
                <Text style={[tfmStyles.detailLabel, { color: textMuted }]}>TICKET</Text>
                <Text style={[tfmStyles.detailValue, { color: textPrimary }]} numberOfLines={1}>
                  #{state.ticket ?? '—'}
                </Text>
              </View>
              <View style={[tfmStyles.detailSep, { backgroundColor: subtleBorder }]} />
              <View style={tfmStyles.detailItem}>
                <Text style={[tfmStyles.detailLabel, { color: textMuted }]}>SIDE</Text>
                <Text style={[tfmStyles.detailValue, { color: accent }]} numberOfLines={1}>
                  {state.side?.toUpperCase() ?? '—'}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={[tfmStyles.errorBox, { backgroundColor: accentSoft, borderColor: accent }]}>
              <Ionicons name="alert-circle" size={18} color={accent} style={{ marginRight: 10 }} />
              <Text style={[tfmStyles.errorMsg, { color: textPrimary }]}>
                {state.message || 'The broker rejected this order.'}
              </Text>
            </View>
          </>
        )}

        {/* Action buttons */}
        <View style={tfmStyles.actionsRow}>
          {isSuccess ? (
            <>
              <Pressable
                style={[tfmStyles.actionBtnSecondary, { borderColor: subtleBorder }]}
                onPress={() => { onClose(); try { router.push('/trade'); } catch (_e) { } }}
              >
                <Text style={[tfmStyles.actionBtnSecondaryText, { color: textPrimary }]}>
                  View Position
                </Text>
              </Pressable>
              <Pressable
                style={[tfmStyles.actionBtnPrimary, { backgroundColor: accent }]}
                onPress={onClose}
              >
                <Text style={tfmStyles.actionBtnPrimaryText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[tfmStyles.actionBtnPrimary, tfmStyles.actionBtnPrimaryFull, { backgroundColor: accent }]}
              onPress={onClose}
            >
              <Text style={tfmStyles.actionBtnPrimaryText}>Dismiss</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
});

const tfmStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,6,16,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 999,
    elevation: 999,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 24,
  },
  headerStrip: {
    height: 4,
    width: '100%',
    overflow: 'hidden',
  },
  headerProgress: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginRight: 12,
  },
  statusTextCol: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  statusSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statusSubText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    fontVariant: ['tabular-nums'] as any,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  priceCard: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  priceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  symbolText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sideChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginHorizontal: 4,
  },
  priceText: {
    fontSize: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: -1.4,
    lineHeight: 44,
    marginTop: 2,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },
  detailsGrid: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 18,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 1,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  detailSep: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 18,
    marginBottom: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorMsg: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    gap: 10,
  },
  actionBtnPrimary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryFull: {
    flex: 1,
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  actionBtnSecondary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
