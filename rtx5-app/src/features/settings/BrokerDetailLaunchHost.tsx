import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View, type ViewProps } from 'react-native';
import Animated, {
  executeOnUIRuntimeSync,
  makeMutable,
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { safeRouterBack } from '../../utils/navigation';
import { BrokerDetailLaunchShell } from './BrokerDetailLaunchShell';
import { brokerDetailLaunchController } from './brokerDetailLaunchController';

type BrokerDetailLaunchHostGlobal = typeof globalThis & {
  __rtx5BrokerDetailLaunchVisibility?: SharedValue<number>;
};

const hostGlobal = globalThis as BrokerDetailLaunchHostGlobal;
const brokerDetailLaunchVisibility =
  hostGlobal.__rtx5BrokerDetailLaunchVisibility ?? makeMutable(0);
hostGlobal.__rtx5BrokerDetailLaunchVisibility = brokerDetailLaunchVisibility;

function writeBrokerDetailLaunchVisibilityNow(visible: boolean) {
  const nextValue = visible ? 1 : 0;
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      brokerDetailLaunchVisibility.value = value;
    })(nextValue);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[BrokerDetailLaunch] sync UI write unavailable, using async fallback:', error);
    }
    brokerDetailLaunchVisibility.value = nextValue;
  }
}

/** Root-level host: it can cover the Brokers route while broker detail is built. */
export function BrokerDetailLaunchHost() {
  const router = useRouter();
  const backInFlightRef = useRef(false);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useSyncExternalStore(
    brokerDetailLaunchController.subscribe,
    brokerDetailLaunchController.getSnapshot,
    brokerDetailLaunchController.getSnapshot,
  );
  const animatedStyle = useAnimatedStyle(() => {
    const visible = brokerDetailLaunchVisibility.value === 1;
    return {
      elevation: visible ? 42 : 0,
      opacity: visible ? 1 : 0,
      zIndex: visible ? 42 : 0,
    };
  });
  const animatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: brokerDetailLaunchVisibility.value === 1 ? 'auto' : 'none',
  }));

  const popRouteWhenReady = useCallback(() => {
    let attempt = 0;
    const tryPop = () => {
      try {
        if (router.canGoBack()) {
          safeRouterBack(router, '/settings/brokers');
          return;
        }
      } catch {
        return;
      }

      attempt += 1;
      if (attempt > 4) return;
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(tryPop);
      } else {
        setTimeout(tryPop, 16);
      }
    };

    // Back can arrive before the native push commits; remove it when ready.
    tryPop();
  }, [router]);

  const closeLaunch = useCallback(() => {
    const current = brokerDetailLaunchController.getSnapshot();
    if (!current.visible || backInFlightRef.current) return;

    backInFlightRef.current = true;
    const navigationStarted = current.navigationStarted;
    brokerDetailLaunchController.hide(current.revision);

    if (backGuardTimerRef.current) clearTimeout(backGuardTimerRef.current);
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, navigationStarted ? 700 : 100);

    if (navigationStarted) popRouteWhenReady();
  }, [popRouteWhenReady]);

  const openDemoAccount = useCallback(() => {
    const current = brokerDetailLaunchController.getSnapshot();
    brokerDetailLaunchController.hide(current.revision);

    // The launch shell may still cover the just-mounted broker route. Its Demo
    // command pushes the lightweight entry immediately; that route owns load.
    router.push('/register-entry');
  }, [router]);

  useEffect(
    () => brokerDetailLaunchController.registerVisualApplier(
      writeBrokerDetailLaunchVisibilityNow,
    ),
    [],
  );

  useEffect(() => {
    if (snapshot.visible) backInFlightRef.current = false;
  }, [snapshot.revision, snapshot.visible]);

  useEffect(() => () => {
    if (backGuardTimerRef.current) clearTimeout(backGuardTimerRef.current);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backInFlightRef.current) return true;
      if (!brokerDetailLaunchController.isVisible()) return false;
      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View pointerEvents="box-none" style={styles.hostRoot} testID="broker-detail-launch-host">
      <Animated.View
        animatedProps={animatedProps}
        pointerEvents={snapshot.visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[styles.hostLayer, animatedStyle]}
        testID="broker-detail-launch-animated-host"
      >
        <BrokerDetailLaunchShell
          selection={snapshot.selection}
          onBack={closeLaunch}
          onOpenDemo={openDemoAccount}
          backLatencyLabel="brokerDetail.launch.back"
        />
      </Animated.View>

      {/* Plain React fallback covers devices where the sync UI write arrives late. */}
      <View
        pointerEvents={snapshot.visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.hostLayer,
          snapshot.visible ? styles.reactHostVisible : styles.reactHostHidden,
        ]}
        testID="broker-detail-launch-react-host"
      >
        <BrokerDetailLaunchShell
          selection={snapshot.selection}
          onBack={closeLaunch}
          onOpenDemo={openDemoAccount}
          backLatencyLabel="brokerDetail.launch.back"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hostRoot: { ...StyleSheet.absoluteFillObject },
  hostLayer: { ...StyleSheet.absoluteFillObject },
  reactHostHidden: { elevation: 0, opacity: 0, zIndex: 0 },
  reactHostVisible: { elevation: 43, opacity: 1, zIndex: 43 },
});
