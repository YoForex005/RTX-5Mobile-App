import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('trade bulk action sheet uses the MT5 plain icon action contract', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const bulkConfigStart = source.indexOf('const bulkActionSheetConfig = useMemo');
  const bulkConfigEnd = source.indexOf('const showBulkSheet = useCallback', bulkConfigStart);
  const bulkConfigSource = source.slice(bulkConfigStart, bulkConfigEnd);

  assert.notEqual(bulkConfigStart, -1);
  assert.notEqual(bulkConfigEnd, -1);
  assert.match(bulkConfigSource, /presentation:\s*'mt5Plain'/);
  assert.match(bulkConfigSource, /showActionIcons:\s*true/);
  assert.doesNotMatch(bulkConfigSource, /title:\s*t\('Bulk Operations'\)/);
  assert.match(bulkConfigSource, /name="close-circle-outline"[\s\S]*label: t\('Close All Positions'\)/);
  assert.match(bulkConfigSource, /name="trending-up-outline"[\s\S]*label: t\('Close Profitable Positions'\)/);
  assert.match(bulkConfigSource, /name="trending-down-outline"[\s\S]*label: t\('Close Losing Positions'\)/);
  assert.match(bulkConfigSource, /name="arrow-up-circle-outline"[\s\S]*label: t\('Close Buy Positions'\)/);
});

test('trade position long-press action sheet uses the MT5 plain icon action contract', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const positionSheetStart = source.indexOf('const showPositionSheet = useCallback');
  const positionSheetEnd = source.indexOf('const renderPositionRow = useCallback', positionSheetStart);
  const positionSheetSource = source.slice(positionSheetStart, positionSheetEnd);

  assert.notEqual(positionSheetStart, -1);
  assert.notEqual(positionSheetEnd, -1);
  assert.match(positionSheetSource, /presentation:\s*'mt5Plain'/);
  assert.match(positionSheetSource, /showActionIcons:\s*true/);
  assert.match(positionSheetSource, /detent:\s*'auto'/);
  assert.doesNotMatch(positionSheetSource, /detent:\s*'adaptive'/);
  assert.doesNotMatch(positionSheetSource, /title:\s*`#\$\{item\.id\}/);
  assert.match(positionSheetSource, /name="close-circle-outline"[\s\S]*label: t\('Close position'\)/);
  assert.match(positionSheetSource, /name="git-compare-outline"[\s\S]*label: t\('Close By'\)/);
  assert.match(positionSheetSource, /name="create-outline"[\s\S]*label: t\('Modify position'\)/);
  assert.match(positionSheetSource, /name="swap-horizontal-outline"[\s\S]*label: t\('Trade'\)/);
  assert.match(positionSheetSource, /name="analytics-outline"[\s\S]*label: t\('Chart'\)/);
});

test('trade rows and summary use direct live websocket quote listeners', () => {
  const tradeScreenSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const summaryHeaderSource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');

  assert.doesNotMatch(tradeScreenSource, /const liveQuotes = useLiveSymbolQuotes\(liveQuoteSymbols, tradeLiveActive, 0\)/);
  assert.doesNotMatch(tradeScreenSource, /quotesWsService\.setSubscriptions/);
  assert.doesNotMatch(tradeScreenSource, /liveQuote=\{resolveTradeRowLiveQuote\(liveQuotes, item\.symbol\)\}/);
  assert.match(tradeScreenSource, /active=\{tradeLiveActive\}/);
  assert.match(tradeScreenSource, /extraData=\{flatListExtraData\}/);
  assert.match(tradeScreenSource, /const flatListExtraData = useMemo\([\s\S]*rowActivationKey/);
  assert.match(rowSource, /const liveQuote = useLiveSymbolQuote\(item\.symbol, active, 0\)/);
  assert.doesNotMatch(rowSource, /liveQuoteOverride|liveQuote\?: Partial<QuoteItem>/);
  assert.match(summaryHeaderSource, /useLiveSymbolQuotes\(liveQuoteSymbols, active, 0\)/);
  assert.match(summaryHeaderSource, /positions\.map\(\(position\) => position\.symbol\)/);
  assert.doesNotMatch(summaryHeaderSource, /liveQuotes: Record<string, Partial<QuoteItem> \| undefined>/);
});
