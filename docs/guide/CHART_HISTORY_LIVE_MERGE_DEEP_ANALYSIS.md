# Chart History + Live Merge Deep Analysis

Date: 2026-04-02

This document is a code-based root-cause analysis of the chart bug where:

- history candles load,
- websocket live candles exist,
- but after merging them the chart can either:
  - fail to generate the live candle, or
  - generate a detached/fake-looking last candle, vertical jump, or probe/wick artifact.

This analysis is based on a line-by-line review of:

- `rtx5-app/src/api/ws/candlesSocket.ts`
- `rtx5-app/src/domain/candles.ts`
- `rtx5-app/src/api/candles.ts`
- `rtx5-app/src/api/apiClient.ts`
- `rtx5-app/src/hooks/useLiveCandles.ts`
- `rtx5-app/src/features/chart/ChartScreen.native.tsx`
- `rtx5-app/src/features/chart/ChartScreen.web.tsx`

The goal of this document is to state:

1. what the actual problem is,
2. what is confirmed from code,
3. what is inferred but not proven,
4. why the broken chart appears,
5. how to solve it permanently without guessing.

## 1. Executive Summary

The actual problem is not primarily chart drawing. The actual problem is the handoff between:

- REST history candles, and
- websocket live candles.

The system already has the correct high-level architecture:

- `candlesSocket.ts` is the canonical candle engine,
- `domain/candles.ts` normalizes and validates candles,
- native and web charts consume canonical events from the service.

However, a broken chart appears whenever the history tail and live websocket edge do not belong to the same continuous bucket sequence and the frontend still attempts to render them as one series.

That produces:

- a detached last candle,
- a fake probe / vertical jump,
- or an apparent giant wick even when the candle itself is not malformed.

The permanent fix is not “relax validation” and not “patch the renderer”. The permanent fix is:

- make the history-to-live handoff deterministic,
- require strict continuity between last history bucket and first live bucket,
- and refuse unsafe stitching when the history feed is stale or from a different timeline edge.

## 2. What The Current Code Actually Does

### 2.1 `candlesSocket.ts` is the candle authority

Confirmed from `candlesSocket.ts`:

- history is fetched in `fetchHistoryAndSubscribe(...)` at line 398,
- websocket subscription is sent in `sendSubscription(...)` at line 509,
- incoming websocket payloads are parsed in `handlePayload(...)` at line 544,
- parsed candles are merged in `processParsedCandles(...)` at line 596,
- the service emits canonical events:
  - `full_sync`
  - `replace_last`
  - `append`
  - `resync_required`

This means the candle service, not the UI, is the intended source of truth.

### 2.2 The domain layer already normalizes and validates candles

Confirmed from `domain/candles.ts`:

- timestamp normalization and bucket alignment:
  - `normalizeTimeValue(...)` line 56
  - `alignTimeToBucket(...)` line 51
  - `isBucketAlignedCandle(...)` line 101
- structural OHLC validation:
  - `isStructurallyValidCandle(...)` line 84
- explicit candle normalization:
  - `normalizeCandle(...)` line 105
- merge logic:
  - `mergeCandleUpdate(...)` line 145
- dedupe/sort:
  - `sortAndDedupeCandles(...)` line 158
- sequence helpers:
  - `getExpectedNextCandleTime(...)` line 188
  - `getCurrentBucketTime(...)` line 192
  - `isWithinLiveBucketHorizon(...)` line 196
  - `buildFlatGapCandles(...)` line 205
  - `getBucketGapCount(...)` line 228

So the system already has deterministic candle integrity helpers.

### 2.3 History fetch is normalized before entering the cache

Confirmed from `api/candles.ts`:

- history is requested by symbol + timeframe + limit in `getCandleHistory(...)` at line 29,
- it normalizes the returned series using `normalizeCandleSeries(...)` at line 55.

Confirmed from `api/apiClient.ts`:

- GET requests get a cache-busting `_t` query param at line 74,
- so stale history is not primarily caused by client-side GET caching in this code.

### 2.4 Native and web charts use the same canonical candle service

Confirmed from `useLiveCandles.ts`:

- `useLiveCandles(...)` subscribes through `candlesWsService.subscribe(symbol, timeframe)` at line 59,
- it receives full array updates through `addArrayListener(...)` at line 57.

Confirmed from `ChartScreen.native.tsx`:

- it uses full reloads through `updateChartData(...)` in the WebView bridge around line 334,
- it uses incremental updates through `updateTick(...)` around line 351,
- it listens to canonical stream events through `addStreamListener(...)` around line 656,
- and handles:
  - `full_sync`
  - `append`
  - `replace_last`
  - `resync_required`

Confirmed from `ChartScreen.web.tsx`:

- it uses `seriesRef.current.setData(...)` at lines 656 and 838,
- it uses incremental `seriesRef.current.update(...)` at line 892,
- it listens to canonical stream events through `addStreamListener(...)` at line 925,
- and handles:
  - `full_sync`
  - `append`
  - `replace_last`
  - `resync_required`

Important conclusion:

- native and web already share the same candle truth,
- but they still each have two renderer update modes:
  - full-array sync,
  - incremental stream sync.

That is acceptable only if both modes are fed from the same canonical merge semantics.

## 3. The Actual Problem

The actual problem is a continuity mismatch between:

- the last history candle in REST,
- and the first live candle from websocket.

The bug appears when these two are not adjacent in candle-bucket time, but the app still ends up rendering them as if they belong to one continuous series.

In practical terms:

- history gives one timeline edge,
- websocket gives a newer timeline edge,
- and if the frontend merges them too aggressively, the chart draws a false connection.

That false connection visually becomes:

- a detached candle,
- a long vertical move,
- a fake wick/probe,
- or a broken live handoff.

This is why the issue has appeared in opposite forms:

- when validation was too loose, the chart showed corrupted last candles,
- when validation was too strict, the live candle stopped appearing.

Both symptoms come from the same root: the history-to-live handoff.

## 4. Confirmed Problems From Code

### 4.1 The service is protecting against stale history, but only within a narrow handoff policy

Confirmed in `candlesSocket.ts`:

- `MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES = 5` at line 43
- `MAX_ACCEPTABLE_HISTORY_STALENESS_CANDLES = 5` at line 44

This means:

- if history is more than 5 buckets behind the current bucket, history is marked stale,
- and the service blocks live handoff until a better sync occurs.

This is the correct direction because larger rebuilds create fake continuity.

### 4.2 The first live candle after stale history is explicitly blocked

Confirmed in `processParsedCandles(...)`:

- if `hasStaleHistoryForSubscription && !hasLiveEdgeForSubscription`, the service logs `live_handoff_blocked_by_stale_history` and requests resync at lines 616-622.

This is intentional protection against the detached-candle chart.

### 4.3 Small gaps are still allowed to be bridged with synthetic flat candles

Confirmed in `processParsedCandles(...)`:

- for gaps inside the live horizon:
  - `buildFlatGapCandles(...)` is used,
  - initial handoff rebuild is allowed if gap count is `<= MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES` at lines 689-708,
  - steady-state gap fill is allowed if gap count is `<= MAX_AUTO_GAP_FILL_CANDLES` at lines 725-750.

This means the current architecture still permits synthetic fillers, but only for small gaps.

### 4.4 History freshness is judged relative to current bucket, not to the first live candle payload

Confirmed in `fetchHistoryAndSubscribe(...)`:

- `historyGapCount` is computed between:
  - `latestHistoryCandle.time`
  - and `getCurrentBucketTime(normalizedTimeframe)`
  - at lines 433-438.

That means stale-history detection is based on “how old history is versus now”, not “how far history is from the first actual live candle payload”.

This is usually acceptable, but it is a real architectural boundary:

- if websocket feed and REST feed are not aligned,
- then “history close to current bucket” does not automatically prove “history safely adjacent to first live candle”.

### 4.5 Renderers still have both a full-array sync path and an incremental sync path

Confirmed:

- native:
  - full-array sync effect around lines 519-553
  - stream effect around lines 556-665
- web:
  - full-array sync effect around lines 628-671
  - stream effect around lines 808-934

This dual path is not necessarily wrong, but it creates a hard requirement:

- full-array data and incremental events must have identical candle semantics.

If not, the chart can flip between:

- one version of truth from `candles`,
- and another version of truth from `CandleStreamEvent`.

## 5. What Is Not The Actual Root Cause

These are not the primary root cause based on the current code:

### 5.1 It is not mainly a unix timestamp formatting bug

Reason:

- timestamps are already normalized from:
  - `time`
  - `timestamp`
  - `ts`
  - `t`
- and are bucket-aligned in `normalizeTimeValue(...)`.

So the main issue is not “timestamp is not unix”. It is “two valid timestamps are not on one continuous series edge”.

### 5.2 It is not mainly a renderer-side raw mutation bug anymore

Reason:

- current chart screens use canonical `candlesWsService.addStreamListener(...)`,
- not a separate raw websocket tick mutation path.

That old architecture risk was real historically, but it is not the primary current root cause in this code snapshot.

### 5.3 It is not mainly client-side REST caching

Reason:

- `apiClient.ts` appends `_t=${Date.now()}` to GET requests.

So if history is stale, the stronger suspect is backend history freshness or feed alignment, not frontend GET caching.

## 6. Why The Broken Chart Appears

The broken chart appears when the app ends up combining:

- stale history candles,
- with a much newer live candle,
- and the two are rendered in one series as though there were no major discontinuity.

The exact visual effect depends on which part of the pipeline accepted too much:

### Case A: History is stale and live is force-appended

Result:

- history remains on the screen,
- first live candle appears far to the right / at a detached price level,
- vertical jump / probe / pseudo-wick appears.

### Case B: History is stale and live is over-blocked

Result:

- history is visible,
- but no live candle is generated,
- chart appears frozen on old candles.

### Case C: History and live are near-adjacent and merged correctly

Result:

- current candle updates,
- next candle appends,
- no break, no fake wick, no detached handoff.

So the bug is not “live candle generation only” and not “history only”. It is the transition between them.

## 7. The Most Important Confirmed Architectural Insight

The current code is already built around the right idea:

- one authoritative candle cache in `candlesSocket.ts`,
- one normalization/validation layer in `domain/candles.ts`,
- canonical chart events,
- renderer as consumer only.

The permanent solution should therefore not redesign the renderer first.

The permanent solution should harden one place only:

- the service-level transition from history seed to live edge.

## 8. Inferred Risks That Are Plausible But Not Fully Proven From Code Alone

These are real risks, but they are not fully proven from static code alone:

### 8.1 REST and websocket may be sourced from different upstream timelines

This is the most important runtime inference.

The current frontend code assumes:

- history candles and websocket candles belong to the same market timeline.

If backend returns:

- stale history,
- or history from one source,
- and live websocket from another source,

then no frontend renderer can safely invent the missing continuity.

This is not directly provable from code alone, but it is fully consistent with the observed detached-candle screenshots.

### 8.2 Payload-level symbol/timeframe routing may be too trusting if top-level fields are missing

In `handlePayload(...)`, the service does:

- `payloadSymbol = payload.symbol ?? activeSymbol`
- `payloadTimeframe = payload.tf ?? activeTimeframe`

If the websocket server ever multiplexes multiple instruments without reliable top-level `symbol`/`tf`, the service could misattribute a payload to the active subscription.

This is not proven from code because the actual live payload contract is not fully embedded in the repository.

### 8.3 Dual renderer sync paths can amplify service inconsistency

Even though the service is canonical, both charts still consume:

- array snapshots from `useLiveCandles(...)`
- and stream events from `addStreamListener(...)`

If those ever drift semantically, the renderer can oscillate between:

- `setData/updateChartData`
- and `update/updateTick`

This is not the root cause by itself, but it is a real failure amplifier.

## 9. Permanent Solution: Exact Architecture

The correct permanent architecture is:

1. websocket payload arrives
2. parse candidate candles
3. normalize symbol/timeframe
4. normalize timestamp to bucket
5. reject malformed explicit OHLC
6. validate bucket alignment
7. validate order/sequence against cache
8. merge into authoritative `candleCache`
9. emit canonical events
10. native/web render those canonical events only

That architecture already mostly exists.

The permanent fix is to make step 7 fully deterministic for the history-to-live handoff.

## 10. Permanent Solution: Exact Decision Table

This is the correct merge policy.

### 10.1 Same bucket

Condition:

- `incoming.time === lastCandle.time`

Action:

- merge with `mergeCandleUpdate(...)`
- emit `replace_last`

Why:

- current candle update
- no gap
- no new bucket

### 10.2 Exact next bucket

Condition:

- `incoming.time === expectedNextTime`

Action:

- append
- emit `append`

Why:

- clean new candle

### 10.3 Small bounded gap

Condition:

- `incoming.time > expectedNextTime`
- gap count is small
- still within live horizon

Action:

- optionally build flat filler candles
- append real live candle
- only if the gap threshold is very small

Why:

- this tolerates tiny replay drift or delayed history tail without inventing a long fake move

### 10.4 Large initial history-to-live gap

Condition:

- first live candle after history
- history tail is stale beyond threshold

Action:

- do not merge live into stale history
- mark handoff blocked
- request fresh history / resync

Why:

- this is the exact protection against the screenshot problem

### 10.5 Out-of-order missing bucket

Condition:

- incoming candle time is older than last candle
- but there is no bucket with that timestamp in cache

Action:

- reject
- emit `resync_required`

Why:

- inserting unknown older buckets corrupts sequence integrity

### 10.6 Historical patch for existing bucket

Condition:

- incoming older bucket exists in cache

Action:

- merge that bucket
- emit `full_sync`

Why:

- old candle correction is valid only if it refers to a known bucket

## 11. What The Backend Must Guarantee

For a perfect smooth history+live chart, the backend must guarantee all of these:

1. history endpoint and websocket feed use the same symbol namespace
2. history endpoint and websocket feed use the same timeframe bucketing
3. history endpoint returns candles up to the current live edge
4. history timestamps are contiguous and ordered
5. websocket live candle belongs to the same bucket model as history

If backend violates this, frontend has only two safe choices:

- show history and block live merge,
- or show live-only after discarding stale history.

What frontend must never do is:

- invent a smooth merge over a large unknown gap.

That produces fake chart continuity.

## 12. Why This Bug Keeps Returning In Different Forms

Because there are only three possible behaviors when history and live are misaligned:

### Behavior 1: loose merge

Effect:

- live appears
- chart corrupts visually

### Behavior 2: strict reject

Effect:

- history appears
- live does not generate

### Behavior 3: deterministic stale-history handoff policy

Effect:

- small safe gaps are bridged,
- large unsafe gaps are blocked,
- chart never fakes continuity.

Only behavior 3 is production-safe.

## 13. What Must Be Solved Permanently

### 13.1 In the backend

Permanent backend requirement:

- ensure the REST history tail is always fresh enough to be adjacent to websocket live.

This is the only way to guarantee:

- history visible,
- live visible,
- no break,
- no fake wick,
- no detached candle,

all at the same time.

### 13.2 In the frontend

Permanent frontend requirement:

- never merge stale history and current live candle into one series unless continuity is proven by bucket sequence.

Concretely:

- keep strict `MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES`
- keep strict `MAX_ACCEPTABLE_HISTORY_STALENESS_CANDLES`
- never rebuild long initial gaps
- never append first live candle onto stale history
- always resync when continuity is uncertain

## 14. The Exact Permanent Approach

This is the proper no-guessing approach.

### Step 1

Treat `candlesSocket.ts` as the only candle truth.

Do not let native or web create candle truth from raw websocket payloads.

### Step 2

Keep `domain/candles.ts` as the only normalization and validation layer:

- time normalization,
- bucket alignment,
- OHLC validity,
- same-bucket merge,
- dedupe,
- sort.

### Step 3

Enforce this hard rule:

- history and live can be stitched only if the last history bucket and the first live bucket are either:
  - same bucket,
  - next bucket,
  - or a very small bounded gap.

Everything else must resync.

### Step 4

Use the same canonical semantics for both renderer paths:

- full sync,
- replace last,
- append,
- resync.

### Step 5

If backend history remains stale:

- do not try to draw a fake merge.

This is the key production rule.

## 15. Exact Permanent Checklist

Use this checklist to verify the fix permanently.

### Service-level checks

- wrong symbol payload is ignored
- wrong timeframe payload is ignored
- malformed OHLC is rejected
- same bucket emits `replace_last`
- next bucket emits `append`
- missing older bucket emits `resync_required`
- large initial history/live gap never appends directly
- large initial history/live gap never rebuilds hundreds of fillers
- stale history blocks live handoff

### Renderer-level checks

- native and web both consume the same `CandleStreamEvent`
- `full_sync` and incremental `append/replace_last` result in identical final series
- renderer never mutates candle truth outside canonical events

### Backend-level checks

- latest REST candle time is near latest websocket candle time
- same symbol and timeframe produce the same bucket edge across REST and WS

## 16. Final Root Cause Statement

The actual problem is:

- the history API and websocket live feed are not always on the same continuous candle edge,
- and when the system allows them to be rendered as one chart anyway, the last candle becomes visually detached or corrupted.

The actual permanent solution is:

- backend must provide fresh history contiguous with the live websocket edge,
- frontend must refuse any unsafe history-to-live merge that cannot be proven by bucket continuity.

That is the only permanent way to get:

- history candles visible,
- live candle generated,
- no candle break,
- no fake wick,
- no detached probe candle,
- and identical behavior on native and web.

