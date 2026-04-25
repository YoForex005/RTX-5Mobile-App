import React from 'react';
import { TvMagnet } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const magnetModeDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: ({ magnetEnabled }) => (magnetEnabled ? 'Disable Magnet Mode' : 'Enable Magnet Mode'),
  isActive: ({ magnetEnabled }) => magnetEnabled,
  key: 'magnetMode',
  renderIcon: (color) => <TvMagnet color={color} />,
};
