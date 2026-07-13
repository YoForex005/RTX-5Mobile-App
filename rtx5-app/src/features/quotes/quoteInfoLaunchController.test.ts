import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createQuoteInfoLaunchController,
  quoteInfoLaunchController,
  scheduleQuoteInfoLaunchNavigation,
} from './quoteInfoLaunchController';

test('quote-info launch controller prepares both exact shells and tracks route coverage', () => {
  const controller = createQuoteInfoLaunchController();
  const visualEvents: Array<string | null> = [];
  const unregisterVisual = controller.registerVisualApplier((destination) => {
    visualEvents.push(destination);
  });
  visualEvents.length = 0;

  controller.prepare('XAUUSDm');
  assert.equal(controller.getSnapshot().symbol, 'XAUUSD');
  assert.equal(controller.getSnapshot().phase, 'prepared');

  const revision = controller.show('market-statistics', 'XAUUSDm');
  assert.deepEqual(visualEvents, ['market-statistics']);
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.startNavigation(revision + 1), false);
  assert.equal(controller.startNavigation(revision), true);
  assert.equal(controller.markCovered('properties'), false);
  assert.equal(controller.markCovered('market-statistics'), true);
  assert.deepEqual(visualEvents, ['market-statistics', null]);
  assert.equal(controller.getSnapshot().phase, 'covered');
  assert.equal(controller.getSnapshot().visible, false);
  assert.equal(controller.complete('market-statistics'), true);
  assert.equal(controller.getSnapshot().phase, 'hidden');

  unregisterVisual();
});

test('closing the quote-info shell cancels scheduled native navigation', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let frameQueue: Array<(timestamp: number) => void> = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: (timestamp: number) => void) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
  });

  try {
    const revision = quoteInfoLaunchController.show('properties', 'EURUSD');
    let navigations = 0;
    scheduleQuoteInfoLaunchNavigation(revision, () => {
      navigations += 1;
    });
    quoteInfoLaunchController.hide(revision);

    const flushFrame = () => {
      const callbacks = frameQueue;
      frameQueue = [];
      callbacks.forEach((callback) => callback(0));
    };
    flushFrame();
    flushFrame();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(navigations, 0);
    assert.equal(quoteInfoLaunchController.isVisible(), false);
  } finally {
    quoteInfoLaunchController.hide();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});
