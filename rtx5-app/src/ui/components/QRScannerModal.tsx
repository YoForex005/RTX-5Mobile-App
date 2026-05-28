import { FastPressable as Pressable } from './FastPressable';
import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, View, Platform, Alert, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import { OVERLAY_MODAL_PROPS } from '../overlayModalProps';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export function QRScannerModal({ visible, onClose, onScan }: QRScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const T = useTheme();

  useEffect(() => {
    if (visible) {
      setScanned(false);
    }
  }, [visible]);

  if (!visible) return null;

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // On iOS, once permission has been denied the system silently ignores
    // requestPermission() and never re-prompts. The only way the user can
    // re-grant is via the Settings app — so route them there in that case.
    const mustOpenSettings = !permission.canAskAgain;
    const handleGrantPress = async () => {
      if (mustOpenSettings) {
        await Linking.openSettings().catch(() => undefined);
        return;
      }
      const result = await requestPermission();
      if (!result.granted && !result.canAskAgain) {
        Alert.alert(
          'Camera access required',
          'Please enable camera access for RTX-5 in your device Settings to scan QR codes.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
          ],
        );
      }
    };

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        {...OVERLAY_MODAL_PROPS}
        onRequestClose={onClose}
      >
        <View style={[styles.container, { backgroundColor: T.bg }]}>
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={48} color={T.text} style={{ marginBottom: 16 }} />
            <Text style={[styles.message, { color: T.text }]}>
              {mustOpenSettings
                ? 'Camera access was previously denied. Enable it in your device Settings to scan QR codes.'
                : 'RTX-5 needs access to your camera to scan QR codes for quick pairing or logins.'}
            </Text>
            <Pressable style={[styles.button, { backgroundColor: T.accent }]} onPress={handleGrantPress}>
              <Text style={styles.buttonText}>
                {mustOpenSettings ? 'Open Settings' : 'Grant Camera Access'}
              </Text>
            </Pressable>
            <Pressable style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: T.border, marginTop: 12 }]} onPress={onClose}>
              <Text style={[styles.buttonText, { color: T.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  const handleBarcodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScan(data);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      {...OVERLAY_MODAL_PROPS}
      onRequestClose={onClose}
    >
      <View style={styles.cameraContainer}>
        {Platform.OS !== 'web' ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="desktop-outline" size={64} color="#FFF" style={{ opacity: 0.5 }} />
            <Text style={{ color: '#FFF', marginTop: 16, fontSize: 16, fontWeight: '600' }}>Camera not supported on Web Demo</Text>
          </View>
        )}

        {/* Darkened Overlay around the framing box */}
        <View style={styles.overlay}>
          {/* Header area */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#FFF" />
            </Pressable>
          </View>
          
          <View style={styles.frameContainer}>
            {/* The transparent focus box */}
            <View style={styles.frame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text style={styles.promptText}>Align QR code within the frame</Text>
          </View>
          
          {/* Footer area */}
          <View style={styles.footer} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionBox: {
    width: '100%',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(128,128,128,0.05)',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 32,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.3)', // dims everything outside the box slightly natively, but we just dim the whole screen slightly
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 260,
    height: 260,
    borderWidth: 0,
    position: 'relative',
    backgroundColor: 'transparent',
    // To make it look "punched out", you typically overlay boxes around it. 
    // Here we keep it simple with just corners and a slight dim over everything else.
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#3B82F6', // Blue accent
    borderWidth: 4,
  },
  topLeft: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 20 },
  topRight: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 20 },
  bottomLeft: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 20 },
  bottomRight: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 20 },
  promptText: {
    color: '#FFF',
    marginTop: 40,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  footer: {
    height: 100,
  }
});
