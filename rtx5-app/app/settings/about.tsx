import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadAboutScreen = () => import('../../src/features/settings/AboutScreen').then((module) => module.AboutScreen);

export default function AboutRoute() {
  return <DeferredRouteModule load={loadAboutScreen} title="About" />;
}
