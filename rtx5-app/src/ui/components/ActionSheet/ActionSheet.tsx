/**
 * Global Reusable ActionSheet component.
 *
 * Provides a native-feeling bottom sheet overlay for contextual actions.
 * Highly configurable and typically controlled via the global `useUIState`
 * store rather than local component state.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  type GestureResponderEvent,
  type TextStyle,
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
  resolveActionSheetMt5EntryTranslateY,
  resolveActionSheetOpenMeasuredHeight,
} from './layout';
import { makeActionSheetStyles } from './styles';
import {
  acknowledgeRetainedActionSheetVisible,
  cancelRetainedActionSheetPreview,
  getRetainedActionSheetVisualSnapshot,
  registerRetainedActionSheetVisualApplier,
  syncRetainedActionSheetVisual,
  type RetainedActionSheetVisualSnapshot,
} from './retainedActionSheetVisualController';

type ActionSheetAction = {
  label: string;
  subtitle?: string;
  selected?: boolean;
  muted?: boolean;
  danger?: boolean;
  textColor?: string;
  textFontWeight?: TextStyle['fontWeight'];
  disabled?: boolean;
  activateOnPressIn?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
};

type ActionSheetEntryMotion = 'instant' | 'mt5Slide' | 'standard';

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
  entryMotion?: ActionSheetEntryMotion;
  immediateHostHideOnClose?: boolean;
  visualKey?: string;
  runActionAfterClose?: boolean;
  androidKeyboardAvoidance?: 'event' | 'resize';
  keepFullHeightOnKeyboard?: boolean;
};

type CachedActionSheetConfig = Pick<
  ActionSheetProps,
  'title' | 'titleAlign' | 'compactText' | 'presentation' | 'showActionIcons' | 'actions' | 'searchable' | 'searchPlaceholder' | 'detent' | 'minimumTopInset' | 'instantOpen' | 'entryMotion' | 'immediateHostHideOnClose' | 'visualKey' | 'runActionAfterClose' | 'androidKeyboardAvoidance' | 'keepFullHeightOnKeyboard'
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
const ACTION_SHEET_INSTANT_OPEN_OPACITY = 1;
const ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y = 0;
const ACTION_SHEET_OPEN_OVERLAY_DURATION_MS = 50;
const ACTION_SHEET_OPEN_SHEET_DURATION_MS = 50;
const ACTION_SHEET_MT5_OPEN_OVERLAY_DURATION_MS = 180;
const ACTION_SHEET_MT5_OPEN_SHEET_DURATION_MS = 210;
const ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS = 50;
const ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50;
const ACTION_SHEET_INLINE_ACTION_LIMIT = 12;
const ACTION_SHEET_KEEP_HOST_MOUNTED = true;
const ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX = 10;

const startActionSheetEntryAnimation = ({
  mode,
  overlayOpacity,
  sheetTranslateY,
  mt5TranslateY,
}: {
  mode: ActionSheetEntryMotion;
  overlayOpacity: Animated.Value;
  sheetTranslateY: Animated.Value;
  mt5TranslateY: number;
}) => {
  overlayOpacity.stopAnimation();
  sheetTranslateY.stopAnimation();

  if (mode === 'instant') {
    overlayOpacity.setValue(ACTION_SHEET_INSTANT_OPEN_OPACITY);
    sheetTranslateY.setValue(ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y);
    return;
  }

  const isMt5Slide = mode === 'mt5Slide';
  overlayOpacity.setValue(0);
  sheetTranslateY.setValue(isMt5Slide ? mt5TranslateY : ACTION_SHEET_OPEN_TRANSLATE_Y);
  Animated.parallel([
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: isMt5Slide
        ? ACTION_SHEET_MT5_OPEN_OVERLAY_DURATION_MS
        : ACTION_SHEET_OPEN_OVERLAY_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    Animated.timing(sheetTranslateY, {
      toValue: 0,
      duration: isMt5Slide
        ? ACTION_SHEET_MT5_OPEN_SHEET_DURATION_MS
        : ACTION_SHEET_OPEN_SHEET_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();
};

const startActionSheetExitAnimation = ({
  instantOpen,
  overlayOpacity,
  sheetTranslateY,
  onComplete,
}: {
  instantOpen: boolean;
  overlayOpacity: Animated.Value;
  sheetTranslateY: Animated.Value;
  onComplete?: (result: { finished: boolean }) => void;
}) => {
  const closeSheetTranslateY = instantOpen ? 80 : ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y;

  overlayOpacity.stopAnimation();
  sheetTranslateY.stopAnimation();
  Animated.parallel([
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: instantOpen ? 60 : ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    Animated.timing(sheetTranslateY, {
      toValue: closeSheetTranslateY,
      duration: instantOpen ? 80 : ACTION_SHEET_CLOSE_SHEET_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start((result) => {
    if (result.finished) {
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(closeSheetTranslateY);
    }
    onComplete?.(result);
  });
};

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
  entryMotion,
  immediateHostHideOnClose = false,
  visualKey,
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
  const initialEntryMotion: ActionSheetEntryMotion = entryMotion ?? (
    instantOpen ? 'instant' : 'standard'
  );
  const overlayOpacity = useRef(new Animated.Value(
    visible && initialEntryMotion === 'instant' ? 1 : 0,
  )).current;
  const sheetTranslateY = useRef(new Animated.Value(
    visible && initialEntryMotion === 'instant' ? 0 : 28,
  )).current;
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
    entryMotion,
    immediateHostHideOnClose,
    visualKey,
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
    entryMotion,
    immediateHostHideOnClose,
    visualKey,
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
  const prevVisibleRef = useRef(visible);
  const closeAnimationRunningRef = useRef(false);
  const [, refreshHiddenConfig] = useState(0);
  const visibilityChanged = visible !== prevVisibleRef.current;
  const isStartingClose = visibilityChanged && !visible;

  // Keep the outgoing rows mounted until their close animation is fully
  // transparent. A newly preloaded symbol must never flash inside the previous
  // sheet while that sheet is still moving off screen.
  const canAdoptIncomingConfig = visible || !(
    closeAnimationRunningRef.current || isStartingClose
  );
  const activeConfig = canAdoptIncomingConfig && hasIncomingConfig
    ? incomingConfig
    : cachedConfigRef.current;

  if (canAdoptIncomingConfig && (visible || hasIncomingConfig)) {
    cachedConfigRef.current = incomingConfig;
  }

  const activeTitle = activeConfig.title;
  const activeTitleAlign = activeConfig.titleAlign;
  const activeCompactText = activeConfig.compactText ?? false;
  const activePresentation = activeConfig.presentation ?? 'default';
  const activeUsesTransparentMt5Host =
    activePresentation === 'mt5Plain' || activePresentation === 'mt5TimeframeGrid';
  const activeShowActionIcons = activeConfig.showActionIcons ?? false;
  const activeActions = activeConfig.actions;
  const activeSearchable = activeConfig.searchable ?? false;
  const activeSearchPlaceholder = activeConfig.searchPlaceholder;
  const activeDetent = activeConfig.detent ?? 'adaptive';
  const activeMinimumTopInset = activeConfig.minimumTopInset;
  const activeInstantOpen = activeConfig.instantOpen ?? true;
  const activeEntryMotion: ActionSheetEntryMotion = activeConfig.entryMotion ?? (
    activeInstantOpen ? 'instant' : 'standard'
  );
  const activeImmediateHostHideOnClose = activeConfig.immediateHostHideOnClose ?? false;
  const activeVisualKey = activeConfig.visualKey;
  const activeRunActionAfterClose = activeConfig.runActionAfterClose ?? false;
  const activeAndroidKeyboardAvoidance = activeConfig.androidKeyboardAvoidance ?? 'event';
  const activeKeepFullHeightOnKeyboard = activeConfig.keepFullHeightOnKeyboard ?? false;
  const mt5EntryTranslateY = Math.min(
    screenHeight,
    Math.max(
      160,
      72 + activeActions.reduce(
        (height, action) => height + (action.subtitle ? 68 : ACTION_SHEET_MT5_PLAIN_ROW_MIN_HEIGHT),
        0,
      ),
    ),
  );

  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingActionCancelRef = useRef<(() => void) | null>(null);
  const hasMeasuredOverlayRef = useRef(false);
  const actionPressGestureRef = useRef<ActionSheetPressGesture>({
    start: null,
    cancelled: false,
  });
  const overlayLayerRef = useRef<View>(null);
  const sheetBodyRef = useRef<View>(null);
  const measuredSheetBodyHeightRef = useRef(0);
  const hostHiddenImperativelyRef = useRef(false);
  const retainedVisualOwnerRef = useRef<{ revision: number; visualKey: string } | null>(null);
  const retainedAdoptionVisualKeyRef = useRef<string | null>(null);
  const entryAnimationStartedForOpenRef = useRef(false);
  const mt5DismissCompletedRef = useRef(false);
  const reactVisibleRef = useRef(visible);
  const activeVisualKeyRef = useRef(activeVisualKey);
  const retainedMt5RevealInFlight =
    activeEntryMotion === 'mt5Slide' &&
    retainedVisualOwnerRef.current?.visualKey === activeVisualKey;
  const shouldSeedMt5EntryTransform =
    visible && visibilityChanged && activeEntryMotion === 'mt5Slide' && !retainedMt5RevealInFlight;
  const resolveMt5EntryTranslateY = useCallback(
    () => resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: mt5EntryTranslateY,
      measuredSheetBodyHeight: measuredSheetBodyHeightRef.current,
    }),
    [mt5EntryTranslateY],
  );

  useLayoutEffect(() => {
    if (!visibilityChanged) {
      return;
    }

    const mt5DismissAlreadyCompleted = !visible && mt5DismissCompletedRef.current;
    mt5DismissCompletedRef.current = false;
    closeAnimationRunningRef.current = !visible && !mt5DismissAlreadyCompleted;
    if (visible) {
      // A visible effect can rerun while the same sheet is open when its
      // measured height or retained config settles. Only the visibility edge
      // may arm a new entry animation; otherwise Drawing Tools visibly rises,
      // drops, and rises a second time.
      entryAnimationStartedForOpenRef.current = false;
      openedAtRef.current = Date.now();
      if (hostHiddenImperativelyRef.current) {
        // A preceding MT5-slide close hides the entire retained host with an
        // imperative opacity mutation. The next sheet may be a default/search
        // picker rather than another MT5 presentation, so restore the shared
        // host on every visible edge, independent of the incoming style.
        overlayLayerRef.current?.setNativeProps({
          style: { opacity: 1 },
          accessibilityElementsHidden: false,
          importantForAccessibility: 'auto',
          pointerEvents: 'auto',
        });
        sheetBodyRef.current?.setNativeProps({ pointerEvents: 'auto' });
        hostHiddenImperativelyRef.current = false;
      }
      if (!retainedMt5RevealInFlight) {
        overlayOpacity.stopAnimation();
        sheetTranslateY.stopAnimation();
        if (activeEntryMotion === 'instant') {
          overlayOpacity.setValue(ACTION_SHEET_INSTANT_OPEN_OPACITY);
          sheetTranslateY.setValue(ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y);
        } else {
          overlayOpacity.setValue(0);
          sheetTranslateY.setValue(
            activeEntryMotion === 'mt5Slide'
              ? resolveMt5EntryTranslateY()
              : ACTION_SHEET_OPEN_TRANSLATE_Y,
          );
        }
      }
      if (shouldSeedMt5EntryTransform) {
        // The first visible commit uses a static offscreen transform below.
        // Re-render from this layout edge so the native animated value is
        // attached only after it has been seeded, before the slide begins.
        refreshHiddenConfig((revision) => revision + 1);
      }
    } else if (activeEntryMotion === 'mt5Slide' || activeImmediateHostHideOnClose) {
      entryAnimationStartedForOpenRef.current = false;
      // Store-driven closes can bypass dismissActionSheet. Hide in the layout
      // phase so no stale retained snapshot or passive effect can paint a
      // one-frame full-sheet ghost after the sheet already disappeared.
      overlayLayerRef.current?.setNativeProps({
        style: { opacity: 0 },
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        pointerEvents: 'none',
      });
      hostHiddenImperativelyRef.current = true;
      sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(resolveMt5EntryTranslateY());
      closeAnimationRunningRef.current = false;
      // Adopt the newest hidden preload immediately. Without this commit the
      // retained host can keep the outgoing Drawing/More visual key, forcing
      // the next symbol press through the slower React fallback.
      refreshHiddenConfig((revision) => revision + 1);
    }
    prevVisibleRef.current = visible;
  }, [
    activeEntryMotion,
    activeImmediateHostHideOnClose,
    activeVisualKey,
    overlayOpacity,
    refreshHiddenConfig,
    resolveMt5EntryTranslateY,
    retainedMt5RevealInFlight,
    sheetTranslateY,
    shouldSeedMt5EntryTransform,
    visibilityChanged,
    visible,
  ]);

  const applyRetainedVisualSnapshot = useCallback((
    retainedSnapshot: RetainedActionSheetVisualSnapshot,
  ) => {
    const wantsVisible = retainedSnapshot.mode !== 'hidden';
    if (wantsVisible && retainedSnapshot.visualKey !== activeVisualKeyRef.current) {
      return false;
    }
    if (wantsVisible && reactVisibleRef.current) {
      // React already owns this sheet. A duplicate same-key retained commit
      // must not imperatively disable pointer events with no subsequent render
      // available to restore them.
      return false;
    }
    if (
      retainedSnapshot.mode === 'committed' &&
      retainedVisualOwnerRef.current?.revision === retainedSnapshot.revision &&
      retainedVisualOwnerRef.current.visualKey === retainedSnapshot.visualKey
    ) {
      // A pending hidden passive effect may synchronize the same committed
      // snapshot again. Keep the already-running native animation untouched.
      return true;
    }
    if (retainedSnapshot.mode === 'preview') {
      // Press-in only proves that the exact hidden content is committed. It
      // remains invisible so starting a scroll or long-press never flashes a
      // tap menu over the watchlist.
      const interruptedClose = closeAnimationRunningRef.current;
      closeAnimationRunningRef.current = false;
      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(
        activeEntryMotion === 'mt5Slide' ? resolveMt5EntryTranslateY() : 80,
      );
      overlayLayerRef.current?.setNativeProps({
        style: { opacity: 0 },
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        pointerEvents: 'none',
      });
      sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
      if (interruptedClose) {
        // The preview itself has already made the outgoing sheet fully hidden.
        // Let React adopt the latest preload now; a cancelled gesture must not
        // leave the old cached config held behind an interrupted close.
        refreshHiddenConfig((revision) => revision + 1);
      }
      return true;
    }
    if (!wantsVisible && retainedVisualOwnerRef.current === null) {
      // A hidden controller snapshot must not override a normal ActionSheet
      // whose visibility and pointer events are owned entirely by React.
      return false;
    }

    if (wantsVisible && retainedSnapshot.visualKey) {
      retainedVisualOwnerRef.current = {
        revision: retainedSnapshot.revision,
        visualKey: retainedSnapshot.visualKey,
      };
    } else {
      retainedVisualOwnerRef.current = null;
    }

    // The committed sheet owns input immediately. React adopts the same state
    // in this tap turn, while the 60 ms backdrop guard protects the originating
    // release from being mistaken for a dismissal.
    const interactive = retainedSnapshot.mode === 'committed';
    if (wantsVisible) {
      // This runs synchronously in the accepted press turn. The content is
      // already mounted, so only native-driver opacity/translation work starts
      // here; the heavier React adoption happens after the first pixels paint.
      startActionSheetEntryAnimation({
        mode: activeEntryMotion,
        overlayOpacity,
        sheetTranslateY,
        mt5TranslateY: resolveMt5EntryTranslateY(),
      });
    } else {
      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(
        activeEntryMotion === 'mt5Slide' ? resolveMt5EntryTranslateY() : 80,
      );
    }
    if (retainedSnapshot.mode === 'committed') {
      openedAtRef.current = Date.now();
    }

    overlayLayerRef.current?.setNativeProps({
      style: { opacity: interactive ? 1 : 0 },
      accessibilityElementsHidden: !interactive,
      importantForAccessibility: interactive ? 'auto' : 'no-hide-descendants',
      pointerEvents: interactive ? 'auto' : 'none',
    });
    sheetBodyRef.current?.setNativeProps({
      pointerEvents: interactive ? 'auto' : 'none',
    });
    return true;
  }, [activeEntryMotion, overlayOpacity, refreshHiddenConfig, resolveMt5EntryTranslateY, sheetTranslateY]);

  useLayoutEffect(
    () => registerRetainedActionSheetVisualApplier(applyRetainedVisualSnapshot),
    [applyRetainedVisualSnapshot],
  );

  useLayoutEffect(() => {
    reactVisibleRef.current = visible;
    activeVisualKeyRef.current = activeVisualKey;
    if (visible && activeVisualKey) {
      if (acknowledgeRetainedActionSheetVisible(activeVisualKey)) {
        // React now owns the visible state; a later unrelated controller hide
        // must not make this already-open sheet non-interactive.
        overlayLayerRef.current?.setNativeProps({
          style: { opacity: 1 },
          accessibilityElementsHidden: false,
          importantForAccessibility: 'auto',
          pointerEvents: 'auto',
        });
        sheetBodyRef.current?.setNativeProps({ pointerEvents: 'auto' });
        if (activeEntryMotion === 'mt5Slide') {
          retainedAdoptionVisualKeyRef.current = activeVisualKey;
        }
        retainedVisualOwnerRef.current = null;
      }
      return;
    }
    if (!visible) {
      syncRetainedActionSheetVisual();
    }
  }, [activeEntryMotion, activeVisualKey, visible]);

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
  const isMt5StylePresentation = activeUsesTransparentMt5Host;
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
  const hasVariableActionRowHeights = filteredActions.some((action) => Boolean(action.subtitle));
  const estimatedVisibleActionRows = Math.max(
    1,
    Math.ceil(actionsMaxHeight / Math.max(1, actionRowMinHeight)),
  );
  // Large sheets (drawing tools) only paint the first viewport of rows so the
  // open frame never builds dozens of icon rows. Remaining rows mount on scroll.
  const progressiveOpenCap = filteredActions.length > ACTION_SHEET_INLINE_ACTION_LIMIT
    ? Math.min(8, estimatedVisibleActionRows)
    : estimatedVisibleActionRows + 1;
  const initialActionRowsToRender = Math.max(
    1,
    Math.min(filteredActions.length, progressiveOpenCap),
  );
  const shouldRenderInlineActions =
    !isTimeframeGridPresentation &&
    !activeSearchable &&
    filteredActions.length <= ACTION_SHEET_INLINE_ACTION_LIMIT &&
    estimatedActionsHeight <= actionsMaxHeight;

  // Run only native-driver opacity and translate animations. Layout and
  // content are already resolved before the first visible frame.
  const runEntryAnimation = useCallback((mode: ActionSheetEntryMotion = 'standard') => {
    startActionSheetEntryAnimation({
      mode,
      overlayOpacity,
      sheetTranslateY,
      mt5TranslateY: resolveMt5EntryTranslateY(),
    });
  }, [overlayOpacity, resolveMt5EntryTranslateY, sheetTranslateY]);

  const hideMt5ActionSheetHostNow = useCallback(() => {
    if (activeEntryMotion !== 'mt5Slide' && !activeImmediateHostHideOnClose) {
      return false;
    }

    // One whole-host mutation removes every outgoing pixel and releases touch
    // ownership before any destination work begins. Moving individual animated
    // values first was both slower and allowed a stale full-sheet ghost.
    overlayLayerRef.current?.setNativeProps({
      style: { opacity: 0 },
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
    });
    hostHiddenImperativelyRef.current = true;
    return true;
  }, [activeEntryMotion, activeImmediateHostHideOnClose]);

  const hideMt5ActionSheetNow = useCallback(() => {
    if (!hideMt5ActionSheetHostNow()) {
      return false;
    }

    // Remove any prepared/committed retained reveal before stopping native
    // motion. Otherwise that stale snapshot can repaint the full sheet after
    // the close has already reached the Quotes screen.
    cancelRetainedActionSheetPreview();
    retainedVisualOwnerRef.current = null;
    retainedAdoptionVisualKeyRef.current = null;
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(resolveMt5EntryTranslateY());
    closeAnimationRunningRef.current = false;
    mt5DismissCompletedRef.current = true;
    sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
    return true;
  }, [hideMt5ActionSheetHostNow, overlayOpacity, resolveMt5EntryTranslateY, sheetTranslateY]);

  const dismissActionSheet = useCallback(() => {
    hideMt5ActionSheetNow();
    onClose();
  }, [hideMt5ActionSheetNow, onClose]);

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

  const handleSheetBodyLayout = useCallback((
    event: { nativeEvent: { layout: { height: number } } },
  ) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) {
      measuredSheetBodyHeightRef.current = height;
    }
  }, []);

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
      dismissActionSheet();
      return true;
    });

    return () => subscription.remove();
  }, [dismissActionSheet, visible]);

  useEffect(() => {
    if (!visible) {
      // A hidden-render passive effect can be queued before retained adoption
      // and run after the newer visible layout commit. Never let that stale
      // close work erase the already-adopted sheet.
      if (reactVisibleRef.current) {
        return;
      }
      if (!mounted) {
        return;
      }

      // Preserve a committed retained reveal BEFORE any imperative host hide.
      // Symbol picker uses immediateHostHideOnClose + retained open; wiping
      // the committed snapshot here left a layout "shrink" with no sheet.
      const retainedSnapshot = getRetainedActionSheetVisualSnapshot();
      if (
        retainedSnapshot.mode === 'committed' &&
        retainedSnapshot.visualKey === activeVisualKey &&
        applyRetainedVisualSnapshot(retainedSnapshot)
      ) {
        return;
      }

      if (activeEntryMotion === 'mt5Slide' || activeImmediateHostHideOnClose) {
        // MT5/Quotes dismissal is a direct host hide. Never replay the old
        // translate animation from a passive hidden render: that animation was
        // the visible shrink plus disappear/reappear sequence in the recording.
        hideMt5ActionSheetNow();
        setKeyboardHeight(0);
        hasMeasuredOverlayRef.current = false;
        return;
      }

      if (!closeAnimationRunningRef.current) {
        overlayOpacity.stopAnimation();
        sheetTranslateY.stopAnimation();
        overlayOpacity.setValue(0);
        sheetTranslateY.setValue(80);
        return;
      }

      // Non-MT5 sheets keep their existing compact close animation. Quotes and
      // other MT5-style sheets returned through the direct-hide branch above.
      startActionSheetExitAnimation({
        instantOpen: activeInstantOpen,
        overlayOpacity,
        sheetTranslateY,
        onComplete: ({ finished }) => {
        if (finished && !prevVisibleRef.current) {
          closeAnimationRunningRef.current = false;
          setMounted(ACTION_SHEET_KEEP_HOST_MOUNTED);
          setKeyboardHeight(0);
          // Render the latest hidden preload only after the outgoing sheet is
          // fully transparent, ready for the next press without a close flash.
          refreshHiddenConfig((revision) => revision + 1);
        }
        },
      });
      return;
    }

    setMounted(true);
    if (retainedAdoptionVisualKeyRef.current === activeVisualKey) {
      // The native MT5-style animation already started in the accepted press
      // turn. React is only adopting ownership; do not restart or snap it.
      retainedAdoptionVisualKeyRef.current = null;
      entryAnimationStartedForOpenRef.current = true;
      return;
    }
    if (entryAnimationStartedForOpenRef.current) {
      return;
    }
    entryAnimationStartedForOpenRef.current = true;
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();

    runEntryAnimation(activeEntryMotion);

    return () => { };
  }, [
    activeEntryMotion,
    activeImmediateHostHideOnClose,
    activeInstantOpen,
    activeVisualKey,
    applyRetainedVisualSnapshot,
    hideMt5ActionSheetNow,
    mounted,
    overlayOpacity,
    resolveMt5EntryTranslateY,
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
      hideMt5ActionSheetHostNow();
      try {
        actionPress?.();
      } finally {
        // The destination is published immediately after one host mutation.
        // Finish native/controller cleanup afterward, then reconcile React.
        hideMt5ActionSheetNow();
        onClose();
      }
      return;
    }

    pendingActionRef.current = actionPress ?? null;
    onClose();
  }, [activeRunActionAfterClose, hideMt5ActionSheetHostNow, hideMt5ActionSheetNow, onClose]);

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
    dismissActionSheet();
  }, [dismissActionSheet]);

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
                action.textColor && !isVisuallyMuted && { color: action.textColor },
                action.textFontWeight && !isVisuallyMuted && { fontWeight: action.textFontWeight },
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

  // An instant sheet must commit at its final Y position. Reusing the native
  // animated value here can expose its previous retained-sheet offset for one
  // Android frame before setValue(0) reaches the UI thread.
  const sheetBodyTranslateY = activeEntryMotion === 'instant'
    ? 0
    : (shouldSeedMt5EntryTransform ? resolveMt5EntryTranslateY() : sheetTranslateY);

  // No fixed height on Android: instant sheets start from the visible window
  // height and then ratchet upward from real layout. The sheet body paints on
  // the first frame so opening never looks like a late resize.
  const sheetBody = (
    <Animated.View
      ref={sheetBodyRef}
      collapsable={false}
      onLayout={handleSheetBodyLayout}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.sheetContainer,
        {
          opacity: 1,
          transform: [{ translateY: sheetBodyTranslateY }],
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
            maxToRenderPerBatch={Math.max(4, Math.min(8, initialActionRowsToRender))}
            updateCellsBatchingPeriod={16}
            windowSize={3}
            getItemLayout={hasVariableActionRowHeights
              ? undefined
              : (_data, index) => ({
                length: actionRowMinHeight,
                offset: actionRowMinHeight * index,
                index,
              })}
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
      ref={overlayLayerRef}
      collapsable={false}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.overlay,
        isMt5StylePresentation ? styles.overlayMt5Plain : null,
        isMt5StylePresentation
          ? { opacity: visible ? 1 : 0 }
          : { opacity: overlayOpacity },
      ]}
      onLayout={handleOverlayLayout}
    >
      {isMt5StylePresentation ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.backdropMt5Plain,
            { opacity: overlayOpacity },
          ]}
        />
      ) : null}
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
