import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('hamburger opens the sidebar on the zero-delay stable press path', () => {
  const source = readSource('src/ui/components/AppHeader.tsx');

  assert.match(source, /const handleOpenSidebar = useCallback/);
  assert.match(source, /const hideActionSheet = useUIState\(\(s\) => s\.hideActionSheet\)/);
  assert.match(source, /hideActionSheet\(\);\s*setSidebarOpen\(true\)/);
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
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /hitSlop=\{MENU_BUTTON_HIT_SLOP\}/);
  assert.match(source, /minHeight: 44/);
  assert.match(source, /latencyLabel="appHeader\.menu"/);
  assert.doesNotMatch(source, /onPressIn=\{handleOpenSidebar\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.doesNotMatch(source, /ANDROID_EDGE_GESTURE_SAFE_PAD/);
});

test('sidebar drawer uses native-driver motion and non-blocking navigation for menu rows', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /const DRAWER_OPEN_ANIMATION_MS = 50/);
  assert.match(source, /const DRAWER_CLOSE_ANIMATION_MS = 50/);
  assert.match(source, /const SIDEBAR_NAVIGATION_LOCK_MS = 50/);
  assert.match(source, /import \{ useDeferredActiveFlag \} from '..\/..\/hooks\/useDeferredActiveFlag'/);
  assert.match(source, /const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200/);
  assert.match(source, /const sidebarProfileDataActive = useDeferredActiveFlag\(visible && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS\)/);
  assert.doesNotMatch(source, /profileDataReady/);
  assert.match(source, /const LOGGED_OUT_PREFETCH_ROUTES = \['\/login'\] as const/);
  assert.match(source, /const SIDEBAR_STACK_ROUTES = new Set<string>\(LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.match(source, /const SIDEBAR_REPLACE_ROUTE_PREFIXES = \['\/settings\/'\] as const/);
  assert.match(source, /function shouldReplaceSidebarRoute\(route: string\)/);
  assert.match(source, /useLayoutEffect\(\(\) => \{/);
  assert.match(source, /Animated\.parallel\(\[/);
  assert.match(source, /toValue: 0,[\s\S]*duration: DRAWER_OPEN_ANIMATION_MS,[\s\S]*useNativeDriver: true/);
  assert.match(source, /toValue: 1,[\s\S]*duration: DRAWER_OPEN_ANIMATION_MS,[\s\S]*useNativeDriver: true/);
  assert.match(source, /toValue: -DRAWER_WIDTH,[\s\S]*duration: DRAWER_CLOSE_ANIMATION_MS,[\s\S]*useNativeDriver: true/);
  assert.match(source, /Easing\.out\(Easing\.cubic\)/);
  assert.match(source, /pointerEvents=\{visible \? 'auto' : 'none'\}/);
  assert.match(source, /containerHidden:/);
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /closeImmediately\(\);\s*return true;/);
  assert.match(source, /pointerEvents="box-none"[\s\S]*style=\{\[[\s\S]*ds\.overlay/);
  assert.match(source, /overlay: \{[\s\S]*left: DRAWER_WIDTH,[\s\S]*zIndex: 0,[\s\S]*elevation: 0,/);
  assert.doesNotMatch(source, /overlay: \{\s*\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(source, /drawer: \{[\s\S]*zIndex: 1,[\s\S]*elevation: 1,/);
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
  assert.match(source, /canCancelContentTouches=\{false\}/);
  assert.match(source, /const navigateSidebarRoute = useCallback/);
  assert.match(source, /navigationLockedRef\.current = true/);
  assert.doesNotMatch(source, /clearSidebarPrefetchTimer/);
  assert.match(source, /closeImmediately\(\)/);
  assert.match(source, /normalizeSidebarPath\(route\)/);
  assert.doesNotMatch(source, /scheduleAfterFirstVisualFrame/);
  assert.doesNotMatch(source, /showSidebarRouteTransition/);
  assert.match(source, /SIDEBAR_STACK_ROUTES\.has\(route\)/);
  assert.match(source, /router\.push\(route as any\)/);
  assert.match(source, /shouldReplaceSidebarRoute\(route\)/);
  assert.match(source, /router\.replace\(route as any\)/);
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

test('sidebar detail back buttons do not walk through old sidebar history', () => {
  const directBackFiles = [
    'src/features/settings/AccountsScreen.tsx',
    'src/features/settings/NewsScreen.tsx',
    'src/features/settings/MailboxScreen.tsx',
    'src/features/settings/JournalScreen/JournalScreen.tsx',
    'src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx',
    'src/features/settings/InterfaceScreen.tsx',
    'src/features/settings/TradersCommunityScreen.tsx',
    'src/features/settings/Mql5AlgoTradingScreen.tsx',
    'src/features/settings/SettingsBackBar.tsx',
  ];

  for (const file of directBackFiles) {
    const source = readSource(file);
    assert.match(source, /router\.replace\('\/\(tabs\)\/settings'\)/, `${file} should replace to the settings tab`);
    assert.doesNotMatch(source, /safeRouterBack\(router, '\/\(tabs\)\/settings'\)/, `${file} should not replay stack history`);
  }
});

test('chart header menu avoids Android edge gesture interception', () => {
  const source = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(source, /MENU_BUTTON_VISUAL_LEFT/);
  assert.match(source, /width: MENU_BTN_GUTTER/);
  assert.match(source, /alignItems: 'flex-start'/);
  assert.match(source, /paddingLeft: MENU_BUTTON_VISUAL_LEFT/);
  assert.doesNotMatch(source, /CHART_HEADER_EDGE_GESTURE_SAFE_PAD/);
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

test('sidebar keeps the main option routes warm and available', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');
  const deferredMountSource = readSource('src/ui/components/DeferredRouteMount.tsx');
  const deferredRouteFiles = [
    'app/settings/accounts.tsx',
    'app/settings/news.tsx',
    'app/settings/mailbox.tsx',
    'app/settings/journal.tsx',
    'app/settings/economic-calendar.tsx',
    'app/settings/traders-community.tsx',
    'app/settings/mql5-algo-trading.tsx',
    'app/settings/user-guide.tsx',
    'app/settings/about.tsx',
  ];

  assert.match(source, /label: 'Trade'.*route: '\/trade'/);
  assert.match(source, /label: 'News'.*route: '\/settings\/news'/);
  assert.match(source, /label: 'Mailbox'.*route: '\/settings\/mailbox'/);
  assert.match(source, /label: 'Journal'.*route: '\/settings\/journal'/);
  assert.match(source, /label: 'Settings'.*route: '\/settings'/);
  assert.match(source, /label: 'Economic Calendar'.*route: '\/settings\/economic-calendar'/);
  assert.match(source, /label: 'Traders Community'.*route: '\/settings\/traders-community'/);
  assert.match(source, /label: 'MQL5 Algo Trading'.*route: '\/settings\/mql5-algo-trading'/);
  assert.match(source, /label: 'User Guide'.*route: '\/settings\/user-guide'/);
  assert.match(source, /label: 'About'.*route: '\/settings\/about'/);
  assert.match(source, /'\/settings\/accounts'/);
  assert.match(source, /'\/login'/);
  assert.match(rootLayoutSource, /const sidebarDetailScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none'/);
  assert.match(rootLayoutSource, /name='settings\/news' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/mailbox' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/journal' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/economic-calendar' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/traders-community' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/mql5-algo-trading' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/user-guide' options=\{sidebarDetailScreenOptions\}/);
  assert.match(rootLayoutSource, /name='settings\/about' options=\{sidebarDetailScreenOptions\}/);
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
  assert.match(deferredMountSource, /if \(!RouteComponent\) \{\s*return null;\s*\}/);
  assert.doesNotMatch(deferredMountSource, /DeferredRoutePlaceholder|placeholderTitle|title\?: string/);
  for (const file of deferredRouteFiles) {
    const routeSource = readSource(file);
    assert.doesNotMatch(routeSource, /DeferredRouteModule|const load[A-Za-z0-9]+Screen = \(\) => import\('/);
    assert.match(routeSource, /import \{ [A-Za-z0-9]+Screen \} from '..\/..\/src\/features\/settings\//);
    assert.match(routeSource, /<[A-Za-z0-9]+Screen \/>/);
    assert.doesNotMatch(routeSource, /title="/);
  }
});
