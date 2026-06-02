import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readOrderTicketSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/OrderTicketScreen.tsx'), 'utf8');

test('order ticket pending submit uses the pending-order API contract', () => {
  const source = readOrderTicketSource();
  const pendingStart = source.indexOf('const handlePlacePendingOrder = async () =>');
  const pendingEnd = source.indexOf('const spread = Math.round', pendingStart);
  assert.notEqual(pendingStart, -1, 'pending submit handler must exist');
  assert.notEqual(pendingEnd, -1, 'pending submit handler boundary must exist');

  const pendingHandler = source.slice(pendingStart, pendingEnd);
  assert.match(pendingHandler, /price:\s*pendingEntryPrice/);
  assert.match(pendingHandler, /ordersApi\.placePendingOrder\(payload\)/);
  assert.doesNotMatch(pendingHandler, /ordersApi\.placeMarketOrder\(payload as any\)/);
});

test('order ticket symbol picker updates the same screen instead of routing', () => {
  const source = readOrderTicketSource();
  const pickerStart = source.indexOf('const handleSymbolSelect = useCallback');
  const pickerEnd = source.indexOf('const symbolPickerActions = useMemo', pickerStart);
  assert.notEqual(pickerStart, -1, 'symbol select handler must exist');
  assert.notEqual(pickerEnd, -1, 'symbol select handler boundary must exist');

  const pickerHandler = source.slice(pickerStart, pickerEnd);
  assert.match(source, /const \[symbol, setSymbol\] = useState\(routeInitialSymbol\)/);
  assert.match(source, /DEFAULT_CHART_SYMBOLS\.forEach\(addSymbol\)/);
  assert.match(pickerHandler, /setSymbolPickerOpen\(false\)/);
  assert.match(pickerHandler, /setSymbol\(normalizedNextSymbol\)/);
  assert.doesNotMatch(pickerHandler, /router\.(?:push|replace)/);
  assert.match(source, /lastConfiguredPendingOrderTypeRef\.current = null/);
});

test('order ticket graph uses the screen background instead of a white card', () => {
  const source = readOrderTicketSource();
  const graphStart = source.indexOf('<LiveOrderTickExecutionGraph');
  const graphEnd = source.indexOf('/>', graphStart);
  const stylesStart = source.indexOf('executionGraphWrap: {');
  const stylesEnd = source.indexOf('pendingSubmitPlaceholder:', stylesStart);
  assert.notEqual(graphStart, -1, 'order ticket graph must be rendered');
  assert.notEqual(graphEnd, -1, 'order ticket graph props boundary must exist');
  assert.notEqual(stylesStart, -1, 'graph wrapper style must exist');
  assert.notEqual(stylesEnd, -1, 'graph wrapper style boundary must exist');

  const graphProps = source.slice(graphStart, graphEnd);
  const graphWrapStyle = source.slice(stylesStart, stylesEnd);
  assert.match(graphProps, /backgroundColor=\{T\.bg\}/);
  assert.match(graphWrapStyle, /backgroundColor:\s*BG/);
  assert.doesNotMatch(graphWrapStyle, /#FFFFFF/);
});
