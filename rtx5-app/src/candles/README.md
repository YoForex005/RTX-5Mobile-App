# Candle Engine Structure

The candle engine is grouped by responsibility while preserving legacy import
wrappers at `src/candles/*.ts` for compatibility.

- `core/`: shared candle types, timeframe helpers, and structural validation.
- `normalization/`: backend and chart-safe candle normalization.
- `series/`: deterministic history/live candle series merging.
- `stream/`: canonical REST history plus backend live-candle stream runtime.

Prefer importing new code from these responsibility folders. Existing top-level
files re-export the same APIs so older call sites can migrate gradually.
