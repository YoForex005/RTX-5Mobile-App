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
import { showSidebarDestination } from '../../ui/components/sidebarDestinationHostController';
import { brokersLaunchController } from './brokersLaunchController';
import { BrokersLaunchShell } from './BrokersLaunchShell';

type BrokersLaunchHostGlobal = typeof globalThis & {
  __rtx5BrokersLaunchVisibility?: SharedValue<number>;
};

const hostGlobal = globalThis as BrokersLaunchHostGlobal;
const brokersLaunchVisibility =
  hostGlobal.__rtx5BrokersLaunchVisibility ?? makeMutable(0);
hostGlobal.__rtx5BrokersLaunchVisibility = brokersLaunchVisibility;

function writeBrokersLaunchVisibilityNow(visible: boolean) {
  const nextValue = visible ? 1 : 0;
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      brokersLaunchVisibility.value = value;
    })(nextValue);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[BrokersLaunch] sync UI write unavailable, using async fallback:', error);
    }
    brokersLaunchVisibility.value = nextValue;
  }
}

/** Keeps the lightweight Brokers first frame mounted and ready above Accounts. */
export function BrokersLaunchHost() {
  const router = useRouter();
  const backInFlightRef = useRef(false);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useSyncExternalStore(
    brokersLaunchController.subscribe,
    brokersLaunchController.getSnapshot,
    brokersLaunchController.getSnapshot,
  );
  const animatedStyle = useAnimatedStyle(() => {
    const visible = brokersLaunchVisibility.value === 1;
    return {
      elevation: visible ? 34 : 0,
      opacity: visible ? 1 : 0,
      zIndex: visible ? 34 : 0,
    };
  });
  const animatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: brokersLaunchVisibility.value === 1 ? 'auto' : 'none',
  }));

  const popRouteWhenReady = useCallback(() => {
    let attempt = 0;
    const tryPop = () => {
      try {
        if (router.canGoBack()) {
          safeRouterBack(router, '/settings/accounts');
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

    // Back can beat the root-stack push. Retry briefly and remove that route
    // as soon as navigation has committed it.
    tryPop();
  }, [router]);

  const closeLaunch = useCallback(() => {
    const currentSnapshot = brokersLaunchController.getSnapshot();
    if (!currentSnapshot.visible || backInFlightRef.current) {
      return;
    }

    backInFlightRef.current = true;
    const navigationStarted = currentSnapshot.navigationStarted;

    // Put the retained Accounts screen underneath before removing the launch
    // shell, so Back never flashes the Settings page between the two screens.
    showSidebarDestination('accounts', 'route-sync');
    brokersLaunchController.hide(currentSnapshot.revision);

    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, navigationStarted ? 700 : 100);

    if (navigationStarted) {
      popRouteWhenReady();
    }
  }, [popRouteWhenReady]);

  useEffect(
    () => brokersLaunchController.registerVisualApplier(
      writeBrokersLaunchVisibilityNow,
    ),
    [],
  );

  useEffect(() => {
    if (snapshot.visible) {
      backInFlightRef.current = false;
    }
  }, [snapshot.revision, snapshot.visible]);

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
      if (!brokersLaunchController.isVisible()) {
        return false;
      }

      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View pointerEvents="box-none" style={styles.hostRoot} testID="brokers-launch-host">
      <Animated.View
        animatedProps={animatedProps}
        pointerEvents={snapshot.visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[styles.hostLayer, animatedStyle]}
        testID="brokers-launch-animated-host"
      >
        <BrokersLaunchShell
          onBack={closeLaunch}
          backLatencyLabel="brokers.launch.back"
        />
      </Animated.View>

      {/* React fallback prevents a tab-screen flash if the UI-thread value is late. */}
      <View
        pointerEvents={snapshot.visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.hostLayer,
          snapshot.visible ? styles.reactHostVisible : styles.reactHostHidden,
        ]}
        testID="brokers-launch-react-host"
      >
        <BrokersLaunchShell
          onBack={closeLaunch}
          backLatencyLabel="brokers.launch.back"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
  },
  hostLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  reactHostHidden: {
    elevation: 0,
    opacity: 0,
    zIndex: 0,
  },
  reactHostVisible: {
    elevation: 36,
    opacity: 1,
    zIndex: 36,
  },
});
