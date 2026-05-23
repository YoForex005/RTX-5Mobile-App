import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../state/uiState';
import { useTheme } from '../theme/useTheme';

const SIDEBAR_ROUTE_TRANSITION_MAX_MS = 2500;

function normalizeSidebarTransitionPath(path: string) {
  return path.replace(/\/\([^)]*\)/g, '') || '/';
}

export function SidebarRouteTransitionOverlay() {
  const transition = useUIState((state) => state.sidebarRouteTransition);
  const clearSidebarRouteTransition = useUIState((state) => state.clearSidebarRouteTransition);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const T = useTheme();

  useEffect(() => {
    if (!transition) {
      return;
    }

    const currentPath = normalizeSidebarTransitionPath(pathname);
    const targetPath = normalizeSidebarTransitionPath(transition.route);
    if (currentPath === targetPath) {
      clearSidebarRouteTransition();
    }
  }, [clearSidebarRouteTransition, pathname, transition]);

  useEffect(() => {
    if (!transition) {
      return;
    }

    const timer = setTimeout(clearSidebarRouteTransition, SIDEBAR_ROUTE_TRANSITION_MAX_MS);
    return () => clearTimeout(timer);
  }, [clearSidebarRouteTransition, transition]);

  if (!transition) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          backgroundColor: T.bg,
          paddingTop: Math.max(insets.top, 0) + 42,
        },
      ]}
    >
      <Text style={[styles.title, { color: T.text }]} numberOfLines={1}>
        {transition.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    elevation: 9998,
    alignItems: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
