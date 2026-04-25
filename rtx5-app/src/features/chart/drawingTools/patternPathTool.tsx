import React from 'react';
import { TvPatterns } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const patternPathDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Pattern Path',
  renderIcon: (color) => <TvPatterns color={color} />,
  runtimeLabel: 'Pattern',
  tool: 'patterns',
};
