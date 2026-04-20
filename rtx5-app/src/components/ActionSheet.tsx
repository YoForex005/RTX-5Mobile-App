/**
 * Global reusable ActionSheet component.
 *
 * Provides a native-feeling bottom sheet overlay for contextual actions.
 * Highly configurable and typically controlled via the global `useUIState` store
 * rather than local component state.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function ActionSheet({ visible, title, actions, onClose, searchable }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const themeMode = useUserPreferences((s) => s.themeMode);
  const isDark = themeMode === 'dark';
  const styles = makeStyles(T, isDark);
  const [query, setQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(28)).current;

  const topInset = Math.max(insets.top, 12);
  const bottomInset = Math.max(insets.bottom, 12);
  const maxVisibleHeight = Math.max(260, SCREEN_HEIGHT - topInset - Math.max(0, keyboardHeight) - 12);
  const sheetMaxHeight = Math.min(SCREEN_HEIGHT * 0.7, maxVisibleHeight);
  const reservedChromeHeight =
    (title ? 58 : 28) +
    (searchable ? 56 : 0) +
    84;
  const actionsMaxHeight = Math.max(140, sheetMaxHeight - reservedChromeHeight);

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      const nextKeyboardHeight = Math.max(0, (event.endCoordinates?.height ?? 0) - insets.bottom);
      setKeyboardHeight(nextKeyboardHeight);
    };
    const handleKeyboardHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSub = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(28);
      return;
    }

    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(28);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, sheetTranslateY, visible]);

  const filteredActions = searchable && query.trim()
    ? actions.filter((action) => action.label.toLowerCase().includes(query.toLowerCase()))
    : actions;

  const handleActionPress = useCallback((actionPress?: () => void) => {
    onClose();
    actionPress?.();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      hardwareAccelerated
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              paddingTop: topInset,
              paddingBottom: bottomInset,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
            <View style={styles.handle} />

            {title ? (
              <View style={styles.titleContainer}>
                {title.includes(': ') ? (
                  <Text>
                    <Text style={styles.titlePrefix}>{title.split(': ')[0]}</Text>
                    <Text style={styles.titleSuffix}>: {title.split(': ')[1]}</Text>
                  </Text>
                ) : (
                  <Text style={styles.titlePrefix}>{title}</Text>
                )}
              </View>
            ) : (
              <View style={{ height: 16 }} />
            )}

            {searchable ? (
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
            ) : null}

            <ScrollView
              style={[styles.actionsScroll, { maxHeight: actionsMaxHeight }]}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              {filteredActions.map((action, index) => (
                <Pressable
                  key={action.label}
                  onPress={() => handleActionPress(action.onPress)}
                  style={({ pressed }) => [
                    styles.action,
                    index < filteredActions.length - 1 && styles.actionDivider,
                    action.danger && styles.actionDanger,
                    pressed && styles.actionPressed,
                  ]}
                >
                  <View style={styles.actionLeft}>
                    {action.icon ? <View style={styles.iconWrap}>{action.icon}</View> : null}
                    <Text style={[styles.actionText, action.danger ? styles.actionTextDanger : styles.actionTextNormal]}>
                      {action.label}
                    </Text>
                  </View>
                  {!action.icon ? <Text style={styles.chevron}>›</Text> : null}
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              style={({ pressed }) => [styles.cancelButton, pressed && styles.actionPressed]}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)',
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      width: '100%',
      justifyContent: 'flex-end',
      backgroundColor: isDark ? '#0E141F' : T.glass2,
    },
    sheet: {
      width: '100%',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: isDark ? '#0E141F' : T.glass2,
      maxHeight: SCREEN_HEIGHT * 0.7,
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
    titleContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
      marginBottom: 12,
    },
    titlePrefix: {
      fontSize: 12,
      fontWeight: '600',
      color: T.textSub,
      textAlign: 'center',
    },
    titleSuffix: {
      fontSize: 12,
      fontWeight: '600',
      color: T.textSub,
      textAlign: 'center',
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
    actionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconWrap: {
      width: 24,
      marginRight: 12,
      alignItems: 'center',
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
    actionTextNormal: {
      color: T.text,
    },
    actionTextDanger: {
      color: T.trading.sell.primary,
    },
    chevron: {
      fontSize: 21,
      lineHeight: 21,
      color: T.textSub,
    },
    cancelButton: {
      width: '100%',
      minHeight: 54,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: isDark ? '#0E141F' : T.glass2,
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
