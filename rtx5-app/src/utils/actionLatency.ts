// This is a local first-frame acknowledgement budget for app-side touch work.
// Network completion, native screen mounting, and backend responses are measured
// separately because they cannot be guaranteed inside one 20ms frame budget.
export const APP_ACTION_MAX_LATENCY_MS = 20;
export const CRITICAL_TRADE_ACTION_MAX_LATENCY_MS = 10;
export const FAST_PRESS_GUARD_RESET_MS = 120;
const STALE_ACTION_LATENCY_SAMPLE_MS = 5000;

export function getInteractionNow() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

export function scheduleActionLatencyCheck(
  label: string,
  startedAtMs: number,
  budgetMs = APP_ACTION_MAX_LATENCY_MS,
) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }

  const runAfterFirstFrame: (callback: (time: number) => void) => number =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (callback) => {
          setTimeout(() => callback(getInteractionNow()), 16);
          return 0;
        };

  runAfterFirstFrame(() => {
    const elapsedMs = getInteractionNow() - startedAtMs;
    if (elapsedMs > STALE_ACTION_LATENCY_SAMPLE_MS) {
      return;
    }
    if (elapsedMs > budgetMs) {
      console.warn(
        `[Action] ${label} first frame took ${Math.round(elapsedMs)}ms; budget is ${budgetMs}ms.`,
      );
    }
  });
}

export function runImmediateAction<T>(
  label: string,
  action: () => T,
  budgetMs = APP_ACTION_MAX_LATENCY_MS,
): T {
  const startedAtMs = getInteractionNow();
  try {
    return action();
  } finally {
    scheduleActionLatencyCheck(label, startedAtMs, budgetMs);
  }
}

export function runCriticalTradeAction<T>(
  label: string,
  action: () => T,
): T {
  return runImmediateAction(label, action, CRITICAL_TRADE_ACTION_MAX_LATENCY_MS);
}
