type ResolvedHistoryDateRange = {
  fromMs: number | null;
  toMs: number | null;
};

type ClosedHistoryTimeRecord = {
  time_close?: number;
  time_update?: number;
  time_create?: number;
};

function startOfDay(date: Date) {
  const next = new Date(date.getTime());
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date.getTime());
  next.setHours(23, 59, 59, 999);
  return next;
}

function resolvePresetHistoryDateRange(historyRange: string, now = new Date()): ResolvedHistoryDateRange | null {
  const end = endOfDay(now);
  const start = startOfDay(now);

  switch (historyRange) {
    case 'All time':
      return { fromMs: null, toMs: null };
    case 'Today':
      break;
    case 'Last week':
      start.setDate(start.getDate() - 7);
      break;
    case 'Last month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'Last 3 months':
      start.setMonth(start.getMonth() - 3);
      break;
    case 'Last 6 months':
      start.setMonth(start.getMonth() - 6);
      break;
    case 'Last year':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      return null;
  }

  return { fromMs: start.getTime(), toMs: end.getTime() };
}

export function resolveEffectiveHistoryDateRange(
  historyRange: string,
  historyFromMs: number | null,
  historyToMs: number | null,
  now = new Date(),
): ResolvedHistoryDateRange {
  if (historyFromMs != null || historyToMs != null) {
    return {
      fromMs: historyFromMs,
      toMs: historyToMs,
    };
  }

  return resolvePresetHistoryDateRange(historyRange, now) ?? { fromMs: null, toMs: null };
}

function resolveClosedRecordTimeMs(record: ClosedHistoryTimeRecord): number | null {
  const rawTimestamp = record.time_close ?? record.time_update ?? record.time_create;

  if (typeof rawTimestamp !== 'number' || !Number.isFinite(rawTimestamp)) {
    return null;
  }

  return rawTimestamp * 1000;
}

export function filterClosedRecordsByDateRange<T extends ClosedHistoryTimeRecord>(
  records: T[],
  fromMs: number | null,
  toMs: number | null,
): T[] {
  if (fromMs == null && toMs == null) {
    return records;
  }

  return records.filter((record) => {
    const recordTimeMs = resolveClosedRecordTimeMs(record);

    if (recordTimeMs == null) {
      return false;
    }
    if (fromMs != null && recordTimeMs < fromMs) {
      return false;
    }
    if (toMs != null && recordTimeMs > toMs) {
      return false;
    }

    return true;
  });
}
