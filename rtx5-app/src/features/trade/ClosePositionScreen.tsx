import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Alert, ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { positionsApi } from '../../api/positions';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { findPositionById, symbolDisplayName } from './tradeFlow';

export function ClosePositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const { accountDetails } = useUserPreferences();
  const [submitted, setSubmitted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const positions = usePositionsState((s) => s.positions);
  const position = useMemo(
    () => findPositionById(positions, positionId),
    [positions, positionId]
  );
  const resolvedLogin = resolveTradingLoginString();

  useEffect(() => {
    if (!position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [position, resolvedLogin]);

  if (!position) return <Screen><View style={styles.header}><Text style={styles.title}>Loading...</Text></View></Screen>;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Close Position</Text>
        <Text style={styles.subTitle}>Review and confirm closing order</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbol}>{position.symbol}</Text>
          <Text style={[styles.side, position.side === 'buy' ? styles.buy : styles.sell]}>
            {position.side} {(position.volume || 0).toFixed(2)}
          </Text>
        </View>
        <Text style={styles.instrument}>{symbolDisplayName(position.symbol)}</Text>

        <View style={styles.metrics}>
          <Metric label='Open' value={fmt.price(position.openPrice)} />
          <Metric label='Current' value={fmt.price(position.currentPrice)} />
          <Metric label='P/L' value={fmt.pnl(position.pnl)} negative={position.pnl < 0} positive={position.pnl > 0} />
          <Metric label='Ticket' value={`#${position.id}`} />
        </View>
      </View>

      {closeError || submitted ? (
        <View style={styles.success}>
          {closeError ? (
            <Text style={[styles.successText, { color: T.trading.sell.primary }]}>
              {closeError}
            </Text>
          ) : (
            <Text style={styles.successText}>Close order submitted. Position closed successfully.</Text>
          )}
        </View>
      ) : null}

      <Pressable 
        style={[styles.dangerButton, isClosing && { opacity: 0.6 }]} 
        disabled={isClosing}
        onPress={async () => {
          const ticketId = position.id;
          if (!accountDetails?.credentials?.accessToken) {
            setCloseError('Authentication Error: Session token missing.');
            return;
          }

          setIsClosing(true);
          setCloseError(null);
          try {
            // Live API Integration: POST /api/v2/positions/{ticketId}/close
            // Closes the position by its ticket ID (not account login).
            // Routed through positionsApi → apiClient which handles:
            //   • Automatic Bearer token injection from Zustand state
            //   • 401 token refresh loops (cyclic refresh_token renewal)
            //   • DB transaction atomicity on the server side
            //   • Rejection on zero/negative market prices
            await positionsApi.closePosition(ticketId);

            // Optimistic fast UI update to eliminate replication lag timeout shortcut
            const state = usePositionsState.getState();
            state.setPositions(state.positions.filter(p => String(p.id) !== String(ticketId)));
            setSubmitted(true);
            router.back();

            // Background refresh to true up with the server eventually
            if (resolvedLogin) {
              state.refreshPositions(resolvedLogin);
            }
          } catch (error: any) {
            const status = error?.response?.status;
            const data = error?.response?.data || {};
            if (status === 404) {
              setCloseError(data.message || 'Position not found.');
            } else if (status === 429) {
              const retryStr = error?.response?.headers?.['retry-after'];
              const seconds = parseInt(retryStr, 10);
              const waitMsg = !isNaN(seconds) ? ` Wait ${seconds} seconds.` : ' Wait before trying again.';
              setCloseError(`Rate limited!${waitMsg}`);
            } else if (status === 400 || status === 401) {
              setCloseError(data.message || 'Validation or authentication error.');
            } else {
              setCloseError(data.message || 'Failed to close position.');
            }
          } finally {
            setIsClosing(false);
          }
        }}
      >
        {isClosing ? (
          <ActivityIndicator color={T.text} />
        ) : (
          <Text style={styles.dangerButtonText}>Close Position</Text>
        )}
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.push({ pathname: '/trade/close-by', params: { positionId: position.id } })}
      >
        <Text style={styles.secondaryButtonText}>Close By Instead</Text>
      </Pressable>
    </Screen>
  );
}

function Metric({
  label,
  value,
  negative = false,
  positive = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, negative && styles.negative, positive && styles.positive]}>{value}</Text>
    </View>
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
    color: T.textMuted,
    fontSize: 12,
  },
  card: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.borderMedium,
    backgroundColor: T.glass2,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  symbol: {
    color: T.text,
    fontSize: 20,
    fontWeight: '700',
  },
  side: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  buy: {
    color: T.trading.buy.primary,
  },
  sell: {
    color: T.trading.sell.primary,
  },
  instrument: {
    marginTop: 4,
    color: T.textMuted,
    fontSize: 12,
  },
  metrics: {
    marginTop: spacing.md,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    color: T.textMuted,
    fontSize: 13,
  },
  metricValue: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  negative: {
    color: T.trading.loss,
  },
  positive: {
    color: T.trading.profit,
  },
  success: {
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
    backgroundColor: 'rgba(74,222,128,0.08)',
    padding: spacing.md,
  },
  successText: {
    color: T.trading.profit,
    fontSize: 13,
  },
  dangerButton: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    backgroundColor: T.trading.sell.primary,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  dangerButtonText: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.borderMedium,
    backgroundColor: T.glass1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: T.accent,
    fontSize: 15,
    fontWeight: '600',
  },
});
