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

test('modify position keeps the button pressable and validates market price and stops in its handler', () => {
  assert.match(source, /useExecutableQuote\(viewSymbol, isScreenFocused && Boolean\(viewSymbol\)\)/);
  assert.match(source, /const hasUsableMarketPrice = closingMarketPrice > 0/);
  assert.match(source, /const stopValidationError = useMemo\(\(\) => validateStopTargets\(\)/);
  assert.match(
    source,
    /const canModifyPosition = Boolean\([\s\S]*position[\s\S]*symbolsMatch/,
  );
  const eligibilitySource = source.slice(
    source.indexOf('const canModifyPosition = Boolean('),
    source.indexOf('/**', source.indexOf('const canModifyPosition = Boolean(')),
  );
  assert.doesNotMatch(eligibilitySource, /hasUsableMarketPrice|stopValidationError|isSlDistanceValid|isTpDistanceValid|isSubmitting/);
  assert.match(source, /disabled=\{!canModifyPosition\}/);
  assert.match(source, /stopValidationError \? \([\s\S]*\{stopValidationError\}/);
  assert.match(source, /stepperDistanceError/);
  assert.match(source, /modifyBtnDisabled/);
  assert.match(source, /onPress=\{onClear\} activateOnPressIn/);
  assert.match(source, /onPress=\{\(\) => onStep\(-pipSize \* 10\)\} activateOnPressIn/);
  assert.match(source, /onPress=\{\(\) => onStep\(pipSize \* 10\)\} activateOnPressIn/);
  assert.match(source, /onPress=\{\(\) => onStep\(pipSize \* p \* \(kind === 'sl' \? -1 : 1\)\)\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleModify\}[\s\S]*activateOnTouchStart[\s\S]*activateOnPressIn/);
  assert.match(
    source,
    /!submitMessage && !stopValidationError && !hasUsableMarketPrice && !quoteAvailability\.allowed/,
  );
  assert.match(source, /if \(!hasUsableMarketPrice\) \{[\s\S]*getCurrentAvailability\(\)/);
  assert.match(source, /distanceError \|\| !isSlDistanceValid \|\| !isTpDistanceValid/);
  assert.match(source, /if \(!actionProvenance\) \{[\s\S]*Authentication Error[\s\S]*setSubmitMessage/);
  assert.doesNotMatch(source, /if \(!actionProvenance\) return/);
  assert.doesNotMatch(source, /accountDetails\?\.credentials\?\.accessToken/);
});
