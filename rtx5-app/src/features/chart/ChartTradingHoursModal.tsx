/**
 * Chart Feature UI: ChartTradingHoursModal
 * 
 * Displays the specific open and close market sessions for the active symbol,
 * factoring in the user's localized time zone.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../theme/useTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const SCHEDULE_GMT = [
  { day: 'Sunday', hours: '-' },
  { day: 'Monday', hours: '03:31 - 24:00' },
  { day: 'Tuesday', hours: '00:00 - 02:28, 03:30 - 24:00' },
  { day: 'Wednesday', hours: '00:00 - 02:28, 03:30 - 24:00' },
  { day: 'Thursday', hours: '00:00 - 02:28, 03:30 - 24:00' },
  { day: 'Friday', hours: '00:00 - 02:28, 03:30 - 24:00' },
  { day: 'Saturday', hours: '00:00 - 02:28' },
];

const SCHEDULE_LOCAL = [
  { day: 'Sunday', hours: '22:01 - 24:00' },
  { day: 'Monday', hours: '00:00 - 20:58, 22:00 - 24:00' },
  { day: 'Tuesday', hours: '00:00 - 20:58, 22:00 - 24:00' },
  { day: 'Wednesday', hours: '00:00 - 20:58, 22:00 - 24:00' },
  { day: 'Thursday', hours: '00:00 - 20:58, 22:00 - 24:00' },
  { day: 'Friday', hours: '00:00 - 20:58' },
  { day: 'Saturday', hours: '-' },
];

export function ChartTradingHoursModal({ visible, onClose }: Props) {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const [segment, setSegment] = useState<'GMT' | 'Local time'>('GMT');
  const insets = useSafeAreaInsets();
  
  const activeSchedule = segment === 'GMT' ? SCHEDULE_GMT : SCHEDULE_LOCAL;

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay} pointerEvents="box-none">
        {/* Tap outside to dismiss */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        
        <View style={styles.modalContainer}>
          
          {/* Drag Handle */}
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.content}>
            <Text style={styles.modalTitle}>Trading hours</Text>

            {/* Segmented Control */}
            <View style={styles.segmentContainer}>
              <Pressable
                style={[styles.segmentBtn, segment === 'GMT' && styles.segmentBtnActive]}
                onPress={() => setSegment('GMT')}
              >
                <Text style={[styles.segmentText, segment === 'GMT' && styles.segmentTextActive]}>GMT</Text>
              </Pressable>
              <Pressable
                style={[styles.segmentBtn, segment === 'Local time' && styles.segmentBtnActive]}
                onPress={() => setSegment('Local time')}
              >
                <Text style={[styles.segmentText, segment === 'Local time' && styles.segmentTextActive]}>Local time</Text>
              </Pressable>
            </View>

            {/* Schedule List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scheduleList}>
              {activeSchedule.map((item) => (
                <View key={item.day} style={styles.scheduleRow}>
                  <Text style={styles.dayText}>{item.day}</Text>
                  <Text style={styles.hoursText}>{item.hours}</Text>
                </View>
              ))}
              <View style={{ height: Math.max(insets.bottom, 24) }} />
            </ScrollView>
          </View>
        </View>
      </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: isDark ? T.bg : '#FFFFFF',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '90%',
    },
    dragHandleContainer: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: T.text,
      marginBottom: 24,
    },
    segmentContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      marginBottom: 24,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 6,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? T.glass2 : '#F8FAFC', 
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 1,
      elevation: 1,
    },
    segmentText: {
      fontSize: 15,
      color: T.textMuted,
      fontWeight: '500',
    },
    segmentTextActive: {
      color: T.text,
      fontWeight: '600',
    },
    scheduleList: {
      paddingBottom: 20,
    },
    scheduleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
    },
    dayText: {
      fontSize: 15,
      color: T.text,
      fontWeight: '400',
    },
    hoursText: {
      fontSize: 14,
      color: T.textMuted,
      fontWeight: '400',
      textAlign: 'right',
      flexShrink: 1,
      marginLeft: 16,
    },
  });
}
