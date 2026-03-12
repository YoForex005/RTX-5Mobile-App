import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { useUserPreferences } from '../state/userPreferences';

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  actions: Array<{ label: string; danger?: boolean; onPress?: () => void }>;
  onClose: () => void;
};

export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';

  const sheetBg = isDark ? '#171d28' : '#ffffff';
  const borderCol = isDark ? '#2a3549' : 'rgba(0,0,0,0.1)';
  const handleCol = isDark ? '#3a465b' : '#c8cdd4';
  const titleCol = isDark ? '#97a4ba' : '#6b7280';
  const dividerCol = isDark ? '#243043' : 'rgba(0,0,0,0.06)';
  const chevronCol = isDark ? '#62718c' : '#9ca3af';
  const cancelBg = isDark ? '#141b27' : '#f3f4f6';
  const overlayBg = isDark ? 'rgba(2, 7, 14, 0.62)' : 'rgba(0, 0, 0, 0.3)';

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
