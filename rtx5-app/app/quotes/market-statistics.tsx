import { router, useLocalSearchParams } from 'expo-router';
import { QuoteInfoLaunchShell } from '../../src/features/quotes/QuoteInfoLaunchShell';
import { hideQuoteInfoLaunch } from '../../src/features/quotes/quoteInfoLaunchController';
import {
  MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY,
  loadMarketStatisticsScreenRoute,
} from '../../src/features/quotes/quotesRoutePreloads';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../src/utils/navigation';

export default function MarketStatisticsRoute() {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();

  return (
    <DeferredRouteModule
      cacheKey={MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY}
      load={loadMarketStatisticsScreenRoute}
      fallback={(
        <QuoteInfoLaunchShell
          destination="market-statistics"
          symbol={symbol || 'EURUSD'}
          backLatencyLabel="quoteInfo.route.marketStatistics.back"
          onBack={() => {
            hideQuoteInfoLaunch();
            scheduleBackNavigationAfterVisualFrame(() => {
              safeRouterBack(router, '/(tabs)/quotes');
            });
          }}
        />
      )}
    />
  );
}
