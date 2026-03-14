import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  actions: Array<{ label: string; danger?: boolean; onPress?: () => void }>;
  onClose: () => void;
};

export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Tap-outside-to-dismiss */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

      {/* Content */}
      <View style={{ paddingHorizontal: 0, paddingBottom: Math.max(insets.bottom, 16) }}>
        {/* Sheet */}
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView
            style={styles.actionsScroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
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
                <Text style={[styles.actionText, action.danger ? styles.actionTextDanger : styles.actionTextNormal]}>
                  {action.label}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Cancel */}
        <Pressable
          style={({ pressed }) => [styles.cancelButton, pressed && styles.actionPressed]}
          onPress={onClose}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#000',
    maxHeight: SCREEN_HEIGHT * 0.70,
  },
  handle: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 6,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  title: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingBottom: 12,
    borderBottomWidth: 1,
    color: 'rgba(255,255,255,0.45)',
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  actionsScroll: {
    maxHeight: SCREEN_HEIGHT * 0.55,
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
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
  actionTextNormal: { color: '#fff' },
  actionTextDanger:  { color: '#FF453A' },
  chevron: {
    fontSize: 21,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.25)',
  },
  cancelButton: {
    width: '100%',
    marginTop: 0,
    minHeight: 54,
    borderRadius: 0,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
