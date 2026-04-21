import { useIsFocused } from '@react-navigation/native';
import { ChartScreen } from '../../src/features/chart/ChartScreen';

export default function ChartRoute() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return <ChartScreen />;
}
