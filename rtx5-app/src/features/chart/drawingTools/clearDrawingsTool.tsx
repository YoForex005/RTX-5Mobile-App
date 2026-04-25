import React from 'react';
import { TvTrash } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const clearDrawingsDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: 'Clear Drawings',
  danger: true,
  key: 'clearDrawings',
  renderIcon: (color) => <TvTrash color={color} />,
};
