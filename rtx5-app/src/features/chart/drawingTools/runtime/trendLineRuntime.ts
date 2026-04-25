import type { EnhancedDrawingToolRuntime } from '../types';

export const trendLineEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'trendline',
  script: `
  function TrendLineTool(chart, series, manager) {
    BaseTool.call(this, 'trendline', chart, series, manager);
    this._points = [];
    this._preview = null;
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
  TrendLineTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length === 1) {
      this._preview = createLinePrimitive(point, point, {
        color: '#3B82F6',
        width: 2,
        label: ''
      });
      this._series.attachPrimitive(this._preview);
      return;
    }
    if (this._points.length >= 2) {
      this._removePreview();
      this._completeDrawing(createLinePrimitive(this._points[0], this._points[1], {
        color: '#3B82F6',
        width: 2,
        label: formatDelta(this._points[1].price - this._points[0].price)
      }), null, {
        points: clonePoints(this._points.slice(0, 2))
      });
    }
  };
  TrendLineTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
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
      return createLinePrimitive(points[0], points[1], {
        color: '#3B82F6',
        width: 2,
        label: formatDelta(points[1].price - points[0].price)
      });
    }
  });
`,
};
