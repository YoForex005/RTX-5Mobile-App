import {
  formatTradeVolume,
  incrementTradeVolume,
  normalizeTradeVolume,
  resolveTradeVolumeBounds,
  sanitizeTradeVolumeDraft,
  type TradeVolumeBounds,
} from '../../utils/tradeVolume';

const KEYBOARD_HOST_RESIZE_MIN_DELTA = 64;
const KEYBOARD_HOST_RESIZE_RATIO = 0.25;
const FOOTER_LOT_PICKER_QUICK_ADJUSTMENT_MULTIPLIERS = [1, 10, 50] as const;
const FOOTER_LOT_PICKER_GRID_MULTIPLIER = 10;
const FOOTER_LOT_PICKER_GRID_ENTRY_COUNT = 10;

export type FooterLotPickerMode = 'absolute' | 'increase' | 'decrease';

export type FooterLotPickerQuickAdjustment = {
  key: string;
  label: string;
  nextValue: number;
  multiplier: number;
};

export type FooterLotPickerValueOption = {
  key: string;
  label: string;
  value: number;
  multiplier: number;
  rangeMultiplier?: number;
};

type FooterLotCommitDraftInput = {
  draftOverride?: string;
  draftRef?: string;
  currentDraft?: string;
};

type FooterTradeRowStateInput = {
  platform: string;
  footerLotEditorFocused: boolean;
  footerLotEditorOpening: boolean;
  showChartTradeSheet: boolean;
  keyboardVisibleHeight: number;
  keyboardDockOffset: number;
  keyboardResizesHost?: boolean;
};

type ChartTradeInlineInputVisibilityInput = {
  showChartTradeSheet: boolean;
  chartTradeCommentFocused: boolean;
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

type KeyboardHostResizeInput = {
  platform: string;
  footerLotEditorFocused: boolean;
  showChartTradeSheet: boolean;
  keyboardVisibleHeight: number;
  keyboardFreeHostHeight: number;
  currentHostHeight: number;
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

type FooterLotChevronStateInput = {
  lotSize: number;
  bounds?: TradeVolumeBounds;
  hasDecreaseAction: boolean;
  hasIncreaseAction: boolean;
};

type FooterLotChevronPressBehaviorInput = {
  hasStepAction: boolean;
  hasLotPickerAction: boolean;
};

const formatTradeVolumePickerLabel = (value: number, bounds?: TradeVolumeBounds) =>
  formatTradeVolume(value, bounds).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

const formatSignedTradeVolumePickerLabel = (value: number, bounds?: TradeVolumeBounds) =>
  `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatTradeVolumePickerLabel(Math.abs(value), bounds)}`;

const roundLotPickerAmount = (value: number, decimals: number) =>
  Number(value.toFixed(Math.max(decimals, 6)));

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
  footerLotEditorOpening,
  showChartTradeSheet,
  keyboardVisibleHeight,
  keyboardDockOffset,
  keyboardResizesHost = false,
}: FooterTradeRowStateInput) {
  const shouldMountFloatingFooterTradeRow =
    footerLotEditorFocused &&
    !showChartTradeSheet;
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

  return {
    shouldMountFloatingFooterTradeRow,
    isFloatingFooterTradeRowVisible,
    footerTradeRowKeyboardOffset,
  };
}

export function resolveFooterLotChevronState({
  lotSize,
  bounds,
  hasDecreaseAction,
  hasIncreaseAction,
}: FooterLotChevronStateInput) {
  const { stepVolume } = resolveTradeVolumeBounds(bounds);
  const normalizedLotSize = normalizeTradeVolume(lotSize, bounds);
  const lotStepEpsilon = stepVolume / 1000;
  const nextDecreaseLot = incrementTradeVolume(normalizedLotSize, -1, bounds);
  const nextIncreaseLot = incrementTradeVolume(normalizedLotSize, 1, bounds);

  return {
    canDecreaseLot: hasDecreaseAction && nextDecreaseLot < normalizedLotSize - lotStepEpsilon,
    canIncreaseLot: hasIncreaseAction && nextIncreaseLot > normalizedLotSize + lotStepEpsilon,
  };
}

export function resolveFooterLotChevronPressBehavior({
  hasStepAction,
  hasLotPickerAction,
}: FooterLotChevronPressBehaviorInput) {
  if (hasLotPickerAction) {
    return 'picker';
  }

  if (hasStepAction) {
    return 'step';
  }

  return 'none';
}

export function buildFooterLotPickerQuickAdjustments(
  value: number,
  mode: FooterLotPickerMode,
  bounds?: TradeVolumeBounds,
) {
  const resolved = resolveTradeVolumeBounds(bounds);
  const currentValue = normalizeTradeVolume(value, bounds);
  const epsilon = resolved.stepVolume / 1000;
  const seen = new Set<number>();
  const options: FooterLotPickerQuickAdjustment[] = [];

  for (const multiplier of FOOTER_LOT_PICKER_QUICK_ADJUSTMENT_MULTIPLIERS) {
    const rawAmount = roundLotPickerAmount(resolved.stepVolume * multiplier, resolved.decimals);
    const signedAmount = mode === 'decrease' ? -rawAmount : rawAmount;
    const nextValue = normalizeTradeVolume(currentValue + signedAmount, bounds);
    const actualAmount = roundLotPickerAmount(nextValue - currentValue, resolved.decimals);
    const labelAmount = mode === 'absolute' ? actualAmount : signedAmount;

    if (mode === 'absolute' && Math.abs(actualAmount) <= epsilon) {
      continue;
    }

    if (mode === 'absolute' && seen.has(nextValue)) {
      continue;
    }

    seen.add(nextValue);
    options.push({
      key: `${mode}:${multiplier}:${nextValue}`,
      label: formatSignedTradeVolumePickerLabel(labelAmount, bounds),
      nextValue,
      multiplier,
    });
  }

  return options;
}

export function buildFooterLotPickerValues(
  value: number,
  mode: FooterLotPickerMode,
  bounds?: TradeVolumeBounds,
  selectedQuickMultiplier?: number,
) {
  const resolved = resolveTradeVolumeBounds(bounds);
  const currentValue = normalizeTradeVolume(value, bounds);
  const seen = new Set<number>();
  const values: FooterLotPickerValueOption[] = [];

  if (mode === 'absolute') {
    const coarseStep = resolved.stepVolume * FOOTER_LOT_PICKER_GRID_MULTIPLIER;

    for (let index = 1; index <= FOOTER_LOT_PICKER_GRID_ENTRY_COUNT; index += 1) {
      const candidate = normalizeTradeVolume(coarseStep * index, bounds);
      if (candidate < resolved.minVolume || candidate > resolved.maxVolume || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      values.push({
        key: `${mode}:${candidate}`,
        label: formatTradeVolumePickerLabel(candidate, bounds),
        value: candidate,
        multiplier: index,
      });
    }

    if (values.length === 0) {
      values.push({
        key: `${mode}:${resolved.minVolume}`,
        label: formatTradeVolumePickerLabel(resolved.minVolume, bounds),
        value: resolved.minVolume,
        multiplier: 1,
      });
    }

    return values;
  }

  const direction = mode === 'decrease' ? -1 : 1;
  const selectedMultiplier =
    typeof selectedQuickMultiplier === 'number' && Number.isFinite(selectedQuickMultiplier)
      ? Math.max(1, Math.floor(selectedQuickMultiplier))
      : FOOTER_LOT_PICKER_QUICK_ADJUSTMENT_MULTIPLIERS[0];
  const rangeStep = Math.max(1, Math.pow(10, Math.floor(Math.log10(selectedMultiplier))));
  const startMultiplier = selectedMultiplier;
  const endMultiplier = rangeStep * FOOTER_LOT_PICKER_GRID_MULTIPLIER;

  for (let multiplier = startMultiplier; multiplier <= endMultiplier; multiplier += rangeStep) {
    const amount = roundLotPickerAmount(resolved.stepVolume * multiplier, resolved.decimals);
    const candidate = normalizeTradeVolume(currentValue + direction * amount, bounds);
    const displayAmount = roundLotPickerAmount(direction * amount, resolved.decimals);

    if (seen.has(multiplier)) {
      continue;
    }

    seen.add(multiplier);
    values.push({
      key: `${mode}:${selectedMultiplier}:${multiplier}:${candidate}`,
      label: formatSignedTradeVolumePickerLabel(displayAmount, bounds),
      value: candidate,
      multiplier,
      rangeMultiplier: multiplier,
    });
  }

  return values;
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

export function resolveChartTradeSheetHeaderLift({
  topInset,
  compactHeaderHeight,
  isFullscreen,
}: ChartTradeSheetHeaderLiftInput) {
  if (isFullscreen) {
    return 0;
  }

  const normalizedTopInset =
    Number.isFinite(topInset) && topInset > 0
      ? topInset
      : 0;
  const normalizedCompactHeaderHeight =
    Number.isFinite(compactHeaderHeight) && compactHeaderHeight > 0
      ? compactHeaderHeight
      : 0;

  return normalizedTopInset + normalizedCompactHeaderHeight;
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
    Number.isFinite(keyboardScreenY)
  ) {
    const effectiveWindowBottom = Math.min(
      Number.isFinite(containerBottom) ? (containerBottom as number) : Number.POSITIVE_INFINITY,
      normalizedScreenHeight > 0 ? normalizedScreenHeight : Number.POSITIVE_INFINITY,
    );

    if (Number.isFinite(effectiveWindowBottom)) {
      return Math.max(0, effectiveWindowBottom - (keyboardScreenY as number));
    }
  }

  return Math.max(
    0,
    normalizedKeyboardHeight - (platform === 'android' ? normalizedSafeAreaBottom : 0),
  );
}

export function resolveKeyboardResizesHost({
  platform,
  footerLotEditorFocused,
  showChartTradeSheet,
  keyboardVisibleHeight,
  keyboardFreeHostHeight,
  currentHostHeight,
}: KeyboardHostResizeInput) {
  const normalizedKeyboardHeight =
    Number.isFinite(keyboardVisibleHeight) && keyboardVisibleHeight > 0
      ? keyboardVisibleHeight
      : 0;
  const normalizedKeyboardFreeHostHeight =
    Number.isFinite(keyboardFreeHostHeight) && keyboardFreeHostHeight > 0
      ? keyboardFreeHostHeight
      : 0;
  const normalizedCurrentHostHeight =
    Number.isFinite(currentHostHeight) && currentHostHeight > 0
      ? currentHostHeight
      : 0;

  if (
    platform !== 'android' ||
    !footerLotEditorFocused ||
    showChartTradeSheet ||
    normalizedKeyboardHeight <= 0 ||
    normalizedKeyboardFreeHostHeight <= 0 ||
    normalizedCurrentHostHeight <= 0
  ) {
    return false;
  }

  const hostShrink = normalizedKeyboardFreeHostHeight - normalizedCurrentHostHeight;
  const resizeThreshold = Math.min(
    normalizedKeyboardHeight,
    Math.max(KEYBOARD_HOST_RESIZE_MIN_DELTA, normalizedKeyboardHeight * KEYBOARD_HOST_RESIZE_RATIO),
  );

  return hostShrink >= resizeThreshold;
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
