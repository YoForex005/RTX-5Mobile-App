import { sanitizeTradeVolumeDraft } from '../../utils/tradeVolume';

type FooterLotCommitDraftInput = {
  draftOverride?: string;
  draftRef?: string;
  currentDraft?: string;
};

type FooterTradeRowStateInput = {
  platform: string;
  footerLotEditorFocused: boolean;
  showChartTradeSheet: boolean;
  keyboardDockOffset: number;
};

type ChartTradePreviewVisibilityInput = {
  showChartTradeSheet: boolean;
  chartTradeSheetMode: 'hidden' | 'collapsed' | 'expanded';
};

type KeyboardDockOffsetInput = {
  platform: string;
  keyboardHeight: number;
  keyboardScreenY?: number | null;
  containerBottom?: number | null;
  screenHeight: number;
  safeAreaBottom: number;
};

type ChartTradeSheetHeaderVisibilityInput = {
  chartTradeSheetMode: 'hidden' | 'collapsed' | 'expanded';
};

export function resolveFooterLotCommitDraft({
  draftOverride,
  draftRef,
  currentDraft,
}: FooterLotCommitDraftInput) {
  const candidates = [draftOverride, draftRef, currentDraft];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const sanitized = sanitizeTradeVolumeDraft(candidate);
    if (sanitized.trim()) {
      return sanitized;
    }
  }

  return '';
}

export function resolveFooterTradeRowState({
  platform,
  footerLotEditorFocused,
  showChartTradeSheet,
  keyboardDockOffset,
}: FooterTradeRowStateInput) {
  const shouldMountFloatingFooterTradeRow =
    footerLotEditorFocused &&
    !showChartTradeSheet;
  const resolvedKeyboardDockOffset =
    keyboardDockOffset > 0 ? Math.max(0, keyboardDockOffset) : 0;
  const isFloatingFooterTradeRowVisible =
    shouldMountFloatingFooterTradeRow &&
    (platform !== 'android' || resolvedKeyboardDockOffset > 0 || footerLotEditorFocused);
  // On Android with adjustResize the window is already above the keyboard,
  // so the floating row sits at bottom: 0 in the resized window.
  const footerTradeRowKeyboardOffset =
    platform === 'android'
      ? 0
      : isFloatingFooterTradeRowVisible && resolvedKeyboardDockOffset > 0
        ? resolvedKeyboardDockOffset
        : 0;

  return {
    shouldMountFloatingFooterTradeRow,
    isFloatingFooterTradeRowVisible,
    footerTradeRowKeyboardOffset,
  };
}

export function shouldShowChartTradePreviewOnChart({
  showChartTradeSheet,
  chartTradeSheetMode,
}: ChartTradePreviewVisibilityInput) {
  return showChartTradeSheet && chartTradeSheetMode === 'collapsed';
}

export function resolveKeyboardDockOffset({
  platform,
  keyboardHeight,
  keyboardScreenY,
  containerBottom,
  screenHeight,
  safeAreaBottom,
}: KeyboardDockOffsetInput) {
  const normalizedKeyboardHeight =
    Number.isFinite(keyboardHeight) && keyboardHeight > 0
      ? keyboardHeight
      : 0;
  const normalizedScreenHeight =
    Number.isFinite(screenHeight) && screenHeight > 0
      ? screenHeight
      : 0;
  const normalizedSafeAreaBottom =
    Number.isFinite(safeAreaBottom) && safeAreaBottom > 0
      ? safeAreaBottom
      : 0;

  if (normalizedKeyboardHeight <= 0) {
    return 0;
  }

  if (
    platform === 'android' &&
    Number.isFinite(keyboardScreenY) &&
    Number.isFinite(containerBottom)
  ) {
    return Math.max(0, (containerBottom as number) - (keyboardScreenY as number));
  }

  if (
    platform === 'android' &&
    Number.isFinite(keyboardScreenY) &&
    normalizedScreenHeight > 0
  ) {
    const overlap = normalizedScreenHeight - (keyboardScreenY as number);
    if (overlap > 0) {
      return Math.max(0, overlap);
    }
  }

  return Math.max(
    0,
    normalizedKeyboardHeight - (platform === 'android' ? normalizedSafeAreaBottom : 0),
  );
}

export function shouldShowChartTradeSheetHeader({
  chartTradeSheetMode,
}: ChartTradeSheetHeaderVisibilityInput) {
  return chartTradeSheetMode !== 'expanded';
}
