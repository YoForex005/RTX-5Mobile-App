import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: QRCodeSheet
 * 
 * Displays a scannable QR Code containing the encrypted login credentials
 * allowing users to instantaneously connect the active account from a secondary
 * device without manual entry.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import QRCode from 'react-native-qrcode-svg';

interface Props {
  data: string;
  onClose: () => void;
}

export function QRCodeSheet({ data, onClose }: Props) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
      <Text style={styles.title}>Connect from another device</Text>

      <View style={styles.qrContainer}>
        <View style={styles.qrWrapper}>
          <QRCode
            value={data || ' '}
            size={220}
            backgroundColor="white"
            color="black"
          />
        </View>
      </View>

      <Text style={styles.descText}>
        Scan this QR code to connect to the account from another device.
      </Text>

      <Text style={styles.descText}>
        Please treat the code carefully as it contains your account password.
      </Text>
    </View>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: '#1E2530', // From screenshot, dark blue/grey
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingTop: 24,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 32,
  },
  qrContainer: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  descText: {
    color: '#A0AEC0', // Soft grey text
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
});
