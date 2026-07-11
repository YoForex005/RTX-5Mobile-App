import {
  BottomTabBar,
  BottomTabBarHeightCallbackContext,
  BottomTabBarHeightContext,
  type BottomTabBarButtonProps,
  type BottomTabBarProps,
  type BottomTabHeaderProps,
  type BottomTabNavigationEventMap,
  type BottomTabNavigationOptions,
  type BottomTabNavigationProp,
  type BottomTabNavigatorProps,
} from '@react-navigation/bottom-tabs';
import {
  getHeaderTitle,
  Header,
  SafeAreaProviderCompat,
  Screen,
} from '@react-navigation/elements';
import {
  createNavigatorFactory,
  StackActions,
  TabRouter,
  type NavigatorTypeBagBase,
  type ParamListBase,
  type StaticConfig,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
  type TypedNavigator,
  useNavigationBuilder,
} from '@react-navigation/native';
import {
  Link,
  withLayoutContext,
  type Href,
  type LinkProps,
} from 'expo-router';
import {
  forwardRef,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  SafeAreaInsetsContext,
  type EdgeInsets,
} from 'react-native-safe-area-context';
import {
  confirmFastTabVisual,
  fastTabVisualController,
  fastTabVisualIndex,
  getFastTabRouteIndex,
  setFastTabActualRoute,
  useFastTabVisualSnapshot,
  type FastTabRouteName,
} from './fastTabVisualController';

type DescriptorMap = BottomTabBarProps['descriptors'];
type TabNavigation = BottomTabBarProps['navigation'];

type FastTabViewProps = Pick<
  BottomTabNavigatorProps,
  'detachInactiveScreens' | 'safeAreaInsets' | 'tabBar'
> & {
  descriptors: DescriptorMap;
  navigation: TabNavigation;
  state: TabNavigationState<ParamListBase>;
};

type SceneLayerProps = {
  descriptor: DescriptorMap[string];
  navigationFocused: boolean;
  /**
   * React-committed visibility. The Reanimated shared-value flip and this
   * plain-style flag drive the same swap through two independent engines;
   * whichever lands first shows the scene. On-device, each engine was
   * observed lagging >1s behind a congested fresh-boot JS loop while the
   * other stayed instant — neither alone is reliable enough.
   */
  visualFocused: boolean;
  routeName: FastTabRouteName;
  layout: { width: number; height: number };
  tabBarHeight: number;
  tabBarPosition: BottomTabNavigationOptions['tabBarPosition'];
};

type SceneContentProps = Omit<SceneLayerProps, 'routeName' | 'visualFocused'>;

const renderDefaultTabBar = (props: BottomTabBarProps) => (
  <BottomTabBar {...props} />
);

const renderDefaultHeader = ({
  layout,
  options,
  route,
}: BottomTabHeaderProps) => (
  <Header
    {...options}
    layout={layout}
    title={getHeaderTitle(options, route.name)}
  />
);

/**
 * An inactive scene ignores descriptor churn caused solely by another tab
 * becoming focused. Route identity still participates in the comparison so
 * nested navigation and parameter updates cannot become stale.
 */
const SceneContent = memo(function SceneContent({
  descriptor,
  navigationFocused,
  layout,
  tabBarHeight,
  tabBarPosition,
}: SceneContentProps) {
  const {
    header = renderDefaultHeader,
    headerShown,
    headerStatusBarHeight,
    headerTransparent,
    sceneStyle,
  } = descriptor.options;

  return (
    <View style={[styles.sceneLayer, sceneStyle as StyleProp<ViewStyle>]}>
      <BottomTabBarHeightContext.Provider
        value={tabBarPosition === 'bottom' ? tabBarHeight : 0}
      >
        <Screen
          focused={navigationFocused}
          route={descriptor.route}
          navigation={descriptor.navigation}
          headerShown={headerShown}
          headerStatusBarHeight={headerStatusBarHeight}
          headerTransparent={headerTransparent}
          header={header({
            layout,
            route: descriptor.route,
            navigation:
              descriptor.navigation as BottomTabNavigationProp<ParamListBase>,
            options: descriptor.options,
          })}
        >
          {descriptor.render()}
        </Screen>
      </BottomTabBarHeightContext.Provider>
    </View>
  );
});

const SceneLayer = memo(function SceneLayer({
  descriptor,
  navigationFocused,
  visualFocused,
  routeName,
  layout,
  tabBarHeight,
  tabBarPosition,
}: SceneLayerProps) {
  const routeIndex = getFastTabRouteIndex(routeName);
  const animatedStyle = useAnimatedStyle(() => {
    const visible = fastTabVisualIndex.value === routeIndex;
    return {
      opacity: visible ? 1 : 0,
      zIndex: visible ? 1 : 0,
    };
  }, [routeIndex]);
  const animatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: fastTabVisualIndex.value === routeIndex ? 'auto' : 'none',
  }), [routeIndex]);

  useEffect(() => {
    const snapshot = fastTabVisualController.getSnapshot();
    if (navigationFocused && snapshot.routeName === routeName) {
      confirmFastTabVisual(snapshot.revision);
    }
  }, [navigationFocused, routeName]);

  return (
    <Animated.View
      animatedProps={animatedProps}
      accessibilityElementsHidden={!navigationFocused}
      importantForAccessibility={navigationFocused ? 'auto' : 'no-hide-descendants'}
      // The plain visualFocused style sits AFTER animatedStyle so the
      // React-committed swap wins immediately (zIndex 2 beats the stale
      // layer's animated zIndex 1) even while the shared-value flush is
      // still queued behind a busy JS loop. Both engines converge on the
      // same final state.
      style={[styles.sceneLayer, animatedStyle, visualFocused && styles.sceneLayerVisualFocused]}
      pointerEvents={visualFocused ? 'auto' : 'none'}
    >
      <SceneContent
        descriptor={descriptor}
        navigationFocused={navigationFocused}
        layout={layout}
        tabBarHeight={tabBarHeight}
        tabBarPosition={tabBarPosition}
      />
    </Animated.View>
  );
}, (previous, next) => {
  if (
    previous.navigationFocused !== next.navigationFocused
    || previous.visualFocused !== next.visualFocused
    || previous.routeName !== next.routeName
  ) {
    return false;
  }

  return (
    previous.descriptor.route === next.descriptor.route &&
    previous.descriptor.navigation === next.descriptor.navigation &&
    previous.layout.width === next.layout.width &&
    previous.layout.height === next.layout.height &&
    previous.tabBarHeight === next.tabBarHeight &&
    previous.tabBarPosition === next.tabBarPosition
  );
});

function resolveInsets(
  configuredInsets: BottomTabNavigatorProps['safeAreaInsets'],
  inheritedInsets: EdgeInsets | null,
): EdgeInsets {
  return {
    top: configuredInsets?.top ?? inheritedInsets?.top ?? 0,
    right: configuredInsets?.right ?? inheritedInsets?.right ?? 0,
    bottom: configuredInsets?.bottom ?? inheritedInsets?.bottom ?? 0,
    left: configuredInsets?.left ?? inheritedInsets?.left ?? 0,
  };
}

function resolveExplicitTabBarHeight(
  descriptors: DescriptorMap,
  focusedRouteKey: string,
): number {
  const flattenedStyle = StyleSheet.flatten(
    descriptors[focusedRouteKey]?.options.tabBarStyle,
  ) as { height?: unknown } | undefined;

  return typeof flattenedStyle?.height === 'number' ? flattenedStyle.height : 0;
}

type FastTabBarHostProps = {
  state: TabNavigationState<ParamListBase>;
  descriptors: DescriptorMap;
  navigation: TabNavigation;
  safeAreaInsets: BottomTabNavigatorProps['safeAreaInsets'];
  tabBar: NonNullable<FastTabViewProps['tabBar']>;
  setTabBarHeight: (height: number) => void;
};

const FastTabBarHost = memo(function FastTabBarHost({
  state,
  descriptors,
  navigation,
  safeAreaInsets,
  tabBar,
  setTabBarHeight,
}: FastTabBarHostProps) {
  const visualSnapshot = useFastTabVisualSnapshot();
  const visualRouteIndex = visualSnapshot.routeName === null
    ? -1
    : state.routes.findIndex((route) => route.name === visualSnapshot.routeName);
  const visibleState = visualRouteIndex >= 0 && visualRouteIndex !== state.index
    ? { ...state, index: visualRouteIndex }
    : state;

  return (
    <SafeAreaInsetsContext.Consumer>
      {(inheritedInsets) => (
        <BottomTabBarHeightCallbackContext.Provider value={setTabBarHeight}>
          {tabBar({
            state: visibleState,
            descriptors,
            navigation,
            insets: resolveInsets(safeAreaInsets, inheritedInsets),
          })}
        </BottomTabBarHeightCallbackContext.Provider>
      )}
    </SafeAreaInsetsContext.Consumer>
  );
});

/**
 * A plain-View tab scene host. It deliberately does not use BottomTabView or
 * react-native-screens, so a focus change is an opacity/pointer-state update
 * instead of a native screen detach/attach or freeze/thaw cycle.
 * `detachInactiveScreens` remains accepted for drop-in API compatibility but
 * is intentionally ignored because retaining loaded scenes is this view's
 * performance and state-preservation contract.
 */
export function FastTabView({
  state,
  navigation,
  descriptors,
  safeAreaInsets,
  tabBar = renderDefaultTabBar,
}: FastTabViewProps) {
  const focusedRoute = state.routes[state.index];
  const focusedRouteKey = focusedRoute.key;
  // Pending optimistic route from a tab/sidebar tap. While set, it decides
  // which scene layer is visible through plain React styles, independently of
  // the Reanimated shared-value flip (see SceneLayerProps.visualFocused).
  const visualSnapshot = useFastTabVisualSnapshot();
  const pendingVisualRouteName = visualSnapshot.routeName;
  const previousFocusedRouteKeyRef = useRef(focusedRouteKey);
  const loadedRouteKeysRef = useRef(new Set<string>([focusedRouteKey]));
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => ({ width, height }), [height, width]);
  const [tabBarHeight, setTabBarHeight] = useState(() =>
    resolveExplicitTabBarHeight(descriptors, focusedRouteKey),
  );

  useLayoutEffect(() => {
    setFastTabActualRoute(focusedRoute.name);
  }, [focusedRoute.name]);

  // The current route and explicitly preloaded routes enter the permanent
  // mounted-scene cache before this render is committed.
  loadedRouteKeysRef.current.add(focusedRouteKey);
  for (const routeKey of state.preloadedRouteKeys) {
    loadedRouteKeysRef.current.add(routeKey);
  }
  for (const route of state.routes) {
    if (descriptors[route.key].options.lazy === false) {
      loadedRouteKeysRef.current.add(route.key);
    }
  }

  useEffect(() => {
    const previousRouteKey = previousFocusedRouteKeyRef.current;

    if (previousRouteKey !== focusedRouteKey) {
      navigation.emit({ type: 'transitionStart', target: focusedRouteKey });

      if (descriptors[previousRouteKey]?.options.popToTopOnBlur) {
        const previousRoute = state.routes.find(
          (route) => route.key === previousRouteKey,
        );

        if (previousRoute?.state?.type === 'stack' && previousRoute.state.key) {
          navigation.dispatch({
            ...StackActions.popToTop(),
            target: previousRoute.state.key,
          });
        }
      }

      navigation.emit({ type: 'transitionEnd', target: focusedRouteKey });
      previousFocusedRouteKeyRef.current = focusedRouteKey;
    }
  }, [descriptors, focusedRouteKey, navigation, state.routes]);

  const focusedOptions = descriptors[focusedRouteKey].options;
  const { tabBarPosition = 'bottom' } = focusedOptions;

  const tabBarElement = (
    <FastTabBarHost
      state={state}
      descriptors={descriptors}
      navigation={navigation}
      safeAreaInsets={safeAreaInsets}
      tabBar={tabBar}
      setTabBarHeight={setTabBarHeight}
    />
  );

  return (
    <SafeAreaProviderCompat
      style={[
        styles.container,
        (tabBarPosition === 'left' || tabBarPosition === 'right') &&
          styles.horizontalContainer,
      ]}
    >
      {(tabBarPosition === 'top' || tabBarPosition === 'left') &&
        tabBarElement}

      <View style={styles.scenes}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const navigationFocused = index === state.index;
          const lazy = descriptor.options.lazy ?? true;
          const loaded = loadedRouteKeysRef.current.has(route.key);

          if (lazy && !loaded && !navigationFocused) {
            return null;
          }

          return (
            <SceneLayer
              key={route.key}
              descriptor={descriptor}
              navigationFocused={navigationFocused}
              visualFocused={pendingVisualRouteName === null
                ? navigationFocused
                : pendingVisualRouteName === route.name}
              routeName={route.name as FastTabRouteName}
              layout={layout}
              tabBarHeight={tabBarHeight}
              tabBarPosition={tabBarPosition}
            />
          );
        })}
      </View>

      {(tabBarPosition === 'bottom' || tabBarPosition === 'right') &&
        tabBarElement}
    </SafeAreaProviderCompat>
  );
}

function FastTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  UNSTABLE_routeNamesChangeBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
  ...viewProps
}: BottomTabNavigatorProps) {
  const { state, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      TabNavigationState<ParamListBase>,
      TabRouterOptions,
      TabActionHelpers<ParamListBase>,
      BottomTabNavigationOptions,
      BottomTabNavigationEventMap
    >(TabRouter, {
      id,
      initialRouteName,
      backBehavior,
      UNSTABLE_routeNamesChangeBehavior,
      children,
      layout,
      screenListeners,
      screenOptions,
      screenLayout,
      UNSTABLE_router,
    });

  return (
    <NavigationContent>
      <FastTabView
        {...viewProps}
        state={state}
        descriptors={descriptors}
        navigation={navigation}
      />
    </NavigationContent>
  );
}

export function createFastTabNavigator<
  const ParamList extends ParamListBase,
  const NavigatorID extends string | undefined = string | undefined,
  const TypeBag extends NavigatorTypeBagBase = {
    ParamList: ParamList;
    NavigatorID: NavigatorID;
    State: TabNavigationState<ParamList>;
    ScreenOptions: BottomTabNavigationOptions;
    EventMap: BottomTabNavigationEventMap;
    NavigationList: {
      [RouteName in keyof ParamList]: BottomTabNavigationProp<
        ParamList,
        RouteName,
        NavigatorID
      >;
    };
    Navigator: typeof FastTabNavigator;
  },
  const Config extends StaticConfig<TypeBag> = StaticConfig<TypeBag>,
>(config?: Config): TypedNavigator<TypeBag, Config> {
  return createNavigatorFactory(FastTabNavigator)(config);
}

const FastTabNavigatorFactory = createFastTabNavigator();

type FastTabScreenOptions = BottomTabNavigationOptions & {
  href?: Href | null;
};

const ExpoFastTabs = withLayoutContext<
  FastTabScreenOptions,
  typeof FastTabNavigatorFactory.Navigator,
  TabNavigationState<ParamListBase>,
  BottomTabNavigationEventMap
>(FastTabNavigatorFactory.Navigator, (screens) =>
  screens.map((screen) => {
    if (
      typeof screen.options === 'function' ||
      screen.options?.href === undefined
    ) {
      return screen;
    }

    const { href, ...options } = screen.options;

    if (options.tabBarButton) {
      throw new Error('Cannot use `href` and `tabBarButton` together.');
    }

    return {
      ...screen,
      options: {
        ...options,
        tabBarItemStyle:
          href == null ? { display: 'none' as const } : options.tabBarItemStyle,
        tabBarButton: (props: BottomTabBarButtonProps) => {
          if (href == null) {
            return null;
          }

          const linkProps = props as unknown as Omit<LinkProps, 'href'>;
          const children =
            Platform.OS === 'web' ? (
              props.children
            ) : (
              <Pressable>{props.children}</Pressable>
            );

          return (
            <Link
              {...linkProps}
              href={href}
              asChild={Platform.OS !== 'web'}
              style={[{ display: 'flex' }, props.style] as LinkProps['style']}
            >
              {children}
            </Link>
          );
        },
      },
    };
  }),
  true,
);

const expoTabRouterOverride: NonNullable<
  BottomTabNavigatorProps['UNSTABLE_router']
> = (original) => ({
  ...original,
  getStateForAction(state, action, options) {
    if (action.target && action.target !== state.key) {
      return null;
    }

    if (action.type !== 'REPLACE') {
      return original.getStateForAction(state, action, options);
    }

    let nextState = original.getStateForAction(
      state,
      { ...action, type: 'JUMP_TO' },
      options,
    );

    if (
      !nextState ||
      nextState.index === undefined ||
      !Array.isArray(nextState.history)
    ) {
      return null;
    }

    if (nextState.index !== 0) {
      const previousIndex = nextState.index - 1;
      nextState = {
        ...nextState,
        key: `${nextState.key}-replace`,
        history: [
          ...nextState.history.slice(0, previousIndex),
          ...nextState.history.slice(nextState.index),
        ],
      };
    }

    return nextState;
  },
});

const FastTabsComponent = forwardRef<
  unknown,
  ComponentProps<typeof ExpoFastTabs>
>(function FastTabsComponent(props, ref) {
  return (
    <ExpoFastTabs
      {...props}
      ref={ref}
      UNSTABLE_router={expoTabRouterOverride}
    />
  );
});

/** Expo Router-compatible navigator used as a drop-in replacement for Tabs. */
export const FastTabs = Object.assign(FastTabsComponent, {
  Screen: ExpoFastTabs.Screen,
  Protected: ExpoFastTabs.Protected,
});

export default FastTabs;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  horizontalContainer: {
    flexDirection: 'row',
  },
  scenes: {
    flex: 1,
    overflow: 'hidden',
  },
  sceneLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneLayerVisualFocused: {
    opacity: 1,
    zIndex: 2,
  },
});
