import { Stack } from 'expo-router';
import { AccountsScreen } from '../../src/features/settings/AccountsScreen';
import { DeferredRouteScreen } from '../../src/ui/components/DeferredRouteMount';

export default function AccountsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteScreen Screen={AccountsScreen} />
    </>
  );
}
