import assert from 'node:assert/strict';
import test from 'node:test';

import {
  disposeChartSymbolPickerSheet,
  getChartSymbolPickerSheetSnapshot,
  hideChartSymbolPickerSheet,
  isChartSymbolPickerSheetActive,
  preloadChartSymbolPickerSheet,
  resetChartSymbolPickerSheetControllerForTests,
  showChartSymbolPickerSheet,
  subscribeChartSymbolPickerSheet,
  type ChartSymbolPickerSheetConfig,
} from './chartSymbolPickerSheetController';
import {
  cancelRetainedActionSheetPreview,
  getRetainedActionSheetVisualSnapshot,
  registerRetainedActionSheetVisualApplier,
  requestRetainedActionSheetPreview,
  resetRetainedActionSheetVisualControllerForTests,
} from '../../ui/components/ActionSheet/retainedActionSheetVisualController';

const AFTER_FIRST_FRAME_SETTLE_MS = 35;

const waitForAdoption = () => new Promise<void>((resolve) => {
  setTimeout(resolve, AFTER_FIRST_FRAME_SETTLE_MS);
});

const createConfig = (visualKey: string): ChartSymbolPickerSheetConfig => Object.freeze({
  actions: [{ label: visualKey }],
  visualKey,
});

const registerMountedHost = (...visualKeys: string[]) => {
  const acceptedKeys = new Set(visualKeys);
  return registerRetainedActionSheetVisualApplier((retainedSnapshot) => (
    retainedSnapshot.mode === 'hidden'
    || (retainedSnapshot.visualKey !== null && acceptedKeys.has(retainedSnapshot.visualKey))
  ));
};

test.afterEach(() => {
  resetChartSymbolPickerSheetControllerForTests();
  resetRetainedActionSheetVisualControllerForTests();
});

test('a first tap before preload falls back to immediate React visibility', () => {
  const config = createConfig('chart.symbolPicker:first-tap');
  const revisions: number[] = [];
  const unsubscribe = subscribeChartSymbolPickerSheet(() => {
    revisions.push(getChartSymbolPickerSheetSnapshot().revision);
  });

  assert.equal(showChartSymbolPickerSheet(config), false);
  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config,
    revision: 1,
    visible: true,
  });
  assert.equal(isChartSymbolPickerSheetActive(), true);
  assert.equal(getRetainedActionSheetVisualSnapshot().mode, 'hidden');
  assert.deepEqual(revisions, [1]);

  assert.equal(hideChartSymbolPickerSheet(), true);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, false);
  assert.deepEqual(revisions, [1, 2]);
  unsubscribe();
});

test('an exact preload takes the retained fast path and adopts visibility after the first frame', async () => {
  const config = createConfig('chart.symbolPicker:retained');
  const unregisterHost = registerMountedHost(config.visualKey);

  assert.equal(preloadChartSymbolPickerSheet(config), true);
  assert.equal(showChartSymbolPickerSheet(config), true);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, false);
  assert.equal(isChartSymbolPickerSheetActive(), true);
  assert.deepEqual(
    {
      mode: getRetainedActionSheetVisualSnapshot().mode,
      visualKey: getRetainedActionSheetVisualSnapshot().visualKey,
    },
    { mode: 'committed', visualKey: config.visualKey },
  );

  await waitForAdoption();

  assert.equal(getChartSymbolPickerSheetSnapshot().config, config);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, true);
  assert.equal(isChartSymbolPickerSheetActive(), true);

  assert.equal(hideChartSymbolPickerSheet(), true);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, false);
  assert.equal(getRetainedActionSheetVisualSnapshot().mode, 'hidden');
  unregisterHost();
});

test('hiding before adoption cannot cancel a newer retained preview owned by another host', async () => {
  const config = createConfig('chart.symbolPicker:owned');
  const unrelatedVisualKey = 'quotes.symbolPicker:newer';
  const unregisterHost = registerMountedHost(config.visualKey, unrelatedVisualKey);

  preloadChartSymbolPickerSheet(config);
  assert.equal(showChartSymbolPickerSheet(config), true);
  const chartRevision = getRetainedActionSheetVisualSnapshot().revision;

  const unrelatedRevision = requestRetainedActionSheetPreview(unrelatedVisualKey);
  assert.ok(unrelatedRevision > chartRevision);
  assert.equal(hideChartSymbolPickerSheet(), true);
  assert.deepEqual(getRetainedActionSheetVisualSnapshot(), {
    mode: 'preview',
    visualKey: unrelatedVisualKey,
    revision: unrelatedRevision,
  });

  await waitForAdoption();

  assert.equal(getChartSymbolPickerSheetSnapshot().visible, false);
  assert.deepEqual(getRetainedActionSheetVisualSnapshot(), {
    mode: 'preview',
    visualKey: unrelatedVisualKey,
    revision: unrelatedRevision,
  });
  assert.equal(cancelRetainedActionSheetPreview(unrelatedRevision), true);
  unregisterHost();
});

test('config updates received while open are deferred until the sheet closes', () => {
  const initialConfig = createConfig('chart.symbolPicker:initial');
  const deferredConfig = createConfig('chart.symbolPicker:deferred');
  const latestDeferredConfig = createConfig('chart.symbolPicker:latest');

  assert.equal(preloadChartSymbolPickerSheet(initialConfig), true);
  assert.equal(showChartSymbolPickerSheet(initialConfig), false);
  assert.equal(getChartSymbolPickerSheetSnapshot().config, initialConfig);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, true);

  assert.equal(preloadChartSymbolPickerSheet(deferredConfig), false);
  assert.equal(preloadChartSymbolPickerSheet(latestDeferredConfig), false);
  assert.equal(getChartSymbolPickerSheetSnapshot().config, initialConfig);

  assert.equal(hideChartSymbolPickerSheet(), true);
  assert.equal(getChartSymbolPickerSheetSnapshot().config, latestDeferredConfig);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, false);
});

test('dispose and test reset cancel pending adoption and clear retained ownership', async () => {
  const firstConfig = createConfig('chart.symbolPicker:dispose');
  const deferredConfig = createConfig('chart.symbolPicker:deferred-dispose');
  const resetConfig = createConfig('chart.symbolPicker:reset');
  const unregisterHost = registerMountedHost(firstConfig.visualKey, resetConfig.visualKey);
  let notifications = 0;
  const unsubscribe = subscribeChartSymbolPickerSheet(() => {
    notifications += 1;
  });

  preloadChartSymbolPickerSheet(firstConfig);
  assert.equal(showChartSymbolPickerSheet(firstConfig), true);
  preloadChartSymbolPickerSheet(deferredConfig);
  disposeChartSymbolPickerSheet();

  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config: null,
    revision: 2,
    visible: false,
  });
  assert.equal(isChartSymbolPickerSheetActive(), false);
  assert.equal(getRetainedActionSheetVisualSnapshot().mode, 'hidden');

  await waitForAdoption();

  assert.equal(getChartSymbolPickerSheetSnapshot().config, null);
  assert.equal(getChartSymbolPickerSheetSnapshot().visible, false);

  preloadChartSymbolPickerSheet(resetConfig);
  assert.equal(showChartSymbolPickerSheet(resetConfig), true);
  resetChartSymbolPickerSheetControllerForTests();

  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config: null,
    revision: 0,
    visible: false,
  });
  assert.equal(isChartSymbolPickerSheetActive(), false);
  assert.equal(getRetainedActionSheetVisualSnapshot().mode, 'hidden');
  assert.equal(hideChartSymbolPickerSheet(), false);

  await waitForAdoption();

  assert.deepEqual(getChartSymbolPickerSheetSnapshot(), {
    config: null,
    revision: 0,
    visible: false,
  });
  assert.ok(notifications >= 4);
  unsubscribe();
  unregisterHost();
});
