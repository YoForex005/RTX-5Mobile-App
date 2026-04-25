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
    return {
      time: point.time,
      price: point.price
    };
  }

  function clonePoints(points) {
    return Array.isArray(points)
      ? points.map(function (point) { return clonePoint(point); })
      : [];
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
        var x1 = Math.round(p1p.x * scope.horizontalPixelRatio);
        var y1 = Math.round(p1p.y * scope.verticalPixelRatio);
        var x2 = Math.round(p2p.x * scope.horizontalPixelRatio);
        var y2 = Math.round(p2p.y * scope.verticalPixelRatio);
        ctx.save();
        ctx.lineWidth = source._options.width * scope.horizontalPixelRatio;
        ctx.strokeStyle = source._options.color;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.fillStyle = source._options.color;
        ctx.beginPath();
        ctx.arc(x1, y1, 3 * scope.horizontalPixelRatio, 0, Math.PI * 2);
        ctx.arc(x2, y2, 3 * scope.horizontalPixelRatio, 0, Math.PI * 2);
        ctx.fill();
        if (source._options.label) {
          ctx.font = '600 ' + Math.round(source._options.fontSize * scope.horizontalPixelRatio) + 'px Arial';
          var padding = 6 * scope.horizontalPixelRatio;
          var textWidth = ctx.measureText(source._options.label).width;
          var lx = x2 + padding;
          var ly = y2 - (source._options.fontSize + padding * 0.35);
          roundRectPath(ctx, lx - padding * 0.65, ly - padding * 0.85, textWidth + padding * 1.3, source._options.fontSize + padding * 1.2, 6 * scope.horizontalPixelRatio);
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
      var timeScale = this._source.chart.timeScale();
      this._points.p1 = {
        x: timeScale.timeToCoordinate(this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      this._points.p2 = {
        x: timeScale.timeToCoordinate(this._source._p2.time),
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
        width: 2,
        visible: true,
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
    LinePrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = pointA;
      this._p2 = pointB;
      this.requestUpdate();
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
      var timeScale = this._source.chart.timeScale();
      this._coords = this._source._points.map(function (point) {
        return {
          x: timeScale.timeToCoordinate(point.time),
          y: series.priceToCoordinate(point.price)
        };
      });
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
      var timeScale = this._source.chart.timeScale();
      this._points.p1 = {
        x: timeScale.timeToCoordinate(this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      this._points.p2 = {
        x: timeScale.timeToCoordinate(this._source._p2.time),
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
      var timeScale = this._source.chart.timeScale();
      this._coords = {
        x: timeScale.timeToCoordinate(this._source._point.time),
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
      var timeScale = this._source.chart.timeScale();
      this._coords.p1 = { x: timeScale.timeToCoordinate(this._source._p1.time), y: series.priceToCoordinate(this._source._p1.price) };
      this._coords.p2 = { x: timeScale.timeToCoordinate(this._source._p2.time), y: series.priceToCoordinate(this._source._p2.price) };
      this._coords.p3 = { x: timeScale.timeToCoordinate(this._source._p3.time), y: series.priceToCoordinate(this._source._p3.price) };
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
    var price = this._series.coordinateToPrice(param.point.y);
    if (price === null || price === undefined) return null;
    return { time: param.time, price: price };
  };

  BaseTool.prototype._completeDrawing = function (primitive, explicitLabel, serializedData) {
    if (!primitive) return;
    this._manager.registerDrawing(this._kind, primitive, explicitLabel, serializedData);
    if (this._manager.isStickyMode()) {
      this._drawing = true;
      if (typeof this._resetDrawingSession === 'function') this._resetDrawingSession();
    } else {
      this.stopDrawing();
      this._manager.setActiveTool('crosshair');
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
    this._activeTool = 'crosshair';
    this._hidden = false;
    this._locked = false;
    this._sticky = false;
    this._magnetEnabled = false;
    this._drawingCounter = {};
    this._records = [];
    this._chartHost = null;
    this._activeTouchId = null;
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    this._handleTouchCancel = this._handleTouchCancel.bind(this);
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
    return !this._locked && !!this._tools[this._activeTool];
  };

  AdvancedDrawingToolsManager.prototype.shouldUseDirectTouchInput = function () {
    return hasTouchSupport();
  };

  AdvancedDrawingToolsManager.prototype._bindTouchBridge = function () {
    if (!this.shouldUseDirectTouchInput() || typeof document === 'undefined') {
      return;
    }

    var host = document.getElementById('chart');
    if (!host || host === this._chartHost) {
      return;
    }

    this._unbindTouchBridge();
    this._chartHost = host;
    host.addEventListener('touchstart', this._handleTouchStart, { capture: true, passive: false });
    host.addEventListener('touchmove', this._handleTouchMove, { capture: true, passive: false });
    host.addEventListener('touchend', this._handleTouchEnd, { capture: true, passive: false });
    host.addEventListener('touchcancel', this._handleTouchCancel, { capture: true, passive: false });
  };

  AdvancedDrawingToolsManager.prototype._unbindTouchBridge = function () {
    if (!this._chartHost) {
      return;
    }

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
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
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
    if (
      !this._magnetEnabled ||
      !timeScale ||
      typeof timeScale.timeToIndex !== 'function' ||
      !this._series ||
      typeof this._series.dataByIndex !== 'function'
    ) {
      return null;
    }

    try {
      var index = timeScale.timeToIndex(time, true);
      if (index === null || index === undefined) {
        return null;
      }

      var bar = this._series.dataByIndex(index, 0);
      if (!bar || typeof bar !== 'object') {
        return null;
      }

      var candidates = [];
      if (typeof bar.open === 'number') candidates.push(bar.open);
      if (typeof bar.high === 'number') candidates.push(bar.high);
      if (typeof bar.low === 'number') candidates.push(bar.low);
      if (typeof bar.close === 'number') candidates.push(bar.close);
      if (typeof bar.value === 'number') candidates.push(bar.value);

      if (!candidates.length) {
        return null;
      }

      var nearest = candidates[0];
      var minDistance = Math.abs(nearest - price);
      for (var i = 1; i < candidates.length; i++) {
        var candidate = candidates[i];
        var distance = Math.abs(candidate - price);
        if (distance < minDistance) {
          nearest = candidate;
          minDistance = distance;
        }
      }

      return nearest;
    } catch (_error) {
      return null;
    }
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

    var time = timeScale.coordinateToTime(x);
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

  AdvancedDrawingToolsManager.prototype._handleTouchStart = function (event) {
    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      return;
    }

    if (event.touches && event.touches.length > 1) {
      this._activeTouchId = null;
      return;
    }

    var touch = this._findTrackedTouch(event.changedTouches || event.touches);
    if (!touch) {
      return;
    }

    this._activeTouchId = touch.identifier;
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
      this._touchDidMove = true;
      tool._handleMove(param);
    }
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchEnd = function (event) {
    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      this._touchGestureMode = 'idle';
      this._touchDidMove = false;
      this._activeTouchId = null;
      return;
    }

    var touch = this._findTrackedTouch(event.changedTouches || event.touches);
    if (!touch) {
      this._activeTouchId = null;
      return;
    }

    var param = this._buildSyntheticPointerParam(touch);
    var shouldCommitOnRelease = (
      this._touchGestureMode === 'commit-second-anchor' ||
      (this._touchGestureMode === 'drag-from-first-anchor' && this._touchDidMove)
    );
    if (shouldCommitOnRelease && param && typeof tool._handleClick === 'function') {
      tool._handleClick(param);
    }

    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._activeTouchId = null;
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchCancel = function (event) {
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._activeTouchId = null;
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
        this._chartHost.style.touchAction = drawingMode ? 'none' : 'manipulation';
        this._chartHost.style.userSelect = drawingMode ? 'none' : '';
        this._chartHost.style.webkitUserSelect = drawingMode ? 'none' : '';
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

    return {
      id: typeof record.id === 'string' && record.id ? record.id : record.kind + '_restored_' + (index + 1),
      kind: record.kind,
      label: typeof record.label === 'string' && record.label ? record.label : defaultLabel(record.kind, index + 1),
      hidden: !!record.hidden,
      visible: !record.hidden,
      points: points,
      text: typeof record.text === 'string' ? record.text : undefined
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
          text: record.text
        };
      })
    });
  };

  AdvancedDrawingToolsManager.prototype.isLocked = function () {
    return this._locked;
  };

  AdvancedDrawingToolsManager.prototype.isStickyMode = function () {
    return this._sticky;
  };

  AdvancedDrawingToolsManager.prototype.registerDrawing = function (kind, primitive, label, serializedData) {
    var nextLabel = label || this._nextLabel(kind);
    var record = {
      id: kind + '_' + Date.now() + '_' + (this._records.length + 1),
      kind: kind,
      label: nextLabel,
      primitive: primitive,
      hidden: !!this._hidden,
      visible: !this._hidden,
      points: clonePoints(serializedData && Array.isArray(serializedData.points) ? serializedData.points : []),
      text: serializedData && typeof serializedData.text === 'string' ? serializedData.text : undefined
    };
    if (typeof primitive.setVisible === 'function') {
      primitive.setVisible(record.visible);
    }
    this._series.attachPrimitive(primitive);
    this._records.push(record);
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.setActiveTool = function (tool, silent) {
    this._stopAllTools();
    if (tool === 'crosshair' || !tool) {
      this._activeTool = 'crosshair';
    } else if (this._locked) {
      this._activeTool = 'crosshair';
    } else if (this._tools[tool] && typeof this._tools[tool].startDrawing === 'function') {
      this._activeTool = tool;
      this._tools[tool].startDrawing();
    } else {
      this._activeTool = 'crosshair';
    }
    this._applyChartInteractionMode();
    if (!silent) {
      safeNotify('TOOL_ACTIVE_CHANGED', { tool: this._activeTool });
    }
  };

  AdvancedDrawingToolsManager.prototype.getActiveTool = function () {
    return this._activeTool;
  };

  AdvancedDrawingToolsManager.prototype.setDrawingsHidden = function (hidden) {
    this._hidden = !!hidden;
    this._records.forEach(function (record) {
      record.hidden = !!this._hidden;
      record.visible = !this._hidden;
      if (record.primitive && typeof record.primitive.setVisible === 'function') {
        record.primitive.setVisible(record.visible);
      }
    }, this);
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.setDrawingsLocked = function (locked) {
    this._locked = !!locked;
    if (this._locked) {
      this.setActiveTool('crosshair');
    }
  };

  AdvancedDrawingToolsManager.prototype.setStayInDrawingMode = function (sticky) {
    this._sticky = !!sticky;
  };

  AdvancedDrawingToolsManager.prototype.setMagnetMode = function (enabled) {
    this._magnetEnabled = !!enabled;
    if (this._chart && typeof this._chart.applyOptions === 'function') {
      this._chart.applyOptions({
        crosshair: {
          mode: enabled ? LightweightCharts.CrosshairMode.MagnetOHLC : LightweightCharts.CrosshairMode.Normal
        }
      });
    }
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
      if (typeof primitive.setVisible === 'function') {
        primitive.setVisible(record.visible);
      }
      this._series.attachPrimitive(primitive);
      this._records.push(record);
    }, this);

    this._recountDrawingCounters();
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.removeAllDrawings = function () {
    this._stopAllTools();
    this._records.forEach(function (record) {
      this._detachRecord(record);
    }, this);
    this._records = [];
    this._drawingCounter = {};
    this.setActiveTool('crosshair');
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.remove = function () {
    this.removeAllDrawings();
    this._unbindTouchBridge();
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
