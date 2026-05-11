import { LIGHTWEIGHT_CHARTS_JS } from "./lightweightChartsBundle";
import { RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS } from "../../../domain/candles/rendering/customCandlestickSeriesWebView";
import { ENHANCED_DRAWING_TOOLS_JS } from "../plugins/enhancedDrawingToolsString";
import { CHART_DEFAULT_VISIBLE_BAR_MAX, CHART_DEFAULT_VISIBLE_BAR_TARGET_PX, CHART_DEFAULT_VISIBLE_BAR_MIN, CHART_DEFAULT_TIME_SCALE_BAR_SPACING, CHART_DEFAULT_RESET_BAR_SPACING_MAX, CHART_DEFAULT_RESET_BAR_SPACING_MIN, CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET, CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING } from "../ChartScreen.constants";

export const CH_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <meta name="color-scheme" content="light dark">
    <script>${LIGHTWEIGHT_CHARTS_JS}</script>
    <script>${RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS}</script>

    <script>${ENHANCED_DRAWING_TOOLS_JS}</script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #chart { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script>
      // ─────────────────────────────────────────────────────────────────
      //   Minimal, fresh candle pipeline
      //
      //   Contract with the React Native host:
      //     • host calls initChart(opts, chartType, candles, displayDecimals)
      //         once per (symbol, timeframe, type) change
      //     • host calls updateChartData(candles) whenever the canonical
      //         history+live candle array changes
      //     • host may still call updateTick(candle) for narrow live patches,
      //         but the chart no longer depends on a second websocket delta
      //         bridge to stay in sync
      //     • host calls setBidPriceLine(price) for the live BID line
      //
      //   Native candlesticks use the RTX5 custom series so wick/body
      //   geometry stays centered and stable on mobile WebView pixel grids.
      //   Line and OHLC bars still use the standard lightweight-charts
      //   series implementations. Pre-existing gaps in the data stay visible.
      // ─────────────────────────────────────────────────────────────────
      // Diagnostic: verify library loaded
      if (typeof LightweightCharts === 'undefined') {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: 'FATAL: LightweightCharts library did not load. typeof=' + typeof LightweightCharts
          }));
        } catch(_) {}
      }

      var chart = null;
      var series = null;
      var bidPriceLine = null;
      var askPriceLine = null;
      var marketPriceLinesVisible = false;
      var marketBidColor = '#2962FF';
      var marketAskColor = '#F23645';
      // Dedicated horizontal line at the live close. We own this instance
      // so we can retint it blue (up candle) / red (down candle) and shift
      // its price on every tick WITHOUT calling applyOptions on the main
      // candle series (which internally forces a full data redraw and was
      // causing history to blank on bucket updates).
      var directionPriceLine = null;
      // Same idea on the move-bars pane — horizontal line at the live bar's
      // move magnitude, tinted blue / red in lockstep with the candle.
      var moveDirectionPriceLine = null;
      var lastBarTime = 0;
      var seriesType = 'candles';
      var pendingTick = null;
      var tickFlushHandle = 0;
      var currentSeriesLength = 0;
      var lastDisplayDecimals = 2;
      var lastRawSeriesData = [];
      var shouldShowLowerPane = true;
      var lastInitHostOptions = null;
      var lastInitChartType = 'candles';
      var lastInitShowLowerPane = true;
      var lastRequestedDisplayDecimals = 2;
      var lastBidPrice = null;
      var lastAskPrice = null;
      // Price-movement histogram shown below the candles. Bar height equals
      // |close − open| for that bar (the magnitude of the candle's move),
      // coloured green when the candle closed up, red when it closed down.
      // It IS NOT traded volume — it's a direct visual echo of the candle's
      // own size, so the bar grows and shrinks in sync with the candle.
      var moveBarsSeries = null;
      var moveUpColor = 'rgba(38,166,154,0.85)';
      var moveDownColor = 'rgba(239,83,80,0.85)';
      // Captured from the active candle series so the bid line + last-price
      // line can tint themselves to match the live candle's direction.
      var barUpColor = '#2962FF';
      var barDownColor = '#ef5350';
      var detachChartTapListeners = null;
      var lastPostedChartTap = { x: NaN, y: NaN, at: 0 };
      var pendingPointerTap = null;
      var suppressChartTapUntil = 0;
      var lastPriceLineDirection = null; // 'up' | 'down' — last colour applied
      var overlayRefreshRaf = 0;
      var overlayPriceScaleLockRaf = 0;
      var manualPriceScaleRangeActive = false;
      var verticalPricePanGestureActive = false;
      var chartTouchInteractionSuspendDepth = 0;
      var lastPostedChartTouchActive = false;
      var OVERLAY_LABEL_LINE_HEIGHT = 14;
      var OVERLAY_LABEL_HEIGHT = 18;
      var OVERLAY_LABEL_GAP = 4;
      var OVERLAY_LABEL_LINE_GAP = 1;
      var OVERLAY_LABEL_TOP_SAFE_PADDING = 42;
      var OVERLAY_LABEL_BOTTOM_SAFE_PADDING = 10;
      var MARKET_PRICE_BADGE_HEIGHT = 20;
      var MARKET_PRICE_BADGE_MIN_GAP = 4;
      var MARKET_PRICE_BADGE_RIGHT_INSET = 4;

      function getRightPriceScaleApi() {
        return chart && typeof chart.priceScale === 'function'
          ? chart.priceScale('right')
          : null;
      }

      function resolvePrimaryPaneMetrics() {
        var chartElement = document.getElementById('chart');
        var paneSize = chart && typeof chart.paneSize === 'function' ? chart.paneSize(0) : null;
        var timeScaleApi =
          chart && typeof chart.timeScale === 'function'
            ? chart.timeScale()
            : null;
        var rightPriceScaleApi = getRightPriceScaleApi();
        var leftPriceScaleApi =
          chart && typeof chart.priceScale === 'function'
            ? chart.priceScale('left')
            : null;
        var rightAxisWidth =
          rightPriceScaleApi && typeof rightPriceScaleApi.width === 'function'
            ? rightPriceScaleApi.width()
            : 0;
        var leftAxisWidth =
          leftPriceScaleApi && typeof leftPriceScaleApi.width === 'function'
            ? leftPriceScaleApi.width()
            : 0;
        var timeScaleHeight =
          timeScaleApi && typeof timeScaleApi.height === 'function'
            ? timeScaleApi.height()
            : 0;
        var paneWidth =
          paneSize && typeof paneSize.width === 'number' && isFinite(paneSize.width) && paneSize.width > 0
            ? paneSize.width
            : Math.max(
                0,
                (chartElement && chartElement.clientWidth ? chartElement.clientWidth : 0) - leftAxisWidth - rightAxisWidth
              );
        var paneHeight =
          paneSize && typeof paneSize.height === 'number' && isFinite(paneSize.height) && paneSize.height > 0
            ? paneSize.height
            : Math.max(
                0,
                (chartElement && chartElement.clientHeight ? chartElement.clientHeight : 0) - timeScaleHeight
              );
        var priceScaleOptions =
          rightPriceScaleApi && typeof rightPriceScaleApi.options === 'function'
            ? rightPriceScaleApi.options()
            : null;
        var scaleMargins = priceScaleOptions && priceScaleOptions.scaleMargins
          ? priceScaleOptions.scaleMargins
          : null;
        var topMargin = scaleMargins && typeof scaleMargins.top === 'number' && isFinite(scaleMargins.top)
          ? Math.max(0, Math.min(0.95, scaleMargins.top))
          : 0;
        var bottomMargin = scaleMargins && typeof scaleMargins.bottom === 'number' && isFinite(scaleMargins.bottom)
          ? Math.max(0, Math.min(0.95, scaleMargins.bottom))
          : 0;
        var plotTop = Math.max(0, Math.round(paneHeight * topMargin));
        var plotBottom = Math.max(plotTop + 1, Math.round(paneHeight * (1 - bottomMargin)));

        return {
          chartHeight: chartElement && chartElement.clientHeight ? chartElement.clientHeight : paneHeight + timeScaleHeight,
          leftAxisWidth: leftAxisWidth,
          paneWidth: paneWidth,
          paneHeight: paneHeight,
          plotTop: plotTop,
          plotHeight: Math.max(0, plotBottom - plotTop),
        };
      }

      function isValidPriceRange(range) {
        return Boolean(
          range &&
          typeof range.from === 'number' &&
          typeof range.to === 'number' &&
          isFinite(range.from) &&
          isFinite(range.to) &&
          range.from !== range.to
        );
      }

      function resolvePriceRangeFromVisibleData() {
        if (!lastRawSeriesData || lastRawSeriesData.length === 0) {
          return null;
        }

        var fromIndex = 0;
        var toIndex = lastRawSeriesData.length - 1;
        try {
          var logicalRange =
            chart && typeof chart.timeScale === 'function' &&
            chart.timeScale() &&
            typeof chart.timeScale().getVisibleLogicalRange === 'function'
              ? chart.timeScale().getVisibleLogicalRange()
              : null;
          if (
            logicalRange &&
            typeof logicalRange.from === 'number' &&
            typeof logicalRange.to === 'number' &&
            isFinite(logicalRange.from) &&
            isFinite(logicalRange.to)
          ) {
            fromIndex = Math.max(0, Math.floor(logicalRange.from));
            toIndex = Math.min(lastRawSeriesData.length - 1, Math.ceil(logicalRange.to));
          }
        } catch (_e) {}

        if (toIndex < fromIndex) {
          fromIndex = 0;
          toIndex = lastRawSeriesData.length - 1;
        }

        var minPrice = Infinity;
        var maxPrice = -Infinity;
        for (var i = fromIndex; i <= toIndex; i += 1) {
          var bar = lastRawSeriesData[i];
          if (!bar) continue;
          var high = typeof bar.high === 'number' ? bar.high : (typeof bar.value === 'number' ? bar.value : NaN);
          var low = typeof bar.low === 'number' ? bar.low : (typeof bar.value === 'number' ? bar.value : NaN);
          var open = typeof bar.open === 'number' ? bar.open : high;
          var close = typeof bar.close === 'number' ? bar.close : high;
          if (isFinite(high)) maxPrice = Math.max(maxPrice, high);
          if (isFinite(low)) minPrice = Math.min(minPrice, low);
          if (isFinite(open)) {
            minPrice = Math.min(minPrice, open);
            maxPrice = Math.max(maxPrice, open);
          }
          if (isFinite(close)) {
            minPrice = Math.min(minPrice, close);
            maxPrice = Math.max(maxPrice, close);
          }
        }

        if (!isFinite(minPrice) || !isFinite(maxPrice)) {
          return null;
        }

        var span = maxPrice - minPrice;
        var padding = Math.max(span * 0.08, Math.abs(maxPrice || 1) * 0.0002);
        if (!(padding > 0)) padding = 1;
        return {
          from: minPrice - padding,
          to: maxPrice + padding,
        };
      }

      function resolveVerticalPanStartPriceRange() {
        var priceScaleApi = getRightPriceScaleApi();
        var currentRange =
          priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
            ? priceScaleApi.getVisibleRange()
            : null;
        if (isValidPriceRange(currentRange)) {
          return currentRange;
        }
        return resolvePriceRangeFromVisibleData();
      }

      function lockVisiblePriceScaleRange(forceAutoScale, attempt) {
        // Previously this function snapshot the current visible price range
        // and called setAutoScale(false) + setVisibleRange(snapshot) — i.e.
        // it FROZE the price axis. That was fine for the initial bootstrap
        // but became a real bug for horizontal panning: scrolling left
        // exposes older bars at different prices, but the frozen range
        // can't accommodate them, so they appear squashed at the edge of
        // the viewport (the "thin line floating in a 50,000-point empty
        // range" symptom the user reported on left-scroll).
        //
        // Normal horizontal pans / zooms keep autoScale enabled so
        // lightweight-charts fits the visible bars. A user-driven vertical
        // candle drag is the exception: it temporarily owns the price range.
        void attempt;
        try {
          if (verticalPricePanGestureActive || (manualPriceScaleRangeActive && forceAutoScale !== true)) {
            scheduleOverlayDomRefresh();
            postChartGeometry();
            return;
          }
          if (forceAutoScale === true) {
            manualPriceScaleRangeActive = false;
          }
          var priceScaleApi = getRightPriceScaleApi();
          if (priceScaleApi && typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(true);
          }
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
      }

      function scheduleOverlayPriceScaleLock(forceAutoScale) {
        if (overlayPriceScaleLockRaf) {
          cancelAnimationFrame(overlayPriceScaleLockRaf);
        }
        overlayPriceScaleLockRaf = requestAnimationFrame(function() {
          overlayPriceScaleLockRaf = 0;
          lockVisiblePriceScaleRange(forceAutoScale, 0);
        });
      }

      function postReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
        } catch (_e) {}
      }

      function postChartReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHART_READY' }));
        } catch (_e) {}
      }

      function postChartGeometry() {
        if (!chart) {
          return;
        }
        try {
          var metrics = resolvePrimaryPaneMetrics();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_GEOMETRY',
            plotArea: {
              left: metrics.leftAxisWidth,
              top: metrics.plotTop,
              width: metrics.paneWidth,
              height: metrics.plotHeight,
            },
          }));
        } catch (_e) {}
      }

      function postChartTap(x, y, price) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TAP',
            x: x,
            y: y,
            price: typeof price === 'number' && isFinite(price) ? price : null,
          }));
        } catch (_e) {}
      }

      function postChartTouchState(active) {
        var nextActive = !!active;
        if (lastPostedChartTouchActive === nextActive) {
          return;
        }
        lastPostedChartTouchActive = nextActive;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TOUCH_STATE',
            active: nextActive,
          }));
        } catch (_e) {}
      }

      function resolveChartTouchInteractionOptions(enabled) {
        var handleScroll = cloneSerializableValue(
          (lastInitHostOptions && lastInitHostOptions.handleScroll) || {},
          {}
        );
        var handleScale = cloneSerializableValue(
          (lastInitHostOptions && lastInitHostOptions.handleScale) || {},
          {}
        );

        if (!enabled) {
          handleScroll.mouseWheel = false;
          handleScroll.pressedMouseMove = false;
          handleScroll.horzTouchDrag = false;
          handleScroll.vertTouchDrag = false;
          handleScale.mouseWheel = false;
          handleScale.pinch = false;
          handleScale.axisPressedMouseMove = false;
        }

        return {
          handleScroll: handleScroll,
          handleScale: handleScale,
        };
      }

      function applyChartTouchInteractionState(enabled) {
        if (!chart || typeof chart.applyOptions !== 'function') {
          return;
        }
        try {
          chart.applyOptions(resolveChartTouchInteractionOptions(enabled));
        } catch (_e) {}
      }

      function suspendChartTouchInteractions() {
        chartTouchInteractionSuspendDepth += 1;
        if (chartTouchInteractionSuspendDepth === 1) {
          applyChartTouchInteractionState(false);
        }
      }

      function restoreChartTouchInteractions() {
        if (chartTouchInteractionSuspendDepth <= 0) {
          chartTouchInteractionSuspendDepth = 0;
          applyChartTouchInteractionState(true);
          return;
        }
        chartTouchInteractionSuspendDepth -= 1;
        if (chartTouchInteractionSuspendDepth === 0) {
          applyChartTouchInteractionState(true);
        }
      }

      function postDistinctChartTap(x, y, price) {
        if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
          return;
        }
        var now = Date.now();
        if (now <= suppressChartTapUntil) {
          return;
        }
        if (
          isFinite(lastPostedChartTap.x) &&
          isFinite(lastPostedChartTap.y) &&
          Math.abs(lastPostedChartTap.x - x) <= 8 &&
          Math.abs(lastPostedChartTap.y - y) <= 8 &&
          now - lastPostedChartTap.at <= 250
        ) {
          return;
        }
        lastPostedChartTap = { x: x, y: y, at: now };
        postChartTap(x, y, price);
      }

      function emitChartTapAtPoint(x, y) {
        if (!series || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
          return;
        }
        var price = null;
        if (typeof series.coordinateToPrice === 'function') {
          var nextPrice = series.coordinateToPrice(y);
          if (typeof nextPrice === 'number' && isFinite(nextPrice)) {
            price = nextPrice;
          }
        }
        postDistinctChartTap(x, y, price);
      }

      function scheduleOverlayDomRefresh() {
        if (overlayRefreshRaf) {
          return;
        }
        overlayRefreshRaf = requestAnimationFrame(function() {
          overlayRefreshRaf = 0;
          refreshOverlayDomLabels(_overlayPayload);
        });
      }

      var chartTradeLineDragDomRefreshTimer = null;
      var chartTradeLineDragDomRefreshFrame = null;
      var lastChartTradeLineDragDomRefreshAt = 0;

      function flushTradeLineDragDomRefresh() {
        chartTradeLineDragDomRefreshTimer = null;
        chartTradeLineDragDomRefreshFrame = null;
        lastChartTradeLineDragDomRefreshAt = Date.now();
        refreshOverlayDomLabels(_overlayPayload);
      }

      function scheduleTradeLineDragDomRefresh() {
        if (chartTradeLineDragDomRefreshTimer !== null || chartTradeLineDragDomRefreshFrame !== null) {
          return;
        }
        var now = Date.now();
        var delay = Math.max(
          0,
          CHART_TRADE_LINE_DRAG_DOM_REFRESH_INTERVAL_MS - (now - lastChartTradeLineDragDomRefreshAt)
        );
        var scheduleFrame = function() {
          chartTradeLineDragDomRefreshTimer = null;
          chartTradeLineDragDomRefreshFrame = requestAnimationFrame(flushTradeLineDragDomRefresh);
        };
        if (delay > 0) {
          chartTradeLineDragDomRefreshTimer = setTimeout(scheduleFrame, delay);
          return;
        }
        scheduleFrame();
      }

      function bindChartTapListeners(el) {
        if (!el) return;
        if (typeof detachChartTapListeners === 'function') {
          try { detachChartTapListeners(); } catch (_e) {}
        }

        var getClientPoint = function(event) {
          if (!event) return null;
          if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            return { x: event.clientX, y: event.clientY };
          }
          var touch =
            (event.changedTouches && event.changedTouches[0]) ||
            (event.touches && event.touches[0]);
          if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
            return { x: touch.clientX, y: touch.clientY };
          }
          return null;
        };

        var getRelativePoint = function(clientX, clientY) {
          var rect = el.getBoundingClientRect();
          var x = clientX - rect.left;
          var y = clientY - rect.top;
          if (!isFinite(x) || !isFinite(y)) return null;
          if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
          return { x: x, y: y };
        };

        // Same as getRelativePoint but clamps to the chart viewport instead
        // of returning null when the finger crosses an edge. Used during
        // active drags so the line keeps following the finger smoothly even
        // when dragged past the top/bottom of the plot area.
        var getClampedRelativePoint = function(clientX, clientY) {
          var rect = el.getBoundingClientRect();
          if (!isFinite(clientX) || !isFinite(clientY)) return null;
          var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
          var y = Math.max(0, Math.min(rect.height, clientY - rect.top));
          return { x: x, y: y };
        };

        var getTradeLineDragPoint = function(clientX, clientY) {
          var rect = el.getBoundingClientRect();
          if (!isFinite(clientX) || !isFinite(clientY)) return null;
          var maxVerticalOverscroll = Math.max(1, rect.height || 1);
          var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
          var y = Math.max(-maxVerticalOverscroll, Math.min((rect.height || 0) + maxVerticalOverscroll, clientY - rect.top));
          return { x: x, y: y };
        };

        var resolveTradeLineDragPrice = function(point) {
          if (!point || !series || typeof series.coordinateToPrice !== 'function') {
            return null;
          }
          var coordinatePrice = sanitizeOverlayDragPrice(series.coordinateToPrice(point.y));
          if (typeof coordinatePrice === 'number' && isFinite(coordinatePrice) && coordinatePrice > 0) {
            return coordinatePrice;
          }
          var lock = activeTradeLineDrag && activeTradeLineDrag.priceScaleRangeLock;
          if (!isValidPriceRange(lock)) {
            return null;
          }
          var metrics = resolvePrimaryPaneMetrics();
          var plotHeight = metrics && typeof metrics.plotHeight === 'number' && metrics.plotHeight > 0 ? metrics.plotHeight : 0;
          if (!plotHeight) {
            return null;
          }
          var plotTop = metrics.plotTop || 0;
          var normalizedY = (point.y - plotTop) / plotHeight;
          var price = lock.to - normalizedY * (lock.to - lock.from);
          return sanitizeOverlayDragPrice(price);
        };

        var stopChartEvent = function(event) {
          if (!event) return;
          if (typeof event.preventDefault === 'function') {
            event.preventDefault();
          }
          if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
        };

        // ── Vertical candle panning state ──
        // When the user drags vertically on the chart area, we disable
        // auto-scale and shift the visible price range. This makes the
        // candles move up/down while the chart container stays fixed.
        var supportsPointerEvents = typeof window.PointerEvent === 'function';
        var activePointerIds = {};
        var activePointerCount = 0;
        var CHART_SCALE_TAP_SUPPRESSION_MS = 1200;
        // Set when ≥2 fingers are ever down in a single gesture; cleared when
        // all fingers lift. Prevents a tap firing after a slow pinch-zoom where
        // the time-based suppression window already expired.
        var gestureHadMultitouch = false;

        var countActivePointers = function() {
          var count = 0;
          for (var key in activePointerIds) {
            if (Object.prototype.hasOwnProperty.call(activePointerIds, key)) {
              count += 1;
            }
          }
          return count;
        };

        var rememberPointerDown = function(event) {
          if (!supportsPointerEvents || !event || event.pointerId === undefined || event.pointerId === null) {
            return;
          }
          activePointerIds[String(event.pointerId)] = true;
          activePointerCount = countActivePointers();
          if (activePointerCount >= 2) {
            gestureHadMultitouch = true;
          }
        };

        var releasePointer = function(event) {
          if (!supportsPointerEvents || !event || event.pointerId === undefined || event.pointerId === null) {
            activePointerCount = 0;
            return;
          }
          delete activePointerIds[String(event.pointerId)];
          activePointerCount = countActivePointers();
        };

        var getTouchCount = function(event) {
          if (!event) return 0;
          if (event.touches && typeof event.touches.length === 'number') {
            return event.touches.length;
          }
          if (event.targetTouches && typeof event.targetTouches.length === 'number') {
            return event.targetTouches.length;
          }
          return 0;
        };

        var isScaleGestureEvent = function(event) {
          return (
            getTouchCount(event) > 1 ||
            activePointerCount > 1 ||
            (supportsPointerEvents && event && event.isPrimary === false)
          );
        };

        var suppressChartTapAfterScale = function() {
          suppressChartTapUntil = Date.now() + CHART_SCALE_TAP_SUPPRESSION_MS;
          pendingPointerTap = null;
          vertPanPending = null;
        };

        var vertPanState = null; // { startY, startRange: {from, to} }
        var VERT_PAN_THRESHOLD = 6; // px before we commit to a vertical pan
        var vertPanPending = null; // { startX, startY } — waiting for threshold
        var lastDoubleTapAt = 0;

        var beginVerticalPan = function(clientY) {
          if (!chart || !series) return false;
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi) return false;
          var range = resolveVerticalPanStartPriceRange();
          if (!isValidPriceRange(range)) return false;
          verticalPricePanGestureActive = true;
          manualPriceScaleRangeActive = true;
          if (overlayPriceScaleLockRaf) {
            cancelAnimationFrame(overlayPriceScaleLockRaf);
            overlayPriceScaleLockRaf = 0;
          }
          vertPanState = {
            startY: clientY,
            startRange: { from: range.from, to: range.to },
          };
          // Disable auto-scale so our manual range adjustments stick.
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(false);
          }
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            priceScaleApi.setVisibleRange({ from: range.from, to: range.to });
          }
          return true;
        };

        var continueVerticalPan = function(clientY) {
          if (!vertPanState || !chart || !series) return;
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi || typeof priceScaleApi.setVisibleRange !== 'function') return;
          // Calculate how much the finger moved in pixels.
          var deltaPixels = clientY - vertPanState.startY;
          // Convert pixel delta to price delta.
          // Dragging UP decreases the visible price range values, which moves
          // candles upward on screen. Dragging DOWN increases the visible
          // price range values, which moves candles downward on screen.
          var rangeSpan = vertPanState.startRange.to - vertPanState.startRange.from;
          var chartElement = document.getElementById('chart');
          var chartHeight = chartElement ? chartElement.clientHeight : window.innerHeight;
          if (chartHeight <= 0) return;
          var pricePerPixel = rangeSpan / chartHeight;
          var priceDelta = deltaPixels * pricePerPixel;
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(false);
          }
          priceScaleApi.setVisibleRange({
            from: vertPanState.startRange.from + priceDelta,
            to: vertPanState.startRange.to + priceDelta,
          });
          scheduleOverlayDomRefresh();
        };

        var endVerticalPan = function() {
          verticalPricePanGestureActive = false;
          vertPanState = null;
          vertPanPending = null;
          scheduleOverlayDomRefresh();
        };

        var resetAutoScale = function() {
          // Aggressively re-enable autoScale on the right price axis. Use
          // applyOptions({autoScale: true}) AND setAutoScale(true) — the
          // first forces lightweight-charts to reset its internal pinch /
          // pan price-range cache; the second is the older API that some
          // chart builds still respond to. Without both, a previous pinch
          // can leave the visible price range stuck at a 50,000-point
          // span, squashing all candles into a thin horizontal line.
          manualPriceScaleRangeActive = false;
          verticalPricePanGestureActive = false;
          var priceScaleApi = getRightPriceScaleApi();
          if (priceScaleApi) {
            try {
              if (typeof priceScaleApi.applyOptions === 'function') {
                priceScaleApi.applyOptions({ autoScale: true });
              }
            } catch (_e1) {}
            try {
              if (typeof priceScaleApi.setAutoScale === 'function') {
                priceScaleApi.setAutoScale(true);
              }
            } catch (_e2) {}
          }
          scheduleOverlayDomRefresh();
        };

        var captureTradeLineDragPriceScaleLock = function() {
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi || typeof priceScaleApi.getVisibleRange !== 'function') {
            return null;
          }
          var lock = priceScaleApi.getVisibleRange();
          if (!isValidPriceRange(lock)) {
            lock = resolveVerticalPanStartPriceRange();
          }
          if (!isValidPriceRange(lock)) {
            return null;
          }
          manualPriceScaleRangeActive = true;
          if (typeof priceScaleApi.setAutoScale === 'function') {
            try { priceScaleApi.setAutoScale(false); } catch (_e1) {}
          }
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            try { priceScaleApi.setVisibleRange({ from: lock.from, to: lock.to }); } catch (_e2) {}
          }
          return { from: lock.from, to: lock.to };
        };

        var keepTradeLineDragPriceScaleLocked = function(lock) {
          if (!isValidPriceRange(lock)) {
            return;
          }
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi) {
            return;
          }
          if (typeof priceScaleApi.setAutoScale === 'function') {
            try { priceScaleApi.setAutoScale(false); } catch (_e1) {}
          }
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            try { priceScaleApi.setVisibleRange({ from: lock.from, to: lock.to }); } catch (_e2) {}
          }
        };

        var beginTradeLineDrag = function(event) {
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) return false;
          var point = getClampedRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) return false;
          var hit = pickDraggableOverlayLineAtY(point.y);
          if (!hit || !hit.dragKey) return false;
          var startPrice = sanitizeOverlayDragPrice(hit.price);
          cancelChartTradeLineDragMove();
          // Capture the pointer so subsequent move/up events route to us
          // even when the finger leaves the chart bounds. Disable the chart
          // element's default touch-action panning so the page doesn't
          // scroll while the user is dragging the line vertically.
          var capturedPointerId = null;
          if (event && typeof event.pointerId === 'number' && typeof el.setPointerCapture === 'function') {
            try {
              el.setPointerCapture(event.pointerId);
              capturedPointerId = event.pointerId;
            } catch (_e) {}
          }
          var prevTouchAction = el.style.touchAction;
          el.style.touchAction = 'none';
          activeTradeLineDrag = {
            dragKey: hit.dragKey,
            lastPrice: typeof startPrice === 'number' && isFinite(startPrice) ? startPrice : hit.price,
            pointerId: capturedPointerId,
            prevTouchAction: prevTouchAction,
            priceScaleRangeLock: captureTradeLineDragPriceScaleLock(),
          };
          suspendChartTouchInteractions();
          pendingPointerTap = null;
          vertPanState = null;
          vertPanPending = null;
          suppressNextChartClickUntil = Date.now() + 350;
          updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, activeTradeLineDrag.lastPrice);
          postChartTradeLineDrag(
            'start',
            activeTradeLineDrag.dragKey,
            roundOverlayDragPrice(activeTradeLineDrag.lastPrice) || activeTradeLineDrag.lastPrice
          );
          scheduleOverlayDomRefresh();
          stopChartEvent(event);
          return true;
        };

        var continueTradeLineDrag = function(event) {
          if (!activeTradeLineDrag) return false;
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) {
            stopChartEvent(event);
            return true;
          }
          var point = getTradeLineDragPoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) {
            stopChartEvent(event);
            return true;
          }
          var nextPrice = resolveTradeLineDragPrice(point);
          if (typeof nextPrice === 'number' && isFinite(nextPrice) && nextPrice > 0) {
            if (activeTradeLineDrag.lastPrice !== nextPrice) {
              activeTradeLineDrag.lastPrice = nextPrice;
              updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, nextPrice);
              var nativeMovePrice = roundOverlayDragPrice(nextPrice);
              if (typeof nativeMovePrice === 'number' && isFinite(nativeMovePrice) && nativeMovePrice > 0) {
                scheduleChartTradeLineDragMove(activeTradeLineDrag.dragKey, nativeMovePrice);
              }
            } else {
              updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, nextPrice);
            }
          }
          keepTradeLineDragPriceScaleLocked(activeTradeLineDrag.priceScaleRangeLock);
          stopChartEvent(event);
          return true;
        };

        var finishTradeLineDrag = function(event, cancelled) {
          if (!activeTradeLineDrag) return false;
          var drag = activeTradeLineDrag;
          activeTradeLineDrag = null;
          // Release the pointer capture and restore the original touch
          // action so the chart resumes its normal pan/scroll behaviour.
          if (drag.pointerId !== null && drag.pointerId !== undefined && typeof el.releasePointerCapture === 'function') {
            try { el.releasePointerCapture(drag.pointerId); } catch (_e) {}
          }
          el.style.touchAction = drag.prevTouchAction || '';
          restoreChartTouchInteractions();
          suppressNextChartClickUntil = Date.now() + 350;

          if (!cancelled) {
            var pointFromEvent = getClientPoint(event);
            var point = pointFromEvent ? getTradeLineDragPoint(pointFromEvent.x, pointFromEvent.y) : null;
            if (point) {
              var finalPrice = resolveTradeLineDragPrice(point);
              if (typeof finalPrice === 'number' && isFinite(finalPrice) && finalPrice > 0) {
                drag.lastPrice = finalPrice;
                updateDraggedOverlayLinePreview(drag.dragKey, finalPrice);
              }
            }
          }

          cancelChartTradeLineDragMove();
          keepTradeLineDragPriceScaleLocked(drag.priceScaleRangeLock);
          postChartTradeLineDrag('end', drag.dragKey, roundOverlayDragPrice(drag.lastPrice) || drag.lastPrice);
          pendingPointerTap = null;
          scheduleTradeLineDragDomRefresh();
          stopChartEvent(event);
          return true;
        };

        var onPointerDown = function(event) {
          rememberPointerDown(event);
          postChartTouchState(true);
          if (isScaleGestureEvent(event)) {
            suppressChartTapAfterScale();
            return;
          }
          if (beginTradeLineDrag(event)) {
            return;
          }
          var point = getClientPoint(event);
          if (!point) return;
          // Check for double-tap to reset auto-scale
          var now = Date.now();
          if (now - lastDoubleTapAt < 350) {
            resetAutoScale();
            lastDoubleTapAt = 0;
            pendingPointerTap = null;
            vertPanPending = null;
            return;
          }
          lastDoubleTapAt = now;
          pendingPointerTap = {
            x: point.x,
            y: point.y,
            at: now,
          };
          // Start tracking for potential vertical pan
          vertPanPending = { startX: point.x, startY: point.y };
          scheduleOverlayDomRefresh();
        };

        var onPointerMove = function(event) {
          if (isScaleGestureEvent(event)) {
            suppressChartTapAfterScale();
            scheduleOverlayDomRefresh();
            return;
          }
          if (continueTradeLineDrag(event)) {
            return;
          }
          // Check if we should start or continue a vertical pan
          var point = getClientPoint(event);
          if (point && vertPanState) {
            // Already in a vertical pan — continue it
            continueVerticalPan(point.y);
            stopChartEvent(event);
            return;
          }
          if (point && vertPanPending && !vertPanState) {
            var dx = Math.abs(point.x - vertPanPending.startX);
            var dy = Math.abs(point.y - vertPanPending.startY);
            // If vertical movement exceeds threshold and is more than horizontal,
            // commit to a vertical pan (candle up/down movement).
            if (dy > VERT_PAN_THRESHOLD && dy > dx * 1.2) {
              pendingPointerTap = null;
              if (beginVerticalPan(vertPanPending.startY)) {
                continueVerticalPan(point.y);
                stopChartEvent(event);
                return;
              }
            } else if (dx > VERT_PAN_THRESHOLD && dx > dy * 1.2) {
              // Committed to a HORIZONTAL pan / scroll. Lightweight-charts
              // handles the actual horizontal scroll itself, but we need
              // to make sure the price scale's autoScale is ON — otherwise
              // a previously-disabled autoScale (from a prior vertical
              // pan, pinch, or chart bootstrap lock) leaves new bars at
              // different prices squashed at the edge of the viewport
              // when the user scrolls left to view older data.
              try {
                manualPriceScaleRangeActive = false;
                verticalPricePanGestureActive = false;
                var psApi = getRightPriceScaleApi();
                if (psApi && typeof psApi.setAutoScale === 'function') {
                  psApi.setAutoScale(true);
                }
              } catch (_e) {}
              pendingPointerTap = null;
              vertPanPending = null;
            }
          }
          scheduleOverlayDomRefresh();
        };

        var onPointerUp = function(event) {
          var wasScaleGesture = isScaleGestureEvent(event) || gestureHadMultitouch || Date.now() <= suppressChartTapUntil;
          if (finishTradeLineDrag(event, false)) {
            releasePointer(event);
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          releasePointer(event);
          if (wasScaleGesture) {
            suppressChartTapAfterScale();
            if (activePointerCount <= 0) {
              // Pinch / multi-touch gesture has fully ended. Lightweight-
              // charts' built-in pinch handler disables price-scale
              // autoScale and can leave the visible price range expanded
              // far past the actual data (the "pinch-out and the candles
              // become a thin line floating in a 50,000-point empty
              // range" bug). Re-enable autoScale so the price axis snaps
              // back to fit the data after every pinch.
              resetAutoScale();
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          if (vertPanState) {
            endVerticalPan();
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          vertPanPending = null;
          if (!event || !pendingPointerTap) {
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) {
            pendingPointerTap = null;
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          var elapsed = Date.now() - pendingPointerTap.at;
          var dx = pointFromEvent.x - pendingPointerTap.x;
          var dy = pointFromEvent.y - pendingPointerTap.y;
          pendingPointerTap = null;
          if (elapsed > 450 || Math.abs(dx) > 12 || Math.abs(dy) > 12) {
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) {
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          scheduleOverlayDomRefresh();
          emitChartTapAtPoint(point.x, point.y);
          if (activePointerCount <= 0) postChartTouchState(false);
        };

        var onPointerCancel = function(event) {
          if (finishTradeLineDrag(event, true)) {
            releasePointer(event);
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          releasePointer(event);
          if (Date.now() <= suppressChartTapUntil) {
            if (activePointerCount <= 0) {
              // Same auto-scale snap-back when a pinch is cancelled —
              // see onPointerUp for the full rationale.
              if (gestureHadMultitouch) {
                resetAutoScale();
              }
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          if (vertPanState) {
            endVerticalPan();
            if (activePointerCount <= 0) {
              if (gestureHadMultitouch) {
                resetAutoScale();
              }
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          vertPanPending = null;
          pendingPointerTap = null;
          if (gestureHadMultitouch) {
            resetAutoScale();
          }
          gestureHadMultitouch = false;
          scheduleOverlayDomRefresh();
          if (activePointerCount <= 0) postChartTouchState(false);
        };

        var onClick = function(event) {
          if (Date.now() <= suppressNextChartClickUntil || Date.now() <= suppressChartTapUntil) {
            return;
          }
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) return;
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) return;
          scheduleOverlayDomRefresh();
          emitChartTapAtPoint(point.x, point.y);
        };

        var onWindowPointerMove = function(event) {
          if (activeTradeLineDrag) {
            continueTradeLineDrag(event);
          }
        };

        var onWindowPointerUp = function(event) {
          if (finishTradeLineDrag(event, false)) {
            releasePointer(event);
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
          }
        };

        var onWindowPointerCancel = function(event) {
          if (finishTradeLineDrag(event, true)) {
            releasePointer(event);
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
          }
        };

        // Non-passive listeners: required so preventDefault() inside the
        // drag handlers can stop the page from scrolling while the user is
        // moving an SL/TP/entry line vertically. Passive listeners would
        // ignore preventDefault on mobile.
        var listenerOptions = { capture: true, passive: false };
        if (supportsPointerEvents) {
          el.addEventListener('pointerdown', onPointerDown, listenerOptions);
          el.addEventListener('pointermove', onPointerMove, listenerOptions);
          el.addEventListener('pointerup', onPointerUp, listenerOptions);
          el.addEventListener('pointercancel', onPointerCancel, listenerOptions);
        } else {
          el.addEventListener('touchstart', onPointerDown, listenerOptions);
          el.addEventListener('touchmove', onPointerMove, listenerOptions);
          el.addEventListener('touchend', onPointerUp, listenerOptions);
          el.addEventListener('touchcancel', onPointerCancel, listenerOptions);
        }
        window.addEventListener('pointermove', onWindowPointerMove, listenerOptions);
        window.addEventListener('pointerup', onWindowPointerUp, listenerOptions);
        window.addEventListener('pointercancel', onWindowPointerCancel, listenerOptions);
        window.addEventListener('touchmove', onWindowPointerMove, listenerOptions);
        window.addEventListener('touchend', onWindowPointerUp, listenerOptions);
        window.addEventListener('touchcancel', onWindowPointerCancel, listenerOptions);
        el.addEventListener('click', onClick, true);
        detachChartTapListeners = function() {
          if (supportsPointerEvents) {
            el.removeEventListener('pointerdown', onPointerDown, listenerOptions);
            el.removeEventListener('pointermove', onPointerMove, listenerOptions);
            el.removeEventListener('pointerup', onPointerUp, listenerOptions);
            el.removeEventListener('pointercancel', onPointerCancel, listenerOptions);
          } else {
            el.removeEventListener('touchstart', onPointerDown, listenerOptions);
            el.removeEventListener('touchmove', onPointerMove, listenerOptions);
            el.removeEventListener('touchend', onPointerUp, listenerOptions);
            el.removeEventListener('touchcancel', onPointerCancel, listenerOptions);
          }
          window.removeEventListener('pointermove', onWindowPointerMove, listenerOptions);
          window.removeEventListener('pointerup', onWindowPointerUp, listenerOptions);
          window.removeEventListener('pointercancel', onWindowPointerCancel, listenerOptions);
          window.removeEventListener('touchmove', onWindowPointerMove, listenerOptions);
          window.removeEventListener('touchend', onWindowPointerUp, listenerOptions);
          window.removeEventListener('touchcancel', onWindowPointerCancel, listenerOptions);
          el.removeEventListener('click', onClick, true);
          pendingPointerTap = null;
          activePointerIds = {};
          activePointerCount = 0;
          gestureHadMultitouch = false;
          activeTradeLineDrag = null;
          suppressNextChartClickUntil = 0;
          suppressChartTapUntil = 0;
          chartTouchInteractionSuspendDepth = 0;
          postChartTouchState(false);
        };
      }

      function postError(where, err) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: where + ': ' + (err && err.message ? err.message : String(err))
          }));
        } catch (_e) {}
      }

      function postWebViewOverlayLog(message, data) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'OVERLAY_LOG',
            message: message,
            data: data || null,
          }));
        } catch (_e) {}
      }

      function getChartViewportWidth() {
        try {
          var chartElement = document.getElementById('chart');
          if (chartElement && typeof chartElement.clientWidth === 'number' && chartElement.clientWidth > 0) {
            return chartElement.clientWidth;
          }
        } catch (_e) {}
        return typeof window.innerWidth === 'number' && isFinite(window.innerWidth) ? window.innerWidth : 0;
      }

      function getRecentVisibleBars(length) {
        if (typeof length !== 'number' || !isFinite(length) || length <= 0) return 0;
        var viewportWidth = getChartViewportWidth();
        if (!(viewportWidth > 0)) {
          return Math.min(
            Math.round(length),
            ${CHART_DEFAULT_VISIBLE_BAR_MAX},
          );
        }
        var usableWidth = Math.max(
          viewportWidth - 28,
          ${CHART_DEFAULT_VISIBLE_BAR_TARGET_PX},
        );
        var targetVisibleBars = Math.round(usableWidth / ${CHART_DEFAULT_VISIBLE_BAR_TARGET_PX});
        return Math.min(
          Math.round(length),
          Math.max(
            ${CHART_DEFAULT_VISIBLE_BAR_MIN},
            Math.min(${CHART_DEFAULT_VISIBLE_BAR_MAX}, targetVisibleBars),
          ),
        );
      }

      function resolveDefaultBarSpacing(lengthOverride) {
        var visibleBars = getRecentVisibleBars(lengthOverride);
        var viewportWidth = getChartViewportWidth();
        if (!(viewportWidth > 0) || !(visibleBars > 0)) {
          return ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
        }
        var usableWidth = Math.max(viewportWidth - 28, visibleBars);
        return Math.min(
          ${CHART_DEFAULT_RESET_BAR_SPACING_MAX},
          Math.max(
            ${CHART_DEFAULT_RESET_BAR_SPACING_MIN},
            usableWidth / visibleBars,
          ),
        );
      }

      function resetTimeScaleDefaults(lengthOverride) {
        try {
          if (!chart || !chart.timeScale || typeof chart.timeScale().applyOptions !== 'function') return;
          chart.timeScale().applyOptions({
            rightOffset: ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET},
            barSpacing: resolveDefaultBarSpacing(lengthOverride),
            minBarSpacing: ${CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING},
          });
        } catch (_e) {}
      }

      function applyRecentViewport(lengthOverride) {
        try {
          if (!chart || !chart.timeScale) return;
          var dataLength =
            (typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0)
              ? Math.round(lengthOverride)
              : currentSeriesLength;
          if (!(dataLength > 0)) return;
          resetTimeScaleDefaults(dataLength);
          if (typeof chart.timeScale().setVisibleLogicalRange === 'function') {
            var visibleBars = getRecentVisibleBars(dataLength);
            var lastVisibleBar = Math.max(0.5, dataLength - 0.5);
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(-0.5, dataLength - visibleBars - 0.5),
              to: lastVisibleBar,
            });
          } else {
            chart.timeScale().fitContent();
          }
          if (typeof chart.timeScale().scrollToRealTime === 'function') {
            chart.timeScale().scrollToRealTime();
          }
          // Respect a user-driven vertical pan: if manualPriceScaleRangeActive
          // is set, this call leaves the manual range in place. A pinch or
          // bootstrap with manualPriceScaleRangeActive=false still recovers
          // autoScale, which is what the original "force" was guarding.
          scheduleOverlayPriceScaleLock(false);
          refreshOverlayDomLabels(_overlayPayload);
        } catch (_e) {}
      }

      window.__rtx5ApplyRecentViewport = applyRecentViewport;
      window.__rtx5ResetTimeScale = resetTimeScaleDefaults;
      window.__rtx5ResetPriceScale = function() {
        scheduleOverlayPriceScaleLock(true);
      };

      function makePriceFormat(displayDecimals) {
        var decimals = (typeof displayDecimals === 'number' && displayDecimals >= 0) ? displayDecimals : 2;
        return {
          type: 'price',
          precision: decimals,
          minMove: 1 / Math.pow(10, decimals)
        };
      }

      function resolveTickDateValue(value) {
        if (typeof value === 'string') {
          var trimmed = value.trim();
          if (!trimmed) {
            return null;
          }
          var numeric = Number(trimmed);
          if (isFinite(numeric)) {
            value = numeric;
          } else {
            var parsedStringDate = new Date(trimmed);
            return isFinite(parsedStringDate.getTime()) ? parsedStringDate : null;
          }
        }

        if (typeof value === 'number' && isFinite(value)) {
          var absValue = Math.abs(value);
          if (absValue > 4.2e16) {
            return new Date(Math.floor(value / 1000000));
          }
          if (absValue > 4.2e13) {
            return new Date(Math.floor(value / 1000));
          }
          if (absValue > 4.2e10) {
            return new Date(value);
          }
          return new Date(value * 1000);
        }

        return null;
      }

      function resolveTickDate(time) {
        var directDate = resolveTickDateValue(time);
        if (directDate) {
          return directDate;
        }

        if (time && typeof time === 'object') {
          var timestampDate = resolveTickDateValue(time.timestamp);
          if (timestampDate) {
            return timestampDate;
          }

          var timeDate = resolveTickDateValue(time.time);
          if (timeDate) {
            return timeDate;
          }

          if (
            typeof time.year === 'number' &&
            typeof time.month === 'number' &&
            typeof time.day === 'number'
          ) {
            return new Date(time.year, time.month - 1, time.day);
          }

          if (
            time.businessDay &&
            typeof time.businessDay === 'object' &&
            typeof time.businessDay.year === 'number' &&
            typeof time.businessDay.month === 'number' &&
            typeof time.businessDay.day === 'number'
          ) {
            return new Date(time.businessDay.year, time.businessDay.month - 1, time.businessDay.day);
          }
        }

        return null;
      }

      function formatChartTickMark(time, tickMarkType, _locale) {
        try {
          var resolveSource = time;
          var date = resolveTickDate(resolveSource);
          if (!date || !isFinite(date.getTime())) {
            return null;
          }

          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var day = String(date.getDate()).padStart(2, '0');
          var month = months[date.getMonth()] || '';
          var hours = String(date.getHours()).padStart(2, '0');
          var minutes = String(date.getMinutes()).padStart(2, '0');

          if (tickMarkType === 3 || tickMarkType === 4) {
            return day + ' ' + month + ' ' + hours + ':' + minutes;
          }

          if (tickMarkType === 2) {
            return day + ' ' + month;
          }

          if (tickMarkType === 1) {
            return month + ' ' + String(date.getFullYear());
          }

          if (tickMarkType === 0) {
            return String(date.getFullYear());
          }

          return day + ' ' + month;
        } catch (_e) {
          return null;
        }
      }

      function applyChartLayout(opts) {
        // Flatten host-supplied opts (background may be { color }) into the
        // shape lightweight-charts expects.
        try {
          if (opts && opts.layout && opts.layout.background && typeof opts.layout.background.color === 'string') {
            opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          }
        } catch (_e) {}
        return opts || {};
      }

      function cloneSerializableValue(value, fallback) {
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (_e) {
          return fallback;
        }
      }

      function pickSeriesColors(opts, chartType) {
        var c = (opts && opts.customColors) || {};
        var up = c.candlesUptrend || '#2962FF';
        var down = c.candlesDowntrend || '#EF5350';
        var hollowBody = c.hollowBody || 'rgba(0,0,0,0)';
        if (chartType === 'hollow') {
          return { up: up, down: down, bodyUp: hollowBody, bodyDown: hollowBody };
        }
        return { up: up, down: down, bodyUp: up, bodyDown: down };
      }

      // Pending init args — stored so the ResizeObserver or rAF retry
      // can re-run chart creation if the container had zero dimensions
      // on the first attempt (common on Android light theme first load).
      var _pendingInit = null;

      function _doInitChart(opts, chartType, data, displayDecimals, showLowerPane) {
        var el = document.getElementById('chart');
        var w = el.clientWidth;
        var h = el.clientHeight;

        // If the container has zero dimensions, the browser hasn't laid out
        // the WebView yet. Defer to the next animation frame — the
        // ResizeObserver will also catch it as a fallback.
        if (w === 0 || h === 0) {
          _pendingInit = {
            opts: opts,
            chartType: chartType,
            data: data,
            displayDecimals: displayDecimals,
            showLowerPane: showLowerPane,
          };
          requestAnimationFrame(function() {
            if (_pendingInit) {
              _doInitChart(
                _pendingInit.opts,
                _pendingInit.chartType,
                _pendingInit.data,
                _pendingInit.displayDecimals,
                _pendingInit.showLowerPane
              );
            }
          });
          return;
        }
        _pendingInit = null;

        if (window._drawingManager) {
          try { window._drawingManager.remove(); } catch (_e) {}
          window._drawingManager = null;
        }
        chartTouchInteractionSuspendDepth = 0;
        lastPostedChartTouchActive = false;
        if (chart) {
          try { chart.remove(); } catch (_e) {}
          chart = null;
          series = null;
          moveBarsSeries = null;
          bidPriceLine = null;
          askPriceLine = null;
          marketPriceLinesVisible = false;
          directionPriceLine = null;
          moveDirectionPriceLine = null;
          _positionLinesArr = [];
        }
        if (_overlayLabelLayer && _overlayLabelLayer.parentNode) {
          try { _overlayLabelLayer.parentNode.removeChild(_overlayLabelLayer); } catch (_e) {}
          _overlayLabelLayer = null;
        }
        if (typeof detachChartTapListeners === 'function') {
          try { detachChartTapListeners(); } catch (_e) {}
          detachChartTapListeners = null;
        }
        if (tickFlushHandle) {
          try { cancelAnimationFrame(tickFlushHandle); } catch (_) {}
          tickFlushHandle = 0;
        }
        if (overlayPriceScaleLockRaf) {
          try { cancelAnimationFrame(overlayPriceScaleLockRaf); } catch (_) {}
          overlayPriceScaleLockRaf = 0;
        }
        pendingTick = null;
        lastBarTime = 0;
        _liveBar = null;
        _liveBarHasObservedRealtimeUpdate = false;
        seriesType = chartType || 'candles';
        shouldShowLowerPane = showLowerPane !== false;
        lastDisplayDecimals =
          typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
            ? displayDecimals
            : 2;
        lastRawSeriesData = sanitizeSeriesData(data);

        var safeOpts = applyChartLayout(opts);
        var customCols = safeOpts.customColors;
        if (safeOpts.customColors) { delete safeOpts.customColors; }
        if (!safeOpts.timeScale) {
          safeOpts.timeScale = {};
        }
        safeOpts.timeScale.tickMarkFormatter = formatChartTickMark;
        // Crosshair / tooltip formatter uses the backend candle timestamp
        // that the host sends to the series.
        if (!safeOpts.localization) safeOpts.localization = {};
        safeOpts.localization.timeFormatter = function(time) {
          try {
            var resolveSource = time;
            var date = resolveTickDate(resolveSource);
            if (!date || !isFinite(date.getTime())) return '';
            var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var d = String(date.getDate()).padStart(2, '0');
            var m = months[date.getMonth()] || '';
            var hh = String(date.getHours()).padStart(2, '0');
            var mm = String(date.getMinutes()).padStart(2, '0');
            return d + ' ' + m + ' ' + hh + ':' + mm;
          } catch (_e) {
            return '';
          }
        };

        // Force explicit pixel dimensions so the chart never renders at 0x0
        safeOpts.width = w;
        safeOpts.height = h;

        chart = LightweightCharts.createChart(el, safeOpts);
        bindChartTapListeners(el);
        try {
          if (
            chart &&
            chart.timeScale &&
            typeof chart.timeScale === 'function' &&
            typeof chart.timeScale().subscribeVisibleLogicalRangeChange === 'function'
          ) {
            var lastPaginateTime = 0;
            chart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
              scheduleOverlayPriceScaleLock(false);
              refreshOverlayDomLabels(_overlayPayload);
              if (range && typeof range.from === 'number' && range.from < 50) {
                var now = Date.now();
                if (now - lastPaginateTime > 2000) {
                  lastPaginateTime = now;
                  try {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ON_PAGINATE_HISTORY' }));
                  } catch (e) {}
                }
              }
            });
          }
        } catch (_overlayLabelSubErr) {}

        var priceFormat = makePriceFormat(displayDecimals);
        var colors = pickSeriesColors({ customColors: customCols }, seriesType);
        barUpColor = colors.up;
        barDownColor = colors.down;
        moveUpColor = hexToRgba(colors.up, 0.85);
        moveDownColor = hexToRgba(colors.down, 0.85);
        lastPriceLineDirection = null;
        setPrimaryPriceScaleMargins(shouldUseMoveBarsPane());

        // We render our own direction-coloured price line via
        // directionPriceLine (created post-data-load), so the series'
        // built-in last-price line is suppressed (priceLineVisible: false).
        // lastValueVisible: false removes its right-axis label too —
        // otherwise the axis showed two labels stacked at the same price.
        if (seriesType === 'line') {
          series = chart.addSeries(LightweightCharts.LineSeries, {
            color: (customCols && customCols.lineBody) || colors.up,
            lineWidth: 2,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          });
        } else if (seriesType === 'bars') {
          series = chart.addSeries(LightweightCharts.BarSeries, {
            upColor: (customCols && customCols.barsUptrend) || colors.up,
            downColor: (customCols && customCols.barsDowntrend) || colors.down,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          });
        } else {
          // Always use the native lightweight-charts CandlestickSeries.
          // The custom RTX5 renderer rendered thin needle-like bodies and
          // distorted wicks — the native series produces the standard
          // professional candle geometry (centered wick, full-width body).
          series = chart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: colors.bodyUp,
            downColor: colors.bodyDown,
            borderUpColor: colors.up,
            borderDownColor: colors.down,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
            borderVisible: true,
            wickVisible: true,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          });
        }

        ensureMoveBarsSeries(lastDisplayDecimals);

        if (lastRawSeriesData.length > 0) {
          var mapped = mapForSeries(lastRawSeriesData);
          series.setData(mapped);
          currentSeriesLength = mapped.length;
          lastBarTime = mapped[mapped.length - 1].time;
          if (seriesType !== 'line') {
            var lastSeed = lastRawSeriesData[lastRawSeriesData.length - 1];
            _liveBar = {
              time: lastSeed.time,
              open: lastSeed.open,
              high: lastSeed.high,
              low: lastSeed.low,
              close: lastSeed.close,
            };
            _liveBarHasObservedRealtimeUpdate = false;
          }
          ensureMoveBarsSeries(lastDisplayDecimals);
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_mb) {}
          }
          applyRecentViewport(currentSeriesLength);
          scheduleOverlayPriceScaleLock(false);
          ensureDirectionPriceLine();
          ensureMoveDirectionPriceLine();
        }

        // Initialize the drawing tools manager — this wires up all
        // toolbar tools (trendline, fib, brush, text, pitchfork, etc.)
        // to real canvas-level drawing primitives via the enhanced bundle.
        try {
          if (typeof window.DrawingToolsManager === 'function') {
            window._drawingManager = new window.DrawingToolsManager(chart, series);
          }
        } catch (_dtErr) {}

        try {
          if (chart && typeof chart.subscribeClick === 'function') {
            chart.subscribeClick(function(param) {
              try {
                if (!param || !param.point) return;
                emitChartTapAtPoint(param.point.x, param.point.y);
              } catch (_tapErr) {}
            });
          }
        } catch (_chartTapErr) {}

        applyOverlayPayload(_overlayPayload);
        setMarketPriceLines(lastBidPrice, lastAskPrice);
        postChartGeometry();
        postChartReady();
      }

      function initChart(opts, chartType, data, displayDecimals, showLowerPane) {
        try {
          lastInitHostOptions = cloneSerializableValue(opts || {}, {});
          lastInitChartType = chartType || 'candles';
          lastInitShowLowerPane = showLowerPane !== false;
          if (typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0) {
            lastRequestedDisplayDecimals = displayDecimals;
          }

          // Set body/container background to match chart — prevents
          // white-on-white invisibility in light theme.
          try {
            var bg = (opts && opts.layout && opts.layout.background && opts.layout.background.color) || '#000';
            document.body.style.background = bg;
            document.getElementById('chart').style.background = bg;
          } catch(_) {}

          // Defer to requestAnimationFrame so the browser completes layout
          // before we measure the container. This is the core fix for the
          // "light theme first load" bug — on Android, the WebView container
          // has 0x0 dimensions until the first paint cycle completes.
          requestAnimationFrame(function() {
            try {
              _doInitChart(
                lastInitHostOptions,
                lastInitChartType,
                Array.isArray(data) ? data.slice() : [],
                lastRequestedDisplayDecimals,
                lastInitShowLowerPane
              );
            } catch(e) {
              postError('initChart', e);
            }
          });
        } catch (e) {
          postError('initChart', e);
        }
      }

      function resizeChartViewport(width, height) {
        try {
          var w = Math.round(Number(width));
          var h = Math.round(Number(height));
          if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;

          var chartElement = document.getElementById('chart');
          if (chartElement) {
            // Keep the host element container-fill based instead of pinning it
            // to one explicit pixel size. During fullscreen exit the native
            // viewport can report a transient intermediate layout; if the DOM
            // stays stuck on that width for even one frame, the right price
            // scale visibly shifts left before the final resize arrives.
            chartElement.style.width = '100%';
            chartElement.style.height = '100%';
          }

          if (_pendingInit) {
            _doInitChart(
              _pendingInit.opts,
              _pendingInit.chartType,
              _pendingInit.data,
              _pendingInit.displayDecimals,
              _pendingInit.showLowerPane
            );
            return;
          }

          if (chart) {
            chart.resize(w, h);
            ensureMoveBarsSeries(lastDisplayDecimals);
            refreshOverlayDomLabels(_overlayPayload);
            postChartGeometry();
          }
        } catch (e) {
          postError('resizeChartViewport', e);
        }
      }

      function recoverChartSurface(width, height) {
        try {
          var chartElement = document.getElementById('chart');
          if (!chartElement) return;

          chartElement.style.width = '100%';
          chartElement.style.height = '100%';

          var w = Math.round(Number(width));
          var h = Math.round(Number(height));

          if (!isFinite(w) || w <= 0) {
            w = chartElement.clientWidth;
          }
          if (!isFinite(h) || h <= 0) {
            h = chartElement.clientHeight;
          }
          if (w <= 0 || h <= 0) return;

          if (_pendingInit) {
            _doInitChart(
              _pendingInit.opts,
              _pendingInit.chartType,
              _pendingInit.data,
              _pendingInit.displayDecimals,
              _pendingInit.showLowerPane
            );
            return;
          }

          if (!chart || !series) {
            if (lastInitHostOptions && lastRawSeriesData && lastRawSeriesData.length > 0) {
              _doInitChart(
                cloneSerializableValue(lastInitHostOptions, {}),
                lastInitChartType,
                lastRawSeriesData.slice(),
                lastRequestedDisplayDecimals,
                lastInitShowLowerPane
              );
            }
            return;
          }

          chart.resize(w, h);
          ensureMoveBarsSeries(lastDisplayDecimals);

          if (lastRawSeriesData && lastRawSeriesData.length > 0) {
            var mapped = mapForSeries(lastRawSeriesData);
            if (mapped && mapped.length > 0) {
              series.setData(mapped);
              currentSeriesLength = mapped.length;
              lastBarTime = mapped[mapped.length - 1].time;

              if (seriesType !== 'line') {
                var lastSeed = lastRawSeriesData[lastRawSeriesData.length - 1];
                _liveBar = {
                  time: lastSeed.time,
                  open: lastSeed.open,
                  high: lastSeed.high,
                  low: lastSeed.low,
                  close: lastSeed.close,
                };
                _liveBarHasObservedRealtimeUpdate = false;
              }
            }

            if (moveBarsSeries) {
              try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_moveRecoverErr) {}
            }
          }

          _positionLinesArr = [];
          _overlayMarkers = null;
          applyOverlayPayload(_overlayPayload);
          setMarketPriceLines(lastBidPrice, lastAskPrice);
          ensureDirectionPriceLine();
          refreshDirectionPriceLine();
          ensureMoveDirectionPriceLine();
          refreshMoveDirectionPriceLine();
          scheduleOverlayPriceScaleLock(true);
          postChartGeometry();
        } catch (e) {
          postError('recoverChartSurface', e);
        }
      }

      // ResizeObserver — auto-resize the chart when the WebView container
      // dimensions change (orientation, tab switch, delayed layout).
      // Also catches the zero-dimension → real-dimension transition.
      try {
        var _resizeObserver = new ResizeObserver(function(entries) {
          var entry = entries[0];
          if (!entry) return;
          var w = entry.contentRect.width;
          var h = entry.contentRect.height;
          if (w > 0 && h > 0) {
            if (_pendingInit) {
              // Container just got real dimensions — run the deferred init.
              _doInitChart(
                _pendingInit.opts,
                _pendingInit.chartType,
                _pendingInit.data,
                _pendingInit.displayDecimals,
                _pendingInit.showLowerPane
              );
            } else if (chart) {
              // Chart exists — just resize it to match.
              try {
                chart.resize(w, h);
                ensureMoveBarsSeries(lastDisplayDecimals);
                refreshOverlayDomLabels(_overlayPayload);
                postChartGeometry();
              } catch(_) {}
            }
          }
        });
        _resizeObserver.observe(document.getElementById('chart'));
      } catch(_) {
        // ResizeObserver not available on very old WebViews — the rAF
        // fallback in _doInitChart handles it.
      }

      function hexToRgba(hex, alpha) {
        try {
          var h = hex.replace('#', '');
          if (h.length === 3) { h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
          var r = parseInt(h.substring(0, 2), 16);
          var g = parseInt(h.substring(2, 4), 16);
          var b = parseInt(h.substring(4, 6), 16);
          if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error('bad hex');
          return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        } catch (_e) {
          return alpha >= 0.9 ? hex : 'rgba(128,128,128,' + alpha + ')';
        }
      }

      function shouldUseMoveBarsPane() {
        return shouldShowLowerPane && seriesType !== 'line';
      }

      function setPrimaryPriceScaleMargins(hasLowerPane) {
        if (!chart || typeof chart.priceScale !== 'function') return;
        try {
          chart.priceScale('right').applyOptions({
            entireTextOnly: true,
            scaleMargins: {
              top: 0.08,
              bottom: hasLowerPane ? 0.32 : 0.08,
            },
          });
        } catch (_e) {}
      }

      function ensureMoveBarsSeries(displayDecimals) {
        if (!chart) return false;
        if (!shouldUseMoveBarsPane()) {
          setPrimaryPriceScaleMargins(false);
          return false;
        }
        if (moveBarsSeries) {
          setPrimaryPriceScaleMargins(true);
          return true;
        }
        try {
          var precision =
            typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
              ? displayDecimals
              : lastDisplayDecimals;
          moveBarsSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            priceFormat: {
              type: 'price',
              precision: precision,
              minMove: 1 / Math.pow(10, precision),
            },
            priceScaleId: 'move',
            lastValueVisible: false,
            priceLineVisible: false,
            color: moveUpColor,
          });
          chart.priceScale('move').applyOptions({
            entireTextOnly: true,
            scaleMargins: { top: 0.82, bottom: 0.02 },
          });
          if (lastRawSeriesData && lastRawSeriesData.length > 0) {
            try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_mbSet) {}
          }
          setPrimaryPriceScaleMargins(true);
          refreshMoveDirectionPriceLine();
          return true;
        } catch (_mb) {
          moveBarsSeries = null;
          moveDirectionPriceLine = null;
          setPrimaryPriceScaleMargins(false);
          return false;
        }
      }

      function mapForSeries(data) {
        data = sanitizeSeriesData(data);
        if (!data || data.length === 0) return [];
        if (seriesType === 'line') {
          var out = new Array(data.length);
          for (var i = 0; i < data.length; i++) {
            var c = data[i];
            out[i] = { time: c.time, value: typeof c.value === 'number' ? c.value : c.close };
          }
          return out;
        }
        // candles / hollow / bars all share the same OHLC shape
        var arr = new Array(data.length);
        for (var j = 0; j < data.length; j++) {
          var d = data[j];
          arr[j] = {
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          };
        }
        return arr;
      }

      function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
      }

      function normalizeRawSeriesDatum(item) {
        if (!item || !isFiniteNumber(item.time) || item.time <= 0) {
          return null;
        }

        var time = item.time;
        var volume = isFiniteNumber(item.volume) && item.volume >= 0 ? item.volume : 0;
        if (seriesType === 'line') {
          var value = isFiniteNumber(item.value) ? item.value : item.close;
          if (!isFiniteNumber(value)) {
            return null;
          }
          return {
            time: time,
            value: value,
            open: isFiniteNumber(item.open) ? item.open : value,
            high: isFiniteNumber(item.high) ? item.high : value,
            low: isFiniteNumber(item.low) ? item.low : value,
            close: isFiniteNumber(item.close) ? item.close : value,
            volume: volume,
          };
        }

        var open = item.open;
        var rawHigh = item.high;
        var rawLow = item.low;
        var close = item.close;

        if (
          !isFiniteNumber(open) ||
          !isFiniteNumber(rawHigh) ||
          !isFiniteNumber(rawLow) ||
          !isFiniteNumber(close)
        ) {
          return null;
        }

        var high = Math.max(open, close, rawHigh);
        var low = Math.min(open, close, rawLow);

        return {
          time: time,
          open: open,
          high: high,
          low: low,
          close: close,
          volume: volume,
        };
      }

      function mergeRawSeriesDatum(existing, incoming) {
        if (!existing) {
          return incoming;
        }
        var close = typeof incoming.close === 'number'
          ? incoming.close
          : (typeof incoming.value === 'number' ? incoming.value : existing.close);
        var merged = {
          time: existing.time,
          open: existing.open,
          high: Math.max(existing.high, incoming.high),
          low: Math.min(existing.low, incoming.low),
          close: close,
          volume: (typeof existing.volume === 'number' ? existing.volume : 0) +
            (typeof incoming.volume === 'number' ? incoming.volume : 0),
        };
        if (seriesType === 'line') {
          merged.value = close;
        }
        return normalizeRawSeriesDatum(merged);
      }

      function sanitizeSeriesData(data) {
        if (!Array.isArray(data) || data.length === 0) {
          return [];
        }

        var byTime = {};
        for (var i = 0; i < data.length; i++) {
          var normalized = normalizeRawSeriesDatum(data[i]);
          if (normalized) {
            var key = String(normalized.time);
            byTime[key] = mergeRawSeriesDatum(byTime[key], normalized);
          }
        }

        return Object.keys(byTime)
          .map(function(key) { return byTime[key]; })
          .sort(function(left, right) { return left.time - right.time; });
      }

      function upsertRawSeriesDatum(tick) {
        var normalized = normalizeRawSeriesDatum(tick);
        if (!normalized) {
          return null;
        }
        if (!Array.isArray(lastRawSeriesData)) {
          lastRawSeriesData = [];
        }

        var lastIndex = lastRawSeriesData.length - 1;
        if (lastIndex >= 0) {
          var last = lastRawSeriesData[lastIndex];
          if (normalized.time < last.time) {
            return null;
          }
          if (normalized.time === last.time) {
            lastRawSeriesData[lastIndex] = normalized;
            return normalized;
          }
        }

        lastRawSeriesData.push(normalized);
        return normalized;
      }

      // One histogram point per bar: |close − open|, coloured by direction.
      function mapMoveBarsData(data) {
        if (!data || data.length === 0) return [];
        var out = new Array(data.length);
        for (var i = 0; i < data.length; i++) {
          var d = data[i];
          var open = typeof d.open === 'number' ? d.open : d.close;
          var close = typeof d.close === 'number' ? d.close : (typeof d.value === 'number' ? d.value : open);
          var up = close >= open;
          out[i] = {
            time: d.time,
            value: Math.abs(close - open),
            color: up ? moveUpColor : moveDownColor,
          };
        }
        return out;
      }

      // One histogram point derived from the current live bar state.
      function makeMoveBarPoint(bar) {
        var up = bar.close >= bar.open;
        return {
          time: bar.time,
          value: Math.abs(bar.close - bar.open),
          color: up ? moveUpColor : moveDownColor,
        };
      }

      function updateChartData(data) {
        try {
          if (!series) {
            postError('updateChartData', new Error('series not initialized'));
            return;
          }
          if (tickFlushHandle) {
            try { cancelAnimationFrame(tickFlushHandle); } catch (_) {}
            tickFlushHandle = 0;
          }
          pendingTick = null;
          lastRawSeriesData = sanitizeSeriesData(data);
          try {
            console.log('[WEBVIEW-CANDLE] updateChartData', {
              count: lastRawSeriesData.length,
              firstTime: lastRawSeriesData[0] ? lastRawSeriesData[0].time : null,
              lastTime: lastRawSeriesData[lastRawSeriesData.length - 1] ? lastRawSeriesData[lastRawSeriesData.length - 1].time : null,
            });
          } catch (_logErr) {}
          var mapped = mapForSeries(lastRawSeriesData);
          currentSeriesLength = mapped.length;
          series.setData(mapped);
          ensureMoveBarsSeries(lastDisplayDecimals);
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_mb) {}
          }

          // CRITICAL BUGFIX: setData natively obliterates all PriceLines previously bound to the series!
          // We must explicitly reconstruct the dynamic trade overlays immediately after setting chart data.
          _positionLinesArr = [];
          _overlayMarkers = null;
          if (_overlayPayload) {
            applyOverlayPayload(_overlayPayload);
          }
          setMarketPriceLines(lastBidPrice, lastAskPrice);

          if (mapped.length > 0) {
            lastBarTime = mapped[mapped.length - 1].time;
            if (seriesType !== 'line') {
              var lastSeed = lastRawSeriesData[lastRawSeriesData.length - 1];
              _liveBar = {
                time: lastSeed.time,
                open: lastSeed.open,
                high: lastSeed.high,
                low: lastSeed.low,
                close: lastSeed.close,
              };
              _liveBarHasObservedRealtimeUpdate = false;
            }
            // Symbol / timeframe switch: reposition both direction lines to
            // the new dataset's last close + move magnitude so they don't
            // linger at the previous symbol's price.
            refreshDirectionPriceLine();
            refreshMoveDirectionPriceLine();
          } else {
            lastBarTime = 0;
            _liveBar = null;
            _liveBarHasObservedRealtimeUpdate = false;
          }
        } catch (e) {
          postError('updateChartData', e);
        }
      }

      // Backend OHLC patch state mirrored inside the WebView.
      var _liveBar = null; // { time, open, high, low, close }
      var _liveBarHasObservedRealtimeUpdate = false;

      function applyTickUpdate(tick) {
        if (!series || !tick || typeof tick.time !== 'number') return;
        if (tick.time < lastBarTime) {
          try {
            console.log('[WEBVIEW-CANDLE] applyTickUpdate_rejected', {
              reason: 'stale_tick',
              tickTime: tick.time,
              lastBarTime: lastBarTime,
            });
          } catch (_logErr) {}
          return;
        }
        var normalizedTick = upsertRawSeriesDatum(tick);
        if (!normalizedTick) {
          try {
            console.log('[WEBVIEW-CANDLE] applyTickUpdate_rejected', {
              reason: 'invalid_or_old_tick',
              tickTime: tick.time,
              lastBarTime: lastBarTime,
            });
          } catch (_logErr) {}
          return;
        }
        var appendedNewBar = currentSeriesLength === 0 || normalizedTick.time > lastBarTime;
        var bar;
        if (seriesType === 'line') {
          bar = { time: normalizedTick.time, value: typeof normalizedTick.value === 'number' ? normalizedTick.value : normalizedTick.close };
        } else {
          bar = {
            time: normalizedTick.time,
            open: normalizedTick.open,
            high: normalizedTick.high,
            low: normalizedTick.low,
            close: normalizedTick.close,
          };
        }
        // Sync internal accumulator with full OHLC from host
        _liveBar = { time: normalizedTick.time, open: normalizedTick.open, high: normalizedTick.high, low: normalizedTick.low, close: normalizedTick.close };
        _liveBarHasObservedRealtimeUpdate = true;
        try {
          console.log('[WEBVIEW-CANDLE] applyTickUpdate', {
            time: normalizedTick.time,
            appended: appendedNewBar,
            count: lastRawSeriesData.length,
          });
        } catch (_logErr) {}
        series.update(bar);
        currentSeriesLength = lastRawSeriesData.length;
        if (normalizedTick.time >= lastBarTime) {
          lastBarTime = normalizedTick.time;
        }
        ensureMoveBarsSeries(lastDisplayDecimals);
        if (moveBarsSeries && seriesType !== 'line') {
          try { moveBarsSeries.update(makeMoveBarPoint(_liveBar)); } catch (_mb) {}
        }
        refreshBidPriceLineColor();
        refreshDirectionPriceLine();
        refreshMoveDirectionPriceLine();
        refreshOverlayDomLabels(_overlayPayload);
      }

      function flushPendingTick() {
        try {
          tickFlushHandle = 0;
          var tick = pendingTick;
          pendingTick = null;
          if (!tick) return;
          applyTickUpdate(tick);
        } catch (e) {
          if (typeof e.message === 'string' && e.message.indexOf('Cannot update oldest data') >= 0) {
            return; // benign race
          }
          postError('flushPendingTick', e);
        }
      }

      function updateTick(tick) {
        if (!tick || typeof tick.time !== 'number') return;
        try {
          console.log('[WEBVIEW-CANDLE] updateTick_queued', { time: tick.time });
        } catch (_logErr) {}
        pendingTick = tick;
        if (tickFlushHandle) return;
        tickFlushHandle = requestAnimationFrame(flushPendingTick);
      }

      // Pick the candle-direction colour for the live bid / last-price line.
      // Up candle (close ≥ open) → barUpColor. Down candle → barDownColor.
      function pickLivePriceColor() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return barUpColor;
        }
        return _liveBar.close >= _liveBar.open ? barUpColor : barDownColor;
      }

      // Create the dedicated direction-coloured price line at the live close
      // if it doesn't exist yet. Safe to call repeatedly — no-ops once the
      // instance is bound.
      function ensureDirectionPriceLine() {
        try {
          if (marketPriceLinesVisible) return;
          if (directionPriceLine || !series) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          directionPriceLine = series.createPriceLine({
            price: _liveBar.close,
            color: pickLivePriceColor(),
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: false,
          });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      // Re-price and re-tint the direction line on every tick. Only calls
      // applyOptions on the price-line instance we own — never on the main
      // series — so it can't trigger a history redraw. If applyOptions
      // fails (e.g. the series was torn down underneath) we null the ref
      // so the next tick recreates a fresh instance on the live series.
      function refreshDirectionPriceLine() {
        if (!_liveBar || typeof _liveBar.close !== 'number') return;
        if (marketPriceLinesVisible) {
          if (directionPriceLine && series) {
            try { series.removePriceLine(directionPriceLine); } catch (_e) {}
            directionPriceLine = null;
          }
          return;
        }
        if (!directionPriceLine) {
          ensureDirectionPriceLine();
          return;
        }
        var color = pickLivePriceColor();
        try {
          directionPriceLine.applyOptions({ price: _liveBar.close, color: color });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      // Current move magnitude for the active bar (|close − open|). This is
      // the y-value the move-bars pane plots, and where its direction line
      // should sit.
      function pickLiveMoveValue() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return 0;
        }
        return Math.abs(_liveBar.close - _liveBar.open);
      }

      // Create the move-bars pane's direction line the first time we have a
      // live bar. Scoped to the move-bars series so it renders on the move
      // price scale ('move'), not the main candle scale.
      function ensureMoveDirectionPriceLine() {
        try {
          if (moveDirectionPriceLine || !moveBarsSeries) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          moveDirectionPriceLine = moveBarsSeries.createPriceLine({
            price: pickLiveMoveValue(),
            color: pickLivePriceColor(),
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
          });
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      // Re-price + re-tint the move-bars direction line every tick. Again,
      // only touches the price-line instance — move-bars series itself stays
      // untouched. Same teardown-recovery trick: null the ref on failure so
      // the next call recreates rather than re-throwing forever.
      function refreshMoveDirectionPriceLine() {
        if (!moveBarsSeries || !_liveBar) return;
        if (!moveDirectionPriceLine) {
          ensureMoveDirectionPriceLine();
          return;
        }
        try {
          moveDirectionPriceLine.applyOptions({
            price: pickLiveMoveValue(),
            color: pickLivePriceColor(),
          });
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      function removeMarketPriceLine(line) {
        if (!series || !line) return null;
        try { series.removePriceLine(line); } catch (_e) {}
        return null;
      }

      function setBidPriceLine(price) {
        try {
          if (!series) return;
          if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
            bidPriceLine = removeMarketPriceLine(bidPriceLine);
            return;
          }
          if (bidPriceLine) {
            try {
              bidPriceLine.applyOptions({
                price: price,
                color: marketBidColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
                lineVisible: true,
                axisLabelVisible: true,
                title: '',
              });
              return;
            } catch (_e) {
              bidPriceLine = removeMarketPriceLine(bidPriceLine);
            }
          }
          bidPriceLine = series.createPriceLine({
            price: price,
            color: marketBidColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            lineVisible: true,
            axisLabelVisible: true,
            title: '',
          });
        } catch (e) {
          postError('setBidPriceLine', e);
        }
      }

      function setAskPriceLine(price) {
        try {
          if (!series) return;
          if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
            askPriceLine = removeMarketPriceLine(askPriceLine);
            return;
          }
          if (askPriceLine) {
            try {
              askPriceLine.applyOptions({
                price: price,
                color: marketAskColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
                lineVisible: true,
                axisLabelVisible: true,
                title: '',
              });
              return;
            } catch (_e) {
              askPriceLine = removeMarketPriceLine(askPriceLine);
            }
          }
          askPriceLine = series.createPriceLine({
            price: price,
            color: marketAskColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            lineVisible: true,
            axisLabelVisible: true,
            title: '',
          });
        } catch (e) {
          postError('setAskPriceLine', e);
        }
      }

      function setMarketPriceLines(bid, ask) {
        var hasBid = typeof bid === 'number' && isFinite(bid) && bid > 0;
        var hasAsk = typeof ask === 'number' && isFinite(ask) && ask > 0;
        lastBidPrice = hasBid ? bid : null;
        lastAskPrice = hasAsk ? ask : null;
        marketPriceLinesVisible = hasBid || hasAsk;
        if (marketPriceLinesVisible && directionPriceLine && series) {
          try { series.removePriceLine(directionPriceLine); } catch (_e) {}
          directionPriceLine = null;
        }
        if (hasBid) {
          setBidPriceLine(bid);
        } else {
          bidPriceLine = removeMarketPriceLine(bidPriceLine);
        }
        if (hasAsk) {
          setAskPriceLine(ask);
        } else {
          askPriceLine = removeMarketPriceLine(askPriceLine);
        }
        scheduleOverlayDomRefresh();
      }

      // Re-tint the custom BID price line in place when the active candle
      // flips direction mid-bucket (blue when bullish, red when bearish).
      // We intentionally don't touch the candle series' or move-bars' own
      // options — applyOptions on the main series can cause a full redraw
      // of the data, which was blanking history on some rebuilds.
      function refreshBidPriceLineColor() {
        if (!bidPriceLine) return;
        try { bidPriceLine.applyOptions({ color: marketBidColor }); } catch (_e) {}
      }

      // Backwards-compat no-ops so any stale call sites from earlier
      // builds (drawing tools / overlays) silently do nothing instead of
      // throwing and aborting the script.
      function setLiveCandleLine() {}
      function updateChartAppearance() {}
      // Legacy no-op kept so stale call-sites from earlier builds don't throw.
      function setVolumeSeriesData(_data) {}
      function setDrawingTool(tool) {
        if (window._drawingManager && typeof window._drawingManager.setActiveTool === 'function') {
          window._drawingManager.setActiveTool(tool);
        }
      }
      function clearDrawings() {
        if (window._drawingManager && typeof window._drawingManager.removeAllDrawings === 'function') {
          window._drawingManager.removeAllDrawings();
        }
      }
      function setSerializedDrawings(drawings) {
        if (window._drawingManager && typeof window._drawingManager.setSerializedDrawings === 'function') {
          window._drawingManager.setSerializedDrawings(drawings);
        }
      }
      function setDrawingsLocked(locked) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsLocked === 'function') {
          window._drawingManager.setDrawingsLocked(locked);
        }
      }
      function setDrawingsHidden(hidden) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsHidden === 'function') {
          window._drawingManager.setDrawingsHidden(hidden);
        }
      }
      function setStayInDrawingMode(sticky) {
        if (window._drawingManager && typeof window._drawingManager.setStayInDrawingMode === 'function') {
          window._drawingManager.setStayInDrawingMode(sticky);
        }
      }
      function setMagnetMode(enabled) {
        if (window._drawingManager && typeof window._drawingManager.setMagnetMode === 'function') {
          window._drawingManager.setMagnetMode(enabled);
        }
      }
      function zoomChart() {
        if (window._drawingManager && typeof window._drawingManager.zoomToFit === 'function') {
          window._drawingManager.zoomToFit();
        }
      }
      // ── Position / Trade Level Lines ──────────────────────────────
      // Manages entry price, TP, and SL horizontal lines on the chart.
      // Called from React Native whenever positions change or the user
      // toggles the "Show Trade Levels" setting.
      var _positionLinesArr = [];
      var _overlayPriceLinesByDragKey = Object.create(null);
      var _overlayMarkers = null;
      var _overlayPayload = { priceLines: [], markers: [] };
      var _overlayResyncTimer = null;
      var _overlayLabelLayer = null;
      var activeTradeLineDrag = null;
      var suppressNextChartClickUntil = 0;
      var TRADE_LINE_DRAG_HIT_SLOP = 30;
      var CHART_TRADE_LINE_DRAG_NATIVE_MOVE_INTERVAL_MS = 96;
      var CHART_TRADE_LINE_DRAG_DOM_REFRESH_INTERVAL_MS = 64;

      function clearOverlayPriceLines() {
        if (series) {
          for (var i = 0; i < _positionLinesArr.length; i++) {
            try { series.removePriceLine(_positionLinesArr[i]); } catch (_e) {}
          }
        }
        _positionLinesArr = [];
        _overlayPriceLinesByDragKey = Object.create(null);
        activeTradeLineDrag = null;
        chartTouchInteractionSuspendDepth = 0;
      }

      function clearOverlayMarkers() {
        if (_overlayMarkers && typeof _overlayMarkers.detach === 'function') {
          try { _overlayMarkers.detach(); } catch (_e) {}
        }
        _overlayMarkers = null;
      }

      function ensureOverlayLabelLayer() {
        var el = document.getElementById('chart');
        if (!el) return null;
        if (_overlayLabelLayer && _overlayLabelLayer.parentNode === el) {
          return _overlayLabelLayer;
        }
        el.style.position = 'relative';
        _overlayLabelLayer = document.createElement('div');
        _overlayLabelLayer.style.position = 'absolute';
        _overlayLabelLayer.style.left = '0';
        _overlayLabelLayer.style.top = '0';
        _overlayLabelLayer.style.right = '0';
        _overlayLabelLayer.style.bottom = '0';
        _overlayLabelLayer.style.pointerEvents = 'none';
        _overlayLabelLayer.style.zIndex = '7';
        el.appendChild(_overlayLabelLayer);
        return _overlayLabelLayer;
      }

      function clearOverlayDomLabels() {
        if (!_overlayLabelLayer) return;
        while (_overlayLabelLayer.firstChild) {
          _overlayLabelLayer.removeChild(_overlayLabelLayer.firstChild);
        }
      }

      function roundOverlayDragPrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        var decimals =
          typeof lastRequestedDisplayDecimals === 'number' && isFinite(lastRequestedDisplayDecimals)
            ? Math.max(0, Math.min(10, Math.round(lastRequestedDisplayDecimals)))
            : 5;
        return Number(price.toFixed(decimals));
      }

      function sanitizeOverlayDragPrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        return price;
      }

      function postChartTradeLineDrag(phase, dragKey, price) {
        if (!dragKey) return;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TRADE_LINE_DRAG',
            phase: phase,
            dragKey: dragKey,
            price: typeof price === 'number' && isFinite(price) ? price : null,
          }));
        } catch (_e) {}
      }

      var pendingChartTradeLineDragMove = null;
      var chartTradeLineDragMoveFrame = null;
      var chartTradeLineDragMoveTimer = null;
      var lastChartTradeLineDragNativeMoveAt = 0;

      function cancelChartTradeLineDragMove() {
        if (chartTradeLineDragMoveFrame !== null) {
          try {
            cancelAnimationFrame(chartTradeLineDragMoveFrame);
          } catch (_e) {}
          chartTradeLineDragMoveFrame = null;
        }
        if (chartTradeLineDragMoveTimer !== null) {
          try {
            clearTimeout(chartTradeLineDragMoveTimer);
          } catch (_e) {}
          chartTradeLineDragMoveTimer = null;
        }
        pendingChartTradeLineDragMove = null;
      }

      function flushChartTradeLineDragMove() {
        chartTradeLineDragMoveFrame = null;
        var pending = pendingChartTradeLineDragMove;
        if (!pending || !pending.dragKey) return;
        var now = Date.now();
        var delay = CHART_TRADE_LINE_DRAG_NATIVE_MOVE_INTERVAL_MS - (now - lastChartTradeLineDragNativeMoveAt);
        if (delay > 0) {
          chartTradeLineDragMoveTimer = setTimeout(function() {
            chartTradeLineDragMoveTimer = null;
            chartTradeLineDragMoveFrame = requestAnimationFrame(flushChartTradeLineDragMove);
          }, delay);
          return;
        }
        pendingChartTradeLineDragMove = null;
        lastChartTradeLineDragNativeMoveAt = now;
        postChartTradeLineDrag('move', pending.dragKey, pending.price);
      }

      function scheduleChartTradeLineDragMove(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        pendingChartTradeLineDragMove = { dragKey: dragKey, price: price };
        if (chartTradeLineDragMoveFrame !== null || chartTradeLineDragMoveTimer !== null) {
          return;
        }
        try {
          chartTradeLineDragMoveFrame = requestAnimationFrame(flushChartTradeLineDragMove);
        } catch (_e) {
          flushChartTradeLineDragMove();
        }
      }

      function resolveDraggableOverlayPriceLines() {
        var lines = Array.isArray(_overlayPayload && _overlayPayload.priceLines) ? _overlayPayload.priceLines : [];
        var draggable = [];
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (!ln || typeof ln.dragKey !== 'string' || !ln.dragKey) continue;
          if (typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0) continue;
          draggable.push(ln);
        }
        return draggable;
      }

      function pickDraggableOverlayLineAtY(y) {
        if (!series || typeof y !== 'number' || !isFinite(y)) {
          return null;
        }
        var draggableLines = resolveDraggableOverlayPriceLines();
        var closest = null;
        var closestDistance = Infinity;
        for (var i = 0; i < draggableLines.length; i++) {
          var line = draggableLines[i];
          if (typeof series.priceToCoordinate !== 'function') {
            continue;
          }
          var coordinate = series.priceToCoordinate(line.price);
          if (typeof coordinate !== 'number' || !isFinite(coordinate)) {
            continue;
          }
          var distance = Math.abs(coordinate - y);
          if (distance <= TRADE_LINE_DRAG_HIT_SLOP && distance < closestDistance) {
            closest = {
              dragKey: line.dragKey,
              price: line.price,
              y: coordinate,
            };
            closestDistance = distance;
          }
        }
        return closest;
      }

      function syncOverlayPayloadDragLinePrice(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        var lines = Array.isArray(_overlayPayload && _overlayPayload.priceLines)
          ? _overlayPayload.priceLines
          : [];
        var nextLines = lines.map(function(line) {
          if (line && line.dragKey === dragKey) {
            return Object.assign({}, line, { price: price });
          }
          return line;
        });
        _overlayPayload = Object.assign({}, _overlayPayload || {}, { priceLines: nextLines });
        var entry = _overlayPriceLinesByDragKey[dragKey];
        if (entry && entry.line) {
          entry.line.price = price;
        }
      }

      function preserveActiveTradeLineDragPayload(payload) {
        if (!activeTradeLineDrag || !payload || !Array.isArray(payload.priceLines)) {
          return payload;
        }
        return Object.assign({}, payload, {
          priceLines: payload.priceLines.map(function(line) {
            if (line && line.dragKey === activeTradeLineDrag.dragKey) {
              return Object.assign({}, line, { price: activeTradeLineDrag.lastPrice });
            }
            return line;
          }),
        });
      }

      function updateDraggedOverlayLinePreview(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        syncOverlayPayloadDragLinePrice(dragKey, price);
        var entry = _overlayPriceLinesByDragKey[dragKey];
        if (!entry || !entry.api || !entry.line) {
          return;
        }
        entry.line.price = price;
        try {
          entry.api.applyOptions({
            price: price,
            axisLabelVisible: entry.line.axisLabelVisible !== false,
            title: '',
          });
        } catch (_e) {}
        scheduleTradeLineDragDomRefresh();
      }

      function resolveOverlayLabelBounds(layer) {
        var metrics = resolvePrimaryPaneMetrics();
        var plotTop = metrics.plotTop || 0;
        var plotBottom = plotTop + (metrics.plotHeight || 0);
        var layerHeight = layer && layer.clientHeight ? layer.clientHeight : metrics.chartHeight || 0;
        var minTop = Math.max(OVERLAY_LABEL_TOP_SAFE_PADDING, plotTop + 6);
        var maxTop = Math.max(
          minTop,
          Math.min(layerHeight - OVERLAY_LABEL_HEIGHT - 2, plotBottom - OVERLAY_LABEL_HEIGHT - OVERLAY_LABEL_BOTTOM_SAFE_PADDING)
        );

        return {
          minTop: minTop,
          maxTop: maxTop,
        };
      }

      function resolveAnchoredOverlayLabelBounds(layer) {
        var metrics = resolvePrimaryPaneMetrics();
        var plotTop = metrics.plotTop || 0;
        var plotBottom = plotTop + (metrics.plotHeight || 0);
        var layerHeight = layer && layer.clientHeight ? layer.clientHeight : metrics.chartHeight || 0;
        var minTop = Math.max(0, plotTop + 1);
        var maxTop = Math.max(
          minTop,
          Math.min(layerHeight - OVERLAY_LABEL_LINE_HEIGHT - 1, plotBottom - OVERLAY_LABEL_LINE_HEIGHT - 1)
        );

        return {
          minTop: minTop,
          maxTop: maxTop,
        };
      }

      function formatMarketPriceLabel(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return '';
        }
        var decimals =
          typeof lastRequestedDisplayDecimals === 'number' && isFinite(lastRequestedDisplayDecimals)
            ? Math.max(0, Math.min(10, Math.round(lastRequestedDisplayDecimals)))
            : 5;
        return Number(price).toFixed(decimals);
      }

      function renderMarketPriceBadges(layer) {
        if (!layer || !series || typeof series.priceToCoordinate !== 'function') {
          return;
        }

        var metrics = resolvePrimaryPaneMetrics();
        var plotTop = metrics.plotTop || 0;
        var plotBottom = plotTop + (metrics.plotHeight || 0);
        var layerHeight = layer && layer.clientHeight ? layer.clientHeight : metrics.chartHeight || 0;
        var minTop = Math.max(0, plotTop + 1);
        var maxTop = Math.max(
          minTop,
          Math.min(layerHeight - MARKET_PRICE_BADGE_HEIGHT - 1, plotBottom - MARKET_PRICE_BADGE_HEIGHT - 1)
        );
        var badges = [];

        if (typeof lastAskPrice === 'number' && isFinite(lastAskPrice) && lastAskPrice > 0) {
          var askY = series.priceToCoordinate(lastAskPrice);
          if (typeof askY === 'number' && isFinite(askY)) {
            badges.push({
              color: marketAskColor,
              text: formatMarketPriceLabel(lastAskPrice),
              y: askY,
            });
          }
        }

        if (typeof lastBidPrice === 'number' && isFinite(lastBidPrice) && lastBidPrice > 0) {
          var bidY = series.priceToCoordinate(lastBidPrice);
          if (typeof bidY === 'number' && isFinite(bidY)) {
            badges.push({
              color: marketBidColor,
              text: formatMarketPriceLabel(lastBidPrice),
              y: bidY,
            });
          }
        }

        if (badges.length === 0) {
          return;
        }

        badges.sort(function(left, right) { return left.y - right.y; });
        var step = MARKET_PRICE_BADGE_HEIGHT + MARKET_PRICE_BADGE_MIN_GAP;
        var tops = [];

        for (var badgeIndex = 0; badgeIndex < badges.length; badgeIndex++) {
          var desiredTop = Math.round(badges[badgeIndex].y - MARKET_PRICE_BADGE_HEIGHT / 2);
          if (badgeIndex > 0) {
            desiredTop = Math.max(desiredTop, tops[badgeIndex - 1] + step);
          }
          tops[badgeIndex] = Math.max(minTop, Math.min(maxTop, desiredTop));
        }

        if (tops.length > 0 && tops[tops.length - 1] > maxTop) {
          tops[tops.length - 1] = maxTop;
          for (var backIndex = tops.length - 2; backIndex >= 0; backIndex--) {
            tops[backIndex] = Math.min(tops[backIndex], tops[backIndex + 1] - step);
          }
          if (tops[0] < minTop) {
            tops[0] = minTop;
            for (var forwardIndex = 1; forwardIndex < tops.length; forwardIndex++) {
              tops[forwardIndex] = Math.max(tops[forwardIndex], tops[forwardIndex - 1] + step);
            }
          }
        }

        for (var renderIndex = 0; renderIndex < badges.length; renderIndex++) {
          var badge = badges[renderIndex];
          var badgeNode = document.createElement('div');
          badgeNode.textContent = badge.text;
          badgeNode.style.position = 'absolute';
          badgeNode.style.right = MARKET_PRICE_BADGE_RIGHT_INSET + 'px';
          badgeNode.style.top = Math.max(minTop, Math.min(maxTop, tops[renderIndex])) + 'px';
          badgeNode.style.height = MARKET_PRICE_BADGE_HEIGHT + 'px';
          badgeNode.style.lineHeight = MARKET_PRICE_BADGE_HEIGHT + 'px';
          badgeNode.style.padding = '0 6px';
          badgeNode.style.borderRadius = '4px';
          badgeNode.style.background = badge.color;
          badgeNode.style.color = '#FFFFFF';
          badgeNode.style.fontSize = '11px';
          badgeNode.style.fontWeight = '700';
          badgeNode.style.whiteSpace = 'nowrap';
          badgeNode.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.18)';
          layer.appendChild(badgeNode);
        }
      }

      function refreshOverlayDomLabels(payload) {
        try {
          clearOverlayDomLabels();
          if (!series) return;
          var layer = ensureOverlayLabelLayer();
          if (!layer) return;
          var lines = Array.isArray(payload && payload.priceLines) ? payload.priceLines : [];
          var floatingLabels = [];
          var anchoredLabels = [];
          var bounds = resolveOverlayLabelBounds(layer);
          var anchoredBounds = resolveAnchoredOverlayLabelBounds(layer);
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!ln || !ln.title || typeof ln.price !== 'number' || !isFinite(ln.price)) continue;
            if (typeof series.priceToCoordinate !== 'function') continue;
            var y = series.priceToCoordinate(ln.price);
            if (typeof y !== 'number' || !isFinite(y)) continue;
            var labelRecord = {
              color: ln.color || '#2962FF',
              text: String(ln.title),
              y: y,
            };
            if (typeof ln.dragKey === 'string' && ln.dragKey) {
              anchoredLabels.push(labelRecord);
            } else {
              floatingLabels.push(labelRecord);
            }
          }
          floatingLabels.sort(function(left, right) { return left.y - right.y; });
          var step = OVERLAY_LABEL_HEIGHT + OVERLAY_LABEL_GAP;
          var tops = [];
          for (var j = 0; j < floatingLabels.length; j++) {
            var desiredTop = Math.round(floatingLabels[j].y - OVERLAY_LABEL_HEIGHT / 2);
            if (j > 0) {
              desiredTop = Math.max(desiredTop, tops[j - 1] + step);
            }
            tops[j] = Math.max(bounds.minTop, Math.min(bounds.maxTop, desiredTop));
          }
          if (tops.length > 0 && tops[tops.length - 1] > bounds.maxTop) {
            tops[tops.length - 1] = bounds.maxTop;
            for (var backIndex = tops.length - 2; backIndex >= 0; backIndex--) {
              tops[backIndex] = Math.min(tops[backIndex], tops[backIndex + 1] - step);
            }
            if (tops[0] < bounds.minTop) {
              tops[0] = bounds.minTop;
              for (var forwardIndex = 1; forwardIndex < tops.length; forwardIndex++) {
                tops[forwardIndex] = Math.max(tops[forwardIndex], tops[forwardIndex - 1] + step);
              }
              if (tops[tops.length - 1] > bounds.maxTop) {
                tops[tops.length - 1] = bounds.maxTop;
                for (var secondBackIndex = tops.length - 2; secondBackIndex >= 0; secondBackIndex--) {
                  tops[secondBackIndex] = Math.min(tops[secondBackIndex], tops[secondBackIndex + 1] - step);
                }
              }
            }
          }

          var renderLabel = function(item, top) {
            var label = document.createElement('div');
            label.textContent = item.text;
            label.style.position = 'absolute';
            label.style.left = '8px';
            label.style.top = top + 'px';
            label.style.color = item.color;
            label.style.fontSize = '12px';
            label.style.fontWeight = '700';
            label.style.height = OVERLAY_LABEL_LINE_HEIGHT + 'px';
            label.style.lineHeight = OVERLAY_LABEL_LINE_HEIGHT + 'px';
            label.style.whiteSpace = 'nowrap';
            label.style.maxWidth = Math.max(80, (layer.clientWidth || 0) - 24) + 'px';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.textShadow = '0 1px 1px rgba(255,255,255,0.55)';
            layer.appendChild(label);
          };

          for (var labelIndex = 0; labelIndex < floatingLabels.length; labelIndex++) {
            var floatingItem = floatingLabels[labelIndex];
            var floatingTop = Math.max(bounds.minTop, Math.min(bounds.maxTop, tops[labelIndex]));
            renderLabel(floatingItem, floatingTop);
          }

          for (var anchoredIndex = 0; anchoredIndex < anchoredLabels.length; anchoredIndex++) {
            var anchoredItem = anchoredLabels[anchoredIndex];
            var anchoredTop = Math.round(anchoredItem.y - OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP);
            anchoredTop = Math.max(anchoredBounds.minTop, Math.min(anchoredBounds.maxTop, anchoredTop));
            renderLabel(anchoredItem, anchoredTop);
          }
        } catch (labelErr) {
          postError('refreshOverlayDomLabels', labelErr);
        }
      }

      // ── Robust "nuke and recreate" overlay renderer ──────────────
      // Matches the proven web version approach: always remove every
      // existing price line, then create fresh ones from the payload.
      // The previous incremental approach (track by ID, update-or-create)
      // silently lost lines when createPriceLine threw inside a
      // try/catch, and stale _positionLinesMap entries after chart
      // re-init caused ghost references that blocked new line creation.
      function applyOverlayPayload(payload) {
        try {
          if (!payload || typeof payload !== 'object') {
            payload = { priceLines: [], markers: [] };
          }
          if (!series) return;

          // Step 1: Remove ALL existing price lines (clean slate)
          clearOverlayPriceLines();

          // Step 2: Create ALL price lines from scratch
          var lines = Array.isArray(payload.priceLines) ? payload.priceLines : [];
          var created = 0;
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!ln || typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0 || !ln.id) continue;
            try {
              var priceLine = series.createPriceLine({
                price: ln.price,
                color: ln.color || '#2962FF',
                lineWidth: ln.lineWidth || 1,
                lineStyle: typeof ln.lineStyle === 'number' ? ln.lineStyle : (LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0),
                axisLabelVisible: ln.axisLabelVisible !== false,
                title: '',
              });
              _positionLinesArr.push(priceLine);
              if (typeof ln.dragKey === 'string' && ln.dragKey) {
                _overlayPriceLinesByDragKey[ln.dragKey] = {
                  api: priceLine,
                  line: ln,
                };
              }
              created++;
            } catch (lineErr) {
              postError('createPriceLine[' + ln.id + ']', lineErr);
            }
          }

          // Step 3: Handle markers (also nuke and recreate)
          clearOverlayMarkers();
          var markers = Array.isArray(payload.markers) ? payload.markers : [];
          if (lines.length === 0 && markers.length === 0) {
            postWebViewOverlayLog('emptyPayloadClearConfirmed: empty payload cleared stale price lines and markers');
          }
          if (
            markers.length > 0 &&
            typeof LightweightCharts !== 'undefined' &&
            typeof LightweightCharts.createSeriesMarkers === 'function'
          ) {
            try {
              _overlayMarkers = LightweightCharts.createSeriesMarkers(series, markers);
            } catch (markerErr) {
              _overlayMarkers = null;
              postError('createSeriesMarkers', markerErr);
            }
          }
          refreshOverlayDomLabels(payload);
        } catch (e) {
          postError('applyOverlayPayload', e);
        }
      }

      function setChartOverlays(payload) {
        var nextOverlayPayload = payload && typeof payload === 'object'
          ? payload
          : { priceLines: [], markers: [] };
        postWebViewOverlayLog('setChartOverlays received', {
          priceLines: Array.isArray(nextOverlayPayload.priceLines) ? nextOverlayPayload.priceLines.length : 0,
          markers: Array.isArray(nextOverlayPayload.markers) ? nextOverlayPayload.markers.length : 0,
        });
        nextOverlayPayload = preserveActiveTradeLineDragPayload(nextOverlayPayload);
        _overlayPayload = nextOverlayPayload;
        if (activeTradeLineDrag) {
          scheduleTradeLineDragDomRefresh();
          return;
        }
        applyOverlayPayload(_overlayPayload);
      }

      function setPriceLines(lines) {
        try {
          setChartOverlays({
            priceLines: Array.isArray(lines) ? lines : [],
            markers: Array.isArray(_overlayPayload.markers) ? _overlayPayload.markers : [],
          });
        } catch (e) { postError('setPriceLines', e); }
      }

      function updatePositionLines() {
        if (activeTradeLineDrag) {
          return;
        }
        applyOverlayPayload(_overlayPayload);
      }

      // ── Self-healing overlay resync ──────────────────────────────
      // Every 4 seconds, re-apply the cached overlay payload. This
      // guarantees that even if a setChartOverlays call races with
      // initChart's requestAnimationFrame (series=null at call time),
      // the lines self-heal within a few seconds.
      function startOverlayResync() {
        if (_overlayResyncTimer) clearInterval(_overlayResyncTimer);
        _overlayResyncTimer = setInterval(function() {
          if (
            !activeTradeLineDrag &&
            series &&
            _overlayPayload &&
            _overlayPayload.priceLines &&
            _overlayPayload.priceLines.length > 0
          ) {
            // Only resync if the line count on canvas doesn't match the payload
            if (_positionLinesArr.length !== _overlayPayload.priceLines.length) {
              applyOverlayPayload(_overlayPayload);
            }
          }
        }, 4000);
      }
      startOverlayResync();

      window.initChart = initChart;
      window.updateChartData = updateChartData;
      window.updateTick = updateTick;
      window.setBidPriceLine = setBidPriceLine;
      window.setAskPriceLine = setAskPriceLine;
      window.setMarketPriceLines = setMarketPriceLines;
      window.setLiveCandleLine = setLiveCandleLine;
      window.updateChartAppearance = updateChartAppearance;
      window.setVolumeSeriesData = setVolumeSeriesData;
      window.setDrawingTool = setDrawingTool;
      window.clearDrawings = clearDrawings;
      window.setSerializedDrawings = setSerializedDrawings;
      window.setDrawingsLocked = setDrawingsLocked;
      window.setDrawingsHidden = setDrawingsHidden;
      window.setStayInDrawingMode = setStayInDrawingMode;
      window.setMagnetMode = setMagnetMode;
      window.zoomChart = zoomChart;
      window.setChartOverlays = setChartOverlays;
      window.setPriceLines = setPriceLines;
      window.updatePositionLines = updatePositionLines;
      window.resizeChartViewport = resizeChartViewport;
      window.recoverChartSurface = recoverChartSurface;

      postReady();
    </script>
</body>
</html>
`;
