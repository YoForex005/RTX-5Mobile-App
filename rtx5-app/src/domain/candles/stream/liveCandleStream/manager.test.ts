import test from 'node:test';
import assert from 'node:assert/strict';

import { SUPPORTED_TIMEFRAMES } from '../../core/timeframeUtils';
import { LiveCandleStreamManager } from './manager';
import type { BufferedLiveEvent, StreamEntry } from './types';

test('one quote reaches every timeframe for its exact symbol and no other symbol', () => {
  const symbolCases = [
    { input: ' eurusd.pro ', normalized: 'EURUSD.PRO' },
    { input: 'xauusd', normalized: 'XAUUSD' },
    { input: 'btcusd', normalized: 'BTCUSD' },
  ] as const;

  for (const { input, normalized } of symbolCases) {
    const manager = new LiveCandleStreamManager();
    const routed: Array<{
      event: BufferedLiveEvent;
      symbol: string;
      timeframe: string;
    }> = [];

    for (const timeframe of SUPPORTED_TIMEFRAMES) {
      manager.entries.set(
        `${normalized}:${timeframe}`,
        {
          symbol: normalized,
          timeframe,
          eventOrder: 0,
        } as StreamEntry,
      );
    }
    manager.entries.set(
      `GBPUSD:M5`,
      {
        symbol: 'GBPUSD',
        timeframe: 'M5',
        eventOrder: 0,
      } as StreamEntry,
    );

    (manager as unknown as {
      enqueueLiveEvent: (entry: StreamEntry, event: BufferedLiveEvent) => void;
    }).enqueueLiveEvent = (entry, event) => {
      routed.push({ event, symbol: entry.symbol, timeframe: entry.timeframe });
    };

    manager.extendActiveCandlesFromQuoteTick(input, {
      price: 1_234.5,
      time: 1_775_000_005,
      allowFlatNewBucket: true,
    });

    assert.deepEqual(
      routed.map(({ symbol, timeframe }) => `${symbol}:${timeframe}`),
      SUPPORTED_TIMEFRAMES.map((timeframe) => `${normalized}:${timeframe}`),
    );
    assert.equal(routed.every(({ symbol }) => symbol === normalized), true);
    assert.equal(
      routed.every(({ event }) => (
        event.type === 'quote_tick_extension' && event.allowFlatNewBucket === true
      )),
      true,
    );
  }
});
