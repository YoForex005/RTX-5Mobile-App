import { useQuery } from '@tanstack/react-query';
import { getEquityHistory, EquityHistoryResponse } from '../api/equityHistory';

export const EQUITY_HISTORY_KEY = 'equityHistory';

/**
 * TanStack Query hook for fetching equity curve data.
 *
 * @param period   - Time period: '7d' | '30d' | '90d' | '1y'
 * @param interval - Data interval: '1h' | '4h' | '1d'
 */
export function useEquityHistory(period: string = '30d', interval: string = '1d') {
  return useQuery<EquityHistoryResponse, Error>({
    queryKey: [EQUITY_HISTORY_KEY, period, interval],
    queryFn: () => getEquityHistory(period, interval),
    staleTime: 60000,       // 1 minute before stale
    refetchInterval: 60000, // Re-poll every 60s
  });
}
