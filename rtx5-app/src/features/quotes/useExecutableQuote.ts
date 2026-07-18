import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  getFeedHealthSnapshot,
  subscribeFeedHealth,
} from '../../market/feedHealthRuntime';
import {
  resolveSessionQuoteActionAvailability,
  type QuoteActionAvailability,
} from '../../market/quoteIntegrity';
import {
  useLiveQuoteSnapshot,
  useLiveQuoteSubscription,
} from './useLiveQuotes';

/**
 * Shared fail-closed quote gate for any control that can change an order or
 * position at a market-dependent price. The health subscription and one-second
 * clock make controls disable as status/freshness changes even without a tick.
 */
export function useExecutableQuote(symbol: string, active = true) {
  useLiveQuoteSubscription(symbol, active);
  const quote = useLiveQuoteSnapshot(symbol, active);
  const health = useSyncExternalStore(
    subscribeFeedHealth,
    getFeedHealthSnapshot,
    getFeedHealthSnapshot,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);

  const availability = useMemo<QuoteActionAvailability>(
    () => resolveSessionQuoteActionAvailability(quote, now),
    [health, now, quote],
  );
  const getCurrentAvailability = useCallback(
    () => resolveSessionQuoteActionAvailability(quote, Date.now()),
    [quote],
  );

  return { quote, availability, getCurrentAvailability } as const;
}

