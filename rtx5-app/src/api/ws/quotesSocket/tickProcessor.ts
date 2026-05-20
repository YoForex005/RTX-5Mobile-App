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
import {
  extractCandlePayloadContext,
  getCandlePayloadItems,
  hasBackendCandleShape,
} from '../../../domain/candles/ws/candlesSocketProtocol';
import { normalizeQuoteTickPayload } from '../quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from '../quoteTimestamp';
import type { QuoteTickEvent } from '../quoteTickNormalizer';

export interface TickProcessorBridge {
  readonly pendingUpdates: Map<string, any>;
  emitTick(tick: QuoteTickEvent): void;
  emitSymbolTick(symbol: string, tick: QuoteTickEvent): void;
  shouldStageQuoteUpdate(): boolean;
  logCandleFeed(event: string, details?: Record<string, unknown>, limit?: number): void;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const pickString = (record: Record<string, unknown> | null, keys: readonly string[]): string | null => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const hasNestedCandleEnvelope = (record: Record<string, unknown>): boolean => {
  const data = asRecord(record.data);
  const payload = asRecord(record.payload);
  const result = asRecord(record.result);
  return Boolean(
    record.candle ||
    record.bar ||
    data?.candle ||
    data?.bar ||
    payload?.candle ||
    payload?.bar ||
    result?.candle ||
    result?.bar,
  );
};

const isExplicitCandlePayload = (payload: unknown): boolean => {
  const record = asRecord(payload);
  if (!record) {
    return false;
  }

  const channel = pickString(record, ['channel', 'topic', 'stream']);
  if (channel && /(?:^|[.:/])candles?(?:[.:/]|$)/i.test(channel)) {
    return true;
  }

  if (hasNestedCandleEnvelope(record)) {
    return true;
  }

  const type = pickString(record, ['type', 'event', 'name']);
  return Boolean(
    type &&
    /^(?:update|candle|bar|ohlc|candle\.update|candles\.update)$/i.test(type) &&
    hasBackendCandleShape(record),
  );
};

const mergeCandleEnvelopeContext = (
  payload: unknown,
  item: unknown,
  symbol: string | null,
  tf: string | null,
): unknown => {
  const itemRecord = asRecord(item);
  if (!itemRecord) {
    return item;
  }

  const payloadRecord = asRecord(payload);
  return {
    ...(payloadRecord?.time === undefined ? {} : { time: payloadRecord.time }),
    ...(payloadRecord?.timestamp === undefined ? {} : { timestamp: payloadRecord.timestamp }),
    ...(payloadRecord?.t === undefined ? {} : { t: payloadRecord.t }),
    ...(payloadRecord?.serverTime === undefined ? {} : { serverTime: payloadRecord.serverTime }),
    ...(payloadRecord?.server_time === undefined ? {} : { server_time: payloadRecord.server_time }),
    ...itemRecord,
    ...(symbol ? { symbol } : {}),
    ...(tf ? { timeframe: tf } : {}),
  };
};

const routeBackendCandleUpdates = (bridge: TickProcessorBridge, payload: unknown): boolean => {
  if (Array.isArray(payload)) {
    let routedAny = false;
    for (const item of payload) {
      routedAny = routeBackendCandleUpdates(bridge, item) || routedAny;
    }
    return routedAny;
  }
  if (!isExplicitCandlePayload(payload)) {
    return false;
  }

  const items = getCandlePayloadItems(payload);
  if (items.length === 0) {
    return false;
  }

  const outerContext = extractCandlePayloadContext(payload);
  let routed = false;

  for (const item of items) {
    if (!hasBackendCandleShape(item)) {
      continue;
    }

    const itemContext = extractCandlePayloadContext(item);
    const symbol = itemContext.symbol ?? outerContext.symbol;
    const tf = itemContext.tf ?? outerContext.tf;
    const routedItem = mergeCandleEnvelopeContext(payload, item, symbol, tf);

    liveCandleStream.ingestLiveCandle(routedItem, symbol ?? undefined, tf ?? undefined);
    bridge.logCandleFeed('feed_candle_update_routed', {
      symbol,
      tf,
    }, 20);
    routed = true;
  }

  return routed;
};

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
    rawSymbol: normalizedUpdate.rawSymbol,
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
    rawSymbol: normalizedUpdate.rawSymbol,
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
  bridge.emitSymbolTick(normalizedUpdate.rawSymbol, tickEvent);
  if (normalizedUpdate.rawSymbol !== normalizedUpdate.symbol) {
    bridge.emitSymbolTick(normalizedUpdate.symbol, tickEvent);
  }
  // Extend the chart's active candle so its close (and wick high/low) keep
  // ticking in real time between authoritative snapshots. The candle stream
  // may also open the current quote bucket when the candle backend is late,
  // while preserving backend OHLC as authoritative when snapshots arrive.
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

  if (!bridge.shouldStageQuoteUpdate()) {
    return false;
  }

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
  let hasUpdates = routeBackendCandleUpdates(bridge, payload);
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
