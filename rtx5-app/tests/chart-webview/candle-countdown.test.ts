import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  extractFunctionBody,
} from '../support/chartSourceTestUtils';

const readProjectFile = (relativePath: string): string => {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), 'rtx5-app', relativePath),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  assert.ok(path, `${relativePath} was not found`);
  return readFileSync(path, 'utf8');
};

const webViewSource = readProjectFile('src/features/chart/rendering/ChartWebViewHtml.ts');
const nativeSource = readProjectFile('src/features/chart/ChartScreen.native.tsx');
const webSource = readProjectFile('src/features/chart/ChartScreen.web.tsx');
const webBadgeSource = readProjectFile(
  'src/features/chart/components/ChartCandleCountdownBadge.web.tsx',
);

test('native bridge pushes the exact selected timeframe into a strict countdown setter', () => {
  const normalizeBody = extractFunctionBody(webViewSource, 'normalizeCandleCountdownTimeframe');
  const setterBody = extractFunctionBody(webViewSource, 'setCandleCountdownTimeframe');

  assertSourceContains(
    nativeSource,
    /setCandleCountdownTimeframe\(\$\{JSON\.stringify\(chartTimeframe\)\}\)/,
    'native must bridge the selected chart timeframe rather than a fixed/default timeframe',
  );
  assertSourceContains(
    normalizeBody,
    /Object\.prototype\.hasOwnProperty\.call\(CANDLE_COUNTDOWN_FIXED_SECONDS, normalized\)/,
    'WebView countdown timeframe parsing must accept only supported explicit intervals',
  );
  assert.doesNotMatch(normalizeBody, /\?\?\s*'M1'|\|\|\s*'M1'|return\s+'M1'/);
  assertSourceContains(
    setterBody,
    /candleCountdownTimeframe = normalizeCandleCountdownTimeframe\(timeframe\)/,
    'setter must preserve strict invalid-to-null behavior',
  );
  assertSourceContains(
    nativeSource,
    /setCandleCountdownActive\(\$\{chartRuntimeActive && chartDisplay\.showLivePriceLine\}\)/,
    'native must pause the DOM ticker while the retained chart or live-price line is inactive',
  );
});

test('WebView countdown is anchored to the active candle and never creates a candle', () => {
  const remainingBody = extractFunctionBody(webViewSource, 'getCandleCountdownRemainingSeconds');
  const closeBody = extractFunctionBody(webViewSource, 'resolveCandleCountdownCloseTimeMs');
  const tickerBody = extractFunctionBody(webViewSource, 'scheduleNextCandleCountdownTick');

  assertSourceContains(
    remainingBody,
    /normalizeCandleCountdownBarTimeSeconds\(lastBarTime\)[\s\S]*resolveCandleCountdownCloseTimeMs\(barTimeSeconds, normalizedTimeframe\)/,
    'remaining time must be calculated from the active candle timestamp',
  );
  assertSourceContains(
    closeBody,
    /normalizedTimeframe === 'MN'[\s\S]*Date\.UTC\(barDate\.getUTCFullYear\(\), barDate\.getUTCMonth\(\) \+ 1, 1\)/,
    'monthly countdown must use a calendar month boundary',
  );
  assertSourceContains(
    remainingBody,
    /Math\.max\(0, Math\.ceil\(\(closeTimeMs - currentTimeMs\) \/ 1000\)\)/,
    'expired candles must display zero until a newer candle timestamp arrives',
  );
  assertSourceContains(
    tickerBody,
    /setTimeout\(function\(\)[\s\S]*scheduleMarketPriceScaleDomOnly\(\)[\s\S]*scheduleNextCandleCountdownTick\(\)/,
    'countdown must update locally on aligned timer ticks',
  );
  assert.doesNotMatch(`${remainingBody}\n${closeBody}\n${tickerBody}`, /series\.update|updateTick\(|updateLiveTick\(/);
});

test('native live price badge renders price first and countdown directly below it', () => {
  const renderBody = extractFunctionBody(webViewSource, 'renderMarketPriceScaleBadge');
  const collectBody = extractFunctionBody(webViewSource, 'collectMarketPriceScaleBadge');

  assertSourceContains(
    renderBody,
    /rtx5-market-price-scale-badge-price[\s\S]*rtx5-market-price-scale-badge-countdown[\s\S]*appendChild\(priceRow\)[\s\S]*appendChild\(countdownRow\)/,
    'badge must retain ordered price and countdown rows',
  );
  assertSourceContains(
    collectBody,
    /desiredTop = Math\.round\(y - priceRowHeight \/ 2\)/,
    'the chart price line must cross the price row rather than the countdown row',
  );
  assertSourceContains(
    webViewSource,
    /window\.setCandleCountdownTimeframe = setCandleCountdownTimeframe/,
    'countdown setter must be part of the WebView bridge contract',
  );
  assertSourceContains(
    webViewSource,
    /window\.setCandleCountdownActive = setCandleCountdownActive/,
    'countdown activity gate must be part of the WebView bridge contract',
  );
});

test('web chart replaces the one-row built-in label with the same two-row badge', () => {
  assertSourceContains(
    webSource,
    /ChartCandleCountdownBadge[\s\S]*timeframe=\{chartTimeframe\}[\s\S]*visible=\{chartDisplay\.showLivePriceLine && candlesAvailable\}/,
    'web chart must render the countdown from the selected timeframe',
  );
  assert.equal((webSource.match(/lastValueVisible: false/g) ?? []).length >= 3, true);
  assertSourceContains(
    webBadgeSource,
    /getChartCandleCountdownSeconds\(\{[\s\S]*candleOpenTime: currentCandle\.time,[\s\S]*timeframe: current\.timeframe/,
    'web badge must use the same strict candle-boundary helper',
  );
  assertSourceContains(
    webBadgeSource,
    /<span ref=\{priceRef\}[\s\S]*data-rtx5-role="candle-countdown"/,
    'web price row must be followed by the countdown row',
  );
});
