import { LIGHTWEIGHT_CHARTS_JS } from "./lightweightChartsBundle";
import { RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS } from "../../../domain/candles/rendering/customCandlestickSeriesWebView";
import { ENHANCED_DRAWING_TOOLS_JS } from "../plugins/enhancedDrawingToolsString";
import { CHART_AXIS_DIVIDER_STROKE_WIDTH, CHART_DEFAULT_VISIBLE_BAR_MAX, CHART_DEFAULT_VISIBLE_BAR_TARGET_PX, CHART_DEFAULT_VISIBLE_BAR_MIN, CHART_DEFAULT_TIME_SCALE_BAR_SPACING, CHART_DEFAULT_RESET_BAR_SPACING_MAX, CHART_DEFAULT_RESET_BAR_SPACING_MIN, CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET, CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING, CHART_GRID_DASH_PATTERN, CHART_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET, CHART_GRID_HORIZONTAL_LINE_COUNT, CHART_GRID_HORIZONTAL_SPACING, CHART_GRID_STROKE_WIDTH, CHART_GRID_VERTICAL_SPACING, CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH, CHART_TIME_SCALE_FIX_LEFT_EDGE, CHART_TIME_SCALE_FIX_RIGHT_EDGE } from "../ChartScreen.constants";

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
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; position: relative; }
      #chart { width: 100%; height: 100%; position: relative; z-index: 1; background: transparent; }
      .rtx5-right-price-scale-fallback {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 30;
      }
      .rtx5-right-price-scale-fallback-axis {
        position: absolute;
        pointer-events: none;
        z-index: 0;
      }
      .rtx5-right-price-scale-fallback-label {
        position: absolute;
        box-sizing: border-box;
        height: 16px;
        line-height: 16px;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
        padding: 0 6px 0 2px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-feature-settings: 'tnum' 1, 'lnum' 1;
        z-index: 2;
      }
      #rtx5-moving-vertical-grid {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        overflow: visible;
        z-index: 0;
      }
      #rtx5-axis-dividers {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        overflow: visible;
        z-index: 2;
        shape-rendering: crispEdges;
      }
    </style>
</head>
<body>
    <div id="chart"></div>
    <svg id="rtx5-moving-vertical-grid" aria-hidden="true"></svg>
    <svg id="rtx5-axis-dividers" aria-hidden="true"></svg>
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
      var marketPriceLineRefs = [];
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
      var lastInitSignature = '';
      var lastInitConfigSig = '';
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
      var overlayPriceScaleLockForceAutoScale = false;
      var priceScaleHealthRaf = 0;
      var rightPriceScaleLayoutRecoveryRaf = 0;
      var rightPriceScaleFallbackLayer = null;
      var rightPriceScaleFallbackRaf = 0;
      var chartReadyPostGeneration = 0;
      var lastChartBackgroundColor = '#FFFFFF';
      var lastChartTextColor = '#131722';
      var activeScrollPriceScaleRaf = 0;
      var lastActiveScrollPriceScaleCheckAt = 0;
      var activeHorizontalScrollGesture = false;
      var activeHorizontalScrollGestureUntil = 0;
      var visibleRangeIdleTimer = null;
      var liveRightEdgeClampActive = false;
      var movingVerticalGridRaf = 0;
      var movingVerticalGridColor = 'transparent';
      var movingVerticalGridVisible = false;
      var movingGridVerticalLines = [];
      var movingGridHorizontalLines = [];
      var movingGridVerticalGroup = null;
      var movingGridHorizontalGroup = null;
      var movingGridLayerSignature = '';
      var movingGridVerticalSignature = '';
      var movingGridHorizontalSignature = '';
      var chartAxisDividerRaf = 0;
      var chartAxisDividerColor = 'transparent';
      var chartAxisDividerVisible = false;
      var chartAxisDividerSignature = '';
      var MOVING_GRID_HORIZONTAL_LINE_COUNT = ${CHART_GRID_HORIZONTAL_LINE_COUNT};
      var MOVING_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET = ${CHART_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET};
      var MOVING_GRID_HORIZONTAL_SPACING = ${CHART_GRID_HORIZONTAL_SPACING};
      var MOVING_GRID_STROKE_WIDTH = ${CHART_GRID_STROKE_WIDTH};
      var MOVING_VERTICAL_GRID_SPACING = ${CHART_GRID_VERTICAL_SPACING};
      var MOVING_VERTICAL_GRID_DASH_PATTERN = '${CHART_GRID_DASH_PATTERN}';
      var AXIS_DIVIDER_STROKE_WIDTH = ${CHART_AXIS_DIVIDER_STROKE_WIDTH};
      var manualPriceScaleRangeActive = false;
      var verticalPricePanGestureActive = false;
      var chartTouchInteractionSuspendDepth = 0;
      var lastPostedChartTouchActive = false;
      var OVERLAY_LABEL_LINE_HEIGHT = 14;
      var OVERLAY_LABEL_HEIGHT = 18;
      var OVERLAY_LABEL_GAP = 4;
      var OVERLAY_LABEL_LINE_GAP = 1;
      var OVERLAY_LABEL_TOP_SAFE_PADDING = 42;
      var OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING = 132;
      var OVERLAY_LABEL_BOTTOM_SAFE_PADDING = 10;
      var MARKET_PRICE_SCALE_EXTENSION_HEIGHT = 1;
      var MARKET_PRICE_SCALE_BADGE_HEIGHT = 22;
      var MARKET_PRICE_SCALE_BADGE_MIN_WIDTH = 56;
      var MARKET_PRICE_SCALE_BADGE_PADDING_X = 4;
      var MARKET_PRICE_SCALE_BADGE_GAP = 1;
      var MARKET_PRICE_BADGE_RECOVERY_BUFFER_RATIO = 0.035;
      var RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT = 16;
      var RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS = 7;
      var RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS = 30;
      // Target vertical gap between price labels. The scale now spans the full
      // pane height, so the old 32px target packed labels ~37px apart (cramped).
      // 60px lands the spacing on the next coarser "nice" step (~60-74px),
      // which reads as a clean, professional axis — neither crowded nor sparse.
      var RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX = 60;
      var RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS = [1, 2, 2.5, 5, 10];
      var RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_CLUSTERS = 2;
      var RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_FOREGROUND_PIXELS = 24;
      var CHART_DEBUG_LOGS = false;
      var PRICE_SCALE_HEALTH_SPAN_MULTIPLE = 30;
      var PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO = 0.2;
      var PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_SPAN = 28;
      var PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_RATIO = 0.16;
      var PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS = 4;
      var PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO = 0.55;
      var PRICE_SCALE_ROBUST_CLUSTER_RELATIVE_TOLERANCE = 0.006;
      var PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE = 5;
      var PRICE_SCALE_ROBUST_MARKET_CLUSTER_MIN_BARS = 1;
      var PRICE_SCALE_ROBUST_MARKET_CLUSTER_RELATIVE_TOLERANCE = 0.006;
      var PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE = 3;
      var PRICE_SCALE_ROBUST_TRIM_MIN_VALUES = 12;
      var PRICE_SCALE_ROBUST_TRIM_RATIO = 0.08;
      var PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE = 5;
      var RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS = 6;
      var ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS = 48;
      var ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE = 8;
      var ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS = 160;
      var HISTORY_PAGINATION_MIN_LEFT_BARS = 50;
      var HISTORY_PAGINATION_MAX_LEFT_BARS = 500;
      var HISTORY_PAGINATION_VIEWPORT_MULTIPLIER = 3;
      var HISTORY_PAGINATION_DEBOUNCE_MS = 800;

      function chartDebugLog() {
        if (!CHART_DEBUG_LOGS || typeof console === 'undefined' || typeof console.log !== 'function') {
          return;
        }
        try {
          console.log.apply(console, arguments);
        } catch (_e) {}
      }

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
          chartWidth: chartElement && chartElement.clientWidth ? chartElement.clientWidth : leftAxisWidth + paneWidth + rightAxisWidth,
          chartHeight: chartElement && chartElement.clientHeight ? chartElement.clientHeight : paneHeight + timeScaleHeight,
          leftAxisWidth: leftAxisWidth,
          rightAxisWidth: rightAxisWidth,
          paneWidth: paneWidth,
          paneHeight: paneHeight,
          plotTop: plotTop,
          plotHeight: Math.max(0, plotBottom - plotTop),
        };
      }

      // The right price-scale labels fill the FULL pane height (candles plus
      // the move/volume overlay region at the bottom), not just the candle
      // plot area (top ~66%). The primary metrics reserve the bottom 0.34 as
      // scaleMargin for the move bars, which would stop the symbol price labels
      // partway down and let the native scale leak a second, mismatched column.
      // Overriding plotTop/plotHeight to the whole pane makes the fallback emit
      // one continuous symbol price scale top-to-bottom.
      function resolveFallbackPlotMetrics() {
        var metrics = resolvePrimaryPaneMetrics();
        var fullHeight = Math.max(0, Math.round(metrics.paneHeight || metrics.plotHeight || 0));
        return Object.assign({}, metrics, {
          plotTop: 0,
          plotHeight: fullHeight,
        });
      }

      function resolveChartElementSize() {
        var chartElement = document.getElementById('chart');
        if (!chartElement) {
          return { width: 0, height: 0 };
        }
        var rect = null;
        try {
          rect = typeof chartElement.getBoundingClientRect === 'function'
            ? chartElement.getBoundingClientRect()
            : null;
        } catch (_e) {}
        var width = Math.round(
          chartElement.clientWidth ||
          (rect && typeof rect.width === 'number' ? rect.width : 0)
        );
        var height = Math.round(
          chartElement.clientHeight ||
          (rect && typeof rect.height === 'number' ? rect.height : 0)
        );
        return {
          width: isFinite(width) && width > 0 ? width : 0,
          height: isFinite(height) && height > 0 ? height : 0,
        };
      }

      function applyRightPriceScaleLayoutOptions() {
        var layoutOptions = {
          visible: true,
          entireTextOnly: false,
          minimumWidth: ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH},
          scaleMargins: resolvePrimaryPriceScaleMargins(shouldUseMoveBarsPane()),
        };
        var priceScaleApi = getRightPriceScaleApi();
        try {
          if (chart && typeof chart.applyOptions === 'function') {
            chart.applyOptions({ rightPriceScale: layoutOptions });
          }
        } catch (_chartOptionsErr) {}
        try {
          if (priceScaleApi && typeof priceScaleApi.applyOptions === 'function') {
            priceScaleApi.applyOptions(layoutOptions);
          }
        } catch (_scaleOptionsErr) {}
      }

      function isCustomRightPriceScaleOverlayNode(node) {
        try {
          if (!node) {
            return false;
          }
          if (
            (_overlayLabelLayer && typeof _overlayLabelLayer.contains === 'function' && _overlayLabelLayer.contains(node)) ||
            (rightPriceScaleFallbackLayer && typeof rightPriceScaleFallbackLayer.contains === 'function' && rightPriceScaleFallbackLayer.contains(node))
          ) {
            return true;
          }
          if (typeof node.closest !== 'function') {
            return false;
          }
          return Boolean(
            node.closest('.rtx5-overlay-label-layer') ||
            node.closest('.rtx5-position-price-scale-box') ||
            node.closest('.rtx5-market-price-scale-extension') ||
            node.closest('.rtx5-market-price-scale-badge') ||
            node.closest('.rtx5-right-price-scale-fallback')
          );
        } catch (_e) {
          return false;
        }
      }

      function getRightPriceScaleNativeDomLabelStatus(metrics) {
        var emptyStatus = {
          labelCount: 0,
          collapsedCount: 0,
          healthyCount: 0,
        };
        try {
          var chartElement = document.getElementById('chart');
          if (!chartElement || typeof chartElement.querySelectorAll !== 'function') {
            return emptyStatus;
          }
          var chartRect = typeof chartElement.getBoundingClientRect === 'function'
            ? chartElement.getBoundingClientRect()
            : null;
          if (!chartRect || !(chartRect.width > 0) || !(chartRect.height > 0)) {
            return emptyStatus;
          }
          var axisLeft = chartRect.left + Math.round((metrics.leftAxisWidth || 0) + (metrics.paneWidth || 0));
          var axisRight = Math.min(
            chartRect.right,
            axisLeft + Math.max(0, Math.round(metrics.rightAxisWidth || 0))
          );
          var plotTop = chartRect.top + Math.max(0, Math.round(metrics.plotTop || 0));
          var plotBottom = plotTop + Math.max(0, Math.round(metrics.plotHeight || metrics.paneHeight || 0));
          var nodes = chartElement.querySelectorAll('span, div');
          var labelCount = 0;
          var collapsedCount = 0;
          var healthyCount = 0;
          for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            if (node === chartElement || isCustomRightPriceScaleOverlayNode(node)) {
              continue;
            }
            var text = node && typeof node.textContent === 'string' ? node.textContent.trim() : '';
            if (!/^[\\u2212-]?\\d+(?:\\.\\d+)?$/.test(text) && !/^[\\u2212-]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?$/.test(text)) {
              continue;
            }
            var rect = typeof node.getBoundingClientRect === 'function'
              ? node.getBoundingClientRect()
              : null;
            if (!rect || rect.right < axisLeft - 3 || rect.left > axisRight + 3) {
              continue;
            }
            labelCount += 1;
            if (
              rect.width < 1 ||
              rect.height < 1 ||
              rect.bottom <= plotTop + 2 ||
              rect.top >= plotBottom - 2 ||
              rect.bottom <= chartRect.top + 2 ||
              rect.top <= chartRect.top + 2
            ) {
              collapsedCount += 1;
            } else {
              healthyCount += 1;
            }
          }
          return {
            labelCount: labelCount,
            collapsedCount: collapsedCount,
            healthyCount: healthyCount,
          };
        } catch (_e) {
          return emptyStatus;
        }
      }

      function hasCollapsedRightPriceScaleDomLabels(metrics) {
        var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus(metrics);
        return nativeLabelStatus.labelCount >= 2 &&
          nativeLabelStatus.healthyCount === 0 &&
          nativeLabelStatus.collapsedCount >= nativeLabelStatus.labelCount;
      }

      function isRightPriceScaleNativeDomLabelStatusHealthy(nativeLabelStatus) {
        return Boolean(
          nativeLabelStatus &&
          nativeLabelStatus.healthyCount >= 2 &&
          nativeLabelStatus.healthyCount >= Math.min(nativeLabelStatus.labelCount, 2)
        );
      }

      function parseCanvasRgbColor(color) {
        if (typeof color !== 'string' || color.length === 0) {
          return null;
        }
        var normalized = color.toLowerCase().split(' ').join('');
        try {
          if (normalized.charAt(0) === '#') {
            var hex = normalized.slice(1);
            if (hex.length === 3) {
              hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
            }
            if (hex.length !== 6) {
              return null;
            }
            var r = parseInt(hex.slice(0, 2), 16);
            var g = parseInt(hex.slice(2, 4), 16);
            var b = parseInt(hex.slice(4, 6), 16);
            return isFinite(r) && isFinite(g) && isFinite(b) ? { r: r, g: g, b: b } : null;
          }
          var rgbMatch = normalized.match(/^rgba?\\((\\d+),(\\d+),(\\d+)(?:,[^)]+)?\\)$/);
          if (rgbMatch) {
            return {
              r: Math.max(0, Math.min(255, Number(rgbMatch[1]))),
              g: Math.max(0, Math.min(255, Number(rgbMatch[2]))),
              b: Math.max(0, Math.min(255, Number(rgbMatch[3]))),
            };
          }
        } catch (_e) {}
        return null;
      }

      function getCanvasColorDistance(left, right) {
        if (!left || !right) {
          return Number.POSITIVE_INFINITY;
        }
        var dr = left.r - right.r;
        var dg = left.g - right.g;
        var db = left.b - right.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      }

      function getCanvasColorLuma(color) {
        if (!color) {
          return 0;
        }
        return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
      }

      function isRightPriceScaleCanvasPixelForegroundLike(r, g, b, a, textRgb, backgroundRgb) {
        if (!(a > 20)) {
          return false;
        }
        var pixelRgb = { r: r, g: g, b: b };
        if (backgroundRgb && getCanvasColorDistance(pixelRgb, backgroundRgb) < 30) {
          return false;
        }
        if (textRgb && getCanvasColorDistance(pixelRgb, textRgb) < 145) {
          return true;
        }
        var pixelLuma = getCanvasColorLuma(pixelRgb);
        if (backgroundRgb) {
          return Math.abs(pixelLuma - getCanvasColorLuma(backgroundRgb)) > 45;
        }
        return pixelLuma < 115 || pixelLuma > 170;
      }

      function getRightPriceScaleNativeCanvasLabelStatus(metrics) {
        var emptyStatus = {
          sampled: false,
          canvasCount: 0,
          foregroundPixelCount: 0,
          clusterCount: 0,
          healthy: false,
        };
        try {
          var resolvedMetrics = metrics || resolvePrimaryPaneMetrics();
          var chartElement = document.getElementById('chart');
          if (!chartElement || typeof chartElement.querySelectorAll !== 'function' || !resolvedMetrics) {
            return emptyStatus;
          }
          var chartRect = typeof chartElement.getBoundingClientRect === 'function'
            ? chartElement.getBoundingClientRect()
            : null;
          if (!chartRect || !(chartRect.width > 0) || !(chartRect.height > 0)) {
            return emptyStatus;
          }
          var axisWidth = Math.max(0, Math.round(resolvedMetrics.rightAxisWidth || 0));
          var axisLeft = chartRect.left + Math.round((resolvedMetrics.leftAxisWidth || 0) + (resolvedMetrics.paneWidth || 0));
          var axisRight = Math.min(chartRect.right, axisLeft + axisWidth);
          var plotTop = chartRect.top + Math.max(0, Math.round(resolvedMetrics.plotTop || 0));
          var plotBottom = Math.min(
            chartRect.bottom,
            plotTop + Math.max(0, Math.round(resolvedMetrics.plotHeight || resolvedMetrics.paneHeight || 0))
          );
          if (!(axisWidth > 0) || !(axisRight - axisLeft > 8) || !(plotBottom - plotTop > 16)) {
            return emptyStatus;
          }

          var canvases = chartElement.querySelectorAll('canvas');
          var textRgb = parseCanvasRgbColor(resolveRightPriceScaleFallbackTextColor());
          var backgroundRgb = parseCanvasRgbColor(lastChartBackgroundColor || '#FFFFFF');
          var sampled = false;
          var canvasCount = 0;
          var totalForegroundPixelCount = 0;
          var bestClusterCount = 0;

          for (var canvasIndex = 0; canvasIndex < canvases.length; canvasIndex += 1) {
            var canvas = canvases[canvasIndex];
            if (!canvas || isCustomRightPriceScaleOverlayNode(canvas)) {
              continue;
            }
            var canvasRect = typeof canvas.getBoundingClientRect === 'function'
              ? canvas.getBoundingClientRect()
              : null;
            if (!canvasRect || !(canvasRect.width > 0) || !(canvasRect.height > 0)) {
              continue;
            }
            var cssLeft = Math.max(axisLeft, canvasRect.left);
            var cssRight = Math.min(axisRight, canvasRect.right);
            var cssTop = Math.max(plotTop, canvasRect.top);
            var cssBottom = Math.min(plotBottom, canvasRect.bottom);
            if (!(cssRight - cssLeft > 8) || !(cssBottom - cssTop > 16)) {
              continue;
            }
            var scaleX = canvas.width / canvasRect.width;
            var scaleY = canvas.height / canvasRect.height;
            if (!(scaleX > 0) || !(scaleY > 0)) {
              continue;
            }
            var sampleX = Math.max(0, Math.floor((cssLeft - canvasRect.left) * scaleX));
            var sampleY = Math.max(0, Math.floor((cssTop - canvasRect.top) * scaleY));
            var sampleW = Math.min(canvas.width - sampleX, Math.ceil((cssRight - cssLeft) * scaleX));
            var sampleH = Math.min(canvas.height - sampleY, Math.ceil((cssBottom - cssTop) * scaleY));
            if (!(sampleW > 8) || !(sampleH > 16)) {
              continue;
            }
            var context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
            if (!context || typeof context.getImageData !== 'function') {
              continue;
            }
            var imageData = null;
            try {
              imageData = context.getImageData(sampleX, sampleY, sampleW, sampleH);
            } catch (_imageErr) {
              continue;
            }
            if (!imageData || !imageData.data) {
              continue;
            }

            sampled = true;
            canvasCount += 1;
            var data = imageData.data;
            var step = Math.max(1, Math.floor(Math.max(sampleW, sampleH) / 700));
            var minRowForegroundPixels = Math.max(2, Math.floor(sampleW / (step * 22)));
            var minClusterRows = 2;
            var minClusterWidth = Math.max(5, Math.floor(sampleW * 0.08));
            var maxClusterWidth = Math.max(minClusterWidth + 1, Math.floor(sampleW * 0.94));
            var foregroundPixelCount = 0;
            var clusterCount = 0;
            var clusterRows = 0;
            var clusterMinCol = sampleW;
            var clusterMaxCol = 0;
            var clusterMaxRowCount = 0;
            var finishCluster = function() {
              if (clusterRows > 0) {
                var clusterWidth = clusterMaxCol - clusterMinCol + 1;
                if (
                  clusterRows >= minClusterRows &&
                  clusterWidth >= minClusterWidth &&
                  clusterWidth <= maxClusterWidth &&
                  clusterMaxRowCount >= minRowForegroundPixels
                ) {
                  clusterCount += 1;
                }
              }
              clusterRows = 0;
              clusterMinCol = sampleW;
              clusterMaxCol = 0;
              clusterMaxRowCount = 0;
            };

            for (var y = 0; y < sampleH; y += step) {
              var rowForegroundCount = 0;
              var rowMinCol = sampleW;
              var rowMaxCol = 0;
              for (var x = 0; x < sampleW; x += step) {
                var pixelIndex = ((y * sampleW) + x) * 4;
                if (
                  isRightPriceScaleCanvasPixelForegroundLike(
                    data[pixelIndex],
                    data[pixelIndex + 1],
                    data[pixelIndex + 2],
                    data[pixelIndex + 3],
                    textRgb,
                    backgroundRgb
                  )
                ) {
                  rowForegroundCount += 1;
                  foregroundPixelCount += 1;
                  if (x < rowMinCol) rowMinCol = x;
                  if (x > rowMaxCol) rowMaxCol = x;
                }
              }
              if (rowForegroundCount >= minRowForegroundPixels) {
                clusterRows += 1;
                clusterMinCol = Math.min(clusterMinCol, rowMinCol);
                clusterMaxCol = Math.max(clusterMaxCol, rowMaxCol);
                clusterMaxRowCount = Math.max(clusterMaxRowCount, rowForegroundCount);
              } else {
                finishCluster();
              }
            }
            finishCluster();

            totalForegroundPixelCount += foregroundPixelCount;
            bestClusterCount = Math.max(bestClusterCount, clusterCount);
            if (
              clusterCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_CLUSTERS &&
              foregroundPixelCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_FOREGROUND_PIXELS
            ) {
              return {
                sampled: true,
                canvasCount: canvasCount,
                foregroundPixelCount: totalForegroundPixelCount,
                clusterCount: clusterCount,
                healthy: true,
              };
            }
          }

          return {
            sampled: sampled,
            canvasCount: canvasCount,
            foregroundPixelCount: totalForegroundPixelCount,
            clusterCount: bestClusterCount,
            healthy: false,
          };
        } catch (_e) {
          return emptyStatus;
        }
      }

      function isRightPriceScaleNativeCanvasLabelStatusHealthy(nativeCanvasStatus) {
        return Boolean(
          nativeCanvasStatus &&
          nativeCanvasStatus.sampled === true &&
          nativeCanvasStatus.healthy === true &&
          nativeCanvasStatus.clusterCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_CLUSTERS &&
          nativeCanvasStatus.foregroundPixelCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_FOREGROUND_PIXELS
        );
      }

      function hasHealthyRightPriceScaleNativeCanvasLabels(metrics) {
        var nativeCanvasStatus = getRightPriceScaleNativeCanvasLabelStatus(metrics || resolvePrimaryPaneMetrics());
        return isRightPriceScaleNativeCanvasLabelStatusHealthy(nativeCanvasStatus);
      }

      function getRightPriceScaleNativeLabelHealth(metrics) {
        var resolvedMetrics = metrics || resolvePrimaryPaneMetrics();
        var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus(resolvedMetrics);
        if (isRightPriceScaleNativeDomLabelStatusHealthy(nativeLabelStatus)) {
          return {
            healthy: true,
            source: 'dom',
            domStatus: nativeLabelStatus,
            canvasStatus: null,
          };
        }
        var nativeCanvasStatus = getRightPriceScaleNativeCanvasLabelStatus(resolvedMetrics);
        if (isRightPriceScaleNativeCanvasLabelStatusHealthy(nativeCanvasStatus)) {
          return {
            healthy: true,
            source: 'canvas',
            domStatus: nativeLabelStatus,
            canvasStatus: nativeCanvasStatus,
          };
        }
        return {
          healthy: false,
          source: 'missing',
          domStatus: nativeLabelStatus,
          canvasStatus: nativeCanvasStatus,
        };
      }

      function hasHealthyRightPriceScaleNativeDomLabels(metrics) {
        var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus(metrics || resolvePrimaryPaneMetrics());
        return isRightPriceScaleNativeDomLabelStatusHealthy(nativeLabelStatus);
      }

      function hasHealthyRightPriceScaleNativeLabels(metrics) {
        return getRightPriceScaleNativeLabelHealth(metrics || resolvePrimaryPaneMetrics()).healthy === true;
      }

      function isRightPriceScaleLayoutHealthy() {
        if (!chart) {
          return false;
        }
        var metrics = resolvePrimaryPaneMetrics();
        if (
          !metrics ||
          !(metrics.chartWidth > 0) ||
          !(metrics.chartHeight > 0) ||
          !(metrics.paneWidth > 0) ||
          !(metrics.paneHeight > 0) ||
          metrics.rightAxisWidth < ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH} - 2
        ) {
          return false;
        }
        if (metrics.leftAxisWidth + metrics.paneWidth + metrics.rightAxisWidth > metrics.chartWidth + 2) {
          return false;
        }
        var priceScaleApi = getRightPriceScaleApi();
        var priceScaleOptions =
          priceScaleApi && typeof priceScaleApi.options === 'function'
            ? priceScaleApi.options()
            : null;
        if (priceScaleOptions && priceScaleOptions.visible === false) {
          return false;
        }
        if (priceScaleOptions && priceScaleOptions.entireTextOnly === true) {
          return false;
        }
        return true;
      }

      function clearRightPriceScaleFallbackLabels() {
        if (!rightPriceScaleFallbackLayer) {
          return;
        }
        try { rightPriceScaleFallbackLayer.style.display = 'none'; } catch (_styleErr) {}
        while (rightPriceScaleFallbackLayer.firstChild) {
          rightPriceScaleFallbackLayer.removeChild(rightPriceScaleFallbackLayer.firstChild);
        }
      }

      function clearRightPriceScaleFallbackLayer() {
        if (rightPriceScaleFallbackRaf) {
          try { cancelAnimationFrame(rightPriceScaleFallbackRaf); } catch (_e) {}
          rightPriceScaleFallbackRaf = 0;
        }
        if (rightPriceScaleFallbackLayer && rightPriceScaleFallbackLayer.parentNode) {
          try { rightPriceScaleFallbackLayer.parentNode.removeChild(rightPriceScaleFallbackLayer); } catch (_removeErr) {}
        }
        rightPriceScaleFallbackLayer = null;
      }

      function ensureRightPriceScaleFallbackLayer() {
        var chartElement = document.getElementById('chart');
        if (!chartElement) {
          return null;
        }
        if (rightPriceScaleFallbackLayer && rightPriceScaleFallbackLayer.parentNode === chartElement) {
          return rightPriceScaleFallbackLayer;
        }
        rightPriceScaleFallbackLayer = document.createElement('div');
        rightPriceScaleFallbackLayer.className = 'rtx5-right-price-scale-fallback';
        rightPriceScaleFallbackLayer.setAttribute('aria-hidden', 'true');
        chartElement.style.position = 'relative';
        chartElement.appendChild(rightPriceScaleFallbackLayer);
        return rightPriceScaleFallbackLayer;
      }

      function resolveChartTextColor(opts) {
        try {
          var textColor = opts && opts.layout ? opts.layout.textColor : null;
          if (typeof textColor === 'string' && textColor.length > 0) {
            return textColor;
          }
        } catch (_e) {}
        return '#131722';
      }

      function resolveRightPriceScaleFallbackTextColor() {
        try {
          var options = chart && typeof chart.options === 'function' ? chart.options() : null;
          var textColor = options && options.layout ? options.layout.textColor : null;
          if (typeof textColor === 'string' && textColor.length > 0) {
            return textColor;
          }
        } catch (_e) {}
        return lastChartTextColor || '#131722';
      }

      function resolveRightPriceScaleFallbackFontFamily() {
        try {
          var options = chart && typeof chart.options === 'function' ? chart.options() : null;
          var fontFamily = options && options.layout ? options.layout.fontFamily : null;
          if (typeof fontFamily === 'string' && fontFamily.length > 0) {
            return fontFamily;
          }
        } catch (_e) {}
        return "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
      }

      function resolveRightPriceScaleCoordinateRange() {
        try {
          if (!series || typeof series.coordinateToPrice !== 'function') {
            return null;
          }
          var metrics = resolveFallbackPlotMetrics();
          if (!metrics || !(metrics.plotHeight > 0)) {
            return null;
          }
          var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
          var plotBottom = plotTop + Math.max(0, Math.round(metrics.plotHeight || 0));
          var topPrice = series.coordinateToPrice(plotTop + RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2);
          var bottomPrice = series.coordinateToPrice(plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2);
          if (typeof topPrice !== 'number' || !isFinite(topPrice) || typeof bottomPrice !== 'number' || !isFinite(bottomPrice)) {
            return null;
          }
          return normalizePriceRange({
            from: Math.min(topPrice, bottomPrice),
            to: Math.max(topPrice, bottomPrice),
          });
        } catch (_coordinateRangeErr) {}
        return null;
      }

      function resolveRightPriceScaleVisibleRange() {
        try {
          var priceScaleApi = getRightPriceScaleApi();
          var visibleRange =
            priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
              ? priceScaleApi.getVisibleRange()
              : null;
          if (isValidPriceRange(visibleRange)) {
            return normalizePriceRange(visibleRange);
          }
        } catch (_visibleRangeErr) {}
        return null;
      }

      function resolveRightPriceScaleFallbackRange() {
        // Prefer the COORDINATE range — it is the exact inverse of the
        // series.priceToCoordinate() mapping used to POSITION the labels, so the
        // generated label range always matches where labels actually land and
        // the axis fills top-to-bottom. getVisibleRange() is the scale's logical
        // range, which can report a NARROWER band than the rendered plot when a
        // wide bid/ask price line or autoscale margin stretches the view (e.g. a
        // stale 2+ point spread right after a symbol switch). Using it as the
        // primary source clustered the labels and left the reported blank band,
        // so it is now only a fallback when the coordinate range is unavailable.
        var coordinateRange = resolveRightPriceScaleCoordinateRange();
        if (isValidPriceRange(coordinateRange)) {
          return normalizePriceRange(coordinateRange);
        }
        var visibleScaleRange = resolveRightPriceScaleVisibleRange();
        if (isValidPriceRange(visibleScaleRange)) {
          return normalizePriceRange(visibleScaleRange);
        }
        var visibleDataRange = resolvePriceRangeFromVisibleData(true);
        if (isValidPriceRange(visibleDataRange)) {
          return normalizePriceRange(visibleDataRange);
        }
        return null;
      }

      function countRightPriceScaleFallbackDecimalPlaces(value) {
        if (typeof value !== 'number' || !isFinite(value)) {
          return 0;
        }
        var text = String(value).toLowerCase();
        var exponentIndex = text.indexOf('e');
        if (exponentIndex >= 0) {
          var mantissa = text.slice(0, exponentIndex);
          var exponent = Number(text.slice(exponentIndex + 1));
          var mantissaDecimalIndex = mantissa.indexOf('.');
          var mantissaDecimals = mantissaDecimalIndex >= 0 ? mantissa.length - mantissaDecimalIndex - 1 : 0;
          return Math.max(0, mantissaDecimals - (isFinite(exponent) ? exponent : 0));
        }
        var decimalIndex = text.indexOf('.');
        return decimalIndex >= 0 ? Math.max(0, text.length - decimalIndex - 1) : 0;
      }

      var rightPriceScaleFallbackDataDecimalsCache = { signature: '', value: 0 };
      function resolveRightPriceScaleFallbackDataDecimals() {
        if (!lastRawSeriesData || lastRawSeriesData.length === 0) {
          return 0;
        }
        // Memoize per data-state: this scan runs once per label otherwise, and
        // the price scale re-renders every frame. The signature changes whenever
        // the series grows or the latest bar updates, so it rescans exactly once
        // per real data change instead of ~30x per render.
        var lastBar = lastRawSeriesData[lastRawSeriesData.length - 1];
        var signature = lastRawSeriesData.length + '|' + (lastBar
          ? (lastBar.close + ',' + lastBar.high + ',' + lastBar.low + ',' + lastBar.open + ',' + lastBar.value)
          : 'none');
        if (rightPriceScaleFallbackDataDecimalsCache.signature === signature) {
          return rightPriceScaleFallbackDataDecimalsCache.value;
        }
        var maxDecimals = 0;
        var startIndex = Math.max(0, lastRawSeriesData.length - 260);
        for (var i = startIndex; i < lastRawSeriesData.length; i += 1) {
          var bar = lastRawSeriesData[i];
          if (!bar) {
            continue;
          }
          var candidates = [bar.open, bar.high, bar.low, bar.close, bar.value];
          for (var p = 0; p < candidates.length; p += 1) {
            maxDecimals = Math.max(maxDecimals, countRightPriceScaleFallbackDecimalPlaces(candidates[p]));
            if (maxDecimals >= 8) {
              rightPriceScaleFallbackDataDecimalsCache = { signature: signature, value: 8 };
              return 8;
            }
          }
        }
        var resolvedDataDecimals = Math.max(0, Math.min(8, maxDecimals));
        rightPriceScaleFallbackDataDecimalsCache = { signature: signature, value: resolvedDataDecimals };
        return resolvedDataDecimals;
      }

      function resolveRightPriceScaleFallbackConfiguredDecimals() {
        return typeof lastDisplayDecimals === 'number' && isFinite(lastDisplayDecimals) && lastDisplayDecimals >= 0
          ? Math.max(0, Math.min(8, Math.round(lastDisplayDecimals)))
          : null;
      }

      function resolveRightPriceScaleFallbackDecimals(minimumDecimals) {
        var configuredDecimals = resolveRightPriceScaleFallbackConfiguredDecimals();
        if (configuredDecimals !== null) {
          return configuredDecimals;
        }
        var safeMinimum =
          typeof minimumDecimals === 'number' && isFinite(minimumDecimals)
            ? Math.max(0, Math.min(8, Math.round(minimumDecimals)))
            : 0;
        // With no configured display metadata, preserve real backend precision.
        return Math.max(
          2,
          resolveRightPriceScaleFallbackDataDecimals(),
          safeMinimum
        );
      }

      function roundRightPriceScaleFallbackPrice(price, decimals) {
        if (typeof price !== 'number' || !isFinite(price)) {
          return NaN;
        }
        var safeDecimals =
          typeof decimals === 'number' && isFinite(decimals)
            ? Math.max(0, Math.min(8, Math.round(decimals)))
            : resolveRightPriceScaleFallbackDecimals();
        var factor = Math.pow(10, safeDecimals);
        return Math.round(price * factor) / factor;
      }

      function formatRightPriceScaleFallbackLabel(price, decimals) {
        var resolvedDecimals = resolveRightPriceScaleFallbackDecimals(decimals);
        return Number(price).toFixed(resolvedDecimals);
      }

      function resolveRightPriceScaleFallbackStepDecimals(step) {
        var configuredDecimals = resolveRightPriceScaleFallbackConfiguredDecimals();
        if (configuredDecimals !== null) {
          return configuredDecimals;
        }
        // Honor the backend data precision as a floor here too, so the per-tick
        // step rounding/formatting never drops decimals the backend provided.
        return Math.max(
          resolveRightPriceScaleFallbackDataDecimals(),
          countRightPriceScaleFallbackDecimalPlaces(step)
        );
      }

      function resolveRightPriceScaleFallbackLabelCount(metrics) {
        var plotHeight = metrics && typeof metrics.plotHeight === 'number' ? metrics.plotHeight : 0;
        var targetGap =
          RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX > 0
            ? RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX
            : 56;
        var estimated = Math.floor(plotHeight / targetGap) + 1;
        return Math.max(
          RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS,
          Math.min(RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS, estimated)
        );
      }

      function resolveRightPriceScaleFallbackAxisMetrics(metrics) {
        var chartWidth = Math.max(0, Math.round(metrics.chartWidth || 0));
        var reportedAxisWidth = Math.max(0, Math.round(metrics.rightAxisWidth || 0));
        var axisWidth = Math.max(reportedAxisWidth, ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH});
        axisWidth = Math.min(axisWidth, chartWidth);
        var axisLeft = reportedAxisWidth > 0
          ? Math.round((metrics.leftAxisWidth || 0) + (metrics.paneWidth || 0))
          : Math.max(0, chartWidth - axisWidth);
        if (chartWidth > 0 && axisLeft + axisWidth > chartWidth) {
          axisWidth = Math.max(0, chartWidth - axisLeft);
        }
        return {
          axisLeft: axisLeft,
          axisWidth: axisWidth,
          chartWidth: chartWidth,
        };
      }

      function resolveRightPriceScaleFallbackTargetLabelGap() {
        return RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX > 0
          ? RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX
            : 56;
      }

      function resolveRightPriceScaleFallbackNiceStepFromRaw(rawStep, preferDense) {
        if (!(rawStep > 0)) {
          return 0;
        }
        var exponent = Math.floor(Math.log(rawStep) / Math.LN10);
        var magnitude = Math.pow(10, exponent);
        var fraction = rawStep / magnitude;
        var niceFraction = preferDense
          ? RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[0]
          : RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS.length - 1];
        for (var i = 0; i < RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS.length; i += 1) {
          var candidate = RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[i];
          if (preferDense) {
            if (fraction >= candidate) {
              niceFraction = candidate;
            } else {
              break;
            }
          } else if (fraction <= candidate) {
            niceFraction = candidate;
            break;
          }
        }
        var step = niceFraction * magnitude;
        var decimals = resolveRightPriceScaleFallbackStepDecimals(step);
        var minimumStep = decimals > 0 ? Math.pow(10, -decimals) : 1;
        return Math.max(step, minimumStep);
      }

      function resolveRightPriceScaleFallbackNiceStep(span, targetIntervals, preferDense) {
        if (!(span > 0)) {
          return 0;
        }
        var intervals =
          typeof targetIntervals === 'number' && isFinite(targetIntervals)
            ? Math.max(1, Math.round(targetIntervals))
            : RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS;
        var rawStep = span / intervals;
        return resolveRightPriceScaleFallbackNiceStepFromRaw(rawStep, preferDense === true);
      }

      // Snap an exact "ideal" step to the NEAREST nice step (1/2/2.5/5/10 ×10ⁿ),
      // measuring distance in log space. The nice fractions jump by up to ×2, so
      // "pick the coarsest step ≥ ideal" (the old approach) lands the label gap
      // anywhere from ~0.6× to ~2× the target depending on where a symbol's price
      // span happens to fall between two steps — cramped for some symbols, sparse
      // for others. Nearest-in-log instead keeps the rendered gap within ~×1.41
      // of the target for EVERY symbol and zoom, so the scale is uniformly
      // professional (never too close, never too wide) without per-symbol tuning.
      function resolveRightPriceScaleFallbackNearestNiceStep(idealStep) {
        if (!(idealStep > 0)) {
          return 0;
        }
        var exponent = Math.floor(Math.log(idealStep) / Math.LN10);
        var targetLog = Math.log(idealStep);
        var best = 0;
        var bestDist = Infinity;
        for (var e = exponent - 1; e <= exponent + 1; e += 1) {
          var magnitude = Math.pow(10, e);
          for (var i = 0; i < RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS.length; i += 1) {
            var candidate = RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[i] * magnitude;
            if (!(candidate > 0)) {
              continue;
            }
            var dist = Math.abs(Math.log(candidate) - targetLog);
            if (dist < bestDist) {
              bestDist = dist;
              best = candidate;
            }
          }
        }
        if (!(best > 0)) {
          return 0;
        }
        var decimals = resolveRightPriceScaleFallbackStepDecimals(best);
        var minimumStep = decimals > 0 ? Math.pow(10, -decimals) : 1;
        return Math.max(best, minimumStep);
      }

      function resolveRightPriceScaleFallbackTicks() {
        if (!series || !lastRawSeriesData || lastRawSeriesData.length === 0) {
          return [];
        }
        var metrics = resolveFallbackPlotMetrics();
        if (
          !metrics ||
          !(metrics.chartWidth > 0) ||
          !(metrics.paneWidth > 0) ||
          !(metrics.plotHeight > 0)
        ) {
          return [];
        }
        var range = resolveRightPriceScaleFallbackRange();
        if (!isValidPriceRange(range)) {
          return [];
        }
        range = normalizePriceRange(range);
        var span = getPriceRangeSpan(range);
        if (!(span > 0)) {
          return [];
        }
        var labelCount = resolveRightPriceScaleFallbackLabelCount(metrics);
        var plotHeightPx = Math.max(1, metrics.plotHeight || 1);
        var targetLabelGap = resolveRightPriceScaleFallbackTargetLabelGap();
        // Dynamic, symbol-agnostic step: derive the exact step that would place
        // labels exactly targetLabelGap px apart for THIS symbol's price span and
        // pane height, then snap it to the nearest nice step. This bounds the
        // rendered gap to ~×1.41 of the target for every symbol — no per-symbol
        // tuning, never cramped, never sparse.
        var idealStep = (span * targetLabelGap) / plotHeightPx;
        var step = resolveRightPriceScaleFallbackNearestNiceStep(idealStep);
        if (!(step > 0)) {
          step = resolveRightPriceScaleFallbackNiceStep(span, Math.max(1, labelCount - 1));
        }
        if (!(step > 0)) {
          return [];
        }
        // Guarantee the step is coarse enough that EVERY label across the full
        // range fits under the hard cap. Otherwise the generation loop fills the
        // cap from the top and stops, leaving the bottom of the axis blank (the
        // reported gap). Coarsen until the whole range is covered top-to-bottom.
        var projectedLabelCount = Math.floor(span / step) + 1;
        if (projectedLabelCount > RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS) {
          var fittedStep = resolveRightPriceScaleFallbackNiceStep(
            span,
            Math.max(1, RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS - 1)
          );
          if (fittedStep > step) {
            step = fittedStep;
          }
        }
        var priceScaleApi = getRightPriceScaleApi();
        var priceScaleOptions =
          priceScaleApi && typeof priceScaleApi.options === 'function'
            ? priceScaleApi.options()
            : null;
        var invertScale = priceScaleOptions && priceScaleOptions.invertScale === true;
        var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
        var plotBottom = plotTop + Math.max(0, Math.round(metrics.plotHeight || 0));
        var ticks = [];
        var seenLabels = Object.create(null);
        var decimals = resolveRightPriceScaleFallbackStepDecimals(step);
        var minTickGap = RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT + 4;
        var appendTick = function(price, forcedY, forceEdge) {
          if (typeof price !== 'number' || !isFinite(price)) {
            return false;
          }
          var y = typeof forcedY === 'number' && isFinite(forcedY) ? forcedY : null;
          if (y === null) {
            try {
              y = typeof series.priceToCoordinate === 'function' ? series.priceToCoordinate(price) : null;
            } catch (_coordErr) {
              y = null;
            }
          }
          if (typeof y !== 'number' || !isFinite(y)) {
            var ratio = span > 0
              ? (invertScale ? (price - range.from) / span : (range.to - price) / span)
              : 0.5;
            y = plotTop + ratio * Math.max(1, metrics.plotHeight || 1);
          }
          y = Math.max(
            plotTop + RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2,
            Math.min(plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2, y)
          );
          var text = formatRightPriceScaleFallbackLabel(price, decimals);
          if (seenLabels[text]) {
            return false;
          }
          if (forceEdge === true) {
            for (var edgeIndex = ticks.length - 1; edgeIndex >= 0; edgeIndex -= 1) {
              if (Math.abs(ticks[edgeIndex].y - y) < minTickGap) {
                seenLabels[ticks[edgeIndex].text] = false;
                ticks.splice(edgeIndex, 1);
              }
            }
          } else {
            for (var existingIndex = 0; existingIndex < ticks.length; existingIndex += 1) {
              if (Math.abs(ticks[existingIndex].y - y) < minTickGap) {
                return false;
              }
            }
          }
          seenLabels[text] = true;
          ticks.push({
            price: price,
            text: text,
            y: y,
          });
          return true;
        };
        appendTick(
          invertScale ? range.from : range.to,
          plotTop + RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2,
          true
        );
        var startPrice = Math.ceil(range.from / step) * step;
        var endPrice = Math.floor(range.to / step) * step;
        var epsilon = Math.max(step * 0.000001, Math.pow(10, -Math.max(decimals, 1)) * 0.000001);
        if (endPrice < startPrice) {
          startPrice = range.from;
          endPrice = range.to;
        }
        var prices = [];
        for (var priceTick = endPrice; priceTick >= startPrice - epsilon; priceTick -= step) {
          prices.push(roundRightPriceScaleFallbackPrice(priceTick, decimals));
          if (prices.length > RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS * 3) {
            break;
          }
        }
        if (prices.length === 0) {
          prices = [
            roundRightPriceScaleFallbackPrice(range.to, decimals),
            roundRightPriceScaleFallbackPrice(range.from + span / 2, decimals),
            roundRightPriceScaleFallbackPrice(range.from, decimals),
          ];
        }
        if (invertScale) {
          prices.reverse();
        }
        for (var i = 0; i < prices.length && ticks.length < RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS; i += 1) {
          appendTick(prices[i], null, false);
        }
        // Bottom boundary label must YIELD to round-number labels, not cull them.
        // forceEdge=true here used to delete the nearest round label within
        // minTickGap to seat the exact range.from value — but that boundary label
        // sits behind the live-price tag and is invisible, so as the live range
        // drifted it intermittently erased a real round label (e.g. 0.70755) and
        // left a visible gap. forceEdge=false keeps the round label and only adds
        // the boundary label when there is genuinely room for it.
        appendTick(
          invertScale ? range.to : range.from,
          plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2,
          false
        );
        ticks.sort(function(left, right) { return left.y - right.y; });
        return ticks;
      }

      function renderFallbackRightPriceScaleLabels() {
        try {
          if (!series || !lastRawSeriesData || lastRawSeriesData.length === 0) {
            clearRightPriceScaleFallbackLabels();
            return false;
          }
          var metrics = resolveFallbackPlotMetrics();
          var layer = ensureRightPriceScaleFallbackLayer();
          if (!layer) {
            return false;
          }
          clearRightPriceScaleFallbackLabels();
          var axisMetrics = resolveRightPriceScaleFallbackAxisMetrics(metrics);
          if (!(axisMetrics.chartWidth > 0) || !(axisMetrics.axisWidth > 0)) {
            return false;
          }
          var ticks = resolveRightPriceScaleFallbackTicks();
          if (ticks.length === 0) {
            return false;
          }
          var textColor = resolveRightPriceScaleFallbackTextColor();
          var fontFamily = resolveRightPriceScaleFallbackFontFamily();
          var labelLeft = Math.max(0, Math.round(axisMetrics.axisLeft + 3));
          var labelWidth = Math.max(0, Math.round(Math.min(axisMetrics.axisWidth - 4, axisMetrics.chartWidth - labelLeft - 1)));
          layer.style.display = 'block';
          layer.style.position = 'absolute';
          layer.style.left = '0px';
          layer.style.top = '0px';
          layer.style.right = '0px';
          layer.style.bottom = '0px';
          layer.style.pointerEvents = 'none';
          layer.style.overflow = 'hidden';
          layer.style.zIndex = '30';
          // metrics here comes from resolveFallbackPlotMetrics(), whose
          // plotTop/plotHeight already span the FULL pane height (candles plus
          // the move/volume region), so this background masks the native scale's
          // tick labels across the whole axis and the fallback paints one
          // continuous symbol price scale top-to-bottom.
          var axisBackground = document.createElement('div');
          axisBackground.className = 'rtx5-right-price-scale-fallback-axis';
          axisBackground.style.left = Math.max(0, Math.round(axisMetrics.axisLeft)) + 'px';
          axisBackground.style.top = Math.max(0, Math.round(metrics.plotTop || 0)) + 'px';
          axisBackground.style.width = Math.max(0, Math.round(axisMetrics.axisWidth)) + 'px';
          axisBackground.style.height = Math.max(0, Math.round(metrics.plotHeight || metrics.paneHeight || 0)) + 'px';
          axisBackground.style.background = lastChartBackgroundColor || '#FFFFFF';
          layer.appendChild(axisBackground);
          for (var i = 0; i < ticks.length; i += 1) {
            var tick = ticks[i];
            var label = document.createElement('div');
            label.className = 'rtx5-right-price-scale-fallback-label';
            label.setAttribute('data-rtx5-role', 'right-price-scale-fallback-label');
            label.textContent = tick.text;
            label.style.left = labelLeft + 'px';
            label.style.top = Math.round(tick.y - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2) + 'px';
            label.style.width = labelWidth + 'px';
            label.style.color = textColor;
            label.style.fontFamily = fontFamily;
            label.style.textAlign = 'right';
            label.style.fontWeight = '500';
            label.style.letterSpacing = '0px';
            label.style.fontVariantNumeric = 'tabular-nums';
            label.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
            label.style.opacity = '0.86';
            label.style.textShadow = 'none';
            layer.appendChild(label);
          }
          return true;
        } catch (fallbackErr) {
          postError('renderFallbackRightPriceScaleLabels', fallbackErr);
          return false;
        }
      }

      function scheduleRightPriceScaleFallbackRefresh() {
        if (rightPriceScaleFallbackRaf) {
          return;
        }
        rightPriceScaleFallbackRaf = requestAnimationFrame(function() {
          rightPriceScaleFallbackRaf = 0;
          renderFallbackRightPriceScaleLabels();
        });
      }

      function recoverRightPriceScaleLayout(reason) {
        try {
          if (!chart) {
            return;
          }
          applyRightPriceScaleLayoutOptions();
          var size = resolveChartElementSize();
          if (
            size.width > 0 &&
            size.height > 0 &&
            typeof chart.resize === 'function'
          ) {
            chart.resize(size.width, size.height);
          }
          scheduleOverlayDomRefresh();
          scheduleRightPriceScaleFallbackRefresh();
          postChartGeometry();
          chartDebugLog('[WEBVIEW-CANDLE] recover_right_price_scale_layout', {
            reason: reason || 'unknown',
            width: size.width,
            height: size.height,
          });
        } catch (_e) {}
      }

      function scheduleRightPriceScaleLayoutRecovery(reason, attempts) {
        if (rightPriceScaleLayoutRecoveryRaf) {
          cancelAnimationFrame(rightPriceScaleLayoutRecoveryRaf);
        }
        var remainingAttempts =
          typeof attempts === 'number' && isFinite(attempts)
            ? Math.max(1, Math.round(attempts))
            : RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS;
        rightPriceScaleLayoutRecoveryRaf = requestAnimationFrame(function() {
          rightPriceScaleLayoutRecoveryRaf = 0;
          if (isRightPriceScaleLayoutHealthy()) {
            renderFallbackRightPriceScaleLabels();
            postChartGeometry();
            return;
          }
          recoverRightPriceScaleLayout(reason);
          if (remainingAttempts > 1 && !isRightPriceScaleLayoutHealthy()) {
            scheduleRightPriceScaleLayoutRecovery(reason, remainingAttempts - 1);
          }
        });
      }

      function postChartReadyWhenPriceScaleHealthy(reason, attempt, generation, initSignature, configSig) {
        if (typeof generation === 'number' && generation !== chartReadyPostGeneration) {
          return;
        }
        var currentAttempt =
          typeof attempt === 'number' && isFinite(attempt)
            ? Math.max(0, Math.round(attempt))
            : 0;
        if (isRightPriceScaleLayoutHealthy()) {
          if (!lastRawSeriesData || lastRawSeriesData.length === 0 || renderFallbackRightPriceScaleLabels()) {
            postChartGeometry();
            postChartReady(initSignature, configSig);
            return;
          }
        }
        recoverRightPriceScaleLayout(reason || 'chart_ready');
        if (!lastRawSeriesData || lastRawSeriesData.length === 0 || renderFallbackRightPriceScaleLabels()) {
          postChartGeometry();
          postChartReady(initSignature, configSig);
          return;
        }
        if (currentAttempt >= RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS) {
          scheduleRightPriceScaleFallbackRefresh();
          scheduleRightPriceScaleLayoutRecovery(reason || 'chart_ready', 2);
          postChartGeometry();
          postChartReady(initSignature, configSig);
          return;
        }
        requestAnimationFrame(function() {
          postChartReadyWhenPriceScaleHealthy(reason, currentAttempt + 1, generation, initSignature, configSig);
        });
      }

      function isTransparentChartColor(color) {
        if (typeof color !== 'string' || color.length === 0) {
          return true;
        }
        var normalized = color.toLowerCase().split(' ').join('');
        if (normalized === 'transparent') {
          return true;
        }
        if (normalized.indexOf('rgba(') === 0 && normalized.lastIndexOf(')') === normalized.length - 1) {
          var parts = normalized.slice(5, -1).split(',');
          if (parts.length >= 4) {
            var alpha = Number(parts[3]);
            return isFinite(alpha) && alpha <= 0;
          }
        }
        return false;
      }

      function getMovingVerticalGridLayer() {
        return document.getElementById('rtx5-moving-vertical-grid');
      }

      function clearMovingVerticalGrid() {
        if (movingVerticalGridRaf) {
          try { cancelAnimationFrame(movingVerticalGridRaf); } catch (_e) {}
          movingVerticalGridRaf = 0;
        }
        var layer = getMovingVerticalGridLayer();
        if (!layer) {
          return;
        }
        layer.textContent = '';
        layer.style.display = 'none';
        movingGridVerticalLines = [];
        movingGridHorizontalLines = [];
        movingGridVerticalGroup = null;
        movingGridHorizontalGroup = null;
        movingGridLayerSignature = '';
        movingGridVerticalSignature = '';
        movingGridHorizontalSignature = '';
      }

      function getChartAxisDividerLayer() {
        return document.getElementById('rtx5-axis-dividers');
      }

      function clearChartAxisDividers() {
        if (chartAxisDividerRaf) {
          try { cancelAnimationFrame(chartAxisDividerRaf); } catch (_e) {}
          chartAxisDividerRaf = 0;
        }
        var layer = getChartAxisDividerLayer();
        if (!layer) {
          return;
        }
        layer.textContent = '';
        layer.style.display = 'none';
        chartAxisDividerSignature = '';
      }

      function applyChartAxisDividerColor(color) {
        chartAxisDividerColor = typeof color === 'string' ? color : 'transparent';
        chartAxisDividerVisible = !isTransparentChartColor(chartAxisDividerColor);
        if (!chartAxisDividerVisible) {
          clearChartAxisDividers();
          return;
        }
        scheduleChartAxisDividersUpdate();
      }

      function scheduleChartAxisDividersUpdate() {
        if (chartAxisDividerRaf) {
          return;
        }
        chartAxisDividerRaf = requestAnimationFrame(function() {
          chartAxisDividerRaf = 0;
          updateChartAxisDividers();
        });
      }

      function createAxisDividerLine(layer, namespace, id) {
        var line = document.getElementById(id);
        if (!line || line.parentNode !== layer) {
          line = document.createElementNS(namespace, 'line');
          line.setAttribute('id', id);
          layer.appendChild(line);
        }
        line.setAttribute('stroke', chartAxisDividerColor);
        line.setAttribute('stroke-width', String(AXIS_DIVIDER_STROKE_WIDTH));
        line.setAttribute('stroke-linecap', 'square');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.style.display = 'block';
        return line;
      }

      function updateChartAxisDividers() {
        var layer = getChartAxisDividerLayer();
        if (!layer || !chart || !chartAxisDividerVisible) {
          clearChartAxisDividers();
          return;
        }

        try {
          var metrics = resolvePrimaryPaneMetrics();
          if (!(metrics.chartWidth > 0) || !(metrics.chartHeight > 0) || !(metrics.paneWidth > 0) || !(metrics.paneHeight > 0)) {
            clearChartAxisDividers();
            return;
          }

          var left = Math.round(metrics.leftAxisWidth);
          var paneRight = Math.round(metrics.leftAxisWidth + metrics.paneWidth);
          var paneBottom = Math.round(metrics.paneHeight);
          var dividerInset = Math.max(1, AXIS_DIVIDER_STROKE_WIDTH);
          var topDividerY = dividerInset;
          var bottomDividerY = Math.max(topDividerY, paneBottom - dividerInset);
          var layerSignature = [
            metrics.chartWidth,
            metrics.chartHeight,
            left,
            paneRight,
            paneBottom,
            topDividerY,
            bottomDividerY,
            AXIS_DIVIDER_STROKE_WIDTH,
            chartAxisDividerColor
          ].join('|');
          if (layerSignature === chartAxisDividerSignature) {
            return;
          }

          layer.style.display = 'block';
          layer.style.left = '0px';
          layer.style.top = '0px';
          layer.style.width = metrics.chartWidth + 'px';
          layer.style.height = metrics.chartHeight + 'px';
          layer.setAttribute('width', String(metrics.chartWidth));
          layer.setAttribute('height', String(metrics.chartHeight));
          layer.setAttribute('viewBox', '0 0 ' + metrics.chartWidth + ' ' + metrics.chartHeight);

          var namespace = 'http://www.w3.org/2000/svg';
          var verticalLine = createAxisDividerLine(layer, namespace, 'rtx5-axis-divider-right');
          verticalLine.setAttribute('x1', String(paneRight));
          verticalLine.setAttribute('y1', String(topDividerY));
          verticalLine.setAttribute('x2', String(paneRight));
          verticalLine.setAttribute('y2', String(bottomDividerY));

          var topLine = createAxisDividerLine(layer, namespace, 'rtx5-axis-divider-top');
          topLine.setAttribute('x1', String(left));
          topLine.setAttribute('y1', String(topDividerY));
          topLine.setAttribute('x2', String(paneRight));
          topLine.setAttribute('y2', String(topDividerY));

          var bottomLine = createAxisDividerLine(layer, namespace, 'rtx5-axis-divider-bottom');
          bottomLine.setAttribute('x1', String(left));
          bottomLine.setAttribute('y1', String(bottomDividerY));
          bottomLine.setAttribute('x2', String(paneRight));
          bottomLine.setAttribute('y2', String(bottomDividerY));

          chartAxisDividerSignature = layerSignature;
        } catch (_e) {
          clearChartAxisDividers();
        }
      }

      function applyMovingVerticalGridColor(color) {
        movingVerticalGridColor = typeof color === 'string' ? color : 'transparent';
        movingVerticalGridVisible = !isTransparentChartColor(movingVerticalGridColor);
        if (!movingVerticalGridVisible) {
          clearMovingVerticalGrid();
          return;
        }
        scheduleMovingVerticalGridUpdate();
      }

      function scheduleMovingVerticalGridUpdate() {
        if (movingVerticalGridRaf) {
          return;
        }
        movingVerticalGridRaf = requestAnimationFrame(function() {
          movingVerticalGridRaf = 0;
          updateMovingVerticalGrid();
        });
      }

      function applyMovingGridLineStyle(line) {
        var styleSignature = [
          movingVerticalGridColor,
          MOVING_GRID_STROKE_WIDTH,
          MOVING_VERTICAL_GRID_DASH_PATTERN
        ].join('|');
        if (line.__rtx5GridStyleSignature !== styleSignature) {
          line.setAttribute('stroke', movingVerticalGridColor);
          line.setAttribute('stroke-width', String(MOVING_GRID_STROKE_WIDTH));
          line.setAttribute('stroke-linecap', 'round');
          if (MOVING_VERTICAL_GRID_DASH_PATTERN) {
            line.setAttribute('stroke-dasharray', MOVING_VERTICAL_GRID_DASH_PATTERN);
          } else {
            line.removeAttribute('stroke-dasharray');
          }
          line.setAttribute('vector-effect', 'non-scaling-stroke');
          line.__rtx5GridStyleSignature = styleSignature;
        }
        if (line.style.display !== 'block') {
          line.style.display = 'block';
        }
      }

      function setMovingGridAttribute(line, name, value) {
        var nextValue = String(value);
        if (line.getAttribute(name) !== nextValue) {
          line.setAttribute(name, nextValue);
        }
      }

      function resolveMovingGridGroup(layer, namespace, id) {
        var group = id === 'vertical' ? movingGridVerticalGroup : movingGridHorizontalGroup;
        if (!group || group.parentNode !== layer) {
          group = document.createElementNS(namespace, 'g');
          layer.appendChild(group);
          if (id === 'vertical') {
            movingGridVerticalGroup = group;
          } else {
            movingGridHorizontalGroup = group;
          }
        }
        return group;
      }

      function setMovingGridGroupTransform(group, x) {
        var nextTransform = 'translate(' + Math.round(x) + ',0)';
        if (group.getAttribute('transform') !== nextTransform) {
          group.setAttribute('transform', nextTransform);
        }
      }

      function resolveMovingGridLine(pool, layer, namespace, index) {
        var line = pool[index];
        if (!line || line.parentNode !== layer) {
          line = document.createElementNS(namespace, 'line');
          layer.appendChild(line);
          pool[index] = line;
        }
        applyMovingGridLineStyle(line);
        return line;
      }

      function hideUnusedMovingGridLines(pool, startIndex) {
        for (var index = startIndex; index < pool.length; index += 1) {
          if (pool[index]) {
            pool[index].style.display = 'none';
          }
        }
      }

      function resolveMovingVerticalGridXPositions(metrics) {
        var positions = [];
        var timeScaleApi = chart && typeof chart.timeScale === 'function' ? chart.timeScale() : null;
        if (!timeScaleApi) {
          return positions;
        }

        var range =
          typeof timeScaleApi.getVisibleLogicalRange === 'function'
            ? timeScaleApi.getVisibleLogicalRange()
            : null;
        var options =
          typeof timeScaleApi.options === 'function'
            ? timeScaleApi.options()
            : null;
        var barSpacing =
          options && typeof options.barSpacing === 'number' && isFinite(options.barSpacing) && options.barSpacing > 0
            ? options.barSpacing
            : ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
        var visualSpacing = Math.max(12, MOVING_VERTICAL_GRID_SPACING);

        if (
          range &&
          typeof range.from === 'number' &&
          typeof range.to === 'number' &&
          isFinite(range.from) &&
          isFinite(range.to) &&
          typeof timeScaleApi.logicalToCoordinate === 'function'
        ) {
          var anchorCoordinate = timeScaleApi.logicalToCoordinate(0);
          if (typeof anchorCoordinate !== 'number' || !isFinite(anchorCoordinate)) {
            anchorCoordinate = -(range.from * barSpacing);
          }
          var firstCoordinate = anchorCoordinate % visualSpacing;
          while (firstCoordinate > 0) {
            firstCoordinate -= visualSpacing;
          }
          while (firstCoordinate < -visualSpacing) {
            firstCoordinate += visualSpacing;
          }
          for (var x = firstCoordinate; x <= metrics.paneWidth + 1; x += visualSpacing) {
            if (x >= -1) {
              positions.push(Math.round(x));
            }
          }
          if (positions.length > 0) {
            return positions;
          }
        }

        var fallbackX = 0;
        if (range && typeof range.from === 'number' && isFinite(range.from)) {
          fallbackX = -((range.from * barSpacing) % visualSpacing);
          while (fallbackX > 0) {
            fallbackX -= visualSpacing;
          }
          while (fallbackX < -visualSpacing) {
            fallbackX += visualSpacing;
          }
        }
        for (; fallbackX <= metrics.paneWidth + 1; fallbackX += visualSpacing) {
          if (fallbackX >= -1) {
            positions.push(Math.round(fallbackX));
          }
        }
        return positions;
      }

      function resolveMovingGridYPositions(metrics) {
        var positions = [];
        var lineCount = Math.max(1, Math.round(MOVING_GRID_HORIZONTAL_LINE_COUNT));
        var spacing = Math.max(24, MOVING_GRID_HORIZONTAL_SPACING);
        var firstInteriorLine = MOVING_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET;
        for (var index = 0; index < lineCount; index++) {
          var y = firstInteriorLine + index * spacing;
          if (y > 0 && y < metrics.paneHeight - 1) {
            positions.push(Math.round(y));
          }
        }
        return positions;
      }

      function updateMovingVerticalGrid() {
        var layer = getMovingVerticalGridLayer();
        if (!layer || !chart || !movingVerticalGridVisible) {
          clearMovingVerticalGrid();
          return;
        }
        try {
          var metrics = resolvePrimaryPaneMetrics();
          if (!(metrics.paneWidth > 0) || !(metrics.paneHeight > 0)) {
            clearMovingVerticalGrid();
            return;
          }

          var xPositions = resolveMovingVerticalGridXPositions(metrics);
          var yPositions = resolveMovingGridYPositions(metrics);
          if (!xPositions.length && !yPositions.length) {
            clearMovingVerticalGrid();
            return;
          }

          layer.style.display = 'block';
          var layerSignature = [
            metrics.leftAxisWidth,
            metrics.paneWidth,
            metrics.paneHeight
          ].join('|');
          if (layerSignature !== movingGridLayerSignature) {
            layer.style.left = metrics.leftAxisWidth + 'px';
            layer.style.top = '0px';
            layer.style.width = metrics.paneWidth + 'px';
            layer.style.height = metrics.paneHeight + 'px';
            layer.setAttribute('width', String(metrics.paneWidth));
            layer.setAttribute('height', String(metrics.paneHeight));
            layer.setAttribute('viewBox', '0 0 ' + metrics.paneWidth + ' ' + metrics.paneHeight);
            movingGridLayerSignature = layerSignature;
            movingGridHorizontalSignature = '';
          }
          var namespace = 'http://www.w3.org/2000/svg';
          var verticalGroup = resolveMovingGridGroup(layer, namespace, 'vertical');
          var horizontalGroup = resolveMovingGridGroup(layer, namespace, 'horizontal');
          var visualSpacing = Math.max(12, MOVING_VERTICAL_GRID_SPACING);
          var verticalOffset = xPositions.length ? xPositions[0] : 0;
          var verticalSignature = [
            xPositions.length,
            metrics.paneHeight,
            movingVerticalGridColor,
            MOVING_GRID_STROKE_WIDTH,
            MOVING_VERTICAL_GRID_DASH_PATTERN,
            visualSpacing
          ].join('|');
          if (verticalSignature !== movingGridVerticalSignature) {
          for (var index = 0; index < xPositions.length; index++) {
            var x = index * visualSpacing;
            var line = resolveMovingGridLine(movingGridVerticalLines, verticalGroup, namespace, index);
            setMovingGridAttribute(line, 'x1', x);
            setMovingGridAttribute(line, 'y1', 0);
            setMovingGridAttribute(line, 'x2', x);
            setMovingGridAttribute(line, 'y2', metrics.paneHeight);
          }
          hideUnusedMovingGridLines(movingGridVerticalLines, xPositions.length);
            movingGridVerticalSignature = verticalSignature;
          }
          setMovingGridGroupTransform(verticalGroup, verticalOffset);
          var horizontalSignature = [
            metrics.paneWidth,
            metrics.paneHeight,
            movingVerticalGridColor,
            MOVING_GRID_STROKE_WIDTH,
            MOVING_VERTICAL_GRID_DASH_PATTERN,
            yPositions.join(',')
          ].join('|');
          if (horizontalSignature !== movingGridHorizontalSignature) {
            for (var yIndex = 0; yIndex < yPositions.length; yIndex++) {
              var y = yPositions[yIndex];
              var horizontalLine = resolveMovingGridLine(movingGridHorizontalLines, horizontalGroup, namespace, yIndex);
              setMovingGridAttribute(horizontalLine, 'x1', 0);
              setMovingGridAttribute(horizontalLine, 'y1', y);
              setMovingGridAttribute(horizontalLine, 'x2', metrics.paneWidth);
              setMovingGridAttribute(horizontalLine, 'y2', y);
            }
            hideUnusedMovingGridLines(movingGridHorizontalLines, yPositions.length);
            movingGridHorizontalSignature = horizontalSignature;
          }
        } catch (_e) {
          clearMovingVerticalGrid();
        }
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

      function normalizePriceRange(range) {
        if (!isValidPriceRange(range)) {
          return null;
        }
        return {
          from: Math.min(range.from, range.to),
          to: Math.max(range.from, range.to),
        };
      }

      function getPriceRangeSpan(range) {
        var normalized = normalizePriceRange(range);
        return normalized ? normalized.to - normalized.from : 0;
      }

      function getPriceRangeOverlapRatio(currentRange, dataRange) {
        var current = normalizePriceRange(currentRange);
        var data = normalizePriceRange(dataRange);
        if (!current || !data) {
          return 0;
        }
        var dataSpan = getPriceRangeSpan(data);
        if (!(dataSpan > 0)) {
          return 0;
        }
        var overlapFrom = Math.max(current.from, data.from);
        var overlapTo = Math.min(current.to, data.to);
        var overlapSpan = Math.max(0, overlapTo - overlapFrom);
        return overlapSpan / dataSpan;
      }

      function resolvePriceRangePixelCompression(range) {
        var normalized = normalizePriceRange(range);
        if (!normalized || !series || typeof series.priceToCoordinate !== 'function') {
          return null;
        }
        var fromCoordinate = series.priceToCoordinate(normalized.from);
        var toCoordinate = series.priceToCoordinate(normalized.to);
        if (
          typeof fromCoordinate !== 'number' ||
          typeof toCoordinate !== 'number' ||
          !isFinite(fromCoordinate) ||
          !isFinite(toCoordinate)
        ) {
          return null;
        }
        var metrics = resolvePrimaryPaneMetrics();
        var plotHeight =
          metrics && typeof metrics.plotHeight === 'number' && isFinite(metrics.plotHeight) && metrics.plotHeight > 0
            ? metrics.plotHeight
            : 0;
        if (!(plotHeight > 0)) {
          return null;
        }
        var pixelSpan = Math.abs(toCoordinate - fromCoordinate);
        var minPixelSpan = Math.max(
          PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_SPAN,
          plotHeight * PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_RATIO
        );
        return {
          pixelSpan: pixelSpan,
          minPixelSpan: minPixelSpan,
          collapsed: pixelSpan < minPixelSpan,
        };
      }

      function getBarPriceCenter(bar) {
        if (!bar) return NaN;
        if (typeof bar.close === 'number' && isFinite(bar.close)) return bar.close;
        if (typeof bar.value === 'number' && isFinite(bar.value)) return bar.value;
        if (typeof bar.open === 'number' && isFinite(bar.open)) return bar.open;
        return NaN;
      }

      function makePaddedPriceRange(minPrice, maxPrice) {
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

      function collectFiniteBarPrices(bars) {
        var prices = [];
        if (!bars || bars.length === 0) {
          return prices;
        }
        for (var i = 0; i < bars.length; i += 1) {
          var bar = bars[i];
          if (!bar) continue;
          var candidates = [
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.value,
          ];
          for (var p = 0; p < candidates.length; p += 1) {
            var price = candidates[p];
            if (typeof price === 'number' && isFinite(price)) {
              prices.push(price);
            }
          }
        }
        return prices;
      }

      function resolveTrimmedPriceRangeFromBars(bars) {
        var prices = collectFiniteBarPrices(bars);
        if (prices.length < PRICE_SCALE_ROBUST_TRIM_MIN_VALUES) {
          return null;
        }
        prices.sort(function(left, right) { return left - right; });
        var trimCount = Math.max(1, Math.floor(prices.length * PRICE_SCALE_ROBUST_TRIM_RATIO));
        if (prices.length - trimCount * 2 < Math.floor(PRICE_SCALE_ROBUST_TRIM_MIN_VALUES / 2)) {
          return null;
        }
        var minPrice = prices[trimCount];
        var maxPrice = prices[prices.length - 1 - trimCount];
        if (!(maxPrice > minPrice)) {
          return null;
        }
        return makePaddedPriceRange(minPrice, maxPrice);
      }

      function resolvePriceRangeFromBars(bars) {
        if (!bars || bars.length === 0) {
          return null;
        }

        var minPrice = Infinity;
        var maxPrice = -Infinity;
        for (var i = 0; i < bars.length; i += 1) {
          var bar = bars[i];
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

        return makePaddedPriceRange(minPrice, maxPrice);
      }

      function getMarketPriceBadgeValues() {
        var prices = [];
        if (typeof lastBidPrice === 'number' && isFinite(lastBidPrice) && lastBidPrice > 0) {
          prices.push(lastBidPrice);
        }
        if (typeof lastAskPrice === 'number' && isFinite(lastAskPrice) && lastAskPrice > 0) {
          prices.push(lastAskPrice);
        }
        return prices;
      }

      function isMarketPriceNearRange(price, range) {
        var normalized = normalizePriceRange(range);
        if (!normalized || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return false;
        }
        if (price >= normalized.from && price <= normalized.to) {
          return true;
        }
        var span = getPriceRangeSpan(normalized);
        if (!(span > 0)) {
          return false;
        }
        var distance = price < normalized.from
          ? normalized.from - price
          : price - normalized.to;
        return distance <= span * 4;
      }

      function expandPriceRangeForMarketPriceBadges(range) {
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return range;
        }
        var marketPrices = getMarketPriceBadgeValues();
        if (marketPrices.length === 0) {
          return normalized;
        }
        var minPrice = normalized.from;
        var maxPrice = normalized.to;
        var span = getPriceRangeSpan(normalized);
        var maxQuoteDistance = span * 4;
        var expanded = false;
        for (var i = 0; i < marketPrices.length; i += 1) {
          var price = marketPrices[i];
          if (price < minPrice && minPrice - price <= maxQuoteDistance) {
            minPrice = price;
            expanded = true;
          } else if (price > maxPrice && price - maxPrice <= maxQuoteDistance) {
            maxPrice = price;
            expanded = true;
          }
        }
        return expanded ? makePaddedPriceRange(minPrice, maxPrice) : normalized;
      }

      function resolveMarketPriceBadgeRecoveryBuffer(range) {
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return 0;
        }
        var span = getPriceRangeSpan(normalized);
        if (!(span > 0)) {
          return 0;
        }
        var configuredDecimals = resolveRightPriceScaleFallbackConfiguredDecimals();
        var minimumStep =
          typeof configuredDecimals === 'number' && isFinite(configuredDecimals)
            ? (configuredDecimals > 0 ? Math.pow(10, -configuredDecimals) : 1)
            : 0;
        return Math.max(minimumStep * 2, span * MARKET_PRICE_BADGE_RECOVERY_BUFFER_RATIO);
      }

      function rangeContainsMarketPriceBadges(range, referenceRange) {
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return true;
        }
        var reference = normalizePriceRange(referenceRange);
        var marketPrices = getMarketPriceBadgeValues();
        var recoveryBuffer = resolveMarketPriceBadgeRecoveryBuffer(reference || normalized);
        for (var i = 0; i < marketPrices.length; i += 1) {
          var price = marketPrices[i];
          if (reference && !isMarketPriceNearRange(price, reference)) {
            continue;
          }
          if (price < normalized.from - recoveryBuffer || price > normalized.to + recoveryBuffer) {
            return false;
          }
        }
        return true;
      }

      function resolveMarketAnchoredVisiblePriceRange(visibleBars, rawRange) {
        if (!visibleBars || visibleBars.length === 0 || !isValidPriceRange(rawRange)) {
          return null;
        }
        var rawSpan = getPriceRangeSpan(rawRange);
        if (!(rawSpan > 0)) {
          return null;
        }
        var marketPrices = getMarketPriceBadgeValues();
        if (marketPrices.length === 0) {
          return null;
        }

        var bestBars = [];
        for (var marketIndex = 0; marketIndex < marketPrices.length; marketIndex += 1) {
          var marketPrice = marketPrices[marketIndex];
          var tolerance = Math.max(
            Math.abs(marketPrice) * PRICE_SCALE_ROBUST_MARKET_CLUSTER_RELATIVE_TOLERANCE,
            1e-9
          );
          var candidateBars = [];
          for (var barIndex = 0; barIndex < visibleBars.length; barIndex += 1) {
            var bar = visibleBars[barIndex];
            var center = getBarPriceCenter(bar);
            if (isFinite(center) && Math.abs(center - marketPrice) <= tolerance) {
              candidateBars.push(bar);
            }
          }
          if (candidateBars.length > bestBars.length) {
            bestBars = candidateBars;
          }
        }

        if (bestBars.length < PRICE_SCALE_ROBUST_MARKET_CLUSTER_MIN_BARS) {
          return null;
        }

        var marketRange = resolvePriceRangeFromBars(bestBars);
        if (!isValidPriceRange(marketRange)) {
          return null;
        }
        var marketSpan = getPriceRangeSpan(marketRange);
        return rawSpan > marketSpan * PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE
          ? marketRange
          : null;
      }

      function resolveRobustVisiblePriceRange(visibleBars, rawRange) {
        if (!visibleBars || visibleBars.length === 0 || !isValidPriceRange(rawRange)) {
          return rawRange;
        }
        var rawSpan = getPriceRangeSpan(rawRange);

        var marketAnchoredRange = resolveMarketAnchoredVisiblePriceRange(visibleBars, rawRange);
        if (marketAnchoredRange) {
          return marketAnchoredRange;
        }

        var trimmedRange = resolveTrimmedPriceRangeFromBars(visibleBars);
        var trimmedSpan = getPriceRangeSpan(trimmedRange);
        if (trimmedRange && trimmedSpan > 0 && rawSpan > trimmedSpan * PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE) {
          return trimmedRange;
        }

        if (visibleBars.length < PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS) {
          return rawRange;
        }

        var centers = [];
        for (var i = 0; i < visibleBars.length; i += 1) {
          var center = getBarPriceCenter(visibleBars[i]);
          if (isFinite(center) && center > 0) {
            centers.push(center);
          }
        }
        if (centers.length < PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS) {
          return rawRange;
        }

        centers.sort(function(left, right) { return left - right; });
        var bestStart = 0;
        var bestEnd = 0;
        var start = 0;
        for (var end = 0; end < centers.length; end += 1) {
          while (
            start < end &&
            centers[end] - centers[start] >
              Math.max(Math.abs(centers[start]) * PRICE_SCALE_ROBUST_CLUSTER_RELATIVE_TOLERANCE, 1e-9)
          ) {
            start += 1;
          }
          if (end - start > bestEnd - bestStart) {
            bestStart = start;
            bestEnd = end;
          }
        }

        var keepCount = bestEnd - bestStart + 1;
        if (keepCount < PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS) {
          return rawRange;
        }
        if (keepCount / centers.length < PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO) {
          return rawRange;
        }

        var clusterMin = centers[bestStart];
        var clusterMax = centers[bestEnd];
        var clusterBars = [];
        for (var barIndex = 0; barIndex < visibleBars.length; barIndex += 1) {
          var barCenter = getBarPriceCenter(visibleBars[barIndex]);
          if (isFinite(barCenter) && barCenter >= clusterMin && barCenter <= clusterMax) {
            clusterBars.push(visibleBars[barIndex]);
          }
        }

        var clusterRange = resolvePriceRangeFromBars(clusterBars);
        if (!isValidPriceRange(clusterRange)) {
          return rawRange;
        }

        var clusterTrimmedRange = resolveTrimmedPriceRangeFromBars(clusterBars);
        var clusterTrimmedSpan = getPriceRangeSpan(clusterTrimmedRange);
        if (
          clusterTrimmedRange &&
          clusterTrimmedSpan > 0 &&
          rawSpan > clusterTrimmedSpan * PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE
        ) {
          return clusterTrimmedRange;
        }

        var clusterSpan = getPriceRangeSpan(clusterRange);
        return rawSpan > clusterSpan * PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE
          ? clusterRange
          : rawRange;
      }

      function resolvePriceRangeFromVisibleData(includeMarketPriceBadges) {
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

        var visibleBars = [];
        for (var i = fromIndex; i <= toIndex; i += 1) {
          var bar = lastRawSeriesData[i];
          if (bar) {
            visibleBars.push(bar);
          }
        }

        var rawRange = resolvePriceRangeFromBars(visibleBars);
        var robustRange = resolveRobustVisiblePriceRange(visibleBars, rawRange);
        return includeMarketPriceBadges === false
          ? robustRange
          : expandPriceRangeForMarketPriceBadges(robustRange);
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
        return resolvePriceRangeFromVisibleData(false);
      }

      function enableRightPriceAutoScale() {
        manualPriceScaleRangeActive = false;
        verticalPricePanGestureActive = false;
        var priceScaleApi = getRightPriceScaleApi();
        if (!priceScaleApi) {
          return;
        }
        applyRightPriceScaleLayoutOptions();
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

      function setRecoveredRightPriceRange(range) {
        var recoveredRange = normalizePriceRange(range);
        if (!recoveredRange) {
          return;
        }
        var priceScaleApi = getRightPriceScaleApi();
        if (!priceScaleApi) {
          return;
        }
        manualPriceScaleRangeActive = false;
        try {
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            priceScaleApi.setVisibleRange({ from: recoveredRange.from, to: recoveredRange.to });
          }
        } catch (_e) {}
      }

      function healCollapsedPriceScaleRange(reason, allowManualReset) {
        try {
          if (activeTradeLineDrag) {
            return;
          }
          if (!isRightPriceScaleLayoutHealthy()) {
            recoverRightPriceScaleLayout(reason || 'price_scale_health');
          }
          if (verticalPricePanGestureActive) {
            return;
          }
          if (manualPriceScaleRangeActive && allowManualReset !== true) {
            return;
          }
          var priceScaleApi = getRightPriceScaleApi();
          var currentRange =
            priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
              ? priceScaleApi.getVisibleRange()
              : null;
          if (!isValidPriceRange(currentRange)) {
            enableRightPriceAutoScale();
            return;
          }
          currentRange = normalizePriceRange(currentRange);

          var candleDataRange = resolvePriceRangeFromVisibleData(false);
          var dataRange = expandPriceRangeForMarketPriceBadges(candleDataRange);
          if (!isValidPriceRange(dataRange)) {
            return;
          }
          dataRange = normalizePriceRange(dataRange);
          candleDataRange = normalizePriceRange(candleDataRange);

          var scaleSpan = getPriceRangeSpan(currentRange);
          var dataSpan = getPriceRangeSpan(dataRange);
          if (!(scaleSpan > 0) || !(dataSpan > 0)) {
            return;
          }
          var dataOverlapRatio = getPriceRangeOverlapRatio(currentRange, dataRange);
          var pixelCompression = resolvePriceRangePixelCompression(dataRange);
          var dataVisuallyCollapsed = Boolean(pixelCompression && pixelCompression.collapsed);
          var marketPriceBadgesOutOfRange = !rangeContainsMarketPriceBadges(currentRange, candleDataRange);

          // A stale manual price range can be many times wider than the
          // visible OHLC range, or shifted away from it after horizontal
          // navigation. A smaller stale span can still flatten candles on
          // mobile, so also heal when the visible candle range occupies only
          // a tiny vertical pixel band.
          // Heal only the axis; never rewrite candle data.
          if (
            scaleSpan > dataSpan * PRICE_SCALE_HEALTH_SPAN_MULTIPLE ||
            dataSpan > scaleSpan * PRICE_SCALE_HEALTH_SPAN_MULTIPLE ||
            dataOverlapRatio < PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO ||
            marketPriceBadgesOutOfRange ||
            dataVisuallyCollapsed
          ) {
            chartDebugLog('[WEBVIEW-CANDLE] heal_price_scale', {
              reason: reason || 'unknown',
              scaleSpan: scaleSpan,
              dataSpan: dataSpan,
              dataOverlapRatio: dataOverlapRatio,
              dataPixelSpan: pixelCompression ? pixelCompression.pixelSpan : null,
              minDataPixelSpan: pixelCompression ? pixelCompression.minPixelSpan : null,
            });
            enableRightPriceAutoScale();
            setRecoveredRightPriceRange(dataRange);
            scheduleOverlayDomRefresh();
            postChartGeometry();
          }
        } catch (_e) {}
      }

      function schedulePriceScaleHealthCheck(reason, allowManualReset, attempts) {
        if (priceScaleHealthRaf) {
          cancelAnimationFrame(priceScaleHealthRaf);
        }
        var remainingAttempts =
          typeof attempts === 'number' && isFinite(attempts)
            ? Math.max(1, Math.round(attempts))
            : 1;
        priceScaleHealthRaf = requestAnimationFrame(function() {
          priceScaleHealthRaf = 0;
          healCollapsedPriceScaleRange(reason, allowManualReset);
          if (remainingAttempts > 1) {
            schedulePriceScaleHealthCheck(reason, allowManualReset, remainingAttempts - 1);
          }
        });
      }

      function isChartScaleGestureSuppressed() {
        return Date.now() <= suppressChartTapUntil;
      }

      function markHorizontalScrollGestureActive() {
        activeHorizontalScrollGesture = true;
        activeHorizontalScrollGestureUntil = Date.now() + ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS;
      }

      function finishHorizontalScrollGesture() {
        activeHorizontalScrollGesture = false;
        activeHorizontalScrollGestureUntil = Date.now() + ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS;
      }

      function isHorizontalScrollGesturePriceScaleRecoveryEligible() {
        return activeHorizontalScrollGesture || Date.now() <= activeHorizontalScrollGestureUntil;
      }

      function clearActiveScrollPriceScaleRecovery() {
        if (activeScrollPriceScaleRaf) {
          try { cancelAnimationFrame(activeScrollPriceScaleRaf); } catch (_) {}
          activeScrollPriceScaleRaf = 0;
        }
        lastActiveScrollPriceScaleCheckAt = 0;
        activeHorizontalScrollGesture = false;
        activeHorizontalScrollGestureUntil = 0;
      }

      function healVisiblePriceScaleDuringActiveScroll(reason) {
        try {
          if (
            verticalPricePanGestureActive ||
            activeTradeLineDrag ||
            manualPriceScaleRangeActive ||
            isChartScaleGestureSuppressed() ||
            !isHorizontalScrollGesturePriceScaleRecoveryEligible()
          ) {
            return;
          }
          var priceScaleApi = getRightPriceScaleApi();
          var currentRange =
            priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
              ? priceScaleApi.getVisibleRange()
              : null;
          if (!isValidPriceRange(currentRange)) {
            return;
          }
          currentRange = normalizePriceRange(currentRange);

          var candleDataRange = normalizePriceRange(resolvePriceRangeFromVisibleData(false));
          if (!isValidPriceRange(candleDataRange)) {
            return;
          }
          var scaleSpan = getPriceRangeSpan(currentRange);
          var dataSpan = getPriceRangeSpan(candleDataRange);
          if (!(scaleSpan > 0) || !(dataSpan > 0)) {
            return;
          }

          var dataOverlapRatio = getPriceRangeOverlapRatio(currentRange, candleDataRange);
          var pixelCompression = resolvePriceRangePixelCompression(candleDataRange);
          var shouldRecover =
            scaleSpan > dataSpan * ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE ||
            dataSpan > scaleSpan * ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE ||
            dataOverlapRatio < PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO ||
            Boolean(pixelCompression && pixelCompression.collapsed);

          if (!shouldRecover) {
            return;
          }

          chartDebugLog('[WEBVIEW-CANDLE] heal_price_scale_active_scroll', {
            reason: reason || 'visible_range_active',
            scaleSpan: scaleSpan,
            dataSpan: dataSpan,
            dataOverlapRatio: dataOverlapRatio,
            dataPixelSpan: pixelCompression ? pixelCompression.pixelSpan : null,
            minDataPixelSpan: pixelCompression ? pixelCompression.minPixelSpan : null,
          });
          enableRightPriceAutoScale();
          setRecoveredRightPriceRange(candleDataRange);
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
      }

      function scheduleActiveScrollPriceScaleRecovery(reason) {
        if (activeScrollPriceScaleRaf) {
          return;
        }
        if (isChartScaleGestureSuppressed() || !isHorizontalScrollGesturePriceScaleRecoveryEligible()) {
          return;
        }
        var now = Date.now();
        if (now - lastActiveScrollPriceScaleCheckAt < ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS) {
          return;
        }
        activeScrollPriceScaleRaf = requestAnimationFrame(function() {
          activeScrollPriceScaleRaf = 0;
          lastActiveScrollPriceScaleCheckAt = Date.now();
          if (!isChartScaleGestureSuppressed()) {
            healVisiblePriceScaleDuringActiveScroll(reason || 'visible_range_active');
          }
        });
      }

      function ensureMarketPriceBadgesVisible() {
        try {
          if (verticalPricePanGestureActive || activeTradeLineDrag || manualPriceScaleRangeActive) {
            return;
          }
          var currentRange = null;
          var priceScaleApi = getRightPriceScaleApi();
          if (priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function') {
            currentRange = priceScaleApi.getVisibleRange();
          }
          if (!isValidPriceRange(currentRange)) {
            return;
          }
          var candleRange = resolvePriceRangeFromVisibleData(false);
          if (rangeContainsMarketPriceBadges(currentRange, candleRange)) {
            return;
          }
          var expandedRange = expandPriceRangeForMarketPriceBadges(candleRange);
          if (!isValidPriceRange(expandedRange)) {
            return;
          }
          enableRightPriceAutoScale();
          setRecoveredRightPriceRange(expandedRange);
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
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
            enableRightPriceAutoScale();
          } else {
            enableRightPriceAutoScale();
          }
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
      }

      function scheduleOverlayPriceScaleLock(forceAutoScale) {
        if (forceAutoScale === true) {
          overlayPriceScaleLockForceAutoScale = true;
        }
        if (overlayPriceScaleLockRaf) {
          return;
        }
        overlayPriceScaleLockRaf = requestAnimationFrame(function() {
          overlayPriceScaleLockRaf = 0;
          var shouldForceAutoScale = overlayPriceScaleLockForceAutoScale;
          overlayPriceScaleLockForceAutoScale = false;
          lockVisiblePriceScaleRange(shouldForceAutoScale, 0);
        });
      }

      function postReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
        } catch (_e) {}
      }

      function postChartReady(initSignature, configSig) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_READY',
            initSignature: initSignature || '',
            configSig: configSig || '',
          }));
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
          scheduleMovingVerticalGridUpdate();
          scheduleChartAxisDividersUpdate();
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
        try {
          if (typeof window.__rtx5SuppressChartTapUntil === 'number' && now <= window.__rtx5SuppressChartTapUntil) {
            return;
          }
        } catch (_suppressCrosshairTapErr) {}
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

      function scheduleVisibleRangeIdleWork() {
        if (visibleRangeIdleTimer !== null) {
          clearTimeout(visibleRangeIdleTimer);
        }
        visibleRangeIdleTimer = setTimeout(function() {
          visibleRangeIdleTimer = null;
          scheduleOverlayPriceScaleLock(false);
          schedulePriceScaleHealthCheck('visible_range_change', true);
          scheduleOverlayDomRefresh();
        }, 96);
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
          if (visibleRangeIdleTimer !== null) {
            clearTimeout(visibleRangeIdleTimer);
            visibleRangeIdleTimer = null;
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
          enableRightPriceAutoScale();
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
          activeHorizontalScrollGesture = false;
          activeHorizontalScrollGestureUntil = 0;
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
          if (point && activeHorizontalScrollGesture) {
            markHorizontalScrollGestureActive();
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
                enableRightPriceAutoScale();
              } catch (_e) {}
              markHorizontalScrollGestureActive();
              scheduleActiveScrollPriceScaleRecovery('horizontal_pan_active');
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
            finishHorizontalScrollGesture();
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          releasePointer(event);
          finishHorizontalScrollGesture();
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
            finishHorizontalScrollGesture();
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          releasePointer(event);
          finishHorizontalScrollGesture();
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
          activeHorizontalScrollGesture = false;
          activeHorizontalScrollGestureUntil = 0;
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
            fixLeftEdge: ${CHART_TIME_SCALE_FIX_LEFT_EDGE},
            fixRightEdge: ${CHART_TIME_SCALE_FIX_RIGHT_EDGE},
          });
        } catch (_e) {}
      }

      function getBoundedLiveRightEdge(lengthOverride) {
        var dataLength =
          (typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0)
            ? Math.round(lengthOverride)
            : currentSeriesLength;
        if (!(dataLength > 0)) return null;
        return Math.max(0.5, dataLength - 0.5) + ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET};
      }

      function clampVisibleLogicalRangeToLiveEdge(range) {
        try {
          if (liveRightEdgeClampActive) return false;
          if (!chart || !chart.timeScale || typeof chart.timeScale().setVisibleLogicalRange !== 'function') return false;
          if (
            !range ||
            typeof range.from !== 'number' ||
            typeof range.to !== 'number' ||
            !isFinite(range.from) ||
            !isFinite(range.to)
          ) {
            return false;
          }
          var maxRight = getBoundedLiveRightEdge();
          if (maxRight === null || range.to <= maxRight + 0.001) {
            return false;
          }
          var span = Math.max(1, range.to - range.from);
          var nextFrom = maxRight - span;
          if (!isFinite(nextFrom)) {
            return false;
          }
          liveRightEdgeClampActive = true;
          chart.timeScale().setVisibleLogicalRange({
            from: nextFrom,
            to: maxRight,
          });
          setTimeout(function() {
            liveRightEdgeClampActive = false;
          }, 0);
          return true;
        } catch (_e) {
          liveRightEdgeClampActive = false;
          return false;
        }
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
            var lastVisibleBar = getBoundedLiveRightEdge(dataLength);
            if (lastVisibleBar === null) return;
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(-0.5, lastVisibleBar - visibleBars),
              to: lastVisibleBar,
            });
          } else {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
          }
          // Respect a user-driven vertical pan: if manualPriceScaleRangeActive
          // is set, this call leaves the manual range in place. A pinch or
          // bootstrap with manualPriceScaleRangeActive=false still recovers
          // autoScale, which is what the original "force" was guarding.
          scheduleOverlayPriceScaleLock(false);
          schedulePriceScaleHealthCheck('recent_viewport', false);
          refreshOverlayDomLabels(_overlayPayload);
        } catch (_e) {}
      }

      function getVisibleLogicalRangeSnapshot() {
        try {
          if (
            chart &&
            chart.timeScale &&
            typeof chart.timeScale === 'function' &&
            typeof chart.timeScale().getVisibleLogicalRange === 'function'
          ) {
            var range = chart.timeScale().getVisibleLogicalRange();
            if (
              range &&
              typeof range.from === 'number' &&
              isFinite(range.from) &&
              typeof range.to === 'number' &&
              isFinite(range.to)
            ) {
              return { from: range.from, to: range.to };
            }
          }
        } catch (_e) {}
        return null;
      }

      function shouldFollowLiveRightEdge(range, lengthOverride) {
        try {
          if (
            !range ||
            typeof range.from !== 'number' ||
            typeof range.to !== 'number' ||
            !isFinite(range.from) ||
            !isFinite(range.to)
          ) {
            return false;
          }
          if (activeHorizontalScrollGesture || Date.now() <= activeHorizontalScrollGestureUntil) {
            return false;
          }
          var previousMaxRight = getBoundedLiveRightEdge(lengthOverride);
          if (previousMaxRight === null) {
            return false;
          }
          var followTolerance = Math.max(1.25, ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET} + 0.25);
          return range.to >= previousMaxRight - followTolerance;
        } catch (_e) {}
        return false;
      }

      function followLiveRightEdge(previousRange, lengthOverride) {
        try {
          if (
            !previousRange ||
            typeof previousRange.from !== 'number' ||
            typeof previousRange.to !== 'number' ||
            !isFinite(previousRange.from) ||
            !isFinite(previousRange.to)
          ) {
            return false;
          }
          if (!chart || !chart.timeScale || typeof chart.timeScale().setVisibleLogicalRange !== 'function') {
            return false;
          }
          var nextRight = getBoundedLiveRightEdge(lengthOverride);
          if (nextRight === null) {
            return false;
          }
          var span = Math.max(1, previousRange.to - previousRange.from);
          var nextFrom = nextRight - span;
          if (!isFinite(nextFrom)) {
            return false;
          }
          liveRightEdgeClampActive = true;
          chart.timeScale().setVisibleLogicalRange({
            from: nextFrom,
            to: nextRight,
          });
          setTimeout(function() {
            liveRightEdgeClampActive = false;
          }, 0);
          return true;
        } catch (_e) {
          liveRightEdgeClampActive = false;
          return false;
        }
      }

      function findRawSeriesTimeIndex(data, time) {
        if (!data || typeof time !== 'number' || !isFinite(time)) return -1;
        for (var i = 0; i < data.length; i += 1) {
          if (data[i] && data[i].time === time) return i;
        }
        return -1;
      }

      function clampSeriesIndex(index, length) {
        if (!(length > 0)) return 0;
        return Math.max(0, Math.min(length - 1, index));
      }

      function restorePrependedHistoryViewport(previousData, nextData, previousRange) {
        try {
          if (!chart || !chart.timeScale || !previousRange) return false;
          if (!previousData || !nextData || previousData.length === 0 || nextData.length === 0) return false;

          var previousFirst = previousData[0] && previousData[0].time;
          var nextFirst = nextData[0] && nextData[0].time;
          if (
            typeof previousFirst !== 'number' ||
            typeof nextFirst !== 'number' ||
            !(nextFirst < previousFirst)
          ) {
            return false;
          }

          var previousVisibleFromIndex = clampSeriesIndex(Math.floor(previousRange.from), previousData.length);
          var previousVisibleToIndex = clampSeriesIndex(Math.ceil(previousRange.to), previousData.length);
          var previousVisibleFromTime = previousData[previousVisibleFromIndex] && previousData[previousVisibleFromIndex].time;
          var previousVisibleToTime = previousData[previousVisibleToIndex] && previousData[previousVisibleToIndex].time;
          var nextVisibleFromIndex = findRawSeriesTimeIndex(nextData, previousVisibleFromTime);
          var nextVisibleToIndex = findRawSeriesTimeIndex(nextData, previousVisibleToTime);
          var shiftedBy = nextVisibleFromIndex - previousVisibleFromIndex;
          if (
            typeof previousVisibleFromTime !== 'number' ||
            typeof previousVisibleToTime !== 'number' ||
            !(shiftedBy > 0) ||
            nextVisibleToIndex < nextVisibleFromIndex
          ) {
            return false;
          }

          if (typeof chart.timeScale().setVisibleLogicalRange === 'function') {
            chart.timeScale().setVisibleLogicalRange({
              from: previousRange.from + shiftedBy,
              to: previousRange.to + shiftedBy,
            });
            return true;
          }

          if (typeof chart.timeScale().setVisibleRange === 'function') {
            if (previousVisibleFromTime <= previousVisibleToTime) {
              chart.timeScale().setVisibleRange({ from: previousVisibleFromTime, to: previousVisibleToTime });
              return true;
            }
          }
        } catch (_e) {}
        return false;
      }

      function shouldResetViewportForSeriesReplacement(previousData, nextData) {
        if (!previousData || !nextData || previousData.length === 0 || nextData.length === 0) {
          return false;
        }
        var previousFirst = previousData[0] && previousData[0].time;
        var previousLast = previousData[previousData.length - 1] && previousData[previousData.length - 1].time;
        var nextFirst = nextData[0] && nextData[0].time;
        var nextLast = nextData[nextData.length - 1] && nextData[nextData.length - 1].time;
        if (
          typeof previousFirst !== 'number' ||
          typeof previousLast !== 'number' ||
          typeof nextFirst !== 'number' ||
          typeof nextLast !== 'number'
        ) {
          return false;
        }
        return nextData.length < previousData.length || nextFirst !== previousFirst || nextLast < previousLast;
      }

      function shouldPaginateForVisibleLogicalRange(range) {
        if (!range || typeof range.from !== 'number' || !isFinite(range.from)) return false;
        var visibleSpan =
          typeof range.to === 'number' && isFinite(range.to)
            ? Math.max(1, range.to - range.from)
            : getRecentVisibleBars(currentSeriesLength);
        var leftPrefetchBars = Math.max(
          HISTORY_PAGINATION_MIN_LEFT_BARS,
          Math.min(
            HISTORY_PAGINATION_MAX_LEFT_BARS,
            Math.ceil(visibleSpan * HISTORY_PAGINATION_VIEWPORT_MULTIPLIER),
          ),
        );
        return range.from <= leftPrefetchBars;
      }

      window.__rtx5ApplyRecentViewport = applyRecentViewport;
      window.__rtx5ResetTimeScale = resetTimeScaleDefaults;
      window.__rtx5ClampLiveRightEdge = clampVisibleLogicalRangeToLiveEdge;
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
            return new Date(Date.UTC(time.year, time.month - 1, time.day));
          }

          if (
            time.businessDay &&
            typeof time.businessDay === 'object' &&
            typeof time.businessDay.year === 'number' &&
            typeof time.businessDay.month === 'number' &&
            typeof time.businessDay.day === 'number'
          ) {
            return new Date(Date.UTC(time.businessDay.year, time.businessDay.month - 1, time.businessDay.day));
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
          var day = String(date.getUTCDate()).padStart(2, '0');
          var month = months[date.getUTCMonth()] || '';
          var hours = String(date.getUTCHours()).padStart(2, '0');
          var minutes = String(date.getUTCMinutes()).padStart(2, '0');

          if (tickMarkType === 3 || tickMarkType === 4) {
            return day + ' ' + month + ' ' + hours + ':' + minutes;
          }

          if (tickMarkType === 2) {
            return day + ' ' + month;
          }

          if (tickMarkType === 1) {
            return month + ' ' + String(date.getUTCFullYear());
          }

          if (tickMarkType === 0) {
            return String(date.getUTCFullYear());
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
        if (!opts) {
          opts = {};
        }
        opts.rightPriceScale = Object.assign({}, opts.rightPriceScale || {}, {
          visible: true,
          entireTextOnly: false,
          minimumWidth: ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH},
        });
        return opts || {};
      }

      function resolveChartBackgroundColor(opts) {
        try {
          var background = opts && opts.layout ? opts.layout.background : null;
          if (background && typeof background.color === 'string') {
            return background.color;
          }
          if (typeof background === 'string') {
            return background;
          }
        } catch (_e) {}
        return '#FFFFFF';
      }

      function makeChartCanvasBackgroundTransparent(opts) {
        if (!opts) {
          opts = {};
        }
        if (!opts.layout) {
          opts.layout = {};
        }
        opts.layout.background = { type: 'solid', color: 'transparent' };
        return opts;
      }

      function getHiddenCrosshairOptions() {
        var hiddenMode = 2;
        try {
          if (
            typeof LightweightCharts !== 'undefined' &&
            LightweightCharts.CrosshairMode &&
            typeof LightweightCharts.CrosshairMode.Hidden === 'number'
          ) {
            hiddenMode = LightweightCharts.CrosshairMode.Hidden;
          }
        } catch (_e) {}

        return {
          mode: hiddenMode,
          vertLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
          horzLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
        };
      }

      function hideChartCrosshairOptions(opts) {
        if (!opts) {
          opts = {};
        }

        var hidden = getHiddenCrosshairOptions();
        var current = opts.crosshair || {};
        opts.crosshair = {
          mode: hidden.mode,
          vertLine: Object.assign({}, current.vertLine || {}, hidden.vertLine),
          horzLine: Object.assign({}, current.horzLine || {}, hidden.horzLine),
        };
        return opts;
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

      function _doInitChart(opts, chartType, data, displayDecimals, showLowerPane, initSignature, configSig) {
        var resolvedInitSignature = typeof initSignature === 'string' ? initSignature : '';
        var resolvedConfigSig = typeof configSig === 'string' ? configSig : '';
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
            initSignature: resolvedInitSignature,
            configSig: resolvedConfigSig,
          };
          requestAnimationFrame(function() {
            if (_pendingInit) {
              _doInitChart(
                _pendingInit.opts,
                _pendingInit.chartType,
                _pendingInit.data,
                _pendingInit.displayDecimals,
                _pendingInit.showLowerPane,
                _pendingInit.initSignature,
                _pendingInit.configSig
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
        clearMovingVerticalGrid();
        clearChartAxisDividers();
        if (chart) {
          try { chart.remove(); } catch (_e) {}
          chart = null;
          series = null;
          moveBarsSeries = null;
          bidPriceLine = null;
          askPriceLine = null;
          marketPriceLineRefs = [];
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
        overlayPriceScaleLockForceAutoScale = false;
        if (priceScaleHealthRaf) {
          try { cancelAnimationFrame(priceScaleHealthRaf); } catch (_) {}
          priceScaleHealthRaf = 0;
        }
        if (rightPriceScaleLayoutRecoveryRaf) {
          try { cancelAnimationFrame(rightPriceScaleLayoutRecoveryRaf); } catch (_) {}
          rightPriceScaleLayoutRecoveryRaf = 0;
        }
        clearRightPriceScaleFallbackLayer();
        clearActiveScrollPriceScaleRecovery();
        if (visibleRangeIdleTimer !== null) {
          try { clearTimeout(visibleRangeIdleTimer); } catch (_) {}
          visibleRangeIdleTimer = null;
        }
        pendingTick = null;
        lastBarTime = 0;
        _liveBar = null;
        _liveBarHasObservedRealtimeUpdate = false;
        seriesType = chartType || 'candles';
        shouldShowLowerPane = showLowerPane !== false;
        lastInitSignature = resolvedInitSignature;
        lastInitConfigSig = resolvedConfigSig;
        lastDisplayDecimals =
          typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
            ? displayDecimals
            : 2;
        lastRawSeriesData = sanitizeSeriesData(data);
        chartReadyPostGeneration += 1;
        var readyGeneration = chartReadyPostGeneration;
        var readyInitSignature = lastInitSignature;
        var readyConfigSig = lastInitConfigSig;

        var safeOpts = applyChartLayout(cloneSerializableValue(opts || {}, {}));
        var chartBackgroundColor = resolveChartBackgroundColor(safeOpts);
        lastChartBackgroundColor = chartBackgroundColor;
        lastChartTextColor = resolveChartTextColor(safeOpts);
        try {
          document.body.style.background = chartBackgroundColor;
          el.style.background = 'transparent';
        } catch (_bgErr) {}
        safeOpts = hideChartCrosshairOptions(makeChartCanvasBackgroundTransparent(safeOpts));
        var customCols = safeOpts.customColors;
        var customCrosshairConfig = safeOpts.customCrosshair || {};
        applyMovingVerticalGridColor(customCols && customCols.grid);
        applyChartAxisDividerColor(customCols && customCols.axisDivider);
        if (safeOpts.customColors) { delete safeOpts.customColors; }
        if (safeOpts.customCrosshair) { delete safeOpts.customCrosshair; }
        if (!safeOpts.timeScale) {
          safeOpts.timeScale = {};
        }
        safeOpts.timeScale.fixLeftEdge = ${CHART_TIME_SCALE_FIX_LEFT_EDGE};
        safeOpts.timeScale.fixRightEdge = ${CHART_TIME_SCALE_FIX_RIGHT_EDGE};
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
            var d = String(date.getUTCDate()).padStart(2, '0');
            var m = months[date.getUTCMonth()] || '';
            var hh = String(date.getUTCHours()).padStart(2, '0');
            var mm = String(date.getUTCMinutes()).padStart(2, '0');
            return d + ' ' + m + ' ' + hh + ':' + mm;
          } catch (_e) {
            return '';
          }
        };

        // Force explicit pixel dimensions so the chart never renders at 0x0
        safeOpts.width = w;
        safeOpts.height = h;

        chart = LightweightCharts.createChart(el, safeOpts);
        try {
          chart.applyOptions({ crosshair: getHiddenCrosshairOptions() });
        } catch (_hideCrosshairErr) {}
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
              if (clampVisibleLogicalRangeToLiveEdge(range)) {
                return;
              }
              scheduleMovingVerticalGridUpdate();
              scheduleActiveScrollPriceScaleRecovery('visible_range_active');
              scheduleVisibleRangeIdleWork();
              if (shouldPaginateForVisibleLogicalRange(range)) {
                var now = Date.now();
                if (now - lastPaginateTime > HISTORY_PAGINATION_DEBOUNCE_MS) {
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
            crosshairMarkerVisible: false,
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
          detachMarketPriceLineRefsAfterSeriesReset();
          currentSeriesLength = mapped.length;
          lastBarTime = mapped[mapped.length - 1].time;
          schedulePriceScaleHealthCheck('init_data', false);
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
            if (window._drawingManager && typeof window._drawingManager.setCrosshairConfig === 'function') {
              window._drawingManager.setCrosshairConfig(Object.assign({}, customCrosshairConfig, {
                upColor: colors.up,
                downColor: colors.down,
              }));
            }
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
        postChartReadyWhenPriceScaleHealthy('init_ready', 0, readyGeneration, readyInitSignature, readyConfigSig);
      }

      function initChart(opts, chartType, data, displayDecimals, showLowerPane, initSignature, configSig) {
        try {
          var requestHostOptions = cloneSerializableValue(opts || {}, {});
          var requestChartType = chartType || 'candles';
          var requestShowLowerPane = showLowerPane !== false;
          var requestDisplayDecimals = lastRequestedDisplayDecimals;
          var requestInitSignature = typeof initSignature === 'string' ? initSignature : '';
          var requestConfigSig = typeof configSig === 'string' ? configSig : '';
          lastInitHostOptions = requestHostOptions;
          lastInitChartType = requestChartType;
          lastInitShowLowerPane = requestShowLowerPane;
          lastInitSignature = requestInitSignature;
          lastInitConfigSig = requestConfigSig;
          if (typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0) {
            requestDisplayDecimals = displayDecimals;
            lastRequestedDisplayDecimals = displayDecimals;
          }

          // Set body/container background to match chart — prevents
          // white-on-white invisibility in light theme.
          try {
            var bg = (opts && opts.layout && opts.layout.background && opts.layout.background.color) || '#000';
            document.body.style.background = bg;
            document.getElementById('chart').style.background = 'transparent';
          } catch(_) {}

          // Defer to requestAnimationFrame so the browser completes layout
          // before we measure the container. This is the core fix for the
          // "light theme first load" bug — on Android, the WebView container
          // has 0x0 dimensions until the first paint cycle completes.
          requestAnimationFrame(function() {
            try {
              _doInitChart(
                requestHostOptions,
                requestChartType,
                Array.isArray(data) ? data.slice() : [],
                requestDisplayDecimals,
                requestShowLowerPane,
                requestInitSignature,
                requestConfigSig
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
              _pendingInit.showLowerPane,
              _pendingInit.initSignature,
              _pendingInit.configSig
            );
            return;
          }

          if (chart) {
            chart.resize(w, h);
            ensureMoveBarsSeries(lastDisplayDecimals);
            schedulePriceScaleHealthCheck('resize', false);
            scheduleRightPriceScaleLayoutRecovery('resize', 4);
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
              _pendingInit.showLowerPane,
              _pendingInit.initSignature,
              _pendingInit.configSig
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
                lastInitShowLowerPane,
                lastInitSignature,
                lastInitConfigSig
              );
            }
            return;
          }

          chart.resize(w, h);
          ensureMoveBarsSeries(lastDisplayDecimals);

          if (lastRawSeriesData && lastRawSeriesData.length > 0) {
            var mapped = mapForSeries(lastRawSeriesData);
            if (mapped && mapped.length > 0) {
              clearMarketPriceLineRefs();
              series.setData(mapped);
              currentSeriesLength = mapped.length;
              lastBarTime = mapped[mapped.length - 1].time;
              schedulePriceScaleHealthCheck('recover_data', false);

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
          scheduleRightPriceScaleLayoutRecovery('recover_surface', RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS);
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
                _pendingInit.showLowerPane,
                _pendingInit.initSignature,
                _pendingInit.configSig
              );
            } else if (chart) {
              // Chart exists — just resize it to match.
              try {
                chart.resize(w, h);
                ensureMoveBarsSeries(lastDisplayDecimals);
                schedulePriceScaleHealthCheck('resize_observer', false);
                scheduleRightPriceScaleLayoutRecovery('resize_observer', 4);
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

      function resolvePrimaryPriceScaleMargins(hasLowerPane) {
        return {
          top: 0,
          bottom: hasLowerPane ? 0.34 : 0,
        };
      }

      function setPrimaryPriceScaleMargins(hasLowerPane) {
        if (!chart || typeof chart.priceScale !== 'function') return;
        try {
          chart.priceScale('right').applyOptions({
            visible: true,
            entireTextOnly: false,
            minimumWidth: ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH},
            scaleMargins: resolvePrimaryPriceScaleMargins(hasLowerPane),
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
            visible: false,
            ticksVisible: false,
            borderVisible: false,
            entireTextOnly: false,
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

      var RAW_SERIES_SAME_BUCKET_RANGE_MULTIPLE = 10;
      var RAW_SERIES_SAME_BUCKET_RELATIVE_TOLERANCE = 0.02;
      var RAW_SERIES_REGIME_RANGE_MULTIPLE = 10;
      var RAW_SERIES_REGIME_RELATIVE_TOLERANCE = 0.2;
      var RAW_SERIES_INTERNAL_RANGE_MULTIPLE = 10;
      var RAW_SERIES_INTERNAL_RELATIVE_TOLERANCE = 0.2;
      var RAW_SERIES_CONTIGUOUS_TIME_TOLERANCE_MULTIPLE = 1.5;
      var RAW_SERIES_MAX_ISOLATED_OUTLIER_RUN = 5;

      function getRawSeriesBounds(item) {
        return {
          high: Math.max(item.open, item.high, item.low, item.close),
          low: Math.min(item.open, item.high, item.low, item.close),
        };
      }

      function getRawSeriesReferencePrice(item) {
        return Math.max(Math.abs(item.close), Math.abs(item.open), 1);
      }

      function isPriceCoherentWithRawSeriesDatum(item, price, rangeMultiple, relativeTolerance) {
        if (!isFiniteNumber(price)) {
          return false;
        }

        var bounds = getRawSeriesBounds(item);
        if (price >= bounds.low && price <= bounds.high) {
          return true;
        }

        var range = Math.max(0, bounds.high - bounds.low);
        var distance = price < bounds.low ? bounds.low - price : price - bounds.high;
        var toleratedDistance = Math.max(range * rangeMultiple, getRawSeriesReferencePrice(item) * relativeTolerance);
        return distance <= toleratedDistance;
      }

      function areRawSeriesDataPriceCoherent(left, right, rangeMultiple, relativeTolerance) {
        var leftBounds = getRawSeriesBounds(left);
        var rightBounds = getRawSeriesBounds(right);
        if (leftBounds.low <= rightBounds.high && rightBounds.low <= leftBounds.high) {
          return true;
        }

        return (
          isPriceCoherentWithRawSeriesDatum(left, right.open, rangeMultiple, relativeTolerance) ||
          isPriceCoherentWithRawSeriesDatum(left, right.close, rangeMultiple, relativeTolerance) ||
          isPriceCoherentWithRawSeriesDatum(right, left.open, rangeMultiple, relativeTolerance) ||
          isPriceCoherentWithRawSeriesDatum(right, left.close, rangeMultiple, relativeTolerance)
        );
      }

      function areRawSeriesDataSameBucketCoherent(left, right) {
        return areRawSeriesDataPriceCoherent(
          left,
          right,
          RAW_SERIES_SAME_BUCKET_RANGE_MULTIPLE,
          RAW_SERIES_SAME_BUCKET_RELATIVE_TOLERANCE
        );
      }

      function areRawSeriesDataRegimesCoherent(left, right) {
        return areRawSeriesDataPriceCoherent(
          left,
          right,
          RAW_SERIES_REGIME_RANGE_MULTIPLE,
          RAW_SERIES_REGIME_RELATIVE_TOLERANCE
        );
      }

      function isRawSeriesDatumInternallyCoherent(item) {
        var values = [item.open, item.high, item.low, item.close];
        for (var i = 0; i < values.length; i++) {
          if (!isFiniteNumber(values[i])) {
            return false;
          }
        }

        values.sort(function(left, right) { return left - right; });
        var reference = Math.max(Math.abs(item.close), Math.abs(item.open), 1);

        var lowClusterRange = Math.max(0, values[2] - values[0]);
        var highOutlierDistance = Math.max(0, values[3] - values[2]);
        var highOutlierTolerance = Math.max(
          lowClusterRange * RAW_SERIES_INTERNAL_RANGE_MULTIPLE,
          reference * RAW_SERIES_INTERNAL_RELATIVE_TOLERANCE
        );
        if (highOutlierDistance > highOutlierTolerance) {
          return false;
        }

        var highClusterRange = Math.max(0, values[3] - values[1]);
        var lowOutlierDistance = Math.max(0, values[1] - values[0]);
        var lowOutlierTolerance = Math.max(
          highClusterRange * RAW_SERIES_INTERNAL_RANGE_MULTIPLE,
          reference * RAW_SERIES_INTERNAL_RELATIVE_TOLERANCE
        );
        return lowOutlierDistance <= lowOutlierTolerance;
      }

      function inferRawSeriesExpectedSeconds(data) {
        var diffs = [];
        for (var i = 1; i < data.length; i++) {
          var diff = data[i].time - data[i - 1].time;
          if (isFiniteNumber(diff) && diff > 0) {
            diffs.push(diff);
          }
        }
        if (diffs.length < 2) {
          return null;
        }
        diffs.sort(function(left, right) { return left - right; });
        return diffs[Math.floor(diffs.length / 2)];
      }

      function isRawSeriesContiguousPair(left, right, expectedSeconds) {
        var delta = right.time - left.time;
        if (!isFiniteNumber(delta) || delta <= 0) {
          return false;
        }
        if (!isFiniteNumber(expectedSeconds) || expectedSeconds <= 0) {
          return false;
        }
        return delta <= expectedSeconds * RAW_SERIES_CONTIGUOUS_TIME_TOLERANCE_MULTIPLE;
      }

      function filterRawSeriesDataByPriceContinuity(data) {
        if (!Array.isArray(data) || data.length <= 1) {
          return Array.isArray(data) ? data.slice() : [];
        }

        var expectedSeconds = inferRawSeriesExpectedSeconds(data);
        var filtered = [data[0]];
        var index = 1;
        while (index < data.length) {
          var previous = filtered[filtered.length - 1];
          var datum = data[index];
          if (
            previous &&
            isRawSeriesContiguousPair(previous, datum, expectedSeconds) &&
            !areRawSeriesDataRegimesCoherent(previous, datum)
          ) {
            var maxAnchorIndex = Math.min(data.length - 1, index + RAW_SERIES_MAX_ISOLATED_OUTLIER_RUN);
            var contiguousRun = true;
            var foundAnchor = false;
            for (var anchorIndex = index + 1; anchorIndex <= maxAnchorIndex; anchorIndex++) {
              var prior = data[anchorIndex - 1];
              var candidateAnchor = data[anchorIndex];
              contiguousRun =
                contiguousRun &&
                isRawSeriesContiguousPair(prior, candidateAnchor, expectedSeconds);
              if (!contiguousRun) {
                break;
              }

              if (areRawSeriesDataRegimesCoherent(previous, candidateAnchor)) {
                filtered.push(candidateAnchor);
                index = anchorIndex + 1;
                foundAnchor = true;
                break;
              }
            }
            if (foundAnchor) {
              continue;
            }
          }

          filtered.push(datum);
          index++;
        }

        return filtered;
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
        if (!areRawSeriesDataSameBucketCoherent(existing, incoming)) {
          return incoming;
        }
        var close = typeof incoming.close === 'number'
          ? incoming.close
          : (typeof incoming.value === 'number' ? incoming.value : existing.close);
        // The host candle stream is already canonical. A duplicate timestamp
        // reaching the WebView should not stitch two OHLC regimes into one
        // giant wick; keep the incoming backend/live bar authoritative.
        var merged = {
          time: existing.time,
          open: typeof incoming.open === 'number' ? incoming.open : existing.open,
          high: typeof incoming.high === 'number' ? incoming.high : Math.max(incoming.open, close),
          low: typeof incoming.low === 'number' ? incoming.low : Math.min(incoming.open, close),
          close: close,
          volume: typeof incoming.volume === 'number'
            ? incoming.volume
            : (typeof existing.volume === 'number' ? existing.volume : 0),
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
          var previousRawSeriesData = lastRawSeriesData && lastRawSeriesData.length > 0
            ? lastRawSeriesData.slice()
            : [];
          var previousVisibleLogicalRange = getVisibleLogicalRangeSnapshot();
          lastRawSeriesData = sanitizeSeriesData(data);
          try {
            chartDebugLog('[WEBVIEW-CANDLE] updateChartData', {
              count: lastRawSeriesData.length,
              firstTime: lastRawSeriesData[0] ? lastRawSeriesData[0].time : null,
              lastTime: lastRawSeriesData[lastRawSeriesData.length - 1] ? lastRawSeriesData[lastRawSeriesData.length - 1].time : null,
            });
          } catch (_logErr) {}
          var mapped = mapForSeries(lastRawSeriesData);
          currentSeriesLength = mapped.length;
          clearMarketPriceLineRefs();
          series.setData(mapped);
          if (window._drawingManager && typeof window._drawingManager.refreshCrosshairData === 'function') {
            try { window._drawingManager.refreshCrosshairData(); } catch (_crosshairRefreshErr) {}
          }
          var didPrependHistory =
            previousRawSeriesData.length > 0 &&
            lastRawSeriesData.length > 0 &&
            lastRawSeriesData[0] &&
            previousRawSeriesData[0] &&
            typeof lastRawSeriesData[0].time === 'number' &&
            typeof previousRawSeriesData[0].time === 'number' &&
            lastRawSeriesData[0].time < previousRawSeriesData[0].time;
          var didReplaceVisibleSeries =
            !didPrependHistory &&
            shouldResetViewportForSeriesReplacement(previousRawSeriesData, lastRawSeriesData);
          var restoredPrependedViewport = restorePrependedHistoryViewport(
            previousRawSeriesData,
            lastRawSeriesData,
            previousVisibleLogicalRange
          );
          if (
            !restoredPrependedViewport &&
            mapped.length > 0 &&
            (previousRawSeriesData.length === 0 || didReplaceVisibleSeries)
          ) {
            applyRecentViewport(mapped.length);
          }
          var priceScaleReason = didPrependHistory
            ? 'update_data_prepend_history'
            : (didReplaceVisibleSeries ? 'update_data_replace_series' : 'update_data');
          schedulePriceScaleHealthCheck(
            priceScaleReason,
            didPrependHistory || didReplaceVisibleSeries,
            didPrependHistory || didReplaceVisibleSeries ? 5 : 1
          );
          scheduleRightPriceScaleLayoutRecovery(
            priceScaleReason,
            didPrependHistory || didReplaceVisibleSeries ? RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS : 3
          );
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
            chartDebugLog('[WEBVIEW-CANDLE] applyTickUpdate_rejected', {
              reason: 'stale_tick',
              tickTime: tick.time,
              lastBarTime: lastBarTime,
            });
          } catch (_logErr) {}
          return;
        }
        var previousSeriesLength = currentSeriesLength;
        var previousVisibleRange = getVisibleLogicalRangeSnapshot();
        var normalizedTick = upsertRawSeriesDatum(tick);
        if (!normalizedTick) {
          try {
            chartDebugLog('[WEBVIEW-CANDLE] applyTickUpdate_rejected', {
              reason: 'invalid_or_old_tick',
              tickTime: tick.time,
              lastBarTime: lastBarTime,
            });
          } catch (_logErr) {}
          return;
        }
        var appendedNewBar = currentSeriesLength === 0 || normalizedTick.time > lastBarTime;
        var shouldFollowLiveEdge = appendedNewBar && shouldFollowLiveRightEdge(previousVisibleRange, previousSeriesLength);
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
          chartDebugLog('[WEBVIEW-CANDLE] applyTickUpdate', {
            time: normalizedTick.time,
            appended: appendedNewBar,
            count: lastRawSeriesData.length,
          });
        } catch (_logErr) {}
        series.update(bar);
        if (window._drawingManager && typeof window._drawingManager.refreshCrosshairData === 'function') {
          try { window._drawingManager.refreshCrosshairData(); } catch (_crosshairRefreshErr) {}
        }
        schedulePriceScaleHealthCheck('tick_update', false);
        currentSeriesLength = lastRawSeriesData.length;
        if (shouldFollowLiveEdge) {
          followLiveRightEdge(previousVisibleRange, currentSeriesLength);
        }
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
          chartDebugLog('[WEBVIEW-CANDLE] updateTick_queued', { time: tick.time });
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

      function pickLiveSignedMoveValue() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return 0;
        }
        return _liveBar.close - _liveBar.open;
      }

      function makeMoveDirectionPriceLineOptions() {
        var color = pickLivePriceColor();
        return {
          price: pickLiveMoveValue(),
          color: color,
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
          axisLabelVisible: false,
          title: '',
        };
      }

      // Create the move-bars pane's direction line the first time we have a
      // live bar. Scoped to the move-bars series so it renders on the move
      // price scale ('move'), not the main candle scale.
      function ensureMoveDirectionPriceLine() {
        try {
          if (moveDirectionPriceLine || !moveBarsSeries) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          moveDirectionPriceLine = moveBarsSeries.createPriceLine(makeMoveDirectionPriceLineOptions());
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
          moveDirectionPriceLine.applyOptions(makeMoveDirectionPriceLineOptions());
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      function trackMarketPriceLine(line) {
        if (line && marketPriceLineRefs.indexOf(line) === -1) {
          marketPriceLineRefs.push(line);
        }
        return line;
      }

      function forgetMarketPriceLine(line) {
        if (!line || marketPriceLineRefs.length === 0) return;
        var next = [];
        for (var i = 0; i < marketPriceLineRefs.length; i++) {
          if (marketPriceLineRefs[i] !== line) {
            next.push(marketPriceLineRefs[i]);
          }
        }
        marketPriceLineRefs = next;
      }

      function removeMarketPriceLine(line) {
        if (!line) return null;
        if (series) {
          try { series.removePriceLine(line); } catch (_e) {}
        }
        forgetMarketPriceLine(line);
        return null;
      }

      function clearMarketPriceLineRefs() {
        if (series) {
          for (var i = 0; i < marketPriceLineRefs.length; i++) {
            try { series.removePriceLine(marketPriceLineRefs[i]); } catch (_e) {}
          }
        }
        marketPriceLineRefs = [];
        bidPriceLine = null;
        askPriceLine = null;
      }

      function detachMarketPriceLineRefsAfterSeriesReset() {
        marketPriceLineRefs = [];
        bidPriceLine = null;
        askPriceLine = null;
      }

      function makeMarketPriceLineOptions(price, color) {
        return {
          price: price,
          color: color,
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
          lineVisible: true,
          axisLabelVisible: false,
          title: '',
        };
      }

      function createMarketPriceLine(price, color) {
        if (!series) return null;
        return trackMarketPriceLine(series.createPriceLine(makeMarketPriceLineOptions(price, color)));
      }

      function normalizeMarketPriceLinePrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        var configuredDecimals = resolveRightPriceScaleFallbackConfiguredDecimals();
        var safeDecimals =
          typeof configuredDecimals === 'number' && isFinite(configuredDecimals)
            ? Math.max(0, Math.min(10, Math.round(configuredDecimals)))
            : resolveOverlayDisplayDecimals();
        return Number(price.toFixed(safeDecimals));
      }

      function setBidPriceLine(price, shouldScheduleRefresh) {
        try {
          var normalizedPrice = normalizeMarketPriceLinePrice(price);
          if (shouldScheduleRefresh !== false) {
            lastBidPrice = normalizedPrice;
            marketPriceLinesVisible =
              lastBidPrice !== null ||
              (typeof lastAskPrice === 'number' && isFinite(lastAskPrice) && lastAskPrice > 0);
          }
          if (!series) return;
          if (normalizedPrice === null) {
            bidPriceLine = removeMarketPriceLine(bidPriceLine);
            if (shouldScheduleRefresh !== false) scheduleOverlayDomRefresh();
            return;
          }
          if (bidPriceLine) {
            try {
              bidPriceLine.applyOptions(makeMarketPriceLineOptions(normalizedPrice, marketBidColor));
              if (shouldScheduleRefresh !== false) scheduleOverlayDomRefresh();
              return;
            } catch (_e) {
              bidPriceLine = removeMarketPriceLine(bidPriceLine);
            }
          }
          bidPriceLine = removeMarketPriceLine(bidPriceLine);
          bidPriceLine = createMarketPriceLine(normalizedPrice, marketBidColor);
          if (shouldScheduleRefresh !== false) scheduleOverlayDomRefresh();
        } catch (e) {
          postError('setBidPriceLine', e);
        }
      }

      function setAskPriceLine(price, shouldScheduleRefresh) {
        try {
          var normalizedPrice = normalizeMarketPriceLinePrice(price);
          if (shouldScheduleRefresh !== false) {
            lastAskPrice = normalizedPrice;
            marketPriceLinesVisible =
              (typeof lastBidPrice === 'number' && isFinite(lastBidPrice) && lastBidPrice > 0) ||
              lastAskPrice !== null;
          }
          if (!series) return;
          if (normalizedPrice === null) {
            askPriceLine = removeMarketPriceLine(askPriceLine);
            if (shouldScheduleRefresh !== false) scheduleOverlayDomRefresh();
            return;
          }
          if (askPriceLine) {
            try {
              askPriceLine.applyOptions(makeMarketPriceLineOptions(normalizedPrice, marketAskColor));
              if (shouldScheduleRefresh !== false) scheduleOverlayDomRefresh();
              return;
            } catch (_e) {
              askPriceLine = removeMarketPriceLine(askPriceLine);
            }
          }
          askPriceLine = removeMarketPriceLine(askPriceLine);
          askPriceLine = createMarketPriceLine(normalizedPrice, marketAskColor);
          if (shouldScheduleRefresh !== false) scheduleOverlayDomRefresh();
        } catch (e) {
          postError('setAskPriceLine', e);
        }
      }

      function setMarketPriceLines(bid, ask) {
        var normalizedBid = normalizeMarketPriceLinePrice(bid);
        var normalizedAsk = normalizeMarketPriceLinePrice(ask);
        var hasBid = normalizedBid !== null;
        var hasAsk = normalizedAsk !== null;
        lastBidPrice = normalizedBid;
        lastAskPrice = normalizedAsk;
        marketPriceLinesVisible = hasBid || hasAsk;
        if (marketPriceLinesVisible && directionPriceLine && series) {
          try { series.removePriceLine(directionPriceLine); } catch (_e) {}
          directionPriceLine = null;
        }
        clearMarketPriceLineRefs();
        if (hasBid) {
          setBidPriceLine(normalizedBid, false);
        } else {
          bidPriceLine = removeMarketPriceLine(bidPriceLine);
        }
        if (hasAsk) {
          setAskPriceLine(normalizedAsk, false);
        } else {
          askPriceLine = removeMarketPriceLine(askPriceLine);
        }
        ensureMarketPriceBadgesVisible();
        scheduleOverlayDomRefresh();
      }

      // Re-tint the custom BID price line in place when the active candle
      // flips direction mid-bucket (blue when bullish, red when bearish).
      // We intentionally don't touch the candle series' or move-bars' own
      // options — applyOptions on the main series can cause a full redraw
      // of the data, which was blanking history on some rebuilds.
      function refreshBidPriceLineColor() {
        if (!bidPriceLine) return;
        try {
          bidPriceLine.applyOptions({
            color: marketBidColor,
            axisLabelColor: marketBidColor,
            axisLabelVisible: false,
          });
        } catch (_e) {}
      }

      function setDrawingTool(tool, options) {
        if (window._drawingManager && typeof window._drawingManager.setActiveTool === 'function') {
          window._drawingManager.setActiveTool(tool, false, options);
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
      function publishSerializedDrawings() {
        if (window._drawingManager && typeof window._drawingManager.publishDrawingsToHost === 'function') {
          window._drawingManager.publishDrawingsToHost();
        }
      }
      function applyDrawingTextEdit(recordId, text) {
        if (window._drawingManager && typeof window._drawingManager.applyTextRecordEdit === 'function') {
          window._drawingManager.applyTextRecordEdit(recordId, text);
        }
      }
      function cancelDrawingTextEdit(recordId) {
        if (window._drawingManager && typeof window._drawingManager.cancelTextRecordEdit === 'function') {
          window._drawingManager.cancelTextRecordEdit(recordId);
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
        _overlayLabelLayer.className = 'rtx5-overlay-label-layer';
        _overlayLabelLayer.style.position = 'absolute';
        _overlayLabelLayer.style.left = '0';
        _overlayLabelLayer.style.top = '0';
        _overlayLabelLayer.style.right = '0';
        _overlayLabelLayer.style.bottom = '0';
        _overlayLabelLayer.style.pointerEvents = 'none';
        _overlayLabelLayer.style.zIndex = '40';
        el.appendChild(_overlayLabelLayer);
        return _overlayLabelLayer;
      }

      function clearOverlayDomLabels() {
        if (!_overlayLabelLayer) return;
        while (_overlayLabelLayer.firstChild) {
          _overlayLabelLayer.removeChild(_overlayLabelLayer.firstChild);
        }
      }

      function resolveOverlayDisplayDecimals() {
        return typeof lastRequestedDisplayDecimals === 'number' && isFinite(lastRequestedDisplayDecimals)
          ? Math.max(0, Math.min(10, Math.round(lastRequestedDisplayDecimals)))
          : resolveRightPriceScaleFallbackDecimals();
      }

      function roundOverlayDragPrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        var decimals = resolveOverlayDisplayDecimals();
        return Number(price.toFixed(decimals));
      }

      function sanitizeOverlayDragPrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        return price;
      }

      function getOverlayAxisLabelPriceKey(price) {
        var decimals = resolveOverlayDisplayDecimals();
        return Number(price).toFixed(decimals);
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
            axisLabelVisible: false,
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
        var minTop = Math.max(OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING, plotTop + 6);
        var maxTop = Math.max(
          minTop,
          Math.min(layerHeight - OVERLAY_LABEL_LINE_HEIGHT - 1, plotBottom - OVERLAY_LABEL_LINE_HEIGHT - 1)
        );

        return {
          minTop: minTop,
          maxTop: maxTop,
        };
      }

      function clearMarketPriceScaleExtensions(layer) {
        if (!layer || typeof layer.querySelectorAll !== 'function') {
          return;
        }
        var extensions = layer.querySelectorAll('.rtx5-market-price-scale-extension');
        for (var i = 0; i < extensions.length; i++) {
          var extension = extensions[i];
          if (extension && extension.parentNode) {
            extension.parentNode.removeChild(extension);
          }
        }
      }

      function renderMarketPriceScaleExtension(layer, price, color) {
        if (!layer || !series || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        if (typeof series.priceToCoordinate !== 'function') {
          return;
        }
        var y = series.priceToCoordinate(price);
        if (typeof y !== 'number' || !isFinite(y)) {
          return;
        }
        var metrics = resolvePrimaryPaneMetrics();
        var axisLeft = Math.round((metrics.leftAxisWidth || 0) + (metrics.paneWidth || 0));
        var axisWidth = Math.max(0, Math.round(metrics.rightAxisWidth || 0));
        var chartWidth = Math.max(0, Math.round(metrics.chartWidth || layer.clientWidth || 0));
        if (axisWidth <= 0 || chartWidth <= axisLeft) {
          return;
        }

        var extension = document.createElement('div');
        extension.className = 'rtx5-market-price-scale-extension';
        extension.style.position = 'absolute';
        extension.style.left = axisLeft + 'px';
        extension.style.top = Math.round(y) + 'px';
        extension.style.width = Math.min(axisWidth, Math.max(0, chartWidth - axisLeft)) + 'px';
        extension.style.height = MARKET_PRICE_SCALE_EXTENSION_HEIGHT + 'px';
        extension.style.background = color || '#2962FF';
        extension.style.pointerEvents = 'none';
        extension.style.zIndex = '8';
        layer.appendChild(extension);
      }

      function renderMarketPriceScaleExtensions(layer) {
        clearMarketPriceScaleExtensions(layer);
        renderMarketPriceScaleExtension(layer, lastBidPrice, marketBidColor);
        renderMarketPriceScaleExtension(layer, lastAskPrice, marketAskColor);
      }

      function clearMarketPriceScaleBadges(layer) {
        if (!layer || typeof layer.querySelectorAll !== 'function') {
          return;
        }
        var badges = layer.querySelectorAll('.rtx5-market-price-scale-badge');
        for (var i = 0; i < badges.length; i++) {
          var badge = badges[i];
          if (badge && badge.parentNode) {
            badge.parentNode.removeChild(badge);
          }
        }
      }

      function resolveMarketPriceScaleAxisMetrics(layer) {
        var metrics = resolvePrimaryPaneMetrics();
        var chartWidth = Math.max(0, Math.round(metrics.chartWidth || (layer && layer.clientWidth) || 0));
        var axisMetrics = resolveRightPriceScaleFallbackAxisMetrics(Object.assign({}, metrics, {
          chartWidth: chartWidth,
        }));
        var axisLeft = Math.max(0, Math.round(axisMetrics.axisLeft || 0));
        var axisWidth = Math.max(MARKET_PRICE_SCALE_BADGE_MIN_WIDTH, Math.round(axisMetrics.axisWidth || 0));
        if (chartWidth > 0 && axisLeft + axisWidth > chartWidth) {
          axisWidth = Math.max(0, chartWidth - axisLeft);
        }
        if (axisWidth <= 0 || chartWidth <= axisLeft) {
          return null;
        }
        var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
        var plotHeight = Math.max(0, Math.round(metrics.plotHeight || metrics.paneHeight || 0));
        return {
          axisLeft: axisLeft,
          axisWidth: axisWidth,
          chartWidth: chartWidth,
          plotTop: plotTop,
          plotBottom: plotTop + plotHeight,
        };
      }

      function formatMarketPriceScaleBadgeLabel(price) {
        var decimals = resolveOverlayDisplayDecimals();
        return Number(price).toFixed(decimals);
      }

      function collectMarketPriceScaleBadge(layer, axisMetrics, price, color, role) {
        if (!layer || !axisMetrics || !series || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        if (typeof series.priceToCoordinate !== 'function') {
          return null;
        }
        var y = series.priceToCoordinate(price);
        if (typeof y !== 'number' || !isFinite(y)) {
          return null;
        }
        var minTop = axisMetrics.plotTop;
        var maxTop = Math.max(minTop, axisMetrics.plotBottom - MARKET_PRICE_SCALE_BADGE_HEIGHT);
        var desiredTop = Math.round(y - MARKET_PRICE_SCALE_BADGE_HEIGHT / 2);
        return {
          color: color || '#2962FF',
          desiredTop: Math.max(minTop, Math.min(maxTop, desiredTop)),
          price: price,
          role: role,
          top: Math.max(minTop, Math.min(maxTop, desiredTop)),
          y: y,
        };
      }

      function renderMarketPriceScaleBadge(layer, badge, axisMetrics) {
        if (!layer || !badge || !axisMetrics) {
          return;
        }
        var el = document.createElement('div');
        el.className = 'rtx5-market-price-scale-badge rtx5-market-price-scale-badge-' + badge.role;
        el.setAttribute('data-rtx5-role', 'market-price-scale-' + badge.role);
        el.textContent = formatMarketPriceScaleBadgeLabel(badge.price);
        el.style.position = 'absolute';
        el.style.left = axisMetrics.axisLeft + 'px';
        el.style.top = Math.round(badge.top) + 'px';
        el.style.width = axisMetrics.axisWidth + 'px';
        el.style.height = MARKET_PRICE_SCALE_BADGE_HEIGHT + 'px';
        el.style.lineHeight = MARKET_PRICE_SCALE_BADGE_HEIGHT + 'px';
        el.style.boxSizing = 'border-box';
        el.style.padding = '0 ' + MARKET_PRICE_SCALE_BADGE_PADDING_X + 'px';
        el.style.background = badge.color;
        el.style.color = '#FFFFFF';
        el.style.borderRadius = '2px';
        el.style.fontSize = '12px';
        el.style.fontWeight = '700';
        el.style.fontVariantNumeric = 'tabular-nums';
        el.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
        el.style.textAlign = 'right';
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '14';
        layer.appendChild(el);
      }

      function renderMarketPriceScaleBadges(layer) {
        clearMarketPriceScaleBadges(layer);
        var axisMetrics = resolveMarketPriceScaleAxisMetrics(layer);
        if (!axisMetrics) {
          return;
        }
        var badges = [
          collectMarketPriceScaleBadge(layer, axisMetrics, lastBidPrice, marketBidColor, 'bid'),
          collectMarketPriceScaleBadge(layer, axisMetrics, lastAskPrice, marketAskColor, 'ask'),
        ].filter(Boolean);
        if (badges.length === 0) {
          return;
        }
        badges.sort(function(left, right) { return left.desiredTop - right.desiredTop; });
        var minTop = axisMetrics.plotTop;
        var maxTop = Math.max(minTop, axisMetrics.plotBottom - MARKET_PRICE_SCALE_BADGE_HEIGHT);
        var step = MARKET_PRICE_SCALE_BADGE_HEIGHT + MARKET_PRICE_SCALE_BADGE_GAP;
        for (var i = 0; i < badges.length; i++) {
          var nextTop = badges[i].desiredTop;
          if (i > 0) {
            nextTop = Math.max(nextTop, badges[i - 1].top + step);
          }
          badges[i].top = Math.max(minTop, Math.min(maxTop, nextTop));
        }
        if (badges.length > 1 && badges[badges.length - 1].top > maxTop) {
          badges[badges.length - 1].top = maxTop;
          for (var backIndex = badges.length - 2; backIndex >= 0; backIndex--) {
            badges[backIndex].top = Math.max(minTop, Math.min(badges[backIndex].top, badges[backIndex + 1].top - step));
          }
        }
        for (var badgeIndex = 0; badgeIndex < badges.length; badgeIndex++) {
          renderMarketPriceScaleBadge(layer, badges[badgeIndex], axisMetrics);
        }
      }

      function formatMoveDirectionOverlayBadgeLabel(value) {
        var decimals =
          typeof lastDisplayDecimals === 'number' && isFinite(lastDisplayDecimals) && lastDisplayDecimals >= 0
            ? Math.min(8, Math.max(0, Math.floor(lastDisplayDecimals)))
            : resolveOverlayDisplayDecimals();
        var rounded = Number(value).toFixed(decimals);
        if (value > 0) {
          return '+' + rounded;
        }
        return rounded;
      }

      function renderMoveDirectionOverlayBadge(layer) {
        if (!layer || !moveBarsSeries || !series || !_liveBar || !shouldUseMoveBarsPane()) {
          return;
        }
        if (typeof moveBarsSeries.priceToCoordinate !== 'function') {
          return;
        }

        var value = pickLiveSignedMoveValue();
        if (typeof value !== 'number' || !isFinite(value)) {
          return;
        }

        // Anchor the highlight at the TOP of the live volume bar (its |close −
        // open| magnitude on the move scale), so the up/down value sits right
        // at the bar it describes in the bottom region — not in the candle area.
        var y = moveBarsSeries.priceToCoordinate(pickLiveMoveValue());
        if (typeof y !== 'number' || !isFinite(y)) {
          return;
        }

        var axisMetrics = resolveMarketPriceScaleAxisMetrics(layer);
        if (!axisMetrics) {
          return;
        }

        // The badge sits ON the right price-scale axis, like the bid/ask
        // badges. Clamp to the FULL pane height (not the 66% candle plot) so it
        // can land in the move/volume region at the bottom of the scale.
        var paneMetrics = resolvePrimaryPaneMetrics();
        var paneBottom = Math.max(
          axisMetrics.plotBottom,
          Math.round(paneMetrics.paneHeight || 0)
        );
        var minTop = axisMetrics.plotTop;
        var maxTop = Math.max(minTop, paneBottom - MARKET_PRICE_SCALE_BADGE_HEIGHT);
        var top = Math.max(minTop, Math.min(maxTop, Math.round(y - MARKET_PRICE_SCALE_BADGE_HEIGHT / 2)));

        var el = document.createElement('div');
        el.className = 'rtx5-move-overlay-badge';
        el.setAttribute('data-rtx5-role', 'move-overlay-value');
        el.textContent = formatMoveDirectionOverlayBadgeLabel(value);
        el.style.position = 'absolute';
        el.style.left = axisMetrics.axisLeft + 'px';
        el.style.top = top + 'px';
        el.style.width = axisMetrics.axisWidth + 'px';
        el.style.height = MARKET_PRICE_SCALE_BADGE_HEIGHT + 'px';
        el.style.lineHeight = MARKET_PRICE_SCALE_BADGE_HEIGHT + 'px';
        el.style.boxSizing = 'border-box';
        el.style.padding = '0 ' + MARKET_PRICE_SCALE_BADGE_PADDING_X + 'px';
        el.style.background = pickLivePriceColor();
        el.style.color = '#FFFFFF';
        el.style.borderRadius = '2px';
        el.style.fontSize = '12px';
        el.style.fontWeight = '700';
        el.style.fontVariantNumeric = 'tabular-nums';
        el.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
        el.style.textAlign = 'right';
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '14';
        layer.appendChild(el);
      }

      function refreshOverlayDomLabels(payload) {
        try {
          clearOverlayDomLabels();
          if (!series) {
            clearRightPriceScaleFallbackLabels();
            return;
          }
          renderFallbackRightPriceScaleLabels();
          var layer = ensureOverlayLabelLayer();
          if (!layer) return;
          renderMarketPriceScaleExtensions(layer);
          renderMarketPriceScaleBadges(layer);
          renderMoveDirectionOverlayBadge(layer);
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
            if ((typeof ln.dragKey === 'string' && ln.dragKey) || ln.labelPlacement === 'line') {
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

          // MT5-parity: render OUTLINED right-axis price box for each
          // position / pending order / SL / TP line. Live bid/ask native
          // axis labels stay hidden; their filled right-scale badges are
          // painted by renderMarketPriceScaleBadges above. Position
          // labels are drawn as DOM divs here so we can style them with a
          // white background + colored border + colored text — matching the
          // MT5 box style. One box per price level (dedup by tolerance) so
          // stacked positions at the same entry never render a tower of
          // duplicate boxes.
          var POSITION_BOX_ID = /^(open-|order-entry-|order-sl-|order-tp-|sl-|tp-)/;
          var boxDecimals = (typeof lastDisplayDecimals === 'number' && isFinite(lastDisplayDecimals) && lastDisplayDecimals >= 0)
            ? Math.min(8, Math.max(0, Math.floor(lastDisplayDecimals)))
            : 2;
          var seenBoxLevels = [];
          var positionBoxes = [];
          for (var pi = 0; pi < lines.length; pi++) {
            var pln = lines[pi];
            if (!pln || typeof pln.id !== 'string' || !POSITION_BOX_ID.test(pln.id)) continue;
            if (typeof pln.price !== 'number' || !isFinite(pln.price)) continue;
            if (typeof series.priceToCoordinate !== 'function') continue;
            var alreadyShown = false;
            for (var ki = 0; ki < seenBoxLevels.length; ki++) {
              var levelScale = Math.max(Math.abs(seenBoxLevels[ki]), Math.abs(pln.price), 1);
              if (Math.abs(seenBoxLevels[ki] - pln.price) <= levelScale * 1e-4) {
                alreadyShown = true;
                break;
              }
            }
            if (alreadyShown) continue;
            var ry = series.priceToCoordinate(pln.price);
            if (typeof ry !== 'number' || !isFinite(ry)) continue;
            seenBoxLevels.push(pln.price);
            positionBoxes.push({ y: ry, color: pln.color || '#2962FF', price: pln.price });
          }
          for (var bi = 0; bi < positionBoxes.length; bi++) {
            var box = positionBoxes[bi];
            var boxEl = document.createElement('div');
            boxEl.className = 'rtx5-position-price-scale-box';
            boxEl.textContent = box.price.toFixed(boxDecimals);
            boxEl.style.position = 'absolute';
            boxEl.style.right = '2px';
            boxEl.style.top = Math.round(box.y - 9) + 'px';
            boxEl.style.background = '#FFFFFF';
            boxEl.style.color = box.color;
            boxEl.style.border = '1px solid ' + box.color;
            boxEl.style.borderRadius = '2px';
            boxEl.style.fontSize = '11px';
            boxEl.style.fontWeight = '700';
            boxEl.style.padding = '1px 5px';
            boxEl.style.height = '16px';
            boxEl.style.lineHeight = '14px';
            boxEl.style.boxSizing = 'border-box';
            boxEl.style.whiteSpace = 'nowrap';
            boxEl.style.fontVariantNumeric = 'tabular-nums';
            boxEl.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
            layer.appendChild(boxEl);
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
                axisLabelVisible: false,
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
      window.setDrawingTool = setDrawingTool;
      window.clearDrawings = clearDrawings;
      window.setSerializedDrawings = setSerializedDrawings;
      window.publishSerializedDrawings = publishSerializedDrawings;
      window.applyDrawingTextEdit = applyDrawingTextEdit;
      window.cancelDrawingTextEdit = cancelDrawingTextEdit;
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
