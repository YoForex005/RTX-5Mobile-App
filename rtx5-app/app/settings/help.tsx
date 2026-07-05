import { Stack, router } from 'expo-router';
import { SettingsRouteLaunchPreview } from '../../src/features/settings/SettingsRouteLaunchPreview';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { safeRouterBack } from '../../src/utils/navigation';

const SETTINGS_ROUTE_MOUNT_DELAY_MS = 0;
const loadHelpScreenRoute = () => import('../../src/features/settings/HelpScreen').then((module) => module.HelpScreen);

export default function HelpRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteModule
        cacheKey="settings/help"
        load={loadHelpScreenRoute}
        mountDelayMs={SETTINGS_ROUTE_MOUNT_DELAY_MS}
        fallback={(
          <SettingsRouteLaunchPreview
            title="Help"
            subtitle="FAQ"
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
