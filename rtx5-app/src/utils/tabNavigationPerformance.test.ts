import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('bottom tab navigation keeps tabs hot and switches on press-in', () => {
  const source = readSource('app/(tabs)/_layout.tsx');

  assert.match(source, /const TAB_SWITCH_MAX_LATENCY_MS = 20/);
  assert.match(source, /const TAB_PRESS_GUARD_RESET_MS = 120/);
  assert.match(source, /function scheduleTabSwitchBudgetCheck\(startedAtMs: number\)/);
  assert.match(source, /const FastTabBarButton = memo/);
  assert.match(source, /onPressIn=\{handlePressIn\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.match(source, /detachInactiveScreens=\{false\}/);
  assert.match(source, /freezeOnBlur: false/);
  assert.match(source, /lazy: false/);
  assert.match(source, /animation: 'none'/);
  assert.doesNotMatch(source, /screenListeners=/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.doesNotMatch(source, /freezeOnBlur: true/);
});

test('bottom tab navigation has a strict one-frame latency budget', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const budgetMatch = source.match(/const TAB_SWITCH_MAX_LATENCY_MS = (\d+)/);

  assert.ok(budgetMatch, 'tab switch budget constant is missing');
  assert.ok(Number(budgetMatch[1]) <= 20, 'tab switch budget must stay at or below 20ms');
  assert.match(source, /scheduleTabSwitchBudgetCheck\(startedAtMs\)/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /setTimeout\(clearHandledFlag, TAB_PRESS_GUARD_RESET_MS\)/);
  assert.doesNotMatch(source, /InteractionManager/);
  assert.doesNotMatch(source, /transitionSpec/);
});

test('bottom tab navigation fast path preserves light and dark tab bar themes', () => {
  const source = readSource('app/(tabs)/_layout.tsx');

  assert.match(source, /const isDark = useUserPreferences\(\(s\) => s\.themeMode\) === 'dark'/);
  assert.match(source, /backgroundColor: isDark \? '#040609' : '#ffffff'/);
  assert.match(source, /borderTopColor: isDark \? '#131722' : 'rgba\(0,0,0,0\.05\)'/);
  assert.match(source, /tabBarActiveTintColor: T\.accent/);
  assert.match(source, /tabBarInactiveTintColor: isDark \? '#5A6B87' : T\.textDimmed/);
  assert.match(source, /\[insets\.bottom, isDark, tabBarHeight\]/);
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
