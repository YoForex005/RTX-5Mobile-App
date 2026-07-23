import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/features/trade/ModifyPositionScreen.tsx'), 'utf8');
const executableQuoteSource = readFileSync(
  resolve(process.cwd(), 'src/features/quotes/useExecutableQuote.ts'),
  'utf8',
);
const liveQuotesSource = readFileSync(
  resolve(process.cwd(), 'src/features/quotes/useLiveQuotes.ts'),
  'utf8',
);

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

test('modify position uses executable-side checks and broker tick size without invented constraints', () => {
  assert.match(source, /const closingMarketPrice = position \? \(position\.side === 'buy' \? BID : ASK\) : 0/);
  assert.match(source, /const tickSize = useMemo\(\(\) => \{/);
  assert.match(source, /snapStopTargetToTickSize\(value, tickSize, decimals\)/);
  assert.match(source, /isStopTargetOnCorrectSide\('sl'/);
  assert.match(source, /isStopTargetOnCorrectSide\('tp'/);
  assert.match(source, /stopLoss === null \|\| stopLoss === 0/);
  assert.match(source, /takeProfit === null \|\| takeProfit === 0/);
  assert.match(source, /Prices are snapped only to the broker tick size/);
  assert.doesNotMatch(source, /MIN_STOP_DISTANCE_POINTS|DEFAULT_MIN_STOP_DISTANCE_POINTS/);
  assert.doesNotMatch(source, /trade_stops_level|trade_freeze_level|const point = Math\.pow/);
});

test('modify position keeps the button pressable and validates market price and stops in its handler', () => {
  assert.match(
    source,
    /useExecutableQuote\([\s\S]*viewSymbol,[\s\S]*isScreenFocused && Boolean\(viewSymbol\),[\s\S]*MODIFY_POSITION_QUOTE_COMMIT_INTERVAL_MS/,
  );
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
  assert.doesNotMatch(eligibilitySource, /hasUsableMarketPrice|stopValidationError|isSlDistanceValid|isTpDistanceValid/);
  assert.match(eligibilitySource, /!coordinatorBusy/);
  assert.match(source, /disabled=\{!canModifyPosition\}/);
  assert.match(source, /stopValidationError \? \([\s\S]*\{stopValidationError\}/);
  assert.match(source, /stepperDistanceError/);
  assert.match(source, /modifyBtnDisabled/);
  assert.match(source, /onPress=\{onClear\}[\s\S]*?activateOnPressIn[\s\S]*?latencyLabel=\{`modifyPosition\.\$\{kind\}\.clear`\}/);
  assert.match(source, /onPress=\{\(\) => onStep\(-pipSize \* 10\)\}[\s\S]*?activateOnPressIn[\s\S]*?latencyLabel=\{`modifyPosition\.\$\{kind\}\.stepDown`\}/);
  assert.match(source, /onPress=\{\(\) => onStep\(pipSize \* 10\)\}[\s\S]*?activateOnPressIn[\s\S]*?latencyLabel=\{`modifyPosition\.\$\{kind\}\.stepUp`\}/);
  assert.match(
    source,
    /const direction = resolveStopTargetPresetDirection\(kind, position\.side\)/,
  );
  assert.match(source, /onPress=\{handleModify\}[\s\S]*activateOnTouchStart[\s\S]*activateOnPressIn/);
  assert.match(
    source,
    /!submitMessage && !stopValidationError && !hasUsableMarketPrice && !quoteAvailability\.allowed/,
  );
  assert.match(source, /if \(!hasUsableMarketPrice\) \{[\s\S]*getCurrentAvailability\(\)/);
  assert.match(source, /distanceError \|\| !isSlDistanceValid \|\| !isTpDistanceValid/);
  assert.match(source, /if \(!resolvedLogin\) \{[\s\S]*Authentication Error[\s\S]*setSubmitMessage/);
  assert.doesNotMatch(source, /accountDetails\?\.credentials\?\.accessToken/);
});

test('modify position step controls stay synchronous while decorative chart work is isolated', () => {
  const slStart = source.indexOf('const handleStepSl = useCallback');
  const tpStart = source.indexOf('const handleStepTp = useCallback');
  const changeStart = source.indexOf('const handleSlChange', tpStart);
  assert.ok(slStart > -1 && tpStart > slStart && changeStart > tpStart);

  const stepSource = source.slice(slStart, changeStart);
  assert.match(stepSource, /setStopLoss\(\(prev\) =>/);
  assert.match(stepSource, /setTakeProfit\(\(prev\) =>/);
  assert.doesNotMatch(
    stepSource,
    /\bawait\b|Promise|setTimeout|requestAnimationFrame|positionsApi|runAfterModifyClosePaint/,
  );

  assert.match(source, /const ModifyPositionTickChart = memo\(function ModifyPositionTickChart/);
  assert.match(source, /const MODIFY_POSITION_QUOTE_COMMIT_INTERVAL_MS = 50/);
  assert.match(source, /const MODIFY_POSITION_CHART_COMMIT_INTERVAL_MS = 100/);
  assert.match(
    source,
    /useLiveCandles\([\s\S]*active && tickChartReady,[\s\S]*MODIFY_POSITION_CHART_COMMIT_INTERVAL_MS/,
  );
  assert.doesNotMatch(source, /useDeferredValue/);
  assert.match(source, /const chartLiveInputRef = useRef<ModifyPositionChartLiveInput>/);
  assert.match(
    source,
    /chartLiveInputRef\.current = \{[\s\S]*symbol: viewSymbol,[\s\S]*bid: BID,[\s\S]*ask: ASK,[\s\S]*stopLoss,[\s\S]*takeProfit/,
  );
  assert.match(
    source,
    /<ModifyPositionTickChart[\s\S]*liveInputRef=\{chartLiveInputRef\}/,
  );
  const chartSource = source.slice(
    source.indexOf('const ModifyPositionTickChart = memo'),
    source.indexOf('/**\n * Screen used to adjust', source.indexOf('const ModifyPositionTickChart = memo')),
  );
  assert.doesNotMatch(
    chartSource,
    /setTicks|useState<ModifyPositionChartTick/,
    'the coalesced candle snapshot must derive one SVG render without a second tick-state render',
  );
  assert.match(
    chartSource,
    /const interval = setInterval\([\s\S]*commitLatestInput,[\s\S]*MODIFY_POSITION_CHART_COMMIT_INTERVAL_MS/,
  );
  assert.match(chartSource, /return \(\) => clearInterval\(interval\)/);
  assert.match(
    chartSource,
    /previous\.bid === latest\.bid[\s\S]*previous\.ask === latest\.ask[\s\S]*previous\.stopLoss === latest\.stopLoss[\s\S]*previous\.takeProfit === latest\.takeProfit/,
  );

  assert.match(
    executableQuoteSource,
    /useLiveQuoteSnapshot\(symbol, active, renderIntervalMs\)/,
  );
  assert.match(
    executableQuoteSource,
    /getCurrentLiveQuoteSnapshot\(symbol\)[\s\S]*resolveSessionQuoteActionAvailability/,
    'execution checks must read the newest in-memory quote rather than the coalesced render',
  );
  assert.match(
    liveQuotesSource,
    /export function useLiveQuoteSnapshot\([\s\S]*renderIntervalMs = 0,[\s\S]*safeRenderIntervalMs/,
  );
  assert.match(
    liveQuotesSource,
    /setTimeout\(\(\) => \{[\s\S]*listener\(\);[\s\S]*\}, safeRenderIntervalMs\)/,
  );
  assert.match(
    liveQuotesSource,
    /const renderSnapshotRef = useRef<[\s\S]*renderSnapshotRef\.current = \{[\s\S]*value: resolveSnapshot\(normalizedSymbol\)/,
  );
  assert.match(
    liveQuotesSource,
    /return safeRenderIntervalMs === 0[\s\S]*resolveSnapshot\(normalizedSymbol\)[\s\S]*renderSnapshotRef\.current\.value/,
    'coalesced consumers must see one stable snapshot identity between scheduled notifications',
  );
  assert.match(
    liveQuotesSource,
    /return \(\) => \{[\s\S]*clearTimeout\(renderTimer\);[\s\S]*unsubscribe\(\);/,
  );
});

test('modify position mounts usable controls immediately with non-overlapping touch targets', () => {
  assert.doesNotMatch(source, /const sheetBodyReady|bodyLoadingWrap/);
  assert.match(source, /stepperHead: \{[\s\S]*minHeight: 44/);
  assert.match(source, /stepperClear: \{[\s\S]*width: 44,[\s\S]*height: 44/);
  assert.match(source, /stepperSquareBtn: \{[\s\S]*width: 44,[\s\S]*height: 44/);
  assert.match(source, /stepperChip: \{[\s\S]*minHeight: 44/);
  assert.match(source, /testID=\{`modify-position-\$\{kind\}-step-down`\}/);
  assert.match(source, /testID=\{`modify-position-\$\{kind\}-step-up`\}/);
  assert.match(source, /testID=\{`modify-position-\$\{kind\}-preset-\$\{p\}`\}/);
  assert.match(source, /hitSlop=\{0\}/);
  assert.match(source, /pressed && styles\.stepperControlPressed/);
  assert.match(
    source,
    /const reportUnavailableMarketPrice = useCallback[\s\S]*setSubmitMessage/,
  );
  assert.match(
    source,
    /if \(!hasUsableMarketPrice\) \{[\s\S]*reportUnavailableMarketPrice\(\);[\s\S]*return;/,
  );
});

test('open-position SL and TP uses its own broker gate and shared coordinator', () => {
  assert.match(source, /isExistingPositionModifyBackendLocked/);
  assert.doesNotMatch(source, /isNewMarketOrderProtectionBackendLocked|isPendingOrderProtectionBackendLocked/);
  assert.match(source, /const handleStepSl = useCallback/);
  assert.match(source, /const handleStepTp = useCallback/);
  assert.match(
    source,
    /submitModifyPosition\(\{[\s\S]*ticket: position\.id,[\s\S]*price_sl: requestedSl,[\s\S]*price_tp: requestedTp/,
  );
  assert.match(source, /useModifyPositionTicketState\(position\?\.id\)/);
  assert.doesNotMatch(source, /positionsApi\.modifyPosition|applyLocalStopPatch|AbortController/);
});
