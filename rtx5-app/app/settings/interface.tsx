import { Stack } from 'expo-router';
import { InterfaceScreen } from '../../src/features/settings/InterfaceScreen';

export default function InterfaceRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <InterfaceScreen />
    </>
  );
}
