import React from 'react';
import { TvFib } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const fibZoneDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Fib Zone',
  renderIcon: (color) => <TvFib color={color} />,
  runtimeLabel: 'Fib Zone',
  tool: 'fib',
};
