import { Stack, router } from 'expo-router';
import { SettingsRouteLaunchPreview } from '../../src/features/settings/SettingsRouteLaunchPreview';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { safeRouterBack } from '../../src/utils/navigation';

const SETTINGS_ROUTE_MOUNT_DELAY_MS = 0;
const loadEconomicCalendarScreenRoute = () => import('../../src/features/settings/EconomicCalendarScreen').then((module) => module.EconomicCalendarScreen);

export default function EconomicCalendarRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteModule
        cacheKey="settings/economic-calendar"
        load={loadEconomicCalendarScreenRoute}
        mountDelayMs={SETTINGS_ROUTE_MOUNT_DELAY_MS}
        fallback={(
          <SettingsRouteLaunchPreview
            title="Economic Calender"
            subtitle="Market updates"
            icon="calendar-outline"
            onBack={(event) => {
              event.preventDefault();
              event.stopPropagation();
              safeRouterBack(router, '/(tabs)/settings');
            }}
          />
        )}
      />
    </>
  );
}
