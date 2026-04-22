"use strict";
/**
 * Historical Candlestick Data API (V2)
 *
 * Fetches paginated OHLCV (Open, High, Low, Close, Volume) data
 * required to render the initial state of the Lightweight Charts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCandleHistory = getCandleHistory;
const apiClient_1 = require("./apiClient");
const candleHistoryQuery_1 = require("./candleHistoryQuery");
const candles_1 = require("../domain/candles");
/**
 * Fetches historical candlestick data for a given symbol and timeframe.
 *
 * GET /api/v1/candles?symbol={symbol}&timeframe={timeframe}&count={count}
 *
 * @param symbol    - Trading pair (e.g. 'EURUSD', 'XAUUSD')
 * @param timeframe - Candle period (e.g. 'M1', 'M5', 'H1', 'D1')
 * @param count     - Number of candles to fetch (default 200)
 */
async function getCandleHistory(symbol, timeframe, count = candles_1.DEFAULT_CANDLE_HISTORY_LIMIT, options) {
    const requestedSymbol = (0, candles_1.normalizeSymbol)(symbol);
    const requestedTimeframe = (0, candles_1.normalizeTimeframe)(timeframe);
    const requestOptions = options instanceof AbortSignal
        ? { signal: options }
        : options;
    const requestTimeframes = (0, candleHistoryQuery_1.getCandleHistoryRequestTimeframes)(requestedTimeframe);
    let extractedPayload = (0, candleHistoryQuery_1.extractCandleHistoryPayload)([]);
    let resolvedTimeframe = requestedTimeframe;
    let normalizedCandles = [];
    let lastHttpError = null;
    for (let index = 0; index < requestTimeframes.length; index += 1) {
        const requestTimeframe = requestTimeframes[index];
        const params = (0, candleHistoryQuery_1.buildCandleHistorySearchParams)(requestTimeframe, count, requestOptions);
        const response = await (0, apiClient_1.apiClient)(`/candles/${requestedSymbol}?${params.toString()}`, { signal: requestOptions?.signal });
        if (!response.ok) {
            let errorMsg = 'Failed to fetch candle history';
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorData.error || errorMsg;
            }
            catch (_e) {
                // Ignored
            }
            lastHttpError = new Error(`API Error ${response.status}: ${errorMsg}`);
            continue;
        }
        const payload = await response.json();
        extractedPayload = (0, candleHistoryQuery_1.extractCandleHistoryPayload)(payload);
        resolvedTimeframe = (0, candles_1.normalizeTimeframe)(extractedPayload.timeframe ?? requestedTimeframe);
        normalizedCandles = (0, candles_1.normalizeCandleSeries)(extractedPayload.candles, resolvedTimeframe).slice(-count);
        if (normalizedCandles.length > 0 || index === requestTimeframes.length - 1) {
            if (requestTimeframe !== requestedTimeframe && normalizedCandles.length > 0) {
                console.log(`[api/candles] ${requestedSymbol} ${requestedTimeframe}: history loaded via fallback timeframe token ${requestTimeframe}`);
            }
            break;
        }
    }
    if (normalizedCandles.length === 0 && lastHttpError) {
        throw lastHttpError;
    }
    const rawCount = Array.isArray(extractedPayload.candles) ? extractedPayload.candles.length : 0;
    if (rawCount > 0 && normalizedCandles.length === 0) {
        // The API sent bars but every single one was dropped by validation.
        // Almost always means a schema mismatch (unexpected field names, a
        // timestamp unit we don't recognise, or OHLC fields that aren't finite).
        console.warn(`[api/candles] Received ${rawCount} raw bars for ${requestedSymbol} ${requestedTimeframe} but 0 passed validation. Sample bar:`, extractedPayload.candles[0]);
    }
    // ── Gap diagnostic ───────────────────────────────────────────────────
    // Walks the sorted normalised bar series looking for time deltas larger
    // than one bucket. A single log line reveals whether the backend itself
    // returned a time-gappy response (→ backend issue) or if the bars are
    // contiguous (→ any visible chart gap is a frontend issue elsewhere).
    if (normalizedCandles.length >= 2) {
        const gaps = [];
        let expectedBuckets = 1;
        for (let i = 1; i < normalizedCandles.length; i++) {
            const missedBuckets = Math.max(0, (0, candles_1.getBucketGapCount)(normalizedCandles[i - 1].time, normalizedCandles[i].time, resolvedTimeframe) - 1);
            expectedBuckets += missedBuckets + 1;
            if (missedBuckets > 0) {
                gaps.push({ at: normalizedCandles[i - 1].time, missedBuckets });
            }
        }
        const first = normalizedCandles[0].time;
        const last = normalizedCandles[normalizedCandles.length - 1].time;
        console.log(`[api/candles] ${requestedSymbol} ${resolvedTimeframe}: ` +
            `${normalizedCandles.length}/${expectedBuckets} bars ` +
            `(first=${new Date(first * 1000).toISOString()}, last=${new Date(last * 1000).toISOString()}), ` +
            `internal gaps=${gaps.length}` +
            (gaps.length > 0 ? ` e.g. ${gaps.length} gap(s), biggest=${Math.max(...gaps.map(g => g.missedBuckets))} bars` : ''));
    }
    return {
        symbol: (0, candles_1.normalizeSymbol)(extractedPayload.symbol ?? requestedSymbol),
        timeframe: resolvedTimeframe,
        count: normalizedCandles.length,
        candles: normalizedCandles,
    };
}
