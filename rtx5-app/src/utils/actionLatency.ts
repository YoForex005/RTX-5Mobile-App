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

  let settled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    const elapsedMs = getInteractionNow() - startedAtMs;
    if (elapsedMs > STALE_ACTION_LATENCY_SAMPLE_MS) {
      return;
    }
    if (label.startsWith('sidebar.menu.')) {
      console.info(`[ActionTiming] ${label} first frame ${Math.round(elapsedMs)}ms`);
    }
    if (elapsedMs > budgetMs) {
      console.warn(
        `[Action] ${label} first frame took ${Math.round(elapsedMs)}ms; budget is ${budgetMs}ms.`,
      );
    }
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(settle);
  }
  timeoutHandle = setTimeout(settle, Math.min(16, Math.max(0, budgetMs)));
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
