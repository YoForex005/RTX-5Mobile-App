/**
 * Deprecated compatibility hook.
 *
 * Candle data must come from backend history plus backend live candle
 * snapshots. This hook intentionally performs no timer-based candle creation.
 */
export function useLiveTickSimulator(_symbol: string, _timeframe: string, _isDemo: boolean = true) {
  return;
}
