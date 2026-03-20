import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { HistoryFilterScreen } from '../../src/features/history/HistoryFilterScreen';
import { useTheme } from '../../src/theme/useTheme';

export default function HistoryFilterRoute() {
  const T = useTheme();
  return (
    <>
      <Stack.Screen 
        options={{ 
          title: 'History Filter', 
          headerShown: true,
          headerBackVisible: true,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ marginLeft: 15 }}>
              <Ionicons 
                name="arrow-back" 
                size={24} 
                color={T.text} 
              />
            </Pressable>
          )
        }} 
      />
      <HistoryFilterScreen />
    </>
  );
}
