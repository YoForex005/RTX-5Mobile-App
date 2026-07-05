import { JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute } from '../../src/features/settings/JournalScreen/deferredRoute';
import { JournalRouteFallback } from '../../src/features/settings/JournalScreen/JournalRouteFallback';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const SETTINGS_ROUTE_MOUNT_DELAY_MS = 0;

export default function JournalRoute() {
  return (
    <DeferredRouteModule
      cacheKey={JOURNAL_ROUTE_CACHE_KEY}
      load={loadJournalScreenRoute}
      mountDelayMs={SETTINGS_ROUTE_MOUNT_DELAY_MS}
      fallback={<JournalRouteFallback />}
    />
  );
}
