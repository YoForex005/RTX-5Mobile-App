import React, { memo, useEffect, useSyncExternalStore } from 'react';

import { ActionSheet } from '../../../ui/components/ActionSheet/ActionSheet';
import {
  disposeChartSymbolPickerSheet,
  getChartSymbolPickerSheetSnapshot,
  hideChartSymbolPickerSheet,
  subscribeChartSymbolPickerSheet,
  type ChartSymbolPickerSheetConfig,
} from '../chartSymbolPickerSheetController';

const emptyConfig: ChartSymbolPickerSheetConfig = Object.freeze({
  actions: [],
  visualKey: 'chart.symbolPicker.uninitialized',
});

/** Dedicated top-level host: Symbol Picker never competes with Drawing Tools for retained pixels. */
export const ChartSymbolPickerSheetHost = memo(function ChartSymbolPickerSheetHost() {
  const current = useSyncExternalStore(
    subscribeChartSymbolPickerSheet,
    getChartSymbolPickerSheetSnapshot,
    getChartSymbolPickerSheetSnapshot,
  );
  const config = current.config ?? emptyConfig;
  useEffect(() => () => disposeChartSymbolPickerSheet(), []);

  return (
    <ActionSheet
      {...config}
      detent={config.detent ?? 'large'}
      instantOpen={config.instantOpen ?? true}
      visible={current.visible}
      onClose={hideChartSymbolPickerSheet}
    />
  );
});

export type { ChartSymbolPickerSheetConfig };
