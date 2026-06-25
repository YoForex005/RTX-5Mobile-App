import { JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute } from '../features/settings/JournalScreen/deferredRoute';
import { preloadDeferredRouteModule } from '../ui/components/DeferredRouteMount';
import { scheduleIdleWork } from './startupScheduler';

const ACTION_ROUTE_WARMUP_BATCH_SIZE = 8;
const ACTION_ROUTE_WARMUP_BATCH_DELAY_MS = 16;
const ACTION_ROUTE_WARMUP_INITIAL_DELAY_MS = 0;
const ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS = 180;

export const ACTION_ROUTE_WARMUP_PATHS = [
  '/quotes',
  '/chart',
  '/trade',
  '/history',
  '/settings',
  '/settings/news',
  '/settings/user-guide',
  '/settings/help',
  '/settings/about',
  '/settings/mailbox',
  '/settings/journal',
  '/settings/economic-calendar',
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

const ACTION_DEFERRED_MODULE_WARMUPS = [
  { cacheKey: JOURNAL_ROUTE_CACHE_KEY, load: loadJournalScreenRoute },
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

  const scheduleDeferredModuleWarmups = () => {
    const cancel = scheduleIdleWork(() => {
      for (const module of ACTION_DEFERRED_MODULE_WARMUPS) {
        void preloadDeferredRouteModule(module.cacheKey, module.load).catch(() => undefined);
      }
    }, {
      delayMs: ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS,
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
    } else {
      scheduleDeferredModuleWarmups();
    }
  };

  scheduleNextFrame(() => scheduleBatch(ACTION_ROUTE_WARMUP_INITIAL_DELAY_MS));

  return () => {
    cancelled = true;
    cancelScheduledBatches.forEach((cancel) => cancel());
    cancelScheduledBatches.clear();
  };
}
