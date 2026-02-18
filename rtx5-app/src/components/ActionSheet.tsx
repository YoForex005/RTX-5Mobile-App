import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  actions: Array<{ label: string; danger?: boolean; onPress?: () => void }>;
  onClose: () => void;
};

export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  return (
    <Modal transparent animationType='fade' visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {actions.map((action, index) => (
            <Pressable
              key={action.label}
              onPress={() => {
                action.onPress?.();
                onClose();
              }}
              style={({ pressed }) => [
                styles.action,
                index < actions.length - 1 && styles.actionDivider,
                action.danger && styles.actionDanger,
                pressed && styles.actionPressed,
              ]}
            >
              <Text style={[styles.actionText, action.danger ? styles.actionTextDanger : styles.actionTextDefault]}>
                {action.label}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.actionPressed]} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 7, 14, 0.62)',
    justifyContent: 'flex-end',
    padding: 10,
  },
  sheet: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 430 : undefined,
    alignSelf: 'center',
    backgroundColor: '#171d28',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a3549',
  },
  handle: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 6,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a465b',
  },
  title: {
    color: '#97a4ba',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingBottom: 12,
    borderBottomColor: '#283348',
    borderBottomWidth: 1,
  },
  action: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#243043',
  },
  actionDanger: {
    backgroundColor: 'rgba(255, 75, 66, 0.03)',
  },
  actionPressed: {
    opacity: 0.84,
  },
  actionText: {
    fontSize: 17,
    fontWeight: '500',
  },
  actionTextDefault: {
    color: colors.accent,
  },
  actionTextDanger: {
    color: colors.negative,
  },
  chevron: {
    color: '#62718c',
    fontSize: 21,
    lineHeight: 21,
  },
  cancelButton: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 430 : undefined,
    alignSelf: 'center',
    marginTop: 8,
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3549',
    backgroundColor: '#141b27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '600',
  },
});
