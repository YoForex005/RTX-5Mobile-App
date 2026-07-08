import {
  normalizeSymbol,
  normalizeTimeframeStrict,
  toBridgeCandleTf,
  type BridgeCandleTimeframe,
} from '../../../domain/candles/core/candles';
import type { Timeframe } from '../../../domain/candles/core/candleTypes';

export type CandleFeedSubscriptionMessageType = 'subscribe_candles' | 'unsubscribe_candles';

export type CandleFeedSubscription = {
  key: string;
  symbol: string;
  tf: Timeframe;
  bridgeTf: BridgeCandleTimeframe;
};

export type CandleFeedSubscriptionMessage = {
  type: CandleFeedSubscriptionMessageType;
  symbols: string[];
  tf: BridgeCandleTimeframe;
};

export const createCandleFeedSubscriptionKey = (symbol: string, tf: string): string =>
  `${symbol}::${tf}`;

export const createCandleFeedSubscription = (
  symbol: string,
  tf: string,
): CandleFeedSubscription | null => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(tf);
  const bridgeTf = toBridgeCandleTf(normalizedTimeframe);
  if (!normalizedSymbol || !normalizedTimeframe || !bridgeTf) {
    return null;
  }

  return {
    key: createCandleFeedSubscriptionKey(normalizedSymbol, normalizedTimeframe),
    symbol: normalizedSymbol,
    tf: normalizedTimeframe,
    bridgeTf,
  };
};

export const buildCandleFeedSubscriptionMessages = (
  type: CandleFeedSubscriptionMessageType,
  subscriptions: Iterable<CandleFeedSubscription>,
): CandleFeedSubscriptionMessage[] => {
  const byTimeframe = new Map<BridgeCandleTimeframe, Set<string>>();
  for (const subscription of subscriptions) {
    const symbols = byTimeframe.get(subscription.bridgeTf) ?? new Set<string>();
    symbols.add(subscription.symbol);
    byTimeframe.set(subscription.bridgeTf, symbols);
  }

  return Array.from(byTimeframe.entries()).map(([tf, symbols]) => ({
    type,
    symbols: Array.from(symbols),
    tf,
  }));
};
