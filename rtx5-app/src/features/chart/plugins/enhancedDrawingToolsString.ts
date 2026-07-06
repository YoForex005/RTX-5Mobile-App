import { ENHANCED_DRAWING_TOOLS_RUNTIME_JS } from '../drawingTools/runtime';

export const ENHANCED_DRAWING_TOOLS_JS = `
(function () {
  function safeNotify(type, payload) {
    try {
      if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') return;
      var message = payload && typeof payload === 'object'
        ? Object.assign({ type: type }, payload)
        : { type: type };
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } catch (_error) {}
  }

  function clampNumber(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function getSeriesData(series) {
    try {
      return series && typeof series.data === 'function' ? series.data() : [];
    } catch (_error) {
      return [];
    }
  }

  function getPointTimeValue(point) {
    return point && isFiniteNumber(point.time) ? point.time : null;
  }

  function estimateNumericTimeStep(data) {
    if (!Array.isArray(data) || data.length < 2) {
      return 60;
    }

    for (var i = data.length - 1; i > 0; i -= 1) {
      var current = getPointTimeValue(data[i]);
      var previous = getPointTimeValue(data[i - 1]);
      if (current !== null && previous !== null && current > previous) {
        return current - previous;
      }
    }

    return 60;
  }

  function resolveTimeScaleIndex(timeScale, time, fallback) {
    if (!timeScale || typeof timeScale.timeToIndex !== 'function') {
      return fallback;
    }

    try {
      var index = timeScale.timeToIndex(time, true);
      return isFiniteNumber(index) ? index : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function resolveLogicalFromTime(timeScale, series, time) {
    if (!timeScale) {
      return null;
    }

    var directIndex = resolveTimeScaleIndex(timeScale, time, null);
    var data = getSeriesData(series);
    if (!Array.isArray(data) || data.length === 0) {
      return directIndex;
    }

    var first = data[0];
    var last = data[data.length - 1];
    var firstTime = getPointTimeValue(first);
    var lastTime = getPointTimeValue(last);
    if (firstTime === null || lastTime === null || !isFiniteNumber(time)) {
      return directIndex;
    }

    var firstLogical = resolveTimeScaleIndex(timeScale, first.time, 0);
    var lastLogical = resolveTimeScaleIndex(timeScale, last.time, firstLogical + data.length - 1);
    var step = estimateNumericTimeStep(data);
    if (!isFiniteNumber(step) || step <= 0) {
      step = 60;
    }

    if (time <= firstTime) {
      return firstLogical + ((time - firstTime) / step);
    }

    if (time >= lastTime) {
      return lastLogical + ((time - lastTime) / step);
    }

    for (var i = 1; i < data.length; i += 1) {
      var previous = data[i - 1];
      var current = data[i];
      var previousTime = getPointTimeValue(previous);
      var currentTime = getPointTimeValue(current);
      if (previousTime === null || currentTime === null || currentTime <= previousTime) {
        continue;
      }
      if (time >= previousTime && time <= currentTime) {
        var previousLogical = resolveTimeScaleIndex(timeScale, previous.time, firstLogical + i - 1);
        var currentLogical = resolveTimeScaleIndex(timeScale, current.time, previousLogical + 1);
        var ratio = (time - previousTime) / (currentTime - previousTime);
        return previousLogical + ((currentLogical - previousLogical) * ratio);
      }
    }

    return directIndex;
  }

  function resolveCoordinateFromTime(chart, series, time) {
    if (!chart || typeof chart.timeScale !== 'function') {
      return null;
    }

    var timeScale = chart.timeScale();
    if (!timeScale) {
      return null;
    }

    if (typeof timeScale.timeToCoordinate === 'function') {
      try {
        var direct = timeScale.timeToCoordinate(time);
        if (isFiniteNumber(direct)) {
          return direct;
        }
      } catch (_error) {}
    }

    if (typeof timeScale.logicalToCoordinate === 'function') {
      var logical = resolveLogicalFromTime(timeScale, series, time);
      if (isFiniteNumber(logical)) {
        try {
          var fallback = timeScale.logicalToCoordinate(logical);
          if (isFiniteNumber(fallback)) {
            return fallback;
          }
        } catch (_error) {}
      }
    }

    return null;
  }

  function resolveTimeFromCoordinate(timeScale, series, x) {
    if (!timeScale) {
      return null;
    }

    if (typeof timeScale.coordinateToTime === 'function') {
      try {
        var direct = timeScale.coordinateToTime(x);
        if (direct !== null && direct !== undefined) {
          return direct;
        }
      } catch (_error) {}
    }

    if (typeof timeScale.coordinateToLogical !== 'function') {
      return null;
    }

    var logical = null;
    try {
      logical = timeScale.coordinateToLogical(x);
    } catch (_logicalError) {
      logical = null;
    }

    if (!isFiniteNumber(logical)) {
      return null;
    }

    var data = getSeriesData(series);
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    var first = data[0];
    var last = data[data.length - 1];
    var firstTime = getPointTimeValue(first);
    var lastTime = getPointTimeValue(last);
    if (firstTime === null || lastTime === null) {
      var nearestIndex = Math.max(0, Math.min(data.length - 1, Math.round(logical)));
      return data[nearestIndex] ? data[nearestIndex].time : null;
    }

    var firstLogical = resolveTimeScaleIndex(timeScale, first.time, 0);
    var lastLogical = resolveTimeScaleIndex(timeScale, last.time, firstLogical + data.length - 1);
    var step = estimateNumericTimeStep(data);
    if (!isFiniteNumber(step) || step <= 0) {
      step = 60;
    }

    if (logical <= firstLogical) {
      return Math.round(firstTime + ((logical - firstLogical) * step));
    }

    if (logical >= lastLogical) {
      return Math.round(lastTime + ((logical - lastLogical) * step));
    }

    var offset = logical - firstLogical;
    var lowerIndex = Math.max(0, Math.min(data.length - 1, Math.floor(offset)));
    var upperIndex = Math.max(0, Math.min(data.length - 1, Math.ceil(offset)));
    var lower = data[lowerIndex];
    var upper = data[upperIndex];
    var lowerTime = getPointTimeValue(lower);
    var upperTime = getPointTimeValue(upper);
    if (lowerTime === null || upperTime === null) {
      return lower ? lower.time : null;
    }

    var ratio = offset - lowerIndex;
    return Math.round(lowerTime + ((upperTime - lowerTime) * ratio));
  }

  function formatCrosshairPrice(series, price) {
    var precision = 5;
    try {
      var options = series && typeof series.options === 'function' ? series.options() : null;
      var nextPrecision = options && options.priceFormat && options.priceFormat.precision;
      if (typeof nextPrecision === 'number' && isFinite(nextPrecision) && nextPrecision >= 0) {
        precision = Math.min(8, Math.round(nextPrecision));
      }
    } catch (_error) {}
    return isFiniteNumber(price) ? price.toFixed(precision) : '';
  }

  function normalizeCrosshairTimeframe(timeframe) {
    return String(timeframe || '').trim().toUpperCase();
  }

  function formatCrosshairTime(time, timeframe) {
    if (isFiniteNumber(time)) {
      var date = new Date(time * 1000);
      if (isFinite(date.getTime())) {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var day = String(date.getUTCDate()).padStart(2, '0');
        var hour = String(date.getUTCHours()).padStart(2, '0');
        var minute = String(date.getUTCMinutes()).padStart(2, '0');
        var month = months[date.getUTCMonth()];
        var year = date.getUTCFullYear();
        var tf = normalizeCrosshairTimeframe(timeframe);
        if (tf === '1D' || tf === 'D' || tf === 'DAY') {
          return day + ' ' + month + ' ' + year;
        }
        if (tf === '1W' || tf === 'W' || tf === 'WEEK') {
          return day + ' ' + month + ' ' + year;
        }
        if (tf === '1M' || tf === 'MN' || tf === 'MONTH') {
          return month + ' ' + year;
        }
        if (tf === '1H' || tf === 'H1' || tf === '4H' || tf === 'H4') {
          return day + ' ' + month + ' ' + hour + ':00';
        }
        return day + ' ' + month + ' ' + hour + ':' + minute;
      }
    }

    if (time && typeof time === 'object' && time.year && time.month && time.day) {
      var businessMonth = String(time.month).padStart(2, '0');
      var businessDay = String(time.day).padStart(2, '0');
      var businessFrame = normalizeCrosshairTimeframe(timeframe);
      if (businessFrame === '1M' || businessFrame === 'MN' || businessFrame === 'MONTH') {
        return String(time.year) + '-' + businessMonth;
      }
      return String(time.year) + '-' + businessMonth + '-' + businessDay;
    }

    return String(time || '');
  }

  function timeToComparableValue(time) {
    if (isFiniteNumber(time)) {
      return time;
    }
    if (time && typeof time === 'object' && time.year && time.month && time.day) {
      return (Number(time.year) * 10000) + (Number(time.month) * 100) + Number(time.day);
    }
    return null;
  }

  function formatCrosshairPercent(value) {
    return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  function formatCrosshairVolume(value) {
    if (!isFiniteNumber(value)) {
      return '';
    }
    var abs = Math.abs(value);
    if (abs >= 1000000000) return (value / 1000000000).toFixed(2) + 'B';
    if (abs >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (abs >= 1000) return (value / 1000).toFixed(2) + 'K';
    return String(Math.round(value));
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function formatDuration(seconds) {
    var safe = Math.max(0, Math.round(clampNumber(seconds, 0)));
    if (safe >= 86400) return Math.round(safe / 86400) + 'd';
    if (safe >= 3600) return Math.round(safe / 3600) + 'h';
    if (safe >= 60) return Math.max(1, Math.round(safe / 60)) + 'm';
    return safe + 's';
  }

  function formatDelta(value) {
    var safe = clampNumber(value, 0);
    var abs = Math.abs(safe);
    var digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 5;
    return (safe >= 0 ? '+' : '') + safe.toFixed(digits);
  }

  var ENHANCED_DRAWING_TOOL_SPECS = [];
  var ENHANCED_DRAWING_TOOL_SPECS_BY_KIND = {};

  function registerEnhancedDrawingTool(spec) {
    if (!spec || !spec.kind) return;
    ENHANCED_DRAWING_TOOL_SPECS.push(spec);
    ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[spec.kind] = spec;
  }

  function defaultLabel(kind, index) {
    var spec = ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[kind];
    var name = spec && spec.defaultLabel ? spec.defaultLabel : 'Object';
    return name + ' ' + index;
  }

  function clonePoint(point) {
    var next = {
      time: point.time,
      price: point.price
    };
    if (point.timestamp !== undefined) next.timestamp = point.timestamp;
    if (point.dataIndex !== undefined) next.dataIndex = point.dataIndex;
    if (point.paneId !== undefined) next.paneId = point.paneId;
    return next;
  }

  function clonePoints(points) {
    return Array.isArray(points)
      ? points.map(function (point) { return clonePoint(point); })
      : [];
  }

  function cloneSerializable(value, fallback) {
    if (value === undefined || value === null) return fallback;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return fallback;
    }
  }

  function hasTouchSupport() {
    try {
      return typeof window !== 'undefined' && (
        'ontouchstart' in window ||
        (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0)
      );
    } catch (_error) {
      return false;
    }
  }

  function PrimitiveBase() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  PrimitiveBase.prototype.attached = function (param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    if (typeof this.updateAllViews === 'function') {
      this.updateAllViews();
    }
  };

  PrimitiveBase.prototype.detached = function () {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  };

  PrimitiveBase.prototype.requestUpdate = function () {
    if (typeof this._requestUpdate === 'function') {
      this._requestUpdate();
    }
  };

  Object.defineProperty(PrimitiveBase.prototype, 'chart', {
    get: function () { return this._chart; }
  });

  Object.defineProperty(PrimitiveBase.prototype, 'series', {
    get: function () { return this._series; }
  });

  function createLinePrimitive(p1, p2, options) {
    function resolveLineStyleDash(style, ratio) {
      var px = Math.max(1, ratio || 1);
      if (style === 'dashed') return [8 * px, 5 * px];
      if (style === 'dotted') return [2 * px, 5 * px];
      return [];
    }

    function extendLineSegment(x1, y1, x2, y2, width, height, mode) {
      var start = { x: x1, y: y1 };
      var end = { x: x2, y: y2 };
      var dx = x2 - x1;
      var dy = y2 - y1;
      var extendMode = mode || 'none';
      if (extendMode === 'none' || (!isFiniteNumber(dx)) || (!isFiniteNumber(dy)) || (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001)) {
        return { start: start, end: end };
      }

      if (Math.abs(dx) < 0.001) {
        if (extendMode === 'left' || extendMode === 'both') {
          if (y1 <= y2) start = { x: x1, y: 0 };
          else end = { x: x2, y: 0 };
        }
        if (extendMode === 'right' || extendMode === 'both') {
          if (y1 <= y2) end = { x: x2, y: height };
          else start = { x: x1, y: height };
        }
        return { start: start, end: end };
      }

      function pointAtX(targetX) {
        var ratio = (targetX - x1) / dx;
        return { x: targetX, y: y1 + (dy * ratio) };
      }

      if (extendMode === 'left' || extendMode === 'both') {
        if (x1 <= x2) start = pointAtX(0);
        else end = pointAtX(0);
      }
      if (extendMode === 'right' || extendMode === 'both') {
        if (x1 <= x2) end = pointAtX(width);
        else start = pointAtX(width);
      }
      return { start: start, end: end };
    }

    function LinePaneRenderer(source, points) {
      this._source = source;
      this._points = points;
    }

    LinePaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var p1p = this._points.p1;
      var p2p = this._points.p2;
      if (!source._options.visible || p1p.x === null || p1p.y === null || p2p.x === null || p2p.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var horizontalRatio = scope.horizontalPixelRatio || 1;
        var verticalRatio = scope.verticalPixelRatio || 1;
        var x1 = Math.round(p1p.x * horizontalRatio);
        var y1 = Math.round(p1p.y * verticalRatio);
        var x2 = Math.round(p2p.x * horizontalRatio);
        var y2 = Math.round(p2p.y * verticalRatio);
        var bitmapWidth = scope.bitmapSize && isFiniteNumber(scope.bitmapSize.width) ? scope.bitmapSize.width : Math.max(x1, x2, 1);
        var bitmapHeight = scope.bitmapSize && isFiniteNumber(scope.bitmapSize.height) ? scope.bitmapSize.height : Math.max(y1, y2, 1);
        var lineColor = source._options.selected
          ? source._options.selectedColor
          : (source._options.hovered ? source._options.hoverColor : source._options.color);
        var extended = extendLineSegment(x1, y1, x2, y2, bitmapWidth, bitmapHeight, source._options.extendMode);
        var dash = resolveLineStyleDash(source._options.lineStyle, horizontalRatio);
        ctx.save();
        ctx.globalAlpha = source._options.opacity;
        ctx.lineWidth = source._options.width * horizontalRatio;
        ctx.strokeStyle = lineColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ctx.setLineDash) ctx.setLineDash(dash);
        // Render-time extension changes only the pixels; logical anchors stay stable for pan/zoom/live candle updates.
        ctx.beginPath();
        ctx.moveTo(extended.start.x, extended.start.y);
        ctx.lineTo(extended.end.x, extended.end.y);
        ctx.stroke();

        if (ctx.setLineDash) ctx.setLineDash([]);
        if (source._options.showHandles || source._options.selected || source._options.draft) {
          var handleRadius = (source._options.selected ? source._options.selectedHandleRadius : source._options.handleRadius) * horizontalRatio;
          ctx.fillStyle = source._options.handleFillColor;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = Math.max(1, source._options.handleBorderWidth * horizontalRatio);
          ctx.beginPath();
          ctx.arc(x1, y1, handleRadius, 0, Math.PI * 2);
          ctx.arc(x2, y2, handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        if (source._options.label) {
          var fontSize = Math.round(source._options.fontSize * horizontalRatio);
          ctx.font = '600 ' + fontSize + 'px Arial';
          var padding = 6 * horizontalRatio;
          var textWidth = ctx.measureText(source._options.label).width;
          var lx = x2 + padding;
          var ly = y2 - (source._options.fontSize + padding * 0.35);
          roundRectPath(ctx, lx - padding * 0.65, ly - padding * 0.85, textWidth + padding * 1.3, source._options.fontSize + padding * 1.2, 6 * horizontalRatio);
          ctx.fillStyle = source._options.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = source._options.labelTextColor;
          ctx.fillText(source._options.label, lx, ly + source._options.fontSize * 0.65);
        }
        ctx.restore();
      });
    };

    function LinePaneView(source) {
      this._source = source;
      this._points = { p1: { x: null, y: null }, p2: { x: null, y: null } };
    }

    LinePaneView.prototype.update = function () {
      var series = this._source.series;
      this._points.p1 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      this._points.p2 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time),
        y: series.priceToCoordinate(this._source._p2.price)
      };
    };

    LinePaneView.prototype.renderer = function () {
      return new LinePaneRenderer(this._source, this._points);
    };

    function LinePrimitive(pointA, pointB, opts) {
      PrimitiveBase.call(this);
      this._p1 = pointA;
      this._p2 = pointB;
      this._options = Object.assign({
        color: '#3B82F6',
        selectedColor: '#1D4ED8',
        hoverColor: '#2563EB',
        width: 2,
        visible: true,
        selected: false,
        hovered: false,
        draft: false,
        opacity: 1,
        lineStyle: 'solid',
        extendMode: 'none',
        showHandles: false,
        handleRadius: 4,
        selectedHandleRadius: 5,
        handleBorderWidth: 2,
        handleFillColor: '#FFFFFF',
        label: '',
        fontSize: 11,
        labelBackgroundColor: 'rgba(15, 23, 42, 0.92)',
        labelTextColor: '#FFFFFF'
      }, opts || {});
      this._paneViews = [new LinePaneView(this)];
    }

    LinePrimitive.prototype = Object.create(PrimitiveBase.prototype);
    LinePrimitive.prototype.constructor = LinePrimitive;
    LinePrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    LinePrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    LinePrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setDraft = function (draft) {
      this._options.draft = !!draft;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setOptions = function (options) {
      if (!options || typeof options !== 'object') return;
      this._options = Object.assign({}, this._options, options);
      this.requestUpdate();
    };
    LinePrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = pointA;
      this._p2 = pointB;
      this.requestUpdate();
    };
    LinePrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2]);
    };
    LinePrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      var view = this._paneViews[0];
      return view && view._points
        ? {
            p1: { x: view._points.p1.x, y: view._points.p1.y },
            p2: { x: view._points.p2.x, y: view._points.p2.y }
          }
        : null;
    };
    return new LinePrimitive(p1, p2, options);
  }

  function createPolylinePrimitive(points, options) {
    function PolylinePaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    PolylinePaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var coords = this._coords.filter(function (item) {
        return item.x !== null && item.y !== null;
      });
      if (!source._options.visible || coords.length < 2) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        ctx.save();
        ctx.strokeStyle = source._options.color;
        ctx.lineWidth = source._options.width * scope.horizontalPixelRatio;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        coords.forEach(function (coord, index) {
          var x = coord.x * scope.horizontalPixelRatio;
          var y = coord.y * scope.verticalPixelRatio;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        ctx.fillStyle = source._options.color;
        coords.forEach(function (coord) {
          ctx.beginPath();
          ctx.arc(
            coord.x * scope.horizontalPixelRatio,
            coord.y * scope.verticalPixelRatio,
            2.8 * scope.horizontalPixelRatio,
            0,
            Math.PI * 2
          );
          ctx.fill();
        });

        if (source._options.label) {
          var last = coords[coords.length - 1];
          ctx.font = '600 ' + Math.round(source._options.fontSize * scope.horizontalPixelRatio) + 'px Arial';
          var padding = 6 * scope.horizontalPixelRatio;
          var textWidth = ctx.measureText(source._options.label).width;
          var lx = last.x * scope.horizontalPixelRatio + padding;
          var ly = last.y * scope.verticalPixelRatio - (source._options.fontSize + padding * 0.35);
          roundRectPath(
            ctx,
            lx - padding * 0.65,
            ly - padding * 0.85,
            textWidth + padding * 1.3,
            source._options.fontSize + padding * 1.2,
            6 * scope.horizontalPixelRatio
          );
          ctx.fillStyle = source._options.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = source._options.labelTextColor;
          ctx.fillText(source._options.label, lx, ly + source._options.fontSize * 0.65);
        }

        ctx.restore();
      });
    };

    function PolylinePaneView(source) {
      this._source = source;
      this._coords = [];
    }

    PolylinePaneView.prototype.update = function () {
      var series = this._source.series;
      this._coords = this._source._points.map(function (point) {
        return {
          x: resolveCoordinateFromTime(this._source.chart, series, point.time),
          y: series.priceToCoordinate(point.price)
        };
      }, this);
    };

    PolylinePaneView.prototype.renderer = function () {
      return new PolylinePaneRenderer(this._source, this._coords);
    };

    function PolylinePrimitive(pointList, opts) {
      PrimitiveBase.call(this);
      this._points = pointList.slice();
      this._options = Object.assign({
        color: '#A855F7',
        width: 1.8,
        visible: true,
        label: '',
        fontSize: 11,
        labelBackgroundColor: 'rgba(88, 28, 135, 0.92)',
        labelTextColor: '#F3E8FF'
      }, opts || {});
      this._paneViews = [new PolylinePaneView(this)];
    }

    PolylinePrimitive.prototype = Object.create(PrimitiveBase.prototype);
    PolylinePrimitive.prototype.constructor = PolylinePrimitive;
    PolylinePrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    PolylinePrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    PolylinePrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    return new PolylinePrimitive(points, options);
  }

  function createBoxPrimitive(p1, p2, options) {
    function BoxPaneRenderer(source, points) {
      this._source = source;
      this._points = points;
    }

    BoxPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var p1p = this._points.p1;
      var p2p = this._points.p2;
      if (!source._options.visible || p1p.x === null || p1p.y === null || p2p.x === null || p2p.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var left = Math.min(p1p.x, p2p.x) * scope.horizontalPixelRatio;
        var top = Math.min(p1p.y, p2p.y) * scope.verticalPixelRatio;
        var width = Math.max(1, Math.abs(p2p.x - p1p.x) * scope.horizontalPixelRatio);
        var height = Math.max(1, Math.abs(p2p.y - p1p.y) * scope.verticalPixelRatio);
        ctx.save();
        ctx.fillStyle = source._options.fillColor;
        ctx.strokeStyle = source._options.borderColor;
        ctx.lineWidth = source._options.borderWidth * scope.horizontalPixelRatio;
        roundRectPath(ctx, left, top, width, height, 6 * scope.horizontalPixelRatio);
        ctx.fill();
        ctx.stroke();
        if (source._options.label) {
          ctx.font = '600 ' + Math.round(source._options.fontSize * scope.horizontalPixelRatio) + 'px Arial';
          var padding = 6 * scope.horizontalPixelRatio;
          var textWidth = ctx.measureText(source._options.label).width;
          var labelWidth = textWidth + padding * 1.4;
          var labelHeight = source._options.fontSize + padding;
          var labelX = left + padding;
          var labelY = top + padding;
          roundRectPath(ctx, labelX, labelY, labelWidth, labelHeight, 5 * scope.horizontalPixelRatio);
          ctx.fillStyle = source._options.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = source._options.labelTextColor;
          ctx.fillText(source._options.label, labelX + padding * 0.7, labelY + labelHeight - padding * 0.5);
        }
        ctx.restore();
      });
    };

    function BoxPaneView(source) {
      this._source = source;
      this._points = { p1: { x: null, y: null }, p2: { x: null, y: null } };
    }

    BoxPaneView.prototype.update = function () {
      var series = this._source.series;
      this._points.p1 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      this._points.p2 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time),
        y: series.priceToCoordinate(this._source._p2.price)
      };
    };

    BoxPaneView.prototype.renderer = function () {
      return new BoxPaneRenderer(this._source, this._points);
    };

    function BoxPrimitive(pointA, pointB, opts) {
      PrimitiveBase.call(this);
      this._p1 = pointA;
      this._p2 = pointB;
      this._options = Object.assign({
        fillColor: 'rgba(59, 130, 246, 0.16)',
        borderColor: '#3B82F6',
        borderWidth: 1.5,
        visible: true,
        label: '',
        fontSize: 11,
        labelBackgroundColor: 'rgba(15, 23, 42, 0.92)',
        labelTextColor: '#FFFFFF'
      }, opts || {});
      this._paneViews = [new BoxPaneView(this)];
    }

    BoxPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    BoxPrimitive.prototype.constructor = BoxPrimitive;
    BoxPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    BoxPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    BoxPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    BoxPrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = pointA;
      this._p2 = pointB;
      this.requestUpdate();
    };
    return new BoxPrimitive(p1, p2, options);
  }

  function createPointLabelPrimitive(point, options) {
    function LabelPaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    LabelPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      if (!source._options.visible || this._coords.x === null || this._coords.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var x = Math.round(source._coords.x * scope.horizontalPixelRatio);
        var y = Math.round(source._coords.y * scope.verticalPixelRatio);
        var fontSize = Math.round(source._options.fontSize * scope.horizontalPixelRatio);
        var padding = 6 * scope.horizontalPixelRatio;
        ctx.save();
        ctx.font = '700 ' + fontSize + 'px Arial';
        var textWidth = ctx.measureText(source._options.text).width;
        var bubbleWidth = textWidth + padding * 1.8;
        var bubbleHeight = fontSize + padding * 1.4;
        var bubbleX = x + 10 * scope.horizontalPixelRatio;
        var bubbleY = y - bubbleHeight - 8 * scope.verticalPixelRatio;
        ctx.fillStyle = source._options.anchorColor;
        ctx.beginPath();
        ctx.arc(x, y, 3 * scope.horizontalPixelRatio, 0, Math.PI * 2);
        ctx.fill();
        roundRectPath(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, 6 * scope.horizontalPixelRatio);
        ctx.fillStyle = source._options.backgroundColor;
        ctx.fill();
        ctx.fillStyle = source._options.textColor;
        ctx.fillText(source._options.text, bubbleX + padding * 0.9, bubbleY + bubbleHeight - padding * 0.55);
        ctx.restore();
      });
    };

    function LabelPaneView(source) {
      this._source = source;
      this._coords = { x: null, y: null };
    }

    LabelPaneView.prototype.update = function () {
      var series = this._source.series;
      this._coords = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._point.time),
        y: series.priceToCoordinate(this._source._point.price)
      };
      this._source._coords = this._coords;
    };

    LabelPaneView.prototype.renderer = function () {
      return new LabelPaneRenderer(this._source, this._coords);
    };

    function PointLabelPrimitive(pointValue, opts) {
      PrimitiveBase.call(this);
      this._point = pointValue;
      this._coords = { x: null, y: null };
      this._options = Object.assign({
        text: 'TXT',
        visible: true,
        fontSize: 11,
        backgroundColor: 'rgba(37, 99, 235, 0.94)',
        textColor: '#FFFFFF',
        anchorColor: '#60A5FA'
      }, opts || {});
      this._paneViews = [new LabelPaneView(this)];
    }

    PointLabelPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    PointLabelPrimitive.prototype.constructor = PointLabelPrimitive;
    PointLabelPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    PointLabelPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    PointLabelPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    return new PointLabelPrimitive(point, options);
  }

  function createPitchforkPrimitive(p1, p2, p3, options) {
    function PitchforkPaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    PitchforkPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var c1 = this._coords.p1;
      var c2 = this._coords.p2;
      var c3 = this._coords.p3;
      if (!source._options.visible || c1.x === null || c1.y === null || c2.x === null || c2.y === null || c3.x === null || c3.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var x1 = c1.x * scope.horizontalPixelRatio;
        var y1 = c1.y * scope.verticalPixelRatio;
        var x2 = c2.x * scope.horizontalPixelRatio;
        var y2 = c2.y * scope.verticalPixelRatio;
        var x3 = c3.x * scope.horizontalPixelRatio;
        var y3 = c3.y * scope.verticalPixelRatio;
        var midX = (x2 + x3) / 2;
        var midY = (y2 + y3) / 2;
        var dx = midX - x1;
        var dy = midY - y1;
        var extend = 2.8;
        ctx.save();
        ctx.strokeStyle = source._options.color;
        ctx.lineWidth = source._options.width * scope.horizontalPixelRatio;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(midX + dx * extend, midY + dy * extend);
        ctx.moveTo(x2 - dx * 0.15, y2 - dy * 0.15);
        ctx.lineTo(x2 + dx * extend, y2 + dy * extend);
        ctx.moveTo(x3 - dx * 0.15, y3 - dy * 0.15);
        ctx.lineTo(x3 + dx * extend, y3 + dy * extend);
        ctx.stroke();
        ctx.fillStyle = source._options.color;
        [ [x1, y1], [x2, y2], [x3, y3] ].forEach(function (pair) {
          ctx.beginPath();
          ctx.arc(pair[0], pair[1], 3 * scope.horizontalPixelRatio, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      });
    };

    function PitchforkPaneView(source) {
      this._source = source;
      this._coords = { p1: { x: null, y: null }, p2: { x: null, y: null }, p3: { x: null, y: null } };
    }

    PitchforkPaneView.prototype.update = function () {
      var series = this._source.series;
      this._coords.p1 = { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time), y: series.priceToCoordinate(this._source._p1.price) };
      this._coords.p2 = { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time), y: series.priceToCoordinate(this._source._p2.price) };
      this._coords.p3 = { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p3.time), y: series.priceToCoordinate(this._source._p3.price) };
    };

    PitchforkPaneView.prototype.renderer = function () {
      return new PitchforkPaneRenderer(this._source, this._coords);
    };

    function PitchforkPrimitive(pointA, pointB, pointC, opts) {
      PrimitiveBase.call(this);
      this._p1 = pointA;
      this._p2 = pointB;
      this._p3 = pointC;
      this._options = Object.assign({ color: '#8B5CF6', width: 1.6, visible: true }, opts || {});
      this._paneViews = [new PitchforkPaneView(this)];
    }

    PitchforkPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    PitchforkPrimitive.prototype.constructor = PitchforkPrimitive;
    PitchforkPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    PitchforkPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    PitchforkPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    return new PitchforkPrimitive(p1, p2, p3, options);
  }

  function BaseTool(kind, chart, series, manager) {
    this._kind = kind;
    this._chart = chart;
    this._series = series;
    this._manager = manager;
    this._drawing = false;
  }

  BaseTool.prototype.startDrawing = function () {
    if (this._manager.isLocked()) return;
    this._drawing = true;
  };

  BaseTool.prototype.stopDrawing = function () {
    this._drawing = false;
  };

  BaseTool.prototype.isDrawing = function () {
    return this._drawing;
  };

  BaseTool.prototype._resolvePoint = function (param) {
    if (!param || !param.point || !param.time) return null;
    if (this._manager && typeof this._manager._resolveCrosshairState === 'function') {
      var state = this._manager._resolveCrosshairState(param);
      if (state && state.time !== null && state.time !== undefined && isFiniteNumber(state.price)) {
        var resolved = { time: state.time, price: state.price };
        if (state.timestamp !== undefined) resolved.timestamp = state.timestamp;
        if (state.dataIndex !== undefined) resolved.dataIndex = state.dataIndex;
        if (state.paneId !== undefined) resolved.paneId = state.paneId;
        return resolved;
      }
    }
    var price = this._series.coordinateToPrice(param.point.y);
    if (price === null || price === undefined) return null;
    return { time: param.time, price: price };
  };

  BaseTool.prototype._completeDrawing = function (primitive, explicitLabel, serializedData) {
    if (!primitive) return;
    this._manager.registerDrawing(this._kind, primitive, explicitLabel, serializedData);
    this._manager._ignoreCrosshairClickUntil = Date.now() + 120;
    if (this._manager.isStickyMode()) {
      this._drawing = true;
      if (typeof this._resetDrawingSession === 'function') this._resetDrawingSession();
    } else {
      this.stopDrawing();
      this._manager.finishDrawingTool(this._kind);
    }
  };

  function BoxTool(kind, chart, series, manager, options) {
    BaseTool.call(this, kind, chart, series, manager);
    this._points = [];
    this._preview = null;
    this._options = options || {};
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  BoxTool.prototype = Object.create(BaseTool.prototype);
  BoxTool.prototype.constructor = BoxTool;
  BoxTool.prototype._buildLabel = function (p1, p2) {
    if (typeof this._options.labelBuilder === 'function') {
      return this._options.labelBuilder(p1, p2);
    }
    return this._options.label || '';
  };
  BoxTool.prototype._buildOptions = function (p1, p2, preview) {
    return {
      fillColor: preview ? this._options.previewFillColor : this._options.fillColor,
      borderColor: this._options.borderColor,
      borderWidth: this._options.borderWidth,
      label: this._buildLabel(p1, p2),
      labelBackgroundColor: this._options.labelBackgroundColor,
      labelTextColor: this._options.labelTextColor,
      fontSize: this._options.fontSize || 11
    };
  };
  BoxTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  BoxTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  BoxTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  BoxTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  BoxTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length === 1) {
      this._preview = createBoxPrimitive(point, point, this._buildOptions(point, point, true));
      this._series.attachPrimitive(this._preview);
      return;
    }
    if (this._points.length >= 2) {
      var p1 = this._points[0];
      var p2 = this._points[1];
      this._removePreview();
      this._completeDrawing(createBoxPrimitive(p1, p2, this._buildOptions(p1, p2, false)), null, {
        points: clonePoints([p1, p2])
      });
    }
  };
  BoxTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
    this._preview._options.label = this._buildLabel(this._points[0], point);
    this._preview.requestUpdate();
  };
  BoxTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  function LabelTool(kind, chart, series, manager, options) {
    BaseTool.call(this, kind, chart, series, manager);
    this._options = options || {};
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  LabelTool.prototype = Object.create(BaseTool.prototype);
  LabelTool.prototype.constructor = LabelTool;
  LabelTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._completeDrawing(createPointLabelPrimitive(point, {
      text: this._options.text,
      backgroundColor: this._options.backgroundColor,
      textColor: this._options.textColor,
      anchorColor: this._options.anchorColor,
      fontSize: this._options.fontSize || 11
    }), null, {
      points: clonePoints([point]),
      text: this._options.text
    });
  };
  LabelTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  ${ENHANCED_DRAWING_TOOLS_RUNTIME_JS}

  function AdvancedDrawingToolsManager(chart, series) {
    this._chart = chart;
    this._series = series;
    this._activeTool = 'none';
    this._hidden = false;
    this._locked = false;
    this._sticky = false;
    this._crosshairLocked = false;
    this._crosshairVisible = false;
    // True once a touch gesture has ever had >=2 fingers down (a pinch/zoom).
    // Stays true until every finger lifts, so the whole gesture is treated as a
    // zoom and never shows/locks the crosshair — even though a real pinch puts
    // one finger down a frame before the second.
    this._gestureHadMultitouch = false;
    // Time-based suppression window. Lightweight-charts drives the crosshair via
    // its own subscribeCrosshairMove/subscribeClick events, and its trailing
    // click fires on touchend AFTER our touch handlers have already cleared
    // _gestureHadMultitouch. A short window that outlives the gesture keeps the
    // pinch from showing/locking the crosshair through that path too.
    this._multiTouchSuppressUntil = 0;
    // Tracks whether the active drawing tool acted on the first finger of the
    // current gesture, plus the drawings count before it did, so a pinch that
    // follows can roll back anything that first finger started/committed.
    this._gestureToolActed = false;
    this._gestureDrawingBaseline = 0;
    this._crosshairRaf = 0;
    this._crosshairConfig = {
      symbol: '',
      timeframe: '',
      lineColor: 'rgba(148, 163, 184, 0.68)',
      labelBackground: 'rgba(15, 23, 42, 0.96)',
      labelText: '#FFFFFF',
      tooltipBackground: 'rgba(15, 23, 42, 0.94)',
      tooltipBorder: 'rgba(148, 163, 184, 0.28)',
      tooltipText: '#E5E7EB',
      tooltipMuted: '#94A3B8',
      upColor: '#2962FF',
      downColor: '#EF5350',
      snapType: 'ohlc-nearest',
      snapThresholdPx: 18
    };
    this._lastCrosshairParam = null;
    this._lastCrosshairState = null;
    this._pendingCrosshairState = null;
    this._lastNotifiedCrosshairSignature = '';
    this._ignoreCrosshairClickUntil = 0;
    this._drawingCounter = {};
    this._records = [];
    this._chartHost = null;
    this._activeTouchId = null;
    this._activePointerTouches = {};
    this._lastTouchParam = null;
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._lastTextEditTap = null;
    this._selectedRecordId = null;
    this._hoveredRecordId = null;
    this._lineEditState = null;
    this._lineEditPendingFrame = 0;
    this._lineEditPendingPoints = null;
    this._textEditState = null;
    this._snapBypassActive = false;
    this._crosshairOverlay = null;
    this._handlePointerStart = this._handlePointerStart.bind(this);
    this._handlePointerMove = this._handlePointerMove.bind(this);
    this._handlePointerEnd = this._handlePointerEnd.bind(this);
    this._handlePointerCancel = this._handlePointerCancel.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    this._handleTouchCancel = this._handleTouchCancel.bind(this);
    this._handleHostDoubleClick = this._handleHostDoubleClick.bind(this);
    this._handleTextEditDocumentPointer = this._handleTextEditDocumentPointer.bind(this);
    this._handleCrosshairMove = this._handleCrosshairMove.bind(this);
    this._handleCrosshairClick = this._handleCrosshairClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
    this._tools = {};
    ENHANCED_DRAWING_TOOL_SPECS.forEach(function (spec) {
      if (!spec || !spec.kind || typeof spec.createTool !== 'function') return;
      var tool = spec.createTool(chart, series, this);
      if (
        tool &&
        typeof tool.startDrawing === 'function' &&
        typeof tool.stopDrawing === 'function' &&
        typeof tool.remove === 'function'
      ) {
        this._tools[spec.kind] = tool;
      }
    }, this);
    try {
      if (this._chart && typeof this._chart.subscribeCrosshairMove === 'function') {
        this._chart.subscribeCrosshairMove(this._handleCrosshairMove);
      }
    } catch (_subscribeMoveError) {}
    try {
      if (this._chart && typeof this._chart.subscribeClick === 'function') {
        this._chart.subscribeClick(this._handleCrosshairClick);
      }
    } catch (_subscribeClickError) {}
    try {
      if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', this._handleKeyDown, true);
        document.addEventListener('keyup', this._handleKeyUp, true);
      }
    } catch (_keyError) {}
    this._bindTouchBridge();
    this._emitDrawingsChanged();
    this._applyChartInteractionMode();
  }

  AdvancedDrawingToolsManager.prototype._stopAllTools = function () {
    Object.keys(this._tools).forEach(function (key) {
      var tool = this._tools[key];
      if (tool && typeof tool.stopDrawing === 'function') {
        tool.stopDrawing();
      }
    }, this);
  };

  AdvancedDrawingToolsManager.prototype._isDrawingToolActive = function () {
    var tool = this._tools[this._activeTool];
    return !this._locked && !!tool && (typeof tool.isDrawing !== 'function' || tool.isDrawing());
  };

  AdvancedDrawingToolsManager.prototype.shouldUseDirectTouchInput = function () {
    return hasTouchSupport();
  };

  // A pinch/zoom is in progress, or just ended within the suppression window.
  AdvancedDrawingToolsManager.prototype._isPinchActive = function () {
    return this._gestureHadMultitouch || Date.now() < this._multiTouchSuppressUntil;
  };

  // Mark the current gesture as a pinch and (re)arm the trailing suppression
  // window so the lightweight-charts crosshair/click events fired on touchend
  // are ignored too.
  AdvancedDrawingToolsManager.prototype._markPinch = function () {
    this._gestureHadMultitouch = true;
    this._multiTouchSuppressUntil = Date.now() + 450;
    this._activeTouchId = null;
    this._touchDidMove = false;
    this._rollbackPinchStartedDrawing();
  };

  // Undo anything the first finger of a now-confirmed pinch started on the active
  // drawing tool: an uncommitted in-progress preview (2-point tools) and/or a
  // drawing the first tap committed (single-tap tools like Level/Label). Runs
  // only when that first finger actually acted, so normal single-finger drawing
  // is untouched.
  AdvancedDrawingToolsManager.prototype._rollbackPinchStartedDrawing = function () {
    if (!this._gestureToolActed) {
      return;
    }
    this._gestureToolActed = false;
    var activeTool = this._tools[this._activeTool];
    if (activeTool && activeTool._drawing) {
      if (typeof activeTool._resetDrawingSession === 'function') {
        try { activeTool._resetDrawingSession(); } catch (_resetErr) {}
      } else if (typeof activeTool.stopDrawing === 'function' && typeof activeTool.startDrawing === 'function') {
        try { activeTool.stopDrawing(); activeTool.startDrawing(); } catch (_restartErr) {}
      }
    }
    if (typeof this._gestureDrawingBaseline === 'number') {
      var removed = false;
      while (this._records.length > this._gestureDrawingBaseline) {
        var rec = this._records.pop();
        try { this._detachRecord(rec); } catch (_detachErr) {}
        if (rec && this._selectedRecordId === rec.id) {
          this._selectedRecordId = null;
        }
        removed = true;
      }
      if (removed) {
        this._emitDrawingsChanged();
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._bindTouchBridge = function () {
    if (typeof document === 'undefined') {
      return;
    }

    var host = document.getElementById('chart');
    if (!host || host === this._chartHost) {
      return;
    }

    this._unbindTouchBridge();
    this._chartHost = host;
    host.addEventListener('dblclick', this._handleHostDoubleClick, true);
    if (this.shouldUseDirectTouchInput()) {
      if (this._supportsPointerTouchBridge()) {
        host.addEventListener('pointerdown', this._handlePointerStart, { capture: true, passive: false });
        host.addEventListener('pointermove', this._handlePointerMove, { capture: true, passive: false });
        host.addEventListener('pointerup', this._handlePointerEnd, { capture: true, passive: false });
        host.addEventListener('pointercancel', this._handlePointerCancel, { capture: true, passive: false });
      } else {
        host.addEventListener('touchstart', this._handleTouchStart, { capture: true, passive: false });
        host.addEventListener('touchmove', this._handleTouchMove, { capture: true, passive: false });
        host.addEventListener('touchend', this._handleTouchEnd, { capture: true, passive: false });
        host.addEventListener('touchcancel', this._handleTouchCancel, { capture: true, passive: false });
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._unbindTouchBridge = function () {
    if (!this._chartHost) {
      return;
    }

    this._chartHost.removeEventListener('dblclick', this._handleHostDoubleClick, true);
    this._chartHost.removeEventListener('pointerdown', this._handlePointerStart, true);
    this._chartHost.removeEventListener('pointermove', this._handlePointerMove, true);
    this._chartHost.removeEventListener('pointerup', this._handlePointerEnd, true);
    this._chartHost.removeEventListener('pointercancel', this._handlePointerCancel, true);
    this._chartHost.removeEventListener('touchstart', this._handleTouchStart, true);
    this._chartHost.removeEventListener('touchmove', this._handleTouchMove, true);
    this._chartHost.removeEventListener('touchend', this._handleTouchEnd, true);
    this._chartHost.removeEventListener('touchcancel', this._handleTouchCancel, true);

    try {
      this._chartHost.style.touchAction = '';
      this._chartHost.style.userSelect = '';
      this._chartHost.style.webkitUserSelect = '';
    } catch (_error) {}

    this._chartHost = null;
    this._activeTouchId = null;
    this._activePointerTouches = {};
    this._lastTouchParam = null;
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
  };

  AdvancedDrawingToolsManager.prototype._applyElementStyles = function (element, styles) {
    if (!element || !element.style || !styles) {
      return;
    }

    Object.keys(styles).forEach(function (key) {
      element.style[key] = styles[key];
    });
  };

  AdvancedDrawingToolsManager.prototype._ensureCrosshairOverlay = function () {
    if (!this._chartHost) {
      this._bindTouchBridge();
    }
    if (!this._chartHost && typeof document !== 'undefined') {
      try {
        this._chartHost = document.getElementById('chart');
      } catch (_hostError) {
        this._chartHost = null;
      }
    }
    if (!this._chartHost || typeof document === 'undefined') {
      return null;
    }
    if (this._crosshairOverlay && this._crosshairOverlay.root) {
      return this._crosshairOverlay;
    }

    var root = document.createElement('div');
    var vertical = document.createElement('div');
    var horizontal = document.createElement('div');
    var priceLabel = document.createElement('div');
    var timeLabel = document.createElement('div');
    var center = document.createElement('div');
    var tooltip = document.createElement('div');
    var lockBadge = document.createElement('div');

    root.setAttribute('data-rtx5-crosshair-overlay', 'true');
    this._applyElementStyles(root, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      overflow: 'hidden',
      display: 'none',
      zIndex: '45'
    });
    this._applyElementStyles(vertical, {
      position: 'absolute',
      top: '0',
      width: '0',
      height: '0',
      borderLeft: '1px dashed rgba(148, 163, 184, 0.68)'
    });
    this._applyElementStyles(horizontal, {
      position: 'absolute',
      left: '0',
      height: '0',
      width: '0',
      borderTop: '1px dashed rgba(148, 163, 184, 0.68)'
    });
    this._applyElementStyles(priceLabel, {
      position: 'absolute',
      right: '0',
      minWidth: '60px',
      padding: '3px 7px',
      borderRadius: '4px',
      background: 'rgba(15, 23, 42, 0.96)',
      color: '#FFFFFF',
      font: '700 11px Arial, sans-serif',
      lineHeight: '14px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      transform: 'translateY(-50%)'
    });
    this._applyElementStyles(timeLabel, {
      position: 'absolute',
      top: '0',
      padding: '3px 8px',
      borderRadius: '4px',
      background: 'rgba(15, 23, 42, 0.96)',
      color: '#FFFFFF',
      font: '700 11px Arial, sans-serif',
      lineHeight: '14px',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      transform: 'translateX(-50%)'
    });
    this._applyElementStyles(center, {
      position: 'absolute',
      width: '6px',
      height: '6px',
      marginLeft: '-3px',
      marginTop: '-3px',
      borderRadius: '999px',
      border: '1px solid rgba(148, 163, 184, 0.9)',
      background: 'rgba(255, 255, 255, 0.92)'
    });
    this._applyElementStyles(tooltip, {
      position: 'absolute',
      minWidth: '148px',
      maxWidth: '190px',
      padding: '8px 9px',
      borderRadius: '6px',
      border: '1px solid rgba(148, 163, 184, 0.28)',
      background: 'rgba(15, 23, 42, 0.94)',
      color: '#E5E7EB',
      font: '600 11px Arial, sans-serif',
      lineHeight: '15px',
      boxShadow: '0 8px 22px rgba(0, 0, 0, 0.28)',
      whiteSpace: 'normal'
    });
    this._applyElementStyles(lockBadge, {
      position: 'absolute',
      display: 'none',
      padding: '2px 5px',
      borderRadius: '999px',
      background: 'rgba(37, 99, 235, 0.95)',
      color: '#FFFFFF',
      font: '700 9px Arial, sans-serif',
      lineHeight: '11px',
      letterSpacing: '0'
    });

    root.appendChild(vertical);
    root.appendChild(horizontal);
    root.appendChild(priceLabel);
    root.appendChild(timeLabel);
    root.appendChild(center);
    root.appendChild(tooltip);
    root.appendChild(lockBadge);
    this._chartHost.appendChild(root);
    this._crosshairOverlay = {
      root: root,
      vertical: vertical,
      horizontal: horizontal,
      priceLabel: priceLabel,
      timeLabel: timeLabel,
      center: center,
      tooltip: tooltip,
      lockBadge: lockBadge
    };

    return this._crosshairOverlay;
  };

  AdvancedDrawingToolsManager.prototype._hideCrosshairOverlay = function () {
    this._crosshairVisible = false;
    this._lastCrosshairParam = null;
    if (this._crosshairOverlay && this._crosshairOverlay.root) {
      this._crosshairOverlay.root.style.display = 'none';
    }
    this._notifyCrosshairCandle(null);
  };

  AdvancedDrawingToolsManager.prototype._destroyCrosshairOverlay = function () {
    if (this._crosshairRaf) {
      try {
        var cancelRaf = (typeof window !== 'undefined' && window.cancelAnimationFrame) || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
        if (cancelRaf) cancelRaf(this._crosshairRaf);
      } catch (_cancelError) {}
      this._crosshairRaf = 0;
    }
    if (this._crosshairOverlay && this._crosshairOverlay.root && this._crosshairOverlay.root.parentNode) {
      try { this._crosshairOverlay.root.parentNode.removeChild(this._crosshairOverlay.root); } catch (_error) {}
    }
    this._crosshairOverlay = null;
    this._crosshairVisible = false;
    this._lastCrosshairParam = null;
    this._lastCrosshairState = null;
    this._pendingCrosshairState = null;
    this._notifyCrosshairCandle(null);
  };

  AdvancedDrawingToolsManager.prototype._getCrosshairMetrics = function () {
    var width = 0;
    var height = 0;
    try {
      var rect = this._chartHost && typeof this._chartHost.getBoundingClientRect === 'function'
        ? this._chartHost.getBoundingClientRect()
        : null;
      width = rect && isFiniteNumber(rect.width) ? rect.width : 0;
      height = rect && isFiniteNumber(rect.height) ? rect.height : 0;
    } catch (_rectError) {}
    if (!(width > 0)) {
      width = this._chartHost && isFiniteNumber(this._chartHost.clientWidth) ? this._chartHost.clientWidth : 0;
    }
    if (!(height > 0)) {
      height = this._chartHost && isFiniteNumber(this._chartHost.clientHeight) ? this._chartHost.clientHeight : 0;
    }

    var rightAxisWidth = 64;
    var timeAxisHeight = 24;
    try {
      var rightPriceScale = this._chart && typeof this._chart.priceScale === 'function' ? this._chart.priceScale('right') : null;
      if (rightPriceScale && typeof rightPriceScale.width === 'function') {
        var measuredRightAxis = rightPriceScale.width();
        if (isFiniteNumber(measuredRightAxis) && measuredRightAxis >= 0) {
          rightAxisWidth = Math.max(48, measuredRightAxis);
        }
      }
    } catch (_rightAxisError) {}
    try {
      var timeScale = this._chart && typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
      if (timeScale && typeof timeScale.height === 'function') {
        var measuredTimeAxis = timeScale.height();
        if (isFiniteNumber(measuredTimeAxis) && measuredTimeAxis >= 0) {
          timeAxisHeight = Math.max(18, measuredTimeAxis);
        }
      }
    } catch (_timeAxisError) {}

    var paneWidth = Math.max(1, width - rightAxisWidth);
    var paneHeight = Math.max(1, height - timeAxisHeight);
    try {
      var paneSize = this._chart && typeof this._chart.paneSize === 'function' ? this._chart.paneSize(0) : null;
      if (paneSize && isFiniteNumber(paneSize.width) && paneSize.width > 0) {
        paneWidth = Math.min(width, paneSize.width);
      }
      if (paneSize && isFiniteNumber(paneSize.height) && paneSize.height > 0) {
        paneHeight = Math.min(height, paneSize.height);
      }
    } catch (_paneError) {}

    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
      paneWidth: Math.max(1, paneWidth),
      paneHeight: Math.max(1, paneHeight),
      rightAxisWidth: Math.max(0, rightAxisWidth),
      timeAxisHeight: Math.max(0, timeAxisHeight)
    };
  };

  AdvancedDrawingToolsManager.prototype._resolveNearestCandle = function (time, x) {
    var data = getSeriesData(this._series);
    if (!Array.isArray(data) || data.length === 0) {
      return { candle: null, index: null };
    }

    var index = null;
    var timeScale = this._chart && typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
    try {
      if (timeScale && typeof timeScale.coordinateToLogical === 'function' && isFiniteNumber(x)) {
        var logical = timeScale.coordinateToLogical(x);
        if (isFiniteNumber(logical)) {
          var firstLogical = resolveTimeScaleIndex(timeScale, data[0].time, 0);
          var resolvedIndex = Math.round(logical - firstLogical);
          if (isFiniteNumber(resolvedIndex)) {
            index = Math.max(0, Math.min(data.length - 1, resolvedIndex));
          }
        }
      }
    } catch (_logicalError) {}

    if (index === null) {
      var targetComparable = timeToComparableValue(time);
      var bestDistance = Number.POSITIVE_INFINITY;
      for (var i = 0; i < data.length; i += 1) {
        var candidateComparable = timeToComparableValue(data[i] && data[i].time);
        if (targetComparable === null || candidateComparable === null) {
          continue;
        }
        var distance = Math.abs(candidateComparable - targetComparable);
        if (distance < bestDistance) {
          bestDistance = distance;
          index = i;
        }
      }
    }

    if (index === null) {
      index = Math.max(0, Math.min(data.length - 1, Math.round(data.length - 1)));
    }

    return {
      candle: data[index] || null,
      index: index
    };
  };

  AdvancedDrawingToolsManager.prototype._isSnapBypassActive = function () {
    return !!this._snapBypassActive;
  };

  AdvancedDrawingToolsManager.prototype._resolveCrosshairPrice = function (rawPrice, candle, rawY) {
    return rawPrice;
  };

  AdvancedDrawingToolsManager.prototype._resolveCrosshairState = function (param) {
    if (!param || !param.point || !this._series) {
      return null;
    }
    var metrics = this._getCrosshairMetrics();
    var rawX = clampNumber(param.point.x, 0);
    var rawY = clampNumber(param.point.y, 0);
    if (metrics.paneWidth > 1) {
      rawX = Math.max(0, Math.min(metrics.paneWidth, rawX));
    }
    if (metrics.paneHeight > 1) {
      rawY = Math.max(0, Math.min(metrics.paneHeight, rawY));
    }

    var timeScale = this._chart && typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
    var time = param.time;
    if ((time === null || time === undefined) && timeScale) {
      time = resolveTimeFromCoordinate(timeScale, this._series, rawX);
    }
    if (time === null || time === undefined) {
      return null;
    }

    var price = typeof this._series.coordinateToPrice === 'function'
      ? this._series.coordinateToPrice(rawY)
      : null;
    if (price === null || price === undefined || !isFinite(price)) {
      return null;
    }

    var nearest = this._resolveNearestCandle(time, rawX);
    var candle = nearest.candle;
    var dataIndex = nearest.index;
    var x = rawX;

    price = this._resolveCrosshairPrice(price, candle, rawY);
    var y = rawY;
    if (typeof this._series.priceToCoordinate === 'function') {
      var priceY = this._series.priceToCoordinate(price);
      if (priceY !== null && priceY !== undefined && isFinite(priceY)) {
        y = Math.max(0, Math.min(metrics.paneHeight, priceY));
      }
    }

    return {
      visible: true,
      locked: this._crosshairLocked,
      rawX: rawX,
      rawY: rawY,
      x: x,
      y: y,
      metrics: metrics,
      time: time,
      price: price,
      timestamp: isFiniteNumber(time) ? time : undefined,
      paneId: 'main',
      priceLabel: formatCrosshairPrice(this._series, price),
      timeLabel: formatCrosshairTime(time, this._crosshairConfig.timeframe),
      candle: candle,
      dataIndex: dataIndex
    };
  };

  AdvancedDrawingToolsManager.prototype._buildTooltipHtml = function (state) {
    if (!state || !state.candle) {
      return '';
    }
    var candle = state.candle;
    var open = isFiniteNumber(candle.open) ? candle.open : (isFiniteNumber(candle.value) ? candle.value : state.price);
    var high = isFiniteNumber(candle.high) ? candle.high : open;
    var low = isFiniteNumber(candle.low) ? candle.low : open;
    var close = isFiniteNumber(candle.close) ? candle.close : (isFiniteNumber(candle.value) ? candle.value : open);
    var change = close - open;
    var changePct = open !== 0 ? (change / open) * 100 : 0;
    var changeColor = change >= 0 ? this._crosshairConfig.upColor : this._crosshairConfig.downColor;
    var rows = [
      ['O', formatCrosshairPrice(this._series, open)],
      ['H', formatCrosshairPrice(this._series, high)],
      ['L', formatCrosshairPrice(this._series, low)],
      ['C', formatCrosshairPrice(this._series, close)]
    ];
    var volume = formatCrosshairVolume(candle.volume);
    if (volume) {
      rows.push(['Vol', volume]);
    }

    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px;">'
      + '<span style="color:' + this._crosshairConfig.tooltipMuted + ';font-weight:700;">' + state.timeLabel + '</span>'
      + '<span style="color:' + changeColor + ';font-weight:800;">' + formatCrosshairPercent(changePct) + '</span>'
      + '</div>';
    rows.forEach(function (row) {
      html += '<div style="display:flex;justify-content:space-between;gap:12px;">'
        + '<span style="color:' + this._crosshairConfig.tooltipMuted + ';">' + row[0] + '</span>'
        + '<span style="font-variant-numeric:tabular-nums;">' + row[1] + '</span>'
        + '</div>';
    }, this);
    html += '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:3px;">'
      + '<span style="color:' + this._crosshairConfig.tooltipMuted + ';">Chg</span>'
      + '<span style="color:' + changeColor + ';font-variant-numeric:tabular-nums;">' + formatDelta(change) + '</span>'
      + '</div>';
    return html;
  };

  AdvancedDrawingToolsManager.prototype._notifyCrosshairCandle = function (state) {
    if (!state || !state.candle) {
      if (this._lastNotifiedCrosshairSignature !== '') {
        this._lastNotifiedCrosshairSignature = '';
        safeNotify('CHART_CROSSHAIR_CANDLE', { active: false });
      }
      return;
    }

    var candle = state.candle;
    var payloadCandle = {
      time: isFiniteNumber(candle.time) ? candle.time : null,
      open: isFiniteNumber(candle.open) ? candle.open : (isFiniteNumber(candle.value) ? candle.value : null),
      high: isFiniteNumber(candle.high) ? candle.high : (isFiniteNumber(candle.value) ? candle.value : null),
      low: isFiniteNumber(candle.low) ? candle.low : (isFiniteNumber(candle.value) ? candle.value : null),
      close: isFiniteNumber(candle.close) ? candle.close : (isFiniteNumber(candle.value) ? candle.value : null),
      volume: isFiniteNumber(candle.volume) ? candle.volume : null
    };
    var signature = [
      state.dataIndex,
      payloadCandle.time,
      payloadCandle.open,
      payloadCandle.high,
      payloadCandle.low,
      payloadCandle.close,
      payloadCandle.volume,
      state.locked ? 'locked' : 'free'
    ].join('|');
    if (signature === this._lastNotifiedCrosshairSignature) {
      return;
    }
    this._lastNotifiedCrosshairSignature = signature;
    safeNotify('CHART_CROSSHAIR_CANDLE', {
      active: true,
      locked: !!state.locked,
      dataIndex: state.dataIndex,
      timeLabel: state.timeLabel,
      candle: payloadCandle
    });
  };

  AdvancedDrawingToolsManager.prototype._renderCrosshairOverlay = function (state) {
    var overlay = this._ensureCrosshairOverlay();
    if (!overlay || !state) {
      return;
    }

    var metrics = state.metrics;
    var lineColor = this._crosshairConfig.lineColor;
    overlay.root.style.display = 'block';
    overlay.vertical.style.borderLeft = '1px dashed ' + lineColor;
    overlay.horizontal.style.borderTop = '1px dashed ' + lineColor;
    overlay.vertical.style.left = Math.round(state.x) + 'px';
    overlay.vertical.style.top = '0px';
    overlay.vertical.style.height = Math.round(metrics.paneHeight) + 'px';
    overlay.horizontal.style.left = '0px';
    overlay.horizontal.style.top = Math.round(state.y) + 'px';
    overlay.horizontal.style.width = Math.round(metrics.paneWidth) + 'px';
    overlay.center.style.left = Math.round(state.x) + 'px';
    overlay.center.style.top = Math.round(state.y) + 'px';

    overlay.priceLabel.textContent = state.priceLabel;
    overlay.priceLabel.style.background = this._crosshairConfig.labelBackground;
    overlay.priceLabel.style.color = this._crosshairConfig.labelText;
    overlay.priceLabel.style.top = Math.round(Math.max(10, Math.min(metrics.paneHeight - 10, state.y))) + 'px';

    overlay.timeLabel.textContent = state.timeLabel;
    overlay.timeLabel.style.background = this._crosshairConfig.labelBackground;
    overlay.timeLabel.style.color = this._crosshairConfig.labelText;
    overlay.timeLabel.style.top = Math.round(metrics.paneHeight) + 'px';
    var timeLabelWidth = overlay.timeLabel.offsetWidth || Math.max(68, state.timeLabel.length * 7 + 18);
    var clampedTimeX = Math.max(timeLabelWidth / 2 + 2, Math.min(metrics.paneWidth - timeLabelWidth / 2 - 2, state.x));
    overlay.timeLabel.style.left = Math.round(clampedTimeX) + 'px';

    overlay.tooltip.innerHTML = this._buildTooltipHtml(state);
    overlay.tooltip.style.background = this._crosshairConfig.tooltipBackground;
    overlay.tooltip.style.borderColor = this._crosshairConfig.tooltipBorder;
    overlay.tooltip.style.color = this._crosshairConfig.tooltipText;
    var tooltipWidth = overlay.tooltip.offsetWidth || 164;
    var tooltipHeight = overlay.tooltip.offsetHeight || 112;
    var tooltipLeft = state.x + 14;
    if (tooltipLeft + tooltipWidth > metrics.paneWidth - 6) {
      tooltipLeft = state.x - tooltipWidth - 14;
    }
    tooltipLeft = Math.max(6, Math.min(metrics.paneWidth - tooltipWidth - 6, tooltipLeft));
    var tooltipTop = state.y + 14;
    if (tooltipTop + tooltipHeight > metrics.paneHeight - 6) {
      tooltipTop = state.y - tooltipHeight - 14;
    }
    tooltipTop = Math.max(6, Math.min(metrics.paneHeight - tooltipHeight - 6, tooltipTop));
    overlay.tooltip.style.left = Math.round(tooltipLeft) + 'px';
    overlay.tooltip.style.top = Math.round(tooltipTop) + 'px';

    overlay.lockBadge.style.display = state.locked ? 'block' : 'none';
    overlay.lockBadge.textContent = 'LOCK';
    overlay.lockBadge.style.left = Math.round(Math.max(4, Math.min(metrics.paneWidth - 36, state.x + 8))) + 'px';
    overlay.lockBadge.style.top = Math.round(Math.max(4, Math.min(metrics.paneHeight - 18, state.y - 18))) + 'px';
    this._notifyCrosshairCandle(state);
  };

  AdvancedDrawingToolsManager.prototype._scheduleCrosshairRender = function (state) {
    this._pendingCrosshairState = state;
    if (this._crosshairRaf) {
      return;
    }
    var self = this;
    var raf = null;
    try {
      raf = (typeof window !== 'undefined' && window.requestAnimationFrame) || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
    } catch (_rafError) {
      raf = null;
    }
    var render = function () {
      self._crosshairRaf = 0;
      var nextState = self._pendingCrosshairState;
      self._pendingCrosshairState = null;
      if (nextState) {
        self._lastCrosshairState = nextState;
        self._crosshairVisible = true;
        self._renderCrosshairOverlay(nextState);
      }
    };
    this._crosshairRaf = raf ? raf(render) : 0;
    if (!raf) {
      render();
    }
  };

  AdvancedDrawingToolsManager.prototype._updateCrosshairOverlay = function (param, force) {
    if (this._crosshairLocked && !force) {
      return;
    }
    var state = this._resolveCrosshairState(param);
    if (!state) {
      if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      return;
    }
    this._lastCrosshairParam = {
      point: { x: state.rawX, y: state.rawY },
      time: state.time
    };
    this._scheduleCrosshairRender(state);
  };

  AdvancedDrawingToolsManager.prototype._handleCrosshairMove = function (param) {
    if (this._isPinchActive()) {
      // Pinch/zoom: lightweight-charts still emits crosshairMove for the moving
      // fingers. Do not show the crosshair overlay from a zoom gesture.
      if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      return;
    }
    if (!param || !param.point) {
      if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      this._setHoveredRecord(null);
      return;
    }
    var drawingMode = this._isDrawingToolActive();
    if (this._activeTool === 'none' || (this._activeTool !== 'crosshair' && !drawingMode)) {
      if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      this._setHoveredRecord(null);
      return;
    }
    if (this._activeTool === 'crosshair' && !this._lineEditState) {
      var hoverHit = this._hitTestEditableDrawingAtPoint(param.point);
      this._setHoveredRecord(hoverHit && hoverHit.record ? hoverHit.record.id : null);
    } else {
      this._setHoveredRecord(null);
    }
    this._updateCrosshairOverlay(param, drawingMode);
  };

  AdvancedDrawingToolsManager.prototype._handleCrosshairClick = function (param) {
    if (this._activeTool !== 'crosshair' || !param || !param.point) {
      return;
    }
    if (this._isPinchActive()) {
      // Trailing click that lightweight-charts fires when a pinch ends — must not
      // toggle/lock the crosshair.
      return;
    }
    this._suppressHostTapMenu();
    if (this._ignoreCrosshairClickUntil && Date.now() <= this._ignoreCrosshairClickUntil) {
      return;
    }
    var drawingHit = this._hitTestEditableDrawingAtPoint(param.point);
    if (drawingHit && drawingHit.record) {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
      this._selectRecord(drawingHit.record.id);
      return;
    }
    if (this._selectedRecordId) {
      this._selectRecord(null);
      return;
    }
    if (this._crosshairLocked) {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
      return;
    }
    this._crosshairLocked = true;
    this._updateCrosshairOverlay(param, true);
  };

  AdvancedDrawingToolsManager.prototype._handleKeyDown = function (event) {
    var key = event && typeof event.key === 'string' ? event.key : '';
    if (this._textEditState) {
      if (key === 'Enter') {
        this._consumeTouchEvent(event);
        this._endTextRecordEdit(true);
      } else if (key === 'Escape' || key === 'Esc') {
        this._consumeTouchEvent(event);
        this._endTextRecordEdit(false);
      }
      return;
    }
    if (key === 'Control' || key === 'Meta' || key === 'Alt') {
      this._snapBypassActive = true;
    }
    if (key === 'Escape' || key === 'Esc') {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
      this._endLineEdit(false);
      if (this._selectedRecordId) {
        this._selectRecord(null);
      }
      if (this._activeTool !== 'none') {
        this.setActiveTool('none');
      }
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && this._selectedRecordId) {
      this._removeSelectedRecord();
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    if ((key === 'Control' || key === 'Meta') && this._lastCrosshairParam) {
      this._updateCrosshairOverlay(this._lastCrosshairParam, true);
    }
  };

  AdvancedDrawingToolsManager.prototype._handleKeyUp = function (event) {
    var key = event && typeof event.key === 'string' ? event.key : '';
    if (key === 'Control' || key === 'Meta' || key === 'Alt') {
      this._snapBypassActive = false;
      if (this._lastCrosshairParam) {
        this._updateCrosshairOverlay(this._lastCrosshairParam, true);
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._suppressHostTapMenu = function () {
    try {
      if (typeof window !== 'undefined') {
        window.__rtx5SuppressChartTapUntil = Date.now() + 550;
      }
    } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype.refreshCrosshairData = function () {
    if (!this._lastCrosshairParam || (!this._crosshairVisible && !this._crosshairLocked)) {
      return;
    }
    this._updateCrosshairOverlay(this._lastCrosshairParam, true);
  };

  AdvancedDrawingToolsManager.prototype.setCrosshairConfig = function (config) {
    if (!config || typeof config !== 'object') {
      return;
    }
    var snap = config.snap && typeof config.snap === 'object' ? config.snap : null;
    this._crosshairConfig = Object.assign({}, this._crosshairConfig, {
      symbol: typeof config.symbol === 'string' ? config.symbol : this._crosshairConfig.symbol,
      timeframe: typeof config.timeframe === 'string' ? config.timeframe : this._crosshairConfig.timeframe,
      lineColor: typeof config.lineColor === 'string' ? config.lineColor : this._crosshairConfig.lineColor,
      labelBackground: typeof config.labelBackground === 'string' ? config.labelBackground : this._crosshairConfig.labelBackground,
      labelText: typeof config.labelText === 'string' ? config.labelText : this._crosshairConfig.labelText,
      tooltipBackground: typeof config.tooltipBackground === 'string' ? config.tooltipBackground : this._crosshairConfig.tooltipBackground,
      tooltipBorder: typeof config.tooltipBorder === 'string' ? config.tooltipBorder : this._crosshairConfig.tooltipBorder,
      tooltipText: typeof config.tooltipText === 'string' ? config.tooltipText : this._crosshairConfig.tooltipText,
      tooltipMuted: typeof config.tooltipMuted === 'string' ? config.tooltipMuted : this._crosshairConfig.tooltipMuted,
      upColor: typeof config.upColor === 'string' ? config.upColor : this._crosshairConfig.upColor,
      downColor: typeof config.downColor === 'string' ? config.downColor : this._crosshairConfig.downColor,
      snapType: snap && typeof snap.type === 'string' ? snap.type : (typeof config.snapType === 'string' ? config.snapType : this._crosshairConfig.snapType),
      snapThresholdPx: snap && isFiniteNumber(snap.thresholdPx) ? snap.thresholdPx : (isFiniteNumber(config.snapThresholdPx) ? config.snapThresholdPx : this._crosshairConfig.snapThresholdPx)
    });
    this.refreshCrosshairData();
  };

  AdvancedDrawingToolsManager.prototype._supportsPointerTouchBridge = function () {
    try {
      return typeof window !== 'undefined' && typeof window.PointerEvent === 'function';
    } catch (_error) {
      return false;
    }
  };

  AdvancedDrawingToolsManager.prototype._isTouchPointerEvent = function (event) {
    if (!event) return false;
    if (!event.pointerType) return true;
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  };

  AdvancedDrawingToolsManager.prototype._makeTouchLikeFromPointerEvent = function (event) {
    if (!this._isTouchPointerEvent(event)) {
      return null;
    }
    if (!isFiniteNumber(event.clientX) || !isFiniteNumber(event.clientY)) {
      return null;
    }
    var pointerId = event.pointerId;
    return {
      identifier: pointerId === undefined || pointerId === null ? 1 : pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
  };

  AdvancedDrawingToolsManager.prototype._activePointerTouchList = function () {
    var touches = [];
    Object.keys(this._activePointerTouches || {}).forEach(function (key) {
      var touch = this._activePointerTouches[key];
      if (touch) {
        touches.push(touch);
      }
    }, this);
    return touches;
  };

  AdvancedDrawingToolsManager.prototype._buildPointerTouchEvent = function (event, phase) {
    var touch = this._makeTouchLikeFromPointerEvent(event);
    if (!touch) {
      return null;
    }
    var key = String(touch.identifier);
    if (phase === 'start' || phase === 'move') {
      this._activePointerTouches[key] = touch;
    }
    if (phase === 'end' || phase === 'cancel') {
      delete this._activePointerTouches[key];
    }
    var touches = this._activePointerTouchList();
    var changedTouches = [touch];
    return {
      touches: touches,
      targetTouches: touches,
      changedTouches: changedTouches,
      preventDefault: function () {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
      },
      stopPropagation: function () {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      },
      stopImmediatePropagation: function () {
        if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      }
    };
  };

  AdvancedDrawingToolsManager.prototype._handlePointerStart = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'start');
    if (!touchEvent) {
      return;
    }
    this._handleTouchStart(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._handlePointerMove = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'move');
    if (!touchEvent) {
      return;
    }
    this._handleTouchMove(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._handlePointerEnd = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'end');
    if (!touchEvent) {
      return;
    }
    this._handleTouchEnd(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._handlePointerCancel = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'cancel');
    if (!touchEvent) {
      return;
    }
    this._handleTouchCancel(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._getActiveTouchTool = function () {
    if (!this._isDrawingToolActive()) {
      return null;
    }

    var tool = this._tools[this._activeTool];
    if (!tool || typeof tool.isDrawing !== 'function' || !tool.isDrawing()) {
      return null;
    }

    return tool;
  };

  AdvancedDrawingToolsManager.prototype._findTrackedTouch = function (touchList) {
    if (!touchList || typeof touchList.length !== 'number') {
      return null;
    }

    var fallback = null;
    for (var i = 0; i < touchList.length; i++) {
      var touch = typeof touchList.item === 'function' ? touchList.item(i) : touchList[i];
      if (!touch) continue;
      if (!fallback) {
        fallback = touch;
      }
      if (this._activeTouchId === null || this._activeTouchId === undefined || touch.identifier === this._activeTouchId) {
        return touch;
      }
    }

    return fallback;
  };

  AdvancedDrawingToolsManager.prototype._snapPriceToSeriesBar = function (timeScale, time, price) {
    return null;
  };

  AdvancedDrawingToolsManager.prototype._buildSyntheticPointerParam = function (touch) {
    if (!touch || !this._chartHost || !this._chart || !this._series) {
      return null;
    }

    var rect = this._chartHost.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) {
      return null;
    }

    var x = clampNumber(touch.clientX - rect.left, 0);
    var y = clampNumber(touch.clientY - rect.top, 0);
    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));

    var timeScale = typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
    if (!timeScale || typeof timeScale.coordinateToTime !== 'function') {
      return null;
    }

    var time = resolveTimeFromCoordinate(timeScale, this._series, x);
    if (time === null || time === undefined) {
      return null;
    }

    var price = typeof this._series.coordinateToPrice === 'function'
      ? this._series.coordinateToPrice(y)
      : null;
    if (price === null || price === undefined || !isFinite(price)) {
      return null;
    }

    var snappedPrice = this._snapPriceToSeriesBar(timeScale, time, price);
    if (snappedPrice !== null) {
      price = snappedPrice;
      if (typeof this._series.priceToCoordinate === 'function') {
        var snappedY = this._series.priceToCoordinate(price);
        if (snappedY !== null && snappedY !== undefined && isFinite(snappedY)) {
          y = snappedY;
        }
      }
    }

    return {
      point: { x: x, y: y },
      time: time
    };
  };

  AdvancedDrawingToolsManager.prototype._consumeTouchEvent = function (event) {
    if (!event) {
      return;
    }

    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  AdvancedDrawingToolsManager.prototype._resolveHostEventPoint = function (event) {
    if (!event || !this._chartHost || typeof this._chartHost.getBoundingClientRect !== 'function') {
      return null;
    }
    var rect = this._chartHost.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    var clientX = isFiniteNumber(event.clientX) ? event.clientX : null;
    var clientY = isFiniteNumber(event.clientY) ? event.clientY : null;
    if (clientX === null || clientY === null) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(rect.width || 0, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height || 0, clientY - rect.top))
    };
  };

  AdvancedDrawingToolsManager.prototype._sanitizeTextRecordValue = function (value) {
    var text = typeof value === 'string' ? value : '';
    // Canvas draws plain text only, but we still strip HTML brackets/control chars before persisting.
    text = text.replace(/<[^>]*>/g, '').replace(/[\\u0000-\\u001F\\u007F]/g, ' ').replace(/[<>]/g, '').replace(/\\s+/g, ' ').trim();
    if (text.length > 120) {
      text = text.slice(0, 120);
    }
    return text;
  };

  AdvancedDrawingToolsManager.prototype._commitTextRecordValue = function (record, value) {
    if (!record) {
      return false;
    }
    var nextText = this._sanitizeTextRecordValue(value);
    if (!nextText) {
      nextText = 'Level';
    }
    var changed = record.text !== nextText || record.label !== nextText;
    record.text = nextText;
    record.label = nextText;
    record.updatedAt = Date.now();
    if (record.primitive && typeof record.primitive.updateText === 'function') {
      record.primitive.updateText(nextText);
    }
    if (changed) {
      this._emitDrawingsChanged();
    }
    return true;
  };

  AdvancedDrawingToolsManager.prototype._shouldUseNativeTextEditor = function () {
    return this.shouldUseDirectTouchInput() &&
      typeof window !== 'undefined' &&
      window.ReactNativeWebView &&
      typeof window.ReactNativeWebView.postMessage === 'function';
  };

  AdvancedDrawingToolsManager.prototype._beginNativeTextRecordEdit = function (record, geometry) {
    if (!this._shouldUseNativeTextEditor()) {
      return false;
    }
    var box = geometry && geometry.labelBox ? geometry.labelBox : null;
    this._textEditState = {
      recordId: record.id,
      input: null,
      native: true,
      originalText: record.text || record.label || 'Level'
    };
    safeNotify('DRAWING_TEXT_EDIT_REQUEST', {
      recordId: record.id,
      kind: record.kind,
      text: this._sanitizeTextRecordValue(record.text || record.label || 'Level'),
      label: record.label || 'Level',
      x: box ? Math.round(box.left) : undefined,
      y: box ? Math.round(box.top) : undefined,
      width: box ? Math.max(56, Math.round(box.width)) : undefined,
      height: box ? Math.max(24, Math.round(box.height)) : undefined
    });
    return true;
  };

  AdvancedDrawingToolsManager.prototype._isTextRecordEditable = function (record) {
    return !!record &&
      !!record.primitive &&
      (record.kind === 'textLevel' || typeof record.primitive.getTextEditGeometry === 'function') &&
      !record.locked &&
      !this._locked;
  };

  AdvancedDrawingToolsManager.prototype._handleHostDoubleClick = function (event) {
    var point = this._resolveHostEventPoint(event);
    if (!point) {
      return;
    }
    var hit = this._hitTestEditableDrawingAtPoint(point);
    if (!hit || !this._isTextRecordEditable(hit.record)) {
      return;
    }
    this._consumeTouchEvent(event);
    this._selectRecord(hit.record.id);
    this._beginTextRecordEdit(hit.record);
  };

  AdvancedDrawingToolsManager.prototype._handleTextEditDocumentPointer = function (event) {
    var state = this._textEditState;
    if (!state || !state.input) {
      return;
    }
    if (event && event.target === state.input) {
      return;
    }
    this._endTextRecordEdit(true);
  };

  AdvancedDrawingToolsManager.prototype._beginTextRecordEdit = function (record) {
    if (!this._isTextRecordEditable(record) || typeof document === 'undefined') {
      return false;
    }
    if (!this._chartHost) {
      this._bindTouchBridge();
    }
    if (!this._chartHost) {
      return false;
    }
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    if (record.primitive && typeof record.primitive.updateAllViews === 'function') {
      record.primitive.updateAllViews();
    }
    if (
      record.primitive &&
      typeof record.primitive.setFallbackPaneSize === 'function'
    ) {
      try {
        var metrics = this._getCrosshairMetrics();
        record.primitive.setFallbackPaneSize(metrics.paneWidth, metrics.paneHeight);
      } catch (_metricsError) {}
    }
    var geometry = record.primitive && typeof record.primitive.getTextEditGeometry === 'function'
      ? record.primitive.getTextEditGeometry()
      : null;
    if (!geometry || !geometry.labelBox) {
      return false;
    }
    if (this._beginNativeTextRecordEdit(record, geometry)) {
      return true;
    }
    var style = record.primitive && typeof record.primitive.getTextEditStyle === 'function'
      ? record.primitive.getTextEditStyle()
      : {};
    var box = geometry.labelBox;
    var input = document.createElement('input');
    if (!input || typeof input.addEventListener !== 'function') {
      return false;
    }
    input.type = 'text';
    input.inputMode = 'text';
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 120;
    input.value = this._sanitizeTextRecordValue(record.text || record.label || 'Level');
    this._applyElementStyles(input, {
      position: 'absolute',
      left: Math.round(box.left) + 'px',
      top: Math.round(box.top) + 'px',
      width: Math.max(56, Math.round(box.width)) + 'px',
      height: Math.max(24, Math.round(box.height)) + 'px',
      zIndex: '70',
      boxSizing: 'border-box',
      padding: style.padding || '3px 6px',
      border: style.border || '1px solid #5B9DFF',
      borderRadius: style.borderRadius || '4px',
      outline: 'none',
      background: style.background || 'rgba(15, 23, 42, 0.96)',
      color: style.color || '#FFFFFF',
      font: style.font || '700 12px Arial, sans-serif',
      lineHeight: style.lineHeight || '16px',
      textAlign: style.textAlign || 'left',
      pointerEvents: 'auto',
      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.28)'
    });
    var manager = this;
    var keyHandler = function (keyboardEvent) {
      var key = keyboardEvent && typeof keyboardEvent.key === 'string' ? keyboardEvent.key : '';
      if (key === 'Enter') {
        manager._consumeTouchEvent(keyboardEvent);
        manager._endTextRecordEdit(true);
        return;
      }
      if (key === 'Escape' || key === 'Esc') {
        manager._consumeTouchEvent(keyboardEvent);
        manager._endTextRecordEdit(false);
        return;
      }
      if (keyboardEvent && typeof keyboardEvent.stopPropagation === 'function') {
        keyboardEvent.stopPropagation();
      }
    };
    var blurHandler = function () {
      manager._endTextRecordEdit(true);
    };
    input.addEventListener('keydown', keyHandler, true);
    input.addEventListener('blur', blurHandler, false);
    this._textEditState = {
      recordId: record.id,
      input: input,
      originalText: record.text || '',
      keyHandler: keyHandler,
      blurHandler: blurHandler
    };
    this._chartHost.appendChild(input);
    try {
      document.addEventListener('mousedown', this._handleTextEditDocumentPointer, true);
      document.addEventListener('touchstart', this._handleTextEditDocumentPointer, true);
    } catch (_listenerError) {}
    // Android WebView only opens the keyboard reliably when focus happens in the
    // same user-gesture call stack. The timeout below is just a safety refocus.
    try {
      input.focus();
      input.select();
    } catch (_immediateFocusError) {}
    setTimeout(function () {
      try {
        input.focus();
        input.select();
      } catch (_focusError) {}
    }, 0);
    return true;
  };

  AdvancedDrawingToolsManager.prototype._endTextRecordEdit = function (commit) {
    var state = this._textEditState;
    if (!state) {
      return;
    }
    this._textEditState = null;
    try {
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousedown', this._handleTextEditDocumentPointer, true);
        document.removeEventListener('touchstart', this._handleTextEditDocumentPointer, true);
      }
    } catch (_listenerError) {}
    var input = state.input;
    if (input) {
      try { input.removeEventListener('keydown', state.keyHandler, true); } catch (_keyError) {}
      try { input.removeEventListener('blur', state.blurHandler, false); } catch (_blurError) {}
      try {
        if (input.parentNode) input.parentNode.removeChild(input);
      } catch (_removeError) {}
    }
    var record = this._findRecordById(state.recordId);
    if (!record) {
      return;
    }
    var nextText = commit ? this._sanitizeTextRecordValue(input ? input.value : state.originalText) : state.originalText;
    if (!nextText) {
      nextText = state.originalText || 'Level';
    }
    this._commitTextRecordValue(record, nextText);
  };

  AdvancedDrawingToolsManager.prototype.applyTextRecordEdit = function (recordId, value) {
    var record = this._findRecordById(recordId);
    if (!this._isTextRecordEditable(record)) {
      return false;
    }
    this._textEditState = null;
    return this._commitTextRecordValue(record, value);
  };

  AdvancedDrawingToolsManager.prototype.cancelTextRecordEdit = function (recordId) {
    if (this._textEditState && (!recordId || this._textEditState.recordId === recordId)) {
      this._endTextRecordEdit(false);
    }
  };

  AdvancedDrawingToolsManager.prototype._handleTouchStart = function (event) {
    var activeTouchCount = (event.touches && typeof event.touches.length === 'number') ? event.touches.length : 1;
    if (activeTouchCount >= 2) {
      // A second finger landed → this gesture is a pinch/zoom. Mark it and undo
      // any crosshair the first finger transiently showed (unless the user had
      // already locked it on purpose). Kept true until all fingers lift.
      this._markPinch();
      if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
    } else {
      // Genuine fresh single-finger gesture (only one finger on screen).
      this._gestureHadMultitouch = false;
      this._gestureToolActed = false;
    }

    if (this._activeTool === 'crosshair' && this.shouldUseDirectTouchInput()) {
      if (this._gestureHadMultitouch || (event.touches && event.touches.length > 1)) {
        this._activeTouchId = null;
        return;
      }
      var crosshairTouch = this._findTrackedTouch(event.changedTouches || event.touches);
      if (!crosshairTouch) {
        return;
      }
      this._ignoreCrosshairClickUntil = Date.now() + 650;
      this._suppressHostTapMenu();
      this._activeTouchId = crosshairTouch.identifier;
      this._touchDidMove = false;
      this._touchStartX = crosshairTouch.clientX;
      this._touchStartY = crosshairTouch.clientY;
      var crosshairParam = this._buildSyntheticPointerParam(crosshairTouch);
      if (crosshairParam) {
        var textHit = this._hitTestEditableDrawingAtPoint(crosshairParam.point);
        if (textHit && textHit.part === 'label' && this._isTextRecordEditable(textHit.record)) {
          var now = Date.now();
          var lastTap = this._lastTextEditTap;
          var sameRecord = lastTap && lastTap.recordId === textHit.record.id;
          var dx = lastTap ? crosshairTouch.clientX - lastTap.x : 0;
          var dy = lastTap ? crosshairTouch.clientY - lastTap.y : 0;
          var isDoubleTap = sameRecord && now - lastTap.time <= 420 && (dx * dx + dy * dy) <= 900;
          if (isDoubleTap) {
            this._lastTextEditTap = null;
            this._touchGestureMode = 'text-edit';
            this._lastTouchParam = crosshairParam;
            this._crosshairLocked = false;
            this._hideCrosshairOverlay();
            this._selectRecord(textHit.record.id);
            this._beginTextRecordEdit(textHit.record);
            this._consumeTouchEvent(event);
            return;
          }
          this._lastTextEditTap = {
            recordId: textHit.record.id,
            x: crosshairTouch.clientX,
            y: crosshairTouch.clientY,
            time: now
          };
        } else {
          this._lastTextEditTap = null;
        }
      }
      if (crosshairParam && this._beginLineEdit(crosshairParam)) {
        this._touchGestureMode = 'line-edit';
        this._lastTouchParam = crosshairParam;
        this._crosshairLocked = false;
        this._hideCrosshairOverlay();
        this._consumeTouchEvent(event);
        return;
      }
      if (crosshairParam) {
        this._lastTouchParam = crosshairParam;
        this._updateCrosshairOverlay(crosshairParam, true);
      }
      return;
    }

    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      return;
    }

    if (this._gestureHadMultitouch || (event.touches && event.touches.length > 1)) {
      this._activeTouchId = null;
      return;
    }

    var touch = this._findTrackedTouch(event.changedTouches || event.touches);
    if (!touch) {
      return;
    }

    this._suppressHostTapMenu();
    this._activeTouchId = touch.identifier;
    // Snapshot before the tool acts so a pinch that follows this first finger can
    // roll back whatever it started/committed (e.g. a single-tap Level).
    this._gestureDrawingBaseline = this._records.length;
    this._gestureToolActed = true;
    var param = this._buildSyntheticPointerParam(touch);
    this._touchDidMove = false;
    var hasPreviewHandler = typeof tool._handleMove === 'function';
    var existingPointCount = Array.isArray(tool._points) ? tool._points.length : 0;
    if (hasPreviewHandler && existingPointCount === 0) {
      this._touchGestureMode = 'drag-from-first-anchor';
    } else if (hasPreviewHandler && existingPointCount === 1) {
      this._touchGestureMode = 'commit-second-anchor';
    } else {
      this._touchGestureMode = 'click';
    }

    if (param) {
      this._lastTouchParam = param;
      this._updateCrosshairOverlay(param, true);
      if (this._touchGestureMode === 'drag-from-first-anchor') {
        if (typeof tool._handleClick === 'function') {
          tool._handleClick(param);
        }
      } else if (this._touchGestureMode === 'commit-second-anchor' && hasPreviewHandler) {
        tool._handleMove(param);
      } else if (typeof tool._handleClick === 'function') {
        tool._handleClick(param);
      }
    }
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchMove = function (event) {
    if (this._gestureHadMultitouch || (event.touches && event.touches.length > 1)) {
      // Pinch/zoom in progress — never drive the crosshair or a drawing from it.
      this._markPinch();
      return;
    }

    if (this._lineEditState && this.shouldUseDirectTouchInput()) {
      var editTouch = this._findTrackedTouch(event.touches || event.changedTouches);
      if (!editTouch) {
        return;
      }
      var editParam = this._buildSyntheticPointerParam(editTouch);
      if (editParam) {
        this._lastTouchParam = editParam;
        this._touchDidMove = true;
        this._updateLineEdit(editParam);
      }
      this._consumeTouchEvent(event);
      return;
    }

    if (this._activeTool === 'crosshair' && this.shouldUseDirectTouchInput()) {
      var crosshairTouch = this._findTrackedTouch(event.touches || event.changedTouches);
      if (!crosshairTouch) {
        return;
      }
      var crosshairParam = this._buildSyntheticPointerParam(crosshairTouch);
      if (crosshairParam) {
        var dx = crosshairTouch.clientX - this._touchStartX;
        var dy = crosshairTouch.clientY - this._touchStartY;
        if ((dx * dx + dy * dy) > 144) {
          this._touchDidMove = true;
        }
        if (!this._touchDidMove) {
          return;
        }
        this._lastTouchParam = crosshairParam;
        this._updateCrosshairOverlay(crosshairParam, true);
      }
      return;
    }

    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      return;
    }

    var touch = this._findTrackedTouch(event.touches || event.changedTouches);
    if (!touch) {
      return;
    }

    var param = this._buildSyntheticPointerParam(touch);
    if (param && typeof tool._handleMove === 'function') {
      this._lastTouchParam = param;
      this._touchDidMove = true;
      this._updateCrosshairOverlay(param, true);
      tool._handleMove(param);
    }
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchEnd = function (event) {
    var remainingTouches = (event.touches && typeof event.touches.length === 'number') ? event.touches.length : 0;
    if (this._gestureHadMultitouch) {
      // A finger lifted from a pinch/zoom. Do NOT treat it as a crosshair tap
      // (which would toggle the LOCK overlay on). Just clear transient state.
      this._activeTouchId = null;
      this._lastTouchParam = null;
      this._touchDidMove = false;
      this._touchGestureMode = 'idle';
      if (this._activeTool === 'crosshair' && !this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      if (remainingTouches === 0) {
        // Whole gesture finished — arm the next one as a fresh single touch.
        this._gestureHadMultitouch = false;
        this._gestureToolActed = false;
      }
      return;
    }

    // A clean (non-pinch) gesture is ending. Once the last finger lifts, the tool
    // action is committed and final — clear the rollback arm so a later
    // simultaneous two-finger pinch can never undo this finished drawing.
    if (remainingTouches === 0) {
      this._gestureToolActed = false;
    }

    if (this._touchGestureMode === 'text-edit') {
      this._touchGestureMode = 'idle';
      this._touchDidMove = false;
      this._activeTouchId = null;
      this._lastTouchParam = null;
      this._consumeTouchEvent(event);
      return;
    }

    if (this._lineEditState && this.shouldUseDirectTouchInput()) {
      var completedEditState = this._lineEditState;
      var editTouch = this._findTrackedTouch(event.changedTouches || event.touches);
      var editParam = editTouch ? this._buildSyntheticPointerParam(editTouch) : this._lastTouchParam;
      if (editParam && this._touchDidMove) {
        this._updateLineEdit(editParam);
      }
      var editRecord = completedEditState ? this._findRecordById(completedEditState.recordId) : null;
      var shouldOpenTextEditor = completedEditState &&
        completedEditState.part === 'label' &&
        !completedEditState.moved &&
        !this._touchDidMove &&
        this._isTextRecordEditable(editRecord);
      this._endLineEdit(true);
      this._touchGestureMode = 'idle';
      this._touchDidMove = false;
      this._activeTouchId = null;
      this._lastTouchParam = null;
      if (shouldOpenTextEditor && editRecord) {
        this._lastTextEditTap = null;
        this._selectRecord(editRecord.id);
        this._beginTextRecordEdit(editRecord);
      }
      this._consumeTouchEvent(event);
      return;
    }

    if (this._activeTool === 'crosshair' && this.shouldUseDirectTouchInput()) {
      var crosshairTouch = this._findTrackedTouch(event.changedTouches || event.touches);
      var crosshairParam = crosshairTouch ? this._buildSyntheticPointerParam(crosshairTouch) : this._lastTouchParam;
      if (crosshairParam) {
        this._lastTouchParam = crosshairParam;
        this._updateCrosshairOverlay(crosshairParam, true);
      }
      if (!this._touchDidMove) {
        this._ignoreCrosshairClickUntil = Date.now() + 650;
        this._suppressHostTapMenu();
        this._crosshairLocked = !this._crosshairLocked;
        if (this._crosshairLocked && crosshairParam) {
          this._updateCrosshairOverlay(crosshairParam, true);
        } else {
          this._hideCrosshairOverlay();
        }
      } else if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      this._activeTouchId = null;
      this._lastTouchParam = null;
      this._touchDidMove = false;
      return;
    }

    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      this._touchGestureMode = 'idle';
      this._touchDidMove = false;
      this._activeTouchId = null;
      this._lastTouchParam = null;
      return;
    }

    var touch = this._findTrackedTouch(event.changedTouches || event.touches);
    var param = touch ? this._buildSyntheticPointerParam(touch) : this._lastTouchParam;
    if (!param) {
      this._activeTouchId = null;
      return;
    }

    var shouldCommitOnRelease = (
      this._touchGestureMode === 'commit-second-anchor' ||
      (this._touchGestureMode === 'drag-from-first-anchor' && this._touchDidMove)
    );
    if (shouldCommitOnRelease && param && typeof tool._handleClick === 'function') {
      this._updateCrosshairOverlay(param, true);
      tool._handleClick(param);
    }

    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._activeTouchId = null;
    this._lastTouchParam = null;
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchCancel = function (event) {
    if (this._lineEditState) {
      this._endLineEdit(false);
    }
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._activeTouchId = null;
    this._lastTouchParam = null;
    this._lastTextEditTap = null;
    var cancelRemaining = (event && event.touches && typeof event.touches.length === 'number') ? event.touches.length : 0;
    if (cancelRemaining === 0) {
      this._gestureHadMultitouch = false;
      this._gestureToolActed = false;
    }
    if (this._activeTool === 'crosshair') {
      if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      return;
    }
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._applyChartInteractionMode = function () {
    if (!this._chart || typeof this._chart.applyOptions !== 'function') {
      return;
    }

    this._bindTouchBridge();
    var drawingMode = this._isDrawingToolActive();

    if (this._chartHost) {
      try {
        var lockedTouchMode = drawingMode;
        this._chartHost.style.touchAction = lockedTouchMode ? 'none' : 'manipulation';
        this._chartHost.style.userSelect = lockedTouchMode ? 'none' : '';
        this._chartHost.style.webkitUserSelect = lockedTouchMode ? 'none' : '';
      } catch (_error) {}
    }

    try {
      this._chart.applyOptions({
        handleScroll: drawingMode
          ? {
              mouseWheel: false,
              pressedMouseMove: false,
              horzTouchDrag: false,
              vertTouchDrag: false
            }
          : {
              mouseWheel: true,
              pressedMouseMove: true,
              horzTouchDrag: true,
              vertTouchDrag: true
            },
        handleScale: drawingMode
          ? {
              mouseWheel: false,
              pinch: false,
              axisPressedMouseMove: false
            }
          : {
              mouseWheel: true,
              pinch: true,
              axisPressedMouseMove: true
            }
      });
    } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype._nextLabel = function (kind) {
    var next = (this._drawingCounter[kind] || 0) + 1;
    this._drawingCounter[kind] = next;
    return defaultLabel(kind, next);
  };

  AdvancedDrawingToolsManager.prototype._requiredPointCount = function (kind) {
    var spec = ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[kind];
    return spec && typeof spec.requiredPointCount === 'number' ? spec.requiredPointCount : 0;
  };

  AdvancedDrawingToolsManager.prototype._detachRecord = function (record) {
    if (!record || !record.primitive) return;
    try { this._series.detachPrimitive(record.primitive); } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype._findRecordById = function (id) {
    if (!id) return null;
    for (var i = 0; i < this._records.length; i += 1) {
      if (this._records[i].id === id) return this._records[i];
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._isRecordPresentationVisible = function (record) {
    if (!record || !record.visible || this._hidden) return false;
    if (!this._activeTool || this._activeTool === 'none') return false;
    if (this._activeTool === 'crosshair') return true;
    return record.kind === this._activeTool;
  };

  AdvancedDrawingToolsManager.prototype._applyRecordPresentationVisibility = function (record) {
    if (!record || !record.primitive) return false;
    var visible = this._isRecordPresentationVisible(record);
    record.displayVisible = visible;
    if (typeof record.primitive.setVisible === 'function') {
      record.primitive.setVisible(visible);
    }
    if (!visible) {
      if (typeof record.primitive.setHovered === 'function') {
        record.primitive.setHovered(false);
      }
      if (typeof record.primitive.setSelected === 'function') {
        record.primitive.setSelected(false);
      }
    } else if (typeof record.primitive.setSelected === 'function') {
      record.primitive.setSelected(!!record.selected);
    }
    return visible;
  };

  AdvancedDrawingToolsManager.prototype._refreshRecordPresentationVisibility = function () {
    var selectedStillVisible = false;
    this._records.forEach(function (record) {
      var visible = this._applyRecordPresentationVisibility(record);
      if (visible && record.id === this._selectedRecordId) {
        selectedStillVisible = true;
      }
    }, this);
    if (this._selectedRecordId && !selectedStillVisible) {
      this._selectedRecordId = null;
    }
  };

  AdvancedDrawingToolsManager.prototype._setHoveredRecord = function (id) {
    if (this._hoveredRecordId === (id || null)) return;
    this._hoveredRecordId = id || null;
    this._records.forEach(function (record) {
      var hovered = !!id && record.id === id && this._isRecordPresentationVisible(record);
      if (record.primitive && typeof record.primitive.setHovered === 'function') {
        record.primitive.setHovered(hovered);
      }
    }, this);
  };

  AdvancedDrawingToolsManager.prototype._selectRecord = function (id) {
    var changed = false;
    var requested = id ? this._findRecordById(id) : null;
    var selectedId = requested && this._isRecordPresentationVisible(requested) ? id : null;
    this._selectedRecordId = selectedId;
    this._records.forEach(function (record) {
      var selected = !!selectedId && record.id === selectedId;
      if (!!record.selected !== selected) changed = true;
      record.selected = selected;
      if (record.primitive && typeof record.primitive.setSelected === 'function') {
        record.primitive.setSelected(selected);
      }
    });
    if (changed) {
      this._emitDrawingsChanged();
    }
  };

  AdvancedDrawingToolsManager.prototype._removeSelectedRecord = function () {
    var selectedId = this._selectedRecordId;
    if (!selectedId) return;
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    var removed = false;
    this._records = this._records.filter(function (record) {
      if (record.id !== selectedId) return true;
      this._detachRecord(record);
      removed = true;
      return false;
    }, this);
    this._selectedRecordId = null;
    if (removed) {
      this._emitDrawingsChanged();
    }
  };

  AdvancedDrawingToolsManager.prototype._distanceToPoint = function (a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  };

  AdvancedDrawingToolsManager.prototype._distanceToSegment = function (point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) {
      return this._distanceToPoint(point, a);
    }
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return this._distanceToPoint(point, {
      x: a.x + (t * dx),
      y: a.y + (t * dy)
    });
  };

  AdvancedDrawingToolsManager.prototype._hitTestTrendLineRecordAtPoint = function (record, point) {
    if (!record || !point || this._locked) return null;
    if (record.kind !== 'trendline' || record.locked || !this._isRecordPresentationVisible(record) || !record.primitive || typeof record.primitive.getGeometry !== 'function') {
      return null;
    }
    var handleThreshold = this.shouldUseDirectTouchInput() ? 18 : 10;
    var lineThreshold = this.shouldUseDirectTouchInput() ? 14 : 8;
    var geometry = record.primitive.getGeometry();
    if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
      return null;
    }
    var touchPoint = { x: point.x, y: point.y };
    if (this._distanceToPoint(touchPoint, geometry.p1) <= handleThreshold) {
      return { record: record, part: 'p1' };
    }
    if (this._distanceToPoint(touchPoint, geometry.p2) <= handleThreshold) {
      return { record: record, part: 'p2' };
    }
    if (this._distanceToSegment(touchPoint, geometry.p1, geometry.p2) <= lineThreshold) {
      return { record: record, part: 'body' };
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._hitTestTrendLineAtPoint = function (point) {
    if (!point || this._locked) return null;
    for (var i = this._records.length - 1; i >= 0; i -= 1) {
      var record = this._records[i];
      var lineHit = this._hitTestTrendLineRecordAtPoint(record, point);
      if (lineHit) return lineHit;
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._hitTestEditableDrawingAtPoint = function (point) {
    if (!point || this._locked) return null;
    var isTouch = this.shouldUseDirectTouchInput();
    for (var i = this._records.length - 1; i >= 0; i -= 1) {
      var record = this._records[i];
      if (!record || !this._isRecordPresentationVisible(record) || !record.primitive) {
        continue;
      }
      if (record.primitive && typeof record.primitive.hitTest === 'function') {
        var primitiveHit = record.primitive.hitTest(point, { isTouch: isTouch, manager: this, record: record });
        if (primitiveHit) {
          return {
            record: record,
            part: primitiveHit.part || 'body'
          };
        }
      }
      if (record.kind === 'trendline') {
        var lineHit = this._hitTestTrendLineRecordAtPoint(record, point);
        if (lineHit) return lineHit;
      }
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._resolveLineEditPoint = function (param) {
    var state = this._resolveCrosshairState(param);
    if (state && state.time !== null && state.time !== undefined && isFiniteNumber(state.price)) {
      var point = { time: state.time, price: state.price };
      if (state.timestamp !== undefined) point.timestamp = state.timestamp;
      if (state.dataIndex !== undefined) point.dataIndex = state.dataIndex;
      if (state.paneId !== undefined) point.paneId = state.paneId;
      return point;
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._beginLineEdit = function (param) {
    if (!param || !param.point || this._locked) return false;
    this._endTextRecordEdit(true);
    var hit = this._hitTestEditableDrawingAtPoint(param.point);
    if (!hit || !hit.record) {
      if (this._selectedRecordId) {
        this._selectRecord(null);
        return true;
      }
      return false;
    }
    if (hit.record.locked) {
      this._selectRecord(hit.record.id);
      return true;
    }
    var editPoint = this._resolveLineEditPoint(param);
    if (!editPoint) {
      this._selectRecord(hit.record.id);
      return true;
    }
    this._selectRecord(hit.record.id);
    this._lineEditState = {
      recordId: hit.record.id,
      part: hit.part,
      startPoint: clonePoint(editPoint),
      originalPoints: clonePoints(hit.record.points),
      moved: false
    };
    if (hit.record.primitive && typeof hit.record.primitive.beginEdit === 'function') {
      hit.record.primitive.beginEdit(hit.part, editPoint);
    }
    return true;
  };

  AdvancedDrawingToolsManager.prototype._buildEditedLinePoints = function (editPoint) {
    var state = this._lineEditState;
    if (!state || !editPoint || !Array.isArray(state.originalPoints)) {
      return null;
    }

    var record = this._findRecordById(state.recordId);
    var requiredPointCount = record ? this._requiredPointCount(record.kind) : 2;
    if (record && record.primitive && typeof record.primitive.buildEditPoints === 'function') {
      var customPoints = record.primitive.buildEditPoints(state.part, state.originalPoints, state.startPoint, editPoint);
      if (Array.isArray(customPoints) && customPoints.length >= requiredPointCount) {
        return clonePoints(customPoints.slice(0, requiredPointCount));
      }
    }

    if (state.originalPoints.length < 2) {
      return requiredPointCount === 1 ? clonePoints([editPoint]) : null;
    }

    var points = clonePoints(state.originalPoints);
    if (state.part === 'p1' || state.part === 'p2') {
      points[state.part === 'p1' ? 0 : 1] = clonePoint(editPoint);
      return points;
    }

    var priceDelta = editPoint.price - state.startPoint.price;
    var timeDelta = isFiniteNumber(editPoint.time) && isFiniteNumber(state.startPoint.time)
      ? editPoint.time - state.startPoint.time
      : 0;
    var dataIndexDelta = isFiniteNumber(editPoint.dataIndex) && isFiniteNumber(state.startPoint.dataIndex)
      ? editPoint.dataIndex - state.startPoint.dataIndex
      : null;

    return points.map(function (point) {
      var next = clonePoint(point);
      if (isFiniteNumber(next.time)) next.time += timeDelta;
      if (isFiniteNumber(next.timestamp)) next.timestamp += timeDelta;
      if (dataIndexDelta !== null && isFiniteNumber(next.dataIndex)) next.dataIndex += dataIndexDelta;
      next.price = point.price + priceDelta;
      return next;
    });
  };

  AdvancedDrawingToolsManager.prototype._applyLineEditPoints = function (record, points) {
    if (!record || !Array.isArray(points)) return;
    var requiredPointCount = Math.max(1, this._requiredPointCount(record.kind) || points.length);
    if (points.length < requiredPointCount) return;
    record.points = clonePoints(points.slice(0, requiredPointCount));
    if (record.primitive && typeof record.primitive.updatePoints === 'function') {
      record.primitive.updatePoints.apply(record.primitive, record.points);
    }
    if (record.primitive && typeof record.primitive.getSerializableState === 'function') {
      var state = record.primitive.getSerializableState();
      if (state && typeof state === 'object') {
        [
          'text',
          'style',
          'levelLine',
          'labelPosition',
          'labelOffset',
          'showPrice',
          'showPriceAxisLabel',
          'levelType',
          'followLastPrice',
          'alertMetadata'
        ].forEach(function (key) {
          if (state[key] !== undefined) {
            record[key] = cloneSerializable(state[key], state[key]);
          }
        });
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._flushLineEditFrame = function () {
    this._lineEditPendingFrame = 0;
    var pending = this._lineEditPendingPoints;
    this._lineEditPendingPoints = null;
    if (!pending || !this._lineEditState) return;
    var record = this._findRecordById(this._lineEditState.recordId);
    this._applyLineEditPoints(record, pending);
  };

  AdvancedDrawingToolsManager.prototype._queueLineEditPoints = function (points) {
    this._lineEditPendingPoints = points;
    if (this._lineEditPendingFrame) return;
    var manager = this;
    if (typeof requestAnimationFrame === 'function') {
      this._lineEditPendingFrame = requestAnimationFrame(function () {
        manager._flushLineEditFrame();
      });
    } else {
      this._flushLineEditFrame();
    }
  };

  AdvancedDrawingToolsManager.prototype._updateLineEdit = function (param) {
    if (!this._lineEditState || !param) return false;
    var editPoint = this._resolveLineEditPoint(param);
    if (!editPoint) return true;
    var points = this._buildEditedLinePoints(editPoint);
    if (!points) return true;
    this._lineEditState.moved = true;
    this._queueLineEditPoints(points);
    return true;
  };

  AdvancedDrawingToolsManager.prototype._endLineEdit = function (commit) {
    var state = this._lineEditState;
    if (this._lineEditPendingFrame && typeof cancelAnimationFrame === 'function') {
      try { cancelAnimationFrame(this._lineEditPendingFrame); } catch (_error) {}
    }
    this._lineEditPendingFrame = 0;
    if (this._lineEditPendingPoints) {
      this._flushLineEditFrame();
    }
    this._lineEditState = null;
    this._lineEditPendingPoints = null;
    if (!state) return;
    var record = this._findRecordById(state.recordId);
    if (!record) return;
    if (!commit) {
      if (record.primitive && typeof record.primitive.endEdit === 'function') {
        record.primitive.endEdit(false);
      }
      this._applyLineEditPoints(record, state.originalPoints);
      return;
    }
    if (record.primitive && typeof record.primitive.endEdit === 'function') {
      record.primitive.endEdit(true);
    }
    if (state.moved) {
      record.updatedAt = Date.now();
      this._emitDrawingsChanged();
    }
  };

  AdvancedDrawingToolsManager.prototype._recountDrawingCounters = function () {
    this._drawingCounter = {};
    this._records.forEach(function (record) {
      this._drawingCounter[record.kind] = (this._drawingCounter[record.kind] || 0) + 1;
    }, this);
  };

  AdvancedDrawingToolsManager.prototype._sanitizeSerializedRecord = function (record, index) {
    if (!record || typeof record !== 'object' || !record.kind || !this._tools[record.kind]) {
      return null;
    }

    var requiredPointCount = this._requiredPointCount(record.kind);
    var points = Array.isArray(record.points)
      ? record.points
        .map(function (point) {
          if (!point || typeof point !== 'object' || point.time === undefined || typeof point.price !== 'number' || !isFinite(point.price)) {
            return null;
          }
          return clonePoint(point);
        })
        .filter(function (point) { return point !== null; })
        .slice(0, requiredPointCount)
      : [];

    if (points.length < requiredPointCount) {
      return null;
    }

    var recordVisible = typeof record.visible === 'boolean' ? record.visible : !record.hidden;

    return {
      id: typeof record.id === 'string' && record.id ? record.id : record.kind + '_restored_' + (index + 1),
      kind: record.kind,
      type: typeof record.type === 'string' ? record.type : record.kind,
      symbol: typeof record.symbol === 'string' ? record.symbol : undefined,
      timeframe: typeof record.timeframe === 'string' ? record.timeframe : undefined,
      paneId: typeof record.paneId === 'string' ? record.paneId : undefined,
      label: typeof record.label === 'string' && record.label ? record.label : defaultLabel(record.kind, index + 1),
      hidden: !recordVisible,
      visible: recordVisible,
      points: points,
      text: typeof record.text === 'string' ? record.text : undefined,
      style: record.style && typeof record.style === 'object' ? Object.assign({}, record.style) : undefined,
      levelLine: record.levelLine && typeof record.levelLine === 'object' ? cloneSerializable(record.levelLine, undefined) : undefined,
      labelPosition: typeof record.labelPosition === 'string' ? record.labelPosition : undefined,
      labelOffset: record.labelOffset && typeof record.labelOffset === 'object' ? cloneSerializable(record.labelOffset, undefined) : undefined,
      showPrice: typeof record.showPrice === 'boolean' ? record.showPrice : undefined,
      showPriceAxisLabel: typeof record.showPriceAxisLabel === 'boolean' ? record.showPriceAxisLabel : undefined,
      levelType: typeof record.levelType === 'string' ? record.levelType : undefined,
      followLastPrice: !!record.followLastPrice,
      levels: Array.isArray(record.levels) ? cloneSerializable(record.levels, []) : undefined,
      extendMode: typeof record.extendMode === 'string' ? record.extendMode : undefined,
      zoneType: typeof record.zoneType === 'string' ? record.zoneType : undefined,
      extendUntil: typeof record.extendUntil === 'string' ? record.extendUntil : undefined,
      alertMetadata: record.alertMetadata && typeof record.alertMetadata === 'object' ? cloneSerializable(record.alertMetadata, undefined) : undefined,
      reverse: !!record.reverse,
      goldenPocket: record.goldenPocket && typeof record.goldenPocket === 'object' ? cloneSerializable(record.goldenPocket, undefined) : undefined,
      oteZone: record.oteZone && typeof record.oteZone === 'object' ? cloneSerializable(record.oteZone, undefined) : undefined,
      locked: !!record.locked,
      selected: !!record.selected,
      createdAt: isFiniteNumber(record.createdAt) ? record.createdAt : undefined,
      updatedAt: isFiniteNumber(record.updatedAt) ? record.updatedAt : undefined
    };
  };

  AdvancedDrawingToolsManager.prototype._createPrimitiveForRecord = function (record) {
    var spec = ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[record.kind];
    return spec && typeof spec.createPrimitiveFromRecord === 'function'
      ? spec.createPrimitiveFromRecord(record)
      : null;
  };

  AdvancedDrawingToolsManager.prototype._emitDrawingsChanged = function () {
    safeNotify('DRAWINGS_CHANGED', {
      drawings: this._records.map(function (record) {
        return {
          id: record.id,
          kind: record.kind,
          label: record.label,
          hidden: !record.visible,
          points: clonePoints(record.points),
          text: record.text,
          type: record.type,
          symbol: record.symbol,
          timeframe: record.timeframe,
          paneId: record.paneId,
          style: record.style,
          levelLine: record.levelLine,
          labelPosition: record.labelPosition,
          labelOffset: record.labelOffset,
          showPrice: record.showPrice,
          showPriceAxisLabel: record.showPriceAxisLabel,
          levelType: record.levelType,
          followLastPrice: !!record.followLastPrice,
          levels: Array.isArray(record.levels) ? cloneSerializable(record.levels, []) : undefined,
          extendMode: record.extendMode,
          zoneType: record.zoneType,
          extendUntil: record.extendUntil,
          alertMetadata: record.alertMetadata,
          reverse: !!record.reverse,
          goldenPocket: record.goldenPocket,
          oteZone: record.oteZone,
          locked: !!record.locked,
          selected: !!record.selected,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        };
      })
    });
  };

  AdvancedDrawingToolsManager.prototype.publishDrawingsToHost = function () {
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.isLocked = function () {
    return this._locked;
  };

  AdvancedDrawingToolsManager.prototype.isStickyMode = function () {
    return this._sticky;
  };

  AdvancedDrawingToolsManager.prototype.registerDrawing = function (kind, primitive, label, serializedData) {
    var nextLabel = label || this._nextLabel(kind);
    var currentSymbol = this._crosshairConfig && typeof this._crosshairConfig.symbol === 'string' ? this._crosshairConfig.symbol : '';
    var currentTimeframe = this._crosshairConfig && typeof this._crosshairConfig.timeframe === 'string' ? this._crosshairConfig.timeframe : '';
    var record = {
      id: kind + '_' + Date.now() + '_' + (this._records.length + 1),
      kind: kind,
      label: nextLabel,
      primitive: primitive,
      hidden: !!this._hidden,
      visible: !this._hidden,
      points: clonePoints(serializedData && Array.isArray(serializedData.points) ? serializedData.points : []),
      text: serializedData && typeof serializedData.text === 'string' ? serializedData.text : undefined,
      type: serializedData && typeof serializedData.type === 'string' ? serializedData.type : kind,
      symbol: serializedData && typeof serializedData.symbol === 'string' ? serializedData.symbol : (currentSymbol || undefined),
      timeframe: serializedData && typeof serializedData.timeframe === 'string' ? serializedData.timeframe : (currentTimeframe || undefined),
      paneId: serializedData && typeof serializedData.paneId === 'string' ? serializedData.paneId : undefined,
      style: serializedData && serializedData.style && typeof serializedData.style === 'object' ? Object.assign({}, serializedData.style) : undefined,
      levelLine: serializedData && serializedData.levelLine && typeof serializedData.levelLine === 'object' ? cloneSerializable(serializedData.levelLine, undefined) : undefined,
      labelPosition: serializedData && typeof serializedData.labelPosition === 'string' ? serializedData.labelPosition : undefined,
      labelOffset: serializedData && serializedData.labelOffset && typeof serializedData.labelOffset === 'object' ? cloneSerializable(serializedData.labelOffset, undefined) : undefined,
      showPrice: serializedData && typeof serializedData.showPrice === 'boolean' ? serializedData.showPrice : undefined,
      showPriceAxisLabel: serializedData && typeof serializedData.showPriceAxisLabel === 'boolean' ? serializedData.showPriceAxisLabel : undefined,
      levelType: serializedData && typeof serializedData.levelType === 'string' ? serializedData.levelType : undefined,
      followLastPrice: !!(serializedData && serializedData.followLastPrice),
      levels: serializedData && Array.isArray(serializedData.levels) ? cloneSerializable(serializedData.levels, []) : undefined,
      extendMode: serializedData && typeof serializedData.extendMode === 'string' ? serializedData.extendMode : undefined,
      zoneType: serializedData && typeof serializedData.zoneType === 'string' ? serializedData.zoneType : undefined,
      extendUntil: serializedData && typeof serializedData.extendUntil === 'string' ? serializedData.extendUntil : undefined,
      alertMetadata: serializedData && serializedData.alertMetadata && typeof serializedData.alertMetadata === 'object' ? cloneSerializable(serializedData.alertMetadata, undefined) : undefined,
      reverse: !!(serializedData && serializedData.reverse),
      goldenPocket: serializedData && serializedData.goldenPocket && typeof serializedData.goldenPocket === 'object' ? cloneSerializable(serializedData.goldenPocket, undefined) : undefined,
      oteZone: serializedData && serializedData.oteZone && typeof serializedData.oteZone === 'object' ? cloneSerializable(serializedData.oteZone, undefined) : undefined,
      locked: !!(serializedData && serializedData.locked),
      selected: !!(serializedData && serializedData.selected),
      createdAt: serializedData && isFiniteNumber(serializedData.createdAt) ? serializedData.createdAt : Date.now(),
      updatedAt: serializedData && isFiniteNumber(serializedData.updatedAt) ? serializedData.updatedAt : Date.now()
    };
    this._records.push(record);
    if (record.selected && this._isRecordPresentationVisible(record)) {
      this._selectedRecordId = record.id;
    }
    this._applyRecordPresentationVisibility(record);
    this._series.attachPrimitive(primitive);
    this._emitDrawingsChanged();
    if (serializedData && serializedData.editAfterCreate && this._isTextRecordEditable(record)) {
      var manager = this;
      setTimeout(function () {
        manager._selectRecord(record.id);
        manager._beginTextRecordEdit(record);
      }, 0);
    }
  };

  AdvancedDrawingToolsManager.prototype.setActiveTool = function (tool, silent, options) {
    this._stopAllTools();
    var shouldStartDrawing = !(options && options.startDrawing === false);
    if (tool === 'none' || !tool) {
      this._activeTool = 'none';
    } else if (tool === 'crosshair') {
      this._activeTool = 'crosshair';
    } else if (this._locked) {
      this._activeTool = 'none';
    } else if (this._tools[tool] && typeof this._tools[tool].startDrawing === 'function') {
      this._activeTool = tool;
      if (shouldStartDrawing) {
        this._tools[tool].startDrawing();
      }
    } else {
      this._activeTool = 'none';
    }
    if (this._activeTool !== 'crosshair') {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
    }
    this._refreshRecordPresentationVisibility();
    this._applyChartInteractionMode();
    if (!silent) {
      safeNotify('TOOL_ACTIVE_CHANGED', { tool: this._activeTool, drawingActive: this._isDrawingToolActive() });
    }
  };

  AdvancedDrawingToolsManager.prototype.finishDrawingTool = function (tool) {
    if (this._locked) {
      this._activeTool = 'none';
    } else if (tool && this._tools[tool]) {
      this._activeTool = tool;
    } else if (!this._activeTool) {
      this._activeTool = 'none';
    }
    if (this._activeTool !== 'crosshair') {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
    }
    this._refreshRecordPresentationVisibility();
    this._applyChartInteractionMode();
    safeNotify('TOOL_ACTIVE_CHANGED', { tool: this._activeTool, drawingActive: false });
  };

  AdvancedDrawingToolsManager.prototype.getActiveTool = function () {
    return this._activeTool;
  };

  AdvancedDrawingToolsManager.prototype.setDrawingsHidden = function (hidden) {
    this._hidden = !!hidden;
    if (this._hidden) {
      this._endLineEdit(false);
      this._endTextRecordEdit(false);
      this._selectRecord(null);
    }
    this._records.forEach(function (record) {
      record.hidden = !!this._hidden;
      record.visible = !this._hidden;
      this._applyRecordPresentationVisibility(record);
    }, this);
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.setDrawingsLocked = function (locked) {
    this._locked = !!locked;
    if (this._locked) {
      this._endLineEdit(false);
      this._endTextRecordEdit(false);
      this._selectRecord(null);
      this.setActiveTool('none');
    }
  };

  AdvancedDrawingToolsManager.prototype.setStayInDrawingMode = function (sticky) {
    this._sticky = !!sticky;
  };

  AdvancedDrawingToolsManager.prototype.zoomToFit = function () {
    try {
      this._chart.priceScale('right').applyOptions({ autoScale: true });
      this._chart.timeScale().fitContent();
      this._chart.timeScale().scrollToRealTime();
    } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype.setSerializedDrawings = function (drawings) {
    var nextRecords = Array.isArray(drawings)
      ? drawings
        .map(function (record, index) {
          return this._sanitizeSerializedRecord(record, index);
        }, this)
        .filter(function (record) { return record !== null; })
      : [];

    this._stopAllTools();
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    this._crosshairLocked = false;
    this._pendingCrosshairState = null;
    this._lastCrosshairState = null;
    this._hideCrosshairOverlay();
    this._selectedRecordId = null;
    this._records.forEach(function (record) {
      this._detachRecord(record);
    }, this);
    this._records = [];

    nextRecords.forEach(function (record) {
      var primitive = this._createPrimitiveForRecord(record);
      if (!primitive) return;
      record.primitive = primitive;
      record.hidden = this._hidden ? true : !!record.hidden;
      record.visible = !record.hidden;
      if (record.selected && this._isRecordPresentationVisible(record)) {
        this._selectedRecordId = record.id;
      }
      this._applyRecordPresentationVisibility(record);
      this._series.attachPrimitive(primitive);
      this._records.push(record);
    }, this);

    this._recountDrawingCounters();
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.removeAllDrawings = function () {
    this._stopAllTools();
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    this._records.forEach(function (record) {
      this._detachRecord(record);
    }, this);
    this._records = [];
    this._drawingCounter = {};
    this._selectedRecordId = null;
    this.setActiveTool('none');
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.remove = function () {
    try {
      if (this._chart && typeof this._chart.unsubscribeCrosshairMove === 'function') {
        this._chart.unsubscribeCrosshairMove(this._handleCrosshairMove);
      }
    } catch (_unsubscribeMoveError) {}
    try {
      if (this._chart && typeof this._chart.unsubscribeClick === 'function') {
        this._chart.unsubscribeClick(this._handleCrosshairClick);
      }
    } catch (_unsubscribeClickError) {}
    try {
      if (typeof document !== 'undefined' && document && typeof document.removeEventListener === 'function') {
        document.removeEventListener('keydown', this._handleKeyDown, true);
        document.removeEventListener('keyup', this._handleKeyUp, true);
      }
    } catch (_keyError) {}
    this._stopAllTools();
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    this._records.forEach(function (record) {
      this._detachRecord(record);
    }, this);
    this._records = [];
    this._drawingCounter = {};
    this._selectedRecordId = null;
    this._activeTool = 'none';
    this._unbindTouchBridge();
    this._destroyCrosshairOverlay();
    Object.keys(this._tools).forEach(function (key) {
      var tool = this._tools[key];
      if (tool && typeof tool.remove === 'function') {
        tool.remove();
      }
    }, this);
  };

  window.DrawingToolsManager = AdvancedDrawingToolsManager;
})();
`;
