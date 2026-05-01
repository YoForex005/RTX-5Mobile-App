import { useIsFocused } from '@react-navigation/native';
import { usePathname } from 'expo-router';
import { QuotesScreen } from '../../src/features/quotes/QuotesScreen';

export default function QuotesRoute() {
  const isFocused = useIsFocused();
  const pathname = usePathname();
  // Stay mounted while the user is anywhere in the /quotes route family —
  // including pushed sub-screens like /quotes/details and
  // /quotes/market-statistics. Unmounting the whole subtree on every transient
  // focus flicker (navigation animations, action-sheet opens, sub-screen
  // pushes) would tear down the watchlist WebSocket subscription and row
  // snapshot listeners, so live bid/ask would freeze and the speed/status
  // display would reset to "Connecting..." each time the user came back.
  //
  // Matches the existing pattern used in chart.tsx and trade.tsx.
  const isQuotesStackPath = pathname === '/quotes' || pathname.startsWith('/quotes/');

  if (!isFocused && !isQuotesStackPath) {
    return null;
  }

  return <QuotesScreen />;
}
