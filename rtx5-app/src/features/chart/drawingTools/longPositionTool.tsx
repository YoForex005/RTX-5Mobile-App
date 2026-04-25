import React from 'react';
import { TvPrediction } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const longPositionDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Long Position',
  renderIcon: (color) => <TvPrediction color={color} />,
  runtimeLabel: 'Position',
  tool: 'prediction',
};
