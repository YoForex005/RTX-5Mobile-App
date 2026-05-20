type InitialHeightInput = {
  instantOpen: boolean;
  screenHeight: number;
  windowHeight: number;
};

type LayoutHeightInput = {
  previousHeight: number;
  layoutHeight: number;
  instantOpen: boolean;
  hasMeasuredLayout: boolean;
};

const MIN_FALLBACK_HEIGHT = 260;

const normalizeHeight = (height: number) =>
  Number.isFinite(height) && height > 0 ? height : 0;

export function resolveActionSheetInitialMeasuredHeight({
  instantOpen,
  screenHeight,
  windowHeight,
}: InitialHeightInput): number {
  const normalizedScreenHeight = normalizeHeight(screenHeight);
  const normalizedWindowHeight = normalizeHeight(windowHeight);

  if (instantOpen && normalizedWindowHeight > 0) {
    return normalizedWindowHeight;
  }

  return normalizedScreenHeight || normalizedWindowHeight || MIN_FALLBACK_HEIGHT;
}

export function resolveActionSheetMeasuredHeight({
  previousHeight,
  layoutHeight,
  instantOpen,
  hasMeasuredLayout,
}: LayoutHeightInput): number {
  const normalizedLayoutHeight = normalizeHeight(layoutHeight);

  if (normalizedLayoutHeight === 0) {
    return previousHeight;
  }

  if (instantOpen && !hasMeasuredLayout) {
    return Math.max(previousHeight, normalizedLayoutHeight);
  }

  if (!instantOpen && !hasMeasuredLayout) {
    return normalizedLayoutHeight;
  }

  return Math.max(previousHeight, normalizedLayoutHeight);
}
