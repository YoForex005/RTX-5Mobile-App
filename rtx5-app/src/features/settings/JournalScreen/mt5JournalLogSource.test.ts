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
  const calendarLauncherStart = source.indexOf('onPress={handleOpenCalendar}');
  const calendarLauncherEnd = source.indexOf('</Pressable>', calendarLauncherStart);
  assert.notEqual(calendarLauncherStart, -1);
  assert.notEqual(calendarLauncherEnd, -1);
  const calendarLauncherSource = source.slice(calendarLauncherStart, calendarLauncherEnd);
  assert.match(calendarLauncherSource, /activateOnPressIn/);
  assert.match(calendarLauncherSource, /activateOnTouchStart/);
  assert.match(calendarLauncherSource, /unstable_pressDelay=\{0\}/);
  assert.match(calendarLauncherSource, /latencyLabel="journal\.calendar\.open"/);
  assert.doesNotMatch(calendarLauncherSource, /journalActionLabel/);
  const noteLauncherSources = [...source.matchAll(/onPress=\{\(\) => setIsNoteOpen\(true\)\}/g)]
    .map((match) => source.slice(match.index, source.indexOf('</Pressable>', match.index)));
  assert.equal(noteLauncherSources.length, 2);
  for (const noteLauncherSource of noteLauncherSources) {
    assert.match(noteLauncherSource, /activateOnPressIn/);
    assert.match(noteLauncherSource, /unstable_pressDelay=\{0\}/);
    assert.doesNotMatch(noteLauncherSource, /activateOnTouchStart/);
  }
  assert.match(noteLauncherSources[0], /latencyLabel="journal\.toolbarNote"/);
  assert.match(noteLauncherSources[1], /latencyLabel="journal\.addNote"/);
  assert.match(source, /maxDate=\{todayDateIso\}/);
  assert.match(source, /markedDates=\{markedDates\}/);
  assert.match(source, /current=\{selectedDate\}/);
  assert.match(source, /disableMonthChange/);
  assert.doesNotMatch(source, /initialDate=\{selectedDate\}/);
  assert.match(source, /formatTerminalTime/);
  assert.match(source, /toTerminalLogRows\(terminalEntries\)/);
  assert.match(source, /mergeJournalRows\(terminalRows\)/);
  assert.match(source, /renderJournalRow/);
  assert.match(source, /styles\.terminalLogTime/);
  assert.match(source, /styles\.terminalLogSource/);
  assert.match(source, /styles\.terminalLogMessage/);
  assert.match(source, /t\('RTX5 Log'\)/);
  assert.doesNotMatch(source, /t\('MT5 Log'\)/);
  assert.match(source, /Terminal Log/);
  assert.match(source, /\$\{t\('No real journal events recorded for'\)\} \$\{selectedDateLabel\}\./);
  assert.doesNotMatch(source, /buildHistoryJournalRows/);
  assert.doesNotMatch(source, /historyRows/);
  assert.doesNotMatch(source, /history-open-log/);
  assert.doesNotMatch(source, /Loading account journal/);
  assert.doesNotMatch(source, /renderItem=\{renderActivityItem\}/);
});

test('journal refresh acknowledges immediately and coalesces slow requests', () => {
  const screenSource = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');
  const liveJournalSource = readSource('src/features/settings/JournalScreen/liveJournal.ts');
  const dealsQuerySource = readSource('src/query/deals.ts');
  const refreshLauncherStart = screenSource.indexOf('const JournalRefreshButton = React.memo');
  const refreshLauncherEnd = screenSource.indexOf('const toCalendarDateString', refreshLauncherStart);
  const refreshLauncherSource = screenSource.slice(refreshLauncherStart, refreshLauncherEnd);

  assert.notEqual(refreshLauncherStart, -1);
  assert.notEqual(refreshLauncherEnd, -1);
  assert.match(refreshLauncherSource, /activateOnPressIn/);
  assert.match(refreshLauncherSource, /activateOnTouchStart/);
  assert.match(refreshLauncherSource, /unstable_pressDelay=\{0\}/);
  assert.match(refreshLauncherSource, /ActivityIndicator/);
  assert.match(refreshLauncherSource, /JOURNAL_REFRESH_FEEDBACK_MS/);
  assert.match(refreshLauncherSource, /if \(!onRefresh\(\)\) \{/);
  assert.match(refreshLauncherSource, /animating=\{showFeedback\}/);
  assert.match(screenSource, /const refreshInFlightRef = useRef\(false\)/);
  assert.match(screenSource, /if \(refreshInFlightRef\.current\) \{/);
  assert.match(screenSource, /\}, \[refreshScopeKey\]\)/);
  assert.match(screenSource, /scheduleAfterJournalVisualFeedback\(\(\) => \{/);
  assert.doesNotMatch(screenSource, /message: 'refreshed journal'/);
  assert.match(liveJournalSource, /Promise\.all\(\[/);
  assert.equal((liveJournalSource.match(/cancelRefetch: false/g) ?? []).length, 2);
  assert.doesNotMatch(liveJournalSource, /usePositionsQuery|refetchPositions/);
  assert.match(liveJournalSource, /usePositionHistoryQuery/);
  assert.match(liveJournalSource, /pageLimit: 1000/);
  assert.match(liveJournalSource, /maxPages: 1/);
  assert.match(liveJournalSource, /mergeClosedPositionSources\(rangedHistoryPositions, derivedClosedPositions\)/);
  assert.match(liveJournalSource, /from: journalFrom/);
  assert.match(liveJournalSource, /to: journalTo/);
  assert.match(liveJournalSource, /refetchInterval: false/);
  assert.match(liveJournalSource, /subscribed: active/);
  assert.doesNotMatch(liveJournalSource, /\.isFetching|\.isLoading/);
  assert.match(dealsQuerySource, /getDealsQueryKey\(cacheNamespace, login, from, to\)/);
  assert.match(dealsQuerySource, /getLoginDealsWithRangeFallback\(login!, from, to\)/);
  assert.match(dealsQuerySource, /if \(!shouldRetryDealsWithoutRange\(error\)\) throw error/);
  assert.match(dealsQuerySource, /subscribed: options\.subscribed/);
});

test('add note dismiss controls close immediately', () => {
  const source = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');

  for (const latencyLabel of ['journal.noteOverlay', 'journal.noteClose']) {
    const labelIndex = source.indexOf(`latencyLabel="${latencyLabel}"`);
    const launcherStart = source.lastIndexOf('<Pressable', labelIndex);
    const launcherEnd = source.indexOf(
      latencyLabel === 'journal.noteOverlay' ? '/>' : '</Pressable>',
      labelIndex,
    );
    const launcherSource = source.slice(launcherStart, launcherEnd);

    assert.notEqual(labelIndex, -1);
    assert.notEqual(launcherStart, -1);
    assert.notEqual(launcherEnd, -1);
    assert.match(launcherSource, /onPress=\{\(\) => setIsNoteOpen\(false\)\}/);
    assert.match(launcherSource, /activateOnPressIn/);
    assert.match(launcherSource, /activateOnTouchStart/);
    assert.match(launcherSource, /unstable_pressDelay=\{0\}/);
  }

  assert.match(source, /latencyLabel="journal\.noteClose"[\s\S]*accessibilityLabel="Close note"/);
});

test('calendar stays mounted and opens through an imperative native host', () => {
  const source = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');

  assert.match(source, /const JournalCalendarOverlay = React\.memo\(React\.forwardRef/);
  assert.match(source, /const calendarOverlayRef = useRef<JournalCalendarOverlayHandle>\(null\)/);
  assert.match(source, /testID="journal-retained-calendar"/);
  assert.match(source, /pointerEvents="none"/);
  assert.match(source, /importantForAccessibility="no-hide-descendants"/);
  assert.match(
    source,
    /const writeVisibility = useCallback\(\(visible: boolean\) => \{[\s\S]*style: \{ opacity: visible \? 1 : 0 \}[\s\S]*pointerEvents: visible \? 'auto' : 'none'/,
  );
  assert.match(source, /const handleOpenCalendar = useCallback\(\(\) => \{\s*calendarOverlayRef\.current\?\.open\(\);\s*\}, \[\]\)/);
  assert.doesNotMatch(source, /message: 'opened journal calendar'/);
  assert.match(source, /const calendarTheme = useMemo\(\(\) => \(\{/);
  assert.match(source, /current=\{selectedDate\}/);
  assert.match(source, /calendarResetRevision/);
  assert.match(source, /onMonthChange=\{handleMonthChange\}/);
  assert.match(source, /BackHandler\.addEventListener\([\s\S]*'hardwareBackPress'/);
  assert.doesNotMatch(source, /isCalendarPrimed|setIsCalendarPrimed|pendingCalendarOpenRef|scheduleIdleWork/);
  assert.match(source, /const JOURNAL_CALENDAR_BACKDROP_GUARD_MS = 40/);
  assert.match(source, /const handleBackdropPress = useCallback[\s\S]*JOURNAL_CALENDAR_BACKDROP_GUARD_MS/);
  assert.match(source, /onPress=\{close\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="journal\.calendarClose"/);
  assert.match(source, /close\(\);\s*const dateString = day\.dateString;\s*scheduleAfterJournalVisualFeedback/);
  assert.match(source, /<JournalCalendarOverlay[\s\S]*ref=\{calendarOverlayRef\}/);
  assert.doesNotMatch(source, /isCalendarOpen|setIsCalendarOpen/);
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
  assert.match(source, /recordClosePositionJournalRequest\(descriptor\.ticket, descriptor\.journalPayload\)/);
  assert.match(
    source,
    /recordModifyPositionJournalRequest\(normalizedTicket\.path, normalizedPayload\)/,
  );
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
