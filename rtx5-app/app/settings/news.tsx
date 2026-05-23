import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadNewsScreen = () => import('../../src/features/settings/NewsScreen').then((module) => module.NewsScreen);

export default function NewsRoute() {
  return <DeferredRouteModule load={loadNewsScreen} title="Market News" />;
}
