import type { EnhancedDrawingToolRuntime } from '../types';

export const measureRangeEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'measure',
  script: `
  registerEnhancedDrawingTool({
    kind: 'measure',
    defaultLabel: 'Measure',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('measure', chart, series, manager, {
        fillColor: 'rgba(148, 163, 184, 0.08)',
        previewFillColor: 'rgba(148, 163, 184, 0.04)',
        borderColor: '#94A3B8',
        borderWidth: 1.1,
        labelBuilder: function (p1, p2) {
          return formatDelta(p2.price - p1.price) + ' / ' + formatDuration(Math.abs(Number(p2.time) - Number(p1.time)));
        },
        labelBackgroundColor: 'rgba(15, 23, 42, 0.9)',
        labelTextColor: '#E2E8F0'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createBoxPrimitive(points[0], points[1], {
        fillColor: 'rgba(148, 163, 184, 0.08)',
        borderColor: '#94A3B8',
        borderWidth: 1.1,
        label: formatDelta(points[1].price - points[0].price) + ' / ' + formatDuration(Math.abs(Number(points[1].time) - Number(points[0].time))),
        labelBackgroundColor: 'rgba(15, 23, 42, 0.9)',
        labelTextColor: '#E2E8F0',
        fontSize: 11
      });
    }
  });
`,
};
