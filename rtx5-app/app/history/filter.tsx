import { Stack, useLocalSearchParams } from 'expo-router';
import { HistoryFilterScreen } from '../../src/features/history/HistoryFilterScreen';
import { HistoryNetProfitLossScreen } from '../../src/features/history/HistoryNetProfitLossScreen';

export default function HistoryFilterRoute() {
  const params = useLocalSearchParams<{ view?: string }>();

  if (params.view === 'net-pnl') {
    return <HistoryNetProfitLossScreen />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <HistoryFilterScreen />
    </>
  );
}
