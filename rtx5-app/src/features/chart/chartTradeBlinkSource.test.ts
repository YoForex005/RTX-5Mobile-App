import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('chart buy/sell tiles never swap to a spinner and never animate price color per tick', () => {
  const source = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  );

  assert.doesNotMatch(source, /ActivityIndicator/);
  assert.doesNotMatch(source, /from 'react-native'[\s\S]*Animated/);
  assert.doesNotMatch(source, /TRADE_BUTTON_PRICE_UP_FLASH|TRADE_BUTTON_PRICE_DOWN_FLASH/);
  assert.match(source, /Busy state must NOT swap children/);
  assert.match(source, /No per-tick color animation/);
  assert.match(source, /borderWidth: sellBusy \? 2 : 0/);
  assert.match(source, /borderWidth: buyBusy \? 2 : 0/);
  // Positional (liveQuote, fallbackBid, fallbackAsk) crashed when liveQuote was null.
  assert.match(
    source,
    /resolveChartTradeButtonQuote\(\{\s*liveBid: liveQuote\?\.bid,/,
  );
  assert.match(
    source,
    /resolveChartTradeButtonDisplayQuote\(\{\s*liveBid: liveQuote\?\.bid,/,
  );
  assert.match(
    source,
    /resolveSessionQuoteActionAvailability\(liveQuote\)/,
  );
  assert.match(source, /quoteActionQuote: liveQuote/);
  assert.doesNotMatch(
    source,
    /resolveSessionQuoteActionAvailability\(latestQuote\)/,
  );
  assert.doesNotMatch(source, /quoteActionQuote: latestQuote/);
});

test('chart overlay geometry inject is separated from a single-flight latest-label throttle', () => {
  const native = readSource('src/features/chart/ChartScreen.native.tsx');
  const html = readSource('src/features/chart/rendering/ChartWebViewHtml.ts');

  assert.match(native, /const overlayGeometrySignature = useMemo/);
  assert.match(native, /overlayGeometrySignature,/);
  assert.match(native, /const overlayLabelFlushTimerRef = useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(native, /const lastOverlayLabelFlushAtRef = useRef\(0\)/);
  assert.match(native, /if \(overlayLabelFlushTimerRef\.current !== null\) \{\s*return;\s*\}/);
  assert.match(native, /const elapsedMs = Date\.now\(\) - lastOverlayLabelFlushAtRef\.current;\s*const delayMs = Math\.max\(0, 400 - elapsedMs\)/);
  assert.match(
    native,
    /overlayLabelFlushTimerRef\.current = setTimeout\(\(\) => \{[\s\S]*overlayLabelFlushTimerRef\.current = null;[\s\S]*const payload = overlayPayloadRef\.current;[\s\S]*updateOverlayTradeLabels\(\$\{JSON\.stringify\(payload\)\}\)[\s\S]*lastOverlayLabelFlushAtRef\.current = Date\.now\(\)/,
  );
  assert.match(native, /useEffect\(\(\) => \(\) => \{\s*if \(overlayLabelFlushTimerRef\.current !== null\) \{\s*clearTimeout\(overlayLabelFlushTimerRef\.current\);\s*overlayLabelFlushTimerRef\.current = null/);
  assert.match(html, /function updateOverlayTradeLabels\(payload\)/);
  assert.match(html, /window\.updateOverlayTradeLabels = updateOverlayTradeLabels/);
  assert.match(html, /buildOverlayNativeLineSignature/);
  assert.match(
    html,
    /applyOverlayPayload\(_overlayPayload\);[\s\S]*schedulePriceScaleHealthCheck\('overlay_update', false, 1\)/,
  );
  assert.doesNotMatch(
    html,
    /applyOverlayPayload\(_overlayPayload\);[\s\S]*scheduleOverlayVisibleCandleScaleRecovery\('overlay_update'\)/,
  );
});

test('open-trade DOM lines/labels update in place (never full-layer wipe on ticks)', () => {
  const html = readSource('src/features/chart/rendering/ChartWebViewHtml.ts');

  // Root cause of the post-place-order horizontal blink: open trades use
  // DOM-only lines (native lineVisible:false). Wiping the overlay layer on
  // every setLivePriceLine/refresh blanked those lines for a frame.
  assert.match(html, /var _overlayDomNodesByKey = Object\.create\(null\)/);
  assert.match(html, /function upsertOverlayDomNode\(layer, key, className\)/);
  assert.match(html, /function pruneOverlayDomNodes\(liveKeys\)/);
  assert.match(html, /NEVER wipe the whole overlay layer on routine refreshes/);
  assert.match(html, /upsertOverlayDomNode\(layer, lineKey, 'rtx5-anchored-trade-line'\)/);
  assert.match(html, /pruneOverlayDomNodes\(liveOverlayKeys\)/);
  assert.match(
    html,
    /function refreshOverlayDomLabels\(payload\)[\s\S]*if \(!series\) \{\s*clearOverlayDomLabels\(\)/,
  );
  // Live quote ticks must not rebuild trade labels — market badge only.
  assert.match(html, /function scheduleMarketPriceScaleDomOnly\(\)/);
  assert.match(html, /if \(shouldScheduleRefresh !== false\) scheduleMarketPriceScaleDomOnly\(\)/);
});

test('trade screen does not remount FlatList on focus (list remount caused row blink)', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  assert.doesNotMatch(source, /key=\{`trade-positions-\$\{tradeFocusGeneration\}`\}/);
  assert.doesNotMatch(source, /tradeFocusGeneration/);
});

test('trade feedback modal is an absolute overlay (not RN Modal) to avoid WebView blink', () => {
  const source = readSource('src/ui/components/TradeFeedbackModal.tsx');
  assert.doesNotMatch(source, /from 'react-native'.*Modal|Modal,/);
  assert.doesNotMatch(source, /<Modal/);
  assert.match(source, /Absolute overlay \(not RN Modal\)/);
  assert.match(source, /zIndex: 10050/);
});
