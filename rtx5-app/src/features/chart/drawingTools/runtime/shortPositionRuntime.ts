import type { EnhancedDrawingToolRuntime } from '../types';

export const shortPositionEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'shortPosition',
  script: `
  /**
   * Helper function: buildShortPositionLabel.
   */
  function buildShortPositionLabel(p1, p2) {
    var delta = p1.price - p2.price;
    var pct = p1.price ? (delta / p1.price) * 100 : 0;
    return 'Short ' + formatDelta(delta) + ' (' + pct.toFixed(2) + '%)';
  }

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'shortPosition',
    defaultLabel: 'Short Position',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('shortPosition', chart, series, manager, {
        fillColor: 'rgba(244, 63, 94, 0.14)',
        previewFillColor: 'rgba(244, 63, 94, 0.08)',
        borderColor: '#F43F5E',
        borderWidth: 1.4,
        labelBuilder: buildShortPositionLabel,
        labelBackgroundColor: 'rgba(127, 29, 29, 0.92)',
        labelTextColor: '#FFE4E6'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createBoxPrimitive(points[0], points[1], {
        fillColor: 'rgba(244, 63, 94, 0.14)',
        borderColor: '#F43F5E',
        borderWidth: 1.4,
        label: buildShortPositionLabel(points[0], points[1]),
        labelBackgroundColor: 'rgba(127, 29, 29, 0.92)',
        labelTextColor: '#FFE4E6',
        fontSize: 11
      });
    }
  });
`,
};
