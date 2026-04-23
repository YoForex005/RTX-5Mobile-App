import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveFooterLotCommitDraft,
  resolveFooterTradeRowState,
  resolveKeyboardDockOffset,
  shouldShowChartTradePreviewOnChart,
  shouldShowChartTradeSheetHeader,
} from './chartTradeInteractionUtils.ts';

test('resolveFooterLotCommitDraft prefers the latest non-empty override', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '0.23',
      draftRef: '0.15',
      currentDraft: '0.10',
    }),
    '0.23',
  );
});

test('resolveFooterLotCommitDraft falls back when the event payload is blank', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '',
      draftRef: '0.37',
      currentDraft: '0.10',
    }),
    '0.37',
  );
});

test('resolveFooterLotCommitDraft sanitizes invalid characters before commit', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: ' 0..2a5 ',
      draftRef: '0.10',
      currentDraft: '0.10',
    }),
    '0.25',
  );
});

test('resolveFooterLotCommitDraft returns blank only when every source is blank', () => {
  assert.equal(
    resolveFooterLotCommitDraft({
      draftOverride: '',
      draftRef: '',
      currentDraft: '',
    }),
    '',
  );
});

test('resolveFooterTradeRowState keeps the Android floating editor mounted while keyboard height is still unknown', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      showChartTradeSheet: false,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState shows the Android floating editor once the keyboard height is known', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: true,
      showChartTradeSheet: false,
      keyboardDockOffset: 288,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 288,
    },
  );
});

test('resolveFooterTradeRowState keeps the iOS floating editor visible without waiting for an Android keyboard event', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'ios',
      footerLotEditorFocused: true,
      showChartTradeSheet: false,
      keyboardDockOffset: 0,
    }),
    {
      shouldMountFloatingFooterTradeRow: true,
      isFloatingFooterTradeRowVisible: true,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('resolveFooterTradeRowState disables the floating row when the editor is closed', () => {
  assert.deepEqual(
    resolveFooterTradeRowState({
      platform: 'android',
      footerLotEditorFocused: false,
      showChartTradeSheet: false,
      keyboardDockOffset: 288,
    }),
    {
      shouldMountFloatingFooterTradeRow: false,
      isFloatingFooterTradeRowVisible: false,
      footerTradeRowKeyboardOffset: 0,
    },
  );
});

test('chart trade preview stays visible only while the trade sheet is collapsed', () => {
  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: true,
      chartTradeSheetMode: 'collapsed',
    }),
    true,
  );

  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: true,
      chartTradeSheetMode: 'expanded',
    }),
    false,
  );

  assert.equal(
    shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: false,
      chartTradeSheetMode: 'collapsed',
    }),
    false,
  );
});

test('resolveKeyboardDockOffset prefers real keyboard overlap from screenY on Android', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 620,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    76,
  );
});

test('resolveKeyboardDockOffset falls back to keyboard height minus safe bottom on Android', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: null,
      containerBottom: null,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    288,
  );
});

test('resolveKeyboardDockOffset keeps the full keyboard height on iOS', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'ios',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 620,
      screenHeight: 800,
      safeAreaBottom: 34,
    }),
    312,
  );
});

test('resolveKeyboardDockOffset returns zero when the resized Android container already ends at the keyboard top', () => {
  assert.equal(
    resolveKeyboardDockOffset({
      platform: 'android',
      keyboardHeight: 312,
      keyboardScreenY: 544,
      containerBottom: 544,
      screenHeight: 800,
      safeAreaBottom: 24,
    }),
    0,
  );
});

test('chart trade sheet header hides only in expanded mode', () => {
  assert.equal(shouldShowChartTradeSheetHeader({ chartTradeSheetMode: 'collapsed' }), true);
  assert.equal(shouldShowChartTradeSheetHeader({ chartTradeSheetMode: 'expanded' }), false);
});
