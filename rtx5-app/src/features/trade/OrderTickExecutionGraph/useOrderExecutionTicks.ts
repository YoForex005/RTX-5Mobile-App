/**
 * Live tick aggregation hook.
 *
 * Subscribes to bid/ask updates for a symbol and maintains a rolling buffer
 * of `TickPoint` history. When real ticks stop flowing for ~1.4s, the hook
 * synthesises gentle demo ticks so the graph stays animated; the demo path
 * is suspended whenever a fresh real tick arrives.
 */
import { useEffect, useRef, useState } from 'react';
import {
  appendTick,
  createDemoTick,
  createInitialTickHistory,
  isFiniteTickValue,
  randomBetween,
  roundToDecimals,
} from './tickHelpers';
import { DEFAULT_MAX_TICKS, type LiveOrderTickExecutionGraphProps, type TickPoint } from './types';

export function useOrderExecutionTicks({
  symbol,
  bid,
  ask,
  timestamp,
  enabled = true,
  maxTicks = DEFAULT_MAX_TICKS,
  priceDecimals = 5,
}: LiveOrderTickExecutionGraphProps) {
  const [ticks, setTicks] = useState<TickPoint[]>([]);
  const ticksRef = useRef<TickPoint[]>([]);
  const lastRealTickKeyRef = useRef('');
  const lastRealTickSeenAtRef = useRef(0);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ticksRef.current = ticks;
  }, [ticks]);

  useEffect(() => {
    ticksRef.current = [];
    setTicks([]);
    lastRealTickKeyRef.current = '';
    lastRealTickSeenAtRef.current = 0;
  }, [symbol]);

  useEffect(() => {
    if (!enabled || !isFiniteTickValue(bid) || !isFiniteTickValue(ask) || bid <= 0 || ask <= 0 || ask < bid) {
      return;
    }

    const tickTime = isFiniteTickValue(timestamp) && timestamp > 0 ? timestamp : Date.now();
    const nextTick: TickPoint = {
      time: tickTime,
      bid: roundToDecimals(bid, priceDecimals),
      ask: roundToDecimals(ask, priceDecimals),
    };
    const tickKey = `${nextTick.time}:${nextTick.bid}:${nextTick.ask}`;
    if (tickKey === lastRealTickKeyRef.current) {
      return;
    }

    lastRealTickKeyRef.current = tickKey;
    lastRealTickSeenAtRef.current = Date.now();
    setTicks((currentTicks) => {
      if (currentTicks.length === 0) {
        return createInitialTickHistory(nextTick, priceDecimals, maxTicks);
      }
      return appendTick(currentTicks, nextTick, maxTicks);
    });
  }, [ask, bid, enabled, maxTicks, priceDecimals, timestamp]);

  useEffect(() => {
    if (!enabled) {
      if (demoTimerRef.current) {
        clearTimeout(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const scheduleDemoTick = () => {
      const delay = randomBetween(300, 700);
      demoTimerRef.current = setTimeout(() => {
        if (cancelled) {
          return;
        }

        const now = Date.now();
        const hasFreshRealTick = lastRealTickSeenAtRef.current > 0 && now - lastRealTickSeenAtRef.current < 1400;
        if (!hasFreshRealTick) {
          const seedTick =
            ticksRef.current[ticksRef.current.length - 1]
            ?? (
              isFiniteTickValue(bid)
                && isFiniteTickValue(ask)
                && bid > 0
                && ask > 0
                && ask >= bid
                ? {
                    time: now,
                    bid: roundToDecimals(bid, priceDecimals),
                    ask: roundToDecimals(ask, priceDecimals),
                  }
                : null
            );

          if (seedTick) {
            setTicks((currentTicks) =>
              appendTick(currentTicks, createDemoTick(seedTick, priceDecimals, bid, ask), maxTicks),
            );
          }
        }

        scheduleDemoTick();
      }, delay);
    };

    scheduleDemoTick();

    return () => {
      cancelled = true;
      if (demoTimerRef.current) {
        clearTimeout(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    };
  }, [ask, bid, enabled, maxTicks, priceDecimals]);

  return ticks;
}
