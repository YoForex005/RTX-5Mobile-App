import { Stack, router } from 'expo-router';
import { SettingsRouteLaunchPreview } from '../../src/features/settings/SettingsRouteLaunchPreview';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { safeRouterBack } from '../../src/utils/navigation';

const SETTINGS_ROUTE_MOUNT_DELAY_MS = 0;
const loadAboutScreenRoute = () => import('../../src/features/settings/AboutScreen').then((module) => module.AboutScreen);

export default function AboutRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteModule
        cacheKey="settings/about"
        load={loadAboutScreenRoute}
        mountDelayMs={SETTINGS_ROUTE_MOUNT_DELAY_MS}
        fallback={(
          <SettingsRouteLaunchPreview
            title="About"
            subtitle="App information"
            icon="information-circle-outline"
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
