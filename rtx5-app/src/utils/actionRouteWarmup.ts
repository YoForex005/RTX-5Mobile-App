import { scheduleIdleWork } from './startupScheduler';

const ACTION_ROUTE_WARMUP_BATCH_SIZE = 1;
const ACTION_ROUTE_WARMUP_BATCH_DELAY_MS = 750;
const ACTION_ROUTE_WARMUP_INITIAL_DELAY_MS = 30000;

export const ACTION_ROUTE_WARMUP_PATHS = [
  '/(tabs)/quotes',
  '/(tabs)/chart',
  '/(tabs)/trade',
  '/(tabs)/history',
  '/(tabs)/settings',
  '/settings/news',
  '/settings/user-guide',
  '/settings/about',
  '/settings/mailbox',
  '/settings/journal',
  '/settings/economic-calendar',
  '/settings/traders-community',
  '/settings/mql5-algo-trading',
  '/settings/accounts',
  '/settings/interface',
  '/register',
  '/login',
  '/trade/order-ticket',
  '/trade/close-position',
  '/trade/close-by',
  '/trade/modify-position',
  '/trade/bulk',
  '/history/filter',
  '/chart/objects',
  '/chart/settings',
  '/chart/indicators',
  '/chart/specification',
  '/chart/alerts',
  '/chart/menu-order',
  '/chart/price-source',
  '/chart/open-order-mode',
  '/chart/calculator',
  '/chart/analytics',
] as const;

type PrefetchRouter = {
  prefetch?: (href: string) => void;
};

let actionRoutesWarmupStarted = false;

const scheduleNextFrame = (callback: () => void) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 16);
};

export function warmActionRoutes(router: PrefetchRouter) {
  if (actionRoutesWarmupStarted || typeof router.prefetch !== 'function') {
    return () => {};
  }

  actionRoutesWarmupStarted = true;
  let cancelled = false;
  const cancelScheduledBatches = new Set<() => void>();
  let cursor = 0;

  const scheduleBatch = (delayMs: number) => {
    let cancel: (() => void) | null = null;
    const scheduledRun = () => {
      if (cancel) {
        cancelScheduledBatches.delete(cancel);
      }
      runBatch();
    };

    cancel = scheduleIdleWork(scheduledRun, {
      delayMs,
      timeoutMs: 1200,
    });
    cancelScheduledBatches.add(cancel);
  };

  const runBatch = () => {
    if (cancelled) {
      return;
    }

    const end = Math.min(cursor + ACTION_ROUTE_WARMUP_BATCH_SIZE, ACTION_ROUTE_WARMUP_PATHS.length);
    for (; cursor < end; cursor += 1) {
      try {
        router.prefetch?.(ACTION_ROUTE_WARMUP_PATHS[cursor]);
      } catch {
        // A warm-up miss must never block or break the visible app path.
      }
    }

    if (cursor < ACTION_ROUTE_WARMUP_PATHS.length) {
      scheduleBatch(ACTION_ROUTE_WARMUP_BATCH_DELAY_MS);
    }
  };

  scheduleNextFrame(() => scheduleBatch(ACTION_ROUTE_WARMUP_INITIAL_DELAY_MS));

  return () => {
    cancelled = true;
    cancelScheduledBatches.forEach((cancel) => cancel());
    cancelScheduledBatches.clear();
  };
}
