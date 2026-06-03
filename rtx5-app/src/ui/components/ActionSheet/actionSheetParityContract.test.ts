import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourceRoots = ['app', 'src'];

const readSource = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), 'utf8');

const collectFiles = (dir: string): string[] => {
  const absoluteDir = resolve(root, dir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = join(absoluteDir, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return collectFiles(relative(root, absolutePath));
    }

    if (!/\.(tsx?)$/.test(entry) || /\.test\.(tsx?)$/.test(entry)) {
      return [];
    }

    return [relative(root, absolutePath).replace(/\\/g, '/')];
  });
};

const allSourceFiles = sourceRoots.flatMap(collectFiles);

const readAllSource = () =>
  allSourceFiles.map((file) => readSource(file)).join('\n');

test('ActionSheet surfaces use the shared instant Quotes-style sheet contract', () => {
  const allSource = readAllSource();
  const actionSheetMounts = [...allSource.matchAll(/<ActionSheet\b[\s\S]*?\/>/g)];
  const scopedActionSheetCalls = [
    ...allSource.matchAll(/\bshow(?:Quotes|Chart|Trade|History|News|Accounts|BrokerDetail)ActionSheet\(/g),
  ];

  assert.equal(actionSheetMounts.length, 20);
  assert.equal(scopedActionSheetCalls.length, 14);

  for (const mount of actionSheetMounts) {
    assert.match(mount[0], /instantOpen/, 'ActionSheet mount must opt into instant open path');
    assert.match(mount[0], /detent/, 'ActionSheet mount must declare or forward a stable detent');
  }

  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const uiStateSource = readSource('src/state/uiState.ts');

  assert.match(actionSheetSource, /activeConfig\.instantOpen \?\? true/);
  assert.match(actionSheetSource, /activateOnPressIn/);
  assert.match(uiStateSource, /showActionSheet: \(config\) => set\(\{ actionSheet: \{ \.\.\.config, instantOpen: true \} \}\)/);
});

test('high-traffic scoped action sheets open through immediate action wrappers', () => {
  const quotesSource = readSource('src/features/quotes/QuotesScreen.tsx');
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const historySource = readSource('src/features/history/HistoryScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const newsSource = readSource('src/features/settings/NewsScreen.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');

  assert.match(quotesSource, /runImmediateAction\('quotes\.symbolSheet\.tap\.open'[\s\S]*showQuotesActionSheet\(config\)/);
  assert.match(quotesSource, /runImmediateAction\('quotes\.symbolSheet\.longPress\.open'[\s\S]*showQuotesActionSheet\(config\)/);
  assert.match(tradeSource, /runImmediateAction\('trade\.bulkSheet\.open'[\s\S]*showTradeActionSheet\(bulkActionSheetConfig\)/);
  assert.match(tradeSource, /runImmediateAction\('trade\.positionSheet\.open'[\s\S]*showTradeActionSheet\(\{/);
  assert.match(historySource, /runImmediateAction\('history\.sortSheet\.open'[\s\S]*showHistoryActionSheet\(\{/);
  assert.match(newsSource, /runImmediateAction\('news\.filterSheet\.open'[\s\S]*showNewsActionSheet\(\{/);
  assert.match(accountsSource, /runImmediateAction\('accounts\.optionsSheet\.open'[\s\S]*showAccountsActionSheet\(\{/);
  assert.match(brokerDetailSource, /runImmediateAction\('brokerDetail\.serverSheet\.open'[\s\S]*showBrokerDetailActionSheet\(\{/);
  assert.match(chartSource, /runImmediateAction\('chart\.symbolPicker\.open'[\s\S]*showChartActionSheet\(\{/);
  assert.match(chartSource, /runImmediateAction\('chart\.timeframePicker\.open'[\s\S]*showChartActionSheet\(\{/);
  assert.match(chartSource, /runImmediateAction\('chart\.drawingTools\.open'[\s\S]*showChartActionSheet\(\{/);
  assert.match(chartSource, /runImmediateAction\('chart\.moreMenu\.open'[\s\S]*showChartActionSheet\(\{/);
});
