import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('Economic Calendar opens its retained filter sheet without rebuilding the calendar screen', () => {
  const screen = readSource(
    'src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx',
  );

  assert.doesNotMatch(screen, /filterModalOpen|setFilterModalOpen/);
  assert.match(screen, /useRef<EconomicEventFiltersSheetHandle>\(null\)/);
  assert.match(
    screen,
    /const openEventFilters = useCallback[\s\S]*runImmediateAction\('economicCalendar\.filters\.open'[\s\S]*eventFiltersSheetRef\.current\?\.open\(\)/,
  );
  assert.match(
    screen,
    /onPress=\{openEventFilters\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}/,
  );
  assert.match(
    screen,
    /<EconomicEventFiltersSheet[\s\S]*ref=\{eventFiltersSheetRef\}[\s\S]*selectedImpacts=\{selectedImpacts\}[\s\S]*onApply=\{applyEventFilters\}/,
  );
  assert.match(
    screen,
    /const applyEventFilters = useCallback[\s\S]*React\.startTransition[\s\S]*setSelectedImpacts\(nextImpacts\)/,
  );
});

test('Economic Calendar filter sheet uses a retained smooth UI-thread entrance', () => {
  const sheet = readSource(
    'src/features/settings/EconomicCalendarScreen/EconomicEventFiltersSheet.tsx',
  );
  const styles = readSource(
    'src/features/settings/EconomicCalendarScreen/styles.ts',
  );

  assert.match(sheet, /React\.memo\(React\.forwardRef/);
  assert.match(sheet, /const \[visible, setVisible\] = useState\(false\)/);
  assert.match(sheet, /const \[draftImpacts, setDraftImpacts\] = useState/);
  assert.match(sheet, /useImperativeHandle\(ref, \(\) => \(\{ open, close: hideNow \}\)/);
  // The native Modal window was the source of the cold-first-open compositor
  // hitch and system-bar geometry jump. Keep this host retained in-tree.
  assert.doesNotMatch(sheet, /<Modal|OVERLAY_MODAL_PROPS|navigationBarTranslucent/);
  assert.match(
    sheet,
    /pointerEvents=\{visible \? 'box-none' : 'none'\}[\s\S]*styles\.filterSheetHost[\s\S]*visible \? null : styles\.filterSheetHostHidden/,
    'Economic Calendar filter host must remain mounted behind a React visibility barrier',
  );
  assert.match(sheet, /backdropColor = isDark \? 'rgba\(0,0,0,0\.72\)' : 'rgba\(0,0,0,0\.3\)'/);
  assert.doesNotMatch(sheet, /rgba\(0,0,0,0\.6\)/);
  assert.match(
    sheet,
    /AccessibilityInfo,[\s\S]*Animated,[\s\S]*Easing,[\s\S]*from 'react-native'/,
  );
  assert.doesNotMatch(sheet, /react-native-reanimated|Reanimated\.View/);
  assert.match(
    sheet,
    /EVENT_FILTER_OPEN_BACKDROP_MS = 170[\s\S]*EVENT_FILTER_OPEN_SHEET_MS = 195[\s\S]*EVENT_FILTER_CLOSE_MS = 150/,
  );
  assert.match(
    sheet,
    /Animated\.parallel\(\[[\s\S]*Animated\.timing\(backdropOpacity, \{[\s\S]*toValue: 1[\s\S]*Easing\.out\(Easing\.cubic\)[\s\S]*Animated\.timing\(sheetTranslateY, \{[\s\S]*toValue: 0[\s\S]*Easing\.out\(Easing\.cubic\)/,
  );
  assert.match(sheet, /useNativeDriver: true/);
  assert.match(sheet, /useLayoutEffect\(\(\) => \{[\s\S]*startEventFilterOpenAnimation/);
  assert.match(sheet, /AccessibilityInfo\.isReduceMotionEnabled\(\)[\s\S]*'reduceMotionChanged'/);
  assert.match(sheet, /<Animated\.View[\s\S]*\{ opacity: backdropOpacity \}/);
  assert.match(sheet, /<Animated\.View[\s\S]*styles\.modalCard[\s\S]*transform: \[\{ translateY: sheetTranslateY \}\]/);
  assert.doesNotMatch(sheet, /scale:|scaleY:|opacity: sheetOpacity/);
  assert.match(
    sheet,
    /const handleApply = useCallback[\s\S]*const nextImpacts = new Set\(draftImpacts\);[\s\S]*hideNow\(\);[\s\S]*onApply\(nextImpacts\)/,
  );
  assert.match(styles, /filterSheetHost: \{[\s\S]*\.\.\.StyleSheet\.absoluteFillObject[\s\S]*zIndex: 10000/);
  assert.match(styles, /filterSheetHostHidden: \{[\s\S]*opacity: 0/);
  assert.match(styles, /modalOverlay: \{[\s\S]*flex: 1[\s\S]*alignItems: 'stretch'[\s\S]*overflow: 'hidden'/);
  assert.match(styles, /modalCard: \{[\s\S]*width: '100%'[\s\S]*alignSelf: 'stretch'/);
  assert.match(styles, /elevation: 0/);
  assert.doesNotMatch(styles, /maxWidth: 480/);
});
