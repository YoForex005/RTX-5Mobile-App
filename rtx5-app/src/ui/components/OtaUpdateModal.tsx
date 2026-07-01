import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { OtaUpdatePromptController } from '../../utils/otaUpdates';

type OtaUpdateModalProps = OtaUpdatePromptController;

export function OtaUpdateModal({
  visible,
  targetVersion,
  status,
  progressPercent,
  errorMessage,
  onInstall,
  onRetry,
}: OtaUpdateModalProps) {
  const isInstalling = status === 'downloading' || status === 'restarting';
  const showProgress = isInstalling;
  const buttonText = status === 'error' ? 'Retry install' : 'Install latest version';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.panel} accessibilityViewIsModal>
          <Text style={styles.title}>
            {status === 'error' ? 'Update failed' : `Update ${targetVersion} available`}
          </Text>
          <Text style={styles.message}>
            {status === 'error'
              ? errorMessage ?? 'Please check your internet connection and try again.'
              : `Install the latest version ${targetVersion} to continue with the newest app update.`}
          </Text>

          {showProgress ? (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  {status === 'restarting' ? 'Finishing update' : 'Installing update'}
                </Text>
                <Text style={styles.progressValue}>{progressPercent}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <ActivityIndicator color="#38bdf8" />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={isInstalling}
            onPress={status === 'error' ? onRetry : onInstall}
            style={({ pressed }) => [
              styles.button,
              isInstalling ? styles.buttonDisabled : null,
              pressed && !isInstalling ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.buttonText}>
              {isInstalling ? 'Installing...' : buttonText}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    padding: 20,
    backgroundColor: '#1C1C1E',
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    marginTop: 10,
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
  },
  progressSection: {
    gap: 12,
    marginTop: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  progressValue: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#38bdf8',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: 22,
    borderRadius: 8,
    backgroundColor: '#0ea5e9',
  },
  buttonPressed: {
    backgroundColor: '#0284c7',
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
