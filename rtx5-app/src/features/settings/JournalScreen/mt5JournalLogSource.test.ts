import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('journal screen renders persisted MT5-style terminal rows', () => {
  const source = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');

  assert.match(source, /useTerminalJournalState/);
  assert.match(source, /Calendar/);
  assert.match(source, /type JournalFilter = 'All' \| 'Trades' \| 'Accounts' \| 'Actions' \| 'Errors' \| 'Notes'/);
  assert.match(source, /const FILTERS: JournalFilter\[\] = \['All', 'Trades', 'Accounts', 'Actions', 'Errors', 'Notes'\]/);
  assert.match(source, /selectedDateIso/);
  assert.match(source, /setIsCalendarOpen\(true\)/);
  assert.match(source, /maxDate=\{todayDateIso\}/);
  assert.match(source, /markedDates=\{selectedCalendarMarkedDates\}/);
  assert.match(source, /journalActionLabel="refreshed journal"/);
  assert.match(source, /formatTerminalTime/);
  assert.match(source, /toTerminalLogRows\(terminalEntries\)/);
  assert.match(source, /mergeJournalRows\(terminalRows\)/);
  assert.match(source, /renderJournalRow/);
  assert.match(source, /styles\.terminalLogTime/);
  assert.match(source, /styles\.terminalLogSource/);
  assert.match(source, /styles\.terminalLogMessage/);
  assert.match(source, /Terminal Log/);
  assert.match(source, /\$\{t\('No real journal events recorded for'\)\} \$\{selectedDateLabel\}\./);
  assert.doesNotMatch(source, /buildHistoryJournalRows/);
  assert.doesNotMatch(source, /historyRows/);
  assert.doesNotMatch(source, /history-open-log/);
  assert.doesNotMatch(source, /Loading account journal/);
  assert.doesNotMatch(source, /renderItem=\{renderActivityItem\}/);
});

test('market order API records request, success, and failure journal rows', () => {
  const source = readSource('src/api/orders/placeMarketOrder.ts');

  assert.match(source, /recordMarketOrderJournalRequest/);
  assert.match(source, /recordMarketOrderJournalSuccess/);
  assert.match(source, /recordMarketOrderJournalFailure/);
  assert.match(source, /recordMarketOrderJournalRequest\(journalPayload\)/);
  assert.match(source, /recordMarketOrderJournalSuccess\([\s\S]*journalPayload[\s\S]*finalData/);
  assert.match(source, /recordMarketOrderJournalFailure\(journalPayload, error\)/);
});

test('positions API records close and SLTP modify journal rows', () => {
  const source = readSource('src/api/positions/index.ts');

  assert.match(source, /recordClosePositionJournalRequest/);
  assert.match(source, /recordClosePositionJournalSuccess/);
  assert.match(source, /recordClosePositionJournalFailure/);
  assert.match(source, /recordModifyPositionJournalRequest/);
  assert.match(source, /recordModifyPositionJournalSuccess/);
  assert.match(source, /recordModifyPositionJournalFailure/);
  assert.match(source, /recordClosePositionJournalRequest\(ticketId/);
  assert.match(source, /recordModifyPositionJournalRequest\(ticketId, payload\)/);
});

test('terminal journal store writes MT5-like trade lines', () => {
  const source = readSource('src/state/terminalJournalState.ts');

  assert.match(source, /type TerminalJournalSource = 'Trades' \| 'Accounts' \| 'Actions' \| 'Terminal' \| 'Network' \| 'Notes'/);
  assert.match(source, /name: 'terminalJournalEntries'/);
  assert.match(source, /TERMINAL_JOURNAL_RETENTION_DAYS = 90/);
  assert.match(source, /retainRecentEntries/);
  assert.match(source, /recordAppActionJournalEvent/);
  assert.match(source, /recordAccountJournalEvent/);
  assert.match(source, /message: `\$\{formatLoginPrefix\(login\)\}\$\{buildMarketOrderText\(payload\)\}`/);
  assert.match(source, /accepted \$\{requestText\}/);
  assert.match(source, /order #\$\{ticket\} \$\{side\.toUpperCase\(\)\}/);
  assert.match(source, /const symbolText = symbol \? ` \$\{symbol\}` : ''/);
  assert.doesNotMatch(source, /return symbol \|\| 'symbol'/);
  assert.match(source, /close position #\$\{ticketId\}/);
  assert.match(source, /modify position #\$\{ticketId\}/);
  assert.match(source, /failed: \$\{getErrorMessage\(error\)\}/);
});

test('real account and app actions write journal events from command paths', () => {
  const fastPressableSource = readSource('src/ui/components/FastPressable.tsx');
  const loginSource = readSource('app/login.tsx');
  const registerSource = readSource('app/register.tsx');
  const savedAccountsSource = readSource('src/state/savedAccounts.ts');
  const accountsScreenSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');

  assert.match(fastPressableSource, /journalActionLabel\?: string/);
  assert.match(fastPressableSource, /recordAppActionJournalEvent\(\{/);
  assert.match(loginSource, /recordAccountJournalEvent\(`login requested for broker/);
  assert.match(loginSource, /recordAccountJournalEvent\(`login succeeded on/);
  assert.match(loginSource, /recordAccountJournalEvent\(`login failed:/);
  assert.match(loginSource, /journalActionLabel="pressed Login button"/);
  assert.match(registerSource, /recordAccountJournalEvent\('demo account registration requested'/);
  assert.match(registerSource, /recordAccountJournalEvent\(`demo account created and signed in on/);
  assert.match(registerSource, /recordAccountJournalEvent\(`demo account registration failed:/);
  assert.match(registerSource, /journalActionLabel="pressed Register demo account button"/);
  assert.match(savedAccountsSource, /saved account added for broker/);
  assert.match(savedAccountsSource, /saved account updated for broker/);
  assert.match(savedAccountsSource, /saved account removed for broker/);
  assert.match(accountsScreenSource, /account switch requested for broker/);
  assert.match(accountsScreenSource, /account switched successfully on/);
  assert.match(accountsScreenSource, /current account deleted and local session logged out/);
  assert.match(brokerDetailSource, /broker detail login requested for broker/);
  assert.match(brokerDetailSource, /broker detail login failed:/);
  assert.match(settingsSource, /logged out from current account/);
});
