import React from 'react';
import { TvCrosshair } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const crosshairDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Crosshair',
  renderIcon: (color) => <TvCrosshair color={color} />,
  tool: 'crosshair',
};
