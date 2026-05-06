import type { Candle } from '../../../../state/tradingState';

export type TickListener = (symbol: string, tf: string, mutatedCandles: Candle[]) => void;
export type ArrayListener = (symbol: string, tf: string, allCandles: Candle[]) => void;

import type { CandleStreamEvent } from '../../core/candles';
export type StreamListener = (event: CandleStreamEvent) => void;

export type SubscriptionState = {
  key: string;
  symbol: string;
  tf: string;
  consumerCount: number;
  candles: Candle[];
  engineUnsubscribe: (() => void) | null;
};
