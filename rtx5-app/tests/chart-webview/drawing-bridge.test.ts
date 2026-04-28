import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('required drawing bridge functions remain exposed on window', () => {
  [
    'setDrawingTool',
    'clearDrawings',
    'setSerializedDrawings',
    'setDrawingsLocked',
    'setDrawingsHidden',
    'setStayInDrawingMode',
    'setMagnetMode',
    'zoomChart',
  ].forEach((method) => {
    assertSourceContains(source, new RegExp(`window\\.${method} = ${method}`), `${method} must remain a WebView bridge API`);
  });
});

test('drawing manager is recreated on chart init and removed before re-init', () => {
  const body = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(body, /if \(window\._drawingManager\)[\s\S]*window\._drawingManager\.remove\(\)[\s\S]*window\._drawingManager = null/, 'old drawing manager must be removed before re-init');
  assertSourceContains(body, /new window\.DrawingToolsManager\(chart, series\)/, 'drawing manager must be recreated for the current series');
});

test('native drawing sync restores serialized drawings after chart ready epoch changes', () => {
  assertSourceContains(
    source,
    /lastInjectedDrawingSyncRef\.current\.signature === chartDrawingSignature[\s\S]*lastInjectedDrawingSyncRef\.current\.epoch === chartReadyEpoch/,
    'drawing sync must be keyed by both drawing signature and chart ready epoch',
  );
  assertSourceContains(
    source,
    /setSerializedDrawings\(\$\{JSON\.stringify\(chartDrawingRecords\)\}\)/,
    'native side must inject serialized drawings into WebView',
  );
});

test('DRAWINGS_CHANGED sanitizes payload and persists only when signature changes', () => {
  assertSourceContains(
    source,
    /msg\.type === 'DRAWINGS_CHANGED'[\s\S]*sanitizePersistedChartDrawings\(msg\.drawings\)[\s\S]*nextSignature !== drawingSignatureRef\.current[\s\S]*setChartDrawingRecordsForSymbol\(chartSymbol, nextDrawings\)/,
    'drawing changes must be sanitized and persisted for the active chart symbol',
  );
});

test('drawing lock hide sticky and magnet state are pushed after WebView chart is ready', () => {
  assertSourceContains(
    source,
    /if \(!webViewReady \|\| !chartCanvasReady\) return[\s\S]*setDrawingsLocked\(\$\{chartLockAll\}\)[\s\S]*setDrawingsHidden\(\$\{chartHideAll\}\)[\s\S]*setStayInDrawingMode\(\$\{stickyDrawingMode\}\)[\s\S]*setMagnetMode\(\$\{magnetEnabled\}\)/,
    'drawing interaction flags must be bridged only after the chart exists',
  );
});
