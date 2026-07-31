export type ChartTradeActionAvailabilityInput = Readonly<{
  isCurrentChartSymbol: boolean;
  oneClickAccepted: boolean;
  quoteActionAllowed: boolean;
}>;

/**
 * Controls whether Buy/Sell are hard-disabled (no press, dimmed chrome).
 *
 * Even though opening New Order is navigation, the chart tile follows the
 * requested symbol-freshness gate. Both routing modes fail closed when the
 * selected symbol has no executable
 * quote. This keeps the visible control state aligned with the same policy the
 * one-click handler rechecks immediately before submission.
 */
export function resolveChartTradeActionDisabled({
  isCurrentChartSymbol,
  // Retained because routing mode remains part of the public availability
  // input even though stale data blocks both direct trade and Order Ticket entry.
  oneClickAccepted: _oneClickAccepted,
  quoteActionAllowed,
}: ChartTradeActionAvailabilityInput): boolean {
  return !isCurrentChartSymbol || !quoteActionAllowed;
}
