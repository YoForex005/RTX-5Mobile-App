import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createFastTabVisualController,
  fastTabVisualController,
  scheduleFastTabNavigation,
} from '../ui/navigation/fastTabVisualController';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('bottom tab press paints optimistically on press-in and delays real navigation', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const visualControllerSource = readSource('src/ui/navigation/fastTabVisualController.ts');

  assert.match(source, /import \{ PlatformPressable \} from '@react-navigation\/elements'/);
  assert.match(source, /const TAB_SWITCH_MAX_LATENCY_MS = 20/);
  assert.match(source, /const STALE_TAB_SWITCH_SAMPLE_MS = 5000/);
  // 350ms absorbs a double-fired press event from one physical tap without
  // swallowing a deliberate A -> B -> A return tap the way 1500ms did.
  assert.match(source, /const TAB_PRESS_DEDUP_WINDOW_MS = 350/);
  assert.match(source, /const recentTabPresses = new Map<string, number>\(\)/);
  assert.match(source, /function scheduleTabSwitchBudgetCheck\(label: string, startedAtMs: number, navigationFinishedAtMs: number\)/);
  assert.match(source, /type FastTabBarButtonProps = BottomTabBarButtonProps & \{/);
  assert.match(source, /const FastTabBarButton = memo/);
  assert.match(source, /const pressStartedAtRef = useRef<number \| null>\(null\)/);
  assert.match(source, /const handledOnPressInRef = useRef\(false\)/);
  assert.match(source, /latencyLabel = 'bottom tab'/);
  assert.match(source, /const handleTouchStart = useCallback/);
  assert.match(source, /const handlePressIn = useCallback/);
  assert.match(source, /pressStartedAtRef\.current = pressStartedAtRef\.current \?\? getNow\(\)/);
  assert.match(source, /onPress && !handledOnPressInRef\.current/);
  assert.match(source, /handledOnPressInRef\.current = true/);
  assert.match(source, /runTabPress\(event as TabPressEvent\)/);
  assert.match(source, /const startedAtMs = pressStartedAtRef\.current \?\? getNow\(\)/);
  assert.match(source, /const lastHandledAtMs = recentTabPresses\.get\(latencyLabel\)/);
  assert.match(source, /startedAtMs - lastHandledAtMs < TAB_PRESS_DEDUP_WINDOW_MS/);
  assert.match(source, /recentTabPresses\.set\(latencyLabel, startedAtMs\)/);
  assert.match(source, /useUIState\.getState\(\)\.hideActionSheet\(\)/);
  assert.match(source, /const visualRevision = showFastTabVisual\(latencyLabel\)/);
  assert.match(source, /if \(visualRevision !== null\) \{[\s\S]*?scheduleFastTabNavigation\(visualRevision, \(\) => onPress\?\.\(event\), TAB_BAR_NAVIGATION_SETTLE_DELAY_MS\);\s*\} else \{\s*onPress\?\.\(event\)/);
  assert.match(source, /scheduleTabSwitchBudgetCheck\(latencyLabel, startedAtMs, getNow\(\)\)/);
  assert.match(source, /onTouchStart=\{handleTouchStart\}/);
  assert.match(source, /onPressIn=\{handlePressIn\}/);
  assert.match(source, /onPress=\{handlePress\}/);
  assert.match(source, /onPressOut=\{handlePressOut\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.match(source, /if \(handledOnPressInRef\.current\) \{\s*handledOnPressInRef\.current = false;\s*return;/);
  assert.match(visualControllerSource, /export function scheduleFastTabNavigation\(\s*revision: number,\s*action: \(\) => void,\s*settleDelayMs: number = FAST_TAB_NAVIGATION_SETTLE_DELAY_MS,\s*\)/);
  assert.match(visualControllerSource, /const requestedSnapshot = fastTabVisualController\.getSnapshot\(\)/);
  assert.match(visualControllerSource, /requestedSnapshot\.revision === revision \? requestedSnapshot\.routeName : null/);
  assert.match(visualControllerSource, /requestedRouteName !== null &&[\s\S]*currentSnapshot\.revision === revision &&[\s\S]*currentSnapshot\.routeName === requestedRouteName/);
  // Bottom-bar taps (settleDelayMs=0) commit after one paint frame so the
  // previous tab's focus work stops immediately. Drawer closes keep the
  // two-frame + settle path so close animation is not starved.
  assert.match(visualControllerSource, /if \(settleDelayMs <= 0\) \{\s*globalThis\.requestAnimationFrame\(runIfCurrent\);\s*return;/);
  assert.match(visualControllerSource, /const FAST_TAB_NAVIGATION_SETTLE_DELAY_MS = 60/);
  assert.match(visualControllerSource, /export const TAB_BAR_NAVIGATION_SETTLE_DELAY_MS = 0/);
  assert.match(visualControllerSource, /globalThis\.requestAnimationFrame\(\(\) => \{\s*globalThis\.requestAnimationFrame\(\(\) => \{\s*setTimeout\(runIfCurrent, settleDelayMs\);/);
  assert.match(visualControllerSource, /export function showFastTabVisual\(pathOrName: string\) \{[\s\S]*fastTabVisualController\.show\(routeName, false\)/);
});

test('delayed tab navigation is cancelled after its optimistic route is cleared', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const pendingFrames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  }) as typeof globalThis.requestAnimationFrame;

  try {
    fastTabVisualController.setActualRouteName('quotes');
    const staleRevision = fastTabVisualController.show('chart', false);
    let navigationCount = 0;
    scheduleFastTabNavigation(staleRevision, () => {
      navigationCount += 1;
    }, 0);

    fastTabVisualController.clear(staleRevision);
    pendingFrames.shift()?.(0);
    assert.equal(navigationCount, 0, 'a cleared optimistic route must not navigate later');

    const currentRevision = fastTabVisualController.show('trade', false);
    scheduleFastTabNavigation(currentRevision, () => {
      navigationCount += 1;
    }, 0);
    pendingFrames.shift()?.(16);
    assert.equal(navigationCount, 1, 'the still-current optimistic route must navigate');
    fastTabVisualController.clear(currentRevision);
  } finally {
    fastTabVisualController.clear();
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    }
  }
});

test('tab layout declares only the five primary cached scenes', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const rootSource = readSource('app/_layout.tsx');
  const declaredScreens = Array.from(
    source.matchAll(/<Tabs\.Screen\s+name='([^']+)'/g),
    (match) => match[1],
  );

  assert.deepEqual(declaredScreens, ['quotes', 'chart', 'trade', 'history', 'settings']);
  assert.equal((source.match(/<Tabs\.Screen\b/g) ?? []).length, 5);
  assert.match(source, /import \{ FastTabs as Tabs \} from '\.\.\/\.\.\/src\/ui\/navigation\/FastTabNavigator'/);
  assert.doesNotMatch(source, /SidebarDestinationHost|BrokersLaunchHost|BrokerDetailLaunchHost|RegisterLaunchHost/);
  assert.match(rootSource, /<SidebarDestinationHost \/>[\s\S]*<BrokersLaunchHost \/>[\s\S]*<BrokerDetailLaunchHost \/>[\s\S]*<RegisterLaunchHost \/>[\s\S]*<SidebarDrawer \/>/);
  assert.match(source, /detachInactiveScreens=\{false\}/);
  assert.match(source, /<Tabs[\s\S]*backBehavior='firstRoute'[\s\S]*detachInactiveScreens=\{false\}/);
  assert.match(source, /lazy: false/);
  assert.doesNotMatch(source, /<Tabs\.Screen name='(?:journal|economic-calendar|user-guide|help|about)'/);
});

test('retained Trade prewarms while Settings stays complete without activating hidden work', () => {
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');

  assert.match(tradeSource, /const TRADE_BODY_PREWARM_DELAY_MS = 600/);
  assert.match(tradeSource, /const routeBodyReady = useDeferredRouteContentReady\(\s*isScreenFocused \? 0 : TRADE_BODY_PREWARM_DELAY_MS,\s*\)/);
  assert.match(tradeSource, /const tradeLiveActive = isScreenFocused/);
  assert.match(tradeSource, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady, TRADE_SCREEN_FETCH_DELAY_MS\)/);
  assert.doesNotMatch(tradeSource, /useDeferredRouteContentReady\([^)]*, isScreenFocused\)/);

  assert.doesNotMatch(settingsSource, /SETTINGS_BODY_PREWARM_DELAY_MS|routeBodyReady|useDeferredRouteContentReady/);
  assert.match(settingsSource, /<ScrollView[\s\S]*style=\{styles\.container\}[\s\S]*contentContainerStyle=\{styles\.content\}/);
  assert.match(settingsSource, /isAccountConnected && isScreenFocused && firstPaintReady/);
});

test('custom fast tabs retain Expo Router and TabRouter navigation contracts', () => {
  const source = readSource('src/ui/navigation/FastTabNavigator.tsx');

  assert.match(source, /function FastTabNavigator\(/);
  assert.match(source, /useNavigationBuilder<[\s\S]*TabNavigationState<ParamListBase>,[\s\S]*TabRouterOptions,[\s\S]*TabActionHelpers<ParamListBase>,[\s\S]*BottomTabNavigationOptions,[\s\S]*BottomTabNavigationEventMap[\s\S]*>\(TabRouter, \{/);
  assert.match(source, /<NavigationContent>[\s\S]*<FastTabView/);
  assert.match(source, /return createNavigatorFactory\(FastTabNavigator\)\(config\)/);
  assert.match(source, /const ExpoFastTabs = withLayoutContext<[\s\S]*FastTabScreenOptions,[\s\S]*typeof FastTabNavigatorFactory\.Navigator,[\s\S]*TabNavigationState<ParamListBase>,[\s\S]*BottomTabNavigationEventMap[\s\S]*>\(FastTabNavigatorFactory\.Navigator/);
  assert.match(source, /UNSTABLE_router=\{expoTabRouterOverride\}/);
});

test('fast tab scenes remain cached in plain absolute view layers', () => {
  const source = readSource('src/ui/navigation/FastTabNavigator.tsx');

  assert.match(source, /const loadedRouteKeysRef = useRef\(new Set<string>\(\[focusedRouteKey\]\)\)/);
  assert.match(source, /loadedRouteKeysRef\.current\.add\(focusedRouteKey\)/);
  assert.match(source, /for \(const routeKey of state\.preloadedRouteKeys\) \{\s*loadedRouteKeysRef\.current\.add\(routeKey\)/);
  assert.match(source, /descriptors\[route\.key\]\.options\.lazy === false[\s\S]*loadedRouteKeysRef\.current\.add\(route\.key\)/);
  assert.match(source, /const loaded = loadedRouteKeysRef\.current\.has\(route\.key\)/);
  assert.match(source, /if \(lazy && !loaded && !navigationFocused\) \{\s*return null;/);
  assert.match(source, /<View style=\{styles\.scenes\}>[\s\S]*<SceneLayer[\s\S]*key=\{route\.key\}/);
  assert.match(source, /sceneLayer: \{\s*\.\.\.StyleSheet\.absoluteFillObject,/);
  assert.doesNotMatch(source, /loadedRouteKeysRef\.current\.(?:delete|clear)\(/);
  assert.doesNotMatch(source, /from 'react-native-screens'/);
  assert.doesNotMatch(source, /<BottomTabView|<MaybeScreen|activityState=/);
});

test('tab bar and retained scenes share one deterministic visible route', () => {
  const navigatorSource = readSource('src/ui/navigation/FastTabNavigator.tsx');
  const controllerSource = readSource('src/ui/navigation/fastTabVisualController.ts');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');

  assert.match(controllerSource, /export const FAST_TAB_ROUTE_NAMES = \['quotes', 'chart', 'trade', 'history', 'settings'\] as const/);
  assert.doesNotMatch(controllerSource, /react-native-reanimated|fastTabVisualIndex|executeOnUIRuntimeSync|makeMutable/);
  assert.match(controllerSource, /const visualAppliers = new Set<FastTabVisualApplier>\(\)/);
  assert.match(controllerSource, /const sidebarChromeAppliers = new Set<FastTabVisualApplier>\(\)/);
  assert.match(controllerSource, /registerVisualApplier: \(applier: FastTabVisualApplier\) => \{[\s\S]*visualAppliers\.add\(applier\)[\s\S]*visualAppliers\.delete\(applier\)/);
  assert.match(controllerSource, /export function showFastTabVisualForSidebar\(pathOrName: string\) \{[\s\S]*fastTabVisualController\.show\(routeName, false\)/);
  assert.match(controllerSource, /const applyVisualRoute = \(routeName: FastTabRouteName\) => \{\s*visualAppliers\.forEach\(\(applier\) => applier\(routeName\)\);/);
  assert.match(controllerSource, /show: \(routeName: FastTabRouteName, notifySubscribers = true\) => \{[\s\S]*applyVisualRoute\(routeName\);[\s\S]*applySidebarChromeRoute\(routeName\);[\s\S]*publish\(routeName, revision, notifySubscribers\)/);
  assert.match(controllerSource, /setActualRouteName: \(routeName: FastTabRouteName\) => \{[\s\S]*applyVisualRoute\(routeName\);[\s\S]*applySidebarChromeRoute\(routeName\);[\s\S]*if \(snapshot\.routeName !== null\) \{[\s\S]*publish\(null, snapshot\.revision\)/);
  assert.doesNotMatch(controllerSource, /sidebarChromeRouteName/);
  assert.match(controllerSource, /existingController\.version === FAST_TAB_VISUAL_CONTROLLER_VERSION/);
  assert.equal(
    (navigatorSource.match(/useFastTabVisualSnapshot\(\)/g) ?? []).length,
    1,
    'the tab bar and scenes must consume the same parent visual snapshot',
  );
  const tabBarHostSource = navigatorSource.slice(
    navigatorSource.indexOf('const FastTabBarHost'),
    navigatorSource.indexOf('export function FastTabView'),
  );
  const sceneLayerSource = navigatorSource.slice(
    navigatorSource.indexOf('const SceneLayer'),
    navigatorSource.indexOf('function resolveInsets'),
  );
  assert.doesNotMatch(tabBarHostSource, /useFastTabVisualSnapshot/);
  assert.match(navigatorSource, /const visibleRouteName = visibleState\.routes\[visibleState\.index\]\?\.name\s*\?\? focusedRoute\.name/);
  assert.match(navigatorSource, /<FastTabBarHost\s*state=\{visibleState\}/);
  assert.match(navigatorSource, /visualFocused=\{route\.name === visibleRouteName\}/);
  assert.match(navigatorSource, /registerFastTabVisualApplier\(applyNativeVisualRouteNow\)/);
  assert.match(navigatorSource, /const applyNativeVisualRouteNow = useCallback\([\s\S]*setNativeProps\(\{[\s\S]*style: \[styles\.sceneLayer, styles\.sceneLayerHidden\][\s\S]*setNativeProps\(\{[\s\S]*style: \[styles\.sceneLayer, styles\.sceneLayerVisible\]/);
  assert.match(sceneLayerSource, /ref=\{layerRef\}[\s\S]*collapsable=\{false\}/);
  assert.match(tabsLayoutSource, /const FastTabVisualIcon = memo[\s\S]*activeLayerRef\.current\?\.setNativeProps[\s\S]*inactiveLayerRef\.current\?\.setNativeProps[\s\S]*registerFastTabSidebarChromeApplier\(applyVisualRoute\)/);
  assert.match(tabsLayoutSource, /style: \[styles\.tabIconLayer, \{ opacity: active \? 1 : 0 \}\][\s\S]*style: \[styles\.tabIconLayer, \{ opacity: active \? 0 : 1 \}\]/);
  assert.match(tabsLayoutSource, /const FastTabVisualLabel = memo[\s\S]*labelRef\.current\?\.setNativeProps[\s\S]*registerFastTabSidebarChromeApplier\(applyVisualRoute\)/);
  assert.match(tabsLayoutSource, /tabBarIcon: \(\{ size, color \}\) => \{[\s\S]*<FastTabVisualIcon[\s\S]*routeName=\{route\.name as FastTabRouteName\}/);
  assert.match(tabsLayoutSource, /tabBarLabel: \(\{ children, color \}\) => \{[\s\S]*<FastTabVisualLabel[\s\S]*routeName=\{route\.name as FastTabRouteName\}/);
  assert.match(sceneLayerSource, /<View[\s\S]*visualFocused \? styles\.sceneLayerVisible : styles\.sceneLayerHidden/);
  assert.doesNotMatch(sceneLayerSource, /Animated\.View|useAnimatedStyle|useAnimatedProps|animatedStyle|animatedProps/);
  assert.match(navigatorSource, /pointerEvents=\{visualFocused \? 'auto' : 'none'\}/);
  assert.match(navigatorSource, /sceneLayerVisible: \{\s*opacity: 1,\s*zIndex: 1,\s*\}/);
  assert.match(navigatorSource, /sceneLayerHidden: \{\s*opacity: 0,\s*zIndex: 0,\s*\}/);
  assert.doesNotMatch(navigatorSource, /fastTabVisualIndex|getFastTabRouteIndex|from 'react-native-reanimated'/);
  assert.match(navigatorSource, /\|\| previous\.visualFocused !== next\.visualFocused/);
});

test('fast tab native scene and menu chrome always receive the same route', () => {
  const controller = createFastTabVisualController();
  const sceneRoutes: string[] = [];
  const chromeRoutes: string[] = [];
  const unregisterScene = controller.registerVisualApplier((route) => sceneRoutes.push(route));
  const unregisterChrome = controller.registerSidebarChromeApplier((route) => chromeRoutes.push(route));

  controller.setActualRouteName('trade');
  const chartRevision = controller.show('chart');
  controller.setActualRouteName('chart');
  const historyRevision = controller.show('history', false);
  controller.clear(historyRevision);

  assert.equal(chartRevision > 0, true);
  assert.deepEqual(sceneRoutes, ['trade', 'chart', 'chart', 'history', 'chart']);
  assert.deepEqual(chromeRoutes, sceneRoutes);

  unregisterScene();
  unregisterChrome();
});

test('bottom tab bar follows the optimistic visual route before navigation commits', () => {
  const source = readSource('src/ui/navigation/FastTabNavigator.tsx');

  assert.match(source, /const visualSnapshot = useFastTabVisualSnapshot\(\)/);
  assert.match(source, /const visualRouteIndex = visualSnapshot\.routeName === null[\s\S]*state\.routes\.findIndex\(\(route\) => route\.name === visualSnapshot\.routeName\)/);
  assert.match(source, /const visibleState = visualRouteIndex >= 0 && visualRouteIndex !== state\.index\s*\? \{ \.\.\.state, index: visualRouteIndex \}\s*: state/);
  assert.match(source, /<FastTabBarHost\s*state=\{visibleState\}/);
  assert.match(source, /visualFocused=\{route\.name === visibleRouteName\}/);
});

test('bottom tab navigation has a strict one-frame latency budget', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const budgetMatch = source.match(/const TAB_SWITCH_MAX_LATENCY_MS = (\d+)/);

  assert.ok(budgetMatch, 'tab switch budget constant is missing');
  assert.ok(Number(budgetMatch[1]) <= 20, 'tab switch budget must stay at or below 20ms');
  assert.match(source, /scheduleTabSwitchBudgetCheck\(latencyLabel, startedAtMs, getNow\(\)\)/);
  assert.match(source, /requestAnimationFrame/);
  assert.doesNotMatch(source, /InteractionManager/);
  assert.doesNotMatch(source, /transitionSpec/);
});

test('bottom tab navigation fast path preserves light and dark tab bar themes', () => {
  const source = readSource('app/(tabs)/_layout.tsx');

  assert.match(source, /import \{ useThemeMode \} from '\.\.\/\.\.\/src\/state\/themeMode'/);
  assert.match(source, /ThemedTabsChrome/);
  assert.match(source, /const themeMode = useThemeMode\(\)/);
  assert.match(source, /const isDark = themeMode === 'dark'/);
  assert.match(source, /const T = themeMode === 'light' \? GLight : GDark/);
  assert.doesNotMatch(source, /useDeferredThemeMode\(\)/);
  assert.match(source, /backgroundColor: isDark \? T\.bg : '#ffffff'/);
  assert.match(source, /borderTopColor: isDark \? T\.borderSubtle : 'rgba\(0,0,0,0\.05\)'/);
  assert.match(source, /const inactiveTabColor = isDark \? T\.textMuted : T\.textDimmed/);
  assert.match(source, /const bottomTabActiveColor = T\.trading\.buy\.primary/);
  assert.match(source, /tabBarActiveTintColor: bottomTabActiveColor/);
  assert.match(source, /tabBarInactiveTintColor: inactiveTabColor/);
  assert.match(source, /style=\{\[styles\.tabLabel, isLandscape && styles\.tabLabelLandscape, \{ color \}\]\}/);
  assert.match(source, /\[T\.bg, T\.borderSubtle, insets\.bottom, isDark, isLandscape, tabBarHeight\]/);
});

test('bottom tab bar compacts in landscape to preserve phone content height', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const bottomTabLayoutSource = readSource('src/ui/layout/bottomTabBar.ts');

  assert.match(source, /useWindowDimensions/);
  assert.match(source, /const \{ width, height \} = useWindowDimensions\(\)/);
  assert.match(source, /const isLandscape = width > height/);
  assert.match(source, /resolveBottomTabBarHeight\(\{[\s\S]*isLandscape,[\s\S]*\}\)/);
  assert.match(source, /paddingTop: isLandscape \? 4 : 8/);
  assert.match(source, /paddingBottom: Math\.max\(insets\.bottom, isLandscape \? 4 : 8\)/);
  assert.match(source, /styles\.tabLabel, isLandscape && styles\.tabLabelLandscape, \{ color \}/);
  assert.match(source, /tabLabelLandscape: \{[\s\S]*marginBottom: 0,[\s\S]*\}/);
  assert.match(bottomTabLayoutSource, /MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT = 64/);
  assert.match(bottomTabLayoutSource, /isLandscape\?: boolean/);
  assert.match(bottomTabLayoutSource, /const baseHeight = isLandscape[\s\S]*MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT[\s\S]*MT5_BOTTOM_TAB_BAR_BASE_HEIGHT/);
});

test('primary tab route wrappers do not unmount screens on blur', () => {
  const routeFiles = [
    'app/(tabs)/quotes.tsx',
    'app/(tabs)/chart.tsx',
    'app/(tabs)/trade.tsx',
    'app/(tabs)/history.tsx',
    'app/(tabs)/settings.tsx',
  ];

  for (const file of routeFiles) {
    const source = readSource(file);
    assert.doesNotMatch(source, /useIsFocused/);
    assert.doesNotMatch(source, /return null/);
  }
});
