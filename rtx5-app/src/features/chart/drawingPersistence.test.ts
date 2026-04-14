import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChartDrawingBucketKey,
  getChartDrawingLabels,
  sanitizePersistedChartDrawings,
} from './drawingPersistence';

test('sanitizePersistedChartDrawings keeps only structurally valid drawing records', () => {
  const drawings = sanitizePersistedChartDrawings([
    {
      id: 'trend_1',
      kind: 'trendline',
      label: 'Trend Line 1',
      hidden: false,
      points: [
        { time: 1710000000, price: 1.2345 },
        { time: 1710003600, price: 1.2365 },
      ],
    },
    {
      id: 'bad_measure',
      kind: 'measure',
      points: [{ time: 1710000000, price: 1.2 }],
    },
    {
      id: 'text_1',
      kind: 'text',
      points: [{ time: { year: 2026, month: 4, day: 14 }, price: 1.245 }],
      text: 'TXT',
    },
  ]);

  assert.equal(drawings.length, 2);
  assert.deepEqual(getChartDrawingLabels(drawings), ['Trend Line 1', 'Text 3']);
  assert.equal(drawings[1]?.text, 'TXT');
});

test('getChartDrawingBucketKey normalizes symbol casing and whitespace', () => {
  assert.equal(getChartDrawingBucketKey('  gbpusd  '), 'GBPUSD');
  assert.equal(getChartDrawingBucketKey(''), 'DEFAULT');
});
