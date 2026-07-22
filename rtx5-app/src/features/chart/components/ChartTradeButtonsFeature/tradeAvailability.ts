export type ChartTradeActionAvailabilityInput = Readonly<{
  isCurrentChartSymbol: boolean;
  oneClickAccepted: boolean;
  quoteActionAllowed: boolean;
}>;

/**
 * Controls whether Buy/Sell are hard-disabled (no press, dimmed chrome).
 *
 * Opening New Order is navigation — never quote-gated.
 * One-click market execution still fails closed **inside the handler** when the
 * quote is not executable, but the tiles stay bright and pressable so the user
 * gets an explicit error instead of a dead, half-transparent control.
 */
export function resolveChartTradeActionDisabled({
  isCurrentChartSymbol,
  // Retained for call-site / contract stability; quote gates are handler-only.
  oneClickAccepted: _oneClickAccepted,
  quoteActionAllowed: _quoteActionAllowed,
}: ChartTradeActionAvailabilityInput): boolean {
  return !isCurrentChartSymbol;
}
