import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadMql5AlgoTradingScreen = () => import('../../src/features/settings/Mql5AlgoTradingScreen').then((module) => module.Mql5AlgoTradingScreen);

export default function Mql5AlgoTradingRoute() {
  return <DeferredRouteModule load={loadMql5AlgoTradingScreen} title="MQL5 Algo Trading" />;
}
