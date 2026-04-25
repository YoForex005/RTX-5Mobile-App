import React from 'react';
import { TvHide } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const hideAllDrawingsDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: ({ chartHideAll }) => (chartHideAll ? 'Show All Drawings' : 'Hide All Drawings'),
  isActive: ({ chartHideAll }) => chartHideAll,
  key: 'hideAllDrawings',
  renderIcon: (color) => <TvHide color={color} />,
};
