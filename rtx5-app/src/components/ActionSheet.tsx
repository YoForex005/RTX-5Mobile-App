import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  actions: Array<{ label: string; danger?: boolean; onPress?: () => void }>;
  onClose: () => void;
};

export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  const T = useTheme();
  const sheetBg = T.glass1;
  const borderCol = T.border;
  const handleCol = T.borderMedium;
  const titleCol = T.textMuted;
  const dividerCol = T.borderSubtle;
  const chevronCol = T.textDimmed;
  const cancelBg = T.glass2;
  const overlayBg = 'rgba(0,0,0,0.60)';

  return (
    <Modal transparent animationType='fade' visible={visible} onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: overlayBg }]} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: sheetBg, borderColor: borderCol }]}>
          <View style={[styles.handle, { backgroundColor: handleCol }]} />
          {title ? <Text style={[styles.title, { color: titleCol, borderBottomColor: dividerCol }]}>{title}</Text> : null}
          {actions.map((action, index) => (
            <Pressable
              key={action.label}
              onPress={() => {
                action.onPress?.();
                onClose();
              }}
              style={({ pressed }) => [
                styles.action,
                index < actions.length - 1 && [styles.actionDivider, { borderBottomColor: dividerCol }],
                action.danger && styles.actionDanger,
                pressed && styles.actionPressed,
              ]}
            >
              <Text style={[styles.actionText, action.danger ? { color: T.down } : { color: T.accent }]}>
                {action.label}
              </Text>
              <Text style={[styles.chevron, { color: chevronCol }]}>›</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={({ pressed }) => [styles.cancelButton, { backgroundColor: cancelBg, borderColor: borderCol }, pressed && styles.actionPressed]} onPress={onClose}>
          <Text style={[styles.cancelText, { color: T.accent }]}>Cancel</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 10,
  },
  sheet: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 430 : undefined,
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  handle: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 6,
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingBottom: 12,
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
  chevron: {
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
