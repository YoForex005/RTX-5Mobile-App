export type ChartReadyIdentity = {
  initSignature: string;
  configSig: string;
  dataContextSig: string;
};

export type CurrentChartIdentity = {
  configSig: string;
  dataContextSig: string;
};

export type ChartDataPaintIdentity = {
  paintToken: string;
  dataContextSig: string;
};

/**
 * A WebView can finish painting an older candle snapshot after a newer live
 * tick has already been dispatched. That acknowledgement is still valid when
 * it belongs to the active symbol/timeframe and visual shell; the native host
 * immediately synchronizes the newest retained snapshot after accepting it.
 */
export const shouldAcceptChartReady = (
  ready: ChartReadyIdentity,
  current: CurrentChartIdentity,
  latestDispatch: CurrentChartIdentity,
): boolean =>
  ready.initSignature.length > 0 &&
  ready.configSig === current.configSig &&
  ready.dataContextSig === current.dataContextSig &&
  ready.configSig === latestDispatch.configSig &&
  ready.dataContextSig === latestDispatch.dataContextSig;

export const shouldAcceptChartDataPaint = (
  painted: ChartDataPaintIdentity,
  pending: ChartDataPaintIdentity,
  currentDataContextSig: string,
): boolean =>
  painted.paintToken.length > 0 &&
  painted.paintToken === pending.paintToken &&
  painted.dataContextSig === pending.dataContextSig &&
  painted.dataContextSig === currentDataContextSig;
