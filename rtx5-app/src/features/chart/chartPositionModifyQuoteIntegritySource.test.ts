import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
  'utf8',
);

test('native chart position SL/TP modification is live-quote and epoch guarded', () => {
  const start = source.indexOf('const commitChartPositionStopLevels = useCallback');
  const end = source.indexOf('const commitChartTradeSheetStopsForPosition', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = source.slice(start, end);

  assert.match(body, /resolveSessionQuoteActionAvailability\(chartLiveQuote, Date\.now\(\)\)/);
  assert.match(body, /quoteActionBlockMessage\(quoteAvailability\)/);
  assert.match(body, /getActiveBrokerSessionIdentity\(sessionCapture\.session\)/);
  assert.match(body, /isActiveBrokerSessionCurrent\(sessionIdentity\)/);
  assert.match(body, /position\.side === 'buy'[\s\S]*quoteAvailability\.bid[\s\S]*quoteAvailability\.ask/);
  assert.match(body, /if \(!isModifySessionCurrent\(\)\) return;/g);
  assert.doesNotMatch(body, /accountDetails\?\.credentials\?\.accessToken/);
});
