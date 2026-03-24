import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { positionsApi } from '../../api/positions';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { findPositionById } from './tradeFlow';

export function ModifyPositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const { accountDetails } = useUserPreferences();
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const positions = usePositionsState((s) => s.positions);
  const position = useMemo(
    () => findPositionById(positions, positionId),
    [positions, positionId]
  );

  // Pre-fill SL/TP with the position's current values (if set)
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const resolvedLogin = resolveTradingLoginString();

  useEffect(() => {
    if (!position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [position, resolvedLogin]);

  useEffect(() => {
    if (!position) return;
    setStopLoss(position.sl && position.sl > 0 ? String(position.sl) : '');
    setTakeProfit(position.tp && position.tp > 0 ? String(position.tp) : '');
  }, [position?.id, position?.sl, position?.tp]);

  if (!position) return <Screen><View style={styles.header}><Text style={styles.title}>Loading...</Text></View></Screen>;

  // Determine pip size for stepper based on symbol (JPY pairs use 0.01, others 0.0001)
  const isJpy = position.symbol.includes('JPY');
  const pipSize = isJpy ? 0.01 : position.currentPrice > 100 ? 0.01 : 0.0001;
  const decimals = isJpy ? 3 : position.currentPrice > 100 ? 2 : 5;

  const adjustValue = (current: string, delta: number): string => {
    const val = parseFloat(current) || position.currentPrice;
    return (val + delta).toFixed(decimals);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Modify Position</Text>
        <Text style={styles.subTitle}>#{position.id} {position.symbol} {position.side} {(position.volume || 0).toFixed(2)}</Text>
      </View>

      {/* Current price reference so user knows valid SL/TP range */}
      <View style={styles.priceRef}>
        <Text style={styles.priceRefLabel}>Current Price</Text>
        <Text style={styles.priceRefValue}>{position.currentPrice.toFixed(decimals)}</Text>
      </View>

      <View style={styles.formCard}>
        {/* ── Stop Loss Field with stepper ── */}
        <View style={styles.fieldWrap}>
          <View style={styles.fieldHeader}>
            <Text style={styles.fieldLabel}>Stop Loss</Text>
            {stopLoss ? (
              <Pressable onPress={() => setStopLoss('')} hitSlop={8}>
                <Text style={styles.clearBtn}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.inputRow}>
            <Pressable style={styles.stepBtn} onPress={() => setStopLoss(adjustValue(stopLoss, -pipSize * 10))} hitSlop={8}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <TextInput
              value={stopLoss}
              onChangeText={setStopLoss}
              placeholder="not set"
              placeholderTextColor={T.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Pressable style={styles.stepBtn} onPress={() => setStopLoss(adjustValue(stopLoss, pipSize * 10))} hitSlop={8}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Take Profit Field with stepper ── */}
        <View style={styles.fieldWrap}>
          <View style={styles.fieldHeader}>
            <Text style={styles.fieldLabel}>Take Profit</Text>
            {takeProfit ? (
              <Pressable onPress={() => setTakeProfit('')} hitSlop={8}>
                <Text style={styles.clearBtn}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.inputRow}>
            <Pressable style={styles.stepBtn} onPress={() => setTakeProfit(adjustValue(takeProfit, -pipSize * 10))} hitSlop={8}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <TextInput
              value={takeProfit}
              onChangeText={setTakeProfit}
              placeholder="not set"
              placeholderTextColor={T.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Pressable style={styles.stepBtn} onPress={() => setTakeProfit(adjustValue(takeProfit, pipSize * 10))} hitSlop={8}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {submitError || submitted ? (
        <View style={submitError ? styles.error : styles.success}>
          <Text style={submitError ? styles.errorText : styles.successText}>
            {submitError || 'Modify request successful. Position updated.'}
          </Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.submitButton, isSubmitting && { opacity: 0.7 }]}
        disabled={isSubmitting}
        onPress={async () => {
          const ticketId = position.id;
          if (!accountDetails?.credentials?.accessToken) {
            setSubmitError('Authentication Error: Session token missing.');
            return;
          }

          setIsSubmitting(true);
          setSubmitError(null);
          try {
            // Live API Integration: PUT /api/v2/positions/{ticketId}
            // Modifies stop loss and take profit on the position.
            // Requires account ownership — returns 404 if not owned by authenticated user.
            // SL/TP values are validated against the CURRENT MARKET PRICE (not open price).
            // Routed through positionsApi → apiClient which handles:
            //   • Automatic Bearer token injection from Zustand state
            //   • 401 token refresh loops (cyclic refresh_token renewal)
            //   • Content-Type: application/json header
            await positionsApi.modifyPosition(ticketId, {
              price_sl: stopLoss ? parseFloat(stopLoss) : 0,
              price_tp: takeProfit ? parseFloat(takeProfit) : 0,
              trailing_stop: 0,
              trailing_step: 0,
            });

            // Refresh positions state to reflect the updated SL/TP
            if (resolvedLogin) {
              usePositionsState.getState().refreshPositions(resolvedLogin);
            }
            setSubmitted(true);
            setTimeout(() => router.back(), 1500);
          } catch (error: any) {
            const status = error?.response?.status;
            const data = error?.response?.data || {};
            if (status === 400) {
              setSubmitError(data.message || 'Invalid SL/TP — values must be valid against current market price.');
            } else if (status === 404) {
              setSubmitError(data.message || 'Position not found or not owned by your account.');
            } else {
              setSubmitError(data.message || 'Failed to modify position.');
            }
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        {isSubmitting ? (
           <ActivityIndicator color={T.text} />
        ) : (
           <Text style={styles.submitText}>Apply Changes</Text>
        )}
      </Pressable>
    </Screen>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  header: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  title: {
    color: T.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subTitle: {
    marginTop: 2,
    color: T.textSub,
    fontSize: 12,
  },
  priceRef: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.border,
  },
  priceRefLabel: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  priceRefValue: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  formCard: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass1,
    gap: spacing.md,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    color: T.textMuted,
    fontSize: 13,
  },
  clearBtn: {
    color: T.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: T.glass2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: T.text,
    fontSize: 20,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    backgroundColor: T.glass2,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: T.text,
    fontSize: 15,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] as any,
  },
  success: {
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.upGlow,
    backgroundColor: T.upGlow,
    padding: spacing.md,
  },
  successText: {
    color: T.up,
    fontSize: 13,
  },
  error: {
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)',
    backgroundColor: 'rgba(255,59,48,0.08)',
    padding: spacing.md,
  },
  errorText: {
    color: T.trading.sell.primary,
    fontSize: 13,
  },
  submitButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderRadius: 8,
    backgroundColor: T.accent,
    alignItems: 'center',
    paddingVertical: 12,
  },
  submitText: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
