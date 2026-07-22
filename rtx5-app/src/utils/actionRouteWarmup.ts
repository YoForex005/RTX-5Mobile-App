import { JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute } from '../features/settings/JournalScreen/deferredRoute';
import {
  ACCOUNTS_ROUTE_MODULE_CACHE_KEY,
  loadAccountsScreenRoute,
} from '../features/settings/accountsScreenPreload';
import {
  BROKERS_ROUTE_MODULE_CACHE_KEY,
  loadBrokersScreenRoute,
} from '../features/settings/BrokersScreen/brokersScreenPreload';
import {
  BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY,
  loadBrokerDetailScreenRoute,
} from '../features/settings/brokerDetailScreenPreload';
import {
  MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY,
  SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY,
  loadMarketStatisticsScreenRoute,
  loadSymbolDetailsScreenRoute,
} from '../features/quotes/quotesRoutePreloads';
import {
  ORDER_TICKET_ROUTE_MODULE_CACHE_KEY,
  loadOrderTicketScreenRoute,
} from '../features/trade/orderTicketScreenPreload';
import { preloadDeferredRouteModule } from '../ui/components/DeferredRouteMount';
import { prefetchBrokerServers } from '../query/broker';
import { scheduleIdleWork } from './startupScheduler';

const ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS = 180;

const ACTION_DEFERRED_MODULE_WARMUPS = [
  { cacheKey: JOURNAL_ROUTE_CACHE_KEY, load: loadJournalScreenRoute },
  // /settings/accounts hides its heavy screen behind DeferredRouteModule. Warm
  // only that module so the first "Manage accounts" tap does not wait for
  // evaluation; prefetching the route itself mounts a hidden navigation tree.
  { cacheKey: ACCOUNTS_ROUTE_MODULE_CACHE_KEY, load: loadAccountsScreenRoute },
  // Accounts' + action shows a mounted Brokers shell first; keep the real
  // screen module warm so the shell-to-route handoff completes within frames.
  { cacheKey: BROKERS_ROUTE_MODULE_CACHE_KEY, load: loadBrokersScreenRoute },
  // A broker row shows a live-data shell immediately; warm the full account
  // form so the shell is replaced by interactive controls within a few frames.
  { cacheKey: BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY, load: loadBrokerDetailScreenRoute },
  // Quotes symbol action-sheet destinations hide their heavy screens behind
  // DeferredRouteModule so the sheet tap commits only a light launch preview;
  // warm their modules so the preview lasts about one frame instead of a
  // first-visit module evaluation.
  { cacheKey: ORDER_TICKET_ROUTE_MODULE_CACHE_KEY, load: loadOrderTicketScreenRoute },
  { cacheKey: SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY, load: loadSymbolDetailsScreenRoute },
  { cacheKey: MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY, load: loadMarketStatisticsScreenRoute },
] as const;

let actionResourcesWarmupStarted = false;

const scheduleNextFrame = (callback: () => void) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 16);
};

export function warmActionRoutes() {
  if (actionResourcesWarmupStarted) {
    return () => {};
  }

  actionResourcesWarmupStarted = true;
  // The Brokers preview already looks complete; warm the real directory now so
  // its interactive rows can replace that preview without a loading state.
  void prefetchBrokerServers().catch(() => undefined);
  let cancelled = false;
  let cancelDeferredModuleWarmups: (() => void) | null = null;

  const scheduleDeferredModuleWarmups = () => {
    if (cancelled) {
      return;
    }

    cancelDeferredModuleWarmups = scheduleIdleWork(() => {
      if (cancelled) {
        return;
      }
      for (const module of ACTION_DEFERRED_MODULE_WARMUPS) {
        void preloadDeferredRouteModule(module.cacheKey, module.load).catch(() => undefined);
      }
    }, {
      delayMs: ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS,
      timeoutMs: 1200,
    });
  };

  // Dynamic imports populate the module cache without creating hidden Expo
  // Router scenes. Keep them behind the first paint and an idle delay.
  scheduleNextFrame(scheduleDeferredModuleWarmups);

  return () => {
    cancelled = true;
    cancelDeferredModuleWarmups?.();
    cancelDeferredModuleWarmups = null;
  };
}
