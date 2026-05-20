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

test('android instant action sheets wait for settled modal layout before painting the sheet', () => {
  const source = readActionSheetSource();

  assert.match(source, /const ANDROID_INSTANT_OPEN_LAYOUT_SETTLE_MS = 120/);
  assert.match(
    source,
    /const shouldDelayInstantSheetPaint = Platform\.OS === 'android' && instantOpen/,
  );
  assert.match(
    source,
    /const shouldHideSheetForInitialLayout = shouldDelayInstantSheetPaint && !instantLayoutReady/,
  );
  assert.match(
    source,
    /opacity: shouldHideSheetForInitialLayout \? 0 : 1/,
  );
  assert.match(
    source,
    /h > 0 && Platform\.OS === 'android' && instantOpen[\s\S]*scheduleInstantSheetPaintReady\(\)/,
  );
});
