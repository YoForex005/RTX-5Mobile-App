import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, View, type ViewProps } from 'react-native';
import Animated, {
  executeOnUIRuntimeSync,
  makeMutable,
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { safeRouterBack, scheduleBackNavigationAfterVisualFrame } from '../../utils/navigation';
import { showBrokerDetailLaunch } from './brokerDetailLaunchController';
import { RegisterHandoffPreview } from './RegisterHandoffPreview';
import {
  registerLaunchController,
  requestRegisterLaunchBack,
} from './registerLaunchController';

const REGISTER_LAUNCH_HIDDEN_STYLE = {
  elevation: 0,
  opacity: 0,
  zIndex: 0,
} as const;
const REGISTER_LAUNCH_VISIBLE_STYLE = {
  elevation: 50,
  opacity: 1,
  zIndex: 50,
} as const;

type RegisterLaunchHostGlobal = typeof globalThis & {
  __rtx5RegisterLaunchVisibility?: SharedValue<number>;
};

const registerLaunchHostGlobal = globalThis as RegisterLaunchHostGlobal;
const registerLaunchVisibility =
  registerLaunchHostGlobal.__rtx5RegisterLaunchVisibility ?? makeMutable(0);
registerLaunchHostGlobal.__rtx5RegisterLaunchVisibility = registerLaunchVisibility;

function writeRegisterLaunchVisibilityNow(visible: boolean) {
  const nextValue = visible ? 1 : 0;
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      registerLaunchVisibility.value = value;
    })(nextValue);
  } catch {
    registerLaunchVisibility.value = nextValue;
  }
}

/** Keeps the Demo Account first frame mounted above every broker-flow route. */
export function RegisterLaunchHost() {
  const router = useRouter();
  const backInFlightRef = useRef(false);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderVisible = registerLaunchController.isVisible();
  const hostAnimatedStyle = useAnimatedStyle(() => {
    const visible = registerLaunchVisibility.value === 1;
    return {
      elevation: visible ? 50 : 0,
      opacity: visible ? 1 : 0,
      zIndex: visible ? 50 : 0,
    };
  });
  const hostAnimatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: registerLaunchVisibility.value === 1 ? 'auto' : 'none',
  }));

  const popCommittedRegisterRoute = useCallback((
    revision: number,
    selection: NonNullable<ReturnType<typeof registerLaunchController.getSnapshot>['selection']>,
  ) => {
    showBrokerDetailLaunch(selection);
    registerLaunchController.hide(revision);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, {
        pathname: '/settings/broker-detail',
        params: selection,
      });
      backGuardTimerRef.current = setTimeout(() => {
        backInFlightRef.current = false;
        backGuardTimerRef.current = null;
      }, 700);
    });
  }, [router]);

  const closeLaunch = useCallback(() => {
    const current = registerLaunchController.getSnapshot();
    if (!current.visible || backInFlightRef.current) return;

    backInFlightRef.current = true;
    const backResult = requestRegisterLaunchBack(current.revision);

    if (backResult === 'cancel') {
      // The scheduled push has not begun, so hiding this top layer reveals the
      // already-correct Broker Detail layer without touching the native stack.
      registerLaunchController.hide(current.revision);
      backGuardTimerRef.current = setTimeout(() => {
        backInFlightRef.current = false;
        backGuardTimerRef.current = null;
      }, 100);
      return;
    }

    if (backResult === 'pop' && current.selection) {
      popCommittedRegisterRoute(current.revision, current.selection);
      return;
    }

    if (backResult === 'stale') {
      backInFlightRef.current = false;
    }
    // 'wait' keeps the Demo cover visible. Register Entry owns the one pop as
    // soon as it marks this exact revision mounted; 'handled' is a duplicate.
  }, [popCommittedRegisterRoute]);

  useEffect(
    () => registerLaunchController.registerVisualApplier((visible) => {
      writeRegisterLaunchVisibilityNow(visible);
      if (visible) {
        backInFlightRef.current = false;
      }
    }),
    [],
  );

  useEffect(() => () => {
    if (backGuardTimerRef.current) clearTimeout(backGuardTimerRef.current);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!registerLaunchController.isVisible()) return false;
      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View pointerEvents="box-none" style={styles.hostRoot} testID="register-launch-host">
      <Animated.View
        animatedProps={hostAnimatedProps}
        pointerEvents={renderVisible ? 'auto' : 'none'}
        accessibilityElementsHidden={!renderVisible}
        importantForAccessibility={renderVisible ? 'auto' : 'no-hide-descendants'}
        collapsable={false}
        style={[
          styles.hostLayer,
          renderVisible ? styles.hostLayerVisible : styles.hostLayerHidden,
          hostAnimatedStyle,
        ]}
        testID="register-launch-animated-host"
      >
        <RegisterHandoffPreview
          onBack={closeLaunch}
          backLatencyLabel="register.launch.back"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hostRoot: { ...StyleSheet.absoluteFillObject },
  hostLayer: { ...StyleSheet.absoluteFillObject },
  hostLayerHidden: REGISTER_LAUNCH_HIDDEN_STYLE,
  hostLayerVisible: REGISTER_LAUNCH_VISIBLE_STYLE,
});
