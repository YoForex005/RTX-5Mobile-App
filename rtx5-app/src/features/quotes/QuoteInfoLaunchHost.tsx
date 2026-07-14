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
import { QuoteInfoLaunchShell } from './QuoteInfoLaunchShell';
import {
  quoteInfoLaunchController,
  type QuoteInfoLaunchDestination,
} from './quoteInfoLaunchController';
import { safeRouterBack } from '../../utils/navigation';

type QuoteInfoLaunchHostGlobal = typeof globalThis & {
  __rtx5QuoteInfoLaunchDestination?: SharedValue<number>;
};

const hostGlobal = globalThis as QuoteInfoLaunchHostGlobal;
const quoteInfoLaunchDestination =
  hostGlobal.__rtx5QuoteInfoLaunchDestination ?? makeMutable(0);
hostGlobal.__rtx5QuoteInfoLaunchDestination = quoteInfoLaunchDestination;

const destinationToIndex = (
  destination: QuoteInfoLaunchDestination | null,
) => {
  if (destination === 'properties') return 1;
  if (destination === 'market-statistics') return 2;
  return 0;
};

function writeQuoteInfoLaunchDestinationNow(
  destination: QuoteInfoLaunchDestination | null,
) {
  const nextValue = destinationToIndex(destination);
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      quoteInfoLaunchDestination.value = value;
    })(nextValue);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[QuoteInfoLaunch] sync UI write unavailable, using async fallback:', error);
    }
    quoteInfoLaunchDestination.value = nextValue;
  }
}

/** Keeps Properties and Market Statistics previews ready so a tap can show one immediately. */
export function QuoteInfoLaunchHost() {
  const router = useRouter();
  const backInFlightRef = useRef(false);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useSyncExternalStore(
    quoteInfoLaunchController.subscribe,
    quoteInfoLaunchController.getSnapshot,
    quoteInfoLaunchController.getSnapshot,
  );
  const hostAnimatedStyle = useAnimatedStyle(() => {
    const visible = quoteInfoLaunchDestination.value !== 0;
    return {
      elevation: visible ? 32 : 0,
      opacity: visible ? 1 : 0,
      zIndex: visible ? 32 : 0,
    };
  });
  const hostAnimatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: quoteInfoLaunchDestination.value !== 0 ? 'auto' : 'none',
  }));
  const propertiesAnimatedStyle = useAnimatedStyle(() => ({
    opacity: quoteInfoLaunchDestination.value === 1 ? 1 : 0,
    zIndex: quoteInfoLaunchDestination.value === 1 ? 1 : 0,
  }));
  const propertiesAnimatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: quoteInfoLaunchDestination.value === 1 ? 'auto' : 'none',
  }));
  const statisticsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: quoteInfoLaunchDestination.value === 2 ? 1 : 0,
    zIndex: quoteInfoLaunchDestination.value === 2 ? 1 : 0,
  }));
  const statisticsAnimatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: quoteInfoLaunchDestination.value === 2 ? 'auto' : 'none',
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

    // Back may be tapped before the real route is on the stack.
    // Try briefly and pop it as soon as it exists.
    tryPop();
  }, [router]);

  const closeLaunch = useCallback(() => {
    const currentSnapshot = quoteInfoLaunchController.getSnapshot();
    if (!currentSnapshot.visible || backInFlightRef.current) {
      return;
    }

    backInFlightRef.current = true;
    const navigationStarted = currentSnapshot.navigationStarted;

    // Hide the preview immediately. If the real route already started,
    // remove it too as soon as navigation is ready.
    quoteInfoLaunchController.hide(currentSnapshot.revision);

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
    () => quoteInfoLaunchController.registerVisualApplier(
      writeQuoteInfoLaunchDestinationNow,
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
      if (!quoteInfoLaunchController.isVisible()) {
        return false;
      }
      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View
      pointerEvents="box-none"
      style={styles.hostRoot}
      testID="quote-info-launch-host"
    >
      <Animated.View
        animatedProps={hostAnimatedProps}
        pointerEvents={snapshot.visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[styles.hostLayer, hostAnimatedStyle]}
        testID="quote-info-launch-animated-host"
      >
        <Animated.View
          animatedProps={propertiesAnimatedProps}
          pointerEvents={
            snapshot.visible && snapshot.destination === 'properties'
              ? 'auto'
              : 'none'
          }
          style={[styles.layer, propertiesAnimatedStyle]}
        >
          <QuoteInfoLaunchShell
            destination="properties"
            symbol={snapshot.symbol}
            onBack={closeLaunch}
            backLatencyLabel="quoteInfo.launch.properties.back"
          />
        </Animated.View>

        <Animated.View
          animatedProps={statisticsAnimatedProps}
          pointerEvents={
            snapshot.visible && snapshot.destination === 'market-statistics'
              ? 'auto'
              : 'none'
          }
          style={[styles.layer, statisticsAnimatedStyle]}
        >
          <QuoteInfoLaunchShell
            destination="market-statistics"
            symbol={snapshot.symbol}
            onBack={closeLaunch}
            backLatencyLabel="quoteInfo.launch.marketStatistics.back"
          />
        </Animated.View>
      </Animated.View>

      {/* Keep this fallback outside the animated layer so it can still show if the UI-thread value arrives late. */}
      <View
        pointerEvents={snapshot.visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.hostLayer,
          snapshot.visible ? styles.reactHostVisible : styles.reactHostHidden,
        ]}
        testID="quote-info-launch-react-host"
      >
        <View
          pointerEvents={
            snapshot.visible && snapshot.destination === 'properties'
              ? 'auto'
              : 'none'
          }
          accessibilityElementsHidden={
            !snapshot.visible || snapshot.destination !== 'properties'
          }
          importantForAccessibility={
            snapshot.visible && snapshot.destination === 'properties'
              ? 'auto'
              : 'no-hide-descendants'
          }
          style={[
            styles.layer,
            snapshot.visible && snapshot.destination === 'properties'
              ? styles.reactLayerVisible
              : styles.reactLayerHidden,
          ]}
          testID="quote-info-launch-react-properties"
        >
          <QuoteInfoLaunchShell
            destination="properties"
            symbol={snapshot.symbol}
            onBack={closeLaunch}
            backLatencyLabel="quoteInfo.launch.properties.back"
          />
        </View>

        <View
          pointerEvents={
            snapshot.visible && snapshot.destination === 'market-statistics'
              ? 'auto'
              : 'none'
          }
          accessibilityElementsHidden={
            !snapshot.visible || snapshot.destination !== 'market-statistics'
          }
          importantForAccessibility={
            snapshot.visible && snapshot.destination === 'market-statistics'
              ? 'auto'
              : 'no-hide-descendants'
          }
          style={[
            styles.layer,
            snapshot.visible && snapshot.destination === 'market-statistics'
              ? styles.reactLayerVisible
              : styles.reactLayerHidden,
          ]}
          testID="quote-info-launch-react-market-statistics"
        >
          <QuoteInfoLaunchShell
            destination="market-statistics"
            symbol={snapshot.symbol}
            onBack={closeLaunch}
            backLatencyLabel="quoteInfo.launch.marketStatistics.back"
          />
        </View>
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
    elevation: 33,
    opacity: 1,
    zIndex: 33,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  reactLayerHidden: {
    opacity: 0,
    zIndex: 0,
  },
  reactLayerVisible: {
    opacity: 1,
    zIndex: 2,
  },
});
