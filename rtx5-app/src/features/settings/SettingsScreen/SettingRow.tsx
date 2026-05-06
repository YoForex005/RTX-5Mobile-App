import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { traceUiInteraction } from '../../../dev/uiInteractionDiagnostics';
import type { ThemeColors } from '../../../ui/theme/glass';
import type { SettingsStyles } from './styles';

export function SettingRow({
  icon,
  color,
  title,
  sub,
  badge,
  rightElement,
  onPress,
  T,
  styles,
}: {
  icon: any;
  color: string;
  title: string;
  sub?: string;
  badge?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  T: ThemeColors;
  styles: SettingsStyles;
}) {
  return (
    <Pressable
      style={styles.row}
      onPress={onPress ? () => traceUiInteraction(`settings.row.${title}`, onPress) : undefined}
      unstable_pressDelay={0}
    >
      <View style={[styles.iconBox, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={styles.rowRight}>
        {rightElement ? rightElement : (
          <>
            {badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
          </>
        )}
      </View>
    </Pressable>
  );
}
