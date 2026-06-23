/**
 * Shared "close a single position immediately" flow used by the Trade row's
 * quick-close (X) action.
 *
 * Mirrors ClosePositionScreen.handleClosePosition: the row is removed
 * optimistically for instant feedback, the broker confirmation runs in the
 * background, and the position is restored (with an alert) if the close is
 * rejected. Centralised here so the row and the Close Position screen share
 * the exact same close semantics.
 */
import { Alert } from 'react-native';

import { positionsApi } from '../../api/positions';
import {
  classifyTradingError,
  createFrontendTradingError,
} from '../../api/tradingErrors';
import { appQueryClient } from '../../state/providers/AppProviders';
import { usePositionsState } from '../../state/positionsState';
import { useUserPreferences } from '../../state/userPreferences';
import type { PositionItem } from '../../dev/mock/tradingData';

function isValidCloseTicket(value: unknown): value is string | number {
  return typeof value === 'number'
    ? Number.isInteger(value) && value > 0
    : typeof value === 'string' && /^\d+$/.test(value.trim());
}

// Caches that must refresh once a position actually closes so the History tab
// and account figures reflect the new state.
const CLOSE_INVALIDATION_KEYS = [
  'positionHistory',
  'accountDeals',
  'deals',
  'positions',
  'ordersByLogin',
  'accountSummary',
  'exposure',
  'transactions',
];

/**
 * Closes a single open position right away without opening the Close Position
 * screen. Fire-and-forget: returns synchronously after the optimistic removal;
 * server confirmation and any rollback happen in the background.
 */
export function closePositionImmediately(
  position: PositionItem,
  options?: { resolvedLogin?: string | null },
): void {
  const ticketId = position.id;
  if (!isValidCloseTicket(ticketId)) {
    const feedback = createFrontendTradingError(
      'Position Error',
      'The position ticket is still loading. Try again in a moment.',
    );
    Alert.alert(feedback.title, feedback.message);
    return;
  }

  const accessToken = useUserPreferences.getState().accountDetails?.credentials?.accessToken;
  if (!accessToken) {
    const feedback = createFrontendTradingError(
      'Authentication Error',
      'The app does not have a valid local trading session. Log in again before closing a position.',
    );
    Alert.alert(feedback.title, feedback.message);
    return;
  }

  // Remove the row instantly; restore it if the broker rejects the close.
  const closeSnapshot = { ...position };
  usePositionsState.getState().beginOptimisticClose(ticketId);

  void positionsApi
    .closePosition(ticketId)
    .then(() => {
      const state = usePositionsState.getState();
      state.finishOptimisticClose(ticketId);

      CLOSE_INVALIDATION_KEYS.forEach((key) => {
        appQueryClient.invalidateQueries({ queryKey: [key] });
      });

      if (options?.resolvedLogin) {
        void state.refreshPositions(options.resolvedLogin);
      }
    })
    .catch((error: unknown) => {
      const feedback = classifyTradingError(error, { action: 'close-position' });
      usePositionsState.getState().rollbackOptimisticClose(closeSnapshot);
      Alert.alert(feedback.title, feedback.message);
    });
}
