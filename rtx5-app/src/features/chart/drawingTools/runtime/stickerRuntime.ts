import type { EnhancedDrawingToolRuntime } from '../types';

export const stickerEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'smiley',
  script: `
  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'smiley',
    defaultLabel: 'Sticker',
    requiredPointCount: 1,
    createTool: function (chart, series, manager) {
      return new LabelTool('smiley', chart, series, manager, {
        text: ':)',
        backgroundColor: 'rgba(245, 158, 11, 0.94)',
        textColor: '#0F172A',
        anchorColor: '#F59E0B'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createPointLabelPrimitive(points[0], {
        text: record.text || ':)',
        backgroundColor: 'rgba(245, 158, 11, 0.94)',
        textColor: '#0F172A',
        anchorColor: '#F59E0B',
        fontSize: 11
      });
    }
  });
`,
};
