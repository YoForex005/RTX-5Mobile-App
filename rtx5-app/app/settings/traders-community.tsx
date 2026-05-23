import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadTradersCommunityScreen = () => import('../../src/features/settings/TradersCommunityScreen').then((module) => module.TradersCommunityScreen);

export default function TradersCommunityRoute() {
  return <DeferredRouteModule load={loadTradersCommunityScreen} title="Traders Community" />;
}
