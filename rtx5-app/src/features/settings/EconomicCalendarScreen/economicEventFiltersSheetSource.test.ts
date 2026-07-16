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

test('Economic Calendar filter sheet opens instantly without shrink animation', () => {
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
  // Full-window Modal; sheet surface never inherits backdrop opacity.
  assert.match(sheet, /<Modal[\s\S]*visible=\{visible\}[\s\S]*transparent[\s\S]*animationType="none"/);
  assert.match(sheet, /OVERLAY_MODAL_PROPS/);
  assert.match(sheet, /backdropColor = isDark \? 'rgba\(0,0,0,0\.72\)' : 'rgba\(0,0,0,0\.3\)'/);
  assert.doesNotMatch(sheet, /rgba\(0,0,0,0\.6\)/);
  // Instant open like chart 3-dot ActionSheet — no park/slide animation APIs.
  assert.match(sheet, /setVisible\(true\)/);
  assert.doesNotMatch(sheet, /from 'react-native'[\s\S]*Animated|sheetTranslateY|backdropOpacity|EVENT_FILTER_FALLBACK_TRANSLATE_Y/);
  assert.doesNotMatch(sheet, /EVENT_FILTER_OPEN_BACKDROP_MS|EVENT_FILTER_OPEN_SHEET_MS|Animated\.parallel|Animated\.timing/);
  assert.doesNotMatch(sheet, /useNativeDriver: true|useLayoutEffect|transform: \[\{ translateY/);
  assert.match(sheet, /collapsable=\{false\}[\s\S]*style=\{styles\.modalCard\}/);
  assert.match(
    sheet,
    /const handleApply = useCallback[\s\S]*const nextImpacts = new Set\(draftImpacts\);[\s\S]*hideNow\(\);[\s\S]*onApply\(nextImpacts\)/,
  );
  assert.match(styles, /modalOverlay: \{[\s\S]*flex: 1[\s\S]*alignItems: 'stretch'[\s\S]*overflow: 'hidden'/);
  assert.match(styles, /modalCard: \{[\s\S]*width: '100%'[\s\S]*alignSelf: 'stretch'/);
  assert.match(styles, /elevation: 0/);
  assert.doesNotMatch(styles, /maxWidth: 480/);
});
