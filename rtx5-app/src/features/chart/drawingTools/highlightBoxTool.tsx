import React from 'react';
import { TvBrush } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const highlightBoxDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Highlight Box',
  renderIcon: (color) => <TvBrush color={color} />,
  runtimeLabel: 'Highlight',
  tool: 'brush',
};
