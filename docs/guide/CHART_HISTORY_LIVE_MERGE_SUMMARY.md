# Chart History + Live Merge Summary

Date: 2026-04-02

This summary preserves the meaning of the deeper analysis while reducing it to the main decisions another model should follow without guessing.

## 1. Actual Problem

The bug is not primarily in chart drawing. The real problem is the handoff between:

- REST history candles
- websocket live candles

The chart breaks when the last history candle and the first live candle are not on one continuous bucket sequence, but the app still renders them as one series.

That creates:

- detached last candle
- fake vertical jump / probe
- giant-wick-looking artifact
- or missing live candle if the merge is blocked too hard

## 2. Confirmed Architecture From Code

### Candle authority

`rtx5-app/src/api/ws/candlesSocket.ts` is the intended single source of truth.

It is responsible for:

- history loading
- websocket subscription
- queued tick replay
- candle cache
- merge decisions
- canonical chart events

### Validation layer

`rtx5-app/src/domain/candles.ts` already handles:

- timestamp normalization
- bucket alignment
- OHLC structural validation
- same-bucket merge
- sorting and dedupe
- next-bucket and gap helpers

### Renderers

Both native and web charts already consume canonical service output:

- `full_sync`
- `replace_last`
- `append`
- `resync_required`

So the main architectural fix belongs in the candle service handoff, not in ad hoc renderer mutation.

## 3. Confirmed Problem From Code

The current code correctly blocks unsafe history-to-live merges when history is stale.

Key confirmed rules in `candlesSocket.ts`:

- `MAX_INITIAL_HANDOFF_GAP_FILL_CANDLES = 5`
- `MAX_ACCEPTABLE_HISTORY_STALENESS_CANDLES = 5`
- stale history blocks the first live handoff
- only very small gaps are allowed to be rebuilt
- larger gaps trigger resync instead of direct merge

This is the correct direction because rebuilding large history-to-live gaps produces fake continuity.

## 4. What Is Not The Main Root Cause

These are not the main root cause in the current code:

- not mainly a unix timestamp formatting bug
- not mainly a raw renderer-side mutation bug anymore
- not mainly client-side GET caching

Why:

- timestamps are already normalized and bucket-aligned
- current chart screens use canonical candle service events
- `apiClient.ts` adds cache-busting to GET requests

## 5. Why The Broken Chart Appears

The broken chart appears when the app combines:

- stale history candles
- with a much newer live websocket candle

and renders them as if they were one continuous series.

There are only three possible outcomes:

### Loose merge

- live appears
- chart becomes visually corrupted

### Strict reject

- history appears
- live candle does not generate

### Correct deterministic handoff

- small safe gaps are bridged
- large unsafe gaps are blocked
- chart never fakes continuity

Only the third behavior is correct for production.

## 6. Permanent Root Cause Statement

The actual root issue is:

- the history API and websocket live feed are not always aligned to the same live candle edge,
- and when the system allows them to be rendered together without proven continuity, the chart produces a fake merge.

## 7. Permanent Fix Direction

### Frontend must do this

Frontend must:

- keep `candlesSocket.ts` as the only candle truth
- keep `domain/candles.ts` as the only normalization and validation layer
- allow only:
  - same bucket -> `replace_last`
  - exact next bucket -> `append`
  - very small bounded gap -> controlled fill
- block large initial history-to-live gaps
- resync instead of stitching stale history to current live candles
- keep native and web on the same canonical event semantics

### Backend must do this

Backend must:

- return history candles up to the current live edge
- use the same symbol namespace as websocket
- use the same timeframe bucketing as websocket
- ensure history and websocket belong to the same timeline

Without this, frontend cannot create a smooth merged chart without inventing fake candles.

## 8. Exact Merge Decision Table

### Same bucket

- condition: `incoming.time === lastCandle.time`
- action: merge and emit `replace_last`

### Exact next bucket

- condition: `incoming.time === expectedNextTime`
- action: append and emit `append`

### Small bounded gap

- condition: small gap within live horizon
- action: optional flat filler candles, then append

### Large initial history-to-live gap

- condition: first live candle arrives but history tail is stale beyond threshold
- action: do not merge, mark handoff blocked, request resync

### Older missing bucket

- condition: incoming older candle is not present in cache
- action: reject and resync

### Older existing bucket

- condition: incoming older candle matches an existing bucket in cache
- action: merge historical correction and emit `full_sync`

## 9. Main Warning

If backend history is stale, there is no frontend-only way to produce all of these at once:

- history visible
- live candle visible
- no break
- no fake wick
- no detached candle

Frontend can only safely choose one of these:

- show history and block live merge
- show live without stale history
- wait for fresh history before connecting live

It must never invent a false smooth merge across a large unknown gap.

## 10. What Another Model Should Do

Another model working on this should:

1. Treat `candlesSocket.ts` as the only candle authority.
2. Avoid renderer-side candle truth.
3. Focus on the history-to-live handoff, not the screenshot surface symptom.
4. Keep strict OHLC, symbol, timeframe, and bucket validation.
5. Keep small-gap tolerance only for truly small gaps.
6. Refuse large stale-history merges.
7. Prefer deterministic resync over visual corruption.
8. Assume backend freshness must also be verified, not guessed.

