/**
 * Global reusable ActionSheet component.
 * 
 * Provides a native-feeling bottom sheet overlay for contextual actions.
 * Highly configurable and typically controlled via the global `useUIState` store
 * rather than local component state.
 */
import React, { useState, useEffect } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../theme/useTheme';
import { useUserPreferences } from '../state/userPreferences';

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  actions: Array<{ label: string; danger?: boolean; onPress?: () => void; icon?: React.ReactNode }>;
  onClose: () => void;
  searchable?: boolean;
};

export function ActionSheet({ visible, title, actions, onClose, searchable }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const { themeMode } = useUserPreferences();
  const isDark = themeMode === 'dark';
  const styles = makeStyles(T, isDark);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  if (!visible) return null;

  const filteredActions = searchable && query.trim()
    ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : actions;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Tap-outside-to-dismiss */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

      {/* Content */}
      <View style={{ paddingHorizontal: 0, paddingBottom: Math.max(insets.bottom, 16) }}>
        {/* Sheet */}
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : <View style={{ height: 16 }} />}
          {searchable && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={16} color={T.textSub} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { outlineStyle: 'none' } as any]}
                placeholder="Search symbol..."
                placeholderTextColor={T.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          )}
          <ScrollView
            style={styles.actionsScroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {filteredActions.map((action, index) => (
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
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {action.icon && <View style={{ width: 24, marginRight: 12, alignItems: 'center' }}>{action.icon}</View>}
                  <Text style={[styles.actionText, action.danger ? styles.actionTextDanger : styles.actionTextNormal]}>
                    {action.label}
                  </Text>
                </View>
                {!action.icon && <Text style={styles.chevron}>›</Text>}
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


const SCREEN_HEIGHT = Dimensions.get('window').height;

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)',
      justifyContent: 'flex-end',
    },
    sheet: {
      width: '100%',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass2,
      maxHeight: SCREEN_HEIGHT * 0.70,
    },
    handle: {
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 6,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: T.border,
    },
    title: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      paddingBottom: 12,
      borderBottomWidth: 1,
      color: T.textSub,
      borderBottomColor: T.border,
      marginBottom: 12,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 12,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: T.border,
    },
    searchInput: {
      flex: 1,
      color: T.text,
      fontSize: 15,
      height: '100%',
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
      borderBottomColor: T.border,
    },
    actionDanger: {
      backgroundColor: isDark ? 'rgba(255, 75, 66, 0.05)' : 'rgba(239, 68, 68, 0.05)',
    },
    actionPressed: {
      opacity: isDark ? 0.8 : 0.6,
      backgroundColor: T.glass3,
    },
    actionText: {
      fontSize: 17,
      fontWeight: '500',
    },
    actionTextNormal: { color: T.text },
    actionTextDanger:  { color: T.trading.sell.primary },
    chevron: {
      fontSize: 21,
      lineHeight: 21,
      color: T.textSub,
    },
    cancelButton: {
      width: '100%',
      marginTop: 0,
      minHeight: 54,
      borderRadius: 0,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: 17,
      fontWeight: '600',
      color: T.text,
    },
  });
}
