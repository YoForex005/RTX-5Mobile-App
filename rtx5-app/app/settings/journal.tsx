import { JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute } from '../../src/features/settings/JournalScreen/deferredRoute';
import { JournalRouteFallback } from '../../src/features/settings/JournalScreen/JournalRouteFallback';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

export default function JournalRoute() {
  return (
    <DeferredRouteModule
      cacheKey={JOURNAL_ROUTE_CACHE_KEY}
      load={loadJournalScreenRoute}
      fallback={<JournalRouteFallback />}
    />
  );
}
