import React from 'react';
import { TvTrendLine } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const trendLineDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Trend Line',
  renderIcon: (color) => <TvTrendLine color={color} />,
  runtimeLabel: 'Trend Line',
  tool: 'trendline',
};
