import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { CHART_GRID_HORIZONTAL_LINE_COUNT } from '../ChartScreen.constants';

export type FixedHorizontalGridPlotArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ChartFixedHorizontalGridOverlayProps = {
  color: string;
  lineCount?: number;
  plotArea: FixedHorizontalGridPlotArea | null;
  visible: boolean;
};

const DEFAULT_LINE_COUNT = CHART_GRID_HORIZONTAL_LINE_COUNT;

export function ChartFixedHorizontalGridOverlay({
  color,
  lineCount = DEFAULT_LINE_COUNT,
  plotArea,
  visible,
}: ChartFixedHorizontalGridOverlayProps) {
  const lines = useMemo(() => {
    if (!visible || !plotArea || plotArea.width <= 0 || plotArea.height <= 0 || lineCount <= 0) {
      return [];
    }

    const safeCount = Math.max(1, lineCount);

    return Array.from({ length: safeCount }, (_, index) => {
      const progress = (index + 1) / (safeCount + 1);
      const y = Math.round((plotArea.top + plotArea.height * progress) * 2) / 2;
      return {
        key: `fixed-grid-${index}`,
        y,
      };
    });
  }, [lineCount, plotArea, visible]);

  if (lines.length === 0 || !plotArea) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Svg width="100%" height="100%">
        {lines.map((line) => (
          // 1-on / 1-off dash pattern — dotted line matching lightweight-charts
          // v5's `LineStyle.Dotted` rendering. No solid lines.
          <Line
            key={line.key}
            x1={plotArea.left}
            y1={line.y}
            x2={plotArea.left + plotArea.width}
            y2={line.y}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="1 1"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
