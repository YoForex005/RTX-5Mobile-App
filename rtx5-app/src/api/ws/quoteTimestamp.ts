const coerceQuoteTimestampCandidate = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const resolveQuoteTickTimestamp = (
  payload: { time?: unknown; timestamp?: unknown; t?: unknown },
  fallbackMs: number = Date.now(),
): number => {
  const candidates = [payload.time, payload.timestamp, payload.t];

  for (const candidate of candidates) {
    const normalized = coerceQuoteTimestampCandidate(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }

  return fallbackMs;
};
