/**
 * Bounded auto-retry policy for a failed INITIAL history load.
 *
 * The broker REST `/candles` endpoint is intermittently flaky (multi-second
 * timeouts / transient errors). Without a retry, a single failed fetch leaves
 * the stream entry permanently history-less; the chart render gate
 * (`hasHistoryCandles`) then keeps the chart blank until the user manually
 * switches symbol/timeframe — which is the only thing that mints a fresh entry
 * and re-attempts the fetch. These backoff delays give the initial load a
 * couple of automatic second chances so the chart self-heals on a transient
 * failure instead of requiring a manual symbol switch.
 *
 * Kept in its own dependency-free module so the budget/backoff logic stays unit
 * testable (the parent historyFetching module transitively imports react-native
 * via the REST client and cannot load under the test transformer).
 */
export const HISTORY_FAILURE_RETRY_BACKOFF_MS = [1000, 3000];

export type HistoryRetryPlan = {
  shouldRetry: boolean;
  delayMs: number;
  nextAttempt: number;
};

/**
 * Pure decision for whether a just-failed history load should be auto-retried,
 * and after how long. Only the INITIAL window (non-paginated) is retried, only
 * while no history has arrived, and only until the backoff budget is spent.
 */
export const computeHistoryRetryPlan = (
  entry: { historyCandles: readonly unknown[]; historyRetryAttempt: number },
  isPaginationRequest: boolean,
): HistoryRetryPlan => {
  const attempt = entry.historyRetryAttempt;
  if (
    isPaginationRequest ||
    entry.historyCandles.length > 0 ||
    attempt >= HISTORY_FAILURE_RETRY_BACKOFF_MS.length
  ) {
    return { shouldRetry: false, delayMs: 0, nextAttempt: attempt };
  }
  return {
    shouldRetry: true,
    delayMs: HISTORY_FAILURE_RETRY_BACKOFF_MS[attempt],
    nextAttempt: attempt + 1,
  };
};
