import type { EnhancedDrawingToolRuntime } from '../types';

export const textLabelEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'text',
  script: `
  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'text',
    defaultLabel: 'Text',
    requiredPointCount: 1,
    createTool: function (chart, series, manager) {
      return new LabelTool('text', chart, series, manager, {
        text: 'TXT',
        backgroundColor: 'rgba(37, 99, 235, 0.94)',
        textColor: '#FFFFFF',
        anchorColor: '#60A5FA'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createPointLabelPrimitive(points[0], {
        text: record.text || 'TXT',
        backgroundColor: 'rgba(37, 99, 235, 0.94)',
        textColor: '#FFFFFF',
        anchorColor: '#60A5FA',
        fontSize: 11
      });
    }
  });
`,
};
