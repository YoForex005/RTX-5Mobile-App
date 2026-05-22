import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  resolveActionSheetInitialMeasuredHeight,
  resolveActionSheetMeasuredHeight,
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

test('animated action sheets start from the physical screen height to avoid keyboard shrink', () => {
  assert.equal(
    resolveActionSheetInitialMeasuredHeight({
      instantOpen: false,
      screenHeight: 1640,
      windowHeight: 900,
    }),
    1640,
  );
});

test('instant action sheets keep the first visible height when modal layout is shorter', () => {
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

test('android instant action sheets paint the sheet body immediately', () => {
  const source = readActionSheetSource();

  assert.match(
    source,
    /instant sheets start from the visible window/,
  );
  assert.match(
    source,
    /pointerEvents="auto"/,
  );
  assert.doesNotMatch(source, /shouldHideSheetForInitialLayout/);
  assert.doesNotMatch(source, /instantLayoutReady/);
  assert.doesNotMatch(source, /ANDROID_INSTANT_OPEN_LAYOUT_SETTLE_MS/);
});

test('backdrop ignores the opening tap that created the action sheet', () => {
  const source = readActionSheetSource();

  assert.match(source, /const ACTION_SHEET_BACKDROP_OPEN_GUARD_MS = 220/);
  assert.match(source, /const openedAtRef = useRef\(visible \? Date\.now\(\) : 0\)/);
  assert.match(source, /openedAtRef\.current = Date\.now\(\)/);
  assert.match(source, /const handleBackdropPress = useCallback/);
  assert.match(source, /Date\.now\(\) - openedAtRef\.current < ACTION_SHEET_BACKDROP_OPEN_GUARD_MS/);
  assert.match(source, /onPress=\{handleBackdropPress\}/);
});
