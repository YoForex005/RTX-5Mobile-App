import { useIsFocused } from '@react-navigation/native';
import { usePathname } from 'expo-router';
import { ChartScreen } from '../../src/features/chart/ChartScreen';

export default function ChartRoute() {
  const isFocused = useIsFocused();
  const pathname = usePathname();
  const isChartStackPath = pathname === '/chart' || pathname.startsWith('/chart/');

  if (!isFocused && !isChartStackPath) {
    return null;
  }

  return <ChartScreen />;
}
