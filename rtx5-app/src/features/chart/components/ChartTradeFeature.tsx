import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  type LayoutChangeEvent, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { CHART_ORDER_TYPES, type ChartOrderType, isPendingChartOrderType } from '../chartTradeOrderUtils';
import {
  resolveChartTradeSheetFrameHeight,
  resolveFooterTradeDockBottom,
  shouldRenderChartTradeSheetBody,
  shouldShowChartTradeSheetHandle,
  shouldShowChartTradeSheetMarketExecutionButtons,
} from '../chartTradeInteractionUtils';
import { LiveOrderTickExecutionGraph } from '../../trade/OrderTickExecutionGraph';
import { useTranslation } from '../../../i18n/useTranslation';

const FOOTER_LOT_PICKER_BASE_OFFSET = 54;

type ChartTradeTypeTabLayout = { x: number; width: number };

type TradeFeatureComponents = {
  LiveQuotePairHeader: React.ComponentType<any>;
  LiveTradeButtons: React.ComponentType<any>;
  PendingOrderPreviewChart: React.ComponentType<any>;
  ChartTradeVolumeSlider: React.ComponentType<any>;
  ChartFooterLotPicker: React.ComponentType<any>;
};

function ChartTradeSheetHeaderActions({
  styles,
  colors,
  sheet,
  handlers,
}: {
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  sheet: any;
  handlers: any;
}) {
  const slEnabled = !!sheet.chartTradeSlEnabled;
  const tpEnabled = !!sheet.chartTradeTpEnabled;
  return (
    <View style={styles.chartTradeQuickActions}>
      <Pressable
        style={[
          styles.chartTradeQuickChip,
          styles.chartTradeQuickChipSl,
          slEnabled && styles.chartTradeQuickChipSlActive,
        ]}
        onPress={() => handlers.onToggleStopLevel('sl')}
        unstable_pressDelay={0}
      >
        <Text style={[styles.chartTradeQuickChipText, slEnabled && styles.chartTradeQuickChipTextActive]}>
          SL
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.chartTradeQuickChip,
          styles.chartTradeQuickChipTp,
          tpEnabled && styles.chartTradeQuickChipTpActive,
        ]}
        onPress={() => handlers.onToggleStopLevel('tp')}
        unstable_pressDelay={0}
      >
        <Text style={[styles.chartTradeQuickChipText, tpEnabled && styles.chartTradeQuickChipTextActive]}>
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
  );
}

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

function ChartTradeVolumeSection({
  ChartTradeVolumeSlider,
  styles,
  colors,
  sheet,
  handlers,
  useMtPendingTradeSheetLayout,
}: {
  ChartTradeVolumeSlider: React.ComponentType<any>;
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  sheet: any;
  handlers: any;
  useMtPendingTradeSheetLayout: boolean;
}) {
  const { t } = useTranslation();
  const isMarginMode = sheet.chartTradeVolumeDisplayMode === 'margin';

  return (
    <>
      <View
        style={[styles.chartTradeVolumeCard, useMtPendingTradeSheetLayout && styles.chartTradeVolumeCardPending]}
      >
        <View style={[styles.chartTradeVolumeSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeSidePending]}>
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Volume')}</Text>
          <View style={styles.chartTradeVolumeValueGroup}>
            <TextInput
              style={[
                styles.chartTradeVolumeInput,
                useMtPendingTradeSheetLayout && styles.chartTradeVolumeInputPending,
              ]}
              value={sheet.chartTradeVolumeInputFocused ? sheet.chartTradeVolumeDraft : sheet.chartTradeVolumePrimaryDisplay}
              onFocus={handlers.onFocusTradeVolumeInput}
              onChangeText={handlers.onChangeTradeVolumeDraft}
              onBlur={handlers.onBlurTradeVolumeDraft}
              onEndEditing={handlers.onEndTradeVolumeDraft}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
              showSoftInputOnFocus
              onSubmitEditing={handlers.onSubmitTradeVolumeDraft}
              placeholder={sheet.passiveLotDisplay}
              placeholderTextColor="#94A3B8"
            />
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
              activateOnPressIn
            >
              <View style={styles.chartTradeStepperLaunchIconStack}>
                <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </View>
        <View style={styles.chartTradeVolumeDivider} />
        <Pressable
          style={[styles.chartTradeVolumeUnitSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeUnitSidePending]}
          onPress={(event) => {
            event.stopPropagation?.();
            handlers.onToggleTradeVolumeDisplayMode();
          }}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Text
            style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {t(sheet.chartTradeVolumeInputFocused ? 'Lots' : sheet.chartTradeVolumeModeLabel)}
          </Text>
          <View
            style={[
              styles.chartTradeStepperLaunchButton,
              useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
            ]}
          >
            <View style={styles.chartTradeStepperLaunchIconStack}>
              <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </View>
          </View>
        </Pressable>
      </View>

      <ChartTradeVolumeSlider
        styles={styles}
        value={sheet.tradeVolume}
        bounds={sheet.tradeVolumeBounds}
        onChange={handlers.onChangeTradeVolume}
      />

      <View style={[styles.chartTradeMetaRow, useMtPendingTradeSheetLayout && styles.chartTradeMetaRowPending]}>
        {isMarginMode ? (
          <Text
            style={[styles.chartTradeMetaText, styles.chartTradeMetaSummary, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}
            numberOfLines={1}
          >
            {t('Lots')}: <Text style={styles.chartTradeMetaSummaryValue}>{sheet.passiveLotDisplay}</Text>{'  '}
            {t('Max')}: <Text style={styles.chartTradeMetaSummaryValue}>{sheet.chartTradeMaxVolumeDisplay}</Text>
          </Text>
        ) : (
          <Text style={[styles.chartTradeMetaLink, useMtPendingTradeSheetLayout && styles.chartTradeMetaLinkPending]}>
            {t('Margin')} <Text style={styles.chartTradeMetaText}>≈ {sheet.chartTradeMarginEstimate} {sheet.accountCurrency}</Text>
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
            {t('Balance')}: {sheet.accountBalance} {sheet.accountCurrency}
          </Text>
          <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
            {t('Free')}: {sheet.accountFreeMargin} {sheet.accountCurrency}
          </Text>
        </View>
      </View>
    </>
  );
}

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
  const { t } = useTranslation();
  const {
    LiveTradeButtons,
    ChartTradeVolumeSlider,
  } = components;
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;
  const shouldShowMarketExecutionButtons = shouldShowChartTradeSheetMarketExecutionButtons({
    chartTradeOrderType: sheet.chartTradeOrderType,
    showInlineFooterWhileSheetOpen: !!sheet.showInlineFooterWhileSheetOpen,
  });

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
          <ChartTradeSheetHeaderActions
            styles={styles}
            colors={colors}
            sheet={sheet}
            handlers={handlers}
          />
        </View>
      ) : null}

      <ScrollView
        ref={tabs.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="always"
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
          const isMarketExecution = option === 'Market Execution';
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
                useMtPendingTradeSheetLayout && isMarketExecution && styles.chartTradeTypeTabPendingMarketExecution,
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
                  useMtPendingTradeSheetLayout
                  && isMarketExecution
                  && styles.chartTradeTypeTabTextPendingMarketExecution,
                  active && styles.chartTradeTypeTabTextActive,
                  useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                ]}
                numberOfLines={1}
              >
                {t(option)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
        <ChartTradeVolumeSection
          ChartTradeVolumeSlider={ChartTradeVolumeSlider}
          styles={styles}
          colors={colors}
          sheet={sheet}
          handlers={handlers}
          useMtPendingTradeSheetLayout={useMtPendingTradeSheetLayout}
        />

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
            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Price')}</Text>
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
              {t('Stop Limit Price')}
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
            {sheet.chartTradeSlEnabled || sheet.chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
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
                    <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{t(unit.label)}</Text>
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
            activateOnPressIn
            unstable_pressDelay={0}
          >
            <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>{t('Expiration')}:</Text>
            <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{t(sheet.chartTradeExpiration)}</Text>
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
                    autoFocus
                    showSoftInputOnFocus
                    style={styles.chartTradeCommentEditorInlineInput}
                    value={sheet.chartTradeComment}
                    onChangeText={handlers.onChangeComment}
                    onBlur={handlers.onBlurComment}
                    placeholder={t('Comment')}
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
                    size={16}
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
                  {t('Comment')}:
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
                  {sheet.chartTradeComment.trim() || t('Add comment')}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {sheet.chartTradeOrderType === 'Market Execution' ? (
          shouldShowMarketExecutionButtons ? (
            <LiveTradeButtons
              key={`chart-trade-sheet-market-${sheet.chartSymbol}`}
              symbol={sheet.chartSymbol}
              displayDecimals={symbolHeader.displayDecimals}
              lotSize={sheet.tradeVolume}
              volumeBounds={sheet.tradeVolumeBounds}
              comment={sheet.chartTradeComment}
              variant='mt5-market'
              onTradeResult={sheet.onTradeResult}
              fallbackBid={sheet.chartBid}
              fallbackAsk={sheet.chartAsk}
              isDark={isDark}
              buyColor={colors.blue}
              sellColor={colors.sellPrimary}
            />
          ) : null
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
                {`${t('Place')} ${t(sheet.chartTradeOrderType)}`}
              </Text>
            </Pressable>
          </>
        )}

        <LiveOrderTickExecutionGraph
          symbol={sheet.chartSymbol}
          bid={sheet.chartBid}
          ask={sheet.chartAsk}
          timestamp={sheet.chartTradeTickTimestamp}
          enabled={sheet.showChartTradeSheet}
          priceDecimals={symbolHeader.displayDecimals}
          bidColor="#2563EB"
          askColor="#EF4444"
          height={286}
          isDark={isDark}
        />
      </View>
    </>
  );
}

/**
 * Pinned header rendered OUTSIDE the ScrollView so it never scrolls away.
 * Contains: symbol selector + SL/TP shortcuts + order type tabs.
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
  const { t } = useTranslation();
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
        <ChartTradeSheetHeaderActions
          styles={styles}
          colors={colors}
          sheet={sheet}
          handlers={handlers}
        />
      </View>

      {/* Order type tabs row */}
      <ScrollView
        ref={tabs.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="always"
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
          const isMarketExecution = option === 'Market Execution';
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
                useMtPendingTradeSheetLayout && isMarketExecution && styles.chartTradeTypeTabPendingMarketExecution,
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
                  useMtPendingTradeSheetLayout
                  && isMarketExecution
                  && styles.chartTradeTypeTabTextPendingMarketExecution,
                  active && styles.chartTradeTypeTabTextActive,
                  useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                ]}
                numberOfLines={1}
              >
                {t(option)}
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
  const { t } = useTranslation();
  const {
    LiveTradeButtons,
    ChartTradeVolumeSlider,
  } = components;
  const useMtPendingTradeSheetLayout = sheet.useMtPendingTradeSheetLayout;
  const shouldShowMarketExecutionButtons = shouldShowChartTradeSheetMarketExecutionButtons({
    chartTradeOrderType: sheet.chartTradeOrderType,
    showInlineFooterWhileSheetOpen: !!sheet.showInlineFooterWhileSheetOpen,
  });

  return (
    <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
      <ChartTradeVolumeSection
        ChartTradeVolumeSlider={ChartTradeVolumeSlider}
        styles={styles}
        colors={colors}
        sheet={sheet}
        handlers={handlers}
        useMtPendingTradeSheetLayout={useMtPendingTradeSheetLayout}
      />

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
          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Price')}</Text>
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
            {t('Stop Limit Price')}
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
          {sheet.chartTradeSlEnabled || sheet.chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
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
                  <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{t(unit.label)}</Text>
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
          activateOnPressIn
          unstable_pressDelay={0}
        >
          <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>{t('Expiration')}:</Text>
          <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{t(sheet.chartTradeExpiration)}</Text>
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
                  autoFocus
                  showSoftInputOnFocus
                  style={styles.chartTradeCommentEditorInlineInput}
                  value={sheet.chartTradeComment}
                  onChangeText={handlers.onChangeComment}
                  onBlur={handlers.onBlurComment}
                  placeholder={t('Comment')}
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
                  size={16}
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
                {t('Comment')}:
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
                {sheet.chartTradeComment.trim() || t('Add comment')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {sheet.chartTradeOrderType === 'Market Execution' ? (
        shouldShowMarketExecutionButtons ? (
          <LiveTradeButtons
            key={`chart-trade-sheet-market-${sheet.chartSymbol}`}
            symbol={sheet.chartSymbol}
            displayDecimals={symbolHeader.displayDecimals}
            lotSize={sheet.tradeVolume}
            volumeBounds={sheet.tradeVolumeBounds}
            comment={sheet.chartTradeComment}
            variant='mt5-market'
            onTradeResult={sheet.onTradeResult}
            fallbackBid={sheet.chartBid}
            fallbackAsk={sheet.chartAsk}
            isDark={isDark}
            buyColor={colors.blue}
            sellColor={colors.sellPrimary}
          />
        ) : null
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
              {`${t('Place')} ${t(sheet.chartTradeOrderType)}`}
            </Text>
          </Pressable>
        </>
      )}

      <LiveOrderTickExecutionGraph
        symbol={sheet.chartSymbol}
        bid={sheet.chartBid}
        ask={sheet.chartAsk}
        timestamp={sheet.chartTradeTickTimestamp}
        enabled={sheet.showChartTradeSheet}
        priceDecimals={symbolHeader.displayDecimals}
        bidColor="#2563EB"
        askColor="#EF4444"
        height={286}
        isDark={isDark}
      />
    </View>
  );
}

function ChartTradeSheetDragHeader({
  styles,
  sheet,
  handlers,
}: {
  styles: any;
  colors: { blue: string; textMuted: string; sellPrimary: string };
  sheet: any;
  handlers: any;
}) {
  if (!shouldShowChartTradeSheetHandle({ chartTradeSheetMode: sheet.chartTradeSheetMode })) {
    return null;
  }

  return (
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
  const showInlineFooterDock = !!sheet.showInlineFooterDockWhileSheetOpen;
  const showSheetBody = shouldRenderChartTradeSheetBody({
    chartTradeSheetMode: sheet.chartTradeSheetMode,
  });
  const chartTradeSheetFrameHeight = resolveChartTradeSheetFrameHeight({
    chartTradeSheetMode: sheet.chartTradeSheetMode,
    collapsedHeight: sheet.chartTradeSheetCollapsedHeight,
    maxHeight: sheet.chartTradeSheetMaxHeight,
  });
  const showTradeFooterDock = showInlineFooterDock || footer.showFloatingFooterTradeRow;
  const tradeFooterDockVisible = showInlineFooterDock || footer.floatingFooterTradeRowVisible;
  const tradeFooterDockBottom = resolveFooterTradeDockBottom({
    platform: Platform.OS,
    footerLotEditorFocused: footer.footerLotEditorFocused,
    showFloatingFooterTradeRow: footer.showFloatingFooterTradeRow,
    showInlineFooterDock,
    footerTradeRowKeyboardOffset: footer.footerTradeRowKeyboardOffset,
    keyboardVisibleHeight: footer.keyboardVisibleHeight,
    keyboardResizesHost: footer.keyboardResizesHost,
    footerKeyboardAvoidanceOffset: footer.footerKeyboardAvoidanceOffset,
  });
  const tradeSheetBottomInset =
    Number.isFinite(sheet.chartTradeSheetBottomInset) && sheet.chartTradeSheetBottomInset > 0
      ? sheet.chartTradeSheetBottomInset
      : 0;
  // Optional bottom reservation for callers that deliberately keep a footer
  // visible. The toolbar SL/TP flow passes 0 so the sheet covers that area.
  const tradeSheetFrameBottom = tradeSheetBottomInset;

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
              { height: chartTradeSheetFrameHeight },
              tradeSheetFrameBottom > 0 && { bottom: tradeSheetFrameBottom },
              sheet.chartTradeSheetMode !== 'collapsed' && sheet.chartTradeSheetAnimatedStyle,
            ]}
          >
            <View
              collapsable={false}
              style={[
                styles.chartTradeSheet,
                styles.chartTradeSheetInline,
                styles.chartTradeSheetInlineFloating,
                sheet.useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
              ]}
            >
              <GestureDetector gesture={sheet.chartTradeSheetDragGesture}>
                <View collapsable={false}>
                  <ChartTradeSheetDragHeader
                    styles={styles}
                    colors={colors}
                    sheet={sheet}
                    handlers={handlers}
                  />

                  {/* Pinned symbol header - always visible, never scrolls away */}
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
                </View>
              </GestureDetector>

              {showSheetBody ? (
                <ScrollView
                  canCancelContentTouches={Platform.OS === 'ios'}
                  ref={sheet.chartTradeSheetScrollRef}
                  style={styles.chartTradeSheetContentScroll}
                  contentContainerStyle={[
                    styles.chartTradeSheetContent,
                    { paddingBottom: sheet.chartTradeSheetContentBottomPadding },
                  ]}
                  nestedScrollEnabled
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
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
              ) : null}
            </View>
          </Animated.View>
        </View>
      ) : null}

      {sheet.showHiddenInlineTradeSheet ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { display: 'none' },
            styles.chartTradeSheetFrame,
            { height: sheet.chartTradeSheetMaxHeight },
            tradeSheetFrameBottom > 0 && { bottom: tradeSheetFrameBottom },
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
            {shouldShowChartTradeSheetHandle({ chartTradeSheetMode: sheet.chartTradeSheetMode }) ? (
              <GestureDetector gesture={sheet.chartTradeSheetDragGesture}>
                <View collapsable={false}>
                  <ChartTradeSheetDragHeader
                    styles={styles}
                    colors={colors}
                    sheet={sheet}
                    handlers={handlers}
                  />
                </View>
              </GestureDetector>
            ) : null}

            <ScrollView
              canCancelContentTouches={Platform.OS === 'ios'}
              style={styles.chartTradeSheetContentScroll}
              contentContainerStyle={[
                styles.chartTradeSheetContent,
                { paddingBottom: sheet.chartTradeSheetContentBottomPadding },
              ]}
              nestedScrollEnabled
              bounces={false}
              keyboardShouldPersistTaps="always"
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

      {showTradeFooterDock ? (
        <View
          pointerEvents={tradeFooterDockVisible ? 'box-none' : 'none'}
          style={styles.footerTradeDockLayer}
        >
          <View
            pointerEvents={tradeFooterDockVisible ? 'auto' : 'none'}
            style={[
              styles.footerTradeDock,
              {
                bottom: tradeFooterDockBottom,
                opacity: tradeFooterDockVisible ? 1 : 0,
              },
            ]}
          >
            <LiveTradeButtons
              key={`chart-trade-footer-dock-${sheet.chartSymbol}`}
              symbol={sheet.chartSymbol}
              displayDecimals={symbolHeader.displayDecimals}
              lotSize={sheet.tradeVolume}
              volumeBounds={sheet.tradeVolumeBounds}
              onTradeResult={sheet.onTradeResult}
              comment={sheet.chartTradeComment}
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
              fallbackBid={sheet.chartBid}
              fallbackAsk={sheet.chartAsk}
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
  containerRef?: React.RefObject<View | null>;
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
  active?: boolean;
  fallbackBid?: number | null;
  fallbackAsk?: number | null;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function ChartTradeInlineFooter({
  LiveTradeButtons,
  styles,
  animatedStyle,
  containerRef,
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
  active = true,
  fallbackBid,
  fallbackAsk,
  onLayout,
}: ChartTradeInlineFooterProps) {
  const inlineFooterReceivesTouches = !showFloatingFooterTradeRow && !hideInlineTradeRow;

  return (
    <Animated.View
      ref={containerRef}
      pointerEvents={inlineFooterReceivesTouches ? 'auto' : 'none'}
      onLayout={onLayout}
      style={[styles.bottomArea, animatedStyle]}
    >
      {inlineFooterReceivesTouches ? (
        <LiveTradeButtons
          key={`chart-trade-inline-footer-${chartSymbol}`}
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
          active={active}
          fallbackBid={fallbackBid}
          fallbackAsk={fallbackAsk}
          isDark={isDark}
          buyColor={buyColor}
          sellColor={sellColor}
        />
      ) : null}
    </Animated.View>
  );
}
