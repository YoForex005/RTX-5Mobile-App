import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  createChartTradeSheetPortalController,
  type ChartTradeSheetPortalController,
} from './chartTradeSheetPortalController';

const ChartTradeSheetPortalContext = createContext<ChartTradeSheetPortalController | null>(null);

export function ChartTradeSheetPortalProvider({ children }: PropsWithChildren) {
  const controllerRef = useRef<ChartTradeSheetPortalController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createChartTradeSheetPortalController();
  }

  return (
    <ChartTradeSheetPortalContext.Provider value={controllerRef.current}>
      {children}
    </ChartTradeSheetPortalContext.Provider>
  );
}

type ChartTradeSheetPortalProps = PropsWithChildren<{
  enabled: boolean;
  keepMounted: boolean;
  visible: boolean;
  top: number;
  bottom: number;
}>;

/** Moves one live sheet branch above tab chrome without a native Modal/window. */
export function ChartTradeSheetPortal({
  bottom,
  children,
  enabled,
  keepMounted,
  top,
  visible,
}: ChartTradeSheetPortalProps) {
  const controller = useContext(ChartTradeSheetPortalContext);
  const ownerRef = useRef<symbol | null>(null);
  const latestChildrenRef = useRef<ReactNode>(children);
  latestChildrenRef.current = children;
  if (ownerRef.current === null) {
    ownerRef.current = Symbol('chart-trade-sheet-portal-owner');
  }
  const owner = ownerRef.current;
  const renderCurrent = useCallback(() => latestChildrenRef.current, []);

  useLayoutEffect(() => {
    if (!controller || !enabled) {
      return undefined;
    }
    return controller.register(owner, renderCurrent);
  }, [controller, enabled, owner, renderCurrent]);

  useLayoutEffect(() => {
    if (!controller || !enabled) {
      return;
    }

    const presentationChanged = controller.setPresentation(owner, {
      keepMounted,
      visible,
      top,
      bottom,
    });
    if (!presentationChanged && visible) {
      controller.invalidate(owner);
    }
  }, [bottom, children, controller, enabled, keepMounted, owner, top, visible]);

  return controller && enabled ? null : <>{children}</>;
}

const SubscribedChartTradeSheetPortalHost = memo(function SubscribedChartTradeSheetPortalHost({
  controller,
}: {
  controller: ChartTradeSheetPortalController;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  if (!snapshot.keepMounted || !snapshot.renderCurrent) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={styles.host}
      testID="chart-trade-sheet-portal-host"
    >
      <View
        pointerEvents={snapshot.visible ? 'box-none' : 'none'}
        accessibilityElementsHidden={!snapshot.visible}
        importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.entry,
          {
            top: snapshot.top,
            bottom: snapshot.bottom,
            opacity: snapshot.visible ? 1 : 0,
          },
          snapshot.visible && styles.entryVisible,
        ]}
      >
        {snapshot.renderCurrent()}
      </View>
    </View>
  );
});

export function ChartTradeSheetPortalHost() {
  const controller = useContext(ChartTradeSheetPortalContext);
  return controller
    ? <SubscribedChartTradeSheetPortalHost controller={controller} />
    : null;
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    elevation: 37,
    pointerEvents: 'box-none',
    zIndex: 37,
  },
  entry: {
    position: 'absolute',
    left: 0,
    right: 0,
    elevation: 0,
    zIndex: 0,
  },
  entryVisible: {
    // Above bottom tab chrome; below OrderTicketLaunchHost (38/39).
    elevation: 37,
    zIndex: 37,
  },
});
