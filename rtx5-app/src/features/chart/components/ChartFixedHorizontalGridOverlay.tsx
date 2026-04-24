import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

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

const DEFAULT_LINE_COUNT = 7;

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
    const denominator = Math.max(safeCount - 1, 1);

    return Array.from({ length: safeCount }, (_, index) => {
      const progress = safeCount === 1 ? 0 : index / denominator;
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
          <Line
            key={line.key}
            x1={plotArea.left}
            y1={line.y}
            x2={plotArea.left + plotArea.width}
            y2={line.y}
            stroke={color}
            strokeDasharray="4 4"
            strokeWidth="1"
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
