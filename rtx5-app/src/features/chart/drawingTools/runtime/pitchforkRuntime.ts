import type { EnhancedDrawingToolRuntime } from '../types';

export const pitchforkEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'pitchfork',
  script: `
  function PitchforkTool(chart, series, manager) {
    BaseTool.call(this, 'pitchfork', chart, series, manager);
    this._points = [];
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
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
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'pitchfork',
    defaultLabel: 'Pitchfork',
    requiredPointCount: 3,
    createTool: function (chart, series, manager) {
      return new PitchforkTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createPitchforkPrimitive(points[0], points[1], points[2], {
        color: '#8B5CF6',
        width: 1.6
      });
    }
  });
`,
};
