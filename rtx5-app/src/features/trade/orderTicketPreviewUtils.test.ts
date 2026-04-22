import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOrderTicketPreviewSeries,
  resolveOrderTicketPriceDecimals,
} from './orderTicketPreviewUtils';

test('preview series pads history and anchors the last point to live bid ask', () => {
  const series = buildOrderTicketPreviewSeries({
    candles: [{ close: 1.2010 }, { close: 1.2012 }],
    bid: 1.2008,
    ask: 1.2010,
    sampleSize: 4,
  });

  assert.equal(series.length, 4);
  assert.deepEqual(series[series.length - 1], { bid: 1.2008, ask: 1.2010 });
  assert.deepEqual(series[0], series[1]);
});

test('price-decimal resolution respects the instrument tick size when present', () => {
  assert.equal(resolveOrderTicketPriceDecimals(0.0001, 1.2, 1.2002), 4);
  assert.equal(resolveOrderTicketPriceDecimals(0.01, 2450.1, 2450.3), 2);
});
