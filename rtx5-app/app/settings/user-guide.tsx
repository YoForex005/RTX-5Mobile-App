import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadUserGuideScreen = () => import('../../src/features/settings/UserGuideScreen').then((module) => module.UserGuideScreen);

export default function UserGuideRoute() {
  return <DeferredRouteModule load={loadUserGuideScreen} title="User Guide" />;
}
