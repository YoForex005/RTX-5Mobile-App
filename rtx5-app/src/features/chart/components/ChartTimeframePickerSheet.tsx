import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type TimeframePickerGroup = {
  title: string;
  options: readonly string[];
};

type TimeframePickerActionSheetAction = {
  label: string;
  subtitle?: string;
  selected?: boolean;
  disabled?: boolean;
  activateOnPressIn?: boolean;
  onPress?: () => void;
};

type CreateTimeframePickerActionSheetActionsOptions = {
  activeTimeframe: string;
  supportedTimeframes: readonly string[];
  onSelect: (timeframe: string) => void;
};

type ChartTimeframePickerOverlayProps = {
  visible: boolean;
  activeTimeframe: string;
  supportedTimeframes: readonly string[];
  accentColor: string;
  isDark: boolean;
  textColor: string;
  mutedColor: string;
  onClose: () => void;
  onSelect: (timeframe: string) => void;
};

// Match the chart panel color committed on GitHub.
const CHART_DARK_PANEL_BACKGROUND = '#0E141F';

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
        // The grid is non-scrollable and compact, so taps should commit immediately.
        activateOnPressIn: true,
        onPress: supported && !active ? () => onSelect(timeframe) : undefined,
      };
    }),
  );
}

export function ChartTimeframePickerOverlay({
  visible,
  activeTimeframe,
  supportedTimeframes,
  accentColor,
  isDark,
  textColor,
  mutedColor,
  onClose,
  onSelect,
}: ChartTimeframePickerOverlayProps) {
  const supportedSet = useMemo(() => new Set(supportedTimeframes), [supportedTimeframes]);
  const styles = useMemo(
    () => makeTimeframePickerStyles({ accentColor, isDark, textColor, mutedColor }),
    [accentColor, isDark, mutedColor, textColor],
  );

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        activateOnPressIn
        latencyLabel="chart.timeframePicker.backdrop"
        unstable_pressDelay={0}
      />
      <View style={styles.card}>
        {TIMEFRAME_PICKER_GROUPS.map((group) => {
          const options = group.options.filter((timeframe) => supportedSet.has(timeframe));
          if (options.length === 0) return null;

          return (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.optionGrid}>
                {options.map((timeframe) => {
                  const active = timeframe === activeTimeframe;
                  return (
                    <Pressable
                      key={timeframe}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.option,
                        active && styles.optionActive,
                        pressed && !active && styles.optionPressed,
                      ]}
                      onPress={active ? undefined : () => onSelect(timeframe)}
                      activateOnPressIn={!active}
                      disabled={active}
                      latencyLabel={`chart.timeframePicker.${timeframe}`}
                      unstable_pressDelay={0}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>{timeframe}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeTimeframePickerStyles = ({
  accentColor,
  isDark,
  textColor,
  mutedColor,
}: {
  accentColor: string;
  isDark: boolean;
  textColor: string;
  mutedColor: string;
}) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: isDark ? 'rgba(0,0,0,0.58)' : 'rgba(15,23,42,0.36)',
  },
  card: {
    width: '90%',
    maxWidth: 366,
    borderRadius: 12,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(59,130,246,0.25)' : 'rgba(15,23,42,0.08)',
    backgroundColor: isDark ? CHART_DARK_PANEL_BACKGROUND : '#FFFFFF',
    shadowColor: isDark ? accentColor : '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: isDark ? 0.14 : 0.18,
    shadowRadius: 28,
    elevation: 18,
  },
  group: {
    alignItems: 'center',
    marginBottom: 18,
  },
  groupTitle: {
    color: textColor,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  optionGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
  },
  option: {
    width: 54,
    height: 38,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(148,163,184,0.14)' : 'transparent',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
  },
  optionPressed: {
    borderColor: accentColor,
    backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : '#E8F1FF',
  },
  optionActive: {
    borderColor: accentColor,
    backgroundColor: accentColor,
  },
  optionText: {
    color: isDark ? mutedColor : '#2F343D',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
