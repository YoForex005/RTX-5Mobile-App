/**
 * Global Reusable ActionSheet component.
 *
 * Provides a native-feeling bottom sheet overlay for contextual actions.
 * Highly configurable and typically controlled via the global `useUIState`
 * store rather than local component state.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  type GestureResponderEvent,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { useThemeMode } from '../../../state/themeMode';
import { FastPressable } from '../FastPressable';
import { useTranslation } from '../../../i18n/useTranslation';
import { scheduleDismissSettledAction } from './dismissTimer';
import {
  resolveActionSheetBottomInset,
  resolveActionSheetFloor,
  resolveActionSheetInitialMeasuredHeight,
  resolveActionSheetMeasuredHeight,
  resolveActionSheetOpenMeasuredHeight,
} from './layout';
import { makeActionSheetStyles } from './styles';

type ActionSheetAction = {
  label: string;
  subtitle?: string;
  selected?: boolean;
  muted?: boolean;
  danger?: boolean;
  disabled?: boolean;
  activateOnPressIn?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
};

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  titleAlign?: 'left' | 'center';
  compactText?: boolean;
  presentation?: 'default' | 'mt5Plain' | 'mt5TimeframeGrid';
  showActionIcons?: boolean;
  actions: ActionSheetAction[];
  onClose: () => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  detent?: 'auto' | 'adaptive' | 'large';
  minimumTopInset?: number;
  instantOpen?: boolean;
  runActionAfterClose?: boolean;
  androidKeyboardAvoidance?: 'event' | 'resize';
  keepFullHeightOnKeyboard?: boolean;
};

type CachedActionSheetConfig = Pick<
  ActionSheetProps,
  'title' | 'titleAlign' | 'compactText' | 'presentation' | 'showActionIcons' | 'actions' | 'searchable' | 'searchPlaceholder' | 'detent' | 'minimumTopInset' | 'instantOpen' | 'runActionAfterClose' | 'androidKeyboardAvoidance' | 'keepFullHeightOnKeyboard'
>;

const ACTION_SHEET_ROW_MIN_HEIGHT = 48;
const ACTION_SHEET_MT5_PLAIN_ROW_MIN_HEIGHT = 47;
const ACTION_SHEET_MT5_PLAIN_ACTIONS_BOTTOM_PADDING = 8;
const ACTION_SHEET_TIMEFRAME_GRID_COLUMNS = 4;
const ACTION_SHEET_TIMEFRAME_GRID_ROW_HEIGHT = 40;
const ACTION_SHEET_TIMEFRAME_GRID_ROW_GAP = 8;
const ACTION_SHEET_TIMEFRAME_GRID_VERTICAL_PADDING = 16;
const ACTION_SHEET_BACKDROP_OPEN_GUARD_MS = 60;
const ACTION_SHEET_OPEN_TRANSLATE_Y = 12;
const ACTION_SHEET_FAST_OPEN_TRANSLATE_Y = 0;
const ACTION_SHEET_OPEN_OVERLAY_DURATION_MS = 50;
const ACTION_SHEET_OPEN_SHEET_DURATION_MS = 50;
const ACTION_SHEET_FAST_OPEN_OVERLAY_DURATION_MS = 0;
const ACTION_SHEET_FAST_OPEN_SHEET_DURATION_MS = 0;
const ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS = 50;
const ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50;
const ACTION_SHEET_INLINE_ACTION_LIMIT = 12;
const ACTION_SHEET_KEEP_HOST_MOUNTED = true;
const ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX = 10;

type ActionSheetPressPoint = {
  x: number;
  y: number;
};

type ActionSheetPressGesture = {
  start: ActionSheetPressPoint | null;
  cancelled: boolean;
};

const getActionSheetPressPoint = (event: GestureResponderEvent): ActionSheetPressPoint => ({
  x: event.nativeEvent.pageX,
  y: event.nativeEvent.pageY,
});

const hasActionSheetPressMovedBeyondThreshold = (
  start: ActionSheetPressPoint,
  end: ActionSheetPressPoint,
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return (dx * dx + dy * dy) > ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX * ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX;
};

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
  titleAlign,
  compactText = false,
  presentation = 'default',
  showActionIcons = false,
  actions,
  onClose,
  searchable = false,
  searchPlaceholder,
  detent = 'auto',
  minimumTopInset = 100,
  instantOpen = false,
  runActionAfterClose = true,
  androidKeyboardAvoidance = 'event',
  keepFullHeightOnKeyboard = false,
}: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const themeMode = useThemeMode();
  const isDark = themeMode === 'dark';
  const styles = useMemo(() => makeActionSheetStyles(T, isDark), [T, isDark]);
  const { t } = useTranslation();
  const screenHeight = Dimensions.get('screen').height;
  const { height: windowHeight } = useWindowDimensions();
  const initialMeasuredHeight = resolveActionSheetInitialMeasuredHeight({
    instantOpen,
    screenHeight,
    windowHeight,
  });
  const [mounted, setMounted] = useState(ACTION_SHEET_KEEP_HOST_MOUNTED || visible);
  const [query, setQuery] = useState('');
  const [currentOverlayHeight, setCurrentOverlayHeight] = useState(initialMeasuredHeight);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Measured height from the host layout. Start from the visible window height
  // so the first frame already has the final sheet geometry.
  const [measuredHeight, setMeasuredHeight] = useState(initialMeasuredHeight);
  const overlayOpacity = useRef(new Animated.Value(visible && instantOpen ? 1 : 0)).current;
  const sheetTranslateY = useRef(new Animated.Value(visible && instantOpen ? 0 : 28)).current;
  const openedAtRef = useRef(visible ? Date.now() : 0);
  const cachedConfigRef = useRef<CachedActionSheetConfig>({
    title,
    titleAlign,
    compactText,
    presentation,
    showActionIcons,
    actions,
    searchable,
    searchPlaceholder,
    detent,
    minimumTopInset,
    instantOpen,
    runActionAfterClose,
    androidKeyboardAvoidance,
    keepFullHeightOnKeyboard,
  });
  const incomingConfig: CachedActionSheetConfig = {
    title,
    titleAlign,
    compactText,
    presentation,
    showActionIcons,
    actions,
    searchable,
    searchPlaceholder,
    detent,
    minimumTopInset,
    instantOpen,
    runActionAfterClose,
    androidKeyboardAvoidance,
    keepFullHeightOnKeyboard,
  };
  const hasIncomingConfig =
    actions.length > 0 ||
    Boolean(title) ||
    Boolean(searchable) ||
    Boolean(searchPlaceholder) ||
    minimumTopInset !== undefined;
  const activeConfig = visible || hasIncomingConfig ? incomingConfig : cachedConfigRef.current;

  if (visible || hasIncomingConfig) {
    cachedConfigRef.current = incomingConfig;
  }

  const activeTitle = activeConfig.title;
  const activeTitleAlign = activeConfig.titleAlign;
  const activeCompactText = activeConfig.compactText ?? false;
  const activePresentation = activeConfig.presentation ?? 'default';
  const activeShowActionIcons = activeConfig.showActionIcons ?? false;
  const activeActions = activeConfig.actions;
  const activeSearchable = activeConfig.searchable ?? false;
  const activeSearchPlaceholder = activeConfig.searchPlaceholder;
  const activeDetent = activeConfig.detent ?? 'adaptive';
  const activeMinimumTopInset = activeConfig.minimumTopInset;
  const activeInstantOpen = activeConfig.instantOpen ?? true;
  const activeRunActionAfterClose = activeConfig.runActionAfterClose ?? false;
  const activeAndroidKeyboardAvoidance = activeConfig.androidKeyboardAvoidance ?? 'event';
  const activeKeepFullHeightOnKeyboard = activeConfig.keepFullHeightOnKeyboard ?? false;

  const prevVisibleRef = useRef(visible);
  if (visible !== prevVisibleRef.current) {
    if (visible) {
      openedAtRef.current = Date.now();
      // Always start hidden on the very first frame to allow children to layout.
      // This prevents a "blank flash" when the sheet first opens natively.
      overlayOpacity.setValue(0);
      if (activeInstantOpen) {
        sheetTranslateY.setValue(80);
      } else {
        sheetTranslateY.setValue(ACTION_SHEET_OPEN_TRANSLATE_Y);
      }
    }
    prevVisibleRef.current = visible;
  }
  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingActionCancelRef = useRef<(() => void) | null>(null);
  const hasMeasuredOverlayRef = useRef(false);
  const actionPressGestureRef = useRef<ActionSheetPressGesture>({
    start: null,
    cancelled: false,
  });

  const filteredActions = activeSearchable && query.trim()
    ? activeActions.filter((action) => {
      const rawLabel = action.label.toLowerCase();
      const localizedLabel = t(action.label).toLowerCase();
      const rawSubtitle = action.subtitle?.toLowerCase() ?? '';
      const normalizedQuery = query.toLowerCase();
      return rawLabel.includes(normalizedQuery) ||
        localizedLabel.includes(normalizedQuery) ||
        rawSubtitle.includes(normalizedQuery);
    })
    : activeActions;
  const isTimeframeGridPresentation = activePresentation === 'mt5TimeframeGrid';
  const isMt5PlainPresentation = activePresentation === 'mt5Plain';
  const isMt5StylePresentation = isMt5PlainPresentation || isTimeframeGridPresentation;
  const isTitleCentered = activeTitleAlign === 'center';
  const actionRowMinHeight = isMt5StylePresentation
    ? ACTION_SHEET_MT5_PLAIN_ROW_MIN_HEIGHT
    : ACTION_SHEET_ROW_MIN_HEIGHT;
  const actionsContentExtraHeight = isMt5StylePresentation
    ? ACTION_SHEET_MT5_PLAIN_ACTIONS_BOTTOM_PADDING
    : 0;
  // Reserve a tappable dismiss strip above the sheet that sits clear of any
  // OS edge-gesture region. `minimumTopInset` (when explicitly passed by a
  // caller) still wins if it asks for more.
  const topInset = Math.max(
    insets.top + TAPPABLE_TOP_DISMISS_MARGIN,
    activeMinimumTopInset ?? 0,
  );
  const bottomInset = resolveActionSheetBottomInset(insets.bottom, Platform.OS);
  // Android keyboard behavior varies between resize and overlay modes. Use
  // whichever source reports the largest keyboard lift, then only add a bottom
  // spacer for the part that was not already handled by a smaller overlay or
  // window height. That keeps searchable sheets above the IME without the
  // double-lift jump on resize-mode devices.
  // Symbol-picker "stay still" mode: opt out of the keyboard avoidance entirely
  // so the sheet keeps its full height and fixed position; the keyboard simply
  // overlays its lower part. Cross-platform — on Android the host is pinned to
  // full height (see the sheetHost render below), on iOS the KeyboardAvoidingView
  // is disabled so it stops padding the bottom-anchored sheet up. Isolated —
  // every other searchable sheet keeps the avoidance math unchanged.
  const keepFullHeightSheet = activeSearchable && activeKeepFullHeightOnKeyboard;
  const androidSearchableSheet =
    Platform.OS === 'android' && activeSearchable && !keepFullHeightSheet;
  const overlayKeyboardLift = androidSearchableSheet
    ? Math.max(0, measuredHeight - (currentOverlayHeight || measuredHeight))
    : 0;
  const windowKeyboardLift = androidSearchableSheet
    ? Math.max(0, measuredHeight - (windowHeight || measuredHeight))
    : 0;
  const eventKeyboardLift = androidSearchableSheet
    ? (activeAndroidKeyboardAvoidance === 'resize' ? 0 : Math.max(0, keyboardHeight))
    : 0;
  const resizeKeyboardLift = Math.max(overlayKeyboardLift, windowKeyboardLift);
  const effectiveKeyboardLift = Math.max(resizeKeyboardLift, eventKeyboardLift);
  const unhandledKeyboardLift = Math.max(0, eventKeyboardLift - resizeKeyboardLift);
  const measuredVisibleHeight = androidSearchableSheet
    ? measuredHeight - effectiveKeyboardLift
    : measuredHeight;
  const bottomSpacerHeight = unhandledKeyboardLift;
  // Use the measured layout height from the in-tree overlay host.
  const availableWindowHeight = Math.max(260, measuredVisibleHeight);
  const maxVisibleHeight = Math.max(
    260,
    availableWindowHeight - topInset - bottomInset - 12,
  );
  const reservedChromeHeight =
    (activeTitle ? (isMt5StylePresentation ? 64 : 58) : (isMt5StylePresentation ? 0 : 28)) +
    (activeSearchable ? 56 : 0);
  const timeframeGridRows = Math.ceil(filteredActions.length / ACTION_SHEET_TIMEFRAME_GRID_COLUMNS);
  const estimatedTimeframeGridActionsHeight = timeframeGridRows > 0
    ? ACTION_SHEET_TIMEFRAME_GRID_VERTICAL_PADDING +
      (timeframeGridRows * ACTION_SHEET_TIMEFRAME_GRID_ROW_HEIGHT) +
      (Math.max(0, timeframeGridRows - 1) * ACTION_SHEET_TIMEFRAME_GRID_ROW_GAP)
    : 0;
  const estimatedActionsHeight = isTimeframeGridPresentation
    ? estimatedTimeframeGridActionsHeight
    : filteredActions.reduce(
      (height, action) => height + (action.subtitle ? 68 : actionRowMinHeight),
      actionsContentExtraHeight,
    );
  const estimatedSheetHeight = reservedChromeHeight + estimatedActionsHeight;
  const adaptiveSheetFloor = resolveActionSheetFloor({
    detent: activeDetent,
    searchable: activeSearchable,
    availableWindowHeight,
  });
  const sheetTargetHeight = Math.max(estimatedSheetHeight, adaptiveSheetFloor);
  const sheetMaxHeight = Math.min(maxVisibleHeight, sheetTargetHeight);
  const sheetFloorMinHeight = adaptiveSheetFloor > 0 && sheetMaxHeight > estimatedSheetHeight
    ? Math.min(sheetMaxHeight, adaptiveSheetFloor)
    : undefined;
  const sheetMinHeight = sheetFloorMinHeight;
  const shouldLockSheetHeight = activeDetent === 'large';
  const sheetHeightStyle = shouldLockSheetHeight
    ? { height: sheetMaxHeight }
    : { maxHeight: sheetMaxHeight };
  const actionsMaxHeight = Math.max(140, sheetMaxHeight - reservedChromeHeight);
  const actionsMinHeight = sheetFloorMinHeight
    ? Math.max(180, sheetFloorMinHeight - reservedChromeHeight)
    : undefined;
  const initialActionRowsToRender = Math.max(
    1,
    Math.min(filteredActions.length, activeSearchable ? 12 : 16),
  );
  const shouldRenderInlineActions =
    !isTimeframeGridPresentation &&
    !activeSearchable &&
    filteredActions.length <= ACTION_SHEET_INLINE_ACTION_LIMIT &&
    estimatedActionsHeight <= actionsMaxHeight;

  // Run only native-driver opacity and translate animations. Layout and
  // content are already resolved before the first visible frame.
  const runEntryAnimation = useCallback((mode: 'fast' | 'standard' = 'standard') => {
    const isFast = mode === 'fast';

    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(isFast ? 80 : ACTION_SHEET_OPEN_TRANSLATE_Y);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: isFast ? 60 : ACTION_SHEET_OPEN_OVERLAY_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: isFast ? 80 : ACTION_SHEET_OPEN_SHEET_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, sheetTranslateY]);

  const handleOverlayLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const h = event.nativeEvent.layout.height;
    if (h > 0) {
      setCurrentOverlayHeight(h);
      const hasMeasuredLayout = hasMeasuredOverlayRef.current;
      setMeasuredHeight((prev) =>
        resolveActionSheetMeasuredHeight({
          previousHeight: prev,
          layoutHeight: h,
          instantOpen: activeInstantOpen,
          hasMeasuredLayout,
        }),
      );
      hasMeasuredOverlayRef.current = true;
    }
  }, [activeInstantOpen]);

  // Dismiss keyboard when the ActionSheet opens and seed measured height for
  // this open cycle. Instant sheets must never reset downward after their
  // first frame, otherwise Android shows the sheet and then drops it lower.
  useEffect(() => {
    if (visible) {
      if (!activeInstantOpen) {
        Keyboard.dismiss();
      }
      setQuery('');
      setCurrentOverlayHeight(Dimensions.get('window').height || Dimensions.get('screen').height);
      setMeasuredHeight((prev) =>
        resolveActionSheetOpenMeasuredHeight({
          previousHeight: prev,
          instantOpen: activeInstantOpen,
          screenHeight: Dimensions.get('screen').height,
          windowHeight: Dimensions.get('window').height,
        }),
      );
    }
  }, [activeInstantOpen, visible]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !activeSearchable) {
      setKeyboardHeight(0);
      return;
    }

    const syncOverlayHeightFromWindow = () => {
      const nextWindowHeight = Dimensions.get('window').height;
      if (nextWindowHeight > 0) {
        setCurrentOverlayHeight(nextWindowHeight);
      }
    };

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      const nextKeyboardHeight = Math.max(0, (event.endCoordinates?.height ?? 0) - insets.bottom);
      // Keep the resize-based lift in the same render as the keyboard event.
      // Expo Go can report keyboardDidShow before useWindowDimensions/onLayout
      // publishes the shorter window height; without this seed, the sheet adds
      // a full keyboard spacer against an already resized native window.
      syncOverlayHeightFromWindow();
      setKeyboardHeight(nextKeyboardHeight);
    };
    const handleKeyboardHide = () => {
      syncOverlayHeightFromWindow();
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [activeSearchable, insets.bottom]);

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
    if (!visible) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => subscription.remove();
  }, [onClose, visible]);

  useEffect(() => {
    if (!visible) {
      if (!mounted) {
        return;
      }

      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: activeInstantOpen ? 60 : ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: activeInstantOpen ? 80 : ACTION_SHEET_FAST_OPEN_TRANSLATE_Y,
          duration: activeInstantOpen ? 80 : ACTION_SHEET_CLOSE_SHEET_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !prevVisibleRef.current) {
          setMounted(ACTION_SHEET_KEEP_HOST_MOUNTED);
          setKeyboardHeight(0);
          hasMeasuredOverlayRef.current = false;
        }
      });
      return;
    }

    setMounted(true);
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();

    runEntryAnimation(activeInstantOpen ? 'fast' : 'standard');

    return () => { };
  }, [
    activeInstantOpen,
    mounted,
    overlayOpacity,
    runEntryAnimation,
    sheetTranslateY,
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

    if (!activeRunActionAfterClose) {
      pendingActionRef.current = null;
      actionPress?.();
      onClose();
      return;
    }

    pendingActionRef.current = actionPress ?? null;
    onClose();
  }, [activeRunActionAfterClose, onClose]);

  const recordActionRowPressStart = useCallback((event: GestureResponderEvent) => {
    actionPressGestureRef.current = {
      start: getActionSheetPressPoint(event),
      cancelled: false,
    };
  }, []);

  const cancelActionRowPressForScroll = useCallback(() => {
    actionPressGestureRef.current = {
      ...actionPressGestureRef.current,
      cancelled: true,
    };
  }, []);

  const recordActionRowPressMove = useCallback((event: GestureResponderEvent) => {
    const gesture = actionPressGestureRef.current;
    if (!gesture.start || gesture.cancelled) {
      return;
    }

    if (hasActionSheetPressMovedBeyondThreshold(gesture.start, getActionSheetPressPoint(event))) {
      actionPressGestureRef.current = {
        ...gesture,
        cancelled: true,
      };
    }
  }, []);

  const handleActionRowPress = useCallback((actionPress?: () => void) => {
    const gesture = actionPressGestureRef.current;
    actionPressGestureRef.current = {
      start: null,
      cancelled: false,
    };

    if (gesture.cancelled) {
      return;
    }

    handleActionPress(actionPress);
  }, [handleActionPress]);

  const handleBackdropPress = useCallback(() => {
    if (Date.now() - openedAtRef.current < ACTION_SHEET_BACKDROP_OPEN_GUARD_MS) {
      return;
    }
    onClose();
  }, [onClose]);

  const keyAction = useCallback(
    (action: ActionSheetAction, index: number) => `${action.label}-${index}`,
    [],
  );

  const renderActionRow = useCallback((action: ActionSheetAction) => {
    const localizedLabel = t(action.label);
    // A selected option represents the currently-active state, so it renders as
    // disabled (greyed, non-tappable) across every action sheet — you can't
    // re-select what's already active; you tap one of the other options.
    const isActiveDisabled = action.disabled || action.selected === true;
    const isVisuallyMuted = isActiveDisabled || action.muted === true;
    const activateInlineActionOnTouchStart =
      isMt5PlainPresentation &&
      shouldRenderInlineActions &&
      action.activateOnPressIn === true &&
      !isActiveDisabled;
    return (
      <FastPressable
        latencyLabel={`actionSheet.${action.label}`}
        onPressIn={activateInlineActionOnTouchStart ? undefined : recordActionRowPressStart}
        onTouchMove={activateInlineActionOnTouchStart ? undefined : recordActionRowPressMove}
        onPress={isActiveDisabled ? undefined : () => handleActionRowPress(action.onPress)}
        activateOnPressIn={action.activateOnPressIn === true && !isActiveDisabled && !activateInlineActionOnTouchStart}
        activateOnTouchStart={activateInlineActionOnTouchStart}
        disabled={isActiveDisabled}
        style={({ pressed }) => [
          styles.action,
          isMt5PlainPresentation && styles.actionMt5Plain,
          action.danger && !isMt5PlainPresentation && styles.actionDanger,
          action.subtitle && styles.actionWithSubtitle,
          pressed && !isActiveDisabled && (isMt5PlainPresentation ? styles.actionPressedMt5Plain : styles.actionPressed),
          isActiveDisabled && (isMt5PlainPresentation ? styles.actionDisabledMt5Plain : styles.actionDisabled),
        ]}
      >
        <View style={styles.actionLeft}>
          {action.icon && (!isMt5PlainPresentation || activeShowActionIcons) ? (
            <View style={styles.iconWrap}>{action.icon}</View>
          ) : null}
          <View style={styles.actionTextBlock}>
            <Text
              style={[
                styles.actionText,
                isMt5PlainPresentation && styles.actionTextMt5Plain,
                activeCompactText && styles.actionTextCompact,
                action.danger
                  ? styles.actionTextDanger
                  : (isMt5PlainPresentation ? styles.actionTextNormalMt5Plain : styles.actionTextNormal),
                isVisuallyMuted && (
                  isMt5PlainPresentation ? styles.actionTextDisabledMt5Plain : styles.actionTextDisabled
                ),
              ]}
              numberOfLines={1}
            >
              {localizedLabel}
            </Text>
            {action.subtitle ? (
              <Text
                style={[
                  styles.actionSubtitle,
                  activeCompactText && styles.actionSubtitleCompact,
                  isVisuallyMuted && styles.actionTextDisabled,
                ]}
                numberOfLines={1}
              >
                {action.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </FastPressable>
    );
  }, [
    handleActionRowPress,
    activeShowActionIcons,
    isMt5PlainPresentation,
    activeCompactText,
    recordActionRowPressMove,
    recordActionRowPressStart,
    shouldRenderInlineActions,
    styles,
    t,
  ]);

  const renderAction = useCallback(
    ({ item: action, index }: { item: ActionSheetAction; index: number }) =>
      renderActionRow(action),
    [renderActionRow],
  );

  const renderTimeframeGridAction = useCallback((action: ActionSheetAction) => {
    const localizedLabel = t(action.label);
    const isSelected = action.selected === true;
    const isDisabled = action.disabled || isSelected;

    return (
      <FastPressable
        key={action.label}
        latencyLabel={`actionSheet.timeframe.${action.label}`}
        onPressIn={recordActionRowPressStart}
        onTouchMove={recordActionRowPressMove}
        onPress={isDisabled ? undefined : () => handleActionRowPress(action.onPress)}
        activateOnPressIn={action.activateOnPressIn === true && !isDisabled}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.timeframeGridAction,
          pressed && !isDisabled && styles.timeframeGridActionPressed,
          isSelected && styles.timeframeGridActionSelected,
          action.disabled && styles.timeframeGridActionDisabled,
        ]}
      >
        <Text
          style={[
            styles.timeframeGridText,
            isSelected && styles.timeframeGridTextSelected,
            action.disabled && styles.timeframeGridTextDisabled,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {localizedLabel}
        </Text>
      </FastPressable>
    );
  }, [
    handleActionRowPress,
    recordActionRowPressMove,
    recordActionRowPressStart,
    styles,
    t,
  ]);

  const inlineActionRows = useMemo(
    () =>
      shouldRenderInlineActions
        ? filteredActions.map((action, index) => (
          <React.Fragment key={keyAction(action, index)}>
            {renderActionRow(action)}
          </React.Fragment>
        ))
        : null,
    [filteredActions, keyAction, renderActionRow, shouldRenderInlineActions],
  );

  const timeframeGridActions = useMemo(
    () =>
      isTimeframeGridPresentation
        ? filteredActions.map((action) => renderTimeframeGridAction(action))
        : null,
    [filteredActions, isTimeframeGridPresentation, renderTimeframeGridAction],
  );

  if (!visible && !mounted) {
    return null;
  }

  // No fixed height on Android: instant sheets start from the visible window
  // height and then ratchet upward from real layout. The sheet body paints on
  // the first frame so opening never looks like a late resize.
  const sheetBody = (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.sheetContainer,
        {
          opacity: 1,
          transform: [{ translateY: sheetTranslateY }],
        },
      ]}
    >
      <View
        style={[
          styles.sheet,
          isMt5StylePresentation && styles.sheetMt5Plain,
          isTimeframeGridPresentation && styles.sheetTimeframeGrid,
          sheetHeightStyle,
          !shouldLockSheetHeight && sheetMinHeight ? { minHeight: sheetMinHeight } : null,
        ]}
      >
        {isMt5StylePresentation ? null : <View style={styles.handle} />}

        {activeTitle ? (
          <View
            style={[
              styles.titleContainer,
              isMt5StylePresentation && styles.titleContainerMt5Plain,
              isTitleCentered && styles.titleContainerCentered,
            ]}
          >
            {activeTitle.includes(': ') ? (
              <Text
                style={[
                  isMt5StylePresentation && styles.titleTextMt5Plain,
                  isTitleCentered && styles.titleTextCentered,
                ]}
                numberOfLines={1}
              >
                <Text
                  style={[
                    styles.titlePrefix,
                    isMt5StylePresentation && styles.titlePrefixMt5Plain,
                    activeCompactText && styles.titlePrefixCompact,
                    isTitleCentered && styles.titleTextCentered,
                  ]}
                >
                  {t(activeTitle.split(': ')[0])}
                </Text>
                <Text
                  style={[
                    styles.titleSuffix,
                    isMt5StylePresentation && styles.titleSuffixMt5Plain,
                    activeCompactText && styles.titleSuffixCompact,
                    isTitleCentered && styles.titleTextCentered,
                  ]}
                >
                  : {activeTitle.split(': ')[1]}
                </Text>
              </Text>
            ) : (
              <Text
                style={[
                  styles.titlePrefix,
                  isMt5StylePresentation && styles.titlePrefixMt5Plain,
                  activeCompactText && styles.titlePrefixCompact,
                  isTitleCentered && styles.titleTextCentered,
                ]}
                numberOfLines={1}
              >
                {t(activeTitle)}
              </Text>
            )}
          </View>
        ) : isMt5StylePresentation ? null : (
          <View style={{ height: 16 }} />
        )}

        {activeSearchable ? (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color={T.textSub} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, activeCompactText && styles.searchInputCompact, { outlineStyle: 'none' } as any]}
              placeholder={t(activeSearchPlaceholder ?? 'Search symbol...')}
              placeholderTextColor={T.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        ) : null}

        {isTimeframeGridPresentation ? (
          <View
            style={[
              styles.actionsScroll,
              styles.timeframeGrid,
              { maxHeight: actionsMaxHeight },
              actionsMinHeight ? { minHeight: actionsMinHeight } : null,
            ]}
          >
            {timeframeGridActions}
          </View>
        ) : shouldRenderInlineActions ? (
          <View
            style={[
              styles.actionsScroll,
              styles.actionsContent,
              isMt5PlainPresentation ? styles.actionsContentMt5Plain : null,
              sheetFloorMinHeight ? styles.actionsContentLarge : null,
              { maxHeight: actionsMaxHeight },
              actionsMinHeight ? { minHeight: actionsMinHeight } : null,
            ]}
          >
            {inlineActionRows}
          </View>
        ) : (
          <FlatList
            style={[
              styles.actionsScroll,
              { maxHeight: actionsMaxHeight },
              actionsMinHeight ? { minHeight: actionsMinHeight } : null,
            ]}
            data={filteredActions}
            keyExtractor={keyAction}
            renderItem={renderAction}
            contentContainerStyle={[
              styles.actionsContent,
              isMt5PlainPresentation ? styles.actionsContentMt5Plain : null,
              sheetFloorMinHeight ? styles.actionsContentLarge : null,
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            nestedScrollEnabled
            onScrollBeginDrag={cancelActionRowPressForScroll}
            onMomentumScrollBegin={cancelActionRowPressForScroll}
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={initialActionRowsToRender}
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={16}
            windowSize={5}
            scrollEventThrottle={16}
          />
        )}
      </View>
      {/* Fill only keyboard lift that was not already handled by the native layout. */}
      {/* Matches the sheet background so there is no seam below it. */}
      <View
        style={{
          width: '100%',
          height: bottomSpacerHeight,
          backgroundColor: isDark ? T.bg : T.glass2,
        }}
      />
    </Animated.View>
  );

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.overlay, { opacity: overlayOpacity }]}
      onLayout={handleOverlayLayout}
    >
      <FastPressable
        style={[StyleSheet.absoluteFillObject, styles.backdrop]}
        latencyLabel="actionSheet.dismissOverlay"
        onPress={handleBackdropPress}
        activateOnPressIn
      />

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
          behavior="padding"
          // "Stay still" mode: disable avoidance so the keyboard overlays the
          // sheet's lower part instead of padding the bottom-anchored sheet up
          // (that upward push is the jump). Matches the Android pinned-host path.
          enabled={!keepFullHeightSheet}
          style={styles.sheetHost}
          pointerEvents="box-none"
        >
          {sheetBody}
        </KeyboardAvoidingView>
      ) : (
        <View
          style={[
            styles.sheetHost,
            // "Stay still" mode: pin the host to the full (stable) height, top-
            // anchored, so it does NOT ride the overlay up as adjustResize
            // shrinks the window for the keyboard. The bottom-anchored sheet
            // therefore stays put and the keyboard overlays its lower part.
            keepFullHeightSheet
              ? { position: 'absolute' as const, top: 0, left: 0, right: 0, height: screenHeight }
              : null,
          ]}
          pointerEvents="box-none"
        >
          {sheetBody}
        </View>
      )}
    </Animated.View>
  );
}
