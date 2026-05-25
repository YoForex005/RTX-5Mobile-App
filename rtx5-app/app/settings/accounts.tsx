import { Stack } from 'expo-router';
import { AccountsScreen } from '../../src/features/settings/AccountsScreen';

export default function AccountsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountsScreen />
    </>
  );
}
