import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readGraphSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/OrderTickExecutionGraph.tsx'), 'utf8');

test('order execution graph keeps uniform spacing between all horizontal guides', () => {
  const source = readGraphSource();

  assert.doesNotMatch(source, /GRAPH_BOTTOM_GUIDE_GAP/);
  assert.match(
    source,
    /const gridLineSpacing = Math\.max\([\s\S]*height - GRAPH_TOP_PADDING - GRAPH_BOTTOM_PADDING[\s\S]*\/ Math\.max\(GRAPH_LABEL_COUNT, 1\)/,
  );
  assert.match(
    source,
    /const plotHeight = Math\.max\(0, gridLineSpacing \* Math\.max\(GRAPH_LABEL_COUNT - 1, 0\)\);/,
  );
  assert.match(
    source,
    /GRAPH_TOP_PADDING \+ gridLineSpacing \* Math\.max\(GRAPH_LABEL_COUNT, 1\)/,
  );
});

test('order execution graph keeps the right-side price labels close to the grid edge', () => {
  const source = readGraphSource();

  assert.match(source, /const GRAPH_RIGHT_AXIS_WIDTH = GRAPH_BADGE_WIDTH \+ GRAPH_BADGE_GAP;/);
  assert.match(source, /const GRAPH_AXIS_LABEL_OFFSET = 48;/);
  assert.match(
    source,
    /const plotWidth = Math\.max\(0, layoutWidth - GRAPH_RIGHT_AXIS_WIDTH - GRAPH_LEFT_PADDING\);/,
  );
  assert.match(
    source,
    /const priceLabelX = Math\.min\([\s\S]*layoutWidth - GRAPH_AXIS_LABEL_RIGHT_PADDING,[\s\S]*plotRight \+ GRAPH_AXIS_LABEL_OFFSET/,
  );
});

test('order execution graph renders a price label for the lowest dotted guide', () => {
  const source = readGraphSource();

  assert.match(
    source,
    /const bottomGuidePriceLevel =\s*chartMin - chartSpan \/ Math\.max\(GRAPH_LABEL_COUNT - 1, 1\);/,
  );
  assert.match(
    source,
    /y=\{graphBottomGuideY \+ 4\}[\s\S]*\{bottomGuidePriceLevel\.toFixed\(priceDecimals\)\}/,
  );
});

test('order execution graph renders generated traces with a pencil-style rounded stroke', () => {
  const source = readGraphSource();

  assert.match(source, /const GRAPH_TRACE_SOFT_STROKE_WIDTH = 2\.2;/);
  assert.match(source, /const GRAPH_TRACE_MAIN_STROKE_WIDTH = 1\.05;/);
  assert.match(source, /const GRAPH_TRACE_SOFT_OPACITY = 0\.18;/);
  assert.doesNotMatch(source, /strokeWidth="0\.6"/);
  assert.doesNotMatch(source, /strokeLinejoin="miter"/);
  assert.doesNotMatch(source, /strokeLinecap="butt"/);
  assert.match(source, /strokeOpacity=\{GRAPH_TRACE_SOFT_OPACITY\}/);
  assert.match(source, /strokeLinejoin="round"/);
  assert.match(source, /strokeLinecap="round"/);
});
