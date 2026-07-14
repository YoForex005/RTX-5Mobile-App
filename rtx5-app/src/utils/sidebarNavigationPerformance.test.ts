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
  const hostControllerSource = readSource('src/ui/components/sidebarDestinationHostController.ts');
  const fastTabVisualSource = readSource('src/ui/navigation/fastTabVisualController.ts');

  assert.match(source, /const DRAWER_OPEN_ANIMATION_MS = 110/);
  assert.match(source, /const DRAWER_CLOSE_ANIMATION_MS = 90/);
  assert.match(source, /const DRAWER_CLOSED_TRANSLATE_X = -DRAWER_WIDTH - 2/);
  assert.match(source, /const SIDEBAR_NAVIGATION_LOCK_MS = 50/);
  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200/);
  assert.doesNotMatch(source, /const visible = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(source, /const initialSidebarOpenRef = useRef\(useUIState\.getState\(\)\.sidebarOpen\)/);
  assert.match(source, /const \[interactive, setInteractive\] = useState\(initialSidebarOpenRef\.current\)/);
  assert.match(source, /const sidebarProfileDataActive = useDeferredActiveFlag\(interactive && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS\)/);
  assert.doesNotMatch(source, /profileDataReady/);
  assert.match(source, /const LOGGED_OUT_PREFETCH_ROUTES = \['\/login'\] as const/);
  assert.match(source, /const SIDEBAR_STACK_ROUTES = new Set<string>\(LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.match(source, /const SIDEBAR_PUSH_ROUTE_PREFIXES = \['\/settings\/'\] as const/);
  assert.match(source, /const SIDEBAR_PRIMARY_TAB_ROUTES = new Set<string>/);
  assert.doesNotMatch(source, /lastSidebarDetailBasePath|scheduleAfterTapVisualFrame/);
  assert.match(source, /function shouldPushSidebarRoute\(route: string\)/);
  assert.match(source, /const animatedVisibleRef = useRef\(initialSidebarOpenRef\.current\)/);
  assert.match(source, /const interactiveGenerationRef = useRef\(0\)/);
  assert.match(source, /const containerRef = useRef<View>\(null\)/);
  assert.match(source, /const startOpenAnimation = useCallback/);
  assert.match(source, /\]\)\.start\(\(\{ finished \}\) => \{[\s\S]*if \(finished && animatedVisibleRef\.current\) \{[\s\S]*setSidebarOpen\(true\);/);
  assert.doesNotMatch(source, /const snapClosed = useCallback/);
  assert.match(source, /const showInteractiveAfterVisualFrame = useCallback/);
  assert.match(source, /containerRef\.current\?\.setNativeProps\(\{ pointerEvents: 'auto' \}\)/);
  assert.match(source, /scheduleNextFrame\(\(\) => \{[\s\S]*setInteractive\(true\);/);
  assert.match(source, /const hideInteractiveNow = useCallback/);
  assert.match(source, /containerRef\.current\?\.setNativeProps\(\{ pointerEvents: 'none' \}\)/);
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
  // Pathname is read from a ref (fed by the null-rendering SidebarPathnameSync
  // child) so route changes do NOT re-render the drawer — usePathname directly
  // in the drawer body put two drawer re-renders on every navigation commit.
  assert.match(runNavigationSource, /const currentPath = normalizeSidebarPath\(pathnameRef\.current\)/);
  assert.match(source, /function SidebarPathnameSync\(/);
  assert.match(source, /<SidebarPathnameSync pathnameRef=\{pathnameRef\} \/>/);
  assert.match(source, /export const SidebarDrawer = memo\(function SidebarDrawer\(\)/);
  const drawerComponentSource = source.slice(source.indexOf('export const SidebarDrawer = memo'));
  assert.doesNotMatch(drawerComponentSource, /const pathname = usePathname\(\)/);
  assert.match(runNavigationSource, /SIDEBAR_MOUNTED_TAB_ROUTES\.has\(route\) && shouldPushSidebarRoute\(currentPath\)/);
  assert.match(runNavigationSource, /SIDEBAR_MOUNTED_TAB_ROUTES\.has\(route\) && navigateMountedSidebarTab\(route\)/);
  assert.match(runNavigationSource, /router\.dismissTo\(route as any\);\s*return;/);
  assert.doesNotMatch(runNavigationSource, /router\.back\(\)|scheduleAfterTapVisualFrame/);
  const supportStart = source.indexOf('const openSupportEmail = useCallback', navigateStart);
  assert.notEqual(supportStart, -1);
  const navigateSource = source.slice(navigateStart, supportStart);
  const hostedBranchStart = navigateSource.indexOf('if (resolveSidebarHostDestination(route))');
  const primaryBranchStart = navigateSource.indexOf('if (SIDEBAR_PRIMARY_TAB_ROUTES.has(route))');
  const fallbackBranchStart = navigateSource.indexOf('\n    handleClose(() => {', primaryBranchStart);
  assert.notEqual(hostedBranchStart, -1);
  assert.notEqual(primaryBranchStart, -1);
  assert.notEqual(fallbackBranchStart, -1);
  const hostedBranchSource = navigateSource.slice(hostedBranchStart, primaryBranchStart);
  const primaryBranchSource = navigateSource.slice(primaryBranchStart, fallbackBranchStart);
  // MT5-style sequencing: the destination reveal commits first and gets a
  // frame to draw; the close slide starts afterwards so the 90ms motion never
  // competes with the reveal render (device-measured close-frame drops).
  assert.match(hostedBranchSource, /showSidebarDestination\(route, 'sidebar'\);\s*scheduleCloseAfterRevealFrame\(\(\) => \{\s*handleClose\(\(\) => \{\s*unlockSidebarNavigation\(\);\s*\}\);\s*\}\);\s*return;/);
  assert.ok(
    hostedBranchSource.indexOf("showSidebarDestination(route, 'sidebar')")
      < hostedBranchSource.indexOf('handleClose('),
    'hosted destination must become visible before drawer close work starts',
  );
  assert.doesNotMatch(hostedBranchSource, /runSidebarNavigation|navigateMountedSidebarTab|router\.(?:navigate|push|replace|dismissTo)/);
  assert.match(primaryBranchSource, /const visualRevision = showFastTabVisual\(route\);\s*hideSidebarDestination\(\);\s*scheduleCloseAfterRevealFrame\(\(\) => \{\s*handleClose/);
  assert.match(primaryBranchSource, /scheduleFastTabNavigation\(visualRevision, \(\) => \{\s*runSidebarNavigation\(route\);\s*\}\)/);
  assert.ok(
    primaryBranchSource.indexOf('showFastTabVisual(route)')
      < primaryBranchSource.indexOf('scheduleFastTabNavigation('),
    'Trade/Settings must switch the shared visual layer before actual navigation is scheduled',
  );
  assert.doesNotMatch(navigateSource, /scheduleAfterTapVisualFrame|runSidebarNavigation\(route\);[\s\S]*showSidebarDestination/);
  assert.match(source, /import \{[\s\S]*showSidebarDestination,[\s\S]*sidebarDestinationController,[\s\S]*\} from '\.\/sidebarDestinationHostController'/);
  assert.match(source, /import \{[\s\S]*scheduleFastTabNavigation,[\s\S]*showFastTabVisual,[\s\S]*\} from '\.\.\/navigation\/fastTabVisualController'/);
  assert.match(hostControllerSource, /export const SIDEBAR_HOST_DESTINATIONS = \[[\s\S]*'journal',[\s\S]*'economic-calendar',[\s\S]*'user-guide',[\s\S]*'help',[\s\S]*'about'/);
  assert.match(hostControllerSource, /export function showSidebarDestination\([\s\S]*return sidebarDestinationController\.show\(destinationOrPath, source\)/);
  assert.match(fastTabVisualSource, /export function showFastTabVisual\(pathOrName: string\)/);
  assert.match(fastTabVisualSource, /export function scheduleFastTabNavigation\(\s*revision: number,\s*action: \(\) => void,\s*settleDelayMs: number = FAST_TAB_NAVIGATION_SETTLE_DELAY_MS,\s*\)/);
  assert.match(source, /import \{ navigateMountedSidebarTab, registerSidebarOpenHandler \} from '\.\/sidebarDrawerController'/);
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
  assert.match(source, /ref=\{containerRef\}/);
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
  assert.doesNotMatch(hostedBranchSource, /snapClosedForNavigation|hideInteractiveNow|onClose\(\)/);
  assert.doesNotMatch(primaryBranchSource, /snapClosedForNavigation|hideInteractiveNow|onClose\(\)/);
  assert.doesNotMatch(source, /scheduleAfterTapVisualFrame/);
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
  // WebView mounted) so BACK is an instant pop, not a tab re-mount. Detail →
  // detail REPLACES the top screen instead of pushing: stacked details stay
  // mounted (a covered live Journal kept re-rendering 60-360ms JS slices under
  // the new screen), the stack grew without bound, and BACK had to walk every
  // visited detail. Replace keeps the detail stack one level deep while (tabs)
  // stays mounted underneath — replacing INTO a tab route is still forbidden.
  assert.match(source, /SIDEBAR_STACK_ROUTES\.has\(route\) \|\| shouldPushSidebarRoute\(route\)/);
  assert.match(source, /if \(shouldPushSidebarRoute\(currentPath\)\) \{\s*router\.replace\(route as any\);\s*return;\s*\}/);
  assert.match(source, /router\.push\(route as any\)/);
  assert.doesNotMatch(source, /router\.replace\('\/\(tabs\)/);
  assert.match(source, /router\.navigate\(route as any\)/);
  assert.doesNotMatch(source, /prefetchSidebarRoute\(route\);\s*router\.push\(route as any\)/);
  assert.match(source, /unlockSidebarNavigation\(\)/);
  // Menu rows are memoized so drawer-level state flips (interactive, profile
  // data) cannot re-reconcile eight Pressables mid-animation.
  assert.match(source, /const SidebarMenuRow = memo\(function SidebarMenuRow/);
  assert.match(source, /onPress=\{\(\) => onPressItem\(item\)\}/);
  assert.match(source, /onPressItem=\{handleMenuItemPress\}/);
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
  assert.match(source, /const TRADE_BODY_PREWARM_DELAY_MS = 600/);
  assert.match(source, /const routeBodyReady = useDeferredRouteContentReady\(TRADE_BODY_PREWARM_DELAY_MS\)/);
  assert.match(source, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(source, /requestAnimationFrame\(markReady\)/);
  assert.doesNotMatch(source, /sidebarOpen = useUIState/);
  // Live quote subscriptions are lightweight and start immediately on focus;
  // backend ledger refresh remains deferred until after the route paints.
  assert.match(source, /const tradeLiveActive = isScreenFocused/);
  assert.match(source, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady, TRADE_SCREEN_FETCH_DELAY_MS\)/);
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
  assert.match(source, /const SETTINGS_BODY_PREWARM_DELAY_MS = 1200/);
  assert.match(source, /const routeBodyReady = useDeferredRouteContentReady\(\s*isScreenFocused \? 0 : SETTINGS_BODY_PREWARM_DELAY_MS,\s*\)/);
  assert.match(source, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(source, /requestAnimationFrame\(markReady\)/);
  assert.doesNotMatch(source, /sidebarOpen = useUIState/);
  assert.match(source, /const settingsDataActive = useDeferredActiveFlag\(\s*isAccountConnected && isScreenFocused && firstPaintReady,\s*SETTINGS_SCREEN_DATA_DELAY_MS,\s*\)/);
  assert.match(source, /useBrokerConfig\(brokerId, settingsDataActive\)/);
  assert.doesNotMatch(source, /useAccounts\(settingsDataActive\)/);
  assert.match(source, /useAccountDetails\(activeLogin, settingsDataActive && !!activeLogin\)/);
  assert.doesNotMatch(source, /const settingsDataActive = isAccountConnected && isScreenFocused/);
});
test('journal sidebar route defers live account queries until after first paint', () => {
  const source = readSource('src/features/settings/JournalScreen/liveJournal.ts');

  assert.match(source, /const JOURNAL_QUERY_ACTIVATION_DELAY_MS = 8000/);
  assert.match(source, /function useDeferredJournalQueries\(active: boolean, cacheKey: number \| undefined\)/);
  assert.doesNotMatch(source, /useUIState|sidebarOpen/);
  assert.match(source, /export function useJournalTrades\(active = true\)/);
  assert.match(source, /const enabled = active && accountLogin !== undefined/);
  assert.match(source, /const queriesActive = useDeferredJournalQueries\(enabled, accountLogin\)/);
  assert.match(source, /if \(!active\) \{\s*return undefined;\s*\}[\s\S]*setInterval\(updateRetentionClock, 60_000\)/);
  assert.match(source, /enabled: queriesActive/);
  assert.match(source, /refetchInterval: queriesActive \? 5000 : false/);
  assert.match(source, /refetchInterval: queriesActive \? 30_000 : false/);
  assert.match(source, /refetchOnMount: false/);
  assert.doesNotMatch(source, /refetchOnMount: 'always'/);
});


test('journal sidebar destination keeps menu access for repeated MT-style drawer selection', () => {
  const source = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');

  assert.match(source, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(source, /useJournalTrades\(isScreenFocused\)/);
  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '..\/..\/..\/ui\/components\/sidebarDrawerController'/);
  assert.doesNotMatch(source, /import \{ SidebarDrawer \}|<SidebarDrawer|drawerReady|showDrawer/);
  assert.match(rootLayoutSource, /import \{ SidebarDrawer \} from '..\/src\/ui\/components\/SidebarDrawer'/);
  assert.match(rootLayoutSource, /<SidebarDrawer \/>/);
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

  assert.match(source, /import \{ openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual \} from '..\/..\/..\/ui\/components\/sidebarDrawerController'/);
  assert.match(source, /const hideActionSheet = useUIState\(\(state\) => state\.hideActionSheet\)/);
  assert.match(source, /const handleOpenMenu = useCallback/);
  assert.match(source, /openSidebarDrawerImmediately\(\);\s*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.match(source, /onPress=\{handleOpenMenu\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="economicCalendar\.menu"/);
  assert.match(source, /<Ionicons name="menu" size=\{28\}/);
  assert.doesNotMatch(source, /import \{ SidebarDrawer \}|<SidebarDrawer/);
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

test('sidebar hosts detail destinations directly and shares the fast primary-tab visual path', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');
  const sidebarControllerSource = readSource('src/ui/components/sidebarDrawerController.ts');
  const destinationHostSource = readSource('src/ui/components/SidebarDestinationHost.tsx');
  const destinationControllerSource = readSource('src/ui/components/sidebarDestinationHostController.ts');
  const fastTabNavigatorSource = readSource('src/ui/navigation/FastTabNavigator.tsx');
  const fastTabVisualSource = readSource('src/ui/navigation/fastTabVisualController.ts');
  const deferredMountSource = readSource('src/ui/components/DeferredRouteMount.tsx');
  const immediateSidebarRouteFiles = [
    'app/settings/journal.tsx',
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
  assert.match(source, /label: 'Journal'.*route: '\/journal'/);
  assert.match(source, /label: 'Settings'.*route: '\/settings'/);
  assert.match(source, /label: 'Economic Calendar'.*route: '\/economic-calendar'/);
  assert.match(source, /label: 'User Guide'.*route: '\/user-guide'/);
  assert.match(source, /label: 'Support'.*action: 'support-email'/);
  assert.match(source, /label: 'Help'.*route: '\/help'/);
  assert.match(source, /label: 'About'.*route: '\/about'/);
  assert.match(source, /getConfiguredSupportEmail/);
  assert.match(source, /buildHelpMailto/);
  assert.doesNotMatch(source, /warmSidebarRouteModules|router\.prefetch\(route as any\)/);
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
  assert.match(rootLayoutSource, /import \{ SidebarDrawer \} from '..\/src\/ui\/components\/SidebarDrawer'/);
  assert.match(rootLayoutSource, /<\/Stack>[\s\S]*<BrokerDetailLaunchHost \/>[\s\S]*<SidebarDrawer \/>/);
  assert.doesNotMatch(tabsLayoutSource, /import \{ SidebarDrawer \}|<SidebarDrawer \/>/);
  assert.doesNotMatch(tabsLayoutSource, /warmSidebarRouteModules/);
  assert.doesNotMatch(tabsLayoutSource, /SidebarRouteTransitionOverlay/);
  assert.doesNotMatch(tabsLayoutSource, /const sidebarDetailTabPaths = new Set\(\[/);
  assert.doesNotMatch(tabsLayoutSource, /isSidebarDetailTab/);
  assert.match(tabsLayoutSource, /import \{ SidebarDestinationHost \} from '\.\.\/\.\.\/src\/ui\/components\/SidebarDestinationHost'/);
  assert.match(tabsLayoutSource, /import \{\s*hideSidebarDestination,\s*sidebarDestinationController,\s*\} from '\.\.\/\.\.\/src\/ui\/components\/sidebarDestinationHostController'/);
  assert.match(tabsLayoutSource, /import \{ FastTabs as Tabs \} from '\.\.\/\.\.\/src\/ui\/navigation\/FastTabNavigator'/);
  assert.match(tabsLayoutSource, /import \{[\s\S]*scheduleFastTabNavigation,[\s\S]*showFastTabVisual,[\s\S]*\} from '\.\.\/\.\.\/src\/ui\/navigation\/fastTabVisualController'/);
  assert.match(tabsLayoutSource, /registerSidebarTabNavigationHandler\(\(path: SidebarMountedTabPath\) => \{/);
  assert.match(tabsLayoutSource, /navigation\.navigate\(path\.slice\(1\)\)/);
  assert.match(tabsLayoutSource, /layout=\{renderTabsLayout\}/);
  assert.match(sidebarControllerSource, /export function navigateMountedSidebarTab\(path: string\)/);
  assert.match(sidebarControllerSource, /handler\(path as SidebarMountedTabPath\)/);
  for (const name of ['quotes', 'chart', 'trade', 'history', 'settings']) {
    assert.match(tabsLayoutSource, new RegExp(`<Tabs\\.Screen[\\s\\S]{0,120}name='${name}'`));
  }
  for (const name of ['journal', 'economic-calendar', 'user-guide', 'help', 'about']) {
    assert.doesNotMatch(tabsLayoutSource, new RegExp(`<Tabs\\.Screen[\\s\\S]{0,80}name='${name}'`));
  }
  const tabsCloseIndex = tabsLayoutSource.indexOf('</Tabs>');
  const hostMountIndex = tabsLayoutSource.indexOf('<SidebarDestinationHost />');
  assert.notEqual(tabsCloseIndex, -1);
  assert.notEqual(hostMountIndex, -1);
  assert.ok(tabsCloseIndex < hostMountIndex, 'detail host must overlay the retained primary-tab navigator');
  assert.match(tabsLayoutSource, /if \(previousPathRef\.current !== pathname\) \{[\s\S]*hideSidebarDestination\(\);/);
  assert.match(tabsLayoutSource, /const isReturningFromBrokersToAccounts =[\s\S]*previousPath === '\/settings\/brokers'[\s\S]*hostedDestination\.activeDestination === 'accounts'[\s\S]*hostedDestination\.source === 'route-sync'[\s\S]*if \(!isReturningFromBrokersToAccounts\) \{\s*hideSidebarDestination\(\);/);
  assert.match(destinationControllerSource, /export const SIDEBAR_HOST_DESTINATIONS = \[[\s\S]*'journal',[\s\S]*'economic-calendar',[\s\S]*'user-guide',[\s\S]*'help',[\s\S]*'about'/);
  assert.match(destinationControllerSource, /const listeners = new Set<\(\) => void>\(\)/);
  assert.match(destinationControllerSource, /listeners\.forEach\(\(listener\) => listener\(\)\)/);
  assert.match(destinationControllerSource, /registerVisualApplier: \(applier\) => \{/);
  assert.match(destinationControllerSource, /visualApplier\?\.\(destination\);[\s\S]*publish\(\{/);
  // Focus publishes two frames + a settle delay after the visual flip so the
  // heavy focus/query commit lands after the drawer close motion finishes.
  assert.match(destinationControllerSource, /const FOCUS_NOTIFY_SETTLE_DELAY_MS = 110/);
  assert.match(destinationControllerSource, /globalThis\.requestAnimationFrame\(\(\) => \{\s*globalThis\.requestAnimationFrame\(\(\) => \{\s*setTimeout\(notifyIfCurrent, FOCUS_NOTIFY_SETTLE_DELAY_MS\);/);
  assert.match(destinationControllerSource, /if \(source === 'settings'\) \{\s*notifyIfCurrent\(\);\s*return;/);
  assert.match(destinationControllerSource, /show: \(destinationOrPath, source = 'programmatic'\) => \{/);
  assert.match(destinationControllerSource, /export function showSidebarDestination\([\s\S]*sidebarDestinationController\.show\(destinationOrPath, source\)/);
  assert.doesNotMatch(destinationControllerSource, /useRouter|router\.(?:navigate|push|replace|dismissTo)/);
  assert.match(destinationHostSource, /import \{ JournalScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ EconomicCalendarScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ HelpScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ UserGuideScreenInner \} from/);
  assert.match(destinationHostSource, /import \{ AboutScreenInner \} from/);
  assert.match(destinationHostSource, /export function createActiveAwareSidebarDestinationAdapter\(/);
  assert.match(destinationHostSource, /return <ScreenView isScreenFocused=\{active\} \/>/);
  assert.match(destinationHostSource, /supportsInactiveMount: true/);
  assert.match(destinationHostSource, /SIDEBAR_DESTINATION_COMPATIBILITY_REGISTRY/);
  assert.match(destinationHostSource, /journal: createActiveAwareSidebarDestinationAdapter\(JournalScreenInner\)/);
  assert.match(destinationHostSource, /'economic-calendar': createActiveAwareSidebarDestinationAdapter\(EconomicCalendarScreenInner\)/);
  assert.match(destinationHostSource, /'user-guide': createActiveAwareSidebarDestinationAdapter\(UserGuideScreenInner\)/);
  assert.match(destinationHostSource, /help: createActiveAwareSidebarDestinationAdapter\(HelpScreenInner\)/);
  assert.match(destinationHostSource, /about: createActiveAwareSidebarDestinationAdapter\(AboutScreenInner\)/);
  // "Manage accounts" must stay a hosted destination: as a pushed route the
  // navigation commit was measured blocking the tap turn ~1.2s on-device.
  assert.match(destinationHostSource, /import \{ AccountsScreenInner \} from/);
  assert.match(destinationHostSource, /accounts: createActiveAwareSidebarDestinationAdapter\(AccountsScreenInner\)/);
  assert.match(destinationControllerSource, /accounts: '\/settings\/accounts'/);
  const activeAwareDestinationViews = [
    ['src/features/settings/JournalScreen/JournalScreen.tsx', 'JournalScreenInner'],
    ['src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx', 'EconomicCalendarScreenInner'],
    ['src/features/settings/UserGuideScreen.tsx', 'UserGuideScreenInner'],
    ['src/features/settings/HelpScreen.tsx', 'HelpScreenInner'],
    ['src/features/settings/AboutScreen.tsx', 'AboutScreenInner'],
    ['src/features/settings/AccountsScreen.tsx', 'AccountsScreenInner'],
  ] as const;
  for (const [file, innerName] of activeAwareDestinationViews) {
    assert.match(
      readSource(file),
      new RegExp(`export const ${innerName} = (?:React\\.)?memo`),
      `${file} must export its inactive-aware retained host view`,
    );
  }
  assert.match(destinationHostSource, /useSyncExternalStore\(\s*controller\.subscribe,\s*controller\.getSnapshot,\s*controller\.getSnapshot/);
  // Layer visibility must be React-committed via the controller's synchronous
  // visual subscription — the previous Reanimated shared-value flip was
  // observed on-device lagging >1s behind a congested fresh-boot JS loop,
  // leaving the old page visible after the drawer closed.
  assert.match(destinationHostSource, /useSyncExternalStore\(\s*controller\.subscribeVisual,\s*controller\.getSnapshot,\s*controller\.getSnapshot/);
  assert.match(destinationControllerSource, /subscribeVisual: \(listener: \(\) => void\) => \{/);
  assert.match(destinationControllerSource, /visualListeners\.forEach\(\(listener\) => listener\(\)\);\s*notifyAfterFirstVisualFrame\(nextSnapshot\.revision, nextSnapshot\.source\);/);
  assert.match(destinationHostSource, /visualActive \? styles\.destinationVisible : styles\.destinationHidden/);
  assert.match(destinationHostSource, /pointerEvents=\{visualActive \? 'auto' : 'none'\}/);
  assert.doesNotMatch(destinationHostSource, /from 'react-native-reanimated'/);
  assert.match(destinationHostSource, /pointerEvents="box-none"/);
  assert.doesNotMatch(destinationHostSource, /display: 'none'/);
  assert.match(destinationHostSource, /testID="sidebar-destination-host"/);
  assert.match(destinationHostSource, /SIDEBAR_HOST_DESTINATIONS\.map\(\(destination\) => \{/);
  assert.doesNotMatch(destinationHostSource, /useRouter|router\.(?:navigate|push|replace|dismissTo)/);
  assert.match(fastTabNavigatorSource, /export const FastTabs = Object\.assign/);
  assert.match(fastTabNavigatorSource, /const SceneLayer = memo/);
  assert.match(fastTabVisualSource, /export function showFastTabVisual\(pathOrName: string\)/);
  assert.match(fastTabVisualSource, /export function scheduleFastTabNavigation\(\s*revision: number,\s*action: \(\) => void,\s*settleDelayMs: number = FAST_TAB_NAVIGATION_SETTLE_DELAY_MS,\s*\)/);
  assert.match(deferredMountSource, /requestAnimationFrame/);
  assert.match(deferredMountSource, /export function DeferredRouteModule/);
  assert.match(deferredMountSource, /const ROUTE_MODULE_LOAD_DELAY_MS = 0/);
  assert.match(deferredMountSource, /const ROUTE_HEAVY_CONTENT_DELAY_MS = 1200/);
  assert.match(deferredMountSource, /export function useDeferredRouteContentReady/);
  assert.match(deferredMountSource, /active = true/);
  assert.match(deferredMountSource, /if \(!active \|\| ready\)/);
  assert.match(deferredMountSource, /scheduleDeferredFrameWork\(2/);
  assert.match(deferredMountSource, /const routeModuleCache = new Map<string, CachedRouteModule>\(\)/);
  assert.match(deferredMountSource, /export function preloadDeferredRouteModule/);
  assert.match(deferredMountSource, /preloadDeferredRouteModule\(cacheKey, load\)/);
  assert.match(deferredMountSource, /fallback = null/);
  assert.match(deferredMountSource, /mountDelayMs\?: number/);
  assert.match(deferredMountSource, /function useOptionalDeferredRouteMountReady\(delayMs: number \| undefined\)/);
  assert.match(deferredMountSource, /const mountReady = useOptionalDeferredRouteMountReady\(mountDelayMs\)/);
  assert.match(deferredMountSource, /if \(!RouteComponent \|\| !mountReady\) \{\s*return <>\{fallback\}<\/>;\s*\}/);
  assert.doesNotMatch(deferredMountSource, /DeferredRoutePlaceholder|placeholderTitle|title\?: string/);
  assert.match(journalRouteSource, /import \{ JournalScreen \} from '..\/..\/src\/features\/settings\/JournalScreen'/);
  assert.match(journalRouteSource, /return <JournalScreen \/>/);
  assert.doesNotMatch(journalRouteSource, /DeferredRouteModule|JournalRouteFallback|loadJournalScreenRoute/);
  assert.match(accountsRouteSource, /DeferredRouteModule/);
  // The route and the startup warmup must share the SAME cache key + loader
  // (accountsScreenPreload.ts) so the warmed module is the one the route
  // mounts synchronously — a literal key here could silently drift.
  assert.match(accountsRouteSource, /cacheKey=\{ACCOUNTS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(accountsRouteSource, /load=\{loadAccountsScreenRoute\}/);
  assert.match(accountsRouteSource, /from '\.\.\/\.\.\/src\/features\/settings\/accountsScreenPreload'/);
  assert.match(accountsRouteSource, /mountDelayMs=\{SETTINGS_ROUTE_MOUNT_DELAY_MS\}/);
  assert.match(accountsRouteSource, /SettingsRouteLaunchPreview/);
  assert.match(actionWarmupSource, /ACTION_DEFERRED_MODULE_WARMUPS/);
  assert.match(actionWarmupSource, /preloadDeferredRouteModule\(module\.cacheKey, module\.load\)/);
  // "Manage accounts" (sidebar) and the Settings row both land on
  // /settings/accounts; its heavy module must be in the startup idle warmup
  // so the first open mounts the real screen instead of the launch preview.
  assert.match(actionWarmupSource, /\{ cacheKey: ACCOUNTS_ROUTE_MODULE_CACHE_KEY, load: loadAccountsScreenRoute \}/);
  for (const file of immediateSidebarRouteFiles) {
    const routeSource = readSource(file);
    assert.doesNotMatch(routeSource, /DeferredRouteModule|SettingsRouteLaunchPreview|SETTINGS_ROUTE_MOUNT_DELAY_MS|const load[A-Za-z0-9]+ScreenRoute = \(\) => import\('/);
    assert.match(routeSource, /import \{ [A-Za-z0-9]+Screen \} from '..\/..\/src\/features\/settings\//);
    assert.match(routeSource, /return <[A-Za-z0-9]+Screen \/>/);
  }
});

test('sidebar detail screens paint their real header before mounting heavy lower content', () => {
  const destinationFiles = [
    'src/features/settings/JournalScreen/JournalScreen.tsx',
    'src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx',
    'src/features/settings/UserGuideScreen.tsx',
    'src/features/settings/HelpScreen.tsx',
    'src/features/settings/AboutScreen.tsx',
  ];

  for (const file of destinationFiles) {
    const source = readSource(file);
    const headerIndex = source.indexOf('accessibilityLabel="Open menu"');
    const bodyGateIndex = source.indexOf('routeBodyReady ?');

    assert.match(source, /import \{ useDeferredRouteContentReady \} from/);
    assert.match(source, /const isScreenFocused = useIsFocused\(\)/);
    assert.match(source, /const routeBodyReady = useDeferredRouteContentReady\(0, isScreenFocused\)/);
    assert.notEqual(headerIndex, -1, `${file} must render its real menu header`);
    assert.notEqual(bodyGateIndex, -1, `${file} must defer only its lower body`);
    assert.ok(headerIndex < bodyGateIndex, `${file} must paint the header before heavy body content`);
    assert.doesNotMatch(source, /routeBodyReady \?[^:]+:\s*<SettingsRouteLaunchPreview/);
  }
});
