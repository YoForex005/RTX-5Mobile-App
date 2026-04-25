import React from 'react';
import { TvPitchfork } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const pitchforkDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Pitchfork',
  renderIcon: (color) => <TvPitchfork color={color} />,
  runtimeLabel: 'Pitchfork',
  tool: 'pitchfork',
};
