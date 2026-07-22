import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('radial menu timeframe and action items use the same reliable fast-press path', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');

  // Timeframes (M1…MN) must not rely on plain onPress alone — WebView + Android
  // drop release events unless activateOnPressIn/TouchStart are set.
  assert.match(source, /TIMEFRAME_ITEMS\.map\(\(item\) => \{[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/);
  assert.match(
    source,
    /onPress=\{\(event\) => handleActionItemPress\(event, \(\) => onSelectTimeframe\(item\.key\)\)\}/,
  );
  assert.match(source, /hitSlop=\{CHART_TAP_TIMEFRAME_HIT_SLOP\}/);
  assert.match(source, /pointerEvents: 'none'/);

  // Action ring (objects, draw, scale, symbol, indicators)
  assert.match(
    source,
    /actionItems\.map\(\(item\) => \{[\s\S]*onPress=\{\(event\) => handleActionItemPress\(event, item\.onPress\)\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/,
  );
});

test('radial menu pan responder does not capture taps from timeframe and action pressables', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');

  assert.match(source, /onStartShouldSetPanResponder: \(\) => false/);
  assert.match(source, /onStartShouldSetPanResponderCapture: \(\) => false/);
  assert.match(source, /onMoveShouldSetPanResponderCapture: \(\) => false/);
  assert.match(source, /CHART_TAP_MENU_DRAG_CLAIM_PX = 12/);
  assert.match(source, /onPanResponderTerminationRequest: \(\) => true/);
  assert.doesNotMatch(
    source,
    /onMoveShouldSetPanResponderCapture: \(_event, gestureState\) =>/,
    'must not capture move gestures away from Pressable children',
  );
});

test('chart screen wires every radial option to a concrete action', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const radialStart = source.indexOf('<ChartTapRadialMenu');
  assert.notEqual(radialStart, -1);
  const radialEnd = source.indexOf('/>', radialStart);
  assert.notEqual(radialEnd, -1);
  const radialMount = source.slice(radialStart, radialEnd + 2);

  assert.match(radialMount, /onSelectTimeframe=\{handleTimeframeSelect\}/);
  assert.match(radialMount, /onOpenObjects=\{/);
  assert.match(radialMount, /onOpenDrawingTools=\{/);
  assert.match(radialMount, /onOpenIndicators=\{/);
  assert.match(radialMount, /onOpenSymbolPicker=\{/);
  assert.match(radialMount, /onOpenScaleControls=\{handleOpenChartScaleMenu\}/);
  assert.match(radialMount, /closeChartTapMenu\(\)/);
  assert.match(radialMount, /router\.push\('\/chart\/indicators'\)/);
  assert.match(radialMount, /handleOpenDrawingTools\(\)/);
  assert.match(radialMount, /handleOpenSymbolPicker\(\)/);
  assert.match(radialMount, /handleOpenObjectsScreen\(\)/);

  assert.match(
    source,
    /const handleTimeframeSelect = useCallback[\s\S]*closeChartTapMenu\(\)[\s\S]*warmChartContextAndCommit\(chartSymbol, nextTimeframe\)/,
  );
  assert.match(
    source,
    /const handleOpenChartScaleMenu = useCallback[\s\S]*closeChartTapMenu\(\)[\s\S]*showChartActionSheet\(\{/,
  );
});
