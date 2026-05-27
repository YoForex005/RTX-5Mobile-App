import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  resolveActionSheetBottomInset,
  resolveActionSheetFloor,
  resolveActionSheetInitialMeasuredHeight,
  resolveActionSheetMeasuredHeight,
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
    1024,
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

test('android instant action sheets animate in-tree without modal geometry settle', () => {
  const source = readActionSheetSource();

  assert.match(
    source,
    /instantOpen = true/,
  );
  assert.match(
    source,
    /Start from the visible window height/,
  );
  assert.match(
    source,
    /ACTION_SHEET_FAST_OPEN_TRANSLATE_Y = 0/,
  );
  assert.match(
    source,
    /ACTION_SHEET_FAST_OPEN_SHEET_DURATION_MS = 0/,
  );
  assert.match(
    source,
    /if \(isFast\) \{[\s\S]*overlayOpacity\.setValue\(1\);[\s\S]*sheetTranslateY\.setValue\(0\);[\s\S]*return;/,
  );
  assert.match(
    source,
    /if \(activeInstantOpen\) \{[\s\S]*overlayOpacity\.setValue\(1\);[\s\S]*sheetTranslateY\.setValue\(0\);/,
  );
  assert.match(
    source,
    /runEntryAnimation\(activeInstantOpen \? 'fast' : 'standard'\)/,
  );
  assert.match(
    source,
    /easing: Easing\.out\(Easing\.cubic\)/,
  );
  assert.match(
    source,
    /pointerEvents=\{visible \? 'auto' : 'none'\}/,
  );
  assert.match(
    source,
    /if \(!visible && !mounted\) \{/,
  );
  assert.match(source, /ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50/);
  assert.match(source, /style=\{\[styles\.overlay, \{ opacity: overlayOpacity \}\]\}/);
  assert.doesNotMatch(source, /<Modal/);
  assert.doesNotMatch(source, /OVERLAY_MODAL_PROPS/);
  assert.doesNotMatch(source, /ACTION_SHEET_ANDROID_GEOMETRY_SETTLE_MS/);
  assert.doesNotMatch(source, /canPaintSheet/);
  assert.doesNotMatch(source, /shouldHideSheetForInitialLayout/);
  assert.doesNotMatch(source, /instantLayoutReady/);
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
