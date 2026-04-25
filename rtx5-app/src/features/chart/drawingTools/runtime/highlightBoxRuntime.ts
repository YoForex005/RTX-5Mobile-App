import type { EnhancedDrawingToolRuntime } from '../types';

export const highlightBoxEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'brush',
  script: `
  registerEnhancedDrawingTool({
    kind: 'brush',
    defaultLabel: 'Highlight',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('brush', chart, series, manager, {
        fillColor: 'rgba(59, 130, 246, 0.16)',
        previewFillColor: 'rgba(59, 130, 246, 0.08)',
        borderColor: '#3B82F6',
        borderWidth: 1.2,
        label: 'Highlight',
        labelBackgroundColor: 'rgba(30, 64, 175, 0.92)',
        labelTextColor: '#DBEAFE'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createBoxPrimitive(points[0], points[1], {
        fillColor: 'rgba(59, 130, 246, 0.16)',
        borderColor: '#3B82F6',
        borderWidth: 1.2,
        label: 'Highlight',
        labelBackgroundColor: 'rgba(30, 64, 175, 0.92)',
        labelTextColor: '#DBEAFE',
        fontSize: 11
      });
    }
  });
`,
};
