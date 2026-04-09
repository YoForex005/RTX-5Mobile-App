import { Stack } from 'expo-router';
import { HistoryFilterScreen } from '../../src/features/history/HistoryFilterScreen';

export default function HistoryFilterRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <HistoryFilterScreen />
    </>
  );
}
