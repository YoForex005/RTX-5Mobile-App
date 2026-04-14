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

  function defaultLabel(kind, index) {
    var names = {
      trendline: 'Trend Line',
      patterns: 'Pattern',
      fib: 'Fib Zone',
      brush: 'Highlight',
      text: 'Text',
      prediction: 'Position',
      pitchfork: 'Pitchfork',
      smiley: 'Sticker',
      measure: 'Measure'
    };
    return (names[kind] || 'Object') + ' ' + index;
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

  function TrendLineTool(chart, series, manager) {
    BaseTool.call(this, 'trendline', chart, series, manager);
    this._points = [];
    this._handleClick = this._handleClick.bind(this);
    this._chart.subscribeClick(this._handleClick);
  }

  TrendLineTool.prototype = Object.create(BaseTool.prototype);
  TrendLineTool.prototype.constructor = TrendLineTool;
  TrendLineTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._points = [];
  };
  TrendLineTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._points = [];
  };
  TrendLineTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length >= 2) {
      this._completeDrawing(createLinePrimitive(this._points[0], this._points[1], {
        color: '#3B82F6',
        width: 2,
        label: formatDelta(this._points[1].price - this._points[0].price)
      }), null, {
        points: clonePoints(this._points.slice(0, 2))
      });
    }
  };
  TrendLineTool.prototype.remove = function () {
    this.stopDrawing();
    this._chart.unsubscribeClick(this._handleClick);
  };

  function PatternTool(chart, series, manager) {
    BaseTool.call(this, 'patterns', chart, series, manager);
    this._points = [];
    this._handleClick = this._handleClick.bind(this);
    this._chart.subscribeClick(this._handleClick);
  }

  PatternTool.prototype = Object.create(BaseTool.prototype);
  PatternTool.prototype.constructor = PatternTool;
  PatternTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._points = [];
  };
  PatternTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._points = [];
  };
  PatternTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length >= 3) {
      var points = this._points.slice(0, 3);
      var patternLabel = 'Pattern ' + formatDelta(points[points.length - 1].price - points[0].price);
      this._completeDrawing(createPolylinePrimitive(points, {
        color: '#A855F7',
        width: 1.8,
        label: patternLabel,
        labelBackgroundColor: 'rgba(88, 28, 135, 0.92)',
        labelTextColor: '#F3E8FF'
      }), patternLabel, {
        points: clonePoints(points)
      });
    }
  };
  PatternTool.prototype.remove = function () {
    this.stopDrawing();
    this._chart.unsubscribeClick(this._handleClick);
  };

  function BoxTool(kind, chart, series, manager, options) {
    BaseTool.call(this, kind, chart, series, manager);
    this._points = [];
    this._preview = null;
    this._options = options || {};
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._chart.subscribeClick(this._handleClick);
    this._chart.subscribeCrosshairMove(this._handleMove);
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
    this._chart.unsubscribeClick(this._handleClick);
    this._chart.unsubscribeCrosshairMove(this._handleMove);
  };

  function LabelTool(kind, chart, series, manager, options) {
    BaseTool.call(this, kind, chart, series, manager);
    this._options = options || {};
    this._handleClick = this._handleClick.bind(this);
    this._chart.subscribeClick(this._handleClick);
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
    this._chart.unsubscribeClick(this._handleClick);
  };

  function PitchforkTool(chart, series, manager) {
    BaseTool.call(this, 'pitchfork', chart, series, manager);
    this._points = [];
    this._handleClick = this._handleClick.bind(this);
    this._chart.subscribeClick(this._handleClick);
  }

  PitchforkTool.prototype = Object.create(BaseTool.prototype);
  PitchforkTool.prototype.constructor = PitchforkTool;
  PitchforkTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._points = [];
  };
  PitchforkTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._points = [];
  };
  PitchforkTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length >= 3) {
      this._completeDrawing(createPitchforkPrimitive(this._points[0], this._points[1], this._points[2], {
        color: '#8B5CF6',
        width: 1.6
      }), null, {
        points: clonePoints(this._points.slice(0, 3))
      });
    }
  };
  PitchforkTool.prototype.remove = function () {
    this.stopDrawing();
    this._chart.unsubscribeClick(this._handleClick);
  };

  function AdvancedDrawingToolsManager(chart, series) {
    this._chart = chart;
    this._series = series;
    this._activeTool = 'crosshair';
    this._hidden = false;
    this._locked = false;
    this._sticky = false;
    this._drawingCounter = {};
    this._records = [];
    this._tools = {
      trendline: new TrendLineTool(chart, series, this),
      patterns: new PatternTool(chart, series, this),
      fib: new BoxTool('fib', chart, series, this, {
        fillColor: 'rgba(245, 158, 11, 0.16)',
        previewFillColor: 'rgba(245, 158, 11, 0.08)',
        borderColor: '#F59E0B',
        borderWidth: 1.3,
        label: 'Fib Zone',
        labelBackgroundColor: 'rgba(146, 64, 14, 0.92)',
        labelTextColor: '#FDE68A'
      }),
      brush: new BoxTool('brush', chart, series, this, {
        fillColor: 'rgba(59, 130, 246, 0.16)',
        previewFillColor: 'rgba(59, 130, 246, 0.08)',
        borderColor: '#3B82F6',
        borderWidth: 1.2,
        label: 'Highlight',
        labelBackgroundColor: 'rgba(30, 64, 175, 0.92)',
        labelTextColor: '#DBEAFE'
      }),
      prediction: new BoxTool('prediction', chart, series, this, {
        fillColor: 'rgba(16, 185, 129, 0.15)',
        previewFillColor: 'rgba(16, 185, 129, 0.08)',
        borderColor: '#10B981',
        borderWidth: 1.4,
        labelBuilder: function (p1, p2) {
          var delta = p2.price - p1.price;
          var pct = p1.price ? (delta / p1.price) * 100 : 0;
          return 'Long ' + formatDelta(delta) + ' (' + pct.toFixed(2) + '%)';
        },
        labelBackgroundColor: 'rgba(6, 95, 70, 0.92)',
        labelTextColor: '#D1FAE5'
      }),
      measure: new BoxTool('measure', chart, series, this, {
        fillColor: 'rgba(148, 163, 184, 0.08)',
        previewFillColor: 'rgba(148, 163, 184, 0.04)',
        borderColor: '#94A3B8',
        borderWidth: 1.1,
        labelBuilder: function (p1, p2) {
          return formatDelta(p2.price - p1.price) + ' / ' + formatDuration(Math.abs(Number(p2.time) - Number(p1.time)));
        },
        labelBackgroundColor: 'rgba(15, 23, 42, 0.9)',
        labelTextColor: '#E2E8F0'
      }),
      text: new LabelTool('text', chart, series, this, {
        text: 'TXT',
        backgroundColor: 'rgba(37, 99, 235, 0.94)',
        textColor: '#FFFFFF',
        anchorColor: '#60A5FA'
      }),
      smiley: new LabelTool('smiley', chart, series, this, {
        text: ':)',
        backgroundColor: 'rgba(245, 158, 11, 0.94)',
        textColor: '#0F172A',
        anchorColor: '#F59E0B'
      }),
      pitchfork: new PitchforkTool(chart, series, this)
    };
    this._emitDrawingsChanged();
  }

  AdvancedDrawingToolsManager.prototype._stopAllTools = function () {
    Object.keys(this._tools).forEach(function (key) {
      this._tools[key].stopDrawing();
    }, this);
  };

  AdvancedDrawingToolsManager.prototype._nextLabel = function (kind) {
    var next = (this._drawingCounter[kind] || 0) + 1;
    this._drawingCounter[kind] = next;
    return defaultLabel(kind, next);
  };

  AdvancedDrawingToolsManager.prototype._requiredPointCount = function (kind) {
    return {
      trendline: 2,
      patterns: 3,
      fib: 2,
      brush: 2,
      prediction: 2,
      measure: 2,
      text: 1,
      smiley: 1,
      pitchfork: 3
    }[kind] || 0;
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
    var points = record.points || [];
    switch (record.kind) {
      case 'trendline':
        return createLinePrimitive(points[0], points[1], {
          color: '#3B82F6',
          width: 2,
          label: formatDelta(points[1].price - points[0].price)
        });
      case 'patterns':
        return createPolylinePrimitive(points, {
          color: '#A855F7',
          width: 1.8,
          label: 'Pattern ' + formatDelta(points[points.length - 1].price - points[0].price),
          labelBackgroundColor: 'rgba(88, 28, 135, 0.92)',
          labelTextColor: '#F3E8FF'
        });
      case 'fib':
        return createBoxPrimitive(points[0], points[1], {
          fillColor: 'rgba(245, 158, 11, 0.16)',
          borderColor: '#F59E0B',
          borderWidth: 1.3,
          label: 'Fib Zone',
          labelBackgroundColor: 'rgba(146, 64, 14, 0.92)',
          labelTextColor: '#FDE68A',
          fontSize: 11
        });
      case 'brush':
        return createBoxPrimitive(points[0], points[1], {
          fillColor: 'rgba(59, 130, 246, 0.16)',
          borderColor: '#3B82F6',
          borderWidth: 1.2,
          label: 'Highlight',
          labelBackgroundColor: 'rgba(30, 64, 175, 0.92)',
          labelTextColor: '#DBEAFE',
          fontSize: 11
        });
      case 'prediction':
        return createBoxPrimitive(points[0], points[1], {
          fillColor: 'rgba(16, 185, 129, 0.15)',
          borderColor: '#10B981',
          borderWidth: 1.4,
          label: 'Long ' + formatDelta(points[1].price - points[0].price) + ' (' + (points[0].price ? (((points[1].price - points[0].price) / points[0].price) * 100).toFixed(2) : '0.00') + '%)',
          labelBackgroundColor: 'rgba(6, 95, 70, 0.92)',
          labelTextColor: '#D1FAE5',
          fontSize: 11
        });
      case 'measure':
        return createBoxPrimitive(points[0], points[1], {
          fillColor: 'rgba(148, 163, 184, 0.08)',
          borderColor: '#94A3B8',
          borderWidth: 1.1,
          label: formatDelta(points[1].price - points[0].price) + ' / ' + formatDuration(Math.abs(Number(points[1].time) - Number(points[0].time))),
          labelBackgroundColor: 'rgba(15, 23, 42, 0.9)',
          labelTextColor: '#E2E8F0',
          fontSize: 11
        });
      case 'text':
        return createPointLabelPrimitive(points[0], {
          text: record.text || 'TXT',
          backgroundColor: 'rgba(37, 99, 235, 0.94)',
          textColor: '#FFFFFF',
          anchorColor: '#60A5FA',
          fontSize: 11
        });
      case 'smiley':
        return createPointLabelPrimitive(points[0], {
          text: record.text || ':)',
          backgroundColor: 'rgba(245, 158, 11, 0.94)',
          textColor: '#0F172A',
          anchorColor: '#F59E0B',
          fontSize: 11
        });
      case 'pitchfork':
        return createPitchforkPrimitive(points[0], points[1], points[2], {
          color: '#8B5CF6',
          width: 1.6
        });
      default:
        return null;
    }
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
    } else if (this._tools[tool]) {
      this._activeTool = tool;
      this._tools[tool].startDrawing();
    } else {
      this._activeTool = 'crosshair';
    }
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
    Object.keys(this._tools).forEach(function (key) {
      this._tools[key].remove();
    }, this);
  };

  window.DrawingToolsManager = AdvancedDrawingToolsManager;
})();
`;
