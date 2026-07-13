import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, type ViewProps } from 'react-native';
import Animated, {
  executeOnUIRuntimeSync,
  makeMutable,
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { OrderTicketLaunchShell } from './OrderTicketLaunchShell';
import { orderTicketLaunchController } from './orderTicketLaunchController';
import { safeRouterBack } from '../../utils/navigation';

type OrderTicketLaunchHostGlobal = typeof globalThis & {
  __rtx5OrderTicketLaunchVisibility?: SharedValue<number>;
};

const hostGlobal = globalThis as OrderTicketLaunchHostGlobal;
const orderTicketLaunchVisibility =
  hostGlobal.__rtx5OrderTicketLaunchVisibility ?? makeMutable(0);
hostGlobal.__rtx5OrderTicketLaunchVisibility = orderTicketLaunchVisibility;

function writeOrderTicketLaunchVisibilityNow(visible: boolean) {
  const nextValue = visible ? 1 : 0;
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      orderTicketLaunchVisibility.value = value;
    })(nextValue);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[OrderTicketLaunch] sync UI write unavailable, using async fallback:', error);
    }
    orderTicketLaunchVisibility.value = nextValue;
  }
}

/**
 * Pre-mounted optimistic first frame for Quotes -> New Order.
 *
 * Its visibility flips on the UI runtime before native-stack construction, so
 * the user sees a real ticket shell on the next vsync even when JS is busy.
 */
export function OrderTicketLaunchHost() {
  const router = useRouter();
  const backInFlightRef = useRef(false);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useSyncExternalStore(
    orderTicketLaunchController.subscribe,
    orderTicketLaunchController.getSnapshot,
    orderTicketLaunchController.getSnapshot,
  );
  const animatedStyle = useAnimatedStyle(() => {
    const visible = orderTicketLaunchVisibility.value === 1;
    return {
      opacity: visible ? 1 : 0,
      zIndex: visible ? 30 : 0,
    };
  });
  const animatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: orderTicketLaunchVisibility.value === 1 ? 'auto' : 'none',
  }));

  const popRouteWhenReady = useCallback(() => {
    let attempt = 0;
    const tryPop = () => {
      try {
        if (router.canGoBack()) {
          safeRouterBack(router, '/(tabs)/quotes');
          return;
        }
      } catch {
        return;
      }

      attempt += 1;
      if (attempt > 4) {
        return;
      }
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(tryPop);
      } else {
        setTimeout(tryPop, 16);
      }
    };
    tryPop();
  }, [router]);

  const closeLaunch = useCallback(() => {
    const currentSnapshot = orderTicketLaunchController.getSnapshot();
    if (!currentSnapshot.visible || backInFlightRef.current) {
      return;
    }

    backInFlightRef.current = true;
    const navigationStarted = currentSnapshot.navigationStarted;
    orderTicketLaunchController.hide(currentSnapshot.revision);

    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, navigationStarted ? 700 : 100);

    if (!navigationStarted) {
      return;
    }

    popRouteWhenReady();
  }, [popRouteWhenReady]);

  useEffect(
    () => orderTicketLaunchController.registerVisualApplier(
      writeOrderTicketLaunchVisibilityNow,
    ),
    [],
  );

  useEffect(() => {
    if (snapshot.visible) {
      backInFlightRef.current = false;
    }
  }, [snapshot.visible, snapshot.revision]);

  useEffect(() => () => {
    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backInFlightRef.current) {
        return true;
      }
      if (!orderTicketLaunchController.isVisible()) {
        return false;
      }

      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <Animated.View
      animatedProps={animatedProps}
      pointerEvents={snapshot.visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!snapshot.visible}
      importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.host, animatedStyle, snapshot.visible && styles.hostVisible]}
      testID="order-ticket-launch-host"
    >
      <OrderTicketLaunchShell
        symbol={snapshot.symbol}
        onBack={closeLaunch}
        backLatencyLabel="orderTicket.launch.back"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    elevation: 30,
  },
  hostVisible: {
    opacity: 1,
    zIndex: 31,
  },
});
