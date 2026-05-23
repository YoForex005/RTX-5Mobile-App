import { Stack } from 'expo-router';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadAccountsScreen = () => import('../../src/features/settings/AccountsScreen').then((module) => module.AccountsScreen);

export default function AccountsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteModule load={loadAccountsScreen} title="Accounts" />
    </>
  );
}
