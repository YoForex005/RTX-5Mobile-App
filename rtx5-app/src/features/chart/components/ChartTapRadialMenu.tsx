import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';
import {
  TvRadialIndicators,
  TvFx,
  TvLayers,
  TvRadialPencil,
} from './ChartToolbarIcons';
import { useTranslation } from '../../../i18n/useTranslation';

export type ChartTapMenuAnchor = {
  x: number;
  y: number;
  price?: number | null;
};

export type ChartTapMenuBounds = {
  width: number;
  height: number;
};

type ChartTapRadialMenuProps = {
  anchor: ChartTapMenuAnchor;
  bounds: ChartTapMenuBounds;
  activeTimeframe: string;
  accentColor: string;
  mutedColor: string;
  isDark: boolean;
  onDismiss: () => void;
  onSelectTimeframe: (timeframe: string) => void;
  onOpenObjects: () => void;
  onOpenDrawingTools: () => void;
  onOpenIndicators: () => void;

  onOpenSymbolPicker: () => void;
  onOpenScaleControls: () => void;
};

const CHART_TAP_MENU_SIZE = 268;
const CHART_TAP_RING_WIDTH = 42;
const CHART_TAP_TIMEFRAME_HEIGHT = 30;
const CHART_TAP_OUTER_ITEM_RADIUS = CHART_TAP_MENU_SIZE / 2 - CHART_TAP_RING_WIDTH / 2;
const CHART_TAP_ACTION_RADIUS = CHART_TAP_OUTER_ITEM_RADIUS;
const CHART_TAP_MENU_PADDING = 10;
const CHART_TAP_MENU_DISMISS_GRACE_MS = 32;
const CHART_TAP_MENU_OPEN_DURATION_MS = 140;
const CHART_TAP_MENU_OPEN_SCALE_FROM = 0.58;
const CHART_TAP_MENU_OPEN_OPACITY_FROM = 0.92;
// Large enough for fingers on the ring, but not so large that neighbors collide.
const CHART_TAP_ACTION_HIT_SLOP = { top: 14, bottom: 14, left: 14, right: 14 } as const;
const CHART_TAP_TIMEFRAME_HIT_SLOP = { top: 12, bottom: 12, left: 10, right: 10 } as const;
// Drag claim must stay looser than a normal tap — capture:true used to steal
// Android presses from timeframe labels before onPress could fire.
const CHART_TAP_MENU_DRAG_CLAIM_PX = 12;

const TIMEFRAME_ITEMS: Array<{ key: string; angle: number; width: number }> = [
  { key: 'M1', angle: 312, width: 38 },
  { key: 'M5', angle: 336, width: 38 },
  { key: 'M15', angle: 0, width: 48 },
  { key: 'M30', angle: 24, width: 48 },
  { key: 'H1', angle: 48, width: 38 },
  { key: 'H4', angle: 72, width: 38 },
  { key: 'D1', angle: 96, width: 38 },
  { key: 'W1', angle: 120, width: 38 },
  { key: 'MN', angle: 144, width: 40 },
];

/**
 * Helper to restrict a value within a given min and max range.
 */
const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Ensures the radial menu does not render partially off-screen by clamping its center
 * position relative to the container boundaries and its padding.
 */
const clampMenuCenter = (value: number, containerSize: number) =>
  clampValue(
    value,
    CHART_TAP_MENU_PADDING + CHART_TAP_MENU_SIZE / 2,
    Math.max(
      CHART_TAP_MENU_PADDING + CHART_TAP_MENU_SIZE / 2,
      containerSize - CHART_TAP_MENU_SIZE / 2 - CHART_TAP_MENU_PADDING,
    ),
  );

/**
 * Calculates the absolute (left, top) pixel position of a radial menu item
 * given its angle and distance (radius) from the center.
 */
const getRadialItemPosition = (
  angleFromTop: number,
  radius: number,
  itemWidth: number,
  itemHeight: number = itemWidth,
) => {
  const radians = ((angleFromTop - 90) * Math.PI) / 180;
  const center = CHART_TAP_MENU_SIZE / 2;
  return {
    left: center + Math.cos(radians) * radius - itemWidth / 2,
    top: center + Math.sin(radians) * radius - itemHeight / 2,
  };
};

/**
 * Calculates the proper rotation angle for text items on the radial ring
 * so they remain readable (not upside-down).
 */
const getRadialTextRotation = (angleFromTop: number) => {
  let rotation = angleFromTop <= 180 ? angleFromTop : angleFromTop - 360;
  if (rotation > 90) {
    rotation -= 180;
  }
  if (rotation < -90) {
    rotation += 180;
  }
  return `${rotation}deg`;
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
      elevation: 120,
    },
    menu: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: CHART_TAP_MENU_SIZE,
      height: CHART_TAP_MENU_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 41,
      elevation: 121,
      backgroundColor: 'transparent',
    },
    menuContent: {
      width: CHART_TAP_MENU_SIZE,
      height: CHART_TAP_MENU_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    ring: {
      position: 'absolute',
      width: CHART_TAP_MENU_SIZE,
      height: CHART_TAP_MENU_SIZE,
      borderRadius: CHART_TAP_MENU_SIZE / 2,
      borderWidth: CHART_TAP_RING_WIDTH,
      backgroundColor: 'transparent',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.3 : 0.18,
      shadowRadius: 24,
      elevation: 10,
    },
    timeframeItem: {
      position: 'absolute',
      height: CHART_TAP_TIMEFRAME_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      // Above the ring + inner dismiss so TF taps never fall into a dead zone.
      zIndex: 24,
      elevation: 16,
    },
    timeframeText: {
      color: '#FFFFFF',
      fontSize: 13,
      lineHeight: 14,
      fontWeight: '600',
      letterSpacing: 0,
      opacity: 0.95,
      textAlign: 'center',
      includeFontPadding: false,
      textAlignVertical: 'center',
      minWidth: '100%',
      textShadowColor: 'rgba(0,0,0,0.18)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
      // Text must not compete for the press responder.
      pointerEvents: 'none',
    },
    timeframeTextActive: {
      opacity: 1,
    },
    actionItem: {
      position: 'absolute',
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 22,
      elevation: 14,
    },
    centerAction: {
      position: 'absolute',
      width: 66,
      height: 66,
      borderRadius: 33,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2962FF',
      borderWidth: 2,
      borderColor: '#2962FF',
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.26 : 0.18,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      elevation: 18,
      gap: 1,
    },
    centerActionLabel: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
    innerDismissArea: {
      position: 'absolute',
      width: CHART_TAP_MENU_SIZE - CHART_TAP_RING_WIDTH * 2,
      height: CHART_TAP_MENU_SIZE - CHART_TAP_RING_WIDTH * 2,
      top: CHART_TAP_RING_WIDTH,
      left: CHART_TAP_RING_WIDTH,
      borderRadius: (CHART_TAP_MENU_SIZE - CHART_TAP_RING_WIDTH * 2) / 2,
      backgroundColor: 'transparent',
      // Below timeframe / action items so their presses still win on overlap.
      zIndex: 1,
    },
  });

/**
 * Renders an MT5-style interactive radial menu at a specific tap location on the chart.
 * This menu allows quick access to timeframes, drawing tools, objects, and settings.
 */
export function ChartTapRadialMenu({
  anchor,
  bounds,
  activeTimeframe,
  accentColor,
  mutedColor,
  isDark,
  onDismiss,
  onSelectTimeframe,
  onOpenObjects,
  onOpenDrawingTools,
  onOpenIndicators,

  onOpenSymbolPicker,
  onOpenScaleControls,
}: ChartTapRadialMenuProps) {
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(isDark), [isDark]);
  const containerWidth = bounds.width;
  const containerHeight = bounds.height;
  const timeframeMenuLabel = t('Timeframes');

  const resolveMenuPosition = React.useCallback(
    (centerX: number, centerY: number) => {
      const clampedCenterX = clampMenuCenter(centerX, containerWidth);
      const clampedCenterY = clampMenuCenter(centerY, containerHeight);
      return {
        left: Math.round(clampedCenterX - CHART_TAP_MENU_SIZE / 2),
        top: Math.round(clampedCenterY - CHART_TAP_MENU_SIZE / 2),
      };
    },
    [containerHeight, containerWidth],
  );

  const computeAnchorPosition = React.useCallback(() => (
    resolveMenuPosition(anchor.x, anchor.y)
  ), [anchor.x, anchor.y, resolveMenuPosition]);

  const [menuPosition, setMenuPosition] = React.useState(computeAnchorPosition);
  const menuViewRef = React.useRef<View>(null);
  const menuPositionRef = React.useRef(menuPosition);
  const dragOriginRef = React.useRef(menuPosition);
  const dismissReadyAtRef = React.useRef(Date.now() + CHART_TAP_MENU_DISMISS_GRACE_MS);
  const lastAnchorKeyRef = React.useRef(`${anchor.x}:${anchor.y}:${containerWidth}:${containerHeight}`);
  const syncFrameRef = React.useRef<number | null>(null);
  const entranceOpacity = React.useRef(new Animated.Value(CHART_TAP_MENU_OPEN_OPACITY_FROM)).current;
  const entranceScale = React.useRef(new Animated.Value(CHART_TAP_MENU_OPEN_SCALE_FROM)).current;

  const startEntranceAnimation = React.useCallback(() => {
    entranceOpacity.stopAnimation();
    entranceScale.stopAnimation();
    entranceOpacity.setValue(CHART_TAP_MENU_OPEN_OPACITY_FROM);
    entranceScale.setValue(CHART_TAP_MENU_OPEN_SCALE_FROM);
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: CHART_TAP_MENU_OPEN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(entranceScale, {
        toValue: 1,
        stiffness: 420,
        damping: 32,
        mass: 0.72,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entranceOpacity, entranceScale]);

  const applyMenuPosition = React.useCallback(
    (left: number, top: number, commitToState = false) => {
      const nextPosition = resolveMenuPosition(
        left + CHART_TAP_MENU_SIZE / 2,
        top + CHART_TAP_MENU_SIZE / 2,
      );
      menuPositionRef.current = nextPosition;
      menuViewRef.current?.setNativeProps({
        style: { top: nextPosition.top, left: nextPosition.left },
      });
      if (commitToState) {
        setMenuPosition(nextPosition);
      } else if (syncFrameRef.current === null) {
        syncFrameRef.current = requestAnimationFrame(() => {
          syncFrameRef.current = null;
          setMenuPosition(menuPositionRef.current);
        });
      }
      return nextPosition;
    },
    [resolveMenuPosition],
  );

  React.useEffect(() => {
    startEntranceAnimation();
    return () => {
      entranceOpacity.stopAnimation();
      entranceScale.stopAnimation();
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
    };
  }, [entranceOpacity, entranceScale, startEntranceAnimation]);

  React.useEffect(() => {
    menuPositionRef.current = menuPosition;
  }, [menuPosition]);

  React.useLayoutEffect(() => {
    const key = `${anchor.x}:${anchor.y}:${containerWidth}:${containerHeight}`;
    if (lastAnchorKeyRef.current === key && menuPositionRef.current) {
      return;
    }
    lastAnchorKeyRef.current = key;
    dismissReadyAtRef.current = Date.now() + CHART_TAP_MENU_DISMISS_GRACE_MS;
    const nextPosition = computeAnchorPosition();
    menuPositionRef.current = nextPosition;
    setMenuPosition(nextPosition);
    startEntranceAnimation();
  }, [
    anchor.x,
    anchor.y,
    computeAnchorPosition,
    containerHeight,
    containerWidth,
    startEntranceAnimation,
  ]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        // Never claim the initial touch — children (timeframes/actions) own taps.
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > CHART_TAP_MENU_DRAG_CLAIM_PX
          || Math.abs(gestureState.dy) > CHART_TAP_MENU_DRAG_CLAIM_PX,
        // Do not capture moves: capturing cancelled FastPressable presses on
        // Android before timeframe onPress could run.
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: () => {
          dragOriginRef.current = menuPositionRef.current;
        },
        onPanResponderMove: (_event, gestureState) => {
          applyMenuPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
            false,
          );
        },
        onPanResponderRelease: (_event, gestureState) => {
          applyMenuPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
            true,
          );
        },
        onPanResponderTerminate: (_event, gestureState) => {
          applyMenuPosition(
            dragOriginRef.current.left + gestureState.dx,
            dragOriginRef.current.top + gestureState.dy,
            true,
          );
        },
        // Allow Pressable children to keep the responder for clean taps.
        onPanResponderTerminationRequest: () => true,
      }),
    [applyMenuPosition],
  );

  const handleBackdropPress = React.useCallback(() => {
    if (Date.now() < dismissReadyAtRef.current) {
      return;
    }
    onDismiss();
  }, [onDismiss]);

  /**
   * Wrapper for radial item press events to ensure the menu gracefully closes
   * and touch events do not propagate through to the chart underneath.
   */
  const handleActionItemPress = React.useCallback((event: any, onPress: () => void) => {
    event.stopPropagation?.();
    onPress();
  }, []);

  const actionItems: Array<{
    key: string;
    angle: number;
    boxSize?: number;
    accessibilityLabel: string;
    render: (color: string) => React.ReactNode;
    onPress: () => void;
  }> = [
    {
      key: 'objects',
      angle: 282,
      boxSize: 26,
      accessibilityLabel: t('Objects'),
      render: (color) => <TvLayers color={color} />,
      onPress: onOpenObjects,
    },
    {
      key: 'draw',
      angle: 252,
      boxSize: 24,
      accessibilityLabel: t('Drawing Tools'),
      render: (color) => <TvRadialPencil color={color} />,
      onPress: onOpenDrawingTools,
    },
    {
      key: 'scale',
      angle: 222,
      boxSize: 24,
      accessibilityLabel: `${t('Chart')} ${t('Options')}`,
      onPress: onOpenScaleControls,
      render: (color) => <Ionicons name="options-outline" size={22} color={color} />,
    },
    {
      key: 'symbol',
      angle: 192,
      boxSize: 24,
      accessibilityLabel: t('Select Symbol'),
      render: (color) => <TvFx color={color} />,
      onPress: onOpenSymbolPicker,
    },
    {
      key: 'indicators',
      angle: 168,
      boxSize: 24,
      accessibilityLabel: t('Indicators'),
      render: (color) => <TvRadialIndicators color={color} />,
      onPress: onOpenIndicators,
    },
  ];
  return (
    <View style={styles.layer} pointerEvents="box-none" collapsable={false}>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPressIn={handleBackdropPress}
        unstable_pressDelay={0}
      />
      <View
        ref={menuViewRef}
        collapsable={false}
        renderToHardwareTextureAndroid
        needsOffscreenAlphaCompositing
        style={[
          styles.menu,
          {
            top: menuPosition.top,
            left: menuPosition.left,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Animated.View
          accessibilityLabel={timeframeMenuLabel}
          style={[
            styles.menuContent,
            {
              opacity: entranceOpacity,
              transform: [{ scale: entranceScale }],
            },
          ]}
        >
          <View style={[styles.ring, { borderColor: accentColor, shadowColor: accentColor }]} />

          {/* Tapping inside the empty inner circle dismisses the menu. Without
              this, the ring's containing View absorbs the touch but the
              panResponder only claims drags — so taps in the centre fall into
              a dead zone instead of reaching the backdrop Pressable behind. */}
          <Pressable
            style={styles.innerDismissArea}
            onPressIn={handleBackdropPress}
            unstable_pressDelay={0}
          />

          {TIMEFRAME_ITEMS.map((item) => {
            const position = getRadialItemPosition(
              item.angle,
              CHART_TAP_OUTER_ITEM_RADIUS,
              item.width,
              CHART_TAP_TIMEFRAME_HEIGHT,
            );
            const isActive = String(activeTimeframe ?? '').toUpperCase() === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`${timeframeMenuLabel} ${item.key}`}
                accessibilityState={{ selected: isActive }}
                // Same fast-press path as action icons — plain onPress alone
                // dropped many Android taps over the WebView chart surface.
                onPress={(event) => handleActionItemPress(event, () => onSelectTimeframe(item.key))}
                activateOnPressIn
                activateOnTouchStart
                hitSlop={CHART_TAP_TIMEFRAME_HIT_SLOP}
                unstable_pressDelay={0}
                style={[
                  styles.timeframeItem,
                  position,
                  {
                    width: item.width,
                    transform: [{ rotate: getRadialTextRotation(item.angle) }],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timeframeText,
                    isActive && styles.timeframeTextActive,
                  ]}
                >
                  {item.key}
                </Text>
              </Pressable>
            );
          })}

          {actionItems.map((item) => {
            const itemBoxSize = item.boxSize ?? 30;
            const position = getRadialItemPosition(
              item.angle,
              CHART_TAP_ACTION_RADIUS,
              itemBoxSize,
            );
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.accessibilityLabel}
                onPress={(event) => handleActionItemPress(event, item.onPress)}
                activateOnPressIn
                activateOnTouchStart
                hitSlop={CHART_TAP_ACTION_HIT_SLOP}
                unstable_pressDelay={0}
                style={[styles.actionItem, position, { width: itemBoxSize, height: itemBoxSize }]}
              >
                {item.render(mutedColor)}
              </Pressable>
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
}
