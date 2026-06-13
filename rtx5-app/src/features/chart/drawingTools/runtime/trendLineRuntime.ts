import type { EnhancedDrawingToolRuntime } from '../types';

export const trendLineEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'trendline',
  script: `
  function normalizeTrendLineExtendMode(value) {
    return value === 'left' || value === 'right' || value === 'both' ? value : 'none';
  }

  function normalizeTrendLineStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#2962FF',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#1D4ED8',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#2563EB',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(8, source.width)) : 2,
      lineStyle: draft ? 'dashed' : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid'),
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : (draft ? 0.72 : 1),
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(15, 23, 42, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#FFFFFF'
    };
  }

  function buildTrendLinePrimitiveOptions(pointA, pointB, record, draft) {
    var style = normalizeTrendLineStyle(record && record.style, draft);
    return {
      color: style.color,
      selectedColor: style.selectedColor,
      hoverColor: style.hoverColor,
      width: style.width,
      lineStyle: style.lineStyle,
      opacity: style.opacity,
      extendMode: normalizeTrendLineExtendMode(record && record.extendMode),
      showHandles: !!draft,
      selected: !!(record && record.selected),
      draft: !!draft,
      handleFillColor: style.handleFillColor,
      label: draft ? '' : formatDelta(pointB.price - pointA.price),
      labelBackgroundColor: style.labelBackgroundColor,
      labelTextColor: style.labelTextColor
    };
  }

  function createTrendLinePrimitive(pointA, pointB, record, draft) {
    return createLinePrimitive(
      pointA,
      pointB,
      buildTrendLinePrimitiveOptions(pointA, pointB, record || {}, draft)
    );
  }

  function buildTrendLineRecord(points, style, extendMode) {
    var now = Date.now();
    return {
      type: 'trendline',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: Object.assign({}, normalizeTrendLineStyle(style, false)),
      extendMode: normalizeTrendLineExtendMode(extendMode),
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function TrendLineTool(chart, series, manager) {
    BaseTool.call(this, 'trendline', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeTrendLineStyle(null, false);
    this._extendMode = 'none';
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  TrendLineTool.prototype = Object.create(BaseTool.prototype);
  TrendLineTool.prototype.constructor = TrendLineTool;
  TrendLineTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  TrendLineTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  TrendLineTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  TrendLineTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  TrendLineTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  TrendLineTool.prototype._startPreview = function (point) {
    // Draft anchors use the same coordinate object as final drawings, so snapping and live coordinate math stay identical.
    this._preview = createTrendLinePrimitive(point, point, {
      style: this._style,
      extendMode: this._extendMode,
      selected: true
    }, true);
    this._series.attachPrimitive(this._preview);
  };
  TrendLineTool.prototype._completeTrendLine = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildTrendLineRecord(points, this._style, this._extendMode);
    this._completeDrawing(
      createTrendLinePrimitive(points[0], points[1], serialized, false),
      null,
      serialized
    );
  };
  TrendLineTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeTrendLine(point);
  };
  TrendLineTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    // Only the lightweight primitive mutates during preview; React persistence waits until the second anchor is confirmed.
    this._preview.updatePoints(this._points[0], point);
  };
  TrendLineTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'trendline',
    defaultLabel: 'Trend Line',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new TrendLineTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createTrendLinePrimitive(points[0], points[1], record, false);
    }
  });
`,
};
