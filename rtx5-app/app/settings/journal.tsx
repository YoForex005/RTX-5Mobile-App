import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadJournalScreen = () => import('../../src/features/settings/JournalScreen').then((module) => module.JournalScreen);

export default function JournalRoute() {
  return <DeferredRouteModule load={loadJournalScreen} title="Trading Journal" />;
}
