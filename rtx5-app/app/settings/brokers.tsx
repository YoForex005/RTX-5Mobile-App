import { router } from 'expo-router';
import { BrokersLaunchShell } from '../../src/features/settings/BrokersLaunchShell';
import {
  brokersLaunchController,
  hideBrokersLaunch,
} from '../../src/features/settings/brokersLaunchController';
import {
  brokerDetailLaunchController,
  scheduleBrokerDetailLaunchNavigation,
  showBrokerDetailLaunch,
  toBrokerDetailLaunchSelection,
} from '../../src/features/settings/brokerDetailLaunchController';
import type { BrokerDirectoryRow } from '../../src/features/settings/BrokersScreen/brokerDirectoryRows';
import {
  BROKERS_ROUTE_MODULE_CACHE_KEY,
  loadBrokersScreenRoute,
} from '../../src/features/settings/BrokersScreen/brokersScreenPreload';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { showSidebarDestination } from '../../src/ui/components/sidebarDestinationHostController';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../src/utils/navigation';

export default function BrokersRoute() {
  const handleSelectBroker = (broker: BrokerDirectoryRow) => {
    const selection = toBrokerDetailLaunchSelection(broker);
    const launchRevision = showBrokerDetailLaunch(selection);
    if (brokersLaunchController.isVisible()) {
      hideBrokersLaunch();
    }
    scheduleBrokerDetailLaunchNavigation(launchRevision, () => {
      router.push({
        pathname: '/settings/broker-detail',
        params: selection,
      });
    });
  };

  return (
    <DeferredRouteModule
      cacheKey={BROKERS_ROUTE_MODULE_CACHE_KEY}
      load={loadBrokersScreenRoute}
      mountDelayMs={0}
      fallback={brokersLaunchController.isVisible() || brokerDetailLaunchController.isVisible()
        ? null
        : (
        <BrokersLaunchShell
          onSelectBroker={handleSelectBroker}
          backLatencyLabel="brokers.route.preview.back"
          onBack={() => {
            showSidebarDestination('accounts', 'route-sync');
            if (brokersLaunchController.isVisible()) {
              hideBrokersLaunch();
            }
            scheduleBackNavigationAfterVisualFrame(() => {
              safeRouterBack(router, '/settings/accounts');
            });
          }}
        />
      )}
    />
  );
}
