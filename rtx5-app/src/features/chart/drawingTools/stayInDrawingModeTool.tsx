import React from 'react';
import { TvStayInDrawingMode } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const stayInDrawingModeDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: ({ stickyDrawingMode }) => (
    stickyDrawingMode ? 'Disable Stay in Drawing Mode' : 'Enable Stay in Drawing Mode'
  ),
  isActive: ({ stickyDrawingMode }) => stickyDrawingMode,
  key: 'stayInDrawingMode',
  renderIcon: (color) => <TvStayInDrawingMode color={color} />,
};
