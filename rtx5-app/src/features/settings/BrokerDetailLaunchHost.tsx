import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';
import { BrokerDetailLaunchShell } from './BrokerDetailLaunchShell';
import { brokerDetailLaunchController } from './brokerDetailLaunchController';
import { showBrokersLaunch } from './brokersLaunchController';
import {
  registerLaunchController,
  scheduleRegisterLaunchNavigation,
  showRegisterLaunch,
} from './registerLaunchController';

const BROKER_DETAIL_LAUNCH_HIDDEN_STYLE = {
  elevation: 0,
  opacity: 0,
  zIndex: 0,
} as const;
const BROKER_DETAIL_LAUNCH_VISIBLE_STYLE = {
  elevation: 42,
  opacity: 1,
  zIndex: 42,
} as const;

function writeBrokerDetailLaunchVisibilityNow(layer: View | null, visible: boolean) {
  layer?.setNativeProps({
    accessibilityElementsHidden: !visible,
    importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
    pointerEvents: visible ? 'auto' : 'none',
    style: visible ? BROKER_DETAIL_LAUNCH_VISIBLE_STYLE : BROKER_DETAIL_LAUNCH_HIDDEN_STYLE,
  });
}

/** Root-level host: it can cover the Brokers route while broker detail is built. */
export function BrokerDetailLaunchHost() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const backInFlightRef = useRef(false);
  const pendingBackRevisionRef = useRef<number | null>(null);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostLayerRef = useRef<View>(null);
  const selection = useSyncExternalStore(
    brokerDetailLaunchController.subscribe,
    () => brokerDetailLaunchController.getSnapshot().selection,
    () => brokerDetailLaunchController.getSnapshot().selection,
  );
  const renderVisible = brokerDetailLaunchController.isVisible();
  pathnameRef.current = pathname;

  const armBackGuard = useCallback((delayMs: number) => {
    if (backGuardTimerRef.current) clearTimeout(backGuardTimerRef.current);
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, delayMs);
  }, []);

  const finishCommittedBack = useCallback((revision: number) => {
    const current = brokerDetailLaunchController.getSnapshot();
    if (!current.visible || current.revision !== revision) {
      pendingBackRevisionRef.current = null;
      backInFlightRef.current = false;
      return;
    }

    pendingBackRevisionRef.current = null;
    showBrokersLaunch();
    brokerDetailLaunchController.hide(revision);
    armBackGuard(700);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/settings/brokers');
    });
  }, [armBackGuard, router]);

  useEffect(() => {
    if (pathname !== '/settings/broker-detail') return;
    const pendingRevision = pendingBackRevisionRef.current;
    if (pendingRevision === null) return;
    finishCommittedBack(pendingRevision);
  }, [finishCommittedBack, pathname]);

  const closeLaunch = useCallback(() => {
    const current = brokerDetailLaunchController.getSnapshot();
    if (!current.visible || backInFlightRef.current) return;

    backInFlightRef.current = true;
    const navigationStarted = current.navigationStarted;

    if (!navigationStarted) {
      showBrokersLaunch();
      brokerDetailLaunchController.hide(current.revision);
      armBackGuard(100);
      return;
    }

    if (pathnameRef.current !== '/settings/broker-detail') {
      pendingBackRevisionRef.current = current.revision;
      return;
    }

    finishCommittedBack(current.revision);
  }, [armBackGuard, finishCommittedBack]);

  const openDemoAccount = useCallback(() => {
    const current = brokerDetailLaunchController.getSnapshot();
    if (!current.visible || registerLaunchController.isVisible()) return;

    // A complete Demo Account first frame is already mounted at the root.
    // Reveal it synchronously, before either native route is constructed.
    const registerRevision = showRegisterLaunch(current.selection);

    // A very fast Demo tap can arrive before the scheduled Broker Detail push.
    // Commit that missing stack entry now; startNavigation is single-flight, so
    // the older scheduled callback becomes a harmless no-op.
    if (!current.navigationStarted) {
      if (!brokerDetailLaunchController.startNavigation(current.revision)) {
        registerLaunchController.hide(registerRevision);
        return;
      }
      router.push({
        pathname: '/settings/broker-detail',
        params: current.selection,
      });
    }

    scheduleRegisterLaunchNavigation(registerRevision, () => {
      router.push({
        pathname: '/register-entry',
        params: {
          origin: 'broker-detail',
          registerLaunchRevision: String(registerRevision),
        },
      });
    });
  }, [router]);

  useEffect(
    () => brokerDetailLaunchController.registerVisualApplier(
      (visible) => {
        writeBrokerDetailLaunchVisibilityNow(hostLayerRef.current, visible);
        if (visible && !registerLaunchController.isVisible()) {
          pendingBackRevisionRef.current = null;
          backInFlightRef.current = false;
        }
      },
    ),
    [],
  );

  useEffect(() => () => {
    pendingBackRevisionRef.current = null;
    if (backGuardTimerRef.current) clearTimeout(backGuardTimerRef.current);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!brokerDetailLaunchController.isVisible()) return false;
      if (backInFlightRef.current) return true;
      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View pointerEvents="box-none" style={styles.hostRoot} testID="broker-detail-launch-host">
      <View
        ref={hostLayerRef}
        pointerEvents={renderVisible ? 'auto' : 'none'}
        accessibilityElementsHidden={!renderVisible}
        importantForAccessibility={renderVisible ? 'auto' : 'no-hide-descendants'}
        collapsable={false}
        style={[
          styles.hostLayer,
          renderVisible ? styles.hostLayerVisible : styles.hostLayerHidden,
        ]}
        // Keep the established diagnostic id for ADB/UI automation.
        testID="broker-detail-launch-animated-host"
      >
        <BrokerDetailLaunchShell
          selection={selection}
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
  hostLayerHidden: BROKER_DETAIL_LAUNCH_HIDDEN_STYLE,
  hostLayerVisible: BROKER_DETAIL_LAUNCH_VISIBLE_STYLE,
});
