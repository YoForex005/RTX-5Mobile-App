import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { ChartOpenOrderModeScreen } from './ChartOpenOrderModeScreen';
import { ChartPriceSourceScreen } from './ChartPriceSourceScreen';
import { PriceAlertsScreen } from './PriceAlertsScreen';
import {
  chartConfigDestinationController,
  type ChartConfigDestination,
} from './chartConfigDestinationController';
import { ChartPropertiesScreen } from '../settings/ChartPropertiesScreen';

const DESTINATION_ORDER: ChartConfigDestination[] = [
  'schema-colors',
  'price-source',
  'open-order-mode',
  'alerts',
];

/**
 * Sidebar-style retained host for Chart Preferences configuration rows.
 * Native destination layers stay retained; only the active interactive screen
 * is mounted.
 */
export const ChartConfigDestinationHost = memo(function ChartConfigDestinationHost() {
  const layerRefs = useRef<Partial<Record<ChartConfigDestination, View | null>>>({});
  const snapshot = useSyncExternalStore(
    chartConfigDestinationController.subscribe,
    chartConfigDestinationController.getSnapshot,
    chartConfigDestinationController.getSnapshot,
  );

  const writeVisibilityNow = useCallback((destination: ChartConfigDestination | null) => {
    for (const key of DESTINATION_ORDER) {
      const layer = layerRefs.current[key];
      const visible = destination === key;
      layer?.setNativeProps({
        accessibilityElementsHidden: !visible,
        importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
        pointerEvents: visible ? 'auto' : 'none',
        style: visible ? styles.layerVisible : styles.layerHidden,
      });
    }
  }, []);

  useEffect(
    () => chartConfigDestinationController.registerVisualApplier(writeVisibilityNow),
    [writeVisibilityNow],
  );

  const closeHost = useCallback(() => {
    chartConfigDestinationController.hide();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!chartConfigDestinationController.isVisible()) {
        return false;
      }
      closeHost();
      return true;
    });
    return () => subscription.remove();
  }, [closeHost]);

  return (
    <View
      pointerEvents="box-none"
      style={styles.hostRoot}
      testID="chart-config-destination-host"
    >
      {DESTINATION_ORDER.map((destination) => {
        const active = snapshot.visible && snapshot.destination === destination;
        return (
          <View
            key={destination}
            ref={(layer) => {
              layerRefs.current[destination] = layer;
            }}
            collapsable={false}
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            style={[styles.layer, active ? styles.layerVisible : styles.layerHidden]}
            testID={`chart-config-destination-${destination}`}
          >
            {active && destination === 'schema-colors' ? (
              <ChartPropertiesScreen
                hosted
                hostedActive
                onHostedBack={closeHost}
              />
            ) : null}
            {active && destination === 'price-source' ? (
              <ChartPriceSourceScreen
                hosted
                hostedActive
                onHostedBack={closeHost}
              />
            ) : null}
            {active && destination === 'open-order-mode' ? (
              <ChartOpenOrderModeScreen
                hosted
                hostedActive
                onHostedBack={closeHost}
              />
            ) : null}
            {active && destination === 'alerts' ? (
              <PriceAlertsScreen
                hosted
                hostedActive
                onHostedBack={closeHost}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    // Above tabs / chart preferences route, below global ActionSheet (9999).
    elevation: 40,
    zIndex: 40,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    // Opaque so Chart Preferences never shows through during the open.
    backgroundColor: '#0B1220',
  },
  layerHidden: {
    elevation: 0,
    opacity: 0,
    zIndex: 0,
  },
  layerVisible: {
    elevation: 41,
    opacity: 1,
    zIndex: 41,
  },
});
