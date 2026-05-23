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

test('sidebar drawer uses immediate non-blocking navigation for menu rows', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /const DRAWER_OPEN_ANIMATION_MS = 0/);
  assert.match(source, /const DRAWER_CLOSE_ANIMATION_MS = 65/);
  assert.match(source, /const SIDEBAR_NAVIGATION_LOCK_MS = 120/);
  assert.match(source, /const SIDEBAR_PROFILE_DATA_DELAY_MS = 1000/);
  assert.match(source, /const \[profileDataReady, setProfileDataReady\] = useState\(false\)/);
  assert.match(source, /const sidebarProfileDataActive = profileDataReady && isLoggedIn/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*scheduleNextFrame\(\(\) => \{[\s\S]*setProfileDataReady\(true\)[\s\S]*SIDEBAR_PROFILE_DATA_DELAY_MS/);
  assert.match(source, /const LOGGED_OUT_PREFETCH_ROUTES = \['\/login'\] as const/);
  assert.match(source, /const SIDEBAR_STACK_ROUTES = new Set<string>\(LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.match(source, /useLayoutEffect\(\(\) => \{/);
  assert.match(source, /slideAnim\.setValue\(0\)/);
  assert.match(source, /overlayAnim\.setValue\(1\)/);
  assert.match(source, /pointerEvents=\{visible \? 'auto' : 'none'\}/);
  assert.match(source, /containerHidden:/);
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /closeImmediately\(\);\s*return true;/);
  assert.match(source, /pointerEvents="box-none"[\s\S]*style=\{\[[\s\S]*ds\.overlay/);
  assert.match(source, /overlay: \{[\s\S]*left: DRAWER_WIDTH,[\s\S]*zIndex: 0,[\s\S]*elevation: 0,/);
  assert.doesNotMatch(source, /overlay: \{\s*\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(source, /drawer: \{[\s\S]*zIndex: 1,[\s\S]*elevation: 1,/);
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
  assert.match(source, /function scheduleAfterFirstVisualFrame\(action: \(\) => void\)/);
  assert.match(source, /scheduleNextFrame\(\(\) => \{\s*setTimeout\(action, 0\);/);
  assert.match(source, /showSidebarRouteTransition\(\{ route, label \}\)/);
  assert.match(source, /scheduleAfterFirstVisualFrame\(\(\) => \{/);
  assert.match(source, /SIDEBAR_STACK_ROUTES\.has\(route\)/);
  assert.match(source, /router\.push\(route as any\)/);
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
  assert.match(source, /onPress=\{\(\) => navigateSidebarRoute\('\/login', 'Login'\)\}/);
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
  const moduleWarmupSource = readSource('src/utils/sidebarRouteModuleWarmup.ts');
  const overlaySource = readSource('src/ui/components/SidebarRouteTransitionOverlay.tsx');
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
  assert.match(tabsLayoutSource, /import \{ warmSidebarRouteModules \} from '..\/..\/src\/utils\/sidebarRouteModuleWarmup'/);
  assert.match(tabsLayoutSource, /useEffect\(\(\) => warmSidebarRouteModules\(\), \[\]\)/);
  assert.match(tabsLayoutSource, /import \{ SidebarRouteTransitionOverlay \} from '..\/..\/src\/ui\/components\/SidebarRouteTransitionOverlay'/);
  assert.match(tabsLayoutSource, /<SidebarRouteTransitionOverlay \/>[\s\S]*<SidebarDrawer \/>/);
  assert.match(overlaySource, /const SIDEBAR_ROUTE_TRANSITION_MAX_MS = 2500/);
  assert.match(overlaySource, /normalizeSidebarTransitionPath/);
  assert.match(overlaySource, /sidebarRouteTransition/);
  assert.match(overlaySource, /clearSidebarRouteTransition/);
  assert.match(overlaySource, /pointerEvents="none"/);
  assert.match(overlaySource, /\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(overlaySource, /zIndex: 9998/);
  assert.match(overlaySource, /\{transition\.label\}/);
  assert.match(deferredMountSource, /requestAnimationFrame/);
  assert.match(deferredMountSource, /export function DeferredRouteModule/);
  assert.match(deferredMountSource, /const ROUTE_MODULE_LOAD_DELAY_MS = 120/);
  assert.match(deferredMountSource, /load\(\)\.then\(\(Component\) => \{/);
  assert.match(deferredMountSource, /<DeferredRoutePlaceholder title=\{title\} \/>/);
  assert.match(deferredMountSource, /<View style=\{\[styles\.placeholder, \{ backgroundColor: T\.bg \}\]\}>/);
  assert.match(deferredMountSource, /placeholderTitle/);
  assert.match(moduleWarmupSource, /const SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS = 6000/);
  assert.match(moduleWarmupSource, /const SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS = 500/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/trade\/TradeScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/SettingsScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/NewsScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/MailboxScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/JournalScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/EconomicCalendarScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/TradersCommunityScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/Mql5AlgoTradingScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/UserGuideScreen'\)/);
  assert.match(moduleWarmupSource, /import\('\.\.\/features\/settings\/AboutScreen'\)/);
  for (const file of deferredRouteFiles) {
    const routeSource = readSource(file);
    assert.match(routeSource, /import \{ DeferredRouteModule \} from '..\/..\/src\/ui\/components\/DeferredRouteMount'/);
    assert.match(routeSource, /const load[A-Za-z0-9]+Screen = \(\) => import\('/);
    assert.match(routeSource, /<DeferredRouteModule load=\{load[A-Za-z0-9]+Screen\} title="/);
  }
});
