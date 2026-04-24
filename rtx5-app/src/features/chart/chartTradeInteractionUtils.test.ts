import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFooterLotPickerQuickAdjustments,
  buildFooterLotPickerValues,
  resolveChartTradeSheetMaxHeight,
  resolveFooterLotChevronState,
  resolveFooterLotCommitDraft,
  resolveFooterTradeRowState,
  resolveKeyboardDockOffset,
  resolveKeyboardResizesHost,
  shouldHideChartTabBarForTradeInput,
  shouldShowChartTradePreviewOnChart,
  shouldShowChartTradeSheetHandle,
  shouldShowChartTradeSheetMarketExecutionButtons,
  shouldShowChartTradeSheetHeader,
} from './chartTradeInteractionUtils.ts';

const lotBounds = { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 };
const activeLotRangeLabels = (selectedMultiplier: number, mode: 'increase' | 'decrease' = 'increase') =>
  buildFooterLotPickerValues(mode === 'increase' ? 0.01 : 1, mode, lotBounds, selectedMultiplier)
    .filter((option) => option.multiplier > selectedMultiplier)
    .map((option) => option.label);

test('resolveFooterLotCommitDraft prefers the latest non-empty override', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '0.23',
      draftRef: '0.15',
      currentDraft: '0.10',
    }),
    '0.23',
  );
});

test('resolveFooterLotCommitDraft falls back when the event payload is blank', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '',
      draftRef: '0.37',
      currentDraft: '0.10',
    }),
    '0.37',
  );
});

test('resolveFooterLotCommitDraft sanitizes invalid characters before commit', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: ' 0..2a5 ',
      draftRef: '0.10',
      currentDraft: '0.10',
    }),
    '0.25',
  );
});

test('resolveFooterLotCommitDraft returns blank only when every source is blank', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '',
      draftRef: '',
      currentDraft: '',
    }),
    '',
  );
});

test('resolveFooterLotChevronState disables only lot decrease at the minimum volume', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 0.01,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasLotPickerAction: false,
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: false,
      canIncreaseLot: true,
    },
  );
});

test('resolveFooterLotChevronState disables lot decrease at the minimum even when picker exists', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 0.01,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasLotPickerAction: true,
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: false,
      canIncreaseLot: true,
    },
  );
});

test('resolveFooterLotChevronState disables only lot increase at the maximum volume', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 1,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasLotPickerAction: false,
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: true,
      canIncreaseLot: false,
    },
  );
});

test('resolveFooterLotChevronState keeps both lot chevrons enabled between min and max', () => {
  assert.deepEqual(
    resolveFooterLotChevronState({
      lotSize: 0.5,
      bounds: { minVolume: 0.01, maxVolume: 1, stepVolume: 0.01 },
      hasLotPickerAction: false,
      hasDecreaseAction: true,
      hasIncreaseAction: true,
    }),
    {
      canDecreaseLot: true,
      canIncreaseLot: true,
    },
  );
});

test('buildFooterLotPickerQuickAdjustments shows the expected increase range selectors', () => {
  assert.deepEqual(
    buildFooterLotPickerQuickAdjustments(0.01, 'increase', lotBounds).map((option) => option.label),
    ['+0.01', '+0.1', '+0.5'],
  );
});

test('buildFooterLotPickerValues shows small positive steps after selecting +0.01', () => {
  assert.deepEqual(
    activeLotRangeLabels(1),
    ['+0.02', '+0.03', '+0.04', '+0.05', '+0.06', '+0.07', '+0.08', '+0.09', '+0.1'],
  );
});

test('buildFooterLotPickerValues shows the next positive tenth range after selecting +0.1', () => {
  assert.deepEqual(
    activeLotRangeLabels(10),
    ['+0.11', '+0.12', '+0.13', '+0.14', '+0.15', '+0.16', '+0.17', '+0.18', '+0.19', '+0.2'],
  );
});

test('buildFooterLotPickerValues shows the next positive hundredth range after selecting +0.5', () => {
  assert.deepEqual(
    activeLotRangeLabels(50),
    ['+0.51', '+0.52', '+0.53', '+0.54', '+0.55', '+0.56', '+0.57', '+0.58', '+0.59', '+0.6'],
  );
});

test('buildFooterLotPickerValues mirrors the small range for lot decrease', () => {
  assert.deepEqual(
    activeLotRangeLabels(1, 'decrease'),
    ['-0.02', '-0.03', '-0.04', '-0.05', '-0.06', '-0.07', '-0.08', '-0.09', '-0.1'],
  );
});

test('buildFooterLotPickerValues mirrors the tenth range for lot decrease', () => {
  assert.deepEqual(
    activeLotRangeLabels(10, 'decrease'),
    ['-0.11', '-0.12', '-0.13', '-0.14', '-0.15', '-0.16', '-0.17', '-0.18', '-0.19', '-0.2'],
  );
});

test('buildFooterLotPickerValues mirrors the hundredth range for lot decrease after selecting -0.5', () => {
  assert.deepEqual(
    activeLotRangeLabels(50, 'decrease'),
    ['-0.51', '-0.52', '-0.53', '-0.54', '-0.55', '-0.56', '-0.57', '-0.58', '-0.59', '-0.6'],
  );
});

test('buildFooterLotPickerValues keeps the previous positive range available to the left of the active range', () => {
  assert.deepEqual(
    buildFooterLotPickerValues(0.01, 'increase', lotBounds, 10)
      .filter((option) => option.multiplier <= 10)
      .map((option) => option.label),
    ['+0.01', '+0.02', '+0.03', '+0.04', '+0.05', '+0.06', '+0.07', '+0.08', '+0.09', '+0.1'],
  );
});

test('resolveFooterTradeRowState keeps the Android floating editor mounted while keyboard height is still unknown', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 0,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState shows the Android floating editor immediately while the editor is opening', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 0,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState shows the Android floating editor while the keyboard is opening', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 288,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 288,
    },
  );
});

test('resolveFooterTradeRowState docks the Android floating editor to a resized host without a stale keyboard gap', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 184,
      keyboardResizesHost: true,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState keeps the Android floating editor visible at bottom 0 when the resized window is already docked to the keyboard', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState keeps the iOS floating editor visible without waiting for an Android keyboard event', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'ios',
      footerLotEditorFocused: true,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 0,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState disables the floating row when the editor is closed', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: false,
      footerLotEditorOpening: false,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardDockOffset: 288,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('shouldHideChartTabBarForTradeInput only hides the chart tab bar for inline sheet text input', () => {
  assert.equal(
    shouldHideChartTabBarForTradeInput({
      showChartTradeSheet: true,
      chartTradeCommentFocused: true,
    }),
    true,
  );

  assert.equal(
    shouldHideChartTabBarForTradeInput({
      showChartTradeSheet: false,
      chartTradeCommentFocused: true,
    }),
    false,
  );

  assert.equal(
    shouldHideChartTabBarForTradeInput({
      showChartTradeSheet: true,
      chartTradeCommentFocused: false,
    }),
    false,
  );
});

test('chart trade preview stays visible only while the trade sheet is collapsed', () => {
  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: true,
      chartTradeSheetMode: 'collapsed',
    }),
    true,
  );

  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: true,
      chartTradeSheetMode: 'expanded',
    }),
    false,
  );

  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: false,
      chartTradeSheetMode: 'collapsed',
    }),
    false,
  );
});

test('resolveChartTradeSheetMaxHeight lifts the inline trade sheet into the compact chart header area', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 0,
      headerLift: 72,
      bottomInset: 0,
    }),
    692,
  );
});

test('resolveChartTradeSheetMaxHeight subtracts the inline footer inset so the sheet opens above the footer', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 0,
      headerLift: 72,
      bottomInset: 58,
    }),
    634,
  );
});

test('resolveChartTradeSheetMaxHeight never shrinks below the collapsed height', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 120,
      topInset: 12,
      headerLift: 0,
      bottomInset: 58,
    }),
    186,
  );
});

test('resolveChartTradeSheetMaxHeight keeps expanded SL/TP sheet below the chart toolbar with a visible gap', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 58,
      headerLift: 0,
      bottomInset: 0,
    }),
    562,
  );
});

test('resolveChartTradeSheetMaxHeight reserves both the chart heading gap and visible trade footer', () => {
  assert.equal(
    resolveChartTradeSheetMaxHeight({
      collapsedHeight: 186,
      hostHeight: 620,
      topInset: 58,
      headerLift: 0,
      bottomInset: 58,
    }),
    504,
  );
});

test('resolveKeyboardDockOffset prefers real keyboard overlap from screenY on Android', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 620,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    76,
  );
});

test('resolveKeyboardDockOffset falls back to keyboard height minus safe bottom on Android', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: null,
      containerBottom: null,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    288,
  );
});

test('resolveKeyboardDockOffset keeps the full keyboard height on iOS', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'ios',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 620,
      screenHeight: 800,
      safeAreaBottom: 34,
    }),
    312,
  );
});

test('resolveKeyboardDockOffset returns zero when the resized Android container already ends at the keyboard top', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 544,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    0,
  );
});

test('resolveKeyboardDockOffset clamps stale Android container geometry to the current resized window height', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 800,
      screenHeight: 544,
      safeAreaBottom: 24,
    }),
    0,
  );
});

test('resolveKeyboardResizesHost detects Android adjustResize from the measured chart host shrink', () => {
  assert.equal(
    resolveKeyboardResizesHost({
      platform: 'android',
      footerLotEditorFocused: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardFreeHostHeight: 620,
      currentHostHeight: 430,
    }),
    true,
  );
});

test('resolveKeyboardResizesHost ignores small layout changes while the Android keyboard is open', () => {
  assert.equal(
    resolveKeyboardResizesHost({
      platform: 'android',
      footerLotEditorFocused: true,
      showChartTradeSheet: false,
      keyboardVisibleHeight: 312,
      keyboardFreeHostHeight: 620,
      currentHostHeight: 590,
    }),
    false,
  );
});

test('chart trade sheet header hides only in expanded mode', () => {
  assert.equal(shouldShowChartTradeSheetHeader({ chartTradeSheetMode: 'collapsed' }), true);
  assert.equal(shouldShowChartTradeSheetHeader({ chartTradeSheetMode: 'expanded' }), false);
});

test('chart trade sheet grab handle stays visible while the sheet is open', () => {
  assert.equal(shouldShowChartTradeSheetHandle({ chartTradeSheetMode: 'collapsed' }), true);
  assert.equal(shouldShowChartTradeSheetHandle({ chartTradeSheetMode: 'expanded' }), true);
  assert.equal(shouldShowChartTradeSheetHandle({ chartTradeSheetMode: 'hidden' }), false);
});

test('chart trade sheet hides duplicated market execution buttons when the compact footer stays mounted', () => {
  assert.equal(
    shouldShowChartTradeSheetMarketExecutionButtons({
      chartTradeOrderType: 'Market Execution',
      showInlineFooterWhileSheetOpen: true,
    }),
    false,
  );
  assert.equal(
    shouldShowChartTradeSheetMarketExecutionButtons({
      chartTradeOrderType: 'Market Execution',
      showInlineFooterWhileSheetOpen: false,
    }),
    true,
  );
  assert.equal(
    shouldShowChartTradeSheetMarketExecutionButtons({
      chartTradeOrderType: 'Buy Limit',
      showInlineFooterWhileSheetOpen: true,
    }),
    true,
  );
});
