import { AccountsScreen } from '../../src/features/settings/AccountsScreen';
import { Stack } from 'expo-router';

export default function AccountsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountsScreen />
    </>
  );
}
