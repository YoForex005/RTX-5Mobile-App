import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
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
import { useIsFocused } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../ui/theme/useTheme';
import { useUserPreferences } from '../../../state/userPreferences';
import {
  useAlertsQuery,
  useCreateAlertMutation,
  useDeleteAlertMutation,
} from '../../../query/alerts';
import type { AlertCondition } from '../../../api/alerts';
import { safeRouterBack } from '../../../utils/navigation';
import { AlertRow } from './AlertRow';
import { makePriceAlertsStyles } from './styles';

export function PriceAlertsScreen() {
  const router = useRouter();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makePriceAlertsStyles(T, isDark), [T, isDark]);
  const isScreenFocused = useIsFocused();

  // Current chart symbol pre-fills the symbol field
  const chartSymbol = useUserPreferences((s) => s.chartSymbol);

  // ── Alert list ───────────────────────────────────────────────────────────
  const { data: alerts = [], isLoading, refetch, isRefetching } = useAlertsQuery({
    enabled: isScreenFocused,
  });
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
  const placeholderColor = isDark ? T.textFaint : '#94A3B8';
  const sectionIconColor = isDark ? T.textMuted : '#64748B';

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      {/* ── Status bar spacer ── */}
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: screenBg }]}>
        <Pressable onPress={() => safeRouterBack(router, '/(tabs)/chart')} hitSlop={16} style={styles.headerBtn}>
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
          canCancelContentTouches={Platform.OS === 'ios'}
          style={styles.flex1}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={isDark ? T.textSub : '#131722'}
              colors={[T.accent]}
              progressBackgroundColor={isDark ? T.glass2 : '#FFFFFF'}
            />
          }
        >

          {/* ── Create Alert Form ── */}
          <View style={styles.sectionHeader}>
            <Ionicons name="add-circle-outline" size={14} color={sectionIconColor} />
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
                placeholderTextColor={placeholderColor}
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
                placeholderTextColor={placeholderColor}
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
                placeholderTextColor={placeholderColor}
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
            <Ionicons name="notifications-outline" size={14} color={sectionIconColor} />
            <Text style={styles.sectionTitle}>
              MY ALERTS{alerts.length > 0 ? ` (${alerts.length})` : ''}
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator size="small" color={T.accent} style={{ marginTop: 24 }} />
          ) : sorted.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-off-outline" size={36} color={isDark ? T.textDimmed : '#CBD5E1'} />
              <Text style={[styles.emptyText, { color: T.textMuted }]}>No alerts set</Text>
              <Text style={[styles.emptySubText, { color: isDark ? T.textMuted : '#94A3B8' }]}>
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
