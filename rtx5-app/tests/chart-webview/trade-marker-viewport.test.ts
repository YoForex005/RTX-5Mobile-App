import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSourceContains,
  assertSourceOmits,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

// MT5-parity contract: an open trade may be OUTSIDE the visible viewport, but
// it must never be removed from chart state because of that. Markers are
// clipped with visibility, recomputed from their real price on every render,
// and must survive stranded gesture flags.

test('trade markers reposition from their real price on every visible-range change', () => {
  const repositionBody = extractFunctionBody(source, 'repositionTradeOverlayDomNodes');

  assertSourceContains(
    repositionBody,
    /series\.priceToCoordinate\(ln\.price\)/,
    'reposition pass must derive marker y from the trade\'s REAL price every time',
  );
  assertSourceContains(
    repositionBody,
    /lineNode\.style\.top = Math\.round\(y\) \+ 'px'/,
    'reposition pass must rewrite the anchored trade line position',
  );
  assertSourceContains(
    repositionBody,
    /labelNode\.style\.top =[\s\S]*OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP/,
    'reposition pass must rewrite the trade label position with the same anchor offset as the full refresh',
  );
  assertSourceContains(
    repositionBody,
    /boxNode\.style\.top = Math\.round\(y - OVERLAY_POSITION_BOX_HEIGHT \/ 2\) \+ 'px'/,
    'reposition pass must rewrite the right-axis price box position',
  );
  assertSourceOmits(
    repositionBody,
    /removeChild|createElement|pruneOverlayDomNodes/,
    'reposition pass must be position-only — never create or delete marker nodes',
  );

  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(range\) \{[\s\S]{0,900}scheduleTradeOverlayReposition\(\);/,
    'every visible-range change (pan, momentum, zoom, autoscroll, history load) must reschedule marker repositioning',
  );
});

test('trade markers keep tracking during gesture-deferred frames (pinch, right-scale drag, horizontal pan)', () => {
  const deferHorizontalBody = extractFunctionBody(source, 'deferHorizontalGestureDomWork');
  const deferVerticalBody = extractFunctionBody(source, 'deferVerticalGestureDomWork');

  assertSourceContains(
    deferHorizontalBody,
    /scheduleTradeOverlayReposition\(\)/,
    'horizontal gesture deferral must still keep marker positions glued to price',
  );
  assertSourceContains(
    deferVerticalBody,
    /scheduleTradeOverlayReposition\(\)/,
    'right-price-scale drag deferral must still keep marker positions glued to price',
  );
  assertSourceContains(
    source,
    /scheduleGestureRightPriceScaleFallbackRefresh\(\);[\s\S]{0,400}scheduleTradeOverlayReposition\(\);\s*return;/,
    'pinch/scale move frames must reposition trade markers instead of freezing them',
  );
});

test('off-viewport trades are clipped with visibility, never deleted from chart state', () => {
  const paneBoundsBody = extractFunctionBody(source, 'resolveTradeOverlayPaneBounds');
  const insidePaneBody = extractFunctionBody(source, 'isTradeOverlayYInsidePane');
  const repositionBody = extractFunctionBody(source, 'repositionTradeOverlayDomNodes');
  const anchoredLineBody = extractFunctionBody(source, 'renderAnchoredTradeLine');
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels(payload)');

  assertSourceContains(
    paneBoundsBody,
    /return null/,
    'unavailable pane metrics must never hide markers (fail open)',
  );
  assertSourceContains(
    insidePaneBody,
    /if \(!bounds\) return true/,
    'missing pane bounds must render markers as visible',
  );
  assertSourceContains(
    repositionBody,
    /isTradeOverlayYInsidePane\(y, bounds\) \? 'visible' : 'hidden'/,
    'reposition pass must clip via visibility only',
  );
  assertSourceContains(
    anchoredLineBody,
    /line\.style\.visibility = isTradeOverlayYInsidePane\(item\.y, resolveTradeOverlayPaneBounds\(\)\)/,
    'anchored trade line must clip via visibility at its true coordinate',
  );
  assertSourceContains(
    refreshBody,
    /paneVisible: isTradeOverlayYInsidePane\(y, tradeOverlayPaneBounds\)/,
    'full refresh must carry pane visibility per marker record',
  );
  assertSourceContains(
    refreshBody,
    /boxEl\.style\.visibility = isTradeOverlayYInsidePane\(box\.y, tradeOverlayPaneBounds\)/,
    'right-axis price box must gate on the RAW price coordinate, not the stacked offset',
  );
  assertSourceOmits(
    refreshBody,
    /if \(y < 0 \|\| y > [\s\S]{0,60}\) continue;/,
    'off-viewport markers must not be skipped out of the render (that deletes their DOM via prune)',
  );
});

test('stranded gesture flags cannot permanently freeze or hide trade markers', () => {
  const resyncBody = extractFunctionBody(source, 'startOverlayResync');

  assertSourceContains(
    resyncBody,
    /overlayDeferralStranded/,
    'overlay resync must include the stranded-gesture watchdog',
  );
  assertSourceContains(
    resyncBody,
    /!lastPostedChartTouchActive/,
    'watchdog must only fire when no touch input is active',
  );
  assertSourceContains(
    resyncBody,
    /lastOverlayGestureDeferralActivityAt > OVERLAY_GESTURE_DEFERRAL_STALL_MS/,
    'watchdog must wait for deferral activity to stop (momentum frames stamp activity)',
  );
  assertSourceContains(
    resyncBody,
    /horizontalScrollMotionActive = false;[\s\S]{0,400}applyDeferredHorizontalOverlayPayload\(\);[\s\S]{0,200}applyDeferredVerticalOverlayPayload\(\);/,
    'watchdog must clear stranded flags and flush the deferred overlay payloads',
  );
  assertSourceContains(
    resyncBody,
    /refreshOverlayDomLabels\(_appliedOverlayPayload \|\| _overlayPayload\)/,
    'watchdog settle must rebuild marker DOM from the retained payload',
  );
});

test('same-context background history refresh preserves a user-owned vertical pan', () => {
  const updateBody = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(
    updateBody,
    /var previousDataContextSig = lastInitDataContextSig/,
    'update must capture the previous data context before overwriting it',
  );
  assertSourceContains(
    updateBody,
    /paintedDataContextSig === previousDataContextSig &&\s*isManualVerticalPanRangeLocked\(\)/,
    'a same symbol+timeframe refresh must not reset a locked manual vertical pan',
  );
  assertSourceContains(
    updateBody,
    /didReplaceVisibleSeries = false;\s*suppressedManualPanReset = true;/,
    'suppression must downgrade the replacement to a stable update',
  );
  assertSourceContains(
    updateBody,
    /if \(suppressedManualPanReset\) \{[\s\S]{0,300}applyManualVerticalPanLockedRange\(\);/,
    'suppression must reassert the user\'s locked price range after setData',
  );
});

test('vertical fling glides with unbounded reach and stays interruptible', () => {
  assertSourceContains(
    source,
    /var applyVerticalPanAt = function\(clientY\) \{[\s\S]{0,900}vertPanState\.velocityPxMs =/,
    'vertical pan moves must track fling velocity',
  );
  assertSourceContains(
    source,
    /var startVerticalPanGlide = function\(velocityPxMs, pricePerPixel, startRange\) \{[\s\S]{0,4000}renderVerticalPanRange\(state\.range\)/,
    'fling glide must keep shifting the price range through the shared vertical-pan renderer',
  );
  const renderVerticalPanRangeMatch = source.match(
    /var renderVerticalPanRange = function\(nextRange\) \{[\s\S]*?\n {8}\};/,
  );
  assert.ok(renderVerticalPanRangeMatch, 'renderVerticalPanRange must exist');
  assertSourceOmits(
    renderVerticalPanRangeMatch[0],
    /Math\.max\([^)]*candle|clamp/i,
    'vertical pan range must not be clamped to candle data — old trade prices must stay reachable',
  );
  assertSourceContains(
    source,
    /startVerticalPanGlide\(flingVelocityPxMs, flingPricePerPixel, finalRange\)/,
    'finger-up with velocity must hand the pan to the kinetic glide',
  );
  assertSourceContains(
    source,
    /var onPointerDown = function\(event\) \{[\s\S]{0,400}stopVerticalPanGlide\(\)/,
    'touching the chart must catch the glide',
  );
  assertSourceContains(
    extractFunctionBody(source, 'clearManualVerticalPanRange'),
    /stopVerticalPanGlideHook/,
    'manual-range clears (auto-scale toggle, series replacement) must stop the glide',
  );
  assertSourceContains(
    source,
    /if \(Math\.abs\(state\.v\) <= VERT_PAN_GLIDE_STOP_VELOCITY_PX_MS\) \{[\s\S]{0,600}applyManualVerticalPanLockedRange\(\);/,
    'glide settle must lock the final user-owned range',
  );
});

test('trade lines never stretch the candle autoscale to keep old entries visible', () => {
  const autoscaleBody = extractFunctionBody(source, 'buildOverlayAwareAutoscaleInfo');
  const nativeLineGateBody = extractFunctionBody(source, 'shouldCreateOverlayNativePriceLine');

  assertSourceOmits(
    autoscaleBody,
    /expandPriceRangeForTradeOverlays/,
    'autoscale must not be expanded just to include far-away trade entries',
  );
  assertSourceContains(
    nativeLineGateBody,
    /isTradeOverlayScaleLine\(line\)/,
    'trade entry lines must stay out of the native price-line autoscale path',
  );
});
