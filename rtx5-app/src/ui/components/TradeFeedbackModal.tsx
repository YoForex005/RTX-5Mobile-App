import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FastPressable as Pressable } from './FastPressable';
import { GDark, GLight } from '../theme/glass';
import {
  resolveConfirmedTradeReceipt,
  type TradeFeedbackPresentationInput,
} from './tradeFeedbackPresentation';

export interface TradeFeedbackState extends TradeFeedbackPresentationInput {
  title?: string;
  message?: string;
  executedAt?: string;
  /** Exact Chart SL/TP draft that produced this execution result. */
  protectionDraftId?: string;
}

export const TRADE_MODAL_INITIAL: TradeFeedbackState = {
  visible: false,
  type: 'success',
};

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

  useEffect(() => {
    if (!state.visible) return;

    slideAnim.setValue(0);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    opacityAnim,
    slideAnim,
    state.executedAt,
    state.side,
    state.symbol,
    state.ticket,
    state.visible,
    state.volume,
  ]);

  if (!state.visible) return null;

  const receipt = resolveConfirmedTradeReceipt(state);
  const isBuy = state.side === 'buy';
  const isSell = state.side === 'sell';
  const isSuccess = state.type === 'success';
  const isUnconfirmedSubmission = isSuccess && receipt === null;
  const palette = isDark ? GDark : GLight;
  const BUY_HEX = palette.trading.buy.primary;
  const BUY_SOFT_RGBA = isDark
    ? 'rgba(52,125,255,0.14)'
    : 'rgba(37,99,235,0.10)';
  const SELL_HEX = palette.trading.sell.primary;
  const SELL_SOFT_RGBA = isDark
    ? 'rgba(220,38,38,0.14)'
    : 'rgba(220,38,38,0.08)';
  const SUCCESS_HEX = palette.trading.profit;
  const SUCCESS_SOFT_RGBA = isDark
    ? 'rgba(16,185,129,0.14)'
    : 'rgba(5,150,105,0.10)';
  const ERR_HEX = palette.trading.loss;
  const ERR_SOFT_RGBA = isDark
    ? 'rgba(239,68,68,0.14)'
    : 'rgba(220,38,38,0.10)';

  const accent = isSuccess
    ? (isBuy ? BUY_HEX : isSell ? SELL_HEX : SUCCESS_HEX)
    : ERR_HEX;
  const accentSoft = isSuccess
    ? (isBuy ? BUY_SOFT_RGBA : isSell ? SELL_SOFT_RGBA : SUCCESS_SOFT_RGBA)
    : ERR_SOFT_RGBA;
  const cardBg = palette.glass2;
  const subtleBorder = palette.border;
  const textPrimary = palette.text;
  const textMuted = palette.textSub;
  const doneSurface = isDark ? 'rgba(255,255,255,0.08)' : palette.inputBg;
  const donePressedSurface = isDark ? 'rgba(255,255,255,0.13)' : '#E8EEF7';
  const volumeLabel = typeof state.volume === 'number' && Number.isFinite(state.volume)
    ? state.volume.toFixed(2)
    : '';
  const detailedVolumeLabel = volumeLabel ? `${volumeLabel} lot` : '';
  const successSummaryText = [state.symbol, detailedVolumeLabel].filter(Boolean).join(' - ');
  const detailedTitle = isUnconfirmedSubmission
    ? (
      state.executionConfirmed === false
        ? state.title || 'Order Submitted - Confirmation Pending'
        : 'Order Confirmation Pending'
    )
    : state.title || 'Order Rejected';
  const detailedMessage = state.message || (
    isUnconfirmedSubmission
      ? 'The broker did not return complete execution evidence. Verify the order before acting on it.'
      : 'The broker rejected this order.'
  );

  // Fade/slide only - no scale. Absolute overlay (not RN Modal): on iOS a Modal
  // presentation often forces the chart WebView to recompose and blink.
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  if (receipt) {
    const sideColor = receipt.side === 'buy' ? BUY_HEX : SELL_HEX;
    const sideSurface = receipt.side === 'buy' ? BUY_SOFT_RGBA : SELL_SOFT_RGBA;
    return (
      <View
        style={[
          tfmStyles.receiptOverlay,
          { paddingBottom: Math.max(112, insets.bottom + 104) },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          accessibilityLabel={
            `${receipt.symbol}, ${receipt.sideAccessibilityLabel}, `
            + `${receipt.volumeLabel} lots, ${receipt.doneLabel}`
          }
          style={[
            tfmStyles.receiptCard,
            {
              backgroundColor: cardBg,
              borderColor: subtleBorder,
              shadowColor: isDark ? '#000000' : '#64748B',
              shadowOpacity: isDark ? 0.30 : 0.12,
              opacity: opacityAnim,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[tfmStyles.receiptSideTile, { backgroundColor: sideSurface }]}>
            <Text style={[tfmStyles.receiptSideText, { color: sideColor }]}>
              {receipt.sideLabel}
            </Text>
          </View>

          <View style={tfmStyles.receiptCopy}>
            <Text
              style={[tfmStyles.receiptSymbol, { color: textPrimary }]}
              numberOfLines={1}
            >
              {receipt.symbol}
            </Text>
            <Text
              style={[tfmStyles.receiptVolume, { color: textMuted }]}
              numberOfLines={1}
            >
              {receipt.volumeLabel}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss trade confirmation"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [
              tfmStyles.receiptDoneButton,
              {
                backgroundColor: pressed ? donePressedSurface : doneSurface,
                borderColor: subtleBorder,
              },
            ]}
          >
            <Text style={[tfmStyles.receiptDoneText, { color: textPrimary }]}>
              {receipt.doneLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={tfmStyles.overlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <Animated.View
        style={[
          tfmStyles.card,
          {
            backgroundColor: cardBg,
            borderColor: subtleBorder,
            opacity: opacityAnim,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={tfmStyles.statusRow}>
          <View style={[tfmStyles.statusIcon, { backgroundColor: accentSoft, borderColor: accent }]}>
            <Ionicons
              name={isUnconfirmedSubmission ? 'time-outline' : isSuccess ? 'checkmark' : 'close'}
              size={21}
              color={accent}
            />
          </View>
          <View style={tfmStyles.statusTextCol}>
            <Text style={[tfmStyles.statusTitle, { color: textPrimary }]} numberOfLines={2}>
              {detailedTitle}
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

        <View style={[tfmStyles.errorBox, { backgroundColor: accentSoft, borderColor: accent }]}>
          <Ionicons
            name={isUnconfirmedSubmission ? 'information-circle' : 'alert-circle'}
            size={18}
            color={accent}
            style={tfmStyles.errorIcon}
          />
          <Text style={[tfmStyles.errorMsg, { color: textPrimary }]}>
            {detailedMessage}
          </Text>
        </View>

        <View style={tfmStyles.actionsRow}>
          <Pressable
            style={[tfmStyles.actionBtnPrimary, { backgroundColor: accent }]}
            onPress={onClose}
          >
            <Text style={tfmStyles.actionBtnPrimaryText}>
              {isUnconfirmedSubmission ? 'Close' : 'Dismiss'}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
});

const tfmStyles = StyleSheet.create({
  receiptOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    // Above the chart footer/order ticket actions without blocking the screen.
    zIndex: 10050,
    elevation: 10050,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 328,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    direction: 'ltr',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 14,
  },
  receiptSideTile: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptSideText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  receiptCopy: {
    flex: 1,
    minWidth: 0,
  },
  receiptSymbol: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  receiptVolume: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
  },
  receiptDoneButton: {
    width: 62,
    minHeight: 44,
    flexShrink: 0,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptDoneText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,6,16,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    // Above chart sheet/host so feedback never forces a WebView Modal remount.
    zIndex: 10050,
    elevation: 10050,
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
