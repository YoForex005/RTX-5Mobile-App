import type { TradeJournalEntry } from './types';

export function getJournalEntryTime(entry: TradeJournalEntry): number {
  const dateMs = Date.parse(entry.date);
  if (Number.isFinite(dateMs)) {
    return dateMs;
  }

  const createdMs = Date.parse(entry.createdAt);
  return Number.isFinite(createdMs) ? createdMs : 0;
}

export function getJournalDayStartMs(nowMs = Date.now()): number {
  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart.getTime();
}

export function getJournalNextDayStartMs(nowMs = Date.now()): number {
  const nextDayStart = new Date(nowMs);
  nextDayStart.setHours(24, 0, 0, 0);
  return nextDayStart.getTime();
}

export function isJournalEntryWithinRetention(
  entry: TradeJournalEntry,
  nowMs = Date.now(),
): boolean {
  const entryTime = getJournalEntryTime(entry);
  return entryTime >= getJournalDayStartMs(nowMs) && entryTime < getJournalNextDayStartMs(nowMs);
}

export function filterJournalEntriesByRetention(
  entries: TradeJournalEntry[],
  nowMs = Date.now(),
): TradeJournalEntry[] {
  return entries.filter((entry) => isJournalEntryWithinRetention(entry, nowMs));
}
