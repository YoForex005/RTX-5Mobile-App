import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSourceContains,
  assertSourceOmits,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';
import { translate } from '../../src/i18n/translations.ts';

const nativeSource = readChartScreenSource();

test('LivePriceHeader subscribes to i18n and renders translated Price label', () => {
  const start = nativeSource.indexOf('const LivePriceHeader');
  const end = nativeSource.indexOf('const LiveQuotePairHeader');
  assert.notEqual(start, -1, 'LivePriceHeader must exist');
  assert.notEqual(end, -1, 'LiveQuotePairHeader must exist');
  const body = nativeSource.slice(start, end);

  assertSourceContains(body, /const \{ t \} = useTranslation\(\)/, 'LivePriceHeader must subscribe to language changes');
  assertSourceContains(body, /const priceLabel = t\('Price'\)/, 'price label must come from the translation table');
  assertSourceContains(body, /\{priceLabel\}/, 'translated price label must be rendered');
  assertSourceOmits(body, />PRICE</, 'LivePriceHeader must not render a hardcoded PRICE literal');
});

test('ChartScreen listed static runtime labels use translation calls', () => {
  for (const key of [
    'Loading chart data...',
    'Unable to load chart',
    'Waiting for market data connection...',
    'Chart',
    'Options',
    'Drawing Tools',
    'Timeframes',
    'Select Symbol',
    'Expiration',
  ]) {
    assertSourceContains(nativeSource, new RegExp(`t\\('${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`), `${key} must use t()`);
  }
});

test('Price and chart loading labels update when language changes', () => {
  assert.equal(translate('Price', 'en'), 'Price');
  assert.equal(translate('Price', 'es'), 'Precio');
  assert.equal(translate('Price', 'de'), 'Preis');
  assert.equal(translate('Loading chart data...', 'en'), 'Loading chart data...');
  assert.equal(translate('Loading chart data...', 'es'), 'Cargando datos del gráfico...');
  assert.equal(translate('Loading chart data...', 'en'), 'Loading chart data...');
});
