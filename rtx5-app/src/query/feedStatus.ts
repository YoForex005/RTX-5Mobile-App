import { useQuery } from '@tanstack/react-query';

import { fetchBrokerFeedStatusActiveSymbols } from '../api/feedStatus';
import { isBrokerServiceBaseUrl } from '../api/brokerRouting';
import { useUserPreferences } from '../state/userPreferences';

const FEED_STATUS_REFETCH_MS = 15_000;
const FEED_STATUS_STALE_MS = 5_000;

export function useFeedStatusActiveSymbols(enabled = true) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const brokerId = useUserPreferences((state) => state.brokerId);
  const brokerServerUrl = useUserPreferences((state) => state.brokerServerUrl);
  const accountId = useUserPreferences((state) => state.accountDetails?.id ?? '');
  const isEnabled = Boolean(
    enabled &&
      isLoggedIn &&
      brokerId &&
      isBrokerServiceBaseUrl(brokerServerUrl),
  );

  return useQuery({
    queryKey: ['feed-status', 'active-symbols', brokerId, brokerServerUrl, accountId],
    queryFn: ({ signal }) =>
      fetchBrokerFeedStatusActiveSymbols({
        brokerId,
        serverUrl: brokerServerUrl,
        signal,
      }),
    enabled: isEnabled,
    placeholderData: (previousData) => previousData,
    staleTime: FEED_STATUS_STALE_MS,
    refetchInterval: isEnabled ? FEED_STATUS_REFETCH_MS : false,
  });
}
