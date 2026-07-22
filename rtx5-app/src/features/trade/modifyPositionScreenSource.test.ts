import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/features/trade/ModifyPositionScreen.tsx'), 'utf8');

test('modify position SL and TP controls use semantic theme colors in the chart overlay', () => {
  assert.match(source, /const SL_COLOR = T\.trading\.loss;/);
  assert.match(source, /const TP_COLOR = T\.trading\.profit;/);
  assert.match(source, /renderCard\('sl', SL_COLOR/);
  assert.match(source, /renderCard\('tp', TP_COLOR/);
  assert.match(source, /resolveModifyPositionMarkerYPositions/);
  assert.match(source, /lineY\('sl', stopLoss\)/);
  assert.match(source, /lineY\('tp', takeProfit\)/);
  assert.match(source, /lineY\('ask', ASK\)/);
  assert.match(source, /lineY\('bid', BID\)/);
  assert.match(source, /y1=\{lineY\('sl', stopLoss\)\}[\s\S]*stroke=\{SL_COLOR\}/);
  assert.match(source, /<Rect width=\{60\} height=\{20\} fill=\{SL_COLOR\}/);
  assert.match(source, /y1=\{lineY\('tp', takeProfit\)\}[\s\S]*stroke=\{TP_COLOR\}/);
  assert.match(source, /<Rect width=\{60\} height=\{20\} fill=\{TP_COLOR\}/);
  assert.doesNotMatch(source, /#22D3EE|#06B6D4|#388E3C/);
});

test('modify position validates SL and TP at least five points from market close price', () => {
  assert.match(source, /const MIN_STOP_DISTANCE_POINTS = DEFAULT_MIN_STOP_DISTANCE_POINTS;/);
  assert.match(source, /const minStopDistance = point \* MIN_STOP_DISTANCE_POINTS;/);
  assert.match(source, /validateStopTargetsDistance\(/);
  assert.match(source, /isStopTargetDistanceValid\(/);
  assert.match(source, /resolveStopTargetDistancePoints\(/);
  assert.match(source, /clampStopTargetToMinDistance\(/);
  assert.match(source, /at least \{points\} points below the current Bid/);
  assert.match(source, /at least \{points\} points above the current Ask/);
  assert.match(source, /at least \{points\} points above the current Bid/);
  assert.match(source, /at least \{points\} points below the current Ask/);
  assert.match(source, /SL\/TP must be at least \{points\} points away from the market price/);
  assert.match(source, /\.replace\('\{points\}', String\(MIN_STOP_DISTANCE_POINTS\)\)/);
  assert.doesNotMatch(source, /SL\/TP must be at least 10 points away/);
});

test('modify position SL/TP uses market price and five-point distance for the modify button', () => {
  // Bid/ask on screen + 5-point rule drive the button. Full integrity is only
  // required when there is no usable market price (avoids false "stale" blocks).
  assert.match(source, /useExecutableQuote\(viewSymbol, isScreenFocused && Boolean\(viewSymbol\)\)/);
  assert.match(source, /const hasUsableMarketPrice = closingMarketPrice > 0 && BID > 0 && ASK > 0/);
  assert.match(source, /const stopValidationError = useMemo\(\(\) => validateStopTargets\(\)/);
  assert.match(
    source,
    /const canModifyPosition = Boolean\([\s\S]*hasUsableMarketPrice[\s\S]*!stopValidationError[\s\S]*isSlDistanceValid[\s\S]*isTpDistanceValid/,
  );
  assert.match(source, /disabled=\{!canModifyPosition\}/);
  assert.match(source, /stopValidationError \? \([\s\S]*\{stopValidationError\}/);
  assert.match(source, /stepperDistanceError/);
  assert.match(source, /modifyBtnDisabled/);
  assert.match(source, /onPress=\{handleModify\}[\s\S]*activateOnPressIn/);
  assert.match(
    source,
    /!submitMessage && !stopValidationError && !hasUsableMarketPrice && !quoteAvailability\.allowed/,
  );
  assert.match(source, /if \(!hasUsableMarketPrice\) \{[\s\S]*getCurrentAvailability\(\)/);
  assert.match(source, /distanceError \|\| !isSlDistanceValid \|\| !isTpDistanceValid/);
});
