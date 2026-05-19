import React, { memo, useCallback } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import {
  getInteractionNow,
  FAST_PRESS_GUARD_RESET_MS,
  scheduleActionLatencyCheck,
} from '../../utils/actionLatency';

type FastPressCallback = (event: any) => void;
type FastPressableProps = Omit<
  PressableProps,
  | 'onLongPress'
  | 'onPress'
  | 'onPressIn'
  | 'onPressOut'
  | 'onResponderGrant'
  | 'onStartShouldSetResponder'
  | 'onTouchStart'
> & {
  onLongPress?: null | FastPressCallback;
  onPress?: null | FastPressCallback;
  onPressIn?: null | FastPressCallback;
  onPressOut?: null | FastPressCallback;
  onResponderGrant?: null | FastPressCallback;
  onStartShouldSetResponder?: null | ((event: FastPressEvent) => boolean);
  onTouchStart?: null | FastPressCallback;
  latencyLabel?: string;
  latencyBudgetMs?: number;
  /**
   * When true, fires the `onPress` action at the earliest possible moment
   * (onPressIn) rather than waiting for the full press-release cycle.
   *
   * Uses Pressable internally (not raw View responder) so it correctly
   * negotiates touch ownership with ScrollView, GestureHandler, and other
   * gesture systems — avoiding the silent touch-drop bug on Android that
   * raw View responders cause inside scrollable containers.
   */
  activateOnPressIn?: boolean;
};
type FastPressEvent = GestureResponderEvent;

const DEFAULT_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;
const DEFAULT_PRESS_RETENTION_OFFSET = { top: 20, bottom: 20, left: 20, right: 20 } as const;

const normalizePressEvent = (event: FastPressEvent) => {
  const eventWithResponderControls = event as FastPressEvent & {
    preventDefault?: () => void;
    stopPropagation?: () => void;
  };
  eventWithResponderControls.stopPropagation ??= () => undefined;
  eventWithResponderControls.preventDefault ??= () => undefined;
  return eventWithResponderControls;
};

/**
 * Production-grade fast-touch button for React Native.
 *
 * Architecture:
 * - Always renders a Pressable (never a raw View) for reliable touch
 *   negotiation across all gesture contexts (ScrollView, GestureHandler).
 * - `unstable_pressDelay={0}` eliminates the ~130ms default press delay.
 * - `activateOnPressIn` fires the action on the first touch frame via
 *   onPressIn, then deduplicates the subsequent onPress with a ref guard.
 * - The ref guard auto-clears on onPressOut via a microtask (setTimeout 0)
 *   so cancelled gestures (scroll steal, responder termination) don't
 *   leave the guard stuck.
 * - Avoids useState for pressed visual state to eliminate re-render churn
 *   on every tap — the visual press feedback comes from Pressable's native
 *   `({ pressed })` style function which runs on the UI thread.
 */
export const FastPressable = memo(function FastPressable({
  onPress,
  onPressIn,
  onPressOut,
  onResponderGrant,
  onStartShouldSetResponder,
  onTouchStart,
  disabled,
  children,
  style,
  hitSlop,
  pressRetentionOffset,
  unstable_pressDelay,
  latencyLabel = 'fastPress',
  latencyBudgetMs,
  activateOnPressIn = false,
  ...props
}: FastPressableProps) {
  // Guard ref: prevents the same tap from firing onPress twice when
  // activateOnPressIn already ran it during onPressIn.
  const handledOnPressInRef = React.useRef(false);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPressGuardTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearPressGuardTimer, [clearPressGuardTimer]);

  const runPressAction = useCallback((action: null | FastPressCallback | undefined, event: FastPressEvent) => {
    if (!action) return;
    const startedAtMs = getInteractionNow();
    action(normalizePressEvent(event));
    scheduleActionLatencyCheck(latencyLabel, startedAtMs, latencyBudgetMs);
  }, [latencyBudgetMs, latencyLabel]);

  const resetPressGuard = useCallback(() => {
    clearPressGuardTimer();
    resetTimerRef.current = setTimeout(() => {
      handledOnPressInRef.current = false;
      resetTimerRef.current = null;
    }, FAST_PRESS_GUARD_RESET_MS);
  }, [clearPressGuardTimer]);

  const handleStartShouldSetResponder = useCallback((event: FastPressEvent) => {
    return Boolean(onStartShouldSetResponder?.(event));
  }, [onStartShouldSetResponder]);

  const handleResponderGrant = useCallback((event: FastPressEvent) => {
    if (onResponderGrant) {
      runPressAction(onResponderGrant, event);
    }
  }, [onResponderGrant, runPressAction]);

  const handleTouchStart = useCallback((event: FastPressEvent) => {
    if (onTouchStart) {
      runPressAction(onTouchStart, event);
    }
  }, [onTouchStart, runPressAction]);

  const handlePressIn = useCallback((event: FastPressEvent) => {
    const pressAlreadyHandled = handledOnPressInRef.current;
    if (onPressIn && (!pressAlreadyHandled || onPressIn !== onPress)) {
      runPressAction(onPressIn, event);
    }
    if (activateOnPressIn && onPress && !pressAlreadyHandled) {
      clearPressGuardTimer();
      handledOnPressInRef.current = true;
      if (onPress !== onPressIn) {
        runPressAction(onPress, event);
      }
    }
  }, [activateOnPressIn, clearPressGuardTimer, onPress, onPressIn, runPressAction]);

  const handlePress = useCallback((event: FastPressEvent) => {
    // Skip if already fired during onPressIn
    if (handledOnPressInRef.current) {
      handledOnPressInRef.current = false;
      clearPressGuardTimer();
      return;
    }
    runPressAction(onPress, event);
  }, [clearPressGuardTimer, onPress, runPressAction]);

  const handlePressOut = useCallback((event: FastPressEvent) => {
    if (onPressOut) {
      onPressOut(event);
    }
    if (!activateOnPressIn || !handledOnPressInRef.current) return;

    // Keep the guard briefly for successful taps where onPressOut precedes
    // onPress, then clear it for cancelled gestures that never emit onPress.
    resetPressGuard();
  }, [activateOnPressIn, onPressOut, resetPressGuard]);

  const needsPressInHandler = activateOnPressIn || Boolean(onPressIn);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={style}
      onStartShouldSetResponder={onStartShouldSetResponder ? handleStartShouldSetResponder : undefined}
      onResponderGrant={onResponderGrant ? handleResponderGrant : undefined}
      onTouchStart={onTouchStart ? handleTouchStart : undefined}
      onPressIn={needsPressInHandler ? handlePressIn : undefined}
      onPress={onPress ? handlePress : undefined}
      onPressOut={onPressOut || activateOnPressIn ? handlePressOut : undefined}
      hitSlop={hitSlop ?? DEFAULT_HIT_SLOP}
      pressRetentionOffset={pressRetentionOffset ?? DEFAULT_PRESS_RETENTION_OFFSET}
      unstable_pressDelay={unstable_pressDelay ?? 0}
    >
      {children}
    </Pressable>
  );
});
