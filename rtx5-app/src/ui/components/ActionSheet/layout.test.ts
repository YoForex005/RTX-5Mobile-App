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

test('instant action sheets paint on the first modal frame', () => {
  const source = readActionSheetSource();

  assert.match(
    source,
    /if \(instantOpen\) \{[\s\S]*overlayOpacity\.stopAnimation\(\);[\s\S]*sheetTranslateY\.stopAnimation\(\);[\s\S]*overlayOpacity\.setValue\(1\);[\s\S]*sheetTranslateY\.setValue\(0\);[\s\S]*return;/,
  );
  assert.doesNotMatch(source, /overlayOpacity\.setValue\(Platform\.OS === 'android' \? 0 : 1\)/);
});
