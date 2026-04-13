import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Platform-aware Secure Storage Wrapper.
 * 
 * Uses Expo SecureStore (Keychain/Keystore) natively to meet security controls.
 * Falls back to AsyncStorage on Web where SecureStore is not natively supported,
 * preventing 'Cannot read properties of undefined' crashes.
 */

export const setSecureItemAsync = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

export const getSecureItemAsync = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return await AsyncStorage.getItem(key);
  }
  return await SecureStore.getItemAsync(key);
};

export const removeSecureItemAsync = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
};
