import { Stack, router } from 'expo-router';
import { SettingsRouteLaunchPreview } from '../../src/features/settings/SettingsRouteLaunchPreview';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { safeRouterBack } from '../../src/utils/navigation';

const SETTINGS_ROUTE_MOUNT_DELAY_MS = 0;
const loadInterfaceScreenRoute = () => import('../../src/features/settings/InterfaceScreen').then((module) => module.InterfaceScreen);

export default function InterfaceRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteModule
        cacheKey="settings/interface"
        load={loadInterfaceScreenRoute}
        mountDelayMs={SETTINGS_ROUTE_MOUNT_DELAY_MS}
        fallback={(
          <SettingsRouteLaunchPreview
            title="Language Preference"
            subtitle="Select language"
            icon="browsers-outline"
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
