import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadEconomicCalendarScreen = () => import('../../src/features/settings/EconomicCalendarScreen').then((module) => module.EconomicCalendarScreen);

export default function EconomicCalendarRoute() {
  return <DeferredRouteModule load={loadEconomicCalendarScreen} title="Economic Calendar" />;
}
