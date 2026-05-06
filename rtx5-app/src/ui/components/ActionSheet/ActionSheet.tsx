/**
 * Global reusable ActionSheet component.
 *
 * Provides a native-feeling bottom sheet overlay for contextual actions.
 * Highly configurable and typically controlled via the global `useUIState`
 * store rather than local component state.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { traceUiInteraction } from '../../../dev/uiInteractionDiagnostics';
import { useTheme } from '../../theme/useTheme';
import { useUserPreferences } from '../../../state/userPreferences';
import { OVERLAY_MODAL_PROPS } from '../../overlayModalProps';
import { useTranslation } from '../../../i18n/useTranslation';
import { scheduleDismissSettledAction } from './dismissTimer';
import { makeActionSheetStyles } from './styles';

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  actions: Array<{ label: string; danger?: boolean; disabled?: boolean; onPress?: () => void; icon?: React.ReactNode }>;
  onClose: () => void;
  searchable?: boolean;
  detent?: 'auto' | 'adaptive' | 'large';
  minimumTopInset?: number;
  runActionAfterClose?: boolean;
};

const ACTION_SHEET_ROW_MIN_HEIGHT = 56;

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
  searchable,
  detent = 'adaptive',
  minimumTopInset,
  runActionAfterClose = true,
}: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const themeMode = useUserPreferences((s) => s.themeMode);
  const isDark = themeMode === 'dark';
  const styles = makeActionSheetStyles(T, isDark);
  const { t } = useTranslation();
  const screenHeight = Dimensions.get('screen').height;
  const [query, setQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Measured height from the Modal's actual onLayout – the real usable space.
  // Initialized to screenHeight (the full physical display height, never
  // affected by adjustResize). The first onLayout will correct this to
  // the precise Modal interior height.
  const [measuredHeight, setMeasuredHeight] = useState(screenHeight);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(28)).current;
  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingActionCancelRef = useRef<(() => void) | null>(null);
  // On Android, the entry animation is deferred until onLayout fires so the
  // sheet is never shown at the wrong (pre-layout) size.
  const layoutReadyRef = useRef(false);

  const filteredActions = searchable && query.trim()
    ? actions.filter((action) => {
        const rawLabel = action.label.toLowerCase();
        const localizedLabel = t(action.label).toLowerCase();
        const normalizedQuery = query.toLowerCase();
        return rawLabel.includes(normalizedQuery) || localizedLabel.includes(normalizedQuery);
      })
    : actions;
  const keyboardLift = Platform.OS === 'android' && searchable ? Math.max(0, keyboardHeight) : 0;
  const topInset = Math.max(insets.top, minimumTopInset ?? 12);
  const bottomInset = Math.max(insets.bottom, 12);
  const usesLargeDetent = detent === 'large';
  const usesAdaptiveDetent = detent === 'adaptive';
  // Use the measured layout height – this is the real space inside the Modal.
  const availableWindowHeight = Math.max(260, measuredHeight - keyboardLift);
  const maxVisibleHeight = Math.max(
    260,
    availableWindowHeight - topInset - bottomInset - 12,
  );
  const reservedChromeHeight =
    (title ? 58 : 28) +
    (searchable ? 56 : 0) +
    84;
  const estimatedActionsHeight = filteredActions.length * ACTION_SHEET_ROW_MIN_HEIGHT;
  const estimatedSheetHeight = reservedChromeHeight + estimatedActionsHeight;
  const adaptiveSheetFloor = usesLargeDetent
    ? Math.max(360, availableWindowHeight * 0.62)
    : usesAdaptiveDetent && searchable
      ? Math.max(320, availableWindowHeight * 0.54)
      : 0;
  const sheetTargetHeight = Math.max(estimatedSheetHeight, adaptiveSheetFloor);
  const sheetMaxHeight = Math.min(maxVisibleHeight, sheetTargetHeight);
  const sheetMinHeight = usesLargeDetent && sheetMaxHeight > estimatedSheetHeight
    ? Math.min(sheetMaxHeight, Math.max(360, availableWindowHeight * 0.62))
    : undefined;
  const actionsMaxHeight = Math.max(140, sheetMaxHeight - reservedChromeHeight);
  const actionsMinHeight = usesLargeDetent && sheetMaxHeight > estimatedSheetHeight
    ? Math.max(180, sheetMaxHeight - reservedChromeHeight)
    : undefined;

  // Capture the Modal's actual available height. Only ratchet upward so a
  // transient keyboard-shrunk frame can never reduce the sheet size.
  // On Android, also start the entry animation here (deferred until layout).
  const runEntryAnimation = useCallback(() => {
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(28);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 95,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, sheetTranslateY]);

  const deferredAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOverlayLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const h = event.nativeEvent.layout.height;
    if (h > 0) {
      // Always ratchet upward — never let a keyboard-shrunken onLayout
      // reduce the sheet's available space. The first onLayout after
      // Keyboard.dismiss() may still report the compressed height;
      // subsequent layouts will report the correct full height.
      setMeasuredHeight((prev) => Math.max(prev, h));
    }
    // On Android, defer the animation start. Keyboard.dismiss() is async —
    // the window restores its full height ~100-200ms after the call. By
    // waiting, we ensure the final onLayout (at full height) has fired
    // before we animate the sheet in. This prevents the visible
    // shrink-then-expand flicker.
    if (Platform.OS === 'android' && !layoutReadyRef.current) {
      layoutReadyRef.current = true;
      if (deferredAnimTimerRef.current) clearTimeout(deferredAnimTimerRef.current);
      deferredAnimTimerRef.current = setTimeout(() => {
        deferredAnimTimerRef.current = null;
        requestAnimationFrame(() => runEntryAnimation());
      }, 150);
    }
  }, [runEntryAnimation]);

  // Dismiss keyboard when the ActionSheet opens and reset measured height
  // so the first onLayout of this open cycle sets it to the actual value.
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setQuery('');
      // Reset measuredHeight to screenHeight (the full physical display,
      // unaffected by adjustResize). This avoids initializing to a
      // keyboard-shrunken windowHeight when the sheet opens while the
      // keyboard is still dismissing. The first onLayout will set the
      // precise real value.
      setMeasuredHeight(Dimensions.get('screen').height);
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (pendingActionCancelRef.current) {
        pendingActionCancelRef.current();
        pendingActionCancelRef.current = null;
      }
      pendingActionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      const nextKeyboardHeight = Math.max(0, (event.endCoordinates?.height ?? 0) - insets.bottom);
      setKeyboardHeight(nextKeyboardHeight);
    };
    const handleKeyboardHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

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
      layoutReadyRef.current = false;
      // Cancel any pending deferred animation from a previous open cycle.
      if (deferredAnimTimerRef.current) {
        clearTimeout(deferredAnimTimerRef.current);
        deferredAnimTimerRef.current = null;
      }
      return;
    }

    // On iOS, start animation immediately (no adjustResize issue).
    // On Android, animation is deferred to handleOverlayLayout.
    if (Platform.OS !== 'android') {
      runEntryAnimation();
    }
  }, [overlayOpacity, runEntryAnimation, sheetTranslateY, visible]);

  useEffect(() => {
    if (visible || !pendingActionRef.current) {
      return;
    }

    const action = pendingActionRef.current;
    pendingActionRef.current = null;

    pendingActionCancelRef.current = scheduleDismissSettledAction(() => {
      pendingActionCancelRef.current = null;
      action?.();
    });
  }, [visible]);

  const handleActionPress = useCallback((actionPress?: () => void) => {
    if (pendingActionCancelRef.current) {
      pendingActionCancelRef.current();
      pendingActionCancelRef.current = null;
    }

    if (!runActionAfterClose) {
      pendingActionRef.current = null;
      actionPress?.();
      onClose();
      return;
    }

    pendingActionRef.current = actionPress ?? null;
    onClose();
  }, [onClose, runActionAfterClose]);

  // No fixed height on Android – the overlay uses flex:1 to fill the Modal
  // (which is always at full height because we dismissed the keyboard above).
  const sheetBody = (
    <Animated.View
      style={[
        styles.sheetContainer,
        {
          paddingBottom: bottomInset + keyboardLift,
          transform: [{ translateY: sheetTranslateY }],
        },
      ]}
    >
      <View
        style={[
          styles.sheet,
          { maxHeight: sheetMaxHeight },
          sheetMinHeight ? { minHeight: sheetMinHeight } : null,
        ]}
      >
        <View style={styles.handle} />

        {title ? (
          <View style={styles.titleContainer}>
            {title.includes(': ') ? (
              <Text>
                <Text style={styles.titlePrefix}>{t(title.split(': ')[0])}</Text>
                <Text style={styles.titleSuffix}>: {title.split(': ')[1]}</Text>
              </Text>
            ) : (
              <Text style={styles.titlePrefix}>{t(title)}</Text>
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
              placeholder={t('Search symbol...')}
              placeholderTextColor={T.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        ) : null}

        <ScrollView
          style={[
            styles.actionsScroll,
            { maxHeight: actionsMaxHeight },
            actionsMinHeight ? { minHeight: actionsMinHeight } : null,
          ]}
          contentContainerStyle={[
            styles.actionsContent,
            usesLargeDetent && styles.actionsContentLarge,
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps={searchable ? 'always' : 'handled'}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {filteredActions.map((action, index) => {
            const localizedLabel = t(action.label);
            return (
              <Pressable
                key={action.label}
                onPress={action.disabled ? undefined : () =>
                  traceUiInteraction(`actionSheet.${action.label}`, () => handleActionPress(action.onPress))
                }
                unstable_pressDelay={0}
                disabled={action.disabled}
                style={({ pressed }) => [
                  styles.action,
                  index < filteredActions.length - 1 && styles.actionDivider,
                  action.danger && styles.actionDanger,
                  pressed && !action.disabled && styles.actionPressed,
                  action.disabled && styles.actionDisabled,
                ]}
              >
                <View style={styles.actionLeft}>
                  {action.icon ? <View style={styles.iconWrap}>{action.icon}</View> : null}
                  <Text style={[
                    styles.actionText,
                    action.danger ? styles.actionTextDanger : styles.actionTextNormal,
                    action.disabled && styles.actionTextDisabled,
                  ]}>
                    {localizedLabel}
                  </Text>
                </View>
                {!action.icon ? <Text style={styles.chevron}>›</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          style={({ pressed }) => [styles.cancelButton, pressed && styles.actionPressed]}
          onPress={onClose}
          unstable_pressDelay={0}
        >
          <Text style={styles.cancelText}>{t('Cancel')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      {...OVERLAY_MODAL_PROPS}
      onRequestClose={onClose}
    >
      <Animated.View
        style={[
          styles.overlay,
          { opacity: overlayOpacity },
        ]}
        onLayout={handleOverlayLayout}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          unstable_pressDelay={0}
        />

        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView
            behavior='padding'
            style={styles.sheetHost}
          >
            {sheetBody}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.sheetHost}>
            {sheetBody}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}
