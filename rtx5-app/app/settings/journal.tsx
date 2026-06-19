import { JournalScreen } from '../../src/features/settings/JournalScreen';
import { DeferredRouteScreen } from '../../src/ui/components/DeferredRouteMount';

export default function JournalRoute() {
  return <DeferredRouteScreen Screen={JournalScreen} />;
}
