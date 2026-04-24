import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { classifyTradingError } from '../../../api/tradingErrors';
import { useLiveTick } from '../../../hooks/useLiveCandles';
import { usePlaceOrderMutation } from '../../../query/orders';
import { resolveTradingLogin } from '../../../state/tradingLogin';
import { useUserPreferences } from '../../../state/userPreferences';
import {
  formatTradeVolume,
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';
import { resolveFooterLotChevronState } from '../chartTradeInteractionUtils';

type FooterLotPickerMode = 'absolute' | 'increase' | 'decrease';

type TradeFeedback = {
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
};

type ChartTradeButtonsProps = {
  symbol: string;
  displayDecimals: number;
  lotSize: number;
  volumeBounds?: TradeVolumeBounds;
  onTradeResult?: (feedback: TradeFeedback) => void;
  comment?: string;
  onEditLot?: () => void;
  onOpenLotEditor?: (mode?: FooterLotPickerMode) => void;
  isLotEditing?: boolean;
  lotDraft?: string;
  lotInputRef?: React.RefObject<TextInput | null>;
  onLotDraftChange?: (text: string) => void;
  onLotDraftBlur?: () => void;
  onLotDraftEndEditing?: (event: any) => void;
  onLotDraftSubmit?: (event?: any) => void;
  useExternalLotInput?: boolean;
  onDecreaseLot?: () => void;
  onIncreaseLot?: () => void;
  variant?: 'compact' | 'mt5-market';
  isDark: boolean;
  buyColor: string;
  sellColor: string;
};

const baseStyles = StyleSheet.create({
  chartTradeMarketActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  chartTradeMarketActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chartTradeMarketActionButtonBusy: {
    opacity: 0.5,
  },
  chartTradeMarketActionTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  chartTradeMarketActionMeta: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  tradeControlsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 0,
    gap: 4,
    paddingHorizontal: 0,
  },
  actionButtonSlot: {
    flex: 1,
    minWidth: 0,
  },
  actionBtn: {
    width: '100%',
    borderRadius: 2,
    minHeight: 40,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  actionLotSlot: {
    width: 116,
    minWidth: 112,
    maxWidth: 124,
    flexShrink: 0,
  },
  actionLotControl: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 42,
    borderRadius: 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionLotControlEditing: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563EB',
  },
  actionLotPill: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionLotAdjustButton: {
    width: 26,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLotAdjustButtonDisabled: {
    opacity: 0.35,
  },
  actionLotInputWrap: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  actionBtnHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 0,
  },
  actionBtnLabelTitle: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  actionBtnPriceText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
});

const lightStyles = StyleSheet.create({
  actionLotControl: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE7',
  },
  actionLotControlPicker: {
    borderColor: '#9DBCF7',
  },
  actionLotValue: {
    color: '#0F172A',
  },
  actionLotAdjustIcon: {
    color: '#475569',
  },
  actionLotAdjustIconDisabled: {
    color: '#94A3B8',
  },
  actionLotInput: {
    color: '#0F172A',
  },
});

const darkStyles = StyleSheet.create({
  actionLotControl: {
    backgroundColor: '#1F2937',
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  actionLotControlPicker: {
    borderColor: 'rgba(96, 165, 250, 0.55)',
  },
  actionLotValue: {
    color: '#F8FAFC',
  },
  actionLotAdjustIcon: {
    color: '#E2E8F0',
  },
  actionLotAdjustIconDisabled: {
    color: '#64748B',
  },
  actionLotInput: {
    color: '#F8FAFC',
  },
});

const textBaseStyles = StyleSheet.create({
  actionLotValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  actionLotInput: {
    width: '100%',
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    paddingVertical: 0,
  },
});

export const ChartTradeButtons = React.memo(function ChartTradeButtons({
  symbol,
  displayDecimals,
  lotSize,
  volumeBounds,
  onTradeResult,
  comment,
  onEditLot,
  onOpenLotEditor,
  isLotEditing = false,
  lotDraft = '',
  lotInputRef,
  onLotDraftChange,
  onLotDraftBlur,
  onLotDraftEndEditing,
  onLotDraftSubmit,
  useExternalLotInput = false,
  onDecreaseLot,
  onIncreaseLot,
  variant = 'compact',
  isDark,
  buyColor,
  sellColor,
}: ChartTradeButtonsProps) {
  const latestTick = useLiveTick(symbol);
  const latestClose = latestTick?.close ?? 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (symbol.includes('XAU') ? 0.3 : symbol.includes('BTC') ? 25 : 0.00015);
  const formattedLotSize = formatTradeVolume(lotSize, volumeBounds);
  const hasLotValueEditor = typeof onEditLot === 'function';
  const lotEditorAction = hasLotValueEditor ? onEditLot : undefined;
  const lotPickerAction = typeof onOpenLotEditor === 'function' ? onOpenLotEditor : undefined;
  const hasDecreaseLotAction = typeof onDecreaseLot === 'function' || typeof lotPickerAction === 'function';
  const hasIncreaseLotAction = typeof onIncreaseLot === 'function' || typeof lotPickerAction === 'function';
  const { canDecreaseLot, canIncreaseLot } = resolveFooterLotChevronState({
    lotSize,
    bounds: volumeBounds,
    hasLotPickerAction: typeof lotPickerAction === 'function',
    hasDecreaseAction: hasDecreaseLotAction,
    hasIncreaseAction: hasIncreaseLotAction,
  });
  const handleLotCenterPress = lotEditorAction ?? (lotPickerAction ? () => lotPickerAction('absolute') : undefined);
  const handleLotCenterLongPress = lotPickerAction ? () => lotPickerAction('absolute') : undefined;
  const handleDecreaseLotPress = canDecreaseLot
    ? (lotPickerAction ? () => lotPickerAction('decrease') : onDecreaseLot)
    : undefined;
  const handleIncreaseLotPress = canIncreaseLot
    ? (lotPickerAction ? () => lotPickerAction('increase') : onIncreaseLot)
    : undefined;

  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();
  const [activeSide, setActiveSide] = React.useState<'buy' | 'sell' | null>(null);
  const themeStyles = isDark ? darkStyles : lightStyles;

  const handleTrade = (side: 'buy' | 'sell') => {
    setActiveSide(side);
    setTimeout(() => setActiveSide(null), 800);
    const volume = Number(lotSize);
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    const authState = useUserPreferences.getState();
    const authToken = authState.accountDetails?.credentials?.accessToken;
    const tradingLogin = resolveTradingLogin();

    console.log('[Trade] tap', {
      side,
      symbol,
      oneClickAccepted,
      volume,
      isPending,
      hasAuthToken: !!authToken,
      tradingLogin,
    });

    if (!authToken) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Sign In Required',
        message: 'Please sign in to your trading account before placing orders.',
        side,
      });
      return;
    }

    if (!tradingLogin) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'No Trading Account',
        message: 'No active trading account is selected. Open the account menu and choose one, then try again.',
        side,
      });
      return;
    }

    if (!Number.isFinite(volume) || volume <= 0) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Invalid Lot Size',
        message: `Volume must be greater than 0. Current: ${lotSize}`,
        side,
      });
      return;
    }

    if (oneClickAccepted) {
      console.log('[Trade] one-click path, login=', tradingLogin);

      placeOrder(
        {
          account_login: tradingLogin,
          symbol,
          side,
          volume,
          ...(trimmedComment ? { comment: trimmedComment } : {}),
        },
        {
          onSuccess: (data: any) => {
            console.log('[Trade] success', data);
            const ticket = data?.position_ticket || data?.order_ticket || data?.ticket || 'Confirmed';
            const execPrice = side === 'buy' ? latestAsk : latestBid;
            onTradeResult?.({
              visible: true,
              type: 'success',
              side,
              symbol,
              ticket: String(ticket),
              price: execPrice,
              volume,
              executedAt: new Date().toLocaleTimeString(),
            });
          },
          onError: (err: any) => {
            const feedback = classifyTradingError(err, { action: 'place-order' });
            console.warn('[Trade] error', feedback.kind, feedback.title, '|', feedback.detail ?? feedback.message);
            onTradeResult?.({
              visible: true,
              type: 'error',
              title: feedback.title,
              message: feedback.message,
              side,
            });
          },
        },
      );
    } else {
      console.log('[Trade] navigate path → /trade/order-ticket');
      try {
        router.push({
          pathname: '/trade/order-ticket',
          params: {
            symbol,
            side,
            ...(trimmedComment ? { comment: trimmedComment } : {}),
          },
        });
      } catch (navErr: any) {
        console.warn('[Trade] navigation failed', navErr);
        onTradeResult?.({
          visible: true,
          type: 'error',
          title: 'Navigation Error',
          message: navErr?.message || 'Could not open the order ticket screen.',
          side,
        });
      }
    }
  };

  if (variant === 'mt5-market') {
    return (
      <View style={baseStyles.chartTradeMarketActionRow}>
        <Pressable
          style={[
            baseStyles.chartTradeMarketActionButton,
            { backgroundColor: sellColor },
            (activeSide === 'sell' || (isPending && !activeSide)) && baseStyles.chartTradeMarketActionButtonBusy,
          ]}
          disabled={isPending}
          onPress={() => handleTrade('sell')}
        >
          {activeSide === 'sell' && isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={baseStyles.chartTradeMarketActionTitle}>Sell by Market</Text>
              <Text style={baseStyles.chartTradeMarketActionMeta}>
                {formattedLotSize} Lots · {(latestBid || 0).toFixed(displayDecimals)}
              </Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[
            baseStyles.chartTradeMarketActionButton,
            { backgroundColor: buyColor },
            (activeSide === 'buy' || (isPending && !activeSide)) && baseStyles.chartTradeMarketActionButtonBusy,
          ]}
          disabled={isPending}
          onPress={() => handleTrade('buy')}
        >
          {activeSide === 'buy' && isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={baseStyles.chartTradeMarketActionTitle}>Buy by Market</Text>
              <Text style={baseStyles.chartTradeMarketActionMeta}>
                {formattedLotSize} Lots · {(latestAsk || 0).toFixed(displayDecimals)}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={baseStyles.tradeControlsRow}>
      <View style={baseStyles.actionButtonSlot}>
        <Pressable
          style={[
            baseStyles.actionBtn,
            { backgroundColor: sellColor, borderWidth: 0, shadowColor: sellColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8, elevation: 0 },
            (activeSide === 'sell' || (isPending && !activeSide)) && { opacity: 0.5 },
          ]}
          disabled={isPending}
          onPress={() => handleTrade('sell')}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>SELL</Text>
          </View>
          <Text style={baseStyles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>
            {(latestBid || 0).toFixed(displayDecimals)}
          </Text>
        </Pressable>
      </View>

      <View style={baseStyles.actionLotSlot}>
        <View
          style={[
            baseStyles.actionLotControl,
            themeStyles.actionLotControl,
            isLotEditing && baseStyles.actionLotControlEditing,
            typeof lotPickerAction === 'function' && themeStyles.actionLotControlPicker,
          ]}
        >
          <Pressable
            style={[
              baseStyles.actionLotAdjustButton,
              (!canDecreaseLot || isPending) && baseStyles.actionLotAdjustButtonDisabled,
            ]}
            onPress={handleDecreaseLotPress}
            disabled={!canDecreaseLot || isPending}
            accessibilityState={{ disabled: !canDecreaseLot || isPending }}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-down"
              size={16}
              style={[
                themeStyles.actionLotAdjustIcon,
                (!canDecreaseLot || isPending) && themeStyles.actionLotAdjustIconDisabled,
              ]}
            />
          </Pressable>
          {isLotEditing && useExternalLotInput ? (
            <Pressable
              style={baseStyles.actionLotPill}
              onPress={() => lotInputRef?.current?.focus()}
              disabled={isPending}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <Text style={[textBaseStyles.actionLotValue, themeStyles.actionLotValue]}>
                {lotDraft || formattedLotSize}
              </Text>
            </Pressable>
          ) : isLotEditing ? (
            <View style={baseStyles.actionLotInputWrap}>
              <TextInput
                ref={lotInputRef}
                style={[textBaseStyles.actionLotInput, themeStyles.actionLotInput]}
                value={lotDraft}
                onChangeText={onLotDraftChange}
                onBlur={onLotDraftBlur}
                onEndEditing={onLotDraftEndEditing}
                keyboardType="decimal-pad"
                returnKeyType="done"
                selectTextOnFocus
                autoFocus
                showSoftInputOnFocus
                onSubmitEditing={onLotDraftSubmit}
                placeholder={formattedLotSize}
                placeholderTextColor="#94A3B8"
              />
            </View>
          ) : hasLotValueEditor ? (
            <Pressable
              style={baseStyles.actionLotPill}
              onPress={handleLotCenterPress}
              onLongPress={handleLotCenterLongPress}
              delayLongPress={220}
              disabled={isPending || typeof handleLotCenterPress !== 'function'}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <Text style={[textBaseStyles.actionLotValue, themeStyles.actionLotValue]}>{formattedLotSize}</Text>
            </Pressable>
          ) : (
            <View style={baseStyles.actionLotPill}>
              <Text style={[textBaseStyles.actionLotValue, themeStyles.actionLotValue]}>{formattedLotSize}</Text>
            </View>
          )}
          <Pressable
            style={[
              baseStyles.actionLotAdjustButton,
              (!canIncreaseLot || isPending) && baseStyles.actionLotAdjustButtonDisabled,
            ]}
            onPress={handleIncreaseLotPress}
            disabled={!canIncreaseLot || isPending}
            accessibilityState={{ disabled: !canIncreaseLot || isPending }}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-up"
              size={16}
              style={[
                themeStyles.actionLotAdjustIcon,
                (!canIncreaseLot || isPending) && themeStyles.actionLotAdjustIconDisabled,
              ]}
            />
          </Pressable>
        </View>
      </View>

      <View style={baseStyles.actionButtonSlot}>
        <Pressable
          style={[
            baseStyles.actionBtn,
            { backgroundColor: buyColor, borderWidth: 0, shadowColor: buyColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8, elevation: 0 },
            (activeSide === 'buy' || (isPending && !activeSide)) && { opacity: 0.5 },
          ]}
          disabled={isPending}
          onPress={() => handleTrade('buy')}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>BUY</Text>
          </View>
          <Text style={baseStyles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>
            {(latestAsk || 0).toFixed(displayDecimals)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});
