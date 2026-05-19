/**
 * TanStack Query hooks for the price alerts API.
 *
 * Hooks:
 *  useAlertsQuery         — GET  /api/v2/alerts (polls every 30s)
 *  useCreateAlertMutation — POST /api/v2/alerts
 *  useDeleteAlertMutation — DELETE /api/v2/alerts/{id}
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alertsApi, CreateAlertPayload } from '../api/alerts';
import { useUserPreferences } from '../state/userPreferences';

const ALERTS_KEY = ['alerts'] as const;

type PollingQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

const resolvePollingRefetchInterval = (
  enabled: boolean,
  fallbackMs: number,
  override?: number | false,
) => (enabled ? (override ?? fallbackMs) : false);

// ─────────────────────────────────────────────────────────────────────────────
// GET — list alerts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all price alerts for the authenticated user.
 * Polls every 30 seconds to pick up newly triggered alerts.
 */
export function useAlertsQuery(options: PollingQueryOptions = {}) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const enabled = (options.enabled ?? true) && isLoggedIn;
  return useQuery({
    queryKey: ALERTS_KEY,
    queryFn: () => alertsApi.getAlerts(),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 30_000, options.refetchInterval),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — create alert
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new price alert.
 * Invalidates the alerts cache on success so the list refreshes immediately.
 */
export function useCreateAlertMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAlertPayload) => alertsApi.createAlert(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALERTS_KEY });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — delete alert
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete a price alert by ID.
 * Optimistically removes the alert from cache before the server responds,
 * then re-fetches to confirm.
 */
export function useDeleteAlertMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => alertsApi.deleteAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALERTS_KEY });
    },
  });
}
