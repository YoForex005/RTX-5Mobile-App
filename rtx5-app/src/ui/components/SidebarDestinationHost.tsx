import type { ComponentType } from 'react';
import { memo, useEffect, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { AboutScreenInner } from '../../features/settings/AboutScreen';
import { AccountsScreenInner } from '../../features/settings/AccountsScreen';
import { EconomicCalendarScreenInner } from '../../features/settings/EconomicCalendarScreen/EconomicCalendarScreen';
import { HelpScreenInner } from '../../features/settings/HelpScreen';
import { InterfaceScreenInner } from '../../features/settings/InterfaceScreen';
import { JournalScreenInner } from '../../features/settings/JournalScreen/JournalScreen';
import { UserGuideScreenInner } from '../../features/settings/UserGuideScreen';
import {
  SIDEBAR_HOST_DESTINATIONS,
  sidebarDestinationController,
  type SidebarDestinationController,
  type SidebarHostDestination,
} from './sidebarDestinationHostController';

export type SidebarDestinationViewProps = Readonly<{
  /**
   * The host keeps active-aware views mounted and changes only this flag. A
   * view must gate focus-only queries, timers, animation and large bodies with
   * it, while leaving its lightweight header mounted.
   */
  active: boolean;
}>;

export type SidebarDestinationAdapter = Readonly<{
  View: ComponentType<SidebarDestinationViewProps>;
  /** True only when View is safe to mount with active=false. */
  supportsInactiveMount: boolean;
}>;

export type SidebarDestinationRegistry = Readonly<
  Record<SidebarHostDestination, SidebarDestinationAdapter>
>;

export type ActiveAwareSidebarFeatureViewProps = Readonly<{
  isScreenFocused: boolean;
}>;

/**
 * Adapts the existing feature-view prop to the host contract. After each
 * private *ScreenInner is exported, this helper is the only adapter boilerplate
 * needed to make its lightweight shell eagerly mountable.
 */
export function createActiveAwareSidebarDestinationAdapter(
  ScreenView: ComponentType<ActiveAwareSidebarFeatureViewProps>,
): SidebarDestinationAdapter {
  const ActiveAwareView = memo(function ActiveAwareView({ active }: SidebarDestinationViewProps) {
    return <ScreenView isScreenFocused={active} />;
  });

  return Object.freeze({
    View: ActiveAwareView,
    supportsInactiveMount: true,
  });
}

/**
 * The sidebar-only destinations stay mounted as lightweight, inactive-aware
 * shells. Their real bodies are focus-gated and latch after first use, so the
 * first tap reveals a real header immediately and later taps reveal the full
 * retained screen without route construction or loading previews.
 */
export const SIDEBAR_DESTINATION_COMPATIBILITY_REGISTRY: SidebarDestinationRegistry = Object.freeze({
  journal: createActiveAwareSidebarDestinationAdapter(JournalScreenInner),
  'economic-calendar': createActiveAwareSidebarDestinationAdapter(EconomicCalendarScreenInner),
  'user-guide': createActiveAwareSidebarDestinationAdapter(UserGuideScreenInner),
  help: createActiveAwareSidebarDestinationAdapter(HelpScreenInner),
  about: createActiveAwareSidebarDestinationAdapter(AboutScreenInner),
  accounts: createActiveAwareSidebarDestinationAdapter(AccountsScreenInner),
  interface: createActiveAwareSidebarDestinationAdapter(InterfaceScreenInner),
});

export type SidebarDestinationHostProps = Readonly<{
  controller?: SidebarDestinationController;
  registry?: SidebarDestinationRegistry;
  onVisibilityChange?: (visible: boolean, destination: SidebarHostDestination | null) => void;
}>;

type SidebarDestinationLayerProps = Readonly<{
  destination: SidebarHostDestination;
  adapter: SidebarDestinationAdapter;
  active: boolean;
  /**
   * React-committed visibility from the controller's synchronous visual
   * subscription. The Reanimated flip and this plain style drive the same
   * swap through two independent engines; whichever lands first shows or
   * hides the layer (each alone was observed lagging >1s on a congested
   * fresh-boot JS loop).
   */
  visualActive: boolean;
}>;

const SidebarDestinationLayer = memo(function SidebarDestinationLayer({
  destination,
  adapter,
  active,
  visualActive,
}: SidebarDestinationLayerProps) {
  const DestinationView = adapter.View;

  return (
    <View
      style={[
        styles.destination,
        visualActive ? styles.destinationVisible : styles.destinationHidden,
      ]}
      pointerEvents={visualActive ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      testID={`sidebar-destination-${destination}`}
    >
      <DestinationView active={active} />
    </View>
  );
});

/**
 * Root-level, navigation-independent host for sidebar-only detail pages.
 *
 * Place it as a sibling immediately above the root Stack and immediately below
 * SidebarDrawer. Trade/Settings remain real bottom tabs; selecting either must
 * hide this host before the normal mounted-tab navigation runs.
 */
export const SidebarDestinationHost = memo(function SidebarDestinationHost({
  controller = sidebarDestinationController,
  registry = SIDEBAR_DESTINATION_COMPATIBILITY_REGISTRY,
  onVisibilityChange,
}: SidebarDestinationHostProps) {
  // Focus/query state rides the deliberately two-frame-deferred subscription
  // so heavy destination work never runs in the tap turn...
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  // ...while layer VISIBILITY rides the synchronous subscription and commits
  // with the tap turn itself. The previous Reanimated shared-value flip was
  // observed on-device lagging >1s behind a congested fresh-boot JS loop,
  // leaving the old page on screen after the drawer closed.
  const visualSnapshot = useSyncExternalStore(
    controller.subscribeVisual,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const activeDestination = snapshot.activeDestination;
  const visualDestination = visualSnapshot.activeDestination;

  useEffect(() => {
    onVisibilityChange?.(activeDestination !== null, activeDestination);
  }, [activeDestination, onVisibilityChange]);

  useEffect(() => {
    // The retained visual layer switches before focus subscribers are
    // notified. Read the controller directly so hardware Back is intercepted
    // during that intentional two-frame focus delay as well as after the
    // React commit.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!controller.isVisible()) {
        return false;
      }
      controller.hide();
      return true;
    });
    return () => subscription.remove();
  }, [controller]);

  if (!activeDestination && !visualDestination) {
    const hasEagerAdapter = SIDEBAR_HOST_DESTINATIONS.some(
      (destination) => registry[destination].supportsInactiveMount,
    );
    if (!hasEagerAdapter) {
      return null;
    }
  }

  return (
    <View
      style={styles.host}
      pointerEvents="box-none"
      accessibilityElementsHidden={!activeDestination}
      importantForAccessibility={activeDestination ? 'auto' : 'no-hide-descendants'}
      testID="sidebar-destination-host"
    >
      {SIDEBAR_HOST_DESTINATIONS.map((destination) => {
        const adapter = registry[destination];
        const active = activeDestination === destination;
        const visualActive = visualDestination === destination;
        if (!active && !visualActive && !adapter.supportsInactiveMount) {
          return null;
        }

        return (
          <SidebarDestinationLayer
            key={destination}
            destination={destination}
            adapter={adapter}
            active={active}
            visualActive={visualActive}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  destination: {
    ...StyleSheet.absoluteFillObject,
  },
  destinationVisible: {
    opacity: 1,
    zIndex: 1,
  },
  destinationHidden: {
    opacity: 0,
    zIndex: 0,
  },
});
