/**
 * Tick processing extracted from `QuotesWebSocketService` to keep the service
 * class under the 500-line ceiling.
 *
 * `processIncomingPayload` does the upstream-shape demux (array vs object vs
 * nested `data`); `processTick` does the heavy work: normalize the wire-shape
 * tick, fan it out to listeners and the candle stream, and stage the merged
 * record into `pendingUpdates` for the next flush. Both depend on a small
 * `TickProcessorBridge` interface so they can be unit-tested without the full
 * service.
 */
import { liveCandleStream } from '../../../domain/candles/stream/liveCandleStream';
import { normalizeQuoteTickPayload } from '../quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from '../quoteTimestamp';
import type { QuoteTickEvent } from '../quoteTickNormalizer';

export interface TickProcessorBridge {
  readonly pendingUpdates: Map<string, any>;
  emitTick(tick: QuoteTickEvent): void;
  emitSymbolTick(symbol: string, tick: QuoteTickEvent): void;
  logCandleFeed(event: string, details?: Record<string, unknown>, limit?: number): void;
}

export const processTick = (bridge: TickProcessorBridge, raw: any): boolean => {
  const receivedAt = Date.now();
  const normalized = normalizeQuoteTickPayload(raw, receivedAt);
  if (!normalized.ok) {
    bridge.logCandleFeed('tick_dropped_before_store', {
      reason: normalized.reason,
      rawKeys: normalized.rawKeys,
    });
    return false;
  }

  const normalizedUpdate = normalized.update;
  const normalizedTimestamp = normalizedUpdate.timestamp;
  const normalizedTimestampMs = normalizeQuoteTickTimestampToMs(normalizedTimestamp);
  const liveListenerTimestamp = normalizedTimestamp ?? receivedAt;
  if (normalizedUpdate.timestampSource === 'received_at') {
    bridge.logCandleFeed('tick_timestamp_fallback_received_at', {
      symbol: normalizedUpdate.symbol,
      timestamp: normalizedTimestamp,
      rawKeys: normalizedUpdate.rawKeys,
    }, 20);
  }
  let data: any = {
    ...(raw && typeof raw === 'object' ? raw : {}),
    symbol: normalizedUpdate.symbol,
    bid: normalizedUpdate.bid,
    ask: normalizedUpdate.ask,
    ...(normalizedUpdate.last === undefined ? {} : { last: normalizedUpdate.last }),
    ...(normalizedUpdate.high === undefined ? {} : { high: normalizedUpdate.high }),
    ...(normalizedUpdate.low === undefined ? {} : { low: normalizedUpdate.low }),
    ...(normalizedUpdate.open === undefined ? {} : { open: normalizedUpdate.open }),
    ...(normalizedUpdate.dailyOpen === undefined ? {} : { dailyOpen: normalizedUpdate.dailyOpen }),
    ...(normalizedUpdate.previousClose === undefined ? {} : { previousClose: normalizedUpdate.previousClose }),
    ...(normalizedUpdate.changePct === undefined ? {} : { changePct: normalizedUpdate.changePct }),
    ...(normalizedUpdate.spread === undefined ? {} : { spread: normalizedUpdate.spread }),
    ...(normalizedUpdate.volume === undefined ? {} : { volume: normalizedUpdate.volume }),
    ...(normalizedUpdate.digits === undefined ? {} : { digits: normalizedUpdate.digits }),
    feedTickAt: normalizedTimestampMs ?? undefined,
    lastReceivedAt: receivedAt,
    ...(normalizedTimestamp === null
      ? {}
      : {
          time: normalizedTimestamp,
          timestamp: normalizedTimestamp,
          t: normalizedTimestamp,
        }),
  };

  const tickEvent: QuoteTickEvent = {
    symbol: normalizedUpdate.symbol,
    bid: normalizedUpdate.bid,
    ask: normalizedUpdate.ask,
    last: normalizedUpdate.last,
    high: normalizedUpdate.high,
    low: normalizedUpdate.low,
    open: normalizedUpdate.open,
    dailyOpen: normalizedUpdate.dailyOpen,
    previousClose: normalizedUpdate.previousClose,
    changePct: normalizedUpdate.changePct,
    spread: normalizedUpdate.spread,
    volume: normalizedUpdate.volume,
    digits: normalizedUpdate.digits,
    feedTickAt: normalizedTimestampMs ?? undefined,
    receivedAt,
    timestamp: liveListenerTimestamp,
  };
  bridge.emitTick(tickEvent);
  // Fan out to per-symbol listeners synchronously. This is the path the
  // Quotes screen relies on for live bid/ask updates — it doesn't need to
  // wait for the rAF/setTimeout-driven Zustand flush.
  bridge.emitSymbolTick(normalizedUpdate.symbol, tickEvent);
  // Extend the chart's active candle so its close (and wick high/low) keep
  // ticking in real time even when the backend candle channel is quiet
  // between authoritative snapshots. The engine guards this strictly:
  //   - Only updates an EXISTING bucket created by backend.
  //   - Never invents a new bucket / closed-history candle.
  //   - Backend live_candle snapshots fully overwrite the bucket on arrival,
  //     preserving backend authority on every snapshot.
  // We pick `bid` as the price source (matches the configured candle price
  // basis); falling back to `ask` if `bid` is somehow missing.
  const tickPriceForCandle = Number.isFinite(normalizedUpdate.bid)
    ? normalizedUpdate.bid
    : Number.isFinite(normalizedUpdate.ask)
      ? normalizedUpdate.ask
      : null;
  if (tickPriceForCandle !== null) {
    try {
      liveCandleStream.extendActiveCandlesFromQuoteTick(normalizedUpdate.symbol, {
        price: tickPriceForCandle,
        time: liveListenerTimestamp,
      });
    } catch (_error) {
      // Defensive: under hot-module-reload the singleton may pre-date this
      // method on its prototype. Skip silently — the chart still receives
      // backend candle snapshots via the dedicated candle WS.
    }
  }
  bridge.logCandleFeed('tick_emitted_to_quote_listeners', {
    symbol: normalizedUpdate.symbol,
    bid: normalizedUpdate.bid,
    ask: normalizedUpdate.ask,
    timestamp: liveListenerTimestamp,
    feedTickAt: normalizedTimestampMs,
    receivedAt,
    rawKeys: normalizedUpdate.rawKeys,
  }, 8);

  // Preserve intra-flush quote extremes. When several ticks arrive within
  // the same event-loop turn, naively overwriting the pending entry would
  // discard any spike high or dip low before quote consumers can render it.
  const existing = bridge.pendingUpdates.get(normalizedUpdate.symbol);
  if (existing) {
    const prevHigh = typeof existing.bidHigh === 'number' ? existing.bidHigh : existing.bid;
    const prevLow = typeof existing.bidLow === 'number' ? existing.bidLow : existing.bid;
    data = {
      ...data,
      bidHigh: Math.max(prevHigh, data.bid),
      bidLow: Math.min(prevLow, data.bid),
    };
  } else {
    data = { ...data, bidHigh: data.bid, bidLow: data.bid };
  }

  bridge.pendingUpdates.set(normalizedUpdate.symbol, data);
  return true;
};

export const processIncomingPayload = (bridge: TickProcessorBridge, payload: any): boolean => {
  let hasUpdates = false;
  const applyCandidate = (candidate: unknown) => {
    if (processTick(bridge, candidate)) hasUpdates = true;
  };
  const payloadRecord = payload && typeof payload === 'object' ? payload : null;

  if (Array.isArray(payload)) {
    payload.forEach(applyCandidate);
  } else if (payloadRecord?.data && Array.isArray(payloadRecord.data)) {
    payloadRecord.data.forEach(applyCandidate);
  } else if (payloadRecord?.data && typeof payloadRecord.data === 'object') {
    applyCandidate(payloadRecord.data);
  } else {
    applyCandidate(payload);
  }

  return hasUpdates;
};
