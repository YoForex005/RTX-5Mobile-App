import { FastPressable as Pressable } from './FastPressable';
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

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
  /** False means the API accepted the request without complete broker fill evidence. */
  executionConfirmed?: boolean;
}

export const TRADE_MODAL_INITIAL: TradeFeedbackState = {
  visible: false,
  type: 'success',
};

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
      Animated.timing(progressAnim, { toValue: 0, duration: 5000, useNativeDriver: false }).start();
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.visible, slideAnim, opacityAnim, progressAnim, state.type, onClose]);

  if (!state.visible) return null;

  const isBuy = state.side === 'buy';
  const isSell = state.side === 'sell';
  const isSuccess = state.type === 'success';
  const isUnconfirmedSubmission = isSuccess && state.executionConfirmed === false;
  const sideLabel = state.side === 'buy' ? 'BUY' : state.side === 'sell' ? 'SELL' : '';
  const confirmedSuccessTitle = sideLabel && (!state.title || state.title === 'Order Executed')
    ? `${sideLabel} Order Executed`
    : state.title || 'Order Executed';
  const successTitle = isUnconfirmedSubmission
    ? state.title || 'Order Submitted'
    : confirmedSuccessTitle;

  const BUY_HEX = '#2563EB';
  const BUY_GRADIENT_HEX = '#60A5FA';
  const BUY_SOFT_RGBA = 'rgba(37,99,235,0.14)';
  const SELL_HEX = '#DC2626';
  const SELL_GRADIENT_HEX = '#F87171';
  const SELL_SOFT_RGBA = 'rgba(220,38,38,0.14)';
  const SUCCESS_HEX = '#10B981';
  const SUCCESS_GRADIENT_HEX = '#34D399';
  const SUCCESS_SOFT_RGBA = 'rgba(16,185,129,0.14)';
  const ERR_HEX = '#EF4444';
  const ERR_GRADIENT_HEX = '#F87171';
  const ERR_SOFT_RGBA = 'rgba(239,68,68,0.14)';

  const accent = isSuccess ? (isBuy ? BUY_HEX : isSell ? SELL_HEX : SUCCESS_HEX) : ERR_HEX;
  const accentSoft = isSuccess
    ? (isBuy ? BUY_SOFT_RGBA : isSell ? SELL_SOFT_RGBA : SUCCESS_SOFT_RGBA)
    : ERR_SOFT_RGBA;
  const gradientTo = isSuccess
    ? (isBuy ? BUY_GRADIENT_HEX : isSell ? SELL_GRADIENT_HEX : SUCCESS_GRADIENT_HEX)
    : ERR_GRADIENT_HEX;

  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const subtleBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textMuted = isDark ? '#94A3B8' : '#64748B';

  const hasExecutionPrice = typeof state.price === 'number' && Number.isFinite(state.price);
  const formattedPrice = hasExecutionPrice ? state.price!.toFixed(priceDecimalsFor(state.symbol)) : '';
  const volumeLabel = typeof state.volume === 'number' && Number.isFinite(state.volume)
    ? `${state.volume.toFixed(2)} lot`
    : '';
  const successSummaryText = [state.symbol, volumeLabel].filter(Boolean).join(' - ');
  const executionLabel = sideLabel ? `${sideLabel} price` : 'Execution price';
  const scale = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
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

          <View style={tfmStyles.statusRow}>
            <View style={[tfmStyles.statusIcon, { backgroundColor: accentSoft, borderColor: accent }]}>
              <Ionicons
                name={isUnconfirmedSubmission ? 'time-outline' : isSuccess ? 'checkmark' : 'close'}
                size={21}
                color={accent}
              />
            </View>
            <View style={tfmStyles.statusTextCol}>
              <Text style={[tfmStyles.statusTitle, { color: textPrimary }]} numberOfLines={1}>
                {isSuccess ? successTitle : (state.title || 'Order Rejected')}
              </Text>
              {isSuccess && successSummaryText ? (
                <Text style={[tfmStyles.statusSubtitle, { color: textMuted }]} numberOfLines={1}>
                  {successSummaryText}
                </Text>
              ) : null}
            </View>
            <Pressable style={tfmStyles.closeBtn} onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={18} color={textMuted} />
            </Pressable>
          </View>

          {isUnconfirmedSubmission && state.message ? (
            <View style={[tfmStyles.errorBox, { backgroundColor: accentSoft, borderColor: accent }]}>
              <Ionicons name="information-circle" size={18} color={accent} style={tfmStyles.errorIcon} />
              <Text style={[tfmStyles.errorMsg, { color: textPrimary }]}>
                {state.message}
              </Text>
            </View>
          ) : isSuccess ? (
            <View style={tfmStyles.successSummary}>
              {hasExecutionPrice ? (
                <View style={[tfmStyles.executionRow, { borderColor: subtleBorder }]}>
                  <Text style={[tfmStyles.executionLabel, { color: textMuted }]} numberOfLines={1}>
                    {executionLabel}
                  </Text>
                  <Text style={[tfmStyles.executionPrice, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formattedPrice}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[tfmStyles.errorBox, { backgroundColor: accentSoft, borderColor: accent }]}>
              <Ionicons name="alert-circle" size={18} color={accent} style={tfmStyles.errorIcon} />
              <Text style={[tfmStyles.errorMsg, { color: textPrimary }]}>
                {state.message || 'The broker rejected this order.'}
              </Text>
            </View>
          )}

          <View style={tfmStyles.actionsRow}>
            <Pressable
              style={[tfmStyles.actionBtnPrimary, { backgroundColor: accent }]}
              onPress={onClose}
            >
              <Text style={tfmStyles.actionBtnPrimaryText}>{isSuccess ? 'Done' : 'Dismiss'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

const tfmStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,6,16,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    zIndex: 999,
    elevation: 999,
  },
  card: {
    width: '100%',
    maxWidth: 328,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 20,
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  statusIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.25,
    marginRight: 11,
  },
  statusTextCol: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  statusSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  successSummary: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  executionRow: {
    minHeight: 42,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 9,
  },
  executionLabel: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  executionPrice: {
    flex: 1,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 0,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorIcon: {
    marginRight: 10,
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
  },
  actionBtnPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
