"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CHART_SHOW_ON_CHART = exports.CHART_SHOW_ON_CHART_ITEMS = void 0;
exports.normalizeChartShowOnChartSettings = normalizeChartShowOnChartSettings;
exports.buildChartShowOnChartSettingsFromLegacy = buildChartShowOnChartSettingsFromLegacy;
exports.hasLegacyChartShowOnChartDefaults = hasLegacyChartShowOnChartDefaults;
exports.CHART_SHOW_ON_CHART_ITEMS = [
    {
        key: 'openPositions',
        label: 'Open positions',
        description: 'Keeps active trade entries visible on the chart until disabled or closed.',
    },
    {
        key: 'tpSlStopLimit',
        label: 'TP / SL / Stop / Limit',
        description: 'Shows protective and pending trade levels for active positions.',
    },
    {
        key: 'closedPositions',
        label: 'Closed positions',
        description: 'Displays markers for recently closed trades on the active symbol.',
    },
    {
        key: 'tradingSignals',
        label: 'Trading signals',
        description: 'Displays signal markers when signal overlays are enabled.',
    },
    {
        key: 'hmrPeriods',
        label: 'HMR periods',
        description: 'Displays highlighted high market volatility periods.',
    },
    {
        key: 'priceAlerts',
        label: 'Price alerts',
        description: 'Displays active alert levels for the current instrument.',
    },
    {
        key: 'potentialStopOut',
        label: 'Potential Stop Out line',
        description: 'Displays the estimated stop-out level derived from current exposure.',
    },
];
exports.DEFAULT_CHART_SHOW_ON_CHART = {
    openPositions: true,
    tpSlStopLimit: true,
    closedPositions: false,
    tradingSignals: false,
    hmrPeriods: false,
    priceAlerts: false,
    potentialStopOut: false,
};
const LEGACY_CHART_SHOW_ON_CHART_DEFAULTS = {
    openPositions: true,
    tpSlStopLimit: true,
    closedPositions: false,
    tradingSignals: false,
    hmrPeriods: true,
    priceAlerts: true,
    potentialStopOut: true,
};
function normalizeChartShowOnChartSettings(value) {
    return {
        ...exports.DEFAULT_CHART_SHOW_ON_CHART,
        ...(value ?? {}),
    };
}
function buildChartShowOnChartSettingsFromLegacy(state) {
    return normalizeChartShowOnChartSettings({
        openPositions: state?.showOpenPositions,
        tpSlStopLimit: state?.showTpSlStopLimit,
        closedPositions: state?.showClosedPositions,
        tradingSignals: state?.showTradingSignals,
        hmrPeriods: state?.showHmrPeriods,
        priceAlerts: state?.showPriceAlerts,
        potentialStopOut: state?.showPotentialStopOut,
    });
}
function hasLegacyChartShowOnChartDefaults(state) {
    const normalized = buildChartShowOnChartSettingsFromLegacy(state);
    return (normalized.openPositions === LEGACY_CHART_SHOW_ON_CHART_DEFAULTS.openPositions &&
        normalized.tpSlStopLimit === LEGACY_CHART_SHOW_ON_CHART_DEFAULTS.tpSlStopLimit &&
        normalized.closedPositions === LEGACY_CHART_SHOW_ON_CHART_DEFAULTS.closedPositions &&
        normalized.tradingSignals === LEGACY_CHART_SHOW_ON_CHART_DEFAULTS.tradingSignals &&
        normalized.hmrPeriods === LEGACY_CHART_SHOW_ON_CHART_DEFAULTS.hmrPeriods &&
        normalized.priceAlerts === LEGACY_CHART_SHOW_ON_CHART_DEFAULTS.priceAlerts &&
        normalized.potentialStopOut === LEGACY_CHART_SHOW_ON_CHART_DEFAULTS.potentialStopOut);
}
