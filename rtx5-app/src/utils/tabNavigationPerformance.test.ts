import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('bottom tab navigation keeps primary tabs hot for immediate switching', () => {
  const source = readSource('app/(tabs)/_layout.tsx');
  const rootSource = readSource('app/_layout.tsx');

  assert.match(source, /import \{ PlatformPressable \} from '@react-navigation\/elements'/);
  assert.match(rootSource, /import \{ enableFreeze \} from 'react-native-screens'/);
  assert.match(rootSource, /enableFreeze\(true\)/);
  assert.match(source, /const TAB_SWITCH_MAX_LATENCY_MS = 20/);
  assert.match(source, /const STALE_TAB_SWITCH_SAMPLE_MS = 5000/);
  assert.match(source, /const tabPaths = \{/);
  assert.match(source, /type BottomTabName = keyof typeof tabPaths/);
  assert.match(source, /function resolveBottomTabName\(pathname: string\): BottomTabName/);
  assert.match(source, /function scheduleTabSwitchBudgetCheck\(label: string, startedAtMs: number, navigationFinishedAtMs: number\)/);
  assert.match(source, /type FastTabBarButtonProps = BottomTabBarButtonProps & \{/);
  assert.match(source, /onNavigateStart\?: \(\) => void/);
  assert.match(source, /const FastTabBarButton = memo/);
  assert.match(source, /const pressStartedAtRef = useRef<number \| null>\(null\)/);
  assert.match(source, /const primeTabNavigation = useCallback/);
  assert.match(source, /latencyLabel = 'bottom tab'/);
  assert.match(source, /onNavigateStart/);
  assert.match(source, /const handleTouchStart = useCallback/);
  assert.match(source, /primeTabNavigation\(\)/);
  assert.match(source, /const handlePressIn = useCallback/);
  assert.match(source, /pressStartedAtRef\.current = getNow\(\)/);
  assert.match(source, /pressStartedAtRef\.current = pressStartedAtRef\.current \?\? getNow\(\)/);
  assert.match(source, /onNavigateStart\?\.\(\)/);
  assert.match(source, /const startedAtMs = pressStartedAtRef\.current \?\? getNow\(\)/);
  assert.match(source, /useUIState\.getState\(\)\.hideActionSheet\(\)/);
  assert.match(source, /onPress\?\.\(event\)/);
  assert.match(source, /scheduleTabSwitchBudgetCheck\(latencyLabel, startedAtMs, getNow\(\)\)/);
  assert.match(source, /onTouchStart=\{handleTouchStart\}/);
  assert.match(source, /onPressIn=\{handlePressIn\}/);
  assert.match(source, /onPress=\{handlePress\}/);
  assert.match(source, /onPressOut=\{handlePressOut\}/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.match(source, /const optimisticTabClearTimerRef = useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(source, /const \[optimisticTabName, setOptimisticTabName\] = useState<BottomTabName \| null>\(null\)/);
  assert.match(source, /const activeTabName = useMemo\(\(\) => resolveBottomTabName\(pathname\), \[pathname\]\)/);
  assert.match(source, /const visualActiveTabName = optimisticTabName \?\? activeTabName/);
  assert.match(source, /const markTabNavigationStarted = useCallback/);
  assert.match(source, /setOptimisticTabName\(routeName\)/);
  assert.match(source, /setOptimisticTabName\(\(current\) => \(current === routeName \? null : current\)\)/);
  assert.match(source, /visualActiveTabName === tabName \? bottomTabActiveColor : inactiveTabColor/);
  assert.match(source, /tabBarLabel: \(\{ children \}\) => \{/);
  assert.match(source, /allowFontScaling=\{false\}/);
  assert.match(source, /numberOfLines=\{1\}/);
  assert.match(source, /tabBarButton: \(props\) => \(\s*<FastTabBarButton[\s\S]*onNavigateStart=\{\(\) => markTabNavigationStarted\(route\.name\)\}/);
  assert.doesNotMatch(source, /handledOnPressInRef/);
  assert.doesNotMatch(source, /runTabPress\(event as unknown as TabPressEvent\)/);
  assert.doesNotMatch(source, /handleTouchStart[\s\S]*onPress\?\.\(_event/);
  assert.doesNotMatch(source, /router\.navigate\(tabPaths\[routeName\]\)/);
  // Inactive screens must stay natively attached: the chart WebView only boots
  // while attached, and the background pre-warm depends on that. They must not
  // freeze, because full-bundle ADB checks showed freeze/thaw leaves old tab
  // content visible for about a second.
  assert.match(source, /detachInactiveScreens=\{false\}/);
  assert.match(source, /freezeOnBlur: false/);
  assert.match(source, /lazy: false/);
  assert.match(source, /name='chart'[\s\S]*lazy: false/);
  assert.match(source, /animation: 'none'/);
  assert.match(source, /previousPathRef/);
  assert.match(source, /const GlobalActionSheetHost = memo/);
  assert.match(source, /<GlobalActionSheetHost \/>/);
  assert.match(source, /if \(previousPathRef\.current !== pathname\) \{[\s\S]*const uiState = useUIState\.getState\(\)/);
  assert.match(source, /uiState\.actionSheet !== null \|\| visibleScopedActionSheet/);
  assert.match(source, /taps never wait on cold route construction/);
  assert.match(source, /route-gated inactive screens keep the active frame tree MT-style lean/);
  assert.match(source, /freeze\/thaw can leave old tab content visible for about a second/);
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

  assert.match(source, /import \{ useThemeMode \} from '\.\.\/\.\.\/src\/state\/themeMode'/);
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
