import { FastPressable as Pressable } from '../../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { useLiveSymbolQuote } from '../../../../query/websocket';
import { formatTradeVolume, type TradeVolumeBounds } from '../../../../utils/tradeVolume';
import type { TradeSide } from '../../../../domain/tradeSide';
import { getChartTradeAction } from '../../chartTradeActions';
import {
  resolveFooterLotChevronPressBehavior,
  resolveFooterLotChevronState,
} from '../../chartTradeInteractionUtils';
import { resolveChartTradeButtonQuote } from './quoteFallback';
import { baseStyles, darkStyles, lightStyles, textBaseStyles } from './styles';
import { useTradeHandler, type TradeFeedback } from './useTradeHandler';

type FooterLotPickerMode = 'absolute' | 'increase' | 'decrease';

const LOT_ADJUST_HIT_SLOP = { top: 8, bottom: 8, left: 6, right: 6 } as const;
const LOT_VALUE_HIT_SLOP = { top: 8, bottom: 8, left: 0, right: 0 } as const;
const TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS = 80;

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
  active?: boolean;
  fallbackBid?: number | null;
  fallbackAsk?: number | null;
  isDark: boolean;
  buyColor: string;
  sellColor: string;
};

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
  active = true,
  fallbackBid,
  fallbackAsk,
  isDark,
  buyColor,
  sellColor,
}: ChartTradeButtonsProps) {
  const latestQuote = useLiveSymbolQuote(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS);
  const { bid: latestBid, ask: latestAsk } = resolveChartTradeButtonQuote({
    liveBid: latestQuote?.bid,
    liveAsk: latestQuote?.ask,
    fallbackBid,
    fallbackAsk,
  });
  const hasLiveBid = latestBid > 0;
  const hasLiveAsk = latestAsk > 0;
  const formattedBid = hasLiveBid ? latestBid.toFixed(displayDecimals) : '---';
  const formattedAsk = hasLiveAsk ? latestAsk.toFixed(displayDecimals) : '---';
  const formattedLotSize = formatTradeVolume(lotSize, volumeBounds);
  const hasLotValueEditor = typeof onEditLot === 'function';
  const lotEditorAction = hasLotValueEditor ? onEditLot : undefined;
  const lotPickerAction = typeof onOpenLotEditor === 'function' ? onOpenLotEditor : undefined;
  const decreaseLotPressBehavior = resolveFooterLotChevronPressBehavior({
    hasStepAction: typeof onDecreaseLot === 'function',
    hasLotPickerAction: typeof lotPickerAction === 'function',
  });
  const increaseLotPressBehavior = resolveFooterLotChevronPressBehavior({
    hasStepAction: typeof onIncreaseLot === 'function',
    hasLotPickerAction: typeof lotPickerAction === 'function',
  });
  const { canDecreaseLot, canIncreaseLot } = resolveFooterLotChevronState({
    lotSize,
    bounds: volumeBounds,
    hasDecreaseAction: decreaseLotPressBehavior !== 'none',
    hasIncreaseAction: increaseLotPressBehavior !== 'none',
  });
  const canOpenDecreaseLotPicker = decreaseLotPressBehavior === 'picker' && typeof lotPickerAction === 'function';
  const canOpenIncreaseLotPicker = increaseLotPressBehavior === 'picker' && typeof lotPickerAction === 'function';
  const canUseDecreaseLotControl = canOpenDecreaseLotPicker || canDecreaseLot;
  const canUseIncreaseLotControl = canOpenIncreaseLotPicker || canIncreaseLot;
  const handleLotCenterPress = lotEditorAction ?? (lotPickerAction ? () => lotPickerAction('absolute') : undefined);
  const handleLotCenterLongPress = lotPickerAction ? () => lotPickerAction('absolute') : undefined;
  const handleDecreaseLotPress = React.useMemo(() => {
    if (!canUseDecreaseLotControl) return undefined;
    if (decreaseLotPressBehavior === 'step') return onDecreaseLot;
    if (decreaseLotPressBehavior === 'picker' && lotPickerAction) {
      return () => lotPickerAction('decrease');
    }
    return undefined;
  }, [canUseDecreaseLotControl, decreaseLotPressBehavior, lotPickerAction, onDecreaseLot]);
  const handleIncreaseLotPress = React.useMemo(() => {
    if (!canUseIncreaseLotControl) return undefined;
    if (increaseLotPressBehavior === 'step') return onIncreaseLot;
    if (increaseLotPressBehavior === 'picker' && lotPickerAction) {
      return () => lotPickerAction('increase');
    }
    return undefined;
  }, [canUseIncreaseLotControl, increaseLotPressBehavior, lotPickerAction, onIncreaseLot]);

  const {
    handleTrade,
    isChartTradeActionBusy,
    isChartTradeActionVisuallyLocked,
    chartTradeActionDisabled,
    isCurrentChartSymbol,
    isPending,
  } = useTradeHandler({
    symbol,
    variant,
    comment,
    lotSize,
    latestBid,
    latestAsk,
    onTradeResult,
  });

  const themeStyles = isDark ? darkStyles : lightStyles;
  const sellAction = getChartTradeAction('sell');
  const buyAction = getChartTradeAction('buy');
  const lotDisplayValue = (
    <Text style={[textBaseStyles.actionLotValue, baseStyles.actionLotDisplayGhost, themeStyles.actionLotValue]} numberOfLines={1}>
      {formattedLotSize}
    </Text>
  );
  const lotControl = (
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
          (!canUseIncreaseLotControl || isPending || !isCurrentChartSymbol) && baseStyles.actionLotAdjustButtonDisabled,
        ]}
        onPress={handleIncreaseLotPress}
        disabled={!canUseIncreaseLotControl || isPending || !isCurrentChartSymbol}
        accessibilityState={{ disabled: !canUseIncreaseLotControl || isPending || !isCurrentChartSymbol }}
        accessibilityLabel="Increase lot"
        testID="chart-trade-lot-increase-button"
        hitSlop={LOT_ADJUST_HIT_SLOP}
      >
        <Ionicons
          name="chevron-up"
          size={12}
          style={[
            themeStyles.actionLotAdjustIcon,
            { marginLeft: 4 },
            (!canUseIncreaseLotControl || isPending || !isCurrentChartSymbol) && themeStyles.actionLotAdjustIconDisabled,
            !isLotEditing && baseStyles.actionLotUnderlayIconHidden,
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
          hitSlop={LOT_VALUE_HIT_SLOP}
          unstable_pressDelay={0}
          accessibilityLabel="Edit lot"
          accessibilityValue={{ text: formattedLotSize }}
          testID="chart-trade-lot-edit-button"
        >
          {lotDisplayValue}
        </Pressable>
      ) : (
        <View style={baseStyles.actionLotPill}>
          {lotDisplayValue}
        </View>
      )}
      <Pressable
        style={[
          baseStyles.actionLotAdjustButton,
          (!canUseDecreaseLotControl || isPending || !isCurrentChartSymbol) && baseStyles.actionLotAdjustButtonDisabled,
        ]}
        onPress={handleDecreaseLotPress}
        disabled={!canUseDecreaseLotControl || isPending || !isCurrentChartSymbol}
        accessibilityState={{ disabled: !canUseDecreaseLotControl || isPending || !isCurrentChartSymbol }}
        accessibilityLabel="Decrease lot"
        testID="chart-trade-lot-decrease-button"
        hitSlop={LOT_ADJUST_HIT_SLOP}
      >
        <Ionicons
          name="chevron-down"
          size={12}
          style={[
            themeStyles.actionLotAdjustIcon,
            { marginRight: 4 },
            (!canUseDecreaseLotControl || isPending || !isCurrentChartSymbol) && themeStyles.actionLotAdjustIconDisabled,
            !isLotEditing && baseStyles.actionLotUnderlayIconHidden,
          ]}
        />
      </Pressable>
    </View>
  );

  if (variant === 'mt5-market') {
    return (
      <View style={baseStyles.chartTradeMarketActionRow}>
        <Pressable
          style={[
            baseStyles.chartTradeMarketActionButton,
            { backgroundColor: sellColor },
            isChartTradeActionVisuallyLocked('sell') && baseStyles.chartTradeMarketActionButtonBusy,
          ]}
          disabled={chartTradeActionDisabled}
          accessibilityState={{ disabled: chartTradeActionDisabled, busy: isChartTradeActionBusy('sell') }}
          onPressIn={() => handleTrade('sell')}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={sellAction.marketAccessibilityLabel}
          testID={sellAction.marketTestID}
        >
          {isChartTradeActionBusy('sell') ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={baseStyles.chartTradeMarketActionTitle}>{sellAction.marketLabel}</Text>
              <Text style={baseStyles.chartTradeMarketActionMeta}>
                {formattedLotSize} Lots · {formattedBid}
              </Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[
            baseStyles.chartTradeMarketActionButton,
            { backgroundColor: buyColor },
            isChartTradeActionVisuallyLocked('buy') && baseStyles.chartTradeMarketActionButtonBusy,
          ]}
          disabled={chartTradeActionDisabled}
          accessibilityState={{ disabled: chartTradeActionDisabled, busy: isChartTradeActionBusy('buy') }}
          onPressIn={() => handleTrade('buy')}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={buyAction.marketAccessibilityLabel}
          testID={buyAction.marketTestID}
        >
          {isChartTradeActionBusy('buy') ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={baseStyles.chartTradeMarketActionTitle}>{buyAction.marketLabel}</Text>
              <Text style={baseStyles.chartTradeMarketActionMeta}>
                {formattedLotSize} Lots · {formattedAsk}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={baseStyles.tradeControlsRow}>
      <View style={[baseStyles.actionButtonSlot, { backgroundColor: sellColor }]}>
        <Pressable
          style={[
            baseStyles.actionBtn,
            { backgroundColor: sellColor, borderWidth: 0, shadowColor: sellColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8, elevation: 0 },
            isChartTradeActionVisuallyLocked('sell') && { opacity: 0.5 },
          ]}
          disabled={chartTradeActionDisabled}
          accessibilityState={{ disabled: chartTradeActionDisabled, busy: isChartTradeActionBusy('sell') }}
          onPressIn={() => handleTrade('sell')}
          accessibilityRole="button"
          accessibilityLabel={sellAction.accessibilityLabel}
          testID={sellAction.testID}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>{sellAction.displayLabel}</Text>
          </View>
          <Text style={baseStyles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>
            {formattedBid}
          </Text>
        </Pressable>
      </View>

      <View style={[baseStyles.actionLotSlot, themeStyles.actionLotSlot]}>
        {lotControl}
        {!isLotEditing ? (
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={baseStyles.actionLotCommittedOverlay}
          >
            <View style={baseStyles.actionLotCommittedIconBox}>
              <Ionicons
                name="chevron-up"
                size={12}
                style={[
                  themeStyles.actionLotAdjustIcon,
                  (!canUseIncreaseLotControl || isPending || !isCurrentChartSymbol) && themeStyles.actionLotAdjustIconDisabled,
                ]}
              />
            </View>
            <Text
              style={[textBaseStyles.actionLotValue, baseStyles.actionLotCommittedValue, themeStyles.actionLotValue]}
              numberOfLines={1}
            >
              {formattedLotSize}
            </Text>
            <View style={baseStyles.actionLotCommittedIconBox}>
              <Ionicons
                name="chevron-down"
                size={12}
                style={[
                  themeStyles.actionLotAdjustIcon,
                  (!canUseDecreaseLotControl || isPending || !isCurrentChartSymbol) && themeStyles.actionLotAdjustIconDisabled,
                ]}
              />
            </View>
          </View>
        ) : null}
      </View>

      <View style={[baseStyles.actionButtonSlot, { backgroundColor: buyColor }]}>
        <Pressable
          style={[
            baseStyles.actionBtn,
            { backgroundColor: buyColor, borderWidth: 0, shadowColor: buyColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8, elevation: 0 },
            isChartTradeActionVisuallyLocked('buy') && { opacity: 0.5 },
          ]}
          disabled={chartTradeActionDisabled}
          accessibilityState={{ disabled: chartTradeActionDisabled, busy: isChartTradeActionBusy('buy') }}
          onPressIn={() => handleTrade('buy')}
          accessibilityRole="button"
          accessibilityLabel={buyAction.accessibilityLabel}
          testID={buyAction.testID}
        >
          <View style={baseStyles.actionBtnHeader}>
            <Text style={baseStyles.actionBtnLabelTitle}>{buyAction.displayLabel}</Text>
          </View>
          <Text style={baseStyles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>
            {formattedAsk}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});
