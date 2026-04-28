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
import type { TradeSide } from '../../../domain/tradeSide';
import { buildChartMarketOrderPayload, getChartTradeAction } from '../chartTradeActions';
import { resolveFooterLotChevronState } from '../chartTradeInteractionUtils';

type FooterLotPickerMode = 'absolute' | 'increase' | 'decrease';

type TradeFeedback = {
  visible: boolean;
  type: 'success' | 'error';
  title?: string;
  message?: string;
  side?: TradeSide;
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
  onDecreaseLot?: () => void;
  onIncreaseLot?: () => void;
  variant?: 'compact' | 'mt5-market';
  isDark: boolean;
  buyColor: string;
  sellColor: string;
};

const CHART_TRADE_TAP_RELEASE_DELAY_MS = 350;

let chartTradeButtonSharedLockSide: TradeSide | null = null;
let chartTradeButtonSharedLockReleaseTimer: ReturnType<typeof setTimeout> | null = null;

const acquireChartTradeButtonSharedLock = (side: TradeSide) => {
  if (chartTradeButtonSharedLockSide !== null) {
    return false;
  }
  if (chartTradeButtonSharedLockReleaseTimer) {
    clearTimeout(chartTradeButtonSharedLockReleaseTimer);
    chartTradeButtonSharedLockReleaseTimer = null;
  }
  chartTradeButtonSharedLockSide = side;
  return true;
};

const releaseChartTradeButtonSharedLock = (side: TradeSide, delayMs = 0) => {
  if (chartTradeButtonSharedLockSide !== side) {
    return;
  }
  if (chartTradeButtonSharedLockReleaseTimer) {
    clearTimeout(chartTradeButtonSharedLockReleaseTimer);
    chartTradeButtonSharedLockReleaseTimer = null;
  }
  if (delayMs > 0) {
    chartTradeButtonSharedLockReleaseTimer = setTimeout(() => {
      if (chartTradeButtonSharedLockSide === side) {
        chartTradeButtonSharedLockSide = null;
      }
      chartTradeButtonSharedLockReleaseTimer = null;
    }, delayMs);
    return;
  }
  chartTradeButtonSharedLockSide = null;
};

const baseStyles = StyleSheet.create({
  chartTradeMarketActionRow: {
    flexDirection: 'row',
    direction: 'ltr',
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
    direction: 'ltr',
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
  const currentChartSymbol = useUserPreferences((s) => s.chartSymbol);
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();
  const [activeSide, setActiveSide] = React.useState<TradeSide | null>(null);
  const activeSideResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tradeTapLockRef = React.useRef(false);
  const tradeTapLockSideRef = React.useRef<TradeSide | null>(null);
  const themeStyles = isDark ? darkStyles : lightStyles;
  const sellAction = getChartTradeAction('sell');
  const buyAction = getChartTradeAction('buy');
  const isCurrentChartSymbol = currentChartSymbol === symbol;

  React.useEffect(() => () => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }
    tradeTapLockRef.current = false;
    if (tradeTapLockSideRef.current) {
      releaseChartTradeButtonSharedLock(tradeTapLockSideRef.current);
      tradeTapLockSideRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }
    setActiveSide(null);
    tradeTapLockRef.current = false;
    if (tradeTapLockSideRef.current) {
      releaseChartTradeButtonSharedLock(tradeTapLockSideRef.current);
      tradeTapLockSideRef.current = null;
    }
  }, [symbol]);

  const markActiveTradeSide = (side: TradeSide) => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
    }
    setActiveSide(side);
    activeSideResetTimeoutRef.current = setTimeout(() => {
      setActiveSide((currentSide) => (currentSide === side ? null : currentSide));
      activeSideResetTimeoutRef.current = null;
    }, 800);
  };

  const handleTrade = (side: TradeSide) => {
    const action = getChartTradeAction(side);
    const stateChartSymbol = useUserPreferences.getState().chartSymbol;
    if (stateChartSymbol !== symbol) {
      console.log('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        currentChartSymbol: stateChartSymbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        reason: 'stale-symbol',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const sharedLockSide = chartTradeButtonSharedLockSide;
    if (tradeTapLockRef.current || sharedLockSide !== null || isPending) {
      console.log('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        lockSide: sharedLockSide,
        reason: tradeTapLockRef.current ? 'tap-lock' : sharedLockSide !== null ? 'shared-tap-lock' : 'mutation-pending',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (!acquireChartTradeButtonSharedLock(action.side)) {
      console.log('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        lockSide: chartTradeButtonSharedLockSide,
        reason: 'shared-tap-lock',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    tradeTapLockRef.current = true;
    tradeTapLockSideRef.current = action.side;
    const releaseTradeTapLock = (delayMs = 0) => {
      const lockedSide = tradeTapLockSideRef.current;
      tradeTapLockRef.current = false;
      tradeTapLockSideRef.current = null;
      if (lockedSide) {
        releaseChartTradeButtonSharedLock(lockedSide, delayMs);
      }
    };
    markActiveTradeSide(action.side);
    const volume = Number(lotSize);
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    const authState = useUserPreferences.getState();
    const authToken = authState.accountDetails?.credentials?.accessToken;
    const tradingLogin = resolveTradingLogin();

    console.log('[TRADE-BUTTON-PRESS]', {
      side,
      buttonPressed: action.buttonPressed,
      symbol,
      displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
      sidePassedToHandler: action.side,
      timestamp: new Date().toISOString(),
    });

    if (!authToken) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Sign In Required',
        message: 'Please sign in to your trading account before placing orders.',
        side: action.side,
      });
      releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      return;
    }

    if (!tradingLogin) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'No Trading Account',
        message: 'No active trading account is selected. Open the account menu and choose one, then try again.',
        side: action.side,
      });
      releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      return;
    }

    if (!Number.isFinite(volume) || volume <= 0) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Invalid Lot Size',
        message: `Volume must be greater than 0. Current: ${lotSize}`,
        side: action.side,
      });
      releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      return;
    }

    if (oneClickAccepted) {
      console.log('[Trade] one-click path, login=', tradingLogin);
      const payload = buildChartMarketOrderPayload({
        accountLogin: tradingLogin,
        symbol,
        side: action.side,
        volume,
        comment: trimmedComment,
      });
      console.log('[TRADE-PAYLOAD]', {
        symbol: payload.symbol,
        side: payload.side,
        action: payload.side,
        orderType: action.orderType,
        command: payload.side,
        tradeType: action.orderType,
        volume,
        priceSource: action.priceSource,
        rawPayload: payload,
      });

      placeOrder(
        payload,
        {
          onSuccess: (data: any) => {
            console.log('[TRADE-RESPONSE]', {
              requestSide: action.side,
              result: data?.status ?? 'success',
              backendSide: data?.side ?? null,
              rawResponse: data,
            });
            const ticket = data?.position_ticket || data?.order_ticket || data?.ticket || 'Confirmed';
            const execPrice = action.side === 'buy' ? latestAsk : latestBid;
            onTradeResult?.({
              visible: true,
              type: 'success',
              side: action.side,
              symbol,
              ticket: String(ticket),
              price: execPrice,
              volume,
              executedAt: new Date().toLocaleTimeString(),
            });
            releaseTradeTapLock();
          },
          onError: (err: any) => {
            const feedback = classifyTradingError(err, { action: 'place-order' });
            console.warn('[TRADE-RESPONSE]', {
              requestSide: action.side,
              result: 'error',
              backendSide: err?.response?.data?.side ?? err?.data?.side ?? null,
              rawResponse: err?.response?.data ?? err?.data ?? err,
            });
            console.warn('[Trade] error', feedback.kind, feedback.title, '|', feedback.detail ?? feedback.message);
            onTradeResult?.({
              visible: true,
              type: 'error',
              title: feedback.title,
              message: feedback.message,
              side: action.side,
            });
            releaseTradeTapLock();
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
            side: action.side,
            ...(trimmedComment ? { comment: trimmedComment } : {}),
          },
        });
        releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      } catch (navErr: any) {
        console.warn('[Trade] navigation failed', navErr);
        onTradeResult?.({
          visible: true,
          type: 'error',
          title: 'Navigation Error',
          message: navErr?.message || 'Could not open the order ticket screen.',
          side: action.side,
        });
        releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
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
            (!isCurrentChartSymbol || activeSide === 'sell' || (isPending && !activeSide)) && baseStyles.chartTradeMarketActionButtonBusy,
          ]}
          disabled={isPending || !isCurrentChartSymbol}
          onPress={() => handleTrade('sell')}
          accessibilityRole="button"
          accessibilityLabel={sellAction.marketAccessibilityLabel}
          testID={sellAction.marketTestID}
        >
          {activeSide === 'sell' && isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={baseStyles.chartTradeMarketActionTitle}>{sellAction.marketLabel}</Text>
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
            (!isCurrentChartSymbol || activeSide === 'buy' || (isPending && !activeSide)) && baseStyles.chartTradeMarketActionButtonBusy,
          ]}
          disabled={isPending || !isCurrentChartSymbol}
          onPress={() => handleTrade('buy')}
          accessibilityRole="button"
          accessibilityLabel={buyAction.marketAccessibilityLabel}
          testID={buyAction.marketTestID}
        >
          {activeSide === 'buy' && isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={baseStyles.chartTradeMarketActionTitle}>{buyAction.marketLabel}</Text>
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
            (!isCurrentChartSymbol || activeSide === 'sell' || (isPending && !activeSide)) && { opacity: 0.5 },
          ]}
          disabled={isPending || !isCurrentChartSymbol}
          onPress={() => handleTrade('sell')}
          accessibilityRole="button"
          accessibilityLabel={sellAction.accessibilityLabel}
          testID={sellAction.testID}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>{sellAction.displayLabel}</Text>
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
              (!canDecreaseLot || isPending || !isCurrentChartSymbol) && baseStyles.actionLotAdjustButtonDisabled,
            ]}
            onPress={handleDecreaseLotPress}
            disabled={!canDecreaseLot || isPending || !isCurrentChartSymbol}
            accessibilityState={{ disabled: !canDecreaseLot || isPending || !isCurrentChartSymbol }}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-down"
              size={16}
              style={[
                themeStyles.actionLotAdjustIcon,
                (!canDecreaseLot || isPending || !isCurrentChartSymbol) && themeStyles.actionLotAdjustIconDisabled,
              ]}
            />
          </Pressable>
          {isLotEditing ? (
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
                caretHidden={false}
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
              disabled={isPending || !isCurrentChartSymbol || typeof handleLotCenterPress !== 'function'}
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
              (!canIncreaseLot || isPending || !isCurrentChartSymbol) && baseStyles.actionLotAdjustButtonDisabled,
            ]}
            onPress={handleIncreaseLotPress}
            disabled={!canIncreaseLot || isPending || !isCurrentChartSymbol}
            accessibilityState={{ disabled: !canIncreaseLot || isPending || !isCurrentChartSymbol }}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-up"
              size={16}
              style={[
                themeStyles.actionLotAdjustIcon,
                (!canIncreaseLot || isPending || !isCurrentChartSymbol) && themeStyles.actionLotAdjustIconDisabled,
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
            (!isCurrentChartSymbol || activeSide === 'buy' || (isPending && !activeSide)) && { opacity: 0.5 },
          ]}
          disabled={isPending || !isCurrentChartSymbol}
          onPress={() => handleTrade('buy')}
          accessibilityRole="button"
          accessibilityLabel={buyAction.accessibilityLabel}
          testID={buyAction.testID}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>{buyAction.displayLabel}</Text>
          </View>
          <Text style={baseStyles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>
            {(latestAsk || 0).toFixed(displayDecimals)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});
