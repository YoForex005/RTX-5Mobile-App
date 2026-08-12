import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('live chart previews reserve space between the forming candle and price scale', () => {
  const sharedSource = readSource('src/features/chart/preview/chartPreviewShared.ts');
  const nativeSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const webSource = readSource('src/features/chart/preview/LiveChartPreview.web.tsx');

  assert.match(
    sharedSource,
    /export const LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET = 4/,
  );

  for (const source of [nativeSource, webSource]) {
    assert.match(
      source,
      /import \{[\s\S]*LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET,[\s\S]*\} from '\.\/chartPreviewShared'/,
    );
    assert.match(
      source,
      /timeScale: \{[\s\S]*rightOffset: LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET,[\s\S]*shiftVisibleRangeOnNewBar: true,[\s\S]*barSpacing: 13/,
    );
    assert.doesNotMatch(source, /rightOffset: 0/);
  }
});

test('preview right-gap tuning does not alter the main Chart viewport', () => {
  for (const relativePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
    'src/features/chart/rendering/ChartWebViewHtml.ts',
  ]) {
    assert.doesNotMatch(
      readSource(relativePath),
      /LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET/,
      relativePath,
    );
  }
});
