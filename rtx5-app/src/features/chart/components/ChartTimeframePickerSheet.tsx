type TimeframePickerGroup = {
  title: string;
  options: readonly string[];
};

type TimeframePickerActionSheetAction = {
  label: string;
  subtitle?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

type CreateTimeframePickerActionSheetActionsOptions = {
  activeTimeframe: string;
  supportedTimeframes: readonly string[];
  onSelect: (timeframe: string) => void;
};

export const TIMEFRAME_PICKER_GROUPS: readonly TimeframePickerGroup[] = [
  {
    title: 'Minutes',
    options: ['M1', 'M5', 'M15', 'M30'],
  },
  {
    title: 'Hours',
    options: ['H1', 'H4'],
  },
  {
    title: 'Days',
    options: ['D1', 'W1', 'MN'],
  },
];

export function createTimeframePickerActionSheetActions({
  activeTimeframe,
  supportedTimeframes,
  onSelect,
}: CreateTimeframePickerActionSheetActionsOptions): TimeframePickerActionSheetAction[] {
  const supportedSet = new Set(supportedTimeframes);

  return TIMEFRAME_PICKER_GROUPS.flatMap((group) =>
    group.options.map((timeframe) => {
      const supported = supportedSet.has(timeframe);
      const active = supported && timeframe === activeTimeframe;

      return {
        label: timeframe,
        subtitle: active ? 'Current' : group.title,
        selected: active,
        disabled: !supported,
        onPress: supported && !active ? () => onSelect(timeframe) : undefined,
      };
    }),
  );
}
