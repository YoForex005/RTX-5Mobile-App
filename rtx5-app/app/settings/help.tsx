import { HelpScreen } from '../../src/features/settings/HelpScreen';
import { DeferredRouteScreen } from '../../src/ui/components/DeferredRouteMount';

export default function HelpRoute() {
  return <DeferredRouteScreen Screen={HelpScreen} />;
}
