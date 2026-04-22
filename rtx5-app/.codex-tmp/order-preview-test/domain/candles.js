"use strict";
/**
 * Candle domain logic — OHLC aggregation for live + historical series.
 *
 * Semantics (MT5 / TradingView parity):
 *
 *   1. Bars are bucket-aligned to their timeframe interval.
 *   2. Closed bars are immutable. Only the active (current-bucket) bar mutates
 *      in response to live ticks.
 *   3. A tick that rolls into the IMMEDIATE next bucket opens the new live bar
 *      from the previous close so the visible handoff stays continuous until
 *      REST history heals the bucket's true open. If one or more whole buckets
 *      were missed, the sparse live bar opens at the first observed tick price
 *      instead of stretching a synthetic body across unseen time.
 *   4. Wick extremes never shrink within a bucket — highs are monotonically
 *      non-decreasing, lows monotonically non-increasing.
 *   5. Late / out-of-order ticks update their owning bucket; they never corrupt
 *      a newer bar.
 *   6. **Missing buckets are never fabricated.** If a tick rolls past the
 *      active bucket by more than `maxGapBuckets`, the caller must resync from
 *      REST — silent flat-fill is dishonest and hides connection problems.
 *   7. Timestamp unit (seconds / ms / µs / ns) is detected once by magnitude.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeRecentHistoryIntoCandles = exports.overlayLiveCandlesOnHistory = exports.applyLivePriceToCandleSeries = exports.materializeCanonicalHistoryAndLiveCandles = exports.materializeHistoryAndLiveCandles = exports.pruneLiveCandlesCoveredByHistory = exports.hasExcessiveLivePriceGap = exports.getBucketGapCount = exports.buildFlatGapCandles = exports.isWithinLiveBucketHorizon = exports.getCurrentBucketTime = exports.getExpectedNextCandleTime = exports.normalizeCandleSeries = exports.extractIncomingCandlePayloads = exports.dedupeIncomingCandlePayloads = exports.sortAndDedupeCandles = exports.mergeCandleUpdate = exports.parseIncomingCandlePayload = exports.normalizeCandle = exports.isBucketAlignedCandle = exports.isStructurallyValidCandle = exports.normalizeTimestampToBucket = exports.normalizeTimestampToSeconds = exports.alignTimeToBucketWithReference = exports.alignTimeToBucket = exports.requiresHistoryAnchorForLiveBucketing = exports.getTimeframeSeconds = exports.normalizeTimeframe = exports.normalizeSymbol = exports.MAX_CANDLE_SERIES_LENGTH = exports.DEFAULT_CANDLE_HISTORY_LIMIT = void 0;
const symbols_1 = require("./symbols");
exports.DEFAULT_CANDLE_HISTORY_LIMIT = 500;
exports.MAX_CANDLE_SERIES_LENGTH = 2500;
// ─── Timeframes ─────────────────────────────────────────────────────────────
const TIMEFRAME_SECONDS = {
    M1: 60,
    M5: 300,
    M15: 900,
    M30: 1800,
    H1: 3600,
    H4: 14400,
    D1: 86400,
    W1: 604800,
    MN: 2592000,
};
const TIMEFRAME_ALIASES = {
    '1M': 'M1',
    '5M': 'M5',
    '15M': 'M15',
    '30M': 'M30',
    '1H': 'H1',
    '4H': 'H4',
    '1D': 'D1',
    '1W': 'W1',
    '1MO': 'MN',
};
const normalizeSymbol = (symbol) => (0, symbols_1.normalizeSymbol)(symbol);
exports.normalizeSymbol = normalizeSymbol;
const normalizeTimeframe = (timeframe) => {
    const tf = timeframe.trim().toUpperCase();
    return TIMEFRAME_ALIASES[tf] ?? tf;
};
exports.normalizeTimeframe = normalizeTimeframe;
const getTimeframeSeconds = (timeframe) => {
    return TIMEFRAME_SECONDS[(0, exports.normalizeTimeframe)(timeframe)] ?? 60;
};
exports.getTimeframeSeconds = getTimeframeSeconds;
const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const requiresHistoryAnchorForLiveBucketing = (timeframe) => {
    const normalizedTimeframe = (0, exports.normalizeTimeframe)(timeframe);
    return normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1' || normalizedTimeframe === 'MN';
};
exports.requiresHistoryAnchorForLiveBucketing = requiresHistoryAnchorForLiveBucketing;
const addUtcMonthsClamped = (timeInSeconds, monthOffset) => {
    const date = new Date(timeInSeconds * 1000);
    const targetMonthIndex = date.getUTCMonth() + monthOffset;
    const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const targetDay = date.getUTCDate();
    const lastDayOfSourceMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const resolvedDay = targetDay === lastDayOfSourceMonth
        ? lastDayOfTargetMonth
        : Math.min(targetDay, lastDayOfTargetMonth);
    return Math.floor(Date.UTC(targetYear, targetMonth, resolvedDay, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()) / 1000);
};
const addTradingDaysPreservingTime = (timeInSeconds, dayOffset) => {
    const direction = dayOffset >= 0 ? 1 : -1;
    let remainingDays = Math.abs(dayOffset);
    const date = new Date(timeInSeconds * 1000);
    while (remainingDays > 0) {
        date.setUTCDate(date.getUTCDate() + direction);
        const dayOfWeek = date.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            remainingDays -= 1;
        }
    }
    return Math.floor(date.getTime() / 1000);
};
const alignTimeToUtcWeek = (timeInSeconds) => {
    const date = new Date(timeInSeconds * 1000);
    const startOfDay = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    return startOfDay - daysSinceMonday * DAY_SECONDS;
};
const alignTimeToUtcMonth = (timeInSeconds) => {
    const date = new Date(timeInSeconds * 1000);
    return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
};
const alignMonthlyBucketWithReference = (timeInSeconds, referenceBucketTime) => {
    const referenceDate = new Date(referenceBucketTime * 1000);
    const currentDate = new Date(timeInSeconds * 1000);
    let monthOffset = (currentDate.getUTCFullYear() - referenceDate.getUTCFullYear()) * 12 +
        (currentDate.getUTCMonth() - referenceDate.getUTCMonth());
    let candidate = addUtcMonthsClamped(referenceBucketTime, monthOffset);
    while (candidate > timeInSeconds) {
        monthOffset -= 1;
        candidate = addUtcMonthsClamped(referenceBucketTime, monthOffset);
    }
    while (true) {
        const nextCandidate = addUtcMonthsClamped(referenceBucketTime, monthOffset + 1);
        if (nextCandidate > timeInSeconds) {
            return candidate;
        }
        monthOffset += 1;
        candidate = nextCandidate;
    }
};
// ─── Primitives ─────────────────────────────────────────────────────────────
const toFiniteNumber = (value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const hasFiniteField = (input, keys) => {
    for (const key of keys) {
        const value = input[key];
        if (value === null || value === undefined || value === '')
            continue;
        const parsed = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(parsed))
            return true;
    }
    return false;
};
/**
 * Single-shot magnitude detection for timestamp units.
 *
 *   > 4.2e16 → nanoseconds
 *   > 4.2e13 → microseconds
 *   > 4.2e10 → milliseconds
 *   else     → seconds
 */
const coerceTimestampToSeconds = (value) => {
    if (value > 4.2e16)
        return Math.floor(value / 1_000_000_000);
    if (value > 4.2e13)
        return Math.floor(value / 1_000_000);
    if (value > 4.2e10)
        return Math.floor(value / 1_000);
    return Math.floor(value);
};
// ─── Bucket alignment ───────────────────────────────────────────────────────
const alignTimeToBucket = (timeInSeconds, timeframe) => {
    const normalizedTimeframe = (0, exports.normalizeTimeframe)(timeframe);
    if (normalizedTimeframe === 'W1') {
        return alignTimeToUtcWeek(timeInSeconds);
    }
    if (normalizedTimeframe === 'MN') {
        return alignTimeToUtcMonth(timeInSeconds);
    }
    const intervalSeconds = (0, exports.getTimeframeSeconds)(normalizedTimeframe);
    return Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
};
exports.alignTimeToBucket = alignTimeToBucket;
const alignTimeToBucketWithReference = (timeInSeconds, timeframe, referenceBucketTime) => {
    const normalizedTimeframe = (0, exports.normalizeTimeframe)(timeframe);
    if (!Number.isFinite(referenceBucketTime)) {
        return (0, exports.alignTimeToBucket)(timeInSeconds, normalizedTimeframe);
    }
    if (normalizedTimeframe === 'MN') {
        return alignMonthlyBucketWithReference(timeInSeconds, Number(referenceBucketTime));
    }
    const intervalSeconds = (0, exports.getTimeframeSeconds)(normalizedTimeframe);
    const anchor = Number(referenceBucketTime);
    return anchor + Math.floor((timeInSeconds - anchor) / intervalSeconds) * intervalSeconds;
};
exports.alignTimeToBucketWithReference = alignTimeToBucketWithReference;
const normalizeTimestampToSeconds = (value) => {
    if (value === null || value === undefined)
        return null;
    let seconds = null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        seconds = coerceTimestampToSeconds(value);
    }
    else if (typeof value === 'string') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            seconds = coerceTimestampToSeconds(numeric);
        }
        else {
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) {
                seconds = Math.floor(parsed / 1000);
            }
        }
    }
    if (seconds === null || seconds <= 0)
        return null;
    return seconds;
};
exports.normalizeTimestampToSeconds = normalizeTimestampToSeconds;
const normalizeTimeValue = (value, timeframe, referenceBucketTime) => {
    const seconds = (0, exports.normalizeTimestampToSeconds)(value);
    if (seconds === null)
        return null;
    return (0, exports.alignTimeToBucketWithReference)(seconds, timeframe, referenceBucketTime);
};
const normalizeTimestampToBucket = (value, timeframe, referenceBucketTime) => {
    return normalizeTimeValue(value, timeframe, referenceBucketTime);
};
exports.normalizeTimestampToBucket = normalizeTimestampToBucket;
// ─── OHLC validation ────────────────────────────────────────────────────────
const isStructurallyValidCandle = (candle) => {
    if (!candle)
        return false;
    return (Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= Math.max(candle.open, candle.close) &&
        candle.low <= Math.min(candle.open, candle.close) &&
        candle.high >= candle.low);
};
exports.isStructurallyValidCandle = isStructurallyValidCandle;
const isBucketAlignedCandle = (candle, timeframe) => {
    const normalizedTimeframe = (0, exports.normalizeTimeframe)(timeframe);
    if (normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1' || normalizedTimeframe === 'MN') {
        return Number.isFinite(candle.time);
    }
    return candle.time === (0, exports.alignTimeToBucket)(candle.time, normalizedTimeframe);
};
exports.isBucketAlignedCandle = isBucketAlignedCandle;
// ─── Parsing ────────────────────────────────────────────────────────────────
const normalizeCandle = (input, timeframe) => {
    const explicitOpen = toFiniteNumber(input.open ?? input.o);
    const explicitHigh = toFiniteNumber(input.high ?? input.h);
    const explicitLow = toFiniteNumber(input.low ?? input.l);
    const hasExplicitBarShape = explicitOpen !== null || explicitHigh !== null || explicitLow !== null;
    const rawTime = (0, exports.normalizeTimestampToSeconds)(input.time ?? input.timestamp ?? input.ts ?? input.t);
    const time = rawTime === null
        ? null
        : hasExplicitBarShape
            ? rawTime
            : (0, exports.alignTimeToBucket)(rawTime, timeframe);
    const close = toFiniteNumber(input.close ?? input.c ?? input.price ?? input.p ?? input.bid ?? input.ask);
    const volume = toFiniteNumber(input.volume ?? input.v) ?? 0;
    if (time === null || close === null)
        return null;
    const open = explicitOpen ?? close;
    const high = explicitHigh ?? Math.max(open, close);
    const low = explicitLow ?? Math.min(open, close);
    if (explicitHigh !== null && explicitHigh < Math.max(open, close))
        return null;
    if (explicitLow !== null && explicitLow > Math.min(open, close))
        return null;
    if (explicitHigh !== null && explicitLow !== null && explicitHigh < explicitLow)
        return null;
    const candle = {
        time,
        open,
        high,
        low,
        close,
        volume: Math.max(volume, 0),
    };
    return (0, exports.isStructurallyValidCandle)(candle) && (hasExplicitBarShape || (0, exports.isBucketAlignedCandle)(candle, timeframe)) ? candle : null;
};
exports.normalizeCandle = normalizeCandle;
const parseIncomingCandlePayload = (input, timeframe) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return null;
    const payload = input;
    const candle = (0, exports.normalizeCandle)(payload, timeframe);
    if (!candle)
        return null;
    return {
        candle,
        hasExplicitHighLow: hasFiniteField(payload, ['high', 'h', 'High', 'H']) &&
            hasFiniteField(payload, ['low', 'l', 'Low', 'L']),
    };
};
exports.parseIncomingCandlePayload = parseIncomingCandlePayload;
// ─── Merge ──────────────────────────────────────────────────────────────────
/**
 * Merge a tick/bar update into the active bar of the same bucket.
 * Wick extremes expand monotonically; close follows the newest tick; open is
 * pinned (it was set by the first tick in the bucket and never changes).
 */
const mergeCandleUpdate = (existing, incoming) => {
    const merged = {
        time: existing.time,
        open: existing.open,
        high: Math.max(existing.high, incoming.high, incoming.close),
        low: Math.min(existing.low, incoming.low, incoming.close),
        close: incoming.close,
        volume: (Number.isFinite(incoming.volume) && incoming.volume > 0) ? incoming.volume : existing.volume,
    };
    if (!(0, exports.isStructurallyValidCandle)(merged))
        return null;
    if (merged.time === existing.time &&
        merged.open === existing.open &&
        merged.high === existing.high &&
        merged.low === existing.low &&
        merged.close === existing.close &&
        merged.volume === existing.volume) {
        return existing;
    }
    return merged;
};
exports.mergeCandleUpdate = mergeCandleUpdate;
// ─── Series ops ─────────────────────────────────────────────────────────────
const sortAndDedupeCandles = (candles) => {
    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const deduped = [];
    for (const candle of sorted) {
        if (!(0, exports.isStructurallyValidCandle)(candle))
            continue;
        const last = deduped[deduped.length - 1];
        if (!last || last.time !== candle.time) {
            deduped.push(candle);
            continue;
        }
        const merged = (0, exports.mergeCandleUpdate)(last, candle);
        if (merged)
            deduped[deduped.length - 1] = merged;
    }
    return deduped;
};
exports.sortAndDedupeCandles = sortAndDedupeCandles;
const dedupeIncomingCandlePayloads = (entries) => {
    const sorted = [...entries].sort((a, b) => a.candle.time - b.candle.time);
    const deduped = [];
    for (const entry of sorted) {
        const last = deduped[deduped.length - 1];
        if (!last || last.candle.time !== entry.candle.time) {
            deduped.push(entry);
            continue;
        }
        const merged = (0, exports.mergeCandleUpdate)(last.candle, entry.candle);
        if (!merged)
            continue;
        deduped[deduped.length - 1] = {
            candle: merged,
            hasExplicitHighLow: last.hasExplicitHighLow || entry.hasExplicitHighLow,
        };
    }
    return deduped;
};
exports.dedupeIncomingCandlePayloads = dedupeIncomingCandlePayloads;
const extractIncomingCandlePayloads = (payload, timeframe) => {
    const parsed = [];
    const pushParsed = (item) => {
        const candle = (0, exports.parseIncomingCandlePayload)(item, timeframe);
        if (candle)
            parsed.push(candle);
    };
    if (Array.isArray(payload)) {
        payload.forEach(pushParsed);
        return (0, exports.dedupeIncomingCandlePayloads)(parsed);
    }
    if (!payload || typeof payload !== 'object')
        return [];
    const record = payload;
    if (Array.isArray(record.data)) {
        record.data.forEach(pushParsed);
    }
    else if (Array.isArray(record.candles)) {
        record.candles.forEach(pushParsed);
    }
    else {
        pushParsed(record.candle ?? payload);
    }
    return (0, exports.dedupeIncomingCandlePayloads)(parsed);
};
exports.extractIncomingCandlePayloads = extractIncomingCandlePayloads;
const normalizeCandleSeries = (candles, timeframe) => {
    const normalized = candles
        .map((item) => (item && typeof item === 'object' ? (0, exports.normalizeCandle)(item, timeframe) : null))
        .filter((item) => item !== null);
    return (0, exports.sortAndDedupeCandles)(normalized);
};
exports.normalizeCandleSeries = normalizeCandleSeries;
// ─── Bucket horizon helpers ─────────────────────────────────────────────────
const getExpectedNextCandleTime = (lastTime, timeframe) => {
    const normalizedTimeframe = (0, exports.normalizeTimeframe)(timeframe);
    if (normalizedTimeframe === 'MN') {
        return addUtcMonthsClamped(lastTime, 1);
    }
    if (normalizedTimeframe === 'W1') {
        return lastTime + WEEK_SECONDS;
    }
    if (normalizedTimeframe === 'D1') {
        return addTradingDaysPreservingTime(lastTime, 1);
    }
    return lastTime + (0, exports.getTimeframeSeconds)(normalizedTimeframe);
};
exports.getExpectedNextCandleTime = getExpectedNextCandleTime;
const getCurrentBucketTime = (timeframe, nowInSeconds = Math.floor(Date.now() / 1000)) => {
    return (0, exports.alignTimeToBucket)(nowInSeconds, timeframe);
};
exports.getCurrentBucketTime = getCurrentBucketTime;
const isWithinLiveBucketHorizon = (candleTime, timeframe, nowInSeconds = Math.floor(Date.now() / 1000)) => {
    const currentBucket = (0, exports.getCurrentBucketTime)(timeframe, nowInSeconds);
    return candleTime <= (0, exports.getExpectedNextCandleTime)(currentBucket, timeframe);
};
exports.isWithinLiveBucketHorizon = isWithinLiveBucketHorizon;
/**
 * Build flat-valued bars between two non-contiguous bucket times.
 * Kept as a utility for explicit callers (e.g. `candlesSocket` historical
 * patches); the live aggregator deliberately does NOT call this any more,
 * because fabricated bars hide real connection issues.
 */
const buildFlatGapCandles = (lastCandle, incomingTime, timeframe) => {
    const candles = [];
    let nextTime = (0, exports.getExpectedNextCandleTime)(lastCandle.time, timeframe);
    while (nextTime < incomingTime) {
        candles.push({
            time: nextTime,
            open: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
            close: lastCandle.close,
            volume: 0,
        });
        nextTime = (0, exports.getExpectedNextCandleTime)(nextTime, timeframe);
    }
    return candles;
};
exports.buildFlatGapCandles = buildFlatGapCandles;
const getBucketGapCount = (fromTime, toTime, timeframe) => {
    if (toTime <= fromTime)
        return 0;
    const normalizedTimeframe = (0, exports.normalizeTimeframe)(timeframe);
    if (!(0, exports.requiresHistoryAnchorForLiveBucketing)(normalizedTimeframe)) {
        const intervalSeconds = (0, exports.getTimeframeSeconds)(normalizedTimeframe);
        return Math.floor((toTime - fromTime) / intervalSeconds);
    }
    let cursor = fromTime;
    let bucketCount = 0;
    while (cursor < toTime) {
        const nextTime = (0, exports.getExpectedNextCandleTime)(cursor, normalizedTimeframe);
        bucketCount += 1;
        if (nextTime >= toTime || nextTime <= cursor) {
            return bucketCount;
        }
        cursor = nextTime;
    }
    return bucketCount;
};
exports.getBucketGapCount = getBucketGapCount;
const hasExcessiveLivePriceGap = (candles, price, timestamp, timeframe, maxAutoGapFillCandles = 5) => {
    if (candles.length === 0)
        return false;
    const normalized = (0, exports.normalizeCandle)({ bid: price, timestamp }, timeframe);
    if (!normalized)
        return false;
    const lastCandle = candles[candles.length - 1];
    return (normalized.time > lastCandle.time &&
        (0, exports.getBucketGapCount)(lastCandle.time, normalized.time, timeframe) > maxAutoGapFillCandles);
};
exports.hasExcessiveLivePriceGap = hasExcessiveLivePriceGap;
/**
 * Protect the visible series from a stale REST snapshot that ends far behind a
 * newly formed live tail. When that handoff gap exceeds the tolerated bucket
 * count, keep only the recent live segment and let background resync backfill
 * history later instead of rendering detached price regions together.
 */
const pruneLiveCandlesCoveredByHistory = (historyCandles, liveCandles) => {
    const normalizedLive = (0, exports.sortAndDedupeCandles)(liveCandles);
    if (normalizedLive.length === 0 || historyCandles.length === 0) {
        return normalizedLive.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    const historyLastTime = historyCandles[historyCandles.length - 1].time;
    return normalizedLive
        .filter((candle) => candle.time >= historyLastTime)
        .slice(-exports.MAX_CANDLE_SERIES_LENGTH);
};
exports.pruneLiveCandlesCoveredByHistory = pruneLiveCandlesCoveredByHistory;
const materializeHistoryAndLiveCandles = (historyCandles, liveCandles, timeframe) => {
    const normalizedHistory = (0, exports.sortAndDedupeCandles)(historyCandles);
    const normalizedLive = (0, exports.sortAndDedupeCandles)(liveCandles);
    if (normalizedHistory.length === 0) {
        return normalizedLive.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    if (normalizedLive.length === 0) {
        return normalizedHistory.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    const historyLastTime = normalizedHistory[normalizedHistory.length - 1].time;
    const firstLiveTime = normalizedLive[0].time;
    if ((0, exports.getBucketGapCount)(historyLastTime, firstLiveTime, timeframe) > 1) {
        return normalizedLive.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    return (0, exports.sortAndDedupeCandles)([...normalizedHistory, ...normalizedLive]).slice(-exports.MAX_CANDLE_SERIES_LENGTH);
};
exports.materializeHistoryAndLiveCandles = materializeHistoryAndLiveCandles;
/**
 * Fast-path materializer for callers that already maintain both inputs as
 * individually sorted + de-duplicated candle arrays.
 *
 * This preserves the same visible-series semantics as
 * `materializeHistoryAndLiveCandles` but avoids re-sorting the entire merged
 * history window on every live tick. Live candles override history buckets
 * with the same timestamp, which is exactly what the chart needs once the live
 * overlay starts mutating the active bar.
 */
const materializeCanonicalHistoryAndLiveCandles = (historyCandles, liveCandles, timeframe) => {
    if (historyCandles.length === 0) {
        return liveCandles.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    if (liveCandles.length === 0) {
        return historyCandles.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    const historyLastTime = historyCandles[historyCandles.length - 1].time;
    const firstLiveTime = liveCandles[0].time;
    if ((0, exports.getBucketGapCount)(historyLastTime, firstLiveTime, timeframe) > 1) {
        return liveCandles.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    const merged = [];
    let historyIndex = 0;
    let liveIndex = 0;
    while (historyIndex < historyCandles.length && liveIndex < liveCandles.length) {
        const history = historyCandles[historyIndex];
        const live = liveCandles[liveIndex];
        if (history.time < live.time) {
            merged.push(history);
            historyIndex += 1;
            continue;
        }
        if (history.time > live.time) {
            merged.push(live);
            liveIndex += 1;
            continue;
        }
        // Live overlay wins for the same bucket because it carries the freshest
        // close/wick shape for the active candle.
        merged.push(live);
        historyIndex += 1;
        liveIndex += 1;
    }
    while (historyIndex < historyCandles.length) {
        merged.push(historyCandles[historyIndex]);
        historyIndex += 1;
    }
    while (liveIndex < liveCandles.length) {
        merged.push(liveCandles[liveIndex]);
        liveIndex += 1;
    }
    return merged.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
};
exports.materializeCanonicalHistoryAndLiveCandles = materializeCanonicalHistoryAndLiveCandles;
const resolveApplyLivePriceOptions = (input) => {
    if (typeof input === 'number') {
        return { maxAutoGapFillCandles: input, allowSparseAppendOnGap: false };
    }
    return {
        maxAutoGapFillCandles: input?.maxAutoGapFillCandles ?? 5,
        allowSparseAppendOnGap: input?.allowSparseAppendOnGap ?? false,
    };
};
/**
 * Apply a single live tick to a bucket-aligned series.
 *
 *   1. Tick inside the active bucket → merge: expand wick, update close.
 *   2. Tick rolls into the NEXT bucket → close active bar, open the new bar at
 *      the previous close so the live handoff stays visually continuous.
 *   3. Tick rolls past several buckets → the gap exceeds `maxAutoGapFillCandles`:
 *        - default: return series unchanged; caller must resync.
 *        - `allowSparseAppendOnGap`: append the new bar at the tick's price
 *          and leave the intermediate buckets missing.
 *   4. Tick falls into an earlier bucket (late / out-of-order) → merge into
 *      that bucket only.
 */
const applyLivePriceToCandleSeries = (candles, price, timestamp, timeframe, options) => {
    const { maxAutoGapFillCandles, allowSparseAppendOnGap } = resolveApplyLivePriceOptions(options);
    const normalized = (0, exports.normalizeCandle)({ bid: price, timestamp }, timeframe);
    if (!normalized)
        return candles;
    if (candles.length === 0)
        return [normalized];
    const nextCandles = [...candles];
    const lastCandle = nextCandles[nextCandles.length - 1];
    // Case 1 — active bucket update.
    if (normalized.time === lastCandle.time) {
        const merged = (0, exports.mergeCandleUpdate)(lastCandle, normalized);
        if (!merged || merged === lastCandle)
            return candles;
        nextCandles[nextCandles.length - 1] = merged;
        return nextCandles;
    }
    // Cases 2 & 3 — forward rollover.
    if (normalized.time > lastCandle.time) {
        const gapBuckets = (0, exports.getBucketGapCount)(lastCandle.time, normalized.time, timeframe) - 1;
        const nextOpen = gapBuckets === 0 ? lastCandle.close : normalized.close;
        const nextLiveCandle = {
            time: normalized.time,
            open: nextOpen,
            high: Math.max(nextOpen, normalized.close),
            low: Math.min(nextOpen, normalized.close),
            close: normalized.close,
            volume: normalized.volume,
        };
        if (gapBuckets > maxAutoGapFillCandles) {
            if (!allowSparseAppendOnGap)
                return candles;
            nextCandles.push(nextLiveCandle);
            return nextCandles.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
        }
        nextCandles.push(nextLiveCandle);
        return nextCandles.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    }
    // Case 4 — late tick for an earlier bucket.
    const existingIndex = nextCandles.findIndex((candle) => candle.time === normalized.time);
    if (existingIndex === -1)
        return candles;
    const mergedHistorical = (0, exports.mergeCandleUpdate)(nextCandles[existingIndex], normalized);
    if (!mergedHistorical || mergedHistorical === nextCandles[existingIndex])
        return candles;
    nextCandles[existingIndex] = mergedHistorical;
    return nextCandles;
};
exports.applyLivePriceToCandleSeries = applyLivePriceToCandleSeries;
// ─── History overlay / heal ─────────────────────────────────────────────────
const overlayLiveCandlesOnHistory = (historyCandles, liveCandles) => {
    if (historyCandles.length === 0)
        return liveCandles.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    if (liveCandles.length === 0)
        return historyCandles.slice(-exports.MAX_CANDLE_SERIES_LENGTH);
    return (0, exports.sortAndDedupeCandles)([...historyCandles, ...liveCandles]).slice(-exports.MAX_CANDLE_SERIES_LENGTH);
};
exports.overlayLiveCandlesOnHistory = overlayLiveCandlesOnHistory;
/**
 * Heal the active bar using a recent REST snapshot. REST is authoritative for
 * the bar's true open (the first tick of the bucket, which the live stream
 * often misses if it subscribed mid-bucket); the live stream is authoritative
 * for the latest close. Wick extremes expand from both sources.
 */
const mergeActiveCandleWithRecentHistory = (existing, historical) => {
    const healed = {
        time: existing.time,
        open: historical.open,
        high: Math.max(existing.high, historical.high, historical.open, historical.close, existing.close),
        low: Math.min(existing.low, historical.low, historical.open, historical.close, existing.close),
        close: existing.close,
        volume: Math.max(existing.volume, historical.volume),
    };
    if (!(0, exports.isStructurallyValidCandle)(healed))
        return null;
    if (healed.time === existing.time &&
        healed.open === existing.open &&
        healed.high === existing.high &&
        healed.low === existing.low &&
        healed.close === existing.close &&
        healed.volume === existing.volume) {
        return existing;
    }
    return healed;
};
const mergeRecentHistoryIntoCandles = (candles, recentHistory, timeframe) => {
    if (candles.length === 0)
        return (0, exports.sortAndDedupeCandles)(recentHistory);
    const currentLastTime = candles[candles.length - 1].time;
    const cacheTimes = new Map(candles.map((candle, index) => [candle.time, index]));
    const nextCandles = [...candles];
    let changed = false;
    for (const historical of recentHistory) {
        if (!(0, exports.isStructurallyValidCandle)(historical) || !(0, exports.isBucketAlignedCandle)(historical, timeframe))
            continue;
        const existingIndex = cacheTimes.get(historical.time);
        if (existingIndex === undefined) {
            if (historical.time < currentLastTime) {
                nextCandles.push(historical);
                changed = true;
            }
            continue;
        }
        const existing = nextCandles[existingIndex];
        const healed = historical.time < currentLastTime
            ? historical
            : mergeActiveCandleWithRecentHistory(existing, historical) ?? historical;
        if (existing.time !== healed.time ||
            existing.open !== healed.open ||
            existing.high !== healed.high ||
            existing.low !== healed.low ||
            existing.close !== healed.close ||
            existing.volume !== healed.volume) {
            nextCandles[existingIndex] = healed;
            changed = true;
        }
    }
    return changed ? (0, exports.sortAndDedupeCandles)(nextCandles) : candles;
};
exports.mergeRecentHistoryIntoCandles = mergeRecentHistoryIntoCandles;
