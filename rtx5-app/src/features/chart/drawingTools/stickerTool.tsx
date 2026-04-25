import React from 'react';
import { TvSmiley } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const stickerDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Sticker',
  renderIcon: (color) => <TvSmiley color={color} />,
  runtimeLabel: 'Sticker',
  tool: 'smiley',
};
