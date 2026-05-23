import { Stack } from 'expo-router';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadInterfaceScreen = () => import('../../src/features/settings/InterfaceScreen').then((module) => module.InterfaceScreen);

export default function InterfaceRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeferredRouteModule load={loadInterfaceScreen} title="Language Preference" />
    </>
  );
}
