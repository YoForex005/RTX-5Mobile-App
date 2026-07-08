import type { EnhancedDrawingToolRuntime } from '../types';

export const longPositionEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'prediction',
  script: `
  function buildLongPositionLabel(p1, p2) {
    var delta = p2.price - p1.price;
    var pct = p1.price ? (delta / p1.price) * 100 : 0;
    return 'Long ' + formatDelta(delta) + ' (' + pct.toFixed(2) + '%)';
  }

  function normalizeLongPositionStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    var borderColor = typeof source.borderColor === 'string'
      ? source.borderColor
      : (typeof source.color === 'string' ? source.color : '#10B981');
    var borderStyle = source.borderStyle === 'dashed' || source.borderStyle === 'dotted'
      ? source.borderStyle
      : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid');
    return {
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : 'rgba(16, 185, 129, 0.15)',
      borderColor: borderColor,
      borderWidth: isFiniteNumber(source.borderWidth || source.width) ? Math.max(1, Math.min(8, source.borderWidth || source.width)) : 1.4,
      borderStyle: borderStyle,
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(6, 95, 70, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#D1FAE5'
    };
  }

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
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
        borderStyle: 'solid',
        opacity: 1,
        labelBuilder: buildLongPositionLabel,
        labelBackgroundColor: 'rgba(6, 95, 70, 0.92)',
        labelTextColor: '#D1FAE5'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var style = normalizeLongPositionStyle(record && record.style);
      return createBoxPrimitive(points[0], points[1], {
        fillColor: style.fillColor,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        borderStyle: style.borderStyle,
        opacity: style.opacity,
        label: buildLongPositionLabel(points[0], points[1]),
        labelBackgroundColor: style.labelBackgroundColor,
        labelTextColor: style.labelTextColor,
        fontSize: 11
      });
    }
  });
`,
};
