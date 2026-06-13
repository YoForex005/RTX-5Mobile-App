import React from 'react';
import { TvText } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const textLevelDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Text Level',
  renderIcon: (color) => <TvText color={color} />,
  runtimeLabel: 'Text Level',
  tool: 'textLevel',
};
