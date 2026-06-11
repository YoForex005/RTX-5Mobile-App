export const MT5_BOTTOM_TAB_BAR_BASE_HEIGHT = 84;
export const MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT = 64;
export const BOTTOM_TAB_BAR_EXTRA_HEIGHT = 2;

type BottomTabBarHeightInput = {
  safeAreaBottom: number;
  isChartTab?: boolean;
  isLandscape?: boolean;
};

export function resolveBottomTabBarHeight({
  safeAreaBottom,
  isChartTab = false,
  isLandscape = false,
}: BottomTabBarHeightInput) {
  void isChartTab;
  const baseHeight = isLandscape
    ? MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT
    : MT5_BOTTOM_TAB_BAR_BASE_HEIGHT;

  return baseHeight + Math.max(safeAreaBottom, 0) + BOTTOM_TAB_BAR_EXTRA_HEIGHT;
}
