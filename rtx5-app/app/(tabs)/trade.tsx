import { useIsFocused } from '@react-navigation/native';
import { TradeScreen } from '../../src/features/trade/TradeScreen';

export default function TradeRoute() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return <TradeScreen />;
}
