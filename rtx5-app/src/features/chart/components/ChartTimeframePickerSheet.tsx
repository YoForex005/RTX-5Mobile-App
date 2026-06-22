import React, { memo, useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

type TimeframePickerGroup = {
  title: string;
  options: readonly string[];
  centered?: boolean;
};

export const TIMEFRAME_PICKER_GROUPS: readonly TimeframePickerGroup[] = [
  {
    title: 'Minutes',
    options: ['M1', 'M5', 'M15', 'M30'],
    centered: true,
  },
  {
    title: 'Hours',
    options: ['H1', 'H4'],
    centered: true,
  },
  {
    title: 'Days',
    options: ['D1', 'W1', 'MN'],
    centered: true,
  },
];

type ChartTimeframePickerSheetProps = {
  visible: boolean;
  activeTimeframe: string;
  supportedTimeframes: readonly string[];
  accentColor: string;
  isDark: boolean;
  bottomInset: number;
  onSelect: (timeframe: string) => void;
  onClose: () => void;
};

export const ChartTimeframePickerSheet = memo(function ChartTimeframePickerSheet({
  visible,
  activeTimeframe,
  supportedTimeframes,
  accentColor,
  isDark,
  bottomInset,
  onSelect,
  onClose,
}: ChartTimeframePickerSheetProps) {
  const { width: windowWidth } = useWindowDimensions();
  const supportedSet = useMemo(() => new Set(supportedTimeframes), [supportedTimeframes]);
  const sheetWidth = windowWidth;
  const contentWidth = Math.min(windowWidth, 420);
  const horizontalPadding = windowWidth < 380 ? 18 : 22;
  const columnGap = windowWidth < 380 ? 10 : 16;
  const itemWidth = Math.floor((contentWidth - horizontalPadding * 2 - columnGap * 4) / 5);
  const optionWidth = Math.max(50, Math.min(62, itemWidth));

  const colors = useMemo(() => ({
    sheet: isDark ? '#101827' : '#FFFFFF',
    title: isDark ? '#F8FAFC' : '#202124',
    text: isDark ? '#E5E7EB' : '#2B2D31',
    disabledBackground: isDark ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
    disabledText: isDark ? 'rgba(226,232,240,0.48)' : '#7A7D82',
    overlay: isDark ? 'rgba(0,0,0,0.38)' : 'rgba(15,23,42,0.16)',
  }), [isDark]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close timeframe picker"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              width: sheetWidth,
              paddingBottom: Math.max(bottomInset, 12) + 18,
              backgroundColor: colors.sheet,
            },
          ]}
        >
          <View style={[styles.content, { width: contentWidth, paddingHorizontal: horizontalPadding }]}>
            {TIMEFRAME_PICKER_GROUPS.map((group, groupIndex) => (
              <View
                key={group.title}
                style={[
                  styles.group,
                  groupIndex === TIMEFRAME_PICKER_GROUPS.length - 1 && styles.lastGroup,
                ]}
              >
                <Text style={[styles.groupTitle, { color: colors.title }]} allowFontScaling={false}>
                  {group.title}
                </Text>
                <View
                  style={[
                    styles.grid,
                    {
                      columnGap,
                      rowGap: 14,
                      justifyContent: group.centered ? 'center' : 'flex-start',
                    },
                  ]}
                >
                  {group.options.map((timeframe) => {
                    const supported = supportedSet.has(timeframe);
                    const active = supported && timeframe === activeTimeframe;
                    const optionStyle = active
                      ? {
                        backgroundColor: accentColor,
                        borderColor: accentColor,
                      }
                      : supported
                        ? {
                          backgroundColor: 'transparent',
                          borderColor: accentColor,
                        }
                        : {
                          backgroundColor: colors.disabledBackground,
                          borderColor: colors.disabledBackground,
                        };
                    const textColor = active
                      ? '#FFFFFF'
                      : supported
                        ? colors.text
                        : colors.disabledText;

                    return (
                      <Pressable
                        key={timeframe}
                        accessibilityRole="button"
                        accessibilityLabel={`Timeframe ${timeframe}`}
                        accessibilityState={{ selected: active, disabled: !supported }}
                        disabled={!supported}
                        onPress={() => onSelect(timeframe)}
                        style={[
                          styles.option,
                          { width: optionWidth },
                          optionStyle,
                        ]}
                      >
                        <Text
                          style={[styles.optionText, { color: textColor }]}
                          allowFontScaling={false}
                          numberOfLines={1}
                        >
                          {timeframe}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  sheet: {
    alignItems: 'center',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: -8 },
    shadowRadius: 20,
    elevation: 18,
  },
  content: {
    alignSelf: 'center',
  },
  group: {
    marginBottom: 20,
  },
  lastGroup: {
    marginBottom: 0,
  },
  groupTitle: {
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  option: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    borderWidth: 1.5,
  },
  optionText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
