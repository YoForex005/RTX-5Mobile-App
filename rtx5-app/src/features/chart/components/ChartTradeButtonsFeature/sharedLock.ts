/**
 * Module-scoped shared lock so multiple ChartTradeButtons mounted on the same
 * screen (e.g. compact + sheet variants) cannot fire simultaneous trades.
 */
import type { TradeSide } from '../../../../domain/tradeSide';

export const CHART_TRADE_TAP_RELEASE_DELAY_MS = 350;

let chartTradeButtonSharedLockSide: TradeSide | null = null;
let chartTradeButtonSharedLockReleaseTimer: ReturnType<typeof setTimeout> | null = null;

export const acquireChartTradeButtonSharedLock = (side: TradeSide) => {
  if (chartTradeButtonSharedLockSide !== null) {
    return false;
  }
  if (chartTradeButtonSharedLockReleaseTimer) {
    clearTimeout(chartTradeButtonSharedLockReleaseTimer);
    chartTradeButtonSharedLockReleaseTimer = null;
  }
  chartTradeButtonSharedLockSide = side;
  return true;
};

export const releaseChartTradeButtonSharedLock = (side: TradeSide, delayMs = 0) => {
  if (chartTradeButtonSharedLockSide !== side) {
    return;
  }
  if (chartTradeButtonSharedLockReleaseTimer) {
    clearTimeout(chartTradeButtonSharedLockReleaseTimer);
    chartTradeButtonSharedLockReleaseTimer = null;
  }
  if (delayMs > 0) {
    chartTradeButtonSharedLockReleaseTimer = setTimeout(() => {
      if (chartTradeButtonSharedLockSide === side) {
        chartTradeButtonSharedLockSide = null;
      }
      chartTradeButtonSharedLockReleaseTimer = null;
    }, delayMs);
    return;
  }
  chartTradeButtonSharedLockSide = null;
};

export const getChartTradeButtonSharedLockSide = (): TradeSide | null =>
  chartTradeButtonSharedLockSide;
