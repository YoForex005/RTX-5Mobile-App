import { scheduleIdleWork } from './startupScheduler';

const SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS = 6000;
const SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS = 500;

const SIDEBAR_ROUTE_MODULE_LOADERS = [
  () => import('../features/trade/TradeScreen'),
  () => import('../features/settings/SettingsScreen'),
  () => import('../features/settings/NewsScreen'),
  () => import('../features/settings/MailboxScreen'),
  () => import('../features/settings/JournalScreen'),
  () => import('../features/settings/EconomicCalendarScreen'),
  () => import('../features/settings/TradersCommunityScreen'),
  () => import('../features/settings/Mql5AlgoTradingScreen'),
  () => import('../features/settings/UserGuideScreen'),
  () => import('../features/settings/AboutScreen'),
  () => import('../features/settings/AccountsScreen'),
  () => import('../features/settings/InterfaceScreen'),
] as const;

let sidebarRouteModuleWarmupStarted = false;

export function warmSidebarRouteModules() {
  if (sidebarRouteModuleWarmupStarted) {
    return () => {};
  }

  sidebarRouteModuleWarmupStarted = true;
  let cancelled = false;
  const cancelScheduledWork: Array<() => void> = [];
  let cursor = 0;

  const warmNextModule = () => {
    if (cancelled || cursor >= SIDEBAR_ROUTE_MODULE_LOADERS.length) {
      return;
    }

    const loadModule = SIDEBAR_ROUTE_MODULE_LOADERS[cursor];
    cursor += 1;
    void loadModule().catch(() => undefined);

    if (cursor < SIDEBAR_ROUTE_MODULE_LOADERS.length) {
      const cancel = scheduleIdleWork(warmNextModule, {
        delayMs: SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS,
        timeoutMs: 1200,
      });
      cancelScheduledWork.push(cancel);
    }
  };

  const cancelInitialWarmup = scheduleIdleWork(warmNextModule, {
    delayMs: SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS,
    timeoutMs: 1800,
  });
  cancelScheduledWork.push(cancelInitialWarmup);

  return () => {
    cancelled = true;
    cancelScheduledWork.forEach((cancel) => cancel());
    cancelScheduledWork.length = 0;
  };
}
