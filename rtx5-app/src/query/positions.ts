/**
 * Core module: positions.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { positionsApi, Position, ClosedPosition } from '../api/positions';
import { PositionItem } from '../dev/mock/tradingData';

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
// TanStack Query hooks for the Positions API.
// These hooks wrap the positionsApi functions and provide:
//   • Automatic caching & background refetch
//   • Optimistic cache invalidation on mutations
//   • Consistent query key namespacing for cross-component cache sharing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a raw Position DTO from the API into the app's PositionItem model.
 * Centralizes the DTO → UI transformation so all consumers get consistent data.
 */
function mapPositionToItem(dto: Position): PositionItem {
  return {
    id: String(dto.ticket),
    symbol: dto.symbol,
    side: dto.side,
    volume: dto.volume,
    openPrice: dto.price_open,
    currentPrice: dto.price_current,
    pnl: dto.profit + (dto.swap || 0) + (dto.commission || 0),
    swap: dto.swap || 0,
    openTime: new Date(dto.time_create * 1000).toISOString(),
    sl: dto.price_sl || 0,
    tp: dto.price_tp || 0,
  };
}

/**
 * Fetch open positions for a trading account.
 * Auto-refreshes every 5 seconds while the component is mounted.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function usePositionsQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const enabled = !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: ['positions', login],
    queryFn: () => positionsApi.getPositions(login!),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 5000, options.refetchInterval),
    select: (data: Position[]) => data.map(mapPositionToItem),
  });
}

/**
 * Fetch closed position history for a trading account.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function usePositionHistoryQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const enabled = !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: ['positionHistory', login],
    queryFn: () => positionsApi.getPositionHistory(login!),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 5000, options.refetchInterval),
  });
}

/**
 * Mutation to close an open position by its ticket ID.
 * On success, invalidates positions, account summary, exposure, and transactions caches.
 */
export function useClosePositionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string | number) => positionsApi.closePosition(ticketId),
    onSuccess: () => {
      // Invalidate all caches that could be affected by closing a position
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['positionHistory'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['accountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['exposure'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
