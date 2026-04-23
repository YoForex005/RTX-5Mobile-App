import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { CHART_ORDER_TYPES, type ChartOrderType, isPendingChartOrderType } from '../chartTradeOrderUtils';

const FOOTER_LOT_PICKER_BASE_OFFSET = 54;

type ChartTradeTypeTabLayout = { x: number; width: number };

type TradeFeatureComponents = {
  LiveQuotePairHeader: React.ComponentType<any>;
  LiveTradeButtons: React.ComponentType<any>;
  PendingOrderPreviewChart: React.ComponentType<any>;
  ChartTradeVolumeSlider: React.ComponentType<any>;
  ChartFooterLotPicker: React.ComponentType<any>;
};

type ChartTradeSheetContentProps = {
  components: TradeFeatureComponents;
  styles: any;
  isDark: boolean;
  colors: {
    blue: string;
    textMuted: string;
    sellPrimary: string;
  };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  handlers: any;
  tabs: {
    scrollRef?: React.RefObject<ScrollView | null>;
    onViewportLayout: (width: number) => void;
    onTabLayout: (orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => void;
  };
  sheetScrollRef?: React.RefObject<ScrollView | null>;
};

function ChartTradeSheetContent({
  components,
  styles,
  isDark,
  colors,
  symbolHeader,
  sheet,
  handlers,
  tabs,
  sheetScrollRef,
}: ChartTradeSheetContentProps) {
  const {
    LiveQuotePairHeader,
    LiveTradeButtons,
    PendingOrderPreviewChart,
    ChartTradeVolumeSlider,
  } = components;
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;

  return (
    <>
      {sheet.showChartTradeSheetHeader ? (
        <View
          style={[
            styles.chartTradeSheetHeader,
            useMtPendingTradeSheetLayout && styles.chartTradeSheetHeaderPending,
          ]}
        >
          <Pressable
            style={styles.chartTradeSheetSymbolBlock}
            onPress={handlers.onOpenSymbolPicker}
            unstable_pressDelay={0}
          >
            <View style={styles.chartTradeSheetSymbolRow}>
              <Text style={styles.chartTradeSheetSymbolText} numberOfLines={1} adjustsFontSizeToFit>
                {symbolHeader.displaySymbol}
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </View>
            <Text style={styles.chartTradeSheetSymbolMeta} numberOfLines={1} adjustsFontSizeToFit>
              {symbolHeader.symbolName}
            </Text>
          </Pressable>
          <LiveQuotePairHeader
            bid={symbolHeader.chartBid}
            ask={symbolHeader.chartAsk}
            changePct={symbolHeader.changePct}
            styles={styles}
            displayDecimals={symbolHeader.displayDecimals}
          />
        </View>
      ) : null}

      <ScrollView
        ref={tabs.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={[
          styles.chartTradeTypeTabsScroll,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsScrollPending,
        ]}
        onLayout={(event) => {
          tabs.onViewportLayout(event.nativeEvent.layout.width);
        }}
        contentContainerStyle={[
          styles.chartTradeTypeTabs,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsPending,
        ]}
      >
        {CHART_ORDER_TYPES.map((option) => {
          const active = option === sheet.chartTradeOrderType;
          return (
            <Pressable
              key={option}
              onLayout={(event) => {
                tabs.onTabLayout(option, {
                  x: event.nativeEvent.layout.x,
                  width: event.nativeEvent.layout.width,
                });
              }}
              style={[
                styles.chartTradeTypeTab,
                useMtPendingTradeSheetLayout && styles.chartTradeTypeTabPending,
                active && styles.chartTradeTypeTabActive,
                useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabPendingActive,
              ]}
              onPress={() => handlers.onSelectOrderType(option)}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeTypeTabText,
                  useMtPendingTradeSheetLayout && styles.chartTradeTypeTabTextPending,
                  active && styles.chartTradeTypeTabTextActive,
                  useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                ]}
                numberOfLines={1}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
        <Pressable
          style={styles.chartTradeVolumeCard}
          onPress={handlers.onOpenVolumeStepper}
          unstable_pressDelay={0}
        >
          <View style={styles.chartTradeVolumeSide}>
            <Text style={styles.chartTradeCardLabel}>Volume</Text>
            <View style={styles.chartTradeVolumeValueGroup}>
              <Text style={styles.chartTradeCardValue}>
                {sheet.passiveLotDisplay}
              </Text>
              <Pressable
                style={styles.chartTradeStepperLaunchButton}
                onPress={(event) => {
                  event.stopPropagation?.();
                  handlers.onOpenVolumeStepper();
                }}
                hitSlop={8}
                unstable_pressDelay={0}
              >
                <View style={styles.chartTradeStepperLaunchIconStack}>
                  <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </View>
          <View style={styles.chartTradeVolumeDivider} />
          <View style={styles.chartTradeVolumeUnitSide}>
            <Text style={styles.chartTradeCardValue}>Lots</Text>
            <Pressable
              style={styles.chartTradeStepperLaunchButton}
              onPress={(event) => {
                event.stopPropagation?.();
                handlers.onOpenVolumeStepper();
              }}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </Pressable>

        <ChartTradeVolumeSlider
          styles={styles}
          value={sheet.tradeVolume}
          bounds={sheet.tradeVolumeBounds}
          onChange={handlers.onChangeTradeVolume}
        />

        <View style={[styles.chartTradeMetaRow, useMtPendingTradeSheetLayout && styles.chartTradeMetaRowPending]}>
          <Text style={styles.chartTradeMetaLink}>Margin <Text style={styles.chartTradeMetaText}>≈ {sheet.chartTradeMarginEstimate} {sheet.accountCurrency}</Text></Text>
          <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
            Free: {sheet.accountFreeMargin} {sheet.accountCurrency}
          </Text>
        </View>

        {isPendingChartOrderType(sheet.chartTradeOrderType) ? (
          <Pressable
            style={[
              styles.chartTradePriceCard,
              styles.chartTradePriceCardPending,
              useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
            ]}
            onPress={handlers.onOpenPriceStepper}
            unstable_pressDelay={0}
          >
            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>Price</Text>
            <View style={styles.chartTradeVolumeValueGroup}>
              <Text
                style={[
                  styles.chartTradePriceInput,
                  styles.chartTradePriceInputPending,
                  useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                ]}
              >
                {sheet.chartTradePrice > 0
                  ? sheet.chartTradePrice.toFixed(symbolHeader.displayDecimals)
                  : (sheet.chartBid > 0 ? sheet.chartBid.toFixed(symbolHeader.displayDecimals) : '--')}
              </Text>
              <Pressable
                style={[
                  styles.chartTradeStepperLaunchButton,
                  useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                ]}
                onPress={(event) => {
                  event.stopPropagation?.();
                  handlers.onOpenPriceStepper();
                }}
                hitSlop={8}
                unstable_pressDelay={0}
              >
                <View style={styles.chartTradeStepperLaunchIconStack}>
                  <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </Pressable>
        ) : null}

        {sheet.isStopLimitChartOrder ? (
          <Pressable
            style={[
              styles.chartTradePriceCard,
              styles.chartTradePriceCardPending,
              useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
            ]}
            onPress={handlers.onOpenStopLimitPriceStepper}
            unstable_pressDelay={0}
          >
            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>
              Stop Limit Price
            </Text>
            <View style={styles.chartTradeVolumeValueGroup}>
              <Text
                style={[
                  styles.chartTradePriceInput,
                  styles.chartTradePriceInputPending,
                  useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                ]}
              >
                {sheet.chartTradeStopLimitPrice > 0 ? sheet.chartTradeStopLimitPrice.toFixed(symbolHeader.displayDecimals) : '--'}
              </Text>
              <Pressable
                style={[
                  styles.chartTradeStepperLaunchButton,
                  useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                ]}
                onPress={(event) => {
                  event.stopPropagation?.();
                  handlers.onOpenStopLimitPriceStepper();
                }}
                hitSlop={8}
                unstable_pressDelay={0}
              >
                <View style={styles.chartTradeStepperLaunchIconStack}>
                  <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.chartTradeStopButton, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonPending]}
          onPress={handlers.onEnableStops}
          unstable_pressDelay={0}
        >
          <Text style={[styles.chartTradeStopButtonText, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonTextPending]}>
            {sheet.chartTradeSlEnabled || sheet.chartTradeTpEnabled ? 'Edit Stop Levels' : 'Add Stop Levels'}
          </Text>
        </Pressable>

        {sheet.chartTradeSlEnabled || sheet.chartTradeTpEnabled ? (
          <View style={styles.chartTradeStopsBlock}>
            <View style={styles.chartTradeStopUnitRow}>
              {sheet.chartTradeStopUnitOptions.map((unit: any) => {
                const active = sheet.chartTradeStopUnit === unit.key;
                return (
                  <Pressable
                    key={unit.key}
                    style={[styles.chartTradeStopUnitTab, active && styles.chartTradeStopUnitTabActive]}
                    onPress={() => handlers.onSelectStopUnit(unit.key)}
                    unstable_pressDelay={0}
                  >
                    <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{unit.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.chartTradeStopPairRow}>
              <Pressable
                style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardSl]}
                onPress={handlers.onOpenSlStepper}
                unstable_pressDelay={0}
              >
                <View style={styles.chartTradeStopPairSwatchSl} />
                <Text style={styles.chartTradeStopPairLabel}>S/L</Text>
                {sheet.chartTradeSlEnabled ? (
                  <Text style={styles.chartTradeStopPairValue}>{sheet.chartTradeSlPrice.toFixed(symbolHeader.displayDecimals)}</Text>
                ) : null}
                {sheet.chartTradeStopUnit === 'Pips' ? (
                  <Pressable
                    hitSlop={8}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      handlers.onToggleSlLock();
                    }}
                    style={styles.chartTradeStopPairLock}
                    unstable_pressDelay={0}
                  >
                    <Ionicons
                      name={sheet.chartTradeSlLocked ? 'lock-closed' : 'lock-open-outline'}
                      size={16}
                      color={sheet.chartTradeSlLocked ? colors.blue : colors.textMuted}
                    />
                  </Pressable>
                ) : null}
              </Pressable>
              <View style={styles.chartTradeStopPairDivider} />
              <Pressable
                style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardTp]}
                onPress={handlers.onOpenTpStepper}
                unstable_pressDelay={0}
              >
                <View style={styles.chartTradeStopPairSwatchTp} />
                <Text style={styles.chartTradeStopPairLabel}>T/P</Text>
                {sheet.chartTradeTpEnabled ? (
                  <Text style={styles.chartTradeStopPairValue}>{sheet.chartTradeTpPrice.toFixed(symbolHeader.displayDecimals)}</Text>
                ) : null}
                {sheet.chartTradeStopUnit === 'Pips' ? (
                  <Pressable
                    hitSlop={8}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      handlers.onToggleTpLock();
                    }}
                    style={styles.chartTradeStopPairLock}
                    unstable_pressDelay={0}
                  >
                    <Ionicons
                      name={sheet.chartTradeTpLocked ? 'lock-closed' : 'lock-open-outline'}
                      size={16}
                      color={sheet.chartTradeTpLocked ? colors.blue : colors.textMuted}
                    />
                  </Pressable>
                ) : null}
              </Pressable>
            </View>
          </View>
        ) : null}

        {sheet.showChartTradeExpiration ? (
          <Pressable
            style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
            onPress={handlers.onOpenExpirationMenu}
            unstable_pressDelay={0}
          >
            <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>Expiration:</Text>
            <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{sheet.chartTradeExpiration}</Text>
            <Ionicons name="swap-vertical" size={12} color={colors.blue} />
          </Pressable>
        ) : null}

        {sheet.showChartTradeComment ? (
          <View style={[styles.chartTradeCommentBlock, useMtPendingTradeSheetLayout && styles.chartTradeCommentBlockPending]}>
            {sheet.chartTradeCommentFocused && !sheet.showFloatingChartTradeCommentEditor ? (
              <View style={styles.chartTradeCommentEditorInlineRow}>
                <View style={styles.chartTradeCommentEditorInlineInputWrap}>
                  <TextInput
                    ref={sheet.chartTradeCommentInputRef}
                    style={styles.chartTradeCommentEditorInlineInput}
                    value={sheet.chartTradeComment}
                    onChangeText={handlers.onChangeComment}
                    onBlur={handlers.onBlurComment}
                    placeholder='Comment'
                    placeholderTextColor='#94A3B8'
                    maxLength={31}
                    multiline={false}
                    returnKeyType='done'
                    onSubmitEditing={handlers.onSubmitComment}
                  />
                </View>
                <Pressable
                  onPressIn={handlers.onPrepareCommentSubmit}
                  style={[
                    styles.chartTradeCommentEditorInlineSubmit,
                    !sheet.chartTradeComment.trim() && styles.chartTradeCommentEditorSubmitDisabled,
                  ]}
                  disabled={!sheet.chartTradeComment.trim()}
                  onPress={handlers.onSubmitComment}
                >
                  <Ionicons
                    name='checkmark'
                    size={20}
                    color={sheet.chartTradeComment.trim() ? colors.blue : '#94A3B8'}
                  />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.chartTradeInfoRow,
                  useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending,
                  sheet.chartTradeCommentFocused && styles.chartTradeCommentInfoRowActive,
                ]}
                onPress={handlers.onFocusComment}
                unstable_pressDelay={0}
              >
                <Text
                  style={[
                    styles.chartTradeInfoLabel,
                    useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending,
                    styles.chartTradeCommentInlineLabel,
                  ]}
                >
                  Comment:
                </Text>
                <Text
                  style={[
                    styles.chartTradeCommentInlineValue,
                    !sheet.chartTradeComment.trim() && styles.chartTradeCommentInlinePlaceholder,
                    useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending,
                    sheet.chartTradeCommentFocused && styles.chartTradeCommentInlineValueActive,
                  ]}
                  numberOfLines={1}
                >
                  {sheet.chartTradeComment.trim() || 'Add comment'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {sheet.chartTradeOrderType === 'Market Execution' ? (
          <>
            <LiveTradeButtons
              symbol={sheet.chartSymbol}
              displayDecimals={symbolHeader.displayDecimals}
              lotSize={sheet.tradeVolume}
              volumeBounds={sheet.tradeVolumeBounds}
              comment={sheet.chartTradeComment}
              variant='mt5-market'
              onTradeResult={sheet.onTradeResult}
              isDark={isDark}
              buyColor={colors.blue}
              sellColor={colors.sellPrimary}
            />
            <PendingOrderPreviewChart
              styles={styles}
              candles={sheet.candles}
              bid={sheet.chartBid}
              ask={sheet.chartAsk}
              entryPrice={sheet.chartTradeEntryPrice}
              entryLabel="Price"
              stopLimitPriceEnabled={false}
              stopLimitPrice={sheet.chartTradeStopLimitPrice}
              stopLossEnabled={sheet.chartTradeSlEnabled}
              stopLossPrice={sheet.chartTradeSlPrice}
              takeProfitEnabled={sheet.chartTradeTpEnabled}
              takeProfitPrice={sheet.chartTradeTpPrice}
              displayDecimals={symbolHeader.displayDecimals}
              buyColor={colors.blue}
              sellColor={colors.sellPrimary}
            />
          </>
        ) : (
          <>
            <Pressable
              style={[
                styles.chartTradePlaceButton,
                sheet.disablePendingTradePlaceButton
                  ? styles.chartTradePlaceButtonDisabled
                  : { backgroundColor: sheet.chartTradeCtaColor },
              ]}
              onPress={sheet.disablePendingTradePlaceButton ? undefined : handlers.onSubmitPendingTrade}
              disabled={sheet.disablePendingTradePlaceButton}
            >
              <Text
                style={[
                  styles.chartTradePlaceButtonText,
                  sheet.disablePendingTradePlaceButton && styles.chartTradePlaceButtonTextDisabled,
                ]}
                numberOfLines={1}
              >
                {`Place ${sheet.chartTradeOrderType}`}
              </Text>
            </Pressable>
            <PendingOrderPreviewChart
              styles={styles}
              candles={sheet.candles}
              bid={sheet.chartBid}
              ask={sheet.chartAsk}
              entryPrice={sheet.chartTradeEntryPrice}
              entryLabel={sheet.chartTradeOrderType.toUpperCase()}
              stopLimitPriceEnabled={sheet.isStopLimitChartOrder}
              stopLimitPrice={sheet.chartTradeStopLimitPrice}
              stopLossEnabled={sheet.chartTradeSlEnabled}
              stopLossPrice={sheet.chartTradeSlPrice}
              takeProfitEnabled={sheet.chartTradeTpEnabled}
              takeProfitPrice={sheet.chartTradeTpPrice}
              displayDecimals={symbolHeader.displayDecimals}
              buyColor={colors.blue}
              sellColor={colors.sellPrimary}
            />
          </>
        )}
      </View>
    </>
  );
}

/**
 * Pinned header rendered OUTSIDE the ScrollView so it never scrolls away.
 * Contains: symbol selector + bid/ask quote + order type tabs.
 */
function ChartTradeSheetPinnedHeader({
  styles,
  colors,
  symbolHeader,
  sheet,
  handlers,
  tabs,
  components,
}: {
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  handlers: any;
  tabs: {
    scrollRef?: React.RefObject<ScrollView | null>;
    onViewportLayout: (width: number) => void;
    onTabLayout: (orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => void;
  };
  components: TradeFeatureComponents;
}) {
  const { LiveQuotePairHeader } = components;
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;

  return (
    <>
      {/* Symbol header row */}
      <View
        style={[
          styles.chartTradeSheetHeader,
          useMtPendingTradeSheetLayout && styles.chartTradeSheetHeaderPending,
        ]}
      >
        <Pressable
          style={styles.chartTradeSheetSymbolBlock}
          onPress={handlers.onOpenSymbolPicker}
          unstable_pressDelay={0}
        >
          <View style={styles.chartTradeSheetSymbolRow}>
            <Text style={styles.chartTradeSheetSymbolText} numberOfLines={1} adjustsFontSizeToFit>
              {symbolHeader.displaySymbol}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </View>
          <Text style={styles.chartTradeSheetSymbolMeta} numberOfLines={1} adjustsFontSizeToFit>
            {symbolHeader.symbolName}
          </Text>
        </Pressable>
        <LiveQuotePairHeader
          bid={symbolHeader.chartBid}
          ask={symbolHeader.chartAsk}
          changePct={symbolHeader.changePct}
          styles={styles}
          displayDecimals={symbolHeader.displayDecimals}
        />
      </View>

      {/* Order type tabs row */}
      <ScrollView
        ref={tabs.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={[
          styles.chartTradeTypeTabsScroll,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsScrollPending,
        ]}
        onLayout={(event) => {
          tabs.onViewportLayout(event.nativeEvent.layout.width);
        }}
        contentContainerStyle={[
          styles.chartTradeTypeTabs,
          useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsPending,
        ]}
      >
        {CHART_ORDER_TYPES.map((option) => {
          const active = option === sheet.chartTradeOrderType;
          return (
            <Pressable
              key={option}
              onLayout={(event) => {
                tabs.onTabLayout(option, {
                  x: event.nativeEvent.layout.x,
                  width: event.nativeEvent.layout.width,
                });
              }}
              style={[
                styles.chartTradeTypeTab,
                useMtPendingTradeSheetLayout && styles.chartTradeTypeTabPending,
                active && styles.chartTradeTypeTabActive,
                useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabPendingActive,
              ]}
              onPress={() => handlers.onSelectOrderType(option)}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeTypeTabText,
                  useMtPendingTradeSheetLayout && styles.chartTradeTypeTabTextPending,
                  active && styles.chartTradeTypeTabTextActive,
                  useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                ]}
                numberOfLines={1}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

/**
 * Body content rendered INSIDE the ScrollView — everything below symbol header and tabs.
 */
function ChartTradeSheetBody({
  components,
  styles,
  isDark,
  colors,
  symbolHeader,
  sheet,
  handlers,
}: {
  components: TradeFeatureComponents;
  styles: any;
  isDark: boolean;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  handlers: any;
}) {
  const {
    LiveTradeButtons,
    PendingOrderPreviewChart,
    ChartTradeVolumeSlider,
  } = components;
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;

  return (
    <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
      <Pressable
        style={[styles.chartTradeVolumeCard, useMtPendingTradeSheetLayout && styles.chartTradeVolumeCardPending]}
        onPress={handlers.onOpenVolumeStepper}
        unstable_pressDelay={0}
      >
        <View style={[styles.chartTradeVolumeSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeSidePending]}>
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>Volume</Text>
          <View style={styles.chartTradeVolumeValueGroup}>
            <Text style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}>
              {sheet.passiveLotDisplay}
            </Text>
            <Pressable
              style={[
                styles.chartTradeStepperLaunchButton,
                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
              ]}
              onPress={(event) => {
                event.stopPropagation?.();
                handlers.onOpenVolumeStepper();
              }}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </View>
        <View style={styles.chartTradeVolumeDivider} />
        <View style={[styles.chartTradeVolumeUnitSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeUnitSidePending]}>
          <Text style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}>Lots</Text>
          <Pressable
            style={[
              styles.chartTradeStepperLaunchButton,
              useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
            ]}
            onPress={(event) => {
              event.stopPropagation?.();
              handlers.onOpenVolumeStepper();
            }}
            hitSlop={8}
            unstable_pressDelay={0}
          >
            <View style={styles.chartTradeStepperLaunchIconStack}>
              <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>
      </Pressable>

      <ChartTradeVolumeSlider
        styles={styles}
        value={sheet.tradeVolume}
        bounds={sheet.tradeVolumeBounds}
        onChange={handlers.onChangeTradeVolume}
      />

      <View style={[styles.chartTradeMetaRow, useMtPendingTradeSheetLayout && styles.chartTradeMetaRowPending]}>
        <Text style={styles.chartTradeMetaLink}>Margin <Text style={styles.chartTradeMetaText}>≈ {sheet.chartTradeMarginEstimate} {sheet.accountCurrency}</Text></Text>
        <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
          Free: {sheet.accountFreeMargin} {sheet.accountCurrency}
        </Text>
      </View>

      {isPendingChartOrderType(sheet.chartTradeOrderType) ? (
        <Pressable
          style={[
            styles.chartTradePriceCard,
            styles.chartTradePriceCardPending,
            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
          ]}
          onPress={handlers.onOpenPriceStepper}
          unstable_pressDelay={0}
        >
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>Price</Text>
          <View style={styles.chartTradeVolumeValueGroup}>
            <Text
              style={[
                styles.chartTradePriceInput,
                styles.chartTradePriceInputPending,
                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
              ]}
            >
              {sheet.chartTradePrice > 0
                ? sheet.chartTradePrice.toFixed(symbolHeader.displayDecimals)
                : (sheet.chartBid > 0 ? sheet.chartBid.toFixed(symbolHeader.displayDecimals) : '--')}
            </Text>
            <Pressable
              style={[
                styles.chartTradeStepperLaunchButton,
                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
              ]}
              onPress={(event) => {
                event.stopPropagation?.();
                handlers.onOpenPriceStepper();
              }}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      {sheet.isStopLimitChartOrder ? (
        <Pressable
          style={[
            styles.chartTradePriceCard,
            styles.chartTradePriceCardPending,
            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
          ]}
          onPress={handlers.onOpenStopLimitPriceStepper}
          unstable_pressDelay={0}
        >
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>
            Stop Limit Price
          </Text>
          <View style={styles.chartTradeVolumeValueGroup}>
            <Text
              style={[
                styles.chartTradePriceInput,
                styles.chartTradePriceInputPending,
                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
              ]}
            >
              {sheet.chartTradeStopLimitPrice > 0 ? sheet.chartTradeStopLimitPrice.toFixed(symbolHeader.displayDecimals) : '--'}
            </Text>
            <Pressable
              style={[
                styles.chartTradeStepperLaunchButton,
                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
              ]}
              onPress={(event) => {
                event.stopPropagation?.();
                handlers.onOpenStopLimitPriceStepper();
              }}
              hitSlop={8}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      <Pressable
        style={[styles.chartTradeStopButton, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonPending]}
        onPress={handlers.onEnableStops}
        unstable_pressDelay={0}
      >
        <Text style={[styles.chartTradeStopButtonText, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonTextPending]}>
          {sheet.chartTradeSlEnabled || sheet.chartTradeTpEnabled ? 'Edit Stop Levels' : 'Add Stop Levels'}
        </Text>
      </Pressable>

      {sheet.chartTradeSlEnabled || sheet.chartTradeTpEnabled ? (
        <View style={styles.chartTradeStopsBlock}>
          <View style={styles.chartTradeStopUnitRow}>
            {sheet.chartTradeStopUnitOptions.map((unit: any) => {
              const active = sheet.chartTradeStopUnit === unit.key;
              return (
                <Pressable
                  key={unit.key}
                  style={[styles.chartTradeStopUnitTab, active && styles.chartTradeStopUnitTabActive]}
                  onPress={() => handlers.onSelectStopUnit(unit.key)}
                  unstable_pressDelay={0}
                >
                  <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{unit.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chartTradeStopPairRow}>
            <Pressable
              style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardSl]}
              onPress={handlers.onOpenSlStepper}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStopPairSwatchSl} />
              <Text style={styles.chartTradeStopPairLabel}>S/L</Text>
              {sheet.chartTradeSlEnabled ? (
                <Text style={styles.chartTradeStopPairValue}>{sheet.chartTradeSlPrice.toFixed(symbolHeader.displayDecimals)}</Text>
              ) : null}
              {sheet.chartTradeStopUnit === 'Pips' ? (
                <Pressable
                  hitSlop={8}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    handlers.onToggleSlLock();
                  }}
                  style={styles.chartTradeStopPairLock}
                  unstable_pressDelay={0}
                >
                  <Ionicons
                    name={sheet.chartTradeSlLocked ? 'lock-closed' : 'lock-open-outline'}
                    size={16}
                    color={sheet.chartTradeSlLocked ? colors.blue : colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </Pressable>
            <View style={styles.chartTradeStopPairDivider} />
            <Pressable
              style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardTp]}
              onPress={handlers.onOpenTpStepper}
              unstable_pressDelay={0}
            >
              <View style={styles.chartTradeStopPairSwatchTp} />
              <Text style={styles.chartTradeStopPairLabel}>T/P</Text>
              {sheet.chartTradeTpEnabled ? (
                <Text style={styles.chartTradeStopPairValue}>{sheet.chartTradeTpPrice.toFixed(symbolHeader.displayDecimals)}</Text>
              ) : null}
              {sheet.chartTradeStopUnit === 'Pips' ? (
                <Pressable
                  hitSlop={8}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    handlers.onToggleTpLock();
                  }}
                  style={styles.chartTradeStopPairLock}
                  unstable_pressDelay={0}
                >
                  <Ionicons
                    name={sheet.chartTradeTpLocked ? 'lock-closed' : 'lock-open-outline'}
                    size={16}
                    color={sheet.chartTradeTpLocked ? colors.blue : colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      {sheet.showChartTradeExpiration ? (
        <Pressable
          style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
          onPress={handlers.onOpenExpirationMenu}
          unstable_pressDelay={0}
        >
          <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>Expiration:</Text>
          <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{sheet.chartTradeExpiration}</Text>
          <Ionicons name="swap-vertical" size={12} color={colors.blue} />
        </Pressable>
      ) : null}

      {sheet.showChartTradeComment ? (
        <View style={[styles.chartTradeCommentBlock, useMtPendingTradeSheetLayout && styles.chartTradeCommentBlockPending]}>
          {sheet.chartTradeCommentFocused && !sheet.showFloatingChartTradeCommentEditor ? (
            <View style={styles.chartTradeCommentEditorInlineRow}>
              <View style={styles.chartTradeCommentEditorInlineInputWrap}>
                <TextInput
                  ref={sheet.chartTradeCommentInputRef}
                  style={styles.chartTradeCommentEditorInlineInput}
                  value={sheet.chartTradeComment}
                  onChangeText={handlers.onChangeComment}
                  onBlur={handlers.onBlurComment}
                  placeholder='Comment'
                  placeholderTextColor='#94A3B8'
                  maxLength={31}
                  multiline={false}
                  returnKeyType='done'
                  onSubmitEditing={handlers.onSubmitComment}
                />
              </View>
              <Pressable
                onPressIn={handlers.onPrepareCommentSubmit}
                style={[
                  styles.chartTradeCommentEditorInlineSubmit,
                  !sheet.chartTradeComment.trim() && styles.chartTradeCommentEditorSubmitDisabled,
                ]}
                disabled={!sheet.chartTradeComment.trim()}
                onPress={handlers.onSubmitComment}
              >
                <Ionicons
                  name='checkmark'
                  size={20}
                  color={sheet.chartTradeComment.trim() ? colors.blue : '#94A3B8'}
                />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[
                styles.chartTradeInfoRow,
                useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending,
                sheet.chartTradeCommentFocused && styles.chartTradeCommentInfoRowActive,
              ]}
              onPress={handlers.onFocusComment}
              unstable_pressDelay={0}
            >
              <Text
                style={[
                  styles.chartTradeInfoLabel,
                  useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending,
                  styles.chartTradeCommentInlineLabel,
                ]}
              >
                Comment:
              </Text>
              <Text
                style={[
                  styles.chartTradeCommentInlineValue,
                  !sheet.chartTradeComment.trim() && styles.chartTradeCommentInlinePlaceholder,
                  useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending,
                  sheet.chartTradeCommentFocused && styles.chartTradeCommentInlineValueActive,
                ]}
                numberOfLines={1}
              >
                {sheet.chartTradeComment.trim() || 'Add comment'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {sheet.chartTradeOrderType === 'Market Execution' ? (
        <>
          <LiveTradeButtons
            symbol={sheet.chartSymbol}
            displayDecimals={symbolHeader.displayDecimals}
            lotSize={sheet.tradeVolume}
            volumeBounds={sheet.tradeVolumeBounds}
            comment={sheet.chartTradeComment}
            variant='mt5-market'
            onTradeResult={sheet.onTradeResult}
            isDark={isDark}
            buyColor={colors.blue}
            sellColor={colors.sellPrimary}
          />
          <PendingOrderPreviewChart
            styles={styles}
              candles={sheet.candles}
              bid={sheet.chartBid}
              ask={sheet.chartAsk}
              entryPrice={sheet.chartTradeEntryPrice}
              entryLabel="Price"
              stopLimitPriceEnabled={false}
              stopLimitPrice={sheet.chartTradeStopLimitPrice}
            stopLossEnabled={sheet.chartTradeSlEnabled}
            stopLossPrice={sheet.chartTradeSlPrice}
            takeProfitEnabled={sheet.chartTradeTpEnabled}
            takeProfitPrice={sheet.chartTradeTpPrice}
            displayDecimals={symbolHeader.displayDecimals}
            buyColor={colors.blue}
            sellColor={colors.sellPrimary}
          />
        </>
      ) : (
        <>
          <Pressable
            style={[
              styles.chartTradePlaceButton,
              sheet.disablePendingTradePlaceButton
                ? styles.chartTradePlaceButtonDisabled
                : { backgroundColor: sheet.chartTradeCtaColor },
            ]}
            onPress={sheet.disablePendingTradePlaceButton ? undefined : handlers.onSubmitPendingTrade}
            disabled={sheet.disablePendingTradePlaceButton}
          >
            <Text
              style={[
                styles.chartTradePlaceButtonText,
                sheet.disablePendingTradePlaceButton && styles.chartTradePlaceButtonTextDisabled,
              ]}
              numberOfLines={1}
            >
              {`Place ${sheet.chartTradeOrderType}`}
            </Text>
          </Pressable>
          <PendingOrderPreviewChart
            styles={styles}
              candles={sheet.candles}
              bid={sheet.chartBid}
              ask={sheet.chartAsk}
              entryPrice={sheet.chartTradeEntryPrice}
              entryLabel={sheet.chartTradeOrderType.toUpperCase()}
              stopLimitPriceEnabled={sheet.isStopLimitChartOrder}
              stopLimitPrice={sheet.chartTradeStopLimitPrice}
            stopLossEnabled={sheet.chartTradeSlEnabled}
            stopLossPrice={sheet.chartTradeSlPrice}
            takeProfitEnabled={sheet.chartTradeTpEnabled}
            takeProfitPrice={sheet.chartTradeTpPrice}
            displayDecimals={symbolHeader.displayDecimals}
            buyColor={colors.blue}
            sellColor={colors.sellPrimary}
          />
        </>
      )}
    </View>
  );
}

type ChartTradeOverlayLayerProps = {
  components: TradeFeatureComponents;
  styles: any;
  isDark: boolean;
  colors: {
    blue: string;
    textMuted: string;
    sellPrimary: string;
  };
  symbolHeader: {
    displaySymbol: string;
    symbolName: string;
    chartBid: number;
    chartAsk: number;
    changePct?: number | null;
    displayDecimals: number;
  };
  sheet: any;
  footer: any;
  handlers: any;
};

export function ChartTradeOverlayLayer({
  components,
  styles,
  isDark,
  colors,
  symbolHeader,
  sheet,
  footer,
  handlers,
}: ChartTradeOverlayLayerProps) {
  const {
    LiveTradeButtons,
    ChartFooterLotPicker,
  } = components;

  return (
    <>
      {sheet.showChartTradeSheet ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.chartTradeSheetLayer,
            sheet.chartTradeSheetFrozenLayerHeight > 0 && { height: sheet.chartTradeSheetFrozenLayerHeight },
          ]}
        >
          <Animated.View
            style={[
              styles.chartTradeSheetFrame,
              styles.chartTradeSheetOverlayFrame,
              { height: sheet.chartTradeSheetMaxHeight },
              sheet.chartTradeSheetAnimatedStyle,
            ]}
          >
            <GestureDetector gesture={sheet.chartTradeSheetDragGesture}>
              <View
                style={[
                  styles.chartTradeSheet,
                  styles.chartTradeSheetInline,
                  styles.chartTradeSheetInlineFloating,
                  sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
                ]}
              >
              {sheet.showChartTradeSheetHeader ? (
                  <View
                    style={[
                      styles.chartTradeSheetDragRegion,
                      sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetDragRegionPending,
                    ]}
                  >
                    <Pressable
                      style={styles.chartTradeSheetHandleWrap}
                      onPress={handlers.onToggleSheetMode}
                      unstable_pressDelay={0}
                    >
                      <View style={styles.chartTradeSheetHandle} />
                    </Pressable>
                    <View style={[styles.chartTradeQuickBar, styles.chartTradeQuickBarActionsOnly]}>
                      <View style={styles.chartTradeQuickActions}>
                        <Pressable
                          style={[
                            styles.chartTradeQuickChip,
                            styles.chartTradeQuickChipSl,
                            sheet.chartTradeSlEnabled && styles.chartTradeQuickChipSlActive,
                          ]}
                          onPress={() => handlers.onToggleStopLevel('sl')}
                          unstable_pressDelay={0}
                        >
                          <Text
                            style={[
                              styles.chartTradeQuickChipText,
                              sheet.chartTradeSlEnabled && styles.chartTradeQuickChipTextActive,
                            ]}
                          >
                            SL
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.chartTradeQuickChip,
                            styles.chartTradeQuickChipTp,
                            sheet.chartTradeTpEnabled && styles.chartTradeQuickChipTpActive,
                          ]}
                          onPress={() => handlers.onToggleStopLevel('tp')}
                          unstable_pressDelay={0}
                        >
                          <Text
                            style={[
                              styles.chartTradeQuickChipText,
                              sheet.chartTradeTpEnabled && styles.chartTradeQuickChipTextActive,
                            ]}
                          >
                            TP
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.chartTradeQuickExpandButton}
                          onPress={handlers.onToggleSheetMode}
                          unstable_pressDelay={0}
                        >
                          <Ionicons
                            name={sheet.chartTradeSheetMode === 'expanded' ? 'chevron-down' : 'arrow-forward'}
                            size={20}
                            color={colors.blue}
                          />
                        </Pressable>
                      </View>
                    </View>
                  </View>
              ) : null}

              {/* Pinned symbol header — always visible, never scrolls away */}
              <ChartTradeSheetPinnedHeader
                styles={styles}
                colors={colors}
                symbolHeader={symbolHeader}
                sheet={sheet}
                handlers={handlers}
                tabs={{
                  scrollRef: sheet.chartTradeTypeTabsOverlayScrollRef,
                  onViewportLayout: handlers.onOverlayTabsViewportLayout,
                  onTabLayout: handlers.onOverlayTabLayout,
                }}
                components={components}
              />

              <ScrollView
                ref={sheet.chartTradeSheetScrollRef}
                style={styles.chartTradeSheetContentScroll}
                contentContainerStyle={[
                  styles.chartTradeSheetContent,
                  { paddingBottom: sheet.chartTradeSheetContentBottomPadding },
                ]}
                nestedScrollEnabled
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps={sheet.chartTradeCommentFocused ? 'always' : 'handled'}
                keyboardDismissMode={sheet.chartTradeCommentFocused ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                scrollEventThrottle={16}
                onScroll={(event) => {
                  handlers.onTradeSheetScroll(event.nativeEvent.contentOffset.y);
                }}
              >
                <ChartTradeSheetBody
                  components={components}
                  styles={styles}
                  isDark={isDark}
                  colors={colors}
                  symbolHeader={symbolHeader}
                  sheet={sheet}
                  handlers={handlers}
                />
              </ScrollView>
              </View>
            </GestureDetector>
          </Animated.View>
        </View>
      ) : null}

      {sheet.showHiddenInlineTradeSheet ? (
        <Animated.View
          style={[
            { display: 'none' },
            styles.chartTradeSheetFrame,
            { height: sheet.chartTradeSheetMaxHeight },
            sheet.chartTradeSheetAnimatedStyle,
          ]}
        >
          <View
            style={[
              styles.chartTradeSheet,
              styles.chartTradeSheetInline,
              styles.chartTradeSheetInlineFloating,
              sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
            ]}
          >
            {sheet.showChartTradeSheetHeader ? (
              <GestureDetector gesture={sheet.chartTradeSheetDragGesture}>
                <View
                  style={[
                    styles.chartTradeSheetDragRegion,
                    sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetDragRegionPending,
                  ]}
                >
                  <Pressable
                    style={styles.chartTradeSheetHandleWrap}
                    onPress={handlers.onToggleSheetMode}
                    unstable_pressDelay={0}
                  >
                    <View style={styles.chartTradeSheetHandle} />
                  </Pressable>
                  <View style={[styles.chartTradeQuickBar, styles.chartTradeQuickBarActionsOnly]}>
                    <View style={styles.chartTradeQuickActions}>
                      <Pressable
                        style={[
                          styles.chartTradeQuickChip,
                          styles.chartTradeQuickChipSl,
                          sheet.chartTradeSlEnabled && styles.chartTradeQuickChipSlActive,
                        ]}
                        onPress={() => handlers.onToggleStopLevel('sl')}
                        unstable_pressDelay={0}
                      >
                        <Text
                          style={[
                            styles.chartTradeQuickChipText,
                            sheet.chartTradeSlEnabled && styles.chartTradeQuickChipTextActive,
                          ]}
                        >
                          SL
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.chartTradeQuickChip,
                          styles.chartTradeQuickChipTp,
                          sheet.chartTradeTpEnabled && styles.chartTradeQuickChipTpActive,
                        ]}
                        onPress={() => handlers.onToggleStopLevel('tp')}
                        unstable_pressDelay={0}
                      >
                        <Text
                          style={[
                            styles.chartTradeQuickChipText,
                            sheet.chartTradeTpEnabled && styles.chartTradeQuickChipTextActive,
                          ]}
                        >
                          TP
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.chartTradeQuickExpandButton}
                        onPress={handlers.onToggleSheetMode}
                        unstable_pressDelay={0}
                      >
                        <Ionicons
                          name={sheet.chartTradeSheetMode === 'expanded' ? 'chevron-down' : 'arrow-forward'}
                          size={20}
                          color={colors.blue}
                        />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </GestureDetector>
            ) : null}

            <ScrollView
              style={styles.chartTradeSheetContentScroll}
              contentContainerStyle={[
                styles.chartTradeSheetContent,
                { paddingBottom: sheet.chartTradeSheetContentBottomPadding },
              ]}
              nestedScrollEnabled
              bounces={false}
              keyboardShouldPersistTaps={sheet.chartTradeCommentFocused ? 'always' : 'handled'}
              keyboardDismissMode={sheet.chartTradeCommentFocused ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              scrollEventThrottle={16}
              onScroll={(event) => {
                handlers.onTradeSheetScroll(event.nativeEvent.contentOffset.y);
              }}
            >
              <ChartTradeSheetContent
                components={components}
                styles={styles}
                isDark={isDark}
                colors={colors}
                symbolHeader={symbolHeader}
                sheet={sheet}
                handlers={handlers}
                tabs={{
                  scrollRef: sheet.chartTradeTypeTabsInlineScrollRef,
                  onViewportLayout: handlers.onInlineTabsViewportLayout,
                  onTabLayout: handlers.onInlineTabLayout,
                }}
              />
            </ScrollView>
          </View>
        </Animated.View>
      ) : null}

      {footer.showFloatingFooterTradeRow ? (
        <View
          pointerEvents={footer.floatingFooterTradeRowVisible ? 'box-none' : 'none'}
          style={styles.footerTradeDockLayer}
        >
          <View
            style={[
              styles.footerTradeDock,
              {
                bottom: footer.footerTradeRowKeyboardOffset,
                opacity: footer.floatingFooterTradeRowVisible ? 1 : 0,
              },
            ]}
          >
            <LiveTradeButtons
              symbol={sheet.chartSymbol}
              displayDecimals={symbolHeader.displayDecimals}
              lotSize={sheet.tradeVolume}
              volumeBounds={sheet.tradeVolumeBounds}
              onTradeResult={sheet.onTradeResult}
              onEditLot={handlers.onEditLot}
              onOpenLotEditor={handlers.onOpenLotEditor}
              isLotEditing={footer.footerLotEditorFocused}
              lotDraft={footer.lotInput}
              lotInputRef={footer.footerLotEditorInputRef}
              onLotDraftChange={handlers.onLotDraftChange}
              onLotDraftBlur={handlers.onLotDraftBlur}
              onLotDraftEndEditing={handlers.onLotDraftEndEditing}
              onLotDraftSubmit={handlers.onLotDraftSubmit}
              onDecreaseLot={handlers.onDecreaseLot}
              onIncreaseLot={handlers.onIncreaseLot}
              isDark={isDark}
              buyColor={colors.blue}
              sellColor={colors.sellPrimary}
            />
          </View>
        </View>
      ) : null}

      {footer.showFooterLotPicker && !sheet.showChartTradeSheet ? (
        <ChartFooterLotPicker
          visible={footer.showFooterLotPicker}
          mode={footer.footerLotPickerMode ?? 'absolute'}
          value={sheet.tradeVolume}
          bounds={sheet.tradeVolumeBounds}
          bottomOffset={
            footer.floatingFooterTradeRowVisible
              ? footer.footerTradeRowKeyboardOffset + FOOTER_LOT_PICKER_BASE_OFFSET
              : FOOTER_LOT_PICKER_BASE_OFFSET
          }
          styles={styles}
          onClose={handlers.onCloseFooterLotPicker}
          onSelect={handlers.onSelectFooterLot}
        />
      ) : null}

    </>
  );
}

type ChartTradeInlineFooterProps = {
  LiveTradeButtons: React.ComponentType<any>;
  styles: any;
  animatedStyle: any;
  isDark: boolean;
  buyColor: string;
  sellColor: string;
  hideInlineTradeRow?: boolean;
  showFloatingFooterTradeRow: boolean;
  chartSymbol: string;
  displayDecimals: number;
  tradeVolume: number;
  tradeVolumeBounds: any;
  onTradeResult: (feedback: any) => void;
  onEditLot: () => void;
  onOpenLotEditor: (mode?: 'absolute' | 'increase' | 'decrease') => void;
  isLotEditing: boolean;
  lotDraft: string;
  lotInputRef: React.RefObject<TextInput | null>;
  onLotDraftChange: (text: string) => void;
  onLotDraftBlur: () => void;
  onLotDraftEndEditing: (event: any) => void;
  onLotDraftSubmit: (event?: any) => void;
  onDecreaseLot: () => void;
  onIncreaseLot: () => void;
};

export function ChartTradeInlineFooter({
  LiveTradeButtons,
  styles,
  animatedStyle,
  isDark,
  buyColor,
  sellColor,
  hideInlineTradeRow = false,
  showFloatingFooterTradeRow,
  chartSymbol,
  displayDecimals,
  tradeVolume,
  tradeVolumeBounds,
  onTradeResult,
  onEditLot,
  onOpenLotEditor,
  isLotEditing,
  lotDraft,
  lotInputRef,
  onLotDraftChange,
  onLotDraftBlur,
  onLotDraftEndEditing,
  onLotDraftSubmit,
  onDecreaseLot,
  onIncreaseLot,
}: ChartTradeInlineFooterProps) {
  return (
    <Animated.View style={[styles.bottomArea, animatedStyle]}>
      {!showFloatingFooterTradeRow && !hideInlineTradeRow ? (
        <LiveTradeButtons
          symbol={chartSymbol}
          displayDecimals={displayDecimals}
          lotSize={tradeVolume}
          volumeBounds={tradeVolumeBounds}
          onTradeResult={onTradeResult}
          onEditLot={onEditLot}
          onOpenLotEditor={onOpenLotEditor}
          isLotEditing={isLotEditing}
          lotDraft={lotDraft}
          lotInputRef={lotInputRef}
          onLotDraftChange={onLotDraftChange}
          onLotDraftBlur={onLotDraftBlur}
          onLotDraftEndEditing={onLotDraftEndEditing}
          onLotDraftSubmit={onLotDraftSubmit}
          onDecreaseLot={onDecreaseLot}
          onIncreaseLot={onIncreaseLot}
          isDark={isDark}
          buyColor={buyColor}
          sellColor={sellColor}
        />
      ) : null}
    </Animated.View>
  );
}
