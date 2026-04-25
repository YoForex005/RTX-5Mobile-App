import React from 'react';
import { TvMeasure } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const measureRangeDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Measure Range',
  renderIcon: (color) => <TvMeasure color={color} />,
  runtimeLabel: 'Measure',
  tool: 'measure',
};
