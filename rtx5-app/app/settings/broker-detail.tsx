import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { BrokerDetailLaunchShell } from '../../src/features/settings/BrokerDetailLaunchShell';
import {
  hideBrokerDetailLaunch,
  normalizeBrokerDetailLaunchSelection,
} from '../../src/features/settings/brokerDetailLaunchController';
import {
  BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY,
  loadBrokerDetailScreenRoute,
} from '../../src/features/settings/brokerDetailScreenPreload';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { safeRouterBack } from '../../src/utils/navigation';

export default function BrokerDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    brokerId?: string;
    brokerName?: string;
    brokerServer?: string;
    brokerServerUrl?: string;
    brokerLogoUrl?: string;
    brokerDomain?: string;
  }>();
  const selection = useMemo(() => normalizeBrokerDetailLaunchSelection({
    brokerId: params.brokerId,
    brokerName: params.brokerName,
    brokerServer: params.brokerServer,
    brokerServerUrl: params.brokerServerUrl,
    brokerLogoUrl: params.brokerLogoUrl,
    brokerDomain: params.brokerDomain,
  }), [
    params.brokerDomain,
    params.brokerId,
    params.brokerLogoUrl,
    params.brokerName,
    params.brokerServer,
    params.brokerServerUrl,
  ]);
  const handleBack = useCallback(() => {
    hideBrokerDetailLaunch();
    safeRouterBack(router, '/settings/brokers');
  }, [router]);
  const handleOpenDemo = useCallback(() => {
    // Keep the route fallback fully actionable while the interactive broker
    // module finishes mounting; this is the same immediate path as Settings.
    hideBrokerDetailLaunch();
    router.push('/register-entry');
  }, [router]);

  return (
    <DeferredRouteModule
      cacheKey={BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY}
      load={loadBrokerDetailScreenRoute}
      mountDelayMs={0}
      fallback={(
        <BrokerDetailLaunchShell
          selection={selection}
          onBack={handleBack}
          onOpenDemo={handleOpenDemo}
          backLatencyLabel="brokerDetail.routeFallback.back"
        />
      )}
    />
  );
}
