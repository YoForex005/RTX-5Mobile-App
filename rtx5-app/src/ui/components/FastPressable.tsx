import React, { memo, useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import {
  FAST_PRESS_GUARD_RESET_MS,
  getInteractionNow,
  scheduleActionLatencyCheck,
} from '../../utils/actionLatency';

type FastPressableProps = PressableProps & {
  latencyLabel?: string;
  latencyBudgetMs?: number;
  pressGuardResetMs?: number;
};

export const FastPressable = memo(function FastPressable({
  onPress,
  onPressIn,
  onPressOut,
  unstable_pressDelay,
  latencyLabel = 'fastPress',
  latencyBudgetMs,
  pressGuardResetMs = FAST_PRESS_GUARD_RESET_MS,
  ...props
}: FastPressableProps) {
  const handledOnPressInRef = useRef(false);
  const clearHandledTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (clearHandledTimeoutRef.current) {
      clearTimeout(clearHandledTimeoutRef.current);
      clearHandledTimeoutRef.current = null;
    }
  }, []);

  const runPressAction = useCallback((event: GestureResponderEvent) => {
    if (!onPress) {
      return;
    }
    const startedAtMs = getInteractionNow();
    onPress(event);
    scheduleActionLatencyCheck(latencyLabel, startedAtMs, latencyBudgetMs);
  }, [latencyBudgetMs, latencyLabel, onPress]);

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    if (clearHandledTimeoutRef.current) {
      clearTimeout(clearHandledTimeoutRef.current);
      clearHandledTimeoutRef.current = null;
    }
    handledOnPressInRef.current = true;
    onPressIn?.(event);
    runPressAction(event);
  }, [onPressIn, runPressAction]);

  const handlePress = useCallback((event: GestureResponderEvent) => {
    if (handledOnPressInRef.current) {
      handledOnPressInRef.current = false;
      return;
    }
    runPressAction(event);
  }, [runPressAction]);

  const handlePressOut = useCallback((event: GestureResponderEvent) => {
    onPressOut?.(event);
    const clearHandledFlag = () => {
      handledOnPressInRef.current = false;
      clearHandledTimeoutRef.current = null;
    };

    clearHandledTimeoutRef.current = setTimeout(clearHandledFlag, pressGuardResetMs);
  }, [onPressOut, pressGuardResetMs]);

  return (
    <Pressable
      {...props}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onPressOut={handlePressOut}
      unstable_pressDelay={unstable_pressDelay ?? 0}
    />
  );
});
