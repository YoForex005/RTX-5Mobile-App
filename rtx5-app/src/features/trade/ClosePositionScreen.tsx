/**
 * Trade Feature UI: ClosePositionScreen
 * 
 * Interface for partially or fully closing a single specific active position. 
 * Allows users to adjust the exact volume to close.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Alert, ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { usePositionsState } from '../../state/positionsState';
import { useTradingState } from '../../state/tradingState';
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

  const quotes = useTradingState((s) => s.quotes);
  const getLivePrice = (p: typeof position) => {
    if (!p) return 0;
    const q = quotes[p.symbol];
    if (!q) return p.currentPrice || p.openPrice;
    return p.side === 'buy' ? q.bid : q.ask;
  };

  useEffect(() => {
    if (!position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [position, resolvedLogin]);

  if (!position) return <Screen><View style={styles.header}><Text style={styles.title}>Loading...</Text></View></Screen>;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.subTitle}>Review and confirm closing order</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.symbol}>{position.symbol.replace(/\//g, '')}</Text>
            <Text style={styles.instrument}>{symbolDisplayName(position.symbol)}</Text>
          </View>
          <Text style={[styles.sideText, position.side === 'buy' ? styles.sideTextBuy : styles.sideTextSell]}>
            {position.side.toUpperCase()} {(position.volume || 0).toFixed(2)}
          </Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.metrics}>
          <Metric label='Open Price' value={fmt.price(position.openPrice)} />
          <Metric label='Current Price' value={fmt.price(getLivePrice(position))} />
          <View style={styles.metricSpacer} />
          <Metric label='Real-time P/L' value={fmt.pnl(position.pnl)} negative={position.pnl < 0} positive={position.pnl > 0} isHighlighted />
          <Metric label='Order Ticket' value={`#${position.id}`} isSecondary />
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

      <View style={styles.buttonRow}>
        <Pressable 
          style={[styles.actionButton, styles.closeButton, isClosing && { opacity: 0.6 }]} 
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
            <ActivityIndicator color={T.trading.sell.primary} />
          ) : (
            <Text style={styles.closeButtonText}>Close Position</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.closeByButton]}
          onPress={() => router.push({ pathname: '/trade/close-by', params: { positionId: position.id } })}
        >
          <Text style={styles.closeByButtonText}>Close By</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Metric({
  label,
  value,
  negative = false,
  positive = false,
  isHighlighted = false,
  isSecondary = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
  isHighlighted?: boolean;
  isSecondary?: boolean;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={[styles.metricRow, isHighlighted && styles.highlightedRow]}>
      <Text style={[styles.metricLabel, isHighlighted && styles.highlightedLabel]}>{label}</Text>
      <Text style={[
        styles.metricValue, 
        negative && styles.negative, 
        positive && styles.positive,
        isSecondary && styles.secondaryValue,
        isHighlighted && styles.highlightedValue
      ]}>{value}</Text>
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
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  card: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.borderMedium,
    backgroundColor: T.glass2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  symbol: {
    color: T.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  instrument: {
    marginTop: 2,
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  sideText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sideTextBuy: {
    color: T.trading.buy.primary,
  },
  sideTextSell: {
    color: T.trading.sell.primary,
  },
  separator: {
    height: 1,
    backgroundColor: T.borderSubtle,
    marginVertical: 12,
  },
  metrics: {
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  highlightedRow: {
    marginTop: 2,
    backgroundColor: T.glass1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricSpacer: {
    height: 4,
  },
  metricLabel: {
    color: T.textSub,
    fontSize: 13,
    fontWeight: '500',
  },
  highlightedLabel: {
    color: T.text,
    fontWeight: '600',
  },
  metricValue: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  secondaryValue: {
    color: T.textSub,
    fontSize: 13,
    fontWeight: '600',
  },
  highlightedValue: {
    fontSize: 16,
    fontWeight: '800',
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
  buttonRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  closeButton: {
    backgroundColor: T.trading.sell.primary,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeByButton: {
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.borderMedium,
  },
  closeByButtonText: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
