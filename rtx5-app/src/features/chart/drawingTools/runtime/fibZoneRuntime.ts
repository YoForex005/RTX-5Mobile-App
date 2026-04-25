import type { EnhancedDrawingToolRuntime } from '../types';

export const fibZoneEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'fib',
  script: `
  registerEnhancedDrawingTool({
    kind: 'fib',
    defaultLabel: 'Fib Zone',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('fib', chart, series, manager, {
        fillColor: 'rgba(245, 158, 11, 0.16)',
        previewFillColor: 'rgba(245, 158, 11, 0.08)',
        borderColor: '#F59E0B',
        borderWidth: 1.3,
        label: 'Fib Zone',
        labelBackgroundColor: 'rgba(146, 64, 14, 0.92)',
        labelTextColor: '#FDE68A'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createBoxPrimitive(points[0], points[1], {
        fillColor: 'rgba(245, 158, 11, 0.16)',
        borderColor: '#F59E0B',
        borderWidth: 1.3,
        label: 'Fib Zone',
        labelBackgroundColor: 'rgba(146, 64, 14, 0.92)',
        labelTextColor: '#FDE68A',
        fontSize: 11
      });
    }
  });
`,
};
