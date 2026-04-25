import type { EnhancedDrawingToolRuntime } from '../types';

export const patternPathEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'patterns',
  script: `
  function PatternTool(chart, series, manager) {
    BaseTool.call(this, 'patterns', chart, series, manager);
    this._points = [];
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
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
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'patterns',
    defaultLabel: 'Pattern',
    requiredPointCount: 3,
    createTool: function (chart, series, manager) {
      return new PatternTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createPolylinePrimitive(points, {
        color: '#A855F7',
        width: 1.8,
        label: 'Pattern ' + formatDelta(points[points.length - 1].price - points[0].price),
        labelBackgroundColor: 'rgba(88, 28, 135, 0.92)',
        labelTextColor: '#F3E8FF'
      });
    }
  });
`,
};
