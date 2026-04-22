import { useIsFocused } from '@react-navigation/native';
import { usePathname } from 'expo-router';
import { TradeScreen } from '../../src/features/trade/TradeScreen';

export default function TradeRoute() {
  const isFocused = useIsFocused();
  const pathname = usePathname();
  const isTradeStackPath = pathname === '/trade' || pathname.startsWith('/trade/');

  if (!isFocused && !isTradeStackPath) {
    return null;
  }

  return <TradeScreen />;
}
