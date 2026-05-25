import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readQuotesSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/quotes/QuotesScreen.tsx'), 'utf8');

test('quote symbol action sheets open immediately without leaving the tapped symbol visually held', () => {
  const source = readQuotesSource();

  assert.match(source, /import \{ runImmediateAction \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(source, /suppressPressFeedback = false/);
  assert.match(source, /suppressPressFeedback\?: boolean;/);
  assert.match(source, /pressed && !suppressPressFeedback && sc\.cardPressed/);
  assert.match(source, /activateOnPressIn=\{Boolean\(onPress\)\}/);
  assert.match(
    source,
    /<QuoteCard[\s\S]*onPress=\{\(\) => handleSymbolTap\(sym\)\}[\s\S]*suppressPressFeedback[\s\S]*onLongPress=/,
  );
  assert.doesNotMatch(source, /onPressIn=\{\(\) => handleSymbolTap\(sym\)\}/);

  const tapConfigsStart = source.indexOf('const quoteTapActionSheetConfigs = useMemo');
  const longPressConfigsStart = source.indexOf('const quoteLongPressActionSheetConfigs = useMemo');
  const tapHandlerStart = source.indexOf('const handleSymbolTap = useCallback');
  assert.notEqual(tapConfigsStart, -1);
  assert.notEqual(longPressConfigsStart, -1);
  assert.notEqual(tapHandlerStart, -1);

  const tapConfigSource = source.slice(tapConfigsStart, longPressConfigsStart);
  const longPressConfigSource = source.slice(longPressConfigsStart, tapHandlerStart);

  assert.match(tapConfigSource, /quoteSymbols\.forEach\(\(sym\) => \{/);
  assert.match(tapConfigSource, /describeMarketSymbol\(sym\)/);
  assert.match(tapConfigSource, /detent: 'adaptive'/);
  assert.match(tapConfigSource, /instantOpen: true/);
  assert.match(longPressConfigSource, /quoteSymbols\.forEach\(\(sym\) => \{/);
  assert.match(longPressConfigSource, /title: fmt\.symbol\(sym\)/);
  assert.match(longPressConfigSource, /detent: 'auto'/);
  assert.match(longPressConfigSource, /instantOpen: true/);
  assert.match(
    source,
    /const handleSymbolTap = useCallback[\s\S]*quoteTapActionSheetConfigs\.get\(sym\)[\s\S]*runImmediateAction\('quotes\.symbolSheet\.tap\.open'[\s\S]*showActionSheet\(config\)/,
  );
  assert.match(
    source,
    /const handleSymbolLongPress = useCallback[\s\S]*quoteLongPressActionSheetConfigs\.get\(sym\)[\s\S]*runImmediateAction\('quotes\.symbolSheet\.longPress\.open'[\s\S]*showActionSheet\(config\)/,
  );
  assert.match(source, /onLongPress=\{\(\) => handleSymbolLongPress\(sym\)\}/);
});
