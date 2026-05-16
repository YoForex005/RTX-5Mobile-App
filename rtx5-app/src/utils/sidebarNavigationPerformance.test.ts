import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('hamburger opens the sidebar on the zero-delay press-in path', () => {
  const source = readSource('src/ui/components/AppHeader.tsx');

  assert.match(source, /const handleOpenSidebar = useCallback/);
  assert.match(source, /setSidebarOpen\(true\)/);
  assert.match(source, /onPress=\{handleOpenSidebar\}/);
  assert.match(source, /latencyLabel="appHeader\.menu"/);
  assert.doesNotMatch(source, /onPressIn=\{handleOpenSidebar\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});

test('sidebar drawer uses immediate non-blocking navigation for menu rows', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /const DRAWER_OPEN_ANIMATION_MS = 0/);
  assert.match(source, /const DRAWER_CLOSE_ANIMATION_MS = 65/);
  assert.match(source, /useLayoutEffect\(\(\) => \{/);
  assert.match(source, /slideAnim\.setValue\(0\)/);
  assert.match(source, /overlayAnim\.setValue\(1\)/);
  assert.match(source, /pointerEvents=\{visible \? 'auto' : 'none'\}/);
  assert.match(source, /containerHidden:/);
  assert.doesNotMatch(source, /if \(!visible\) \{\s*return null;\s*\}/);
  assert.match(source, /const PREFETCH_ROUTES = \[/);
  assert.match(source, /scheduleNextFrame\(prefetchSidebarRoutes\)/);
  assert.match(source, /afterClose\(\)/);
  assert.doesNotMatch(source, /scheduleNextFrame\(afterClose\)/);
  assert.match(source, /onPress=\{\(\) => handleMenuItemPress\(item\)\}/);
  assert.match(source, /latencyLabel=\{`sidebar\.menu\.\$\{item\.label\}`\}/);
  assert.doesNotMatch(source, /runInstantSidebarAction/);
  assert.doesNotMatch(source, /runSidebarPressFallback/);
  assert.doesNotMatch(source, /handleSidebarPressOut/);
  assert.doesNotMatch(source, /SIDEBAR_PRESS_GUARD_MS/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});

test('sidebar keeps the main option routes warm and available', () => {
  const source = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(source, /label: 'Trade'.*route: '\/\(tabs\)\/trade'/);
  assert.match(source, /label: 'News'.*route: '\/settings\/news'/);
  assert.match(source, /label: 'User Guide'.*route: '\/settings\/user-guide'/);
  assert.match(source, /label: 'About'.*route: '\/settings\/about'/);
  assert.match(source, /'\/settings\/accounts'/);
  assert.match(source, /'\/login'/);
});
