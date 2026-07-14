import { router } from 'expo-router';
import { BrokersLaunchShell } from '../../src/features/settings/BrokersLaunchShell';
import { hideBrokersLaunch } from '../../src/features/settings/brokersLaunchController';
import {
  BROKERS_ROUTE_MODULE_CACHE_KEY,
  loadBrokersScreenRoute,
} from '../../src/features/settings/BrokersScreen/brokersScreenPreload';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { showSidebarDestination } from '../../src/ui/components/sidebarDestinationHostController';
import { safeRouterBack } from '../../src/utils/navigation';

export default function BrokersRoute() {
  return (
    <DeferredRouteModule
      cacheKey={BROKERS_ROUTE_MODULE_CACHE_KEY}
      load={loadBrokersScreenRoute}
      mountDelayMs={0}
      fallback={(
        <BrokersLaunchShell
          backLatencyLabel="brokers.route.preview.back"
          onBack={() => {
            showSidebarDestination('accounts', 'route-sync');
            hideBrokersLaunch();
            safeRouterBack(router, '/settings/accounts');
          }}
        />
      )}
    />
  );
}
