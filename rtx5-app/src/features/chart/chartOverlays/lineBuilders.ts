/**
 * Builders for the price-line layer of chart overlays — pending orders,
 * price alerts, and the potential stop-out warning line.
 */
import type { PriceAlert } from '../../../api/alerts';
import type { LoginOrder } from '../../../api/orders';
import type { PositionItem } from '../../../dev/mock/tradingData';
import type { ChartColorsConfig } from '../../../state/userPreferences';
import { buildPendingOrderLabel, formatTpSlOverlayLabel, isActivePendingOrder } from './orderHelpers';
import { inferContractSize, normalizeChartOverlaySymbol } from './symbolUtils';
import {
  CHART_LINE_STYLE,
  STOP_OUT_MARGIN_LEVEL_FRACTION,
  type ChartOverlayCandle,
  type ChartOverlayLiveAccount,
  type ChartOverlayPriceLine,
} from './types';

export const buildPendingOrderLines = (
  orders: LoginOrder[],
  colors: ChartColorsConfig,
  sellColor: string,
): ChartOverlayPriceLine[] => {
  return orders.reduce<ChartOverlayPriceLine[]>((accumulator, order) => {
    if (!isActivePendingOrder(order)) return accumulator;

    const entryPrice = Number(order.price_open);
    const slValue = Number(order.price_sl);
    const tpValue = Number(order.price_tp);
    const entryColor = order.side === 'buy' ? colors.tradeOpen || '#2962FF' : sellColor;

    if (Number.isFinite(entryPrice) && entryPrice > 0) {
      accumulator.push({
        id: `order-entry-${order.ticket}`,
        price: entryPrice,
        color: entryColor,
        lineWidth: 2,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: buildPendingOrderLabel(order),
      });
    }

    if (Number.isFinite(tpValue) && tpValue > 0) {
      accumulator.push({
        id: `order-tp-${order.ticket}`,
        price: tpValue,
        color: colors.tradeTpSl || '#089981',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: formatTpSlOverlayLabel('tp', order.symbol, entryPrice, tpValue, Number(order.volume)),
      });
    }

    if (Number.isFinite(slValue) && slValue > 0) {
      accumulator.push({
        id: `order-sl-${order.ticket}`,
        price: slValue,
        color: colors.tradeStopOut || '#F23645',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: formatTpSlOverlayLabel('sl', order.symbol, entryPrice, slValue, Number(order.volume)),
      });
    }

    return accumulator;
  }, []);
};

export const buildPriceAlertLines = (
  alerts: PriceAlert[],
  chartSymbol: string,
): ChartOverlayPriceLine[] => {
  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);

  return alerts
    .filter((alert) => !alert.triggered)
    .filter((alert) => normalizeChartOverlaySymbol(alert.symbol) === normalizedChartSymbol)
    .map((alert) => ({
      id: `alert-${alert.id}`,
      price: alert.price,
      color: alert.condition === 'above' ? '#10B981' : '#F59E0B',
      lineWidth: 1,
      lineStyle: CHART_LINE_STYLE.SparseDotted,
      axisLabelVisible: true,
      title: alert.condition === 'above' ? 'ALERT ABOVE' : 'ALERT BELOW',
    }));
};

export const buildPotentialStopOutLine = (
  positions: PositionItem[],
  candles: ChartOverlayCandle[],
  liveAccount: ChartOverlayLiveAccount | null | undefined,
  colors: ChartColorsConfig,
): ChartOverlayPriceLine | null => {
  if (positions.length === 0 || !liveAccount) return null;

  const equity = Number(liveAccount.equity ?? 0);
  const margin = Number(liveAccount.margin ?? 0);
  if (!Number.isFinite(equity) || !Number.isFinite(margin) || equity <= 0 || margin <= 0) {
    return null;
  }

  const stopOutEquity = margin * STOP_OUT_MARGIN_LEVEL_FRACTION;
  const lossBudget = equity - stopOutEquity;
  if (!Number.isFinite(lossBudget) || lossBudget <= 0) return null;

  const totalExposure = positions.reduce((sum, position) => {
    const contractSize = inferContractSize(position.symbol);
    const signedVolume = position.side === 'buy' ? position.volume : -position.volume;
    return sum + signedVolume * contractSize;
  }, 0);

  if (!Number.isFinite(totalExposure) || Math.abs(totalExposure) < 0.000001) return null;

  const candlePrice = candles[candles.length - 1]?.close;
  const weightedPositionPrice =
    positions.reduce((sum, position) => sum + position.currentPrice * Math.abs(position.volume), 0) /
    Math.max(1, positions.reduce((sum, position) => sum + Math.abs(position.volume), 0));

  const currentPrice = Number.isFinite(candlePrice) && candlePrice! > 0 ? candlePrice! : weightedPositionPrice;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const priceDelta = lossBudget / Math.abs(totalExposure);
  const stopOutPrice = currentPrice - Math.sign(totalExposure) * priceDelta;
  if (!Number.isFinite(stopOutPrice) || stopOutPrice <= 0) return null;

  return {
    id: 'potential-stop-out',
    price: stopOutPrice,
    color: colors.tradeStopOut || '#DC2626',
    lineWidth: 1,
    lineStyle: CHART_LINE_STYLE.LargeDashed,
    axisLabelVisible: true,
    title: 'STOP OUT',
  };
};
