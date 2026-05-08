import { TradeVolumeBounds, resolveTradeVolumeBounds } from '../../utils/tradeVolume';
import { normalizeSymbol } from '../../domain/symbols';
import { ChartOverlayPriceLine } from './chartOverlays';

// Basic constants
export const CHART_TRADE_SLIDER_THUMB_SIZE = 20;
export const CHART_META_FALLBACK_WIDTH = 196;
export const CHART_META_FALLBACK_HEIGHT = 34;
export const CHART_META_DEFAULT_LEFT = 12;
export const CHART_META_DEFAULT_TOP = 10;
export const CHART_TRADE_MINI_PREVIEW_AXIS_WIDTH = 72;
export const CHART_TRADE_MINI_PREVIEW_LEFT_PAD = 0;
export const CHART_TRADE_MINI_PREVIEW_HEIGHT = 316;
export const CHART_TRADE_MINI_PREVIEW_TOP_PAD = 14;
export const CHART_TRADE_MINI_PREVIEW_BOTTOM_PAD = 16;
export const CHART_TRADE_MINI_PREVIEW_TAG_WIDTH = 68;
export const CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT = 22;
export const CHART_DEFAULT_VISIBLE_BAR_MAX = 56;
export const CHART_DEFAULT_VISIBLE_BAR_TARGET_PX = 12;
export const CHART_DEFAULT_VISIBLE_BAR_MIN = 26;
export const CHART_DEFAULT_TIME_SCALE_BAR_SPACING = 13;
export const CHART_DEFAULT_RESET_BAR_SPACING_MAX = 14;
export const CHART_DEFAULT_RESET_BAR_SPACING_MIN = 8;
export const CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET = 0;
export const CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING = 3;
// LightweightCharts v5 LineStyle enum:
//   0 = Solid     []
//   1 = Dotted    [1, 1]  ← MT5/cTrader fine-dot grid (this is what we want)
//   2 = Dashed    [2, 2]
//   3 = LargeDashed [6, 6] ← coarse dashes — looked wrong as a grid
//   4 = SparseDotted [1, 4]
// Older docs (and v4 typings in some bundles) listed the enum in a
// different order, which is why this used to read "= 3 // Dotted". v5's
// canonical enum has Dotted = 1 — see lightweight-charts.standalone.production.js.
export const CHART_GRID_LINE_STYLE = 1;
export const CHART_GRID_HORIZONTAL_LINE_COUNT = 11;
export const CHART_TAP_MENU_PADDING = 10;
export const CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS = 450;
export const CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT = 58;
export const CHART_TRADE_SHEET_TOP_GAP = 10;
export const FOOTER_LOT_PICKER_VALUE_ITEM_HEIGHT = 44;
export const FOOTER_LOT_PICKER_VALUE_ITEM_WIDTH = 56;

export const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

export type ChartTapMenuViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChartTradeTypeTabLayout = { x: number; width: number };
export type ChartTradePreviewDragKey = NonNullable<ChartOverlayPriceLine['dragKey']>;
export type TextInputCommitEvent = { nativeEvent: { text: string } };

// Functions
export function clampValue(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export function clampOverlayOffset(value: number, containerSize: number, overlaySize: number) {
  'worklet';
  return clampValue(
    value,
    CHART_TAP_MENU_PADDING,
    Math.max(CHART_TAP_MENU_PADDING, containerSize - overlaySize - CHART_TAP_MENU_PADDING),
  );
}

export const formatLooseTradeVolumeLabel = (value: number, bounds?: TradeVolumeBounds) => {
  const { decimals } = resolveTradeVolumeBounds(bounds);
  return Number(value.toFixed(decimals)).toString();
};

export function resolveMaxTradeVolumeForMargin(freeMargin: number, marginPerLot: number, bounds: TradeVolumeBounds) {
  const resolved = resolveTradeVolumeBounds(bounds);
  if (!Number.isFinite(freeMargin) || freeMargin <= 0 || !Number.isFinite(marginPerLot) || marginPerLot <= 0) {
    return 0;
  }

  const rawMaxVolume = Math.min(resolved.maxVolume, freeMargin / marginPerLot);
  if (rawMaxVolume < resolved.minVolume) {
    return 0;
  }

  const steppedMaxVolume =
    resolved.minVolume +
    Math.floor((rawMaxVolume - resolved.minVolume) / resolved.stepVolume + 1e-9) * resolved.stepVolume;

  return Math.max(
    0,
    Math.min(
      resolved.maxVolume,
      Number(steppedMaxVolume.toFixed(resolved.decimals)),
    ),
  );
}

export const getChartTradeContractSize = (symbol: string) => {
  const normalized = normalizeSymbol(symbol);
  if (normalized.includes('XAU') || normalized.includes('XAG')) return 100;
  if (normalized.includes('BTC') || normalized.includes('ETH')) return 1;
  if (normalized.includes('US30') || normalized.includes('SPX') || normalized.includes('NAS') || normalized.includes('GER') || normalized.includes('UK')) return 10;
  return 100000;
};

export const resolveTradeStopPreviewPrice = (
  kind: 'sl' | 'tp',
  entryPrice: number,
  side: 'buy' | 'sell',
  offset: number,
  roundPrice: (value: number) => number,
) => {
  const direction = side === 'buy' ? 1 : -1;
  const signedOffset = kind === 'tp' ? offset * direction : -offset * direction;
  return roundPrice(entryPrice + signedOffset);
};
