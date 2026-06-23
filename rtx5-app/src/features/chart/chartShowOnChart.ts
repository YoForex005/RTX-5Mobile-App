export const CHART_SHOW_ON_CHART_ITEMS = [
  {
    key: 'buyTrade',
    label: 'Show buy trade',
    description: 'Shows your open buy positions, with their SL / TP, on the chart.',
  },
  {
    key: 'sellTrade',
    label: 'Show sell trade',
    description: 'Shows your open sell positions, with their SL / TP, on the chart.',
  },
] as const;

export type ChartShowOnChartKey = (typeof CHART_SHOW_ON_CHART_ITEMS)[number]['key'];

export type ChartShowOnChartSettings = Record<ChartShowOnChartKey, boolean>;

export const DEFAULT_CHART_SHOW_ON_CHART: ChartShowOnChartSettings = {
  buyTrade: true,
  sellTrade: true,
};

// Older builds persisted a richer per-feature show-on-chart object (open
// positions, TP/SL, closed positions, signals, HMR, alerts, stop-out) and even
// earlier top-level boolean flags. The model is now just buy/sell trade
// visibility, so any legacy shape collapses to the defaults (both sides shown).
export type LegacyChartShowOnChartState = Partial<{
  showOpenPositions: boolean;
  showTpSlStopLimit: boolean;
  showClosedPositions: boolean;
  showTradingSignals: boolean;
  showHmrPeriods: boolean;
  showPriceAlerts: boolean;
  showPotentialStopOut: boolean;
}>;

export function normalizeChartShowOnChartSettings(
  value?: unknown,
): ChartShowOnChartSettings {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    buyTrade:
      typeof record.buyTrade === 'boolean' ? record.buyTrade : DEFAULT_CHART_SHOW_ON_CHART.buyTrade,
    sellTrade:
      typeof record.sellTrade === 'boolean' ? record.sellTrade : DEFAULT_CHART_SHOW_ON_CHART.sellTrade,
  };
}

export function buildChartShowOnChartSettingsFromLegacy(
  _state: LegacyChartShowOnChartState | null | undefined,
): ChartShowOnChartSettings {
  // Legacy per-feature flags don't map onto buy/sell trade visibility — default
  // to showing both sides.
  return { ...DEFAULT_CHART_SHOW_ON_CHART };
}

export function hasLegacyChartShowOnChartDefaults(
  _state: LegacyChartShowOnChartState | null | undefined,
): boolean {
  // The legacy-defaults reset path no longer applies under the buy/sell model.
  return false;
}
