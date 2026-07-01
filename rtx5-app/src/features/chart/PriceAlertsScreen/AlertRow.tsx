import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PriceAlert } from '../../../api/alerts';
import { formatBrokerTime } from '../../../utils/brokerTime';
import type { ThemeColors } from '../../../ui/theme/glass';
import type { PriceAlertsStyles } from './styles';

function safeTime(ts: number): string {
  if (!ts) return '--';
  try { return formatBrokerTime(ts); } catch { return '--'; }
}

export type AlertRowProps = {
  alert: PriceAlert;
  onDelete: () => void;
  isDeleting: boolean;
  isLast: boolean;
  T: ThemeColors;
  isDark: boolean;
  styles: PriceAlertsStyles;
};

export function AlertRow({
  alert,
  onDelete,
  isDeleting,
  isLast,
  T,
  isDark,
  styles,
}: AlertRowProps) {
  const isAbove = alert.condition === 'above';

  return (
    <>
      <View style={styles.alertRow}>
        {/* Direction icon */}
        <View style={[
          styles.alertIcon,
          { backgroundColor: alert.triggered
            ? (isDark ? T.glass1 : '#F1F5F9')
            : isAbove
              ? (isDark ? T.upGlow : 'rgba(34,197,94,0.12)')
              : (isDark ? T.downGlow : 'rgba(239,68,68,0.12)'),
          },
        ]}>
          <Ionicons
            name={isAbove ? 'trending-up' : 'trending-down'}
            size={18}
            color={alert.triggered ? T.textMuted : isAbove ? T.trading.buy.primary : T.trading.sell.primary}
          />
        </View>

        {/* Details */}
        <View style={styles.alertBody}>
          <View style={styles.alertTopRow}>
            <Text style={[styles.alertSymbol, { color: alert.triggered ? T.textMuted : T.text }]}>
              {alert.symbol}
            </Text>
            {alert.triggered && (
              <View style={styles.triggeredBadge}>
                <Text style={styles.triggeredBadgeText}>Triggered</Text>
              </View>
            )}
          </View>
          <Text style={[styles.alertCondition, {
            color: alert.triggered ? T.textMuted : isAbove ? T.trading.buy.primary : T.trading.sell.primary,
          }]}>
            {isAbove ? '▲ Above' : '▼ Below'} {alert.price.toFixed(5)}
          </Text>
          {!!alert.message && (
            <Text style={[styles.alertMessage, { color: T.textMuted }]} numberOfLines={1}>
              {alert.message}
            </Text>
          )}
          <Text style={[styles.alertTime, { color: isDark ? T.textDimmed : '#CBD5E1' }]}>
            {safeTime(alert.created_at)}
          </Text>
        </View>

        {/* Delete */}
        <Pressable
          hitSlop={12}
          onPress={onDelete}
          disabled={isDeleting}
          style={[styles.deleteBtn, isDeleting && { opacity: 0.4 }]}
        >
          <Ionicons name="trash-outline" size={18} color={isDark ? T.textMuted : '#94A3B8'} />
        </Pressable>
      </View>
      {!isLast && <View style={styles.separator} />}
    </>
  );
}
