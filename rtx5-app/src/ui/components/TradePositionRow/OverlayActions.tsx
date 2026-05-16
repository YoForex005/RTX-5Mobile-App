import { FastPressable as Pressable } from '../FastPressable';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import type { ThemeColors } from '../../theme/useTheme';
import { tradePositionRowStyles as styles } from './styles';

export type OverlayActionsProps = {
  T: ThemeColors;
  isDark: boolean;
  dividerColor: string;
  overlayActionLocked: boolean;
  overlayStyle: any;
  onClose: () => void;
  onCloseBy: () => void;
  onModify: () => void;
  onOrderTicket: () => void;
  onOpenChart: () => void;
  onBulk?: () => void;
};

export function OverlayActions({
  T,
  isDark,
  dividerColor,
  overlayActionLocked,
  overlayStyle,
  onClose,
  onCloseBy,
  onModify,
  onOrderTicket,
  onOpenChart,
  onBulk,
}: OverlayActionsProps) {
  return (
    <Animated.View
      style={[
        styles.overlayMenu,
        overlayStyle,
        { backgroundColor: isDark ? '#0E141F' : T.glass2, borderLeftColor: dividerColor, zIndex: 100 },
      ]}
    >
      <Pressable
        hitSlop={12}
        disabled={overlayActionLocked}
        onPress={onClose}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="close" size={20} color={T.down} />
        </View>
      </Pressable>
      <Pressable
        hitSlop={12}
        disabled={overlayActionLocked}
        onPress={onCloseBy}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="swap-horizontal" size={20} color={T.text} />
        </View>
      </Pressable>
      <Pressable
        hitSlop={12}
        disabled={overlayActionLocked}
        onPressIn={onModify}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="create" size={20} color={T.text} />
        </View>
      </Pressable>
      <Pressable
        hitSlop={12}
        disabled={overlayActionLocked}
        onPress={onOrderTicket}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="add" size={20} color={T.text} />
        </View>
      </Pressable>
      <Pressable
        hitSlop={12}
        disabled={overlayActionLocked}
        onPress={onOpenChart}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="bar-chart" size={20} color={T.text} />
        </View>
      </Pressable>
      {onBulk && (
        <Pressable
          hitSlop={12}
          disabled={overlayActionLocked}
          onPress={onBulk}
          unstable_pressDelay={0}
          style={({ pressed }) => [
            styles.actionBtnContainer,
            styles.actionBtnPressable,
            overlayActionLocked && styles.actionBtnDisabled,
            pressed && styles.actionBtnPressed,
          ]}
        >
          <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
            <Ionicons name="layers" size={20} color={T.text} />
          </View>
        </Pressable>
      )}
    </Animated.View>
  );
}
