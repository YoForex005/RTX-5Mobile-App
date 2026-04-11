/**
 * Chart Feature UI: PriceAlertsScreen
 *
 * Lists all active price alerts and provides a form to create new ones.
 * Each alert fires when the market price crosses the target in the chosen
 * direction (above / below). Alerts are stored server-side and persist
 * across devices and sessions.
 *
 * API:
 *  GET    /api/v2/alerts       — list alerts
 *  POST   /api/v2/alerts       — create alert
 *  DELETE /api/v2/alerts/{id}  — delete alert
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { useAlertsQuery, useCreateAlertMutation, useDeleteAlertMutation } from '../../query/alerts';
import { AlertCondition, PriceAlert } from '../../api/alerts';
import { formatBrokerTime } from '../../utils/brokerTime';
import { ThemeColors } from '../../theme/glass';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeTime(ts: number): string {
  if (!ts) return '--';
  try { return formatBrokerTime(ts); } catch { return '--'; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export function PriceAlertsScreen() {
  const router = useRouter();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  // Current chart symbol pre-fills the symbol field
  const chartSymbol = useUserPreferences((s) => s.chartSymbol);

  // ── Alert list ───────────────────────────────────────────────────────────
  const { data: alerts = [], isLoading, refetch, isRefetching } = useAlertsQuery();
  const { mutate: deleteAlert, isPending: isDeleting } = useDeleteAlertMutation();

  // ── Create form state ────────────────────────────────────────────────────
  const [symbol, setSymbol] = useState(chartSymbol ?? '');
  const [condition, setCondition] = useState<AlertCondition>('above');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  const { mutate: createAlert, isPending: isCreating } = useCreateAlertMutation();

  const handleCreate = () => {
    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedPrice = parseFloat(price);

    if (!trimmedSymbol) { setFormError('Symbol is required'); return; }
    if (!price.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
      setFormError('Enter a valid price greater than 0');
      return;
    }
    setFormError('');

    createAlert(
      {
        symbol: trimmedSymbol,
        condition,
        price: parsedPrice,
        message: message.trim() || undefined,
      },
      {
        onSuccess: () => {
          // Clear form on success, keep symbol for follow-up alerts
          setPrice('');
          setMessage('');
        },
        onError: () => {
          setFormError('Failed to create alert. Please try again.');
        },
      },
    );
  };

  // Sort: active (not triggered) first, then triggered
  const sorted = useMemo(
    () => [...alerts].sort((a, b) => Number(a.triggered) - Number(b.triggered)),
    [alerts],
  );

  const screenBg = isDark ? T.bg : '#F1F5F9';

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      {/* ── Status bar spacer ── */}
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: screenBg }]}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]} numberOfLines={1}>
          Price Alerts
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={isDark ? '#D1D4DC' : '#131722'}
              colors={[T.accent]}
              progressBackgroundColor={isDark ? '#0E141F' : '#FFFFFF'}
            />
          }
        >

          {/* ── Create Alert Form ── */}
          <View style={styles.sectionHeader}>
            <Ionicons name="add-circle-outline" size={14} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text style={styles.sectionTitle}>NEW ALERT</Text>
          </View>
          <View style={styles.card}>
            {/* Symbol */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>Symbol</Text>
              <TextInput
                style={[styles.fieldInput, { color: T.text }]}
                value={symbol}
                onChangeText={(v) => setSymbol(v.toUpperCase())}
                placeholder="e.g. EURUSD"
                placeholderTextColor={isDark ? 'rgba(148,163,184,0.4)' : '#94A3B8'}
                autoCapitalize="characters"
                returnKeyType="next"
              />
            </View>
            <View style={styles.separator} />

            {/* Condition toggle */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>Condition</Text>
              <View style={styles.conditionToggle}>
                {(['above', 'below'] as AlertCondition[]).map((c) => (
                  <Pressable
                    key={c}
                    style={[
                      styles.conditionPill,
                      condition === c && {
                        backgroundColor: c === 'above' ? T.trading.buy.primary : T.trading.sell.primary,
                        borderColor: c === 'above' ? T.trading.buy.primary : T.trading.sell.primary,
                      },
                    ]}
                    onPress={() => setCondition(c)}
                  >
                    <Text style={[
                      styles.conditionPillText,
                      { color: condition === c ? '#FFFFFF' : T.textMuted },
                    ]}>
                      {c === 'above' ? '▲ Above' : '▼ Below'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.separator} />

            {/* Price */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>Price</Text>
              <TextInput
                style={[styles.fieldInput, { color: T.text }]}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00000"
                placeholderTextColor={isDark ? 'rgba(148,163,184,0.4)' : '#94A3B8'}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </View>
            <View style={styles.separator} />

            {/* Message (optional) */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>Note</Text>
              <TextInput
                style={[styles.fieldInput, { color: T.text }]}
                value={message}
                onChangeText={setMessage}
                placeholder="Optional notification note"
                placeholderTextColor={isDark ? 'rgba(148,163,184,0.4)' : '#94A3B8'}
                returnKeyType="done"
              />
            </View>

            {/* Error */}
            {!!formError && (
              <View style={styles.errorRow}>
                <Ionicons name="warning-outline" size={14} color={T.down} />
                <Text style={[styles.errorText, { color: T.down }]}>{formError}</Text>
              </View>
            )}

            {/* Submit */}
            <Pressable
              style={[styles.createBtn, { backgroundColor: T.accent }, isCreating && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={isCreating}
            >
              {isCreating
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.createBtnText}>Set Alert</Text>
              }
            </Pressable>
          </View>

          {/* ── Active Alerts ── */}
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications-outline" size={14} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text style={styles.sectionTitle}>
              MY ALERTS{alerts.length > 0 ? ` (${alerts.length})` : ''}
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator size="small" color={T.accent} style={{ marginTop: 24 }} />
          ) : sorted.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-off-outline" size={36} color={isDark ? '#334155' : '#CBD5E1'} />
              <Text style={[styles.emptyText, { color: T.textMuted }]}>No alerts set</Text>
              <Text style={[styles.emptySubText, { color: isDark ? '#475569' : '#94A3B8' }]}>
                Create an alert above to get notified{'\n'}when a price level is reached
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {sorted.map((alert, idx) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onDelete={() => deleteAlert(alert.id)}
                  isDeleting={isDeleting}
                  isLast={idx === sorted.length - 1}
                  T={T}
                  isDark={isDark}
                  styles={styles}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Row
// ─────────────────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onDelete,
  isDeleting,
  isLast,
  T,
  isDark,
  styles,
}: {
  alert: PriceAlert;
  onDelete: () => void;
  isDeleting: boolean;
  isLast: boolean;
  T: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const isAbove = alert.condition === 'above';

  return (
    <>
      <View style={styles.alertRow}>
        {/* Direction icon */}
        <View style={[
          styles.alertIcon,
          { backgroundColor: alert.triggered
            ? (isDark ? 'rgba(100,116,139,0.15)' : '#F1F5F9')
            : isAbove
              ? 'rgba(34,197,94,0.12)'
              : 'rgba(239,68,68,0.12)',
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
          <Text style={[styles.alertTime, { color: isDark ? '#334155' : '#CBD5E1' }]}>
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
          <Ionicons name="trash-outline" size={18} color={isDark ? '#475569' : '#94A3B8'} />
        </Pressable>
      </View>
      {!isLast && <View style={styles.separator} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

function makeStyles(_T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? '#0B0F19' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0';

  return StyleSheet.create({
    screen: { flex: 1 },
    flex1: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    headerBtn: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },

    scrollContent: { paddingTop: 8 },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: isDark ? '#475569' : '#94A3B8',
    },

    card: {
      backgroundColor: cardBg,
      borderRadius: 14,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: border,
      overflow: 'hidden',
    },

    /* Form fields */
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: 16,
      minHeight: 52,
    },
    fieldLabel: { fontSize: 15, fontWeight: '500', minWidth: 80 },
    fieldInput: {
      flex: 1,
      textAlign: 'right',
      fontSize: 15,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },

    conditionToggle: { flexDirection: 'row', gap: 8 },
    conditionPill: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: 'transparent',
    },
    conditionPillText: { fontSize: 13, fontWeight: '700' },

    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    errorText: { fontSize: 13, fontWeight: '500' },

    createBtn: {
      margin: 12,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    createBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

    separator: { height: StyleSheet.hairlineWidth, backgroundColor: border, marginLeft: 16 },

    /* Alert list rows */
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 12,
    },
    alertIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    alertBody: { flex: 1, gap: 2 },
    alertTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    alertSymbol: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
    alertCondition: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
    alertMessage: { fontSize: 12, fontWeight: '500' },
    alertTime: { fontSize: 11, fontWeight: '500', fontVariant: ['tabular-nums'], marginTop: 2 },
    deleteBtn: { padding: 6 },

    triggeredBadge: {
      backgroundColor: isDark ? 'rgba(100,116,139,0.2)' : '#F1F5F9',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    triggeredBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#475569' : '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    /* Empty state */
    emptyCard: {
      marginHorizontal: 16,
      paddingVertical: 32,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: { fontSize: 16, fontWeight: '600', marginTop: 4 },
    emptySubText: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
  });
}
