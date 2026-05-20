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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { useUserPreferences } from '../../../state/userPreferences';
import { FastPressable } from '../FastPressable';
import { OVERLAY_MODAL_PROPS } from '../../overlayModalProps';
import { useTranslation } from '../../../i18n/useTranslation';
import { scheduleDismissSettledAction } from './dismissTimer';
import {
  resolveActionSheetInitialMeasuredHeight,
  resolveActionSheetMeasuredHeight,
} from './layout';
import { makeActionSheetStyles } from './styles';

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  actions: Array<{ label: string; subtitle?: string; danger?: boolean; disabled?: boolean; onPress?: () => void; icon?: React.ReactNode }>;
  onClose: () => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  detent?: 'auto' | 'adaptive' | 'large';
  minimumTopInset?: number;
  instantOpen?: boolean;
  runActionAfterClose?: boolean;
};

const ACTION_SHEET_ROW_MIN_HEIGHT = 56;
const ANDROID_INSTANT_OPEN_LAYOUT_SETTLE_MS = 120;

// Comfortable tap-to-dismiss zone above the sheet, beyond the safe-area inset.
// Without this, a tall sheet can extend to within a few pixels of the status
// bar — and on phones with edge gestures (Android nav-gesture, iOS notch
// pull-down), tapping that thin strip triggers the OS gesture instead of
// dismissing the sheet. 80dp guarantees the user has a usable strip of
// overlay above the sheet that's well clear of the system gesture region.
const TAPPABLE_TOP_DISMISS_MARGIN = 80;

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
  searchable,
  searchPlaceholder,
  detent = 'adaptive',
  minimumTopInset,
  instantOpen = false,
  runActionAfterClose = true,
}: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const themeMode = useUserPreferences((s) => s.themeMode);
  const isDark = themeMode === 'dark';
  const styles = makeActionSheetStyles(T, isDark);
  const { t } = useTranslation();
  const screenHeight = Dimensions.get('screen').height;
  const windowHeight = Dimensions.get('window').height;
  const getInitialMeasuredHeight = useCallback(
    () =>
      resolveActionSheetInitialMeasuredHeight({
        instantOpen,
        screenHeight: Dimensions.get('screen').height,
        windowHeight: Dimensions.get('window').height,
      }),
    [instantOpen],
  );
  const [query, setQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Measured height from the Modal's actual onLayout. Instant sheets start
  // from visible window height; animated sheets start from screen height so
  // Android keyboard-dismiss frames cannot make them too small.
  const [measuredHeight, setMeasuredHeight] = useState(() =>
    resolveActionSheetInitialMeasuredHeight({ instantOpen, screenHeight, windowHeight }),
  );
  const overlayOpacity = useRef(new Animated.Value(visible && instantOpen ? 1 : 0)).current;
  const sheetTranslateY = useRef(new Animated.Value(visible && instantOpen ? 0 : 28)).current;
  const shouldDelayInstantSheetPaint = Platform.OS === 'android' && instantOpen;
  const [instantLayoutReady, setInstantLayoutReady] = useState(
    () => !visible || !shouldDelayInstantSheetPaint,
  );

  const prevVisibleRef = useRef(visible);
  if (visible !== prevVisibleRef.current) {
    if (visible) {
      if (instantOpen) {
        overlayOpacity.setValue(1);
        sheetTranslateY.setValue(0);
      } else {
        overlayOpacity.setValue(0);
        sheetTranslateY.setValue(28);
      }
    } else {
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(28);
    }
    prevVisibleRef.current = visible;
  }
  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingActionCancelRef = useRef<(() => void) | null>(null);
  // On Android, the entry animation is deferred until onLayout fires so the
  // sheet is never shown at the wrong (pre-layout) size.
  const layoutReadyRef = useRef(false);
  const hasMeasuredOverlayRef = useRef(false);
  const instantLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredActions = searchable && query.trim()
    ? actions.filter((action) => {
        const rawLabel = action.label.toLowerCase();
        const localizedLabel = t(action.label).toLowerCase();
        const rawSubtitle = action.subtitle?.toLowerCase() ?? '';
        const normalizedQuery = query.toLowerCase();
        return rawLabel.includes(normalizedQuery) ||
          localizedLabel.includes(normalizedQuery) ||
          rawSubtitle.includes(normalizedQuery);
      })
    : actions;
  const keyboardLift = Platform.OS === 'android' && searchable ? Math.max(0, keyboardHeight) : 0;
  // Reserve a tappable dismiss strip above the sheet that sits clear of any
  // OS edge-gesture region. `minimumTopInset` (when explicitly passed by a
  // caller) still wins if it asks for more.
  const topInset = Math.max(
    insets.top + TAPPABLE_TOP_DISMISS_MARGIN,
    minimumTopInset ?? 0,
  );
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
  const estimatedActionsHeight = filteredActions.reduce(
    (height, action) => height + (action.subtitle ? 68 : ACTION_SHEET_ROW_MIN_HEIGHT),
    0,
  );
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
  const clearInstantLayoutTimer = useCallback(() => {
    if (instantLayoutTimerRef.current) {
      clearTimeout(instantLayoutTimerRef.current);
      instantLayoutTimerRef.current = null;
    }
  }, []);
  const scheduleInstantSheetPaintReady = useCallback(() => {
    if (!shouldDelayInstantSheetPaint) {
      setInstantLayoutReady(true);
      return;
    }

    clearInstantLayoutTimer();
    instantLayoutTimerRef.current = setTimeout(() => {
      instantLayoutTimerRef.current = null;
      requestAnimationFrame(() => setInstantLayoutReady(true));
    }, ANDROID_INSTANT_OPEN_LAYOUT_SETTLE_MS);
  }, [clearInstantLayoutTimer, shouldDelayInstantSheetPaint]);

  const handleOverlayLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const h = event.nativeEvent.layout.height;
    if (h > 0) {
      // Instant sheets trust the first real Modal layout, then all sheets
      // ratchet upward so later keyboard-shrunken layouts cannot clip them.
      const hasMeasuredLayout = hasMeasuredOverlayRef.current;
      setMeasuredHeight((prev) =>
        resolveActionSheetMeasuredHeight({
          previousHeight: prev,
          layoutHeight: h,
          instantOpen,
          hasMeasuredLayout,
        }),
      );
      hasMeasuredOverlayRef.current = true;
    }
    if (h > 0 && Platform.OS === 'android' && instantOpen) {
      scheduleInstantSheetPaintReady();
    }
    // On Android, defer the animation start. Keyboard.dismiss() is async —
    // the window restores its full height ~100-200ms after the call. By
    // waiting, we ensure the final onLayout (at full height) has fired
    // before we animate the sheet in. This prevents the visible
    // shrink-then-expand flicker.
    if (Platform.OS === 'android' && !layoutReadyRef.current) {
      layoutReadyRef.current = true;
      if (instantOpen) {
        if (deferredAnimTimerRef.current) {
          clearTimeout(deferredAnimTimerRef.current);
          deferredAnimTimerRef.current = null;
        }
        overlayOpacity.setValue(1);
        sheetTranslateY.setValue(0);
        return;
      }
      if (deferredAnimTimerRef.current) clearTimeout(deferredAnimTimerRef.current);
      deferredAnimTimerRef.current = setTimeout(() => {
        deferredAnimTimerRef.current = null;
        requestAnimationFrame(() => runEntryAnimation());
      }, 30);
    }
  }, [instantOpen, overlayOpacity, runEntryAnimation, scheduleInstantSheetPaintReady, sheetTranslateY]);

  // Dismiss keyboard when the ActionSheet opens and reset measured height
  // so the first onLayout of this open cycle sets it to the actual value.
  useEffect(() => {
    if (visible) {
      if (!instantOpen) {
        Keyboard.dismiss();
      }
      setQuery('');
      // Non-instant sheets still use screen height to avoid keyboard shrink;
      // instant sheets use window height so their first frame is capped.
      if (!instantOpen || !hasMeasuredOverlayRef.current) {
        setMeasuredHeight(getInitialMeasuredHeight());
      }
    }
  }, [getInitialMeasuredHeight, instantOpen, visible]);

  useEffect(() => {
    return () => {
      clearInstantLayoutTimer();
      if (pendingActionCancelRef.current) {
        pendingActionCancelRef.current();
        pendingActionCancelRef.current = null;
      }
      pendingActionRef.current = null;
    };
  }, [clearInstantLayoutTimer]);

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
      clearInstantLayoutTimer();
      setInstantLayoutReady(!shouldDelayInstantSheetPaint);
      setKeyboardHeight(0);
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(28);
      layoutReadyRef.current = false;
      hasMeasuredOverlayRef.current = false;
      // Cancel any pending deferred animation from a previous open cycle.
      if (deferredAnimTimerRef.current) {
        clearTimeout(deferredAnimTimerRef.current);
        deferredAnimTimerRef.current = null;
      }
      return;
    }

    if (shouldDelayInstantSheetPaint) {
      setInstantLayoutReady(false);
    } else {
      setInstantLayoutReady(true);
    }

    if (instantOpen) {
      if (deferredAnimTimerRef.current) {
        clearTimeout(deferredAnimTimerRef.current);
        deferredAnimTimerRef.current = null;
      }
      layoutReadyRef.current = false;
      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      overlayOpacity.setValue(1);
      sheetTranslateY.setValue(0);
      return;
    }

    // On iOS, start animation immediately (no adjustResize issue).
    // On Android, animation is deferred to handleOverlayLayout.
    if (Platform.OS !== 'android') {
      runEntryAnimation();
    }
  }, [
    clearInstantLayoutTimer,
    instantOpen,
    overlayOpacity,
    runEntryAnimation,
    sheetTranslateY,
    shouldDelayInstantSheetPaint,
    visible,
  ]);

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

  if (!visible) {
    // A closed action sheet must not leave any native full-screen touch layer
    // mounted. Returning null is stricter than a hidden transparent Modal and
    // prevents stale overlays from blocking taps after long app sessions.
    return null;
  }

  // No fixed height on Android: the overlay uses flex:1 to fill the Modal
  // after the keyboard has been dismissed and layout has settled.
  const shouldHideSheetForInitialLayout = shouldDelayInstantSheetPaint && !instantLayoutReady;
  const sheetBody = (
    <Animated.View
      pointerEvents={shouldHideSheetForInitialLayout ? 'none' : 'auto'}
      style={[
        styles.sheetContainer,
        {
          opacity: shouldHideSheetForInitialLayout ? 0 : 1,
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
              placeholder={t(searchPlaceholder ?? 'Search symbol...')}
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
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {filteredActions.map((action, index) => {
            const localizedLabel = t(action.label);
            return (
              <FastPressable
                key={`${action.label}-${index}`}
                latencyLabel={`actionSheet.${action.label}`}
                onPress={action.disabled ? undefined : () => handleActionPress(action.onPress)}
                activateOnPressIn
                disabled={action.disabled}
                style={({ pressed }) => [
                  styles.action,
                  index < filteredActions.length - 1 && styles.actionDivider,
                  action.danger && styles.actionDanger,
                  action.subtitle && styles.actionWithSubtitle,
                  pressed && !action.disabled && styles.actionPressed,
                  action.disabled && styles.actionDisabled,
                ]}
              >
                <View style={styles.actionLeft}>
                  {action.icon ? <View style={styles.iconWrap}>{action.icon}</View> : null}
                  <View style={styles.actionTextBlock}>
                    <Text
                      style={[
                        styles.actionText,
                        action.danger ? styles.actionTextDanger : styles.actionTextNormal,
                        action.disabled && styles.actionTextDisabled,
                      ]}
                      numberOfLines={1}
                    >
                      {localizedLabel}
                    </Text>
                    {action.subtitle ? (
                      <Text
                        style={[
                          styles.actionSubtitle,
                          action.disabled && styles.actionTextDisabled,
                        ]}
                        numberOfLines={1}
                      >
                        {action.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {!action.icon ? <Text style={styles.chevron}>›</Text> : null}
              </FastPressable>
            );
          })}
        </ScrollView>

        <FastPressable
          style={({ pressed }) => [styles.cancelButton, pressed && styles.actionPressed]}
          latencyLabel="actionSheet.cancel"
          onPress={onClose}
          activateOnPressIn
        >
          <Text style={styles.cancelText}>{t('Cancel')}</Text>
        </FastPressable>
      </View>
      {/* Fill the bottom safe area with a solid background so tab bar doesn't peek through */}
      <View
        style={{
          width: '100%',
          height: bottomInset + keyboardLift,
          backgroundColor: isDark ? '#0E141F' : T.glass2,
        }}
      />
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
        <FastPressable
          style={[StyleSheet.absoluteFillObject, styles.backdrop]}
          latencyLabel="actionSheet.dismissOverlay"
          onPress={onClose}
          activateOnPressIn
        />

        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView
            behavior='padding'
            style={styles.sheetHost}
            pointerEvents="box-none"
          >
            {sheetBody}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.sheetHost} pointerEvents="box-none">
            {sheetBody}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}
