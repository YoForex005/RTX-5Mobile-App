import React from 'react';
import { TvLock } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const lockAllDrawingsDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: ({ chartLockAll }) => (chartLockAll ? 'Unlock All Drawings' : 'Lock All Drawings'),
  isActive: ({ chartLockAll }) => chartLockAll,
  key: 'lockAllDrawings',
  renderIcon: (color) => <TvLock color={color} />,
};
