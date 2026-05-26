/**
 * Pure resolvers for the chart trade sheet's visibility, height, and tap-menu
 * suppression rules. All input/output is plain data — no React, no styles.
 */

type FooterTradeRowStateInput = {
  platform: string;
  footerLotEditorFocused: boolean;
  footerLotEditorOpening: boolean;
  showChartTradeSheet: boolean;
  keyboardVisibleHeight: number;
  keyboardDockOffset: number;
  keyboardResizesHost?: boolean;
};

type FooterTradeDockBottomInput = {
  platform: string;
  footerLotEditorFocused: boolean;
  showFloatingFooterTradeRow: boolean;
  showInlineFooterDock: boolean;
  footerTradeRowKeyboardOffset: number;
  keyboardVisibleHeight?: number;
  keyboardResizesHost?: boolean;
  footerKeyboardAvoidanceOffset?: number;
  androidFocusedLotEditorBottomGap?: number;
  androidKeyboardOverlayDockGap?: number;
  iosFocusedLotEditorEditGap?: number;
};

type ChartTradeInlineInputVisibilityInput = {
  showChartTradeSheet: boolean;
  chartTradeCommentFocused: boolean;
};

type ChartTradePreviewVisibilityInput = {
  showChartTradeSheet: boolean;
  chartTradeSheetMode: 'hidden' | 'collapsed' | 'expanded';
};

type ChartTradeSheetHeaderVisibilityInput = {
  chartTradeSheetMode: 'hidden' | 'collapsed' | 'expanded';
};

type ChartTradeSheetHandleVisibilityInput = {
  chartTradeSheetMode: 'hidden' | 'collapsed' | 'expanded';
};

type ChartTradeSheetBodyVisibilityInput = {
  chartTradeSheetMode: 'hidden' | 'collapsed' | 'expanded';
};

type ChartTradeSheetMarketExecutionButtonsVisibilityInput = {
  chartTradeOrderType: string;
  showInlineFooterWhileSheetOpen: boolean;
};

type ChartTapMenuSuppressionInput = {
  activeTool: string;
  footerLotEditorFocused: boolean;
  footerLotEditorOpening: boolean;
  footerLotPickerOpen: boolean;
  suppressUntil?: number | null;
  now?: number;
};

type ChartTradeSheetMaxHeightInput = {
  collapsedHeight: number;
  hostHeight: number;
  topInset: number;
  headerLift: number;
  bottomInset: number;
};

type ChartTradeSheetHeaderLiftInput = {
  topInset: number;
  compactHeaderHeight: number;
  isFullscreen: boolean;
};

type ChartTradeSheetHostHeightInput = {
  currentHostHeight: number;
  nextHostHeight: number;
  freezeHostHeight: boolean;
};

type ChartTradeSheetFrameHeightInput = {
  chartTradeSheetMode: 'hidden' | 'collapsed' | 'expanded';
  collapsedHeight: number;
  maxHeight: number;
};

export const ANDROID_FOCUSED_LOT_EDITOR_BOTTOM_GAP = 12;
export const ANDROID_KEYBOARD_OVERLAY_DOCK_GAP = 0;
export const IOS_FOCUSED_LOT_EDITOR_EDIT_GAP = 45;

export function resolveFooterTradeRowState({
  platform,
  footerLotEditorFocused,
  footerLotEditorOpening,
  showChartTradeSheet,
  keyboardVisibleHeight,
  keyboardDockOffset,
  keyboardResizesHost = false,
}: FooterTradeRowStateInput) {
  const shouldUseInlineFooterForAndroidLotEditor = platform === 'android';
  const shouldMountFloatingFooterTradeRow =
    footerLotEditorFocused &&
    !showChartTradeSheet &&
    !shouldUseInlineFooterForAndroidLotEditor;
  const resolvedKeyboardDockOffset =
    keyboardDockOffset > 0 ? Math.max(0, keyboardDockOffset) : 0;
  const resolvedKeyboardVisibleHeight =
    Number.isFinite(keyboardVisibleHeight) && keyboardVisibleHeight > 0
      ? keyboardVisibleHeight
      : 0;
  const isFloatingFooterTradeRowVisible =
    shouldMountFloatingFooterTradeRow &&
    (
      platform !== 'android' ||
      resolvedKeyboardDockOffset > 0 ||
      resolvedKeyboardVisibleHeight > 0
    );
  const footerTradeRowKeyboardOffset =
    isFloatingFooterTradeRowVisible &&
    resolvedKeyboardDockOffset > 0 &&
    !(platform === 'android' && keyboardResizesHost)
      ? resolvedKeyboardDockOffset
      : 0;

  // Reference unused inputs for parameter destructuring without lint warnings.
  void footerLotEditorOpening;
  void keyboardResizesHost;

  return {
    shouldMountFloatingFooterTradeRow,
    isFloatingFooterTradeRowVisible,
    footerTradeRowKeyboardOffset,
  };
}

export function resolveFooterTradeDockBottom({
  platform,
  footerLotEditorFocused,
  showFloatingFooterTradeRow,
  showInlineFooterDock,
  footerTradeRowKeyboardOffset,
  keyboardVisibleHeight = 0,
  keyboardResizesHost = false,
  footerKeyboardAvoidanceOffset = 0,
  androidFocusedLotEditorBottomGap = ANDROID_FOCUSED_LOT_EDITOR_BOTTOM_GAP,
  androidKeyboardOverlayDockGap = ANDROID_KEYBOARD_OVERLAY_DOCK_GAP,
  iosFocusedLotEditorEditGap = IOS_FOCUSED_LOT_EDITOR_EDIT_GAP,
}: FooterTradeDockBottomInput) {
  if (!showFloatingFooterTradeRow || showInlineFooterDock) {
    return 0;
  }

  const normalizedKeyboardOffset =
    Number.isFinite(footerTradeRowKeyboardOffset) && footerTradeRowKeyboardOffset > 0
      ? footerTradeRowKeyboardOffset
      : 0;
  const normalizedKeyboardHeight =
    Number.isFinite(keyboardVisibleHeight) && keyboardVisibleHeight > 0
      ? keyboardVisibleHeight
      : 0;
  const normalizedFooterKeyboardAvoidanceOffset =
    Number.isFinite(footerKeyboardAvoidanceOffset) && footerKeyboardAvoidanceOffset > 0
      ? footerKeyboardAvoidanceOffset
      : 0;

  if (platform === 'android' && footerLotEditorFocused) {
    if (!keyboardResizesHost) {
      const overlayKeyboardLift = Math.max(
        normalizedKeyboardOffset,
        normalizedKeyboardHeight,
        normalizedFooterKeyboardAvoidanceOffset,
      );
      if (overlayKeyboardLift > 0) {
        return Math.max(0, overlayKeyboardLift - Math.max(0, androidKeyboardOverlayDockGap));
      }
    }
    return Math.max(0, androidFocusedLotEditorBottomGap);
  }

  const editGap =
    platform === 'ios' &&
    footerLotEditorFocused &&
    normalizedKeyboardOffset > 0
      ? Math.max(0, iosFocusedLotEditorEditGap)
      : 0;

  return normalizedKeyboardOffset + editGap;
}

export function shouldHideChartTabBarForTradeInput({
  showChartTradeSheet,
  chartTradeCommentFocused,
}: ChartTradeInlineInputVisibilityInput) {
  void showChartTradeSheet;
  void chartTradeCommentFocused;
  return false;
}

export function shouldShowChartTradePreviewOnChart({
  showChartTradeSheet,
  chartTradeSheetMode,
}: ChartTradePreviewVisibilityInput) {
  return showChartTradeSheet && chartTradeSheetMode === 'collapsed';
}

export function shouldSuppressChartTapMenu({
  activeTool,
  footerLotEditorFocused,
  footerLotEditorOpening,
  footerLotPickerOpen,
  suppressUntil,
  now,
}: ChartTapMenuSuppressionInput) {
  const resolvedNow =
    typeof now === 'number' && Number.isFinite(now)
      ? now
      : Date.now();
  const resolvedSuppressUntil =
    typeof suppressUntil === 'number' && Number.isFinite(suppressUntil)
      ? suppressUntil
      : 0;

  return (
    activeTool !== 'crosshair' ||
    footerLotEditorFocused ||
    footerLotEditorOpening ||
    footerLotPickerOpen ||
    resolvedSuppressUntil > resolvedNow
  );
}

export function resolveChartTradeSheetMaxHeight({
  collapsedHeight,
  hostHeight,
  topInset,
  headerLift,
  bottomInset,
}: ChartTradeSheetMaxHeightInput) {
  const normalizedCollapsedHeight =
    Number.isFinite(collapsedHeight) && collapsedHeight > 0
      ? collapsedHeight
      : 0;
  const normalizedHostHeight =
    Number.isFinite(hostHeight) && hostHeight > 0
      ? hostHeight
      : 0;
  const normalizedTopInset =
    Number.isFinite(topInset) && topInset > 0
      ? topInset
      : 0;
  const normalizedHeaderLift =
    Number.isFinite(headerLift) && headerLift > 0
      ? headerLift
      : 0;
  const normalizedBottomInset =
    Number.isFinite(bottomInset) && bottomInset > 0
      ? bottomInset
      : 0;

  return Math.max(
    normalizedCollapsedHeight,
    normalizedHostHeight - normalizedTopInset - normalizedBottomInset + normalizedHeaderLift,
  );
}

export function resolveChartTradeSheetHeaderLift(input: ChartTradeSheetHeaderLiftInput) {
  void input;
  // The expanded sheet now reserves its toolbar boundary through topInset.
  // Adding a separate header lift would let it climb into the compact header.
  return 0;
}

export function resolveChartTradeSheetHostHeight({
  currentHostHeight,
  nextHostHeight,
  freezeHostHeight,
}: ChartTradeSheetHostHeightInput) {
  const normalizedCurrentHeight =
    Number.isFinite(currentHostHeight) && currentHostHeight > 0
      ? currentHostHeight
      : 0;
  const normalizedNextHeight =
    Number.isFinite(nextHostHeight) && nextHostHeight > 0
      ? nextHostHeight
      : 0;

  if (normalizedNextHeight <= 0) {
    return normalizedCurrentHeight;
  }

  if (freezeHostHeight && normalizedCurrentHeight > 0) {
    return normalizedCurrentHeight;
  }

  return normalizedNextHeight;
}

export function resolveChartTradeSheetFrameHeight({
  chartTradeSheetMode,
  collapsedHeight,
  maxHeight,
}: ChartTradeSheetFrameHeightInput) {
  const normalizedCollapsedHeight =
    Number.isFinite(collapsedHeight) && collapsedHeight > 0
      ? collapsedHeight
      : 0;
  const normalizedMaxHeight =
    Number.isFinite(maxHeight) && maxHeight > 0
      ? maxHeight
      : 0;

  if (chartTradeSheetMode === 'collapsed') {
    return normalizedMaxHeight > 0
      ? Math.min(normalizedMaxHeight, normalizedCollapsedHeight)
      : normalizedCollapsedHeight;
  }

  return Math.max(normalizedCollapsedHeight, normalizedMaxHeight);
}

export function shouldShowChartTradeSheetHeader({
  chartTradeSheetMode,
}: ChartTradeSheetHeaderVisibilityInput) {
  return chartTradeSheetMode !== 'expanded';
}

export function shouldShowChartTradeSheetHandle({
  chartTradeSheetMode,
}: ChartTradeSheetHandleVisibilityInput) {
  return chartTradeSheetMode !== 'hidden';
}

export function shouldRenderChartTradeSheetBody({
  chartTradeSheetMode,
}: ChartTradeSheetBodyVisibilityInput) {
  return chartTradeSheetMode === 'expanded';
}

export function shouldShowChartTradeSheetMarketExecutionButtons({
  chartTradeOrderType,
  showInlineFooterWhileSheetOpen,
}: ChartTradeSheetMarketExecutionButtonsVisibilityInput) {
  return chartTradeOrderType !== 'Market Execution' || !showInlineFooterWhileSheetOpen;
}
