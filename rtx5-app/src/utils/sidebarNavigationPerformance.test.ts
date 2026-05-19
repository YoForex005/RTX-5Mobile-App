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
  assert.match(source, /const HEADER_SIDE_SLOT_WIDTH = 144/);
  assert.match(source, /const ANDROID_EDGE_GESTURE_SAFE_PAD = 36/);
  assert.match(source, /width: HEADER_SIDE_SLOT_WIDTH/);
  assert.match(source, /paddingLeft: ANDROID_EDGE_GESTURE_SAFE_PAD/);
  assert.match(source, /paddingRight: 12/);
  assert.match(source, /onPress=\{handleOpenSidebar\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /hitSlop=\{MENU_BUTTON_HIT_SLOP\}/);
  assert.match(source, /minHeight: 44/);
  assert.match(source, /latencyLabel="appHeader\.menu"/);
  assert.doesNotMatch(source, /onPressIn=\{handleOpenSidebar\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});

test('sidebar drawer uses immediate non-blocking navigation for menu rows', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /const DRAWER_OPEN_ANIMATION_MS = 0/);
  assert.match(source, /const DRAWER_CLOSE_ANIMATION_MS = 65/);
  assert.match(source, /const SIDEBAR_NAVIGATION_LOCK_MS = 350/);
  assert.match(source, /const SIDEBAR_PREFETCH_DELAY_MS = 1500/);
  assert.match(source, /const LOGGED_OUT_PREFETCH_ROUTES = \['\/login'\] as const/);
  assert.match(source, /const AUTH_STACK_ROUTES = new Set<string>\(LOGGED_OUT_PREFETCH_ROUTES\)/);
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
  assert.match(source, /const PREFETCH_ROUTES = \[/);
  assert.match(source, /if \(!visible\) \{\s*return;\s*\}/);
  assert.match(source, /}, SIDEBAR_PREFETCH_DELAY_MS\)/);
  assert.match(source, /scheduleNextFrame\(prefetchSidebarRoutes\)/);
  assert.match(source, /try \{\s*prefetch\(route\);/);
  assert.match(source, /if \(isLoggedIn\) \{\s*return;\s*\}/);
  assert.match(source, /for \(const route of LOGGED_OUT_PREFETCH_ROUTES\)/);
  assert.doesNotMatch(source, /scheduleNextFrame\(afterClose\)/);
  assert.match(source, /keyboardShouldPersistTaps="always"/);
  assert.match(source, /canCancelContentTouches=\{false\}/);
  assert.match(source, /const navigateSidebarRoute = useCallback/);
  assert.match(source, /navigationLockedRef\.current = true/);
  assert.match(source, /closeImmediately\(\)/);
  assert.match(source, /scheduleNextFrame\(\(\) => \{/);
  assert.match(source, /normalizeSidebarPath\(route\)/);
  assert.match(source, /AUTH_STACK_ROUTES\.has\(route\)/);
  assert.match(source, /router\.push\(route as any\)/);
  assert.match(source, /router\.navigate\(route as any\)/);
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

  assert.match(source, /label: 'Trade'.*route: '\/\(tabs\)\/trade'/);
  assert.match(source, /label: 'News'.*route: '\/settings\/news'/);
  assert.match(source, /label: 'Mailbox'.*route: '\/settings\/mailbox'/);
  assert.match(source, /label: 'Journal'.*route: '\/settings\/journal'/);
  assert.match(source, /label: 'Settings'.*route: '\/\(tabs\)\/settings'/);
  assert.match(source, /label: 'Economic Calendar'.*route: '\/settings\/economic-calendar'/);
  assert.match(source, /label: 'Traders Community'.*route: '\/settings\/traders-community'/);
  assert.match(source, /label: 'MQL5 Algo Trading'.*route: '\/settings\/mql5-algo-trading'/);
  assert.match(source, /label: 'User Guide'.*route: '\/settings\/user-guide'/);
  assert.match(source, /label: 'About'.*route: '\/settings\/about'/);
  assert.match(source, /'\/settings\/accounts'/);
  assert.match(source, /'\/login'/);
});
