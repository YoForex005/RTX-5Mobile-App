import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldAcceptChartDataPaint,
  shouldAcceptChartReady,
} from './chartReadyContext';

const CURRENT_XAUUSD_M1 = {
  configSig: 'candles-grid-dark',
  dataContextSig: 'XAUUSD-M1',
};

test('accepts an older candle snapshot acknowledgement for the active XAUUSD context', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: 'candles-grid-dark:older-xauusd-snapshot',
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    true,
  );
});

test('rejects a delayed acknowledgement from the previously selected symbol', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: 'candles-grid-dark:gbpusd-snapshot',
        configSig: 'candles-grid-dark',
        dataContextSig: 'GBPUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
});

test('rejects missing init identity or a stale visual shell', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: '',
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: 'light-shell:xauusd-snapshot',
        configSig: 'light-shell',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
});

test('rejects an acknowledgement that no longer owns the latest dispatched context', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: 'candles-grid-dark:xauusd-snapshot',
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      {
        configSig: 'candles-grid-dark',
        dataContextSig: 'BTCUSD-M1',
      },
    ),
    false,
  );
});

test('accepts only the latest data-paint token for the selected XAUUSD context', () => {
  const pending = {
    paintToken: 'XAUUSD-M1:8',
    dataContextSig: 'XAUUSD-M1',
  };
  assert.equal(
    shouldAcceptChartDataPaint(pending, pending, 'XAUUSD-M1'),
    true,
  );
  assert.equal(
    shouldAcceptChartDataPaint(
      {
        paintToken: 'XAUUSD-M1:7',
        dataContextSig: 'XAUUSD-M1',
      },
      pending,
      'XAUUSD-M1',
    ),
    false,
  );
  assert.equal(
    shouldAcceptChartDataPaint(
      {
        paintToken: 'GBPUSD-M1:8',
        dataContextSig: 'GBPUSD-M1',
      },
      pending,
      'XAUUSD-M1',
    ),
    false,
  );
});
