import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  resolveActionSheetBottomInset,
  resolveActionSheetFloor,
  resolveActionSheetInitialMeasuredHeight,
  resolveActionSheetMeasuredHeight,
  resolveActionSheetMt5EntryTranslateY,
  resolveActionSheetOpenMeasuredHeight,
} from './layout';

const readActionSheetSource = () =>
  readFileSync(resolve(process.cwd(), 'src/ui/components/ActionSheet/ActionSheet.tsx'), 'utf8');

test('instant action sheets start from the visible window height', () => {
  assert.equal(
    resolveActionSheetInitialMeasuredHeight({
      instantOpen: true,
      screenHeight: 1640,
      windowHeight: 1512,
    }),
    1512,
  );
});

test('MT5 open and close stay below the measured sheet instead of exposing a shrinking slice', () => {
  assert.equal(
    resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: 260,
      measuredSheetBodyHeight: 420,
    }),
    421,
  );
  assert.equal(
    resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: 520,
      measuredSheetBodyHeight: 420,
    }),
    520,
  );
  assert.equal(
    resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: 260,
      measuredSheetBodyHeight: 0,
    }),
    260,
  );
});

test('animated action sheets start from the visible window height to match overlay layout', () => {
  assert.equal(
    resolveActionSheetInitialMeasuredHeight({
      instantOpen: false,
      screenHeight: 1640,
      windowHeight: 900,
    }),
    900,
  );
});

test('android action sheets ignore transient oversized bottom safe-area values', () => {
  assert.equal(resolveActionSheetBottomInset(91, 'android'), 24);
  assert.equal(resolveActionSheetBottomInset(21, 'android'), 24);
  assert.equal(resolveActionSheetBottomInset(0, 'android'), 12);
});

test('ios action sheets preserve native bottom safe-area values', () => {
  assert.equal(resolveActionSheetBottomInset(34, 'ios'), 34);
  assert.equal(resolveActionSheetBottomInset(0, 'ios'), 12);
});

test('adaptive action sheets keep a stable minimum height instead of shrinking to short content', () => {
  assert.equal(
    resolveActionSheetFloor({
      detent: 'adaptive',
      searchable: false,
      availableWindowHeight: 1600,
    }),
    736,
  );
  assert.equal(
    resolveActionSheetFloor({
      detent: 'adaptive',
      searchable: false,
      availableWindowHeight: 680,
    }),
    420,
  );
});

test('large and searchable action sheet floors preserve their existing detents', () => {
  assert.equal(
    resolveActionSheetFloor({
      detent: 'large',
      searchable: true,
      availableWindowHeight: 1600,
    }),
    1408,
  );
  assert.equal(
    resolveActionSheetFloor({
      detent: 'adaptive',
      searchable: true,
      availableWindowHeight: 1600,
    }),
    864,
  );
  assert.equal(
    resolveActionSheetFloor({
      detent: 'auto',
      searchable: false,
      availableWindowHeight: 1600,
    }),
    0,
  );
});

test('instant action sheets do not reset downward on reopen', () => {
  assert.equal(
    resolveActionSheetOpenMeasuredHeight({
      previousHeight: 1640,
      instantOpen: true,
      screenHeight: 1640,
      windowHeight: 1512,
    }),
    1640,
  );
});

test('instant action sheet reopen height is capped to the current device height', () => {
  assert.equal(
    resolveActionSheetOpenMeasuredHeight({
      previousHeight: 1640,
      instantOpen: true,
      screenHeight: 720,
      windowHeight: 680,
    }),
    720,
  );
});

test('animated action sheets reset to the visible window height on open', () => {
  assert.equal(
    resolveActionSheetOpenMeasuredHeight({
      previousHeight: 1640,
      instantOpen: false,
      screenHeight: 1640,
      windowHeight: 900,
    }),
    900,
  );
});

test('initial action sheet height falls back to screen height when window height is unavailable', () => {
  assert.equal(
    resolveActionSheetInitialMeasuredHeight({
      instantOpen: false,
      screenHeight: 1784,
      windowHeight: 0,
    }),
    1784,
  );
});

test('instant action sheets keep the first visible height when overlay layout is shorter', () => {
  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1512,
      layoutHeight: 1420,
      instantOpen: true,
      hasMeasuredLayout: false,
    }),
    1512,
  );
});

test('animated action sheets do not shrink when the first overlay layout is shorter than the screen', () => {
  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1784,
      layoutHeight: 1640,
      instantOpen: false,
      hasMeasuredLayout: false,
    }),
    1784,
  );
});

test('after first layout action sheets only ratchet upward', () => {
  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1420,
      layoutHeight: 900,
      instantOpen: true,
      hasMeasuredLayout: true,
    }),
    1420,
  );

  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1420,
      layoutHeight: 1512,
      instantOpen: true,
      hasMeasuredLayout: true,
    }),
    1512,
  );
});

test('android instant sheets keep final-frame opening while MT5 sheets snap the whole host closed', () => {
  const source = readActionSheetSource();

  assert.match(
    source,
    /activeConfig\.instantOpen \?\? true/,
  );
  assert.match(
    source,
    /instant sheets start from the visible window/,
  );
  assert.match(
    source,
    /ACTION_SHEET_INSTANT_OPEN_OPACITY = 1/,
  );
  assert.match(
    source,
    /ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y = 0/,
  );
  assert.match(
    source,
    /if \(mode === 'instant'\) \{/,
  );
  assert.match(
    source,
    /if \(mode === 'instant'\) \{[\s\S]*overlayOpacity\.setValue\(ACTION_SHEET_INSTANT_OPEN_OPACITY\);[\s\S]*sheetTranslateY\.setValue\(ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y\);[\s\S]*return;/,
  );
  assert.match(
    source,
    /ACTION_SHEET_OPEN_OVERLAY_DURATION_MS = 50/,
  );
  assert.match(
    source,
    /ACTION_SHEET_OPEN_SHEET_DURATION_MS = 50/,
  );
  assert.match(source, /ACTION_SHEET_MT5_OPEN_OVERLAY_DURATION_MS = 180/);
  assert.match(source, /ACTION_SHEET_MT5_OPEN_SHEET_DURATION_MS = 210/);
  assert.doesNotMatch(source, /ACTION_SHEET_MT5_CLOSE_OVERLAY_DURATION_MS/);
  assert.doesNotMatch(source, /ACTION_SHEET_MT5_CLOSE_SHEET_DURATION_MS/);
  assert.match(source, /const isMt5Slide = mode === 'mt5Slide'/);
  assert.match(source, /sheetTranslateY\.setValue\(isMt5Slide \? mt5TranslateY : ACTION_SHEET_OPEN_TRANSLATE_Y\)/);
  assert.match(source, /activeConfig\.entryMotion \?\? \([\s\S]*activeInstantOpen \? 'instant' : 'standard'/);
  assert.match(source, /const resolveMt5EntryTranslateY = useCallback\([\s\S]*resolveActionSheetMt5EntryTranslateY\([\s\S]*measuredSheetBodyHeight: measuredSheetBodyHeightRef\.current/);
  assert.match(source, /const mt5EntryTranslateY = Math\.min\(\s*screenHeight,/);
  assert.match(source, /ref=\{sheetBodyRef\}[\s\S]*onLayout=\{handleSheetBodyLayout\}/);
  assert.match(source, /startActionSheetEntryAnimation\(\{[\s\S]*mode: activeEntryMotion,[\s\S]*mt5TranslateY: resolveMt5EntryTranslateY\(\)/);
  assert.match(source, /retainedMt5RevealInFlight/);
  assert.match(source, /retainedAdoptionVisualKeyRef\.current === activeVisualKey/);
  assert.match(source, /runEntryAnimation\(activeEntryMotion\)/);
  assert.match(
    source,
    /easing: Easing\.out\(Easing\.cubic\)/,
  );
  assert.match(
    source,
    /pointerEvents=\{visible \? 'auto' : 'none'\}/,
  );
  assert.match(source, /ref=\{overlayLayerRef\}[\s\S]*collapsable=\{false\}/);
  assert.match(source, /ref=\{sheetBodyRef\}[\s\S]*collapsable=\{false\}/);
  assert.match(source, /getRetainedActionSheetVisualSnapshot\(\)/);
  assert.match(source, /const reactVisibleRef = useRef\(visible\)/);
  assert.match(source, /if \(wantsVisible && reactVisibleRef\.current\) \{[\s\S]*return false;/);
  assert.match(source, /retainedSnapshot\.mode === 'committed'/);
  assert.match(source, /retainedSnapshot\.visualKey === activeVisualKey/);
  assert.match(source, /applyRetainedVisualSnapshot\(retainedSnapshot\)/);
  assert.match(
    source,
    /if \(!visible && !mounted\) \{/,
  );
  assert.match(source, /ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50/);
  assert.match(source, /const closeSheetTranslateY = instantOpen \? 80 : ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y/);
  assert.match(source, /toValue: closeSheetTranslateY/);
  assert.match(
    source,
    /const shouldSeedMt5EntryTransform\s*=\s*visible && visibilityChanged && activeEntryMotion === 'mt5Slide' && !retainedMt5RevealInFlight/,
  );
  assert.match(
    source,
    /if \(shouldSeedMt5EntryTransform\) \{[\s\S]*refreshHiddenConfig\(\(revision\) => revision \+ 1\)/,
  );
  assert.match(
    source,
    /const sheetBodyTranslateY = activeEntryMotion === 'instant'[\s\S]*shouldSeedMt5EntryTransform \? resolveMt5EntryTranslateY\(\) : sheetTranslateY/,
  );
  assert.match(source, /transform: \[\{ translateY: sheetBodyTranslateY \}\]/);
  assert.match(
    source,
    /const hideMt5ActionSheetHostNow = useCallback\(\(\) => \{[\s\S]*activeEntryMotion !== 'mt5Slide' && !activeImmediateHostHideOnClose[\s\S]*overlayLayerRef\.current\?\.setNativeProps\(\{[\s\S]*style: \{ opacity: 0 \}[\s\S]*accessibilityElementsHidden: true[\s\S]*importantForAccessibility: 'no-hide-descendants'[\s\S]*pointerEvents: 'none'[\s\S]*return true;/,
  );
  assert.match(
    source,
    /const hideMt5ActionSheetNow = useCallback\(\(\) => \{[\s\S]*hideMt5ActionSheetHostNow\(\)[\s\S]*cancelRetainedActionSheetPreview\(\);[\s\S]*retainedVisualOwnerRef\.current = null;[\s\S]*retainedAdoptionVisualKeyRef\.current = null;[\s\S]*overlayOpacity\.stopAnimation\(\);[\s\S]*sheetTranslateY\.stopAnimation\(\);[\s\S]*overlayOpacity\.setValue\(0\);[\s\S]*sheetTranslateY\.setValue\(resolveMt5EntryTranslateY\(\)\);[\s\S]*closeAnimationRunningRef\.current = false;[\s\S]*mt5DismissCompletedRef\.current = true;[\s\S]*sheetBodyRef\.current\?\.setNativeProps\(\{ pointerEvents: 'none' \}\);/,
  );
  assert.match(
    source,
    /const dismissActionSheet = useCallback\(\(\) => \{\s*hideMt5ActionSheetNow\(\);\s*onClose\(\);/,
  );
  assert.match(source, /const mt5DismissAlreadyCompleted = !visible && mt5DismissCompletedRef\.current/);
  assert.match(source, /handleBackdropPress[\s\S]*dismissActionSheet\(\)/);
  assert.match(
    source,
    /if \(activeEntryMotion === 'mt5Slide' \|\| activeImmediateHostHideOnClose\) \{[\s\S]*hideMt5ActionSheetNow\(\);[\s\S]*setKeyboardHeight\(0\);[\s\S]*hasMeasuredOverlayRef\.current = false;[\s\S]*return;[\s\S]*startActionSheetExitAnimation\(\{/,
  );
  assert.match(
    source,
    /if \(!activeRunActionAfterClose\) \{[\s\S]*pendingActionRef\.current = null;[\s\S]*hideMt5ActionSheetHostNow\(\);[\s\S]*try \{[\s\S]*actionPress\?\.\(\);[\s\S]*finally \{[\s\S]*hideMt5ActionSheetNow\(\);[\s\S]*onClose\(\);/,
  );
  assert.match(source, /const hostHiddenImperativelyRef = useRef\(false\)/);
  assert.match(
    source,
    /if \(visible\) \{[\s\S]*if \(hostHiddenImperativelyRef\.current\) \{[\s\S]*style: \{ opacity: 1 \}[\s\S]*pointerEvents: 'auto'[\s\S]*hostHiddenImperativelyRef\.current = false/,
  );
  assert.match(source, /style: \{ opacity: 0 \}[\s\S]*hostHiddenImperativelyRef\.current = true/);
  assert.match(source, /const estimatedVisibleActionRows = Math\.max\([\s\S]*Math\.ceil\(actionsMaxHeight \/ Math\.max\(1, actionRowMinHeight\)\)/);
  assert.match(source, /progressiveOpenCap/);
  assert.match(source, /initialNumToRender=\{initialActionRowsToRender\}[\s\S]*windowSize=\{3\}[\s\S]*getItemLayout=\{hasVariableActionRowHeights/);
  assert.match(source, /isMt5StylePresentation \? styles\.overlayMt5Plain : null/);
  assert.match(source, /isMt5StylePresentation[\s\S]*\{ opacity: visible \? 1 : 0 \}[\s\S]*\{ opacity: overlayOpacity \}/);
  assert.match(source, /styles\.backdropMt5Plain[\s\S]*opacity: overlayOpacity/);
  assert.match(source, /closeAnimationRunningRef\.current = false[\s\S]*refreshHiddenConfig/);
  assert.match(
    source,
    /sheetTranslateY\.setValue\(resolveMt5EntryTranslateY\(\)\);[\s\S]*closeAnimationRunningRef\.current = false;[\s\S]*refreshHiddenConfig\(\(revision\) => revision \+ 1\);/,
  );
  assert.doesNotMatch(source, /<Modal/);
  assert.doesNotMatch(source, /OVERLAY_MODAL_PROPS/);
  assert.doesNotMatch(source, /ACTION_SHEET_ANDROID_GEOMETRY_SETTLE_MS/);
  assert.doesNotMatch(source, /canPaintSheet/);
  assert.doesNotMatch(source, /shouldHideSheetForInitialLayout/);
  assert.doesNotMatch(source, /instantLayoutReady/);
});

test('android searchable sheets clamp to live overlay height during keyboard focus', () => {
  const source = readActionSheetSource();

  assert.match(source, /useWindowDimensions/);
  assert.match(source, /const \[currentOverlayHeight, setCurrentOverlayHeight\] = useState\(initialMeasuredHeight\)/);
  assert.match(source, /const \[keyboardHeight, setKeyboardHeight\] = useState\(0\)/);
  assert.match(source, /const activeAndroidKeyboardAvoidance = activeConfig\.androidKeyboardAvoidance \?\? 'event'/);
  assert.match(source, /const androidSearchableSheet\s*=\s*\n?\s*Platform\.OS === 'android' && activeSearchable/);
  assert.match(source, /const shouldLockSheetHeight = activeDetent === 'large'/);
  assert.match(source, /\? \{ height: sheetMaxHeight \}/);
  assert.match(
    source,
    /const overlayKeyboardLift = androidSearchableSheet[\s\S]*measuredHeight - \(currentOverlayHeight \|\| measuredHeight\)/,
  );
  assert.match(
    source,
    /const windowKeyboardLift = androidSearchableSheet[\s\S]*measuredHeight - \(windowHeight \|\| measuredHeight\)/,
  );
  assert.match(source, /const eventKeyboardLift = androidSearchableSheet[\s\S]*activeAndroidKeyboardAvoidance === 'resize' \? 0 : Math\.max\(0, keyboardHeight\)/);
  assert.match(source, /const resizeKeyboardLift = Math\.max\(overlayKeyboardLift, windowKeyboardLift\)/);
  assert.match(source, /const effectiveKeyboardLift = Math\.max\(resizeKeyboardLift, eventKeyboardLift\)/);
  assert.match(source, /const unhandledKeyboardLift = Math\.max\(0, eventKeyboardLift - resizeKeyboardLift\)/);
  assert.match(source, /Keyboard\.addListener\('keyboardDidShow', handleKeyboardShow\)/);
  assert.match(source, /Keyboard\.addListener\('keyboardDidHide', handleKeyboardHide\)/);
  assert.match(
    source,
    /const syncOverlayHeightFromWindow = \(\) => \{[\s\S]*Dimensions\.get\('window'\)\.height[\s\S]*setCurrentOverlayHeight\(nextWindowHeight\)/,
  );
  assert.match(source, /syncOverlayHeightFromWindow\(\);\s*setKeyboardHeight\(nextKeyboardHeight\)/);
  assert.match(source, /setKeyboardHeight\(nextKeyboardHeight\)/);
  assert.match(
    source,
    /const measuredVisibleHeight = androidSearchableSheet[\s\S]*measuredHeight - effectiveKeyboardLift/,
  );
  assert.match(source, /const bottomSpacerHeight = unhandledKeyboardLift/);
  assert.match(source, /setCurrentOverlayHeight\(h\)/);
  assert.match(source, /const availableWindowHeight = Math\.max\(260, measuredVisibleHeight\)/);
  assert.match(source, /sheetHeightStyle/);
  assert.match(source, /height: bottomSpacerHeight/);
  assert.doesNotMatch(source, /height: bottomInset \+ keyboardLift/);
});

test('backdrop ignores the opening tap that created the action sheet', () => {
  const source = readActionSheetSource();

  assert.match(source, /const ACTION_SHEET_BACKDROP_OPEN_GUARD_MS = 60/);
  assert.match(source, /const openedAtRef = useRef\(visible \? Date\.now\(\) : 0\)/);
  assert.match(source, /openedAtRef\.current = Date\.now\(\)/);
  assert.match(source, /const handleBackdropPress = useCallback/);
  assert.match(source, /Date\.now\(\) - openedAtRef\.current < ACTION_SHEET_BACKDROP_OPEN_GUARD_MS/);
  assert.match(source, /onPress=\{handleBackdropPress\}/);
});

test('action sheet can center opt-in MT5 plain sheet titles', () => {
  const source = readActionSheetSource();

  assert.match(source, /titleAlign\?: 'left' \| 'center'/);
  assert.match(source, /const activeTitleAlign = activeConfig\.titleAlign/);
  assert.match(source, /const isTitleCentered = activeTitleAlign === 'center'/);
  assert.match(source, /isTitleCentered && styles\.titleContainerCentered/);
  assert.match(source, /isTitleCentered && styles\.titleTextCentered/);
});

test('muted action sheet rows look disabled while remaining tappable', () => {
  const source = readActionSheetSource();

  assert.match(source, /muted\?: boolean/);
  assert.match(source, /const isVisuallyMuted = isActiveDisabled \|\| action\.muted === true/);
  assert.match(source, /onPress=\{isActiveDisabled \? undefined : \(\) => handleActionRowPress\(action\.onPress\)\}/);
  assert.match(source, /disabled=\{isActiveDisabled\}/);
  assert.match(source, /isVisuallyMuted && \([\s\S]*styles\.actionTextDisabledMt5Plain : styles\.actionTextDisabled/);
});
