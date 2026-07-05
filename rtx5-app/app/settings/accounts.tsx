import { Stack, router } from 'expo-router';
import { SettingsRouteLaunchPreview } from '../../src/features/settings/SettingsRouteLaunchPreview';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import { safeRouterBack } from '../../src/utils/navigation';

const SETTINGS_ROUTE_MOUNT_DELAY_MS = 0;
const loadAccountsScreenRoute = () => import('../../src/features/settings/AccountsScreen').then((module) => module.AccountsScreen);

export default function AccountsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteModule
        cacheKey="settings/accounts"
        load={loadAccountsScreenRoute}
        mountDelayMs={SETTINGS_ROUTE_MOUNT_DELAY_MS}
        fallback={(
          <SettingsRouteLaunchPreview
            title="Accounts"
            subtitle="Manage trading accounts"
            icon="server-outline"
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
