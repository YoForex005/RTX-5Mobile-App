import React from 'react';
import { TvText } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const textLabelDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Text Label',
  renderIcon: (color) => <TvText color={color} />,
  runtimeLabel: 'Text',
  tool: 'text',
};
