import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('hamburger opens the sidebar on the zero-delay stable press path', () => {
  const source = readSource('src/ui/components/AppHeader.tsx');
  const controllerSource = readSource('src/ui/components/sidebarDrawerController.ts');

  assert.match(source, /const handleOpenSidebar = useCallback/);
  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '\.\/sidebarDrawerController'/);
  assert.match(source, /const hideActionSheet = useUIState\(\(s\) => s\.hideActionSheet\)/);
  assert.doesNotMatch(source, /const setSidebarOpen = useUIState\(\(s\) => s\.setSidebarOpen\)/);
  assert.doesNotMatch(source, /scheduleAfterFirstVisualFrame/);
  assert.match(source, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.doesNotMatch(source, /setSidebarOpen\(true\)/);
  assert.doesNotMatch(source, /scheduleAfterTapFrame/);
  assert.match(source, /export const MENU_BUTTON_VISUAL_LEFT = 28/);
  assert.match(source, /const HEADER_HORIZONTAL_PADDING = 16/);
  assert.match(source, /const HEADER_SIDE_SLOT_WIDTH = 144/);
  assert.match(source, /const MENU_BUTTON_LEFT_INSET = MENU_BUTTON_VISUAL_LEFT - HEADER_HORIZONTAL_PADDING/);
  assert.match(source, /width: HEADER_SIDE_SLOT_WIDTH/);
  assert.match(source, /paddingHorizontal: HEADER_HORIZONTAL_PADDING/);
  assert.match(source, /paddingLeft: MENU_BUTTON_LEFT_INSET/);
  assert.match(source, /paddingRight: 12/);
  assert.match(source, /onPress=\{handleOpenSidebar\}/);
  assert.match(source, /activateOnTouchStart/);
  assert.match(source, /hitSlop=\{MENU_BUTTON_HIT_SLOP\}/);
  assert.match(source, /minHeight: 44/);
  assert.match(source, /latencyLabel="appHeader\.menu"/);
  assert.doesNotMatch(source, /activateOnPressIn/);
  assert.doesNotMatch(source, /onPressIn=\{handleOpenSidebar\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.doesNotMatch(source, /ANDROID_EDGE_GESTURE_SAFE_PAD/);
  assert.match(controllerSource, /const sidebarOpenHandlers: SidebarOpenHandler\[\] = \[\]/);
  assert.match(controllerSource, /sidebarOpenHandlers\.push\(handler\)/);
  assert.match(controllerSource, /const index = sidebarOpenHandlers\.lastIndexOf\(handler\)/);
  assert.match(controllerSource, /sidebarOpenHandlers\.splice\(index, 1\)/);
  assert.match(controllerSource, /sidebarOpenHandlers\[sidebarOpenHandlers\.length - 1\]\?\.\(\)/);
  assert.match(controllerSource, /const SIDEBAR_OPEN_VISUAL_SYNC_DELAY_MS = 130/);
  assert.doesNotMatch(controllerSource, /let openSidebarHandler/);
});

test('sidebar drawer uses native-driver motion and non-blocking navigation for menu rows', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /const DRAWER_OPEN_ANIMATION_MS = 110/);
  assert.match(source, /const DRAWER_CLOSE_ANIMATION_MS = 90/);
  assert.match(source, /const DRAWER_CLOSED_TRANSLATE_X = -DRAWER_WIDTH - 2/);
  assert.match(source, /const SIDEBAR_NAVIGATION_LOCK_MS = 50/);
  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /import \{ warmSidebarRouteModules \} from '..\/..\/utils\/sidebarRouteModuleWarmup'/);
  assert.match(source, /const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200/);
  assert.doesNotMatch(source, /const visible = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(source, /const initialSidebarOpenRef = useRef\(useUIState\.getState\(\)\.sidebarOpen\)/);
  assert.match(source, /const \[interactive, setInteractive\] = useState\(initialSidebarOpenRef\.current\)/);
  assert.match(source, /const sidebarProfileDataActive = useDeferredActiveFlag\(interactive && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS\)/);
  assert.match(source, /useEffect\(\(\) => warmSidebarRouteModules\(\), \[\]\)/);
  assert.doesNotMatch(source, /profileDataReady/);
  assert.match(source, /const LOGGED_OUT_PREFETCH_ROUTES = \['\/login'\] as const/);
  assert.match(source, /const SIDEBAR_STACK_ROUTES = new Set<string>\(LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.match(source, /const SIDEBAR_PUSH_ROUTE_PREFIXES = \['\/settings\/'\] as const/);
  assert.match(source, /const SIDEBAR_PRIMARY_TAB_ROUTES = new Set<string>/);
  assert.match(source, /let lastSidebarDetailBasePath: string \| null = null/);
  assert.match(source, /function scheduleAfterTapVisualFrame\(action: \(\) => void\)/);
  assert.match(source, /const runAfterFrame = \(\) => setTimeout\(action, 0\)/);
  assert.match(source, /function shouldPushSidebarRoute\(route: string\)/);
  assert.match(source, /const animatedVisibleRef = useRef\(initialSidebarOpenRef\.current\)/);
  assert.match(source, /const interactiveGenerationRef = useRef\(0\)/);
  assert.match(source, /const startOpenAnimation = useCallback/);
  assert.match(source, /\]\)\.start\(\(\{ finished \}\) => \{[\s\S]*if \(finished && animatedVisibleRef\.current\) \{[\s\S]*setSidebarOpen\(true\);/);
  assert.doesNotMatch(source, /const snapClosed = useCallback/);
  assert.match(source, /const showInteractiveAfterVisualFrame = useCallback/);
  assert.match(source, /scheduleNextFrame\(\(\) => \{[\s\S]*setInteractive\(true\);/);
  assert.match(source, /const hideInteractiveNow = useCallback/);
  assert.match(source, /setInteractive\(false\);/);
  const snapCloseStart = source.indexOf('const snapClosedForNavigation = useCallback');
  const runNavigationStart = source.indexOf('const runSidebarNavigation = useCallback', snapCloseStart);
  assert.notEqual(snapCloseStart, -1);
  assert.notEqual(runNavigationStart, -1);
  const snapCloseSource = source.slice(snapCloseStart, runNavigationStart);
  assert.match(snapCloseSource, /slideAnim\.setValue\(DRAWER_CLOSED_TRANSLATE_X\)/);
  assert.match(snapCloseSource, /overlayAnim\.setValue\(0\)/);
  assert.match(snapCloseSource, /interactiveGenerationRef\.current \+= 1/);
  assert.doesNotMatch(snapCloseSource, /hideInteractiveNow\(\)/);
  assert.doesNotMatch(snapCloseSource, /onClose\(\)/);
  const navigateStart = source.indexOf('const navigateSidebarRoute = useCallback', runNavigationStart);
  assert.notEqual(navigateStart, -1);
  const runNavigationSource = source.slice(runNavigationStart, navigateStart);
  assert.match(runNavigationSource, /const currentPath = normalizeSidebarPath\(pathname\)/);
  assert.match(runNavigationSource, /SIDEBAR_PRIMARY_TAB_ROUTES\.has\(route\) && shouldPushSidebarRoute\(currentPath\)/);
  assert.match(runNavigationSource, /const detailBasePath = lastSidebarDetailBasePath/);
  assert.match(runNavigationSource, /lastSidebarDetailBasePath = null;[\s\S]*router\.back\(\);/);
  assert.match(runNavigationSource, /if \(detailBasePath !== route\) \{[\s\S]*scheduleAfterTapVisualFrame\(\(\) => router\.navigate\(route as any\)\)/);
  assert.match(runNavigationSource, /useUIState\.getState\(\)\.setSidebarOpen\(false\)/);
  assert.match(runNavigationSource, /if \(SIDEBAR_PRIMARY_TAB_ROUTES\.has\(currentPath\)\) \{[\s\S]*lastSidebarDetailBasePath = currentPath;/);
  const supportStart = source.indexOf('const openSupportEmail = useCallback', navigateStart);
  assert.notEqual(supportStart, -1);
  const navigateSource = source.slice(navigateStart, supportStart);
  assert.match(navigateSource, /snapClosedForNavigation\(\);\s*try \{\s*runSidebarNavigation\(route\);\s*\} finally \{\s*scheduleAfterTapVisualFrame\(\(\) => \{[\s\S]*hideInteractiveNow\(\);[\s\S]*onClose\(\);[\s\S]*unlockSidebarNavigation\(\);/);
  assert.doesNotMatch(navigateSource, /snapClosedForNavigation\(\);[\s\S]*scheduleAfterTapVisualFrame\(\(\) => \{[\s\S]*runSidebarNavigation\(route\);/);
  assert.match(source, /import \{ registerSidebarOpenHandler \} from '\.\/sidebarDrawerController'/);
  assert.match(source, /useEffect\(\(\) => registerSidebarOpenHandler\(\(\) => \{[\s\S]*startOpenAnimation\(\);[\s\S]*showInteractiveAfterVisualFrame\(\);/);
  assert.match(source, /useUIState\.subscribe\(\(state, previousState\) => \{/);
  assert.match(source, /if \(state\.sidebarOpen\) \{\s*if \(!animatedVisibleRef\.current\) \{\s*startOpenAnimation\(\);\s*\}\s*showInteractiveAfterVisualFrame\(\);/);
  assert.match(source, /if \(!isClosingRef\.current && animatedVisibleRef\.current\) \{\s*handleClose\(\);/);
  assert.doesNotMatch(source, /useLayoutEffect/);
  assert.match(source, /Animated\.parallel\(\[/);
  assert.match(source, /toValue: 0,[\s\S]*duration: DRAWER_OPEN_ANIMATION_MS,[\s\S]*useNativeDriver: true/);
  assert.match(source, /toValue: 1,[\s\S]*duration: DRAWER_OPEN_ANIMATION_MS,[\s\S]*useNativeDriver: true/);
  assert.match(source, /toValue: DRAWER_CLOSED_TRANSLATE_X,[\s\S]*duration: DRAWER_CLOSE_ANIMATION_MS,[\s\S]*useNativeDriver: true/);
  assert.match(source, /Easing\.out\(Easing\.cubic\)/);
  assert.doesNotMatch(source, /const \[keepDrawerMounted, setKeepDrawerMounted\]/);
  assert.doesNotMatch(source, /const shouldRenderDrawer = visible \|\| keepDrawerMounted/);
  assert.match(source, /Keep the drawer warm offscreen so opening only has to run native-driver motion/);
  assert.match(source, /pointerEvents=\{interactive \? 'auto' : 'none'\}/);
  assert.match(source, /importantForAccessibility=\{interactive \? 'auto' : 'no-hide-descendants'\}/);
  assert.match(source, /accessibilityElementsHidden=\{!interactive\}/);
  assert.doesNotMatch(source, /containerHidden:/);
  assert.match(source, /style=\{ds\.container\}/);
  assert.doesNotMatch(source, /if \(!shouldRenderDrawer\) \{\s*return null;\s*\}/);
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /handleClose\(\);\s*return true;/);
  assert.match(source, /pointerEvents="box-none"[\s\S]*style=\{\[[\s\S]*ds\.overlay/);
  assert.match(source, /renderToHardwareTextureAndroid/);
  assert.match(source, /needsOffscreenAlphaCompositing/);
  assert.match(source, /shouldRasterizeIOS/);
  assert.match(source, /overlay: \{[\s\S]*left: DRAWER_WIDTH,[\s\S]*zIndex: 0,[\s\S]*elevation: 0,/);
  assert.doesNotMatch(source, /overlay: \{\s*\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(source, /drawer: \{[\s\S]*zIndex: 1,[\s\S]*elevation: 1,/);
  assert.match(source, /Keep the account block compact so the first menu rows sit higher on phone screens/);
  assert.match(source, /profileHeader: \{[\s\S]*paddingBottom: 8,/);
  assert.match(source, /accountDetails: \{[\s\S]*marginBottom: 4,/);
  assert.match(source, /manageBtn: \{[\s\S]*paddingVertical: 2,/);
  assert.match(source, /transform: \[\{ translateX: slideAnim \}\]/);
  assert.doesNotMatch(source, /if \(!visible\) \{\s*return null;\s*\}/);
  assert.doesNotMatch(source, /const PREFETCH_ROUTES = \[/);
  assert.doesNotMatch(source, /SIDEBAR_PREFETCH_DELAY_MS/);
  assert.doesNotMatch(source, /prefetchSidebarRoutes/);
  assert.doesNotMatch(source, /const prefetchSidebarRoute = useCallback/);
  assert.doesNotMatch(source, /const prefetchNextRoute = \(\) => \{/);
  assert.match(source, /try \{\s*prefetch\(route\);/);
  assert.match(source, /if \(isLoggedIn\) \{\s*return;\s*\}/);
  assert.match(source, /for \(const route of LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.doesNotMatch(source, /scheduleNextFrame\(afterClose\)/);
  assert.match(source, /keyboardShouldPersistTaps="always"/);
  assert.match(source, /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/);
  assert.match(source, /const navigateSidebarRoute = useCallback/);
  assert.match(source, /navigationLockedRef\.current = true/);
  assert.doesNotMatch(source, /clearSidebarPrefetchTimer/);
  assert.match(source, /const snapClosedForNavigation = useCallback/);
  assert.match(source, /snapClosedForNavigation\(\);\s*try \{\s*runSidebarNavigation\(route\);\s*\} finally \{\s*scheduleAfterTapVisualFrame\(\(\) => \{[\s\S]*hideInteractiveNow\(\);[\s\S]*onClose\(\);[\s\S]*unlockSidebarNavigation\(\);/);
  assert.doesNotMatch(source, /snapClosedForNavigation\(\);[\s\S]*scheduleAfterTapVisualFrame\(\(\) => \{[\s\S]*runSidebarNavigation\(route\);/);
  assert.match(source, /const openSupportEmailFromSidebar = useCallback/);
  assert.match(source, /snapClosedForNavigation\(\);[\s\S]*hideInteractiveNow\(\);[\s\S]*onClose\(\);[\s\S]*void openSupportEmail\(\)\.finally\(\(\) => \{[\s\S]*unlockSidebarNavigation\(\);/);
  assert.doesNotMatch(source, /if \(item\.action === 'support-email'\) \{[\s\S]*handleClose\(\(\) => \{[\s\S]*void openSupportEmail\(\)/);
  assert.doesNotMatch(source, /preloadSidebarRouteModule/);
  assert.doesNotMatch(source, /preloadDeferredRouteModule\(JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute\)/);
  assert.doesNotMatch(source, /function scheduleAfterPressPaint/);
  assert.match(source, /normalizeSidebarPath\(route\)/);
  assert.doesNotMatch(source, /scheduleAfterFirstVisualFrame/);
  assert.doesNotMatch(source, /showSidebarRouteTransition/);
  // Detail routes push over (tabs) (keeping the tab navigator + warm chart
  // WebView mounted) so BACK is an instant pop, not a tab re-mount.
  assert.match(source, /SIDEBAR_STACK_ROUTES\.has\(route\) \|\| shouldPushSidebarRoute\(route\)/);
  assert.match(source, /router\.push\(route as any\)/);
  assert.doesNotMatch(source, /router\.replace\(route as any\)/);
  assert.match(source, /router\.navigate\(route as any\)/);
  assert.doesNotMatch(source, /prefetchSidebarRoute\(route\);\s*router\.push\(route as any\)/);
  assert.match(source, /unlockSidebarNavigation\(\)/);
  assert.match(source, /onPress=\{\(\) => handleMenuItemPress\(item\)\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /hitSlop=\{SIDEBAR_MENU_ITEM_HIT_SLOP\}/);
  assert.match(source, /minHeight: 48/);
  assert.match(source, /latencyLabel=\{`sidebar\.menu\.\$\{item\.label\}`\}/);
  assert.doesNotMatch(source, /router\.push\(item\.route as any\)/);
  assert.doesNotMatch(source, /runInstantSidebarAction/);
  assert.doesNotMatch(source, /runSidebarPressFallback/);
  assert.doesNotMatch(source, /handleSidebarPressOut/);
  assert.doesNotMatch(source, /SIDEBAR_PRESS_GUARD_MS/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});


test('trade sidebar route defers position refresh until after route paint', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');

  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /const TRADE_SCREEN_FETCH_DELAY_MS = 0/);
  assert.match(source, /const TRADE_SCREEN_REFRESH_INTERVAL_MS = 3000/);
  assert.match(source, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(source, /requestAnimationFrame\(markReady\)/);
  assert.match(source, /const sidebarOpen = useUIState\(\(st\) => st\.sidebarOpen\)/);
  // Live quote subscriptions are lightweight and start immediately on focus;
  // backend ledger refresh remains deferred until after the route paints.
  assert.match(source, /const tradeLiveActive = isScreenFocused && !sidebarOpen/);
  assert.match(source, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady && !sidebarOpen, TRADE_SCREEN_FETCH_DELAY_MS\)/);
  assert.match(source, /if \(!tradeFetchActive \|\| !resolvedLogin\) \{/);
  assert.match(source, /refreshVisibleTradeLedger\(\);[\s\S]*setInterval\(refreshVisibleTradeLedger, TRADE_SCREEN_REFRESH_INTERVAL_MS\)/);
  assert.match(source, /clearInterval\(refreshIntervalId\)/);
  assert.match(source, /const positionRowsActive = tradeLiveActive/);
  assert.match(source, /<TradeSummaryHeader[\s\S]*active=\{tradeLiveActive\}/);
  assert.match(source, /const rowActive = positionRowsActive && \([\s\S]*viewablePositionIds\.has\(String\(item\.id\)\)/);
  assert.match(source, /<TradePositionRow[\s\S]*active=\{rowActive\}/);
  assert.doesNotMatch(source, /if \(isScreenFocused && resolvedLogin\) \{\s*fetchPositions\(\);/);
});

test('settings sidebar route defers account-card queries until after route paint', () => {
  const source = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');

  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /const SETTINGS_SCREEN_DATA_DELAY_MS = 8000/);
  assert.match(source, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(source, /requestAnimationFrame\(markReady\)/);
  assert.match(source, /const sidebarOpen = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(source, /const settingsDataActive = useDeferredActiveFlag\(\s*isAccountConnected && isScreenFocused && firstPaintReady && !sidebarOpen,\s*SETTINGS_SCREEN_DATA_DELAY_MS,\s*\)/);
  assert.match(source, /useBrokerConfig\(brokerId, settingsDataActive\)/);
  assert.doesNotMatch(source, /useAccounts\(settingsDataActive\)/);
  assert.match(source, /useAccountDetails\(activeLogin, settingsDataActive && !!activeLogin\)/);
  assert.doesNotMatch(source, /const settingsDataActive = isAccountConnected && isScreenFocused/);
});
test('journal sidebar route defers live account queries until after first paint', () => {
  const source = readSource('src/features/settings/JournalScreen/liveJournal.ts');

  assert.match(source, /const JOURNAL_QUERY_ACTIVATION_DELAY_MS = 8000/);
  assert.match(source, /function useDeferredJournalQueries\(active: boolean, cacheKey: number \| undefined\)/);
  assert.match(source, /const sidebarOpen = useUIState\(\(state\) => state\.sidebarOpen\)/);
  assert.match(source, /const enabled = accountLogin !== undefined && !sidebarOpen/);
  assert.match(source, /const queriesActive = useDeferredJournalQueries\(enabled, accountLogin\)/);
  assert.match(source, /enabled: queriesActive/);
  assert.match(source, /refetchInterval: queriesActive \? 5000 : false/);
  assert.match(source, /refetchInterval: queriesActive \? 30_000 : false/);
  assert.match(source, /refetchOnMount: false/);
  assert.doesNotMatch(source, /refetchOnMount: 'always'/);
});


test('journal sidebar destination keeps menu access for repeated MT-style drawer selection', () => {
  const source = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');

  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '..\/..\/..\/ui\/components\/sidebarDrawerController'/);
  // Pushed detail routes render their own drawer instance (above this screen),
  // otherwise the hamburger would open the (tabs) drawer hidden underneath.
  assert.match(source, /import \{ SidebarDrawer \} from '..\/..\/..\/ui\/components\/SidebarDrawer'/);
  assert.match(source, /const \[drawerReady, setDrawerReady\] = useState\(false\)/);
  assert.match(source, /requestAnimationFrame\(showDrawer\)/);
  assert.match(source, /\{drawerReady \? <SidebarDrawer \/> : null\}/);
  assert.match(source, /<SectionList/);
  assert.match(source, /initialNumToRender=\{JOURNAL_INITIAL_RENDER_ITEMS\}/);
  assert.match(source, /maxToRenderPerBatch=\{JOURNAL_RENDER_BATCH_SIZE\}/);
  assert.match(source, /windowSize=\{JOURNAL_WINDOW_SIZE\}/);
  assert.doesNotMatch(source, /groups\.map\(\(group\)/);
  assert.match(source, /const hideActionSheet = useUIState\(\(state\) => state\.hideActionSheet\)/);
  assert.match(source, /const handleOpenMenu = useCallback/);
  assert.match(source, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.match(source, /onPress=\{handleOpenMenu\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="journal\.menu"/);
  assert.doesNotMatch(source, /latencyLabel="journal\.back"/);
  assert.doesNotMatch(source, /safeRouterBack\(router, '\/\(tabs\)\/settings'\)/);
});

test('economic calendar sidebar destination uses hamburger menu access', () => {
  const source = readSource('src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx');

  assert.match(source, /import \{ SidebarDrawer \} from '..\/..\/..\/ui\/components\/SidebarDrawer'/);
  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '..\/..\/..\/ui\/components\/sidebarDrawerController'/);
  assert.match(source, /const hideActionSheet = useUIState\(\(state\) => state\.hideActionSheet\)/);
  assert.match(source, /const handleOpenMenu = useCallback/);
  assert.match(source, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.match(source, /onPress=\{handleOpenMenu\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="economicCalendar\.menu"/);
  assert.match(source, /<Ionicons name="menu" size=\{28\}/);
  assert.match(source, /<SidebarDrawer \/>/);
  assert.doesNotMatch(source, /safeRouterBack\(router, '\/\(tabs\)\/settings'\)/);
  assert.doesNotMatch(source, /name="arrow-back"/);
});

test('settings detail back buttons pop instantly instead of re-mounting the tab navigator', () => {
  const directBackFiles = [
    'src/features/settings/AccountsScreen.tsx',
    'src/features/settings/NewsScreen.tsx',
    'src/features/settings/MailboxScreen.tsx',
    'src/features/settings/InterfaceScreen.tsx',
    'src/features/settings/TradersCommunityScreen.tsx',
  ];

  for (const file of directBackFiles) {
    const source = readSource(file);
    // Back is an instant pop to the already-mounted previous screen. The old
    // router.replace('/(tabs)/settings') re-mounted the entire (tabs) navigator
    // (re-booting the pre-warmed chart WebView) — a ~1.8s freeze on a real
    // device. Forward nav now PUSHES (SettingsScreen.openReadySettingsRoute and
    // SidebarDrawer), so the tab navigator stays mounted underneath and
    // safeRouterBack pops straight to it. No deep history walk: the sidebar only
    // opens from tabs, so the detail stack stays one level deep.
    assert.match(source, /safeRouterBack\(router, '\/\(tabs\)\/settings'\)/, `${file} should pop back, not re-mount`);
    assert.doesNotMatch(source, /router\.replace\('\/\(tabs\)\/settings'\)/, `${file} should not re-mount the tab navigator`);
  }
});

test('chart header menu avoids Android edge gesture interception', () => {
  const source = readSource('src/features/chart/ChartScreen.styles.ts');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');

  assert.match(source, /MENU_BUTTON_VISUAL_LEFT/);
  assert.match(source, /width: MENU_BTN_GUTTER/);
  assert.match(source, /alignItems: 'flex-start'/);
  assert.match(source, /paddingLeft: MENU_BUTTON_VISUAL_LEFT/);
  assert.doesNotMatch(source, /CHART_HEADER_EDGE_GESTURE_SAFE_PAD/);
  assert.doesNotMatch(chartSource, /scheduleAfterFirstVisualFrame/);
  assert.match(chartSource, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.doesNotMatch(chartSource, /setSidebarOpen\(true\)/);
  assert.match(
    chartSource,
    /accessibilityLabel=\{t\('Open menu'\)\}[\s\S]*onPress=\{handleOpenSidebar\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="chartHeader\.menu"/,
  );
});

test('sidebar login prompt opens login from a large first-touch target', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /const SIDEBAR_PROFILE_ACTION_HIT_SLOP = \{/);
  assert.match(source, /onPress=\{\(\) => navigateSidebarRoute\('\/login'\)\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /hitSlop=\{SIDEBAR_PROFILE_ACTION_HIT_SLOP\}/);
  assert.match(source, /latencyLabel="sidebar\.getStarted"/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /<View style=\{ds\.getStartedBtn\}>/);
  assert.match(source, /minHeight: 44/);
  assert.match(source, /justifyContent: 'center'/);
  assert.doesNotMatch(source, /<Pressable[\s\S]*style=\{ds\.getStartedBtn\}[\s\S]*latencyLabel="sidebar\.getStarted"/);
});

test('sidebar profile avatar shows the logged-in broker logo with RTX5 fallback', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /Alert, Animated, BackHandler, Easing, Image, Linking/);
  assert.match(source, /const brokerLogoUrl = useUserPreferences\(\(s\) => s\.brokerLogoUrl\)/);
  assert.match(source, /const activeBrokerLogoUrl = useMemo\(/);
  assert.match(source, /\(\) => \(isLoggedIn \? brokerLogoUrl\.trim\(\) : ''\)/);
  assert.match(source, /const \[brokerLogoFailed, setBrokerLogoFailed\] = useState\(false\)/);
  assert.match(source, /useEffect\(\(\) => \{\s*setBrokerLogoFailed\(false\);\s*\}, \[activeBrokerLogoUrl\]\)/);
  assert.match(source, /activeBrokerLogoUrl && !brokerLogoFailed \? \(/);
  assert.match(source, /<Image[\s\S]*accessibilityLabel="Broker logo"[\s\S]*source=\{\{ uri: activeBrokerLogoUrl \}\}[\s\S]*onError=\{\(\) => setBrokerLogoFailed\(true\)\}/);
  assert.match(source, /\) : \(\s*<AppLogo style=\{ds\.avatarImage\} \/>\s*\)/);
});

test('sidebar keeps the main option routes warm and available', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');
  const deferredMountSource = readSource('src/ui/components/DeferredRouteMount.tsx');
  const sidebarWarmupSource = readSource('src/utils/sidebarRouteModuleWarmup.ts');
  const deferredRouteFiles = [
    'app/settings/accounts.tsx',
    'app/settings/economic-calendar.tsx',
    'app/settings/user-guide.tsx',
    'app/settings/help.tsx',
    'app/settings/about.tsx',
  ];
  const journalRouteSource = readSource('app/settings/journal.tsx');
  const accountsRouteSource = readSource('app/settings/accounts.tsx');
  const actionWarmupSource = readSource('src/utils/actionRouteWarmup.ts');

  assert.match(source, /label: 'Trade'.*route: '\/trade'/);
  assert.doesNotMatch(source, /label: 'News'.*route: '\/settings\/news'/);
  assert.doesNotMatch(source, /label: 'Mailbox'.*route: '\/settings\/mailbox'/);
  assert.match(source, /label: 'Journal'.*route: '\/settings\/journal'/);
  assert.match(source, /label: 'Settings'.*route: '\/settings'/);
  assert.match(source, /label: 'Economic Calendar'.*route: '\/settings\/economic-calendar'/);
  assert.match(source, /label: 'User Guide'.*route: '\/settings\/user-guide'/);
  assert.match(source, /label: 'Support'.*action: 'support-email'/);
  assert.match(source, /label: 'Help'.*route: '\/settings\/help'/);
  assert.match(source, /label: 'About'.*route: '\/settings\/about'/);
  assert.match(source, /getConfiguredSupportEmail/);
  assert.match(source, /buildHelpMailto/);
  assert.match(source, /warmSidebarRouteModules/);
  assert.doesNotMatch(source, /\/settings\/support/);
  assert.doesNotMatch(source, /MQL5 Algo Trading|\/settings\/mql5-algo-trading|Traders Community|\/settings\/traders-community/);
  assert.match(source, /'\/settings\/accounts'/);
  assert.match(source, /'\/login'/);
  assert.match(rootLayoutSource, /const sidebarDetailScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none'/);
  assert.match(rootLayoutSource, /name='settings\/news' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/mailbox' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/journal' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/economic-calendar' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/user-guide' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/help' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/about' options=\{sidebarDetailScreenOptions\}/);
  assert.doesNotMatch(rootLayoutSource, /settings\/mql5-algo-trading|settings\/traders-community/);
  assert.doesNotMatch(tabsLayoutSource, /warmSidebarRouteModules/);
  assert.doesNotMatch(tabsLayoutSource, /SidebarRouteTransitionOverlay/);
  assert.match(deferredMountSource, /requestAnimationFrame/);
  assert.match(deferredMountSource, /export function DeferredRouteModule/);
  assert.match(deferredMountSource, /const ROUTE_MODULE_LOAD_DELAY_MS = 0/);
  assert.match(deferredMountSource, /const ROUTE_HEAVY_CONTENT_DELAY_MS = 1200/);
  assert.match(deferredMountSource, /export function useDeferredRouteContentReady/);
  assert.match(deferredMountSource, /scheduleDeferredFrameWork\(2/);
  assert.match(deferredMountSource, /const routeModuleCache = new Map<string, CachedRouteModule>\(\)/);
  assert.match(deferredMountSource, /export function preloadDeferredRouteModule/);
  assert.match(deferredMountSource, /preloadDeferredRouteModule\(cacheKey, load\)/);
  assert.match(sidebarWarmupSource, /const SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS = 0/);
  assert.match(sidebarWarmupSource, /const SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS = 16/);
  assert.match(sidebarWarmupSource, /const SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_TIMEOUT_MS = 450/);
  assert.match(sidebarWarmupSource, /const SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_TIMEOUT_MS = 650/);
  assert.match(sidebarWarmupSource, /key: 'trade\/index'/);
  assert.match(sidebarWarmupSource, /key: 'settings\/index'/);
  assert.match(sidebarWarmupSource, /key: 'settings\/economic-calendar'/);
  assert.match(sidebarWarmupSource, /key: 'settings\/user-guide'/);
  assert.match(sidebarWarmupSource, /key: 'settings\/help'/);
  assert.match(sidebarWarmupSource, /key: 'settings\/about'/);
  assert.match(sidebarWarmupSource, /key: JOURNAL_ROUTE_CACHE_KEY/);
  assert.match(sidebarWarmupSource, /preloadDeferredRouteModule\(module\.key, module\.load\)/);
  assert.match(sidebarWarmupSource, /delayMs: SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS/);
  assert.match(sidebarWarmupSource, /delayMs: SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS/);
  assert.match(deferredMountSource, /fallback = null/);
  assert.match(deferredMountSource, /mountDelayMs\?: number/);
  assert.match(deferredMountSource, /function useOptionalDeferredRouteMountReady\(delayMs: number \| undefined\)/);
  assert.match(deferredMountSource, /const mountReady = useOptionalDeferredRouteMountReady\(mountDelayMs\)/);
  assert.match(deferredMountSource, /if \(!RouteComponent \|\| !mountReady\) \{\s*return <>\{fallback\}<\/>;\s*\}/);
  assert.doesNotMatch(deferredMountSource, /DeferredRoutePlaceholder|placeholderTitle|title\?: string/);
  assert.match(journalRouteSource, /DeferredRouteModule/);
  assert.match(journalRouteSource, /cacheKey=\{JOURNAL_ROUTE_CACHE_KEY\}/);
  assert.match(journalRouteSource, /load=\{loadJournalScreenRoute\}/);
  assert.match(journalRouteSource, /mountDelayMs=\{SETTINGS_ROUTE_MOUNT_DELAY_MS\}/);
  assert.match(journalRouteSource, /fallback=\{<JournalRouteFallback \/>\}/);
  assert.doesNotMatch(journalRouteSource, /import \{ JournalScreen \}/);
  assert.match(accountsRouteSource, /DeferredRouteModule/);
  assert.match(accountsRouteSource, /cacheKey="settings\/accounts"/);
  assert.match(accountsRouteSource, /mountDelayMs=\{SETTINGS_ROUTE_MOUNT_DELAY_MS\}/);
  assert.match(accountsRouteSource, /SettingsRouteLaunchPreview/);
  assert.match(actionWarmupSource, /ACTION_DEFERRED_MODULE_WARMUPS/);
  assert.match(actionWarmupSource, /preloadDeferredRouteModule\(module\.cacheKey, module\.load\)/);
  for (const file of deferredRouteFiles) {
    const routeSource = readSource(file);
    if (/DeferredRouteModule/.test(routeSource)) {
      assert.match(routeSource, /const SETTINGS_ROUTE_MOUNT_DELAY_MS = 0/);
      assert.match(routeSource, /const load[A-Za-z0-9]+ScreenRoute = \(\) => import\('..\/..\/src\/features\/settings\//);
      assert.match(routeSource, /mountDelayMs=\{SETTINGS_ROUTE_MOUNT_DELAY_MS\}/);
      assert.match(routeSource, /fallback=\{\([\s\S]*<SettingsRouteLaunchPreview/);
      assert.doesNotMatch(routeSource, /<Stack\.Screen[^>]*title="/);
    } else {
      assert.doesNotMatch(routeSource, /DeferredRouteModule|const load[A-Za-z0-9]+ScreenRoute = \(\) => import\('/);
      assert.match(routeSource, /import \{ [A-Za-z0-9]+Screen \} from '..\/..\/src\/features\/settings\//);
      assert.match(routeSource, /<[A-Za-z0-9]+Screen \/>|<DeferredRouteScreen Screen=\{[A-Za-z0-9]+Screen\}/);
      assert.doesNotMatch(routeSource, /title="/);
    }
  }
});
