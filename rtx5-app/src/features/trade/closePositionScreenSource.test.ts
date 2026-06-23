import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/features/trade/ClosePositionScreen.tsx'), 'utf8');

test('close position dark theme uses semantic status colors and visible loading feedback', () => {
  assert.match(source, /const styles = useMemo\(\(\) => makeStyles\(T, isDark\), \[T, isDark\]\);/);
  assert.match(source, /<View style=\{\[styles\.statusBox, closeError \? styles\.statusBoxError : styles\.statusBoxSuccess\]\}>/);
  assert.match(source, /statusBoxSuccess:[\s\S]*backgroundColor: T\.upGlow/);
  assert.match(source, /statusBoxError:[\s\S]*backgroundColor: T\.downGlow/);
  assert.match(source, /statusTextSuccess:[\s\S]*color: T\.trading\.profit/);
  assert.match(source, /statusTextError:[\s\S]*color: T\.trading\.loss/);
  assert.match(source, /<ActivityIndicator color="#FFFFFF" \/>/);
  assert.match(source, /closeByButton:[\s\S]*backgroundColor: isDark \? SETTINGS_DARK_CARD_BACKGROUND : T\.glass1[\s\S]*borderColor: isDark \? T\.border : T\.borderMedium/);
  assert.doesNotMatch(source, /styles\.success|successText|rgba\(74,222,128/);
});