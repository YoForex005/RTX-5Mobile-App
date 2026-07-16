import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { CloseByScreen } from './CloseByScreen';
import { ClosePositionScreen } from './ClosePositionScreen';
import { ModifyPositionScreen } from './ModifyPositionScreen';
import {
  hideTradePositionActionHost,
  tradePositionActionHostController,
  type TradePositionActionDestination,
} from './tradePositionActionHostController';

/**
 * Chart-options-class retained host for Close / Close By / Modify.
 * First open latches that destination; later taps only flip visibility.
 */
export const TradePositionActionHost = memo(function TradePositionActionHost() {
  const layerRef = useRef<View | null>(null);
  const snapshot = useSyncExternalStore(
    tradePositionActionHostController.subscribe,
    tradePositionActionHostController.getSnapshot,
    tradePositionActionHostController.getSnapshot,
  );
  const [latched, setLatched] = useState<Record<TradePositionActionDestination, boolean>>({
    close: false,
    'close-by': false,
    modify: false,
  });

  // Latch during render (not useEffect) so the first open paints content in the
  // same commit as the host becoming visible — same class as Chart settings.
  if (snapshot.visible && snapshot.destination && !latched[snapshot.destination]) {
    setLatched({ ...latched, [snapshot.destination]: true });
  }

  const writeVisibilityNow = useCallback((visible: boolean) => {
    layerRef.current?.setNativeProps({
      accessibilityElementsHidden: !visible,
      importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
      pointerEvents: visible ? 'auto' : 'none',
      style: visible ? styles.layerVisible : styles.layerHidden,
    });
  }, []);

  useEffect(
    () => tradePositionActionHostController.registerVisualApplier(writeVisibilityNow),
    [writeVisibilityNow],
  );

  const closeHost = useCallback(() => {
    hideTradePositionActionHost();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!tradePositionActionHostController.isVisible()) {
        return false;
      }
      closeHost();
      return true;
    });
    return () => subscription.remove();
  }, [closeHost]);

  const active = snapshot.visible;
  const destination = snapshot.destination;
  const positionId = snapshot.positionId;

  return (
    <View
      pointerEvents="box-none"
      style={styles.hostRoot}
      testID="trade-position-action-host"
    >
      <View
        ref={layerRef}
        collapsable={false}
        pointerEvents={active ? 'auto' : 'none'}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, active ? styles.layerVisible : styles.layerHidden]}
        testID="trade-position-action-host-layer"
      >
        {latched.close ? (
          <View
            pointerEvents={active && destination === 'close' ? 'auto' : 'none'}
            style={destination === 'close' && active ? styles.panelVisible : styles.panelHidden}
          >
            <ClosePositionScreen
              hosted
              hostedActive={active && destination === 'close'}
              hostedPositionId={destination === 'close' ? positionId : null}
              onHostedBack={closeHost}
            />
          </View>
        ) : null}

        {latched['close-by'] ? (
          <View
            pointerEvents={active && destination === 'close-by' ? 'auto' : 'none'}
            style={destination === 'close-by' && active ? styles.panelVisible : styles.panelHidden}
          >
            <CloseByScreen
              hosted
              hostedActive={active && destination === 'close-by'}
              hostedPositionId={destination === 'close-by' ? positionId : null}
              onHostedBack={closeHost}
            />
          </View>
        ) : null}

        {latched.modify ? (
          <View
            pointerEvents={active && destination === 'modify' ? 'auto' : 'none'}
            style={destination === 'modify' && active ? styles.panelVisible : styles.panelHidden}
          >
            <ModifyPositionScreen
              hosted
              hostedActive={active && destination === 'modify'}
              hostedPositionId={destination === 'modify' ? positionId : null}
              onHostedBack={closeHost}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    // Above Trade tab chrome; below ActionSheet (9999).
    elevation: 44,
    zIndex: 44,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  layerHidden: {
    elevation: 0,
    opacity: 0,
    zIndex: 0,
  },
  layerVisible: {
    elevation: 45,
    opacity: 1,
    zIndex: 45,
  },
  panelHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    zIndex: 0,
  },
  panelVisible: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
    zIndex: 1,
  },
});
