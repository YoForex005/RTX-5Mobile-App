import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('bottom tab navigation keeps primary tabs hot for immediate switching', () => {
  const source = readSource('app/(tabs)/_layout.tsx');

  assert.match(source, /import \{ PlatformPressable \} from '@react-navigation\/elements'/);
  assert.match(source, /const TAB_SWITCH_MAX_LATENCY_MS = 20/);
  assert.match(source, /const STALE_TAB_SWITCH_SAMPLE_MS = 5000/);
  assert.match(source, /function scheduleTabSwitchBudgetCheck\(label: string, startedAtMs: number, navigationFinishedAtMs: number\)/);
  assert.match(source, /type FastTabBarButtonProps = BottomTabBarButtonProps & \{/);
  assert.match(source, /const FastTabBarButton = memo/);
  assert.match(source, /const pressStartedAtRef = useRef<number \| null>\(null\)/);
  assert.match(source, /const handledOnPressInRef = useRef\(false\)/);
  assert.match(source, /latencyLabel = 'bottom tab'/);
  assert.match(source, /const handleTouchStart = useCallback/);
  assert.match(source, /onTouchStart=\{handleTouchStart\}/);
  assert.match(source, /const handlePressIn = useCallback/);
  assert.match(source, /pressStartedAtRef\.current = getNow\(\)/);
  assert.match(source, /handledOnPressInRef\.current = true/);
  assert.match(source, /runTabPress\(event as unknown as TabPressEvent\)/);
  assert.match(source, /const startedAtMs = pressStartedAtRef\.current \?\? getNow\(\)/);
  assert.match(source, /useUIState\.getState\(\)\.hideActionSheet\(\)/);
  assert.match(source, /onPress\?\.\(event as TabPressEvent\)/);
  assert.match(source, /scheduleTabSwitchBudgetCheck\(latencyLabel, startedAtMs, getNow\(\)\)/);
  assert.match(source, /onPressIn=\{handlePressIn\}/);
  assert.match(source, /onPress=\{handlePress\}/);
  assert.match(source, /onPressOut=\{handlePressOut\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.match(source, /tabBarButton: \(props\) => <FastTabBarButton \{\.\.\.props\} latencyLabel=\{route\.name\} \/>/);
  assert.match(source, /if \(handledOnPressInRef\.current\) \{/);
  assert.doesNotMatch(source, /runTabPress\(event\);\s*\}, \[onPress, onPressIn, runTabPress\]\)/);
  assert.match(source, /detachInactiveScreens=\{false\}/);
  assert.match(source, /freezeOnBlur: false/);
  assert.match(source, /lazy: false/);
  assert.match(source, /name='chart'[\s\S]*lazy: false/);
  assert.match(source, /animation: 'none'/);
  assert.match(source, /previousPathRef/);
  assert.match(source, /const GlobalActionSheetHost = memo/);
  assert.match(source, /<GlobalActionSheetHost \/>/);
  assert.match(source, /previousPathRef\.current !== pathname && useUIState\.getState\(\)\.actionSheet !== null/);
  assert.match(source, /taps never wait on cold route construction/);
  assert.doesNotMatch(source, /screenListeners=/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.doesNotMatch(source, /freezeOnBlur: true/);
  assert.doesNotMatch(source, /lazy: true/);
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

  assert.match(source, /const isDark = useIsDarkTheme\(\)/);
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
