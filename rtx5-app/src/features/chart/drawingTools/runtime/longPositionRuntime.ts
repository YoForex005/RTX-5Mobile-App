import type { EnhancedDrawingToolRuntime } from '../types';

export const longPositionEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'prediction',
  script: `
  registerEnhancedDrawingTool({
    kind: 'prediction',
    defaultLabel: 'Position',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('prediction', chart, series, manager, {
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
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createBoxPrimitive(points[0], points[1], {
        fillColor: 'rgba(16, 185, 129, 0.15)',
        borderColor: '#10B981',
        borderWidth: 1.4,
        label: 'Long ' + formatDelta(points[1].price - points[0].price) + ' (' + (points[0].price ? (((points[1].price - points[0].price) / points[0].price) * 100).toFixed(2) : '0.00') + '%)',
        labelBackgroundColor: 'rgba(6, 95, 70, 0.92)',
        labelTextColor: '#D1FAE5',
        fontSize: 11
      });
    }
  });
`,
};
