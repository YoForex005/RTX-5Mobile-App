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

const IOS_SECURE_STORE_WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const setSecureItemAsync = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(
    key,
    value,
    Platform.OS === 'ios' ? IOS_SECURE_STORE_WRITE_OPTIONS : undefined,
  );
};

export const getSecureItemAsync = async (key: string): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn('[SecureStorage] Failed to read secure item', { key, error });
    return null;
  }
};

export const removeSecureItemAsync = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
};
