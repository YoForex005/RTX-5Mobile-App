export const MT5_BOTTOM_TAB_BAR_BASE_HEIGHT = 84;
export const BOTTOM_TAB_BAR_EXTRA_HEIGHT = 2;

type BottomTabBarHeightInput = {
  safeAreaBottom: number;
  isChartTab?: boolean;
};

export function resolveBottomTabBarHeight({
  safeAreaBottom,
  isChartTab = false,
}: BottomTabBarHeightInput) {
  void isChartTab;
  return MT5_BOTTOM_TAB_BAR_BASE_HEIGHT + Math.max(safeAreaBottom, 0) + BOTTOM_TAB_BAR_EXTRA_HEIGHT;
}
