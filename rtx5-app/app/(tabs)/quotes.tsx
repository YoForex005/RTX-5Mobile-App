import { useIsFocused } from '@react-navigation/native';
import { QuotesScreen } from '../../src/features/quotes/QuotesScreen';

export default function QuotesRoute() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return <QuotesScreen />;
}
