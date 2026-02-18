import type { ComponentType } from 'react';
import { Platform } from 'react-native';

const chartModule =
  Platform.OS === 'web'
    ? require('./ChartScreen.web')
    : require('./ChartScreen.native');

export const ChartScreen = chartModule.ChartScreen as ComponentType;
