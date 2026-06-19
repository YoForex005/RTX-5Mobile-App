import { Stack } from 'expo-router';
import { InterfaceScreen } from '../../src/features/settings/InterfaceScreen';
import { DeferredRouteScreen } from '../../src/ui/components/DeferredRouteMount';

export default function InterfaceRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteScreen Screen={InterfaceScreen} />
    </>
  );
}
