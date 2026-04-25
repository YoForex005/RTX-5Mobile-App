import React from 'react';
import { TvZoom } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const zoomToFitDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: 'Zoom To Fit',
  key: 'zoomToFit',
  renderIcon: (color) => <TvZoom color={color} />,
};
