import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readTradeScreenSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/TradeScreen.tsx'), 'utf8');

const readTradeSummarySource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/SummaryHeader.tsx'), 'utf8');

test('trade bulk launcher opens through the shared Quotes-style action sheet path', () => {
  const source = readTradeScreenSource();
  const summarySource = readTradeSummarySource();

  assert.match(source, /import \{ runImmediateAction \} from '\.\.\/\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(source, /const bulkActionSheetConfig = useMemo<Parameters<typeof showActionSheet>\[0\]>/);
  assert.match(source, /title: t\('Bulk Operations'\)/);
  assert.match(source, /detent: 'auto'/);
  assert.match(source, /instantOpen: true/);
  assert.match(source, /label: t\('Close All Positions'\)/);
  assert.match(source, /label: t\('Close Profitable Positions'\)/);
  assert.match(source, /label: t\('Close Losing Positions'\)/);
  assert.match(source, /label: t\('Close Buy Positions'\)/);
  assert.doesNotMatch(source, /label: t\('Close Sell Positions'\)/);
  assert.doesNotMatch(source, /uniqueBulkSymbols/);
  assert.doesNotMatch(source, /navigateToBulkMode\(`symbol:\$\{symbol\}`\)/);
  assert.match(
    source,
    /const showBulkSheet = useCallback\(\(\) => \{[\s\S]*runImmediateAction\('trade\.bulkSheet\.open', \(\) => showActionSheet\(bulkActionSheetConfig\)\)/,
  );
  assert.match(summarySource, /latencyLabel="trade\.bulk\.open"[\s\S]*activateOnTouchStart/);
  assert.match(source, /requestAnimationFrame\(showBulkSheet\)/);
  assert.doesNotMatch(source, /Close BTCUSD Positions/);
  assert.doesNotMatch(source, /symbol:BTCUSD/);
  assert.doesNotMatch(source, /Close USDJPY Positions/);
  assert.doesNotMatch(source, /symbol:USDJPY/);
});
